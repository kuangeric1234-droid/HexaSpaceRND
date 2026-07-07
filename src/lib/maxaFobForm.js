import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// Fills MAXA's official Fob/Remote order form (828 Whitehorse Rd — Panorama
// Box Hill) — the exact PDF they issued, bundled at public/forms/
// maxa-fob-order.pdf — by overlaying the order values at the form's
// coordinates (it's a flat PDF with no AcroForm fields). Coordinates are in
// PDF points, origin bottom-left, A4 595×842.

const INK = rgb(0.1, 0.1, 0.35) // handwriting-blue so entries read as filled-in

// f: { lot, requester: 'owner'|'agent', name, phone, reason, fobs, remotes }
// totals: { fobs, remotes, total }
export async function fillMaxaFobForm(templateBytes, f, totals) {
  const doc = await PDFDocument.load(templateBytes)
  const page = doc.getPage(0)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const money = (n) => `$${Number(n).toFixed(2)}`

  const put = (text, x, y, opts = {}) =>
    page.drawText(String(text), { x, y, size: opts.size ?? 10, font: opts.bold ? bold : font, color: INK })

  // Details block
  put(f.lot, 222, 479, { bold: true })                       // gap in "U __ /828 Whitehorse Rd"
  const circle = (x, y) => page.drawEllipse({ x, y, xScale: 7, yScale: 6.5, borderColor: INK, borderWidth: 1.2 })
  if (f.requester === 'owner') circle(215, 462)              // Y in owner Y/N
  else circle(229, 462)                                      // N in owner Y/N
  if (f.requester === 'agent') circle(474, 462)              // Y in agent Y/N
  else circle(487, 462)                                      // N in agent Y/N
  put(f.name, 158, 446)
  put(f.phone, 198, 426)
  put(f.reason, 155, 406, { size: 9 })

  // Items table — quantity + line totals + grand total (form pre-prints the
  // "$" on the TOTAL COST row, so that one is written bare).
  if (f.fobs > 0) { put(f.fobs, 448, 217, { bold: true }); put(money(totals.fobs), 505, 217) }
  if (f.remotes > 0) { put(f.remotes, 448, 169, { bold: true }); put(money(totals.remotes), 505, 169) }
  put(Number(totals.total).toFixed(2), 512, 85, { bold: true, size: 11 })

  return doc.save() // Uint8Array
}

export function toBase64(bytes) {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(bin)
}
