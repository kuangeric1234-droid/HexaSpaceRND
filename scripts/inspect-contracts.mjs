import fs from 'fs'

function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else {
      if (c === '"') q = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

const path = process.argv[2]
const rows = parseCSV(fs.readFileSync(path, 'utf8'))
console.log('ROWS:', rows.length)
console.log('\nHEADER:')
rows[0].forEach((h, i) => console.log(`  [${i}] ${h}`))
console.log('\nFIRST 5 DATA ROWS:')
for (let r = 1; r <= 5 && r < rows.length; r++) {
  console.log(`\n--- row ${r} ---`)
  rows[0].forEach((h, i) => { if (rows[r][i]) console.log(`  ${h}: ${rows[r][i]}`) })
}
