// Vercel serverless function — POST /api/sanity-sync
// Pushes a Hexa Space space → the website's Sanity `unit` document.
// Requires env var: SANITY_WRITE_TOKEN (Editor permission, project w4zxsbqi).
//
// Body: { action: 'sync' | 'delete', space }
//   sync   — createIfNotExists the unit (deterministic _id = `unit.<spaceId>`),
//            then patch ONLY operational fields. Editorial fields curated in
//            Sanity (photos, description, features, featured, slug) are never
//            touched, so a price/status change can't wipe them.
//   delete — remove the unit document entirely.

const PROJECT_ID = 'w4zxsbqi'
const DATASET = 'production'
const API_VER = 'v2021-06-07'
const MUTATE_URL = `https://${PROJECT_ID}.api.sanity.io/${API_VER}/data/mutate/${DATASET}?returnIds=true`

// space.status → Sanity unit.status
const STATUS_MAP = { vacant: 'available', occupied: 'leased', reserved: 'under-offer' }
// space.type → Sanity unit.type (unmapped types fall back to 'warehouse')
const TYPE_MAP = { warehouse: 'warehouse', storage: 'storage', office: 'office' }

function slugify(str) {
  return String(str).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

function parseSize(size) {
  const n = parseFloat(String(size ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

function docId(space) {
  return `unit.${space.id}`
}

// Plain text → Sanity Portable Text blocks (one block per non-empty line).
function toPortableText(text) {
  if (!text || !String(text).trim()) return undefined
  return String(text).split(/\n+/).filter((l) => l.trim()).map((line, i) => ({
    _type: 'block',
    _key: `blk${i}`,
    style: 'normal',
    markDefs: [],
    children: [{ _type: 'span', _key: `sp${i}`, text: line.trim(), marks: [] }],
  }))
}

// space.photos [{ assetId, alt }] → Sanity image array
function toPhotos(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return undefined
  return photos
    .filter((p) => p.assetId)
    .map((p, i) => ({
      _type: 'image',
      _key: `img${i}`,
      asset: { _type: 'reference', _ref: p.assetId },
      alt: p.alt || '',
    }))
}

// Operational fields Hexa Space owns — these are patched on every sync.
function operationalFields(space) {
  const fields = {
    unitId: space.unitNumber,
    type: TYPE_MAP[space.type] ?? 'warehouse',
    status: STATUS_MAP[space.status] ?? 'available',
    monthlyPrice: typeof space.monthlyRate === 'number' ? space.monthlyRate : undefined,
    // The website computes the displayed monthly rent from annualPrice, so set both.
    annualPrice: typeof space.monthlyRate === 'number' ? space.monthlyRate * 12 : undefined,
    sizeSquareMetres: parseSize(space.size),
    parkingSpaces: typeof space.cars === 'number' ? space.cars : undefined,
    streetAddress: space.address ? `${space.address}, Box Hill VIC 3128` : undefined,
    attributes: space.attributes || undefined,
    // Enriched listing fields (filled via the Listing editor in the Marketing tab)
    block: space.block || undefined,
    groundFloorM2: numOrUndef(space.groundFloorM2),
    firstFloorM2: numOrUndef(space.firstFloorM2),
    secondFloorM2: numOrUndef(space.secondFloorM2),
    powerSupply: space.powerSupply || undefined,
    accessHours: space.accessHours || undefined,
    minimumTerm: space.minimumTerm || undefined,
    bondAmount: numOrUndef(space.bondAmount),
    features: Array.isArray(space.features) && space.features.length ? space.features : undefined,
    description: toPortableText(space.description),
    photos: toPhotos(space.photos),
  }
  // Strip undefined so we never blank out a field by patching it to null.
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))
}

function numOrUndef(v) {
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : undefined
}

async function mutate(mutations) {
  const token = process.env.SANITY_WRITE_TOKEN
  if (!token) {
    return { ok: false, status: 500, error: 'SANITY_WRITE_TOKEN not configured' }
  }
  const res = await fetch(MUTATE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mutations }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, status: res.status, error: data?.error?.description ?? data?.message ?? 'Sanity mutate failed' }
  return { ok: true, data }
}

// Find an existing Sanity unit by its unitId (e.g. "O5", "61S"), regardless of
// its _id — so we patch the doc the website already shows (with its curated
// photos) instead of creating a duplicate.
async function findExistingUnitId(unitNumber) {
  const token = process.env.SANITY_WRITE_TOKEN
  if (!token) return null
  const safe = String(unitNumber ?? '').replace(/[^a-zA-Z0-9/ .-]/g, '')
  if (!safe) return null
  const groq = `*[_type=="unit" && unitId=="${safe}"][0]._id`
  const url = `https://${PROJECT_ID}.api.sanity.io/${API_VER}/data/query/${DATASET}?query=${encodeURIComponent(groq)}`
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    return res.ok ? (data.result || null) : null
  } catch { return null }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Admin-only: patches/deletes public website documents.
  const { requireAdmin } = await import('./_auth.js')
  const _a = await requireAdmin(req)
  if (_a.error) return res.status(_a.status).json({ error: _a.error })

  const { action = 'sync', space } = req.body ?? {}
  if (!space?.id) return res.status(400).json({ error: 'Missing space.id' })

  try {
    const existingId = await findExistingUnitId(space.unitNumber)
    const _id = existingId || docId(space)

    if (action === 'delete') {
      const result = await mutate([{ delete: { id: _id } }])
      if (!result.ok) return res.status(result.status).json({ error: result.error })
      return res.status(200).json({ success: true, action: 'delete', id: _id })
    }

    // action === 'sync'
    const op = operationalFields(space)

    if (existingId) {
      // Update the unit the website already has — operational fields only,
      // preserving its photos / description / slug.
      const result = await mutate([{ patch: { id: _id, set: op } }])
      if (!result.ok) return res.status(result.status).json({ error: result.error })
      return res.status(200).json({ success: true, action: 'sync', id: _id, matched: 'unitId' })
    }

    // Genuinely new unit — seed a complete, valid doc then patch.
    const title = `${(op.type ?? 'warehouse').replace('-', ' ')} ${space.unitNumber}`.replace(/\b\w/g, (c) => c.toUpperCase())
    const slug = slugify(`${space.unitNumber}-${space.address ?? op.type}`)
    const result = await mutate([
      { createIfNotExists: { _id, _type: 'unit', title, slug: { _type: 'slug', current: slug }, listingType: 'for-lease', ...op } },
      { patch: { id: _id, set: op } },
    ])
    if (!result.ok) return res.status(result.status).json({ error: result.error })
    return res.status(200).json({ success: true, action: 'sync', id: _id, matched: 'new' })
  } catch (err) {
    console.error('sanity-sync error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
