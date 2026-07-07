// Seed a demo member account + data into Hexa Space RND Supabase so the member
// portal is fully populated for preview. Idempotent (upserts by id).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ── Load env from .env.local ──────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync('C:/Hexa-Space-RND/.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const URL = env.SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const PW = 'HexaSpace2026!'
const LOGINS = [
  { email: 'demo@hexaspace.com.au', password: PW },
  { email: 'jamie.demo@hexaspace.com.au', password: PW },
]

async function ensureUser({ email, password }) {
  const { error } = await sb.auth.admin.createUser({ email, password, email_confirm: true })
  if (!error) return `created ${email}`
  if (error.message.toLowerCase().includes('already')) {
    // find + reset password
    const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const u = data?.users?.find((x) => x.email?.toLowerCase() === email.toLowerCase())
    if (u) { await sb.auth.admin.updateUserById(u.id, { password, email_confirm: true }); return `reset ${email}` }
  }
  return `ERR ${email}: ${error.message}`
}

const upsert = (table, rows) =>
  sb.from(table).upsert(rows.map((r) => ({ id: r.id, data: r, updated_at: new Date().toISOString() })))

// ── Demo data ─────────────────────────────────────────────────────────────
const companies = [
  { id: 'demo_co',  businessName: 'Lumen Studio Pty Ltd', contactName: 'Alex Rivera', email: 'demo@hexaspace.com.au', phone: '+61 400 100 200', abn: '51 234 567 890', industry: 'Design & Creative', billBusinessName: 'Lumen Studio Pty Ltd', createdAt: '2026-01-01' },
  { id: 'demo_co2', businessName: 'Northbridge Legal',     contactName: 'Daniel Roszak', email: 'hello@northbridgelegal.com.au', phone: '+61 400 222 333', industry: 'Legal Services', createdAt: '2025-11-02' },
  { id: 'demo_co3', businessName: 'Atlas Migration',       contactName: 'Sophie Lim',    email: 'team@atlasmigration.com.au', phone: '+61 400 444 555', industry: 'Migration & Education', createdAt: '2025-09-20' },
  { id: 'demo_co4', businessName: 'Verde Health',          contactName: 'Marco Bianchi',  email: 'care@verdehealth.com.au', phone: '+61 400 666 777', industry: 'Allied Health', createdAt: '2026-02-14' },
]

const members = [
  { id: 'demo_m1', name: 'Alex Rivera', email: 'demo@hexaspace.com.au', companyId: 'demo_co', status: 'active', portalAccess: true, credits: 43.5, phone: '+61 400 100 200', bio: 'Founder & creative director at Lumen Studio. Passionate about building brands worth belonging to.', createdAt: '2026-01-01' },
  { id: 'demo_m2', name: 'Jamie Chen', email: 'jamie.demo@hexaspace.com.au', companyId: 'demo_co', status: 'active', portalAccess: true, credits: 12, phone: '+61 400 100 201', bio: 'Studio manager at Lumen.', createdAt: '2026-01-06' },
  { id: 'demo_m3', name: 'Priya Nair', email: 'priya.demo@hexaspace.com.au', companyId: 'demo_co', status: 'invited', portalAccess: true, createdAt: '2026-06-20' },
  { id: 'demo_m4', name: 'Daniel Roszak', email: 'daniel@northbridgelegal.com.au', companyId: 'demo_co2', status: 'active', portalAccess: true, bio: 'Principal lawyer, Northbridge Legal.' },
  { id: 'demo_m5', name: 'Sophie Lim', email: 'sophie@atlasmigration.com.au', companyId: 'demo_co3', status: 'active', portalAccess: true, bio: 'Registered migration agent.' },
  { id: 'demo_m6', name: 'Marco Bianchi', email: 'marco@verdehealth.com.au', companyId: 'demo_co4', status: 'active', portalAccess: true, bio: 'Clinical psychologist offering therapy sessions in Melbourne.' },
]

const leases = [
  { id: 'demo_l1', tenantId: 'demo_co', spaceId: 'hx_l4_s5', status: 'active', monthlyRent: 2400, startDate: '2026-01-01', endDate: '2027-01-01', documentType: 'Private Office Membership', contractNumber: 'CON-DEMO-01', signatureStatus: 'e_signed', bondAmount: 4800, noticePeriodMonths: 2 },
]

