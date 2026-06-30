import fs from 'fs'
function parseEnv(p) { const o = {}; if (!fs.existsSync(p)) return o; for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const t = l.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue; const i = t.indexOf('='); o[t.slice(0, i).trim()] = t.slice(i + 1).trim() } return o }
const env = parseEnv('.env.local'); const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
const HDR = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const res = await fetch(`${URL}/rest/v1/spaces?select=id,data&limit=5000`, { headers: HDR })
const rows = await res.json()
const offices = rows.filter((r) => r.data.type === 'office')
console.log(`Total spaces: ${rows.length} · offices: ${offices.length}`)
console.log('\nOffice rows (id · unitNumber · floor · pax):')
offices.sort((a,b)=>(a.data.floor||'').localeCompare(b.data.floor||'')||String(a.data.unitNumber).localeCompare(String(b.data.unitNumber)))
  .forEach((r) => console.log(`  ${r.id.padEnd(14)} ${String(r.data.unitNumber).padEnd(14)} ${(r.data.floor||'—').padEnd(4)} ${r.data.pax ?? ''}`))
// dupes by floor:number
const keyCount = {}
offices.forEach((r) => { const k = `${r.data.floor}:${parseInt(String(r.data.unitNumber).replace(/\D/g,''),10)}`; (keyCount[k] ||= []).push(r.id) })
const dupes = Object.entries(keyCount).filter(([, v]) => v.length > 1)
console.log('\nDUPLICATE floor:number keys:', dupes.length ? '' : 'none')
dupes.forEach(([k, v]) => console.log(`  ${k}: ${v.join(', ')}`))
// non-Suite-named offices (legacy)
const legacy = offices.filter((r) => !/^suite/i.test(String(r.data.unitNumber)))
console.log('\nNon-"Suite" offices (legacy?):', legacy.map((r) => `${r.id}/${r.data.unitNumber}`).join(', ') || 'none')
