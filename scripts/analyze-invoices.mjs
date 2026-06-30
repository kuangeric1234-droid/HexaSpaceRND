import fs from 'fs'
function parseCSV(text) { const rows = []; let row = [], f = '', q = false; for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c } else { if (c === '"') q = true; else if (c === ',') { row.push(f); f = '' } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = '' } else if (c === '\r') {} else f += c } } if (f.length || row.length) { row.push(f); rows.push(row) } return rows }
const rows = parseCSV(fs.readFileSync(process.argv[2], 'utf8')); const H = rows.shift(); const ix = (n) => H.indexOf(n)
const data = rows.filter((r) => r[ix('InvoiceNumber')])
console.log(`Columns: ${H.length} · line items: ${data.length}`)
console.log('Full header:', H.map((h, i) => `${i}:${h}`).join(' | '))

const invoices = new Set(), statuses = {}, docTypes = {}, contacts = new Set()
let withContact = 0
for (const r of data) { invoices.add(r[ix('InvoiceNumber')]); statuses[r[ix('Status')]] = (statuses[r[ix('Status')]] || 0) + 1; docTypes[r[ix('DocumentType')]] = (docTypes[r[ix('DocumentType')]] || 0) + 1; if (r[ix('ContactName')]) { withContact++; contacts.add(r[ix('ContactName')]) } }
console.log(`\nDistinct invoices: ${invoices.size} · distinct contacts: ${contacts.size} · rows with ContactName: ${withContact}/${data.length}`)
console.log('Statuses:', JSON.stringify(statuses))
console.log('DocTypes:', JSON.stringify(docTypes))

console.log('\n=== 2 sample invoices (all line items) ===')
const wanted = [data[0][ix('InvoiceNumber')], data[data.length - 1][ix('InvoiceNumber')]]
for (const inv of wanted) {
  console.log(`\n--- Invoice ${inv} ---`)
  const lines = data.filter((r) => r[ix('InvoiceNumber')] === inv)
  const r0 = lines[0]
  for (const f of ['InvoiceNumber', 'ContactName', 'EmailAddress', 'RegistrationNumber', 'Status', 'InvoiceDate', 'DueDate', 'Amount', 'PaidAmount', 'PendingAmount', 'Currency', 'PaymentMethod', 'Reference', 'DocumentType']) console.log(`  ${f}: ${r0[ix(f)]}`)
  console.log('  Lines:')
  lines.forEach((l) => console.log(`    • ${l[ix('Description')]} | qty ${l[ix('Quantity')]} | ${l[ix('LineTotal')]} | ${l[ix('AccountName')]} (${l[ix('AccountCode')]})`))
}
