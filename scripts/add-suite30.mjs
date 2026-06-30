// Add L2 Suite 30 occupied by RIO GROUP (the unplaced second Suite 29 record).
import fs from 'fs'
function parseEnv(p) { const o = {}; if (!fs.existsSync(p)) return o; for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const t = l.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue; const i = t.indexOf('='); o[t.slice(0, i).trim()] = t.slice(i + 1).trim() } return o }
const env = parseEnv('.env.local'); const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
const HDR = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const norm = (s) => (s || '').toLowerCase().replace(/\bpty\b|\bltd\b|\bp\/l\b|[.,&]/g, '').replace(/\s+/g, ' ').trim()
const tenants = await (await fetch(`${URL}/rest/v1/tenants?select=id,data&limit=5000`, { headers: HDR })).json()
const tenant = tenants.find((t) => norm(t.data.businessName) === norm('RIO GROUP')) || tenants.find((t) => norm(t.data.businessName).includes('rio group'))

const space = {
  id: 'hx_l2_suite30', unitNumber: 'Suite 30', type: 'office', floor: 'l2', placement: 'external', pax: 2,
  size: '2 pax', monthlyRate: 900, listPrice: 1200, soldPrice: 900, discount: 300, plan: '2 pax external office',
  status: 'occupied', occupantName: tenant ? '' : 'RIO GROUP', occupantTenantId: tenant?.id || '',
  location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: '',
}
const res = await fetch(`${URL}/rest/v1/spaces`, { method: 'POST', headers: { ...HDR, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ id: space.id, data: space }]) })
console.log(res.ok ? `Added Suite 30 → ${tenant ? tenant.data.businessName : 'RIO GROUP (no tenant match — name stored)'}` : `Failed ${res.status} ${await res.text()}`)
