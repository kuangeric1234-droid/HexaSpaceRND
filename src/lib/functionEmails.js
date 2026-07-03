// Default subject + HTML for the editable function-space emails. Pure strings
// (no imports) so both the browser store (SAMPLE_TEMPLATES) and the serverless
// sender can use them. Editable in Templates → Emails; the send endpoint uses
// the saved template if present, else falls back to these.
//
// Branded per the Hexa Space guidelines (olive / greige / ink + brand fonts with
// web-safe fallbacks). Kept import-free on purpose.
//
// Placeholders: {{company}} {{name}} {{organisation}} {{eventName}} {{eventType}}
// {{eventDate}} {{startTime}} {{endTime}} {{guests}} {{total}} {{dueNow}}
// {{balanceDue}} {{signLink}} {{website}}

const OLIVE = '#7F8B2F', GREIGE = '#EFEDF2', INK = '#1a1a1a', MUTE = '#6b6b6b', HAIR = '#e3e1e6'
const SERIF = "'HexaBig', Georgia, 'Times New Roman', serif"
const SANS = "'HexaGT', 'Helvetica Neue', Arial, sans-serif"
const CAPS = "'HexaRework', 'Helvetica Neue', Arial, sans-serif"
// Social channels footer row (inline — this module is deliberately import-free).
const SOCIAL_ROW = `<div style="margin-top:12px">` +
  `<a href="https://www.instagram.com/hexaspace.coworking" style="font-family:${CAPS};font-size:9px;letter-spacing:.2em;color:${MUTE};text-decoration:none;text-transform:uppercase">Instagram</a>` +
  `<span style="color:${HAIR};font-size:9px">&nbsp;&nbsp;·&nbsp;&nbsp;</span>` +
  `<a href="https://www.linkedin.com/company/hexa-space/" style="font-family:${CAPS};font-size:9px;letter-spacing:.2em;color:${MUTE};text-decoration:none;text-transform:uppercase">LinkedIn</a>` +
  `<span style="color:${HAIR};font-size:9px">&nbsp;&nbsp;·&nbsp;&nbsp;</span>` +
  `<a href="https://www.hexaspace.com.au/" style="font-family:${CAPS};font-size:9px;letter-spacing:.2em;color:${MUTE};text-decoration:none;text-transform:uppercase">Website</a>` +
  `</div>`
const FONTS = `
    @font-face{font-family:'HexaBig';src:url('https://admin.hexaspace.com.au/fonts/BigDailyShort-ExtraLight.otf') format('opentype');font-weight:400;font-display:swap}
    @font-face{font-family:'HexaGT';src:url('https://admin.hexaspace.com.au/fonts/GT-America-Standard-Thin.otf') format('opentype');font-weight:400;font-display:swap}
    @font-face{font-family:'HexaRework';src:url('https://admin.hexaspace.com.au/fonts/ReworkMicro-Semibold.otf') format('opentype');font-weight:600;font-display:swap}`

function frame(inner) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${FONTS}</style></head>
<body style="margin:0;padding:0;background:${GREIGE};font-family:${SANS};color:${INK}">
  <div style="max-width:600px;margin:0 auto;padding:30px 16px">
    <div style="text-align:center;padding:6px 0 22px">
      <span style="font-family:${CAPS};font-size:15px;letter-spacing:.34em;color:${INK};text-transform:uppercase">HEXA&nbsp;SPACE</span>
      <span style="font-family:${SANS};font-size:14px;color:${OLIVE};letter-spacing:.12em">&nbsp;&nbsp;六合空间</span>
    </div>
    <div style="background:#ffffff;border:1px solid ${HAIR};border-radius:12px;overflow:hidden">
      <div style="height:3px;background:${OLIVE}"></div>
      <div style="padding:38px 40px">${inner}</div>
    </div>
    <div style="text-align:center;padding:22px 8px 6px">
      <div style="font-family:${CAPS};font-size:10px;letter-spacing:.3em;color:${OLIVE};text-transform:uppercase">Function Space Hire</div>
      ${SOCIAL_ROW}
      <div style="font-family:${SANS};font-size:11px;color:#9a9aa0;margin-top:10px">Hexa Space · 402/830 Whitehorse Road, Box Hill VIC 3128 · {{website}}</div>
    </div>
  </div>
