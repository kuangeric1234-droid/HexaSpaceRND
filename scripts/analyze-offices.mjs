import fs from 'fs'
function parseCSV(text) { const rows = []; let row = [], f = '', q = false; for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c } else { if (c === '"') q = true; else if (c === ',') { row.push(f); f = '' } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = '' } else if (c === '\r') {} else f += c } } if (f.length || row.length) { row.push(f); rows.push(row) } return rows }
const rows = parseCSV(fs.readFileSync(process.argv[2], 'utf8')); const H = rows.shift(); const ix = (n) => H.indexOf(n)
const data = rows.filter((r) => r[ix('Resource Name')])
console.log(`Offices: ${data.length}`)
const floors = {}; const plans = {}; const statuses = {}
for (const r of data) { floors[r[ix('Floor')]] = (floors[r[ix('Floor')]] || 0) + 1; plans[r[ix('Target Plan')]] = (plans[r[ix('Target Plan')]] || 0) + 1; statuses[r[ix('Status')]] = (statuses[r[ix('Status')]] || 0) + 1 }
console.log('\nFloors:', JSON.stringify(floors)); console.log('Statuses:', JSON.stringify(statuses))
console.log('\nPlans:'); Object.entries(plans).sort((a,b)=>b[1]-a[1]).forEach(([k,n])=>console.log(`  ${String(n).padStart(2)}  ${k}`))
console.log('\n=== ALL OFFICES (name · floor · pax · plan · listPrice · soldPrice · status · member) ===')
for (const r of data) {
  console.log(`  ${String(r[ix('Resource Name')]).padEnd(16)} ${String(r[ix('Floor')]).padEnd(9)} ${String(r[ix('Size (People)')]||'').padStart(2)}p  ${String(r[ix('Target Plan')]||'').padEnd(26)} list ${String(r[ix('List Price')]||'').padStart(6)}  sold ${String(r[ix('Sold Price')]||'').padStart(6)}  ${String(r[ix('Status')]||'').padEnd(10)} ${r[ix('Member')]||''}`)
}