const li = (description, unitPrice) => [{ id: 'li_' + Math.random().toString(36).slice(2, 7), description, revenueAccount: 'Membership Fees', unitPrice, qty: 1, discountPct: 0 }]
const invoices = [
  { id: 'demo_inv1', number: 'INV-DEMO-01', tenantId: 'demo_co', leaseId: 'demo_l1', status: 'paid', sentStatus: 'sent', issueDate: '2026-05-01', dueDate: '2026-05-14', periodStart: '2026-05-01', periodEnd: '2026-05-31', vatEnabled: true, lineItems: li('Private Office · Suite 5 · May 2026', 2400), payments: [{ id: 'pay1', date: '2026-05-08', amount: 2640, method: 'Bank Transfer' }], createdAt: '2026-05-01' },
  { id: 'demo_inv2', number: 'INV-DEMO-02', tenantId: 'demo_co', leaseId: 'demo_l1', status: 'pending', sentStatus: 'sent', issueDate: '2026-06-01', dueDate: '2026-07-14', periodStart: '2026-06-01', periodEnd: '2026-06-30', vatEnabled: true, lineItems: li('Private Office · Suite 5 · June 2026', 2400), payments: [], createdAt: '2026-06-01' },
  { id: 'demo_inv3', number: 'INV-DEMO-03', tenantId: 'demo_co', leaseId: 'demo_l1', status: 'overdue', sentStatus: 'sent', issueDate: '2026-04-01', dueDate: '2026-04-14', periodStart: '2026-04-01', periodEnd: '2026-04-30', vatEnabled: true, lineItems: li('Private Office · Suite 5 · April 2026', 2400), payments: [], createdAt: '2026-04-01' },
]

const bookings = [
  { id: 'demo_bk1', reference: 'BKG-204881', resourceId: 'hx_mr_north', tenantId: 'demo_co', companyId: 'demo_co', memberId: 'demo_m1', date: '2026-07-03', startTime: '10:00', endTime: '11:00', status: 'Confirmed', source: 'Portal', repeat: 'none', title: 'Team standup' },
  { id: 'demo_bk2', reference: 'BKG-118233', resourceId: 'hx_mr_east',  tenantId: 'demo_co', companyId: 'demo_co', memberId: 'demo_m1', date: '2026-06-10', startTime: '14:00', endTime: '15:00', status: 'Confirmed', source: 'Portal', repeat: 'none', title: 'Client tea' },
]

const fees = [
  { id: 'demo_fee1', name: 'Additional access card', price: 25, description: 'Replacement member access pass.', active: true },
  { id: 'demo_fee2', name: 'After-hours air-conditioning', price: 40, description: 'Per hour, outside standard hours.', active: true },
  { id: 'demo_fee3', name: 'Mail forwarding', price: 15, description: 'Monthly mail forwarding to your nominated address.', active: true },
]

// Meeting rooms + studios (canonical ids) — only seed if spaces table is empty.
const spacesSeed = [
  { id: 'hx_mr_sky',   unitNumber: 'Sky',   type: 'meeting', size: 'Up to 4', hourlyRate: 20, floor: 'l4', attributes: 'Sky (Tian) consulting room — calm, furnished for focused one-on-ones.' },
  { id: 'hx_mr_north', unitNumber: 'North', type: 'meeting', size: 'Up to 8', hourlyRate: 60, floor: 'l4', attributes: 'North (Bei) — floor-to-ceiling windows, full video conferencing.' },
  { id: 'hx_mr_east',  unitNumber: 'East',  type: 'meeting', size: 'Up to 6', hourlyRate: 80, floor: 'l4', attributes: 'East (Dong) — traditional Chinese tearoom with integrated tea service.' },
  { id: 'hx_mr_west',  unitNumber: 'West',  type: 'meeting', size: 'Up to 8', hourlyRate: 80, floor: 'l4', attributes: 'West (Xi) — boardroom plus tiered seating, up to 12 central.' },
  { id: 'hx_studio_1', unitNumber: 'Media Studios', type: 'studio',  size: '90 m²', rate: 120, floor: 'l5', attributes: 'Green-screen photography & video studio.' },
  { id: 'hx_podcast_1',unitNumber: 'Podcast Room', type: 'podcast', size: '4 seats', rate: 80, floor: 'l5', attributes: 'Acoustically treated 4-mic podcast booth.' },
]

// ── Run ─────────────────────────────────────────────────────────────────
const log = (...a) => console.log(...a)
for (const l of LOGINS) log(await ensureUser(l))

for (const [t, rows] of [['tenants', companies], ['members', members], ['leases', leases], ['invoices', invoices], ['bookings', bookings], ['fees', fees]]) {
  const { error } = await upsert(t, rows)
  log(error ? `ERR ${t}: ${error.message}` : `seeded ${t} (${rows.length})`)
}

const { data: existingSpaces } = await sb.from('spaces').select('id')
if (!existingSpaces?.length) {
  const { error } = await upsert('spaces', spacesSeed)
  log(error ? `ERR spaces: ${error.message}` : `seeded spaces (${spacesSeed.length})`)
} else {
  log(`spaces already present (${existingSpaces.length}) — left as-is`)
}

log('\nDONE. Logins:')
for (const l of LOGINS) log(`  ${l.email}  /  ${PW}`)