</body></html>`
}

const kicker = (t) => `<div style="font-family:${CAPS};font-size:11px;letter-spacing:.28em;color:${OLIVE};text-transform:uppercase;margin:0 0 12px">${t}</div>`
const h1 = (t) => `<h1 style="font-family:${SERIF};font-weight:400;font-size:28px;line-height:1.12;color:${INK};margin:0 0 18px">${t}</h1>`
const p = (t) => `<p style="font-family:${SANS};font-size:15px;line-height:1.65;color:#3a3a3a;margin:0 0 18px">${t}</p>`
const small = (t) => `<p style="font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTE};margin:16px 0 0">${t}</p>`
const btn = (label, href) => `<div style="text-align:center;margin:26px 0"><a href="${href}" style="display:inline-block;background:${OLIVE};color:#fff;text-decoration:none;padding:13px 34px;font-family:${CAPS};font-size:12px;letter-spacing:.14em;text-transform:uppercase;border-radius:6px">${label}</a></div>`
const row = (label, val, strong) => `    <tr><td style="padding:9px 0;font-family:${SANS};color:${MUTE};font-size:13px;width:170px">${label}</td><td style="padding:9px 0;font-family:${SANS};font-size:13px;color:${INK}${strong ? ';font-weight:600' : ''}">${val}</td></tr>`

const SUMMARY = `<table style="width:100%;border-collapse:collapse;margin:2px 0 22px;border-top:1px solid ${HAIR};border-bottom:1px solid ${HAIR}">
${row('Event', '{{eventName}}')}
${row('Date', '{{eventDate}} · {{startTime}}–{{endTime}}')}
${row('Guests', '{{guests}}')}
${row('Total (inc GST)', '{{total}}', true)}
${row('Payable now', '{{dueNow}} <span style="color:' + MUTE + '">(50% deposit + $300 security)</span>')}
  </table>`

export const DEFAULT_FUNCTION_BROCHURE_SUBJECT = 'Hexa Space function space — {{eventName}}'
export const DEFAULT_FUNCTION_BROCHURE_HTML = frame(`
  ${kicker('Function Space Hire')}
  ${h1('Thanks for your interest, {{name}}.')}
  ${p("Our light-filled venue suits launches, dinners, conferences and celebrations. Here's a quick overview:")}
  <table style="width:100%;border-collapse:collapse;margin:0 0 20px;border-top:1px solid ${HAIR};border-bottom:1px solid ${HAIR}">
${row('Venue hire (weekday)', '$250 + GST / hour')}
${row('Venue hire (weekend)', '$325 + GST / hour')}
${row('Cleaning fee', '$200 + GST')}
${row('Refundable security deposit', '$300')}
${row('Capacity', '20–100 guests')}
  </table>
  ${p("Ready to lock it in? Choose your preferred date and layout — we'll review availability and get your booking underway.")}
  ${btn('Book a time', '{{bookLink}}')}
  ${small("Questions? Reply any time — we'd love to host you.")}`)

export const DEFAULT_FUNCTION_AGREEMENT_SUBJECT = 'Your Hexa Space function quote — {{eventName}}'
export const DEFAULT_FUNCTION_AGREEMENT_HTML = frame(`
  ${kicker('Function Hire Agreement')}
  ${h1('Your quote is ready to sign, {{name}}.')}
  ${p('Please review your event details, add-ons, pricing and our terms, then sign digitally to secure your date.')}
  ${SUMMARY}
  ${btn('Review &amp; sign agreement', '{{signLink}}')}
  ${small(`If the button doesn't work, copy this link:<br><a href="{{signLink}}" style="color:${OLIVE};word-break:break-all">{{signLink}}</a>`)}`)

export const DEFAULT_FUNCTION_CONFIRMED_SUBJECT = 'Confirmed — your function at Hexa Space ({{eventDate}})'
export const DEFAULT_FUNCTION_CONFIRMED_HTML = frame(`
  ${kicker('Booking Confirmed')}
  ${h1("You're booked in, {{name}}. 🎉")}
  ${p("Your function at Hexa Space is confirmed. We've reserved your time (plus a 30-minute setup buffer each side). Your deposit and security invoices are on their way; the balance is due 14 days before your event.")}
  ${SUMMARY}
  ${small("Questions? Just reply to this email — we can't wait to host you.")}`)
