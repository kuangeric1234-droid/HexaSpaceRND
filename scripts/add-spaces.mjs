// Upsert specific space rows into Supabase without touching anything else.
import fs from 'fs'
function parseEnv(p) { const o = {}; if (!fs.existsSync(p)) return o; for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const t = l.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue; const i = t.indexOf('='); o[t.slice(0, i).trim()] = t.slice(i + 1).trim() } return o }
const env = parseEnv('.env.local'); const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
const HDR = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }

const PP = { external: 500, internal: 400 } // Level 2
const mk = (n, pax, placement) => ({
  id: `hx_l2_s${n}`, unitNumber: `Suite ${n}`, type: 'office', floor: 'l2', pax, placement,
  size: `${pax} pax${placement === 'internal' ? ' internal' : ''}`, monthlyRate: pax * PP[placement],
  status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: '',
})
const spaces = [mk(28, 3, 'internal'), mk(29, 1, 'internal')]
const rows = spaces.map((s) => ({ id: s.id, data: s }))

const res = await fetch(`${URL}/rest/v1/spaces`, { method: 'POST', headers: HDR, body: JSON.stringify(rows) })
console.log(res.ok ? `Upserted ${rows.length} spaces: ${spaces.map((s) => s.unitNumber).join(', ')}` : `Failed ${res.status} ${await res.text()}`)
