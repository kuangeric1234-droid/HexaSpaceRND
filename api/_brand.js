// Shared Hexa Space branded email kit for serverless (api/) endpoints.
//
// Every transactional email rendered on the server should use brandFrame() +
// these helpers so the look matches the in-app templates (src/lib/sendEmail.js):
// greige canvas, white card with an olive top-rule, caps HEXA SPACE wordmark,
// brand fonts (with web-safe fallbacks for Gmail/Outlook) and a social footer.
// Palette per the Hexa brand guidelines.

export const OLIVE = '#7F8B2F', GREIGE = '#EFEDF2', INK = '#1a1a1a', MUTE = '#6b6b6b', HAIR = '#e3e1e6'
export const SERIF = "'HexaBig', Georgia, 'Times New Roman', serif"
export const SANS = "'HexaGT', 'Helvetica Neue', Arial, sans-serif"
export const CAPS = "'HexaRework', 'Helvetica Neue', Arial, sans-serif"

const FONTS = `
    @font-face{font-family:'HexaBig';src:url('https://admin.hexaspace.com.au/fonts/BigDailyShort-ExtraLight.otf') format('opentype');font-weight:400;font-display:swap}
    @font-face{font-family:'HexaGT';src:url('https://admin.hexaspace.com.au/fonts/GT-America-Standard-Thin.otf') format('opentype');font-weight:400;font-display:swap}
    @font-face{font-family:'HexaRework';src:url('https://admin.hexaspace.com.au/fonts/ReworkMicro-Semibold.otf') format('opentype');font-weight:600;font-display:swap}`

const SOCIAL_ROW = `<div style="margin-top:12px">` +
  `<a href="https://www.instagram.com/hexaspace.coworking" style="font-family:${CAPS};font-size:9px;letter-spacing:.2em;color:${MUTE};text-decoration:none;text-transform:uppercase">Instagram</a>` +
  `<span style="color:${HAIR};font-size:9px">&nbsp;&nbsp;·&nbsp;&nbsp;</span>` +
  `<a href="https://www.linkedin.com/company/hexa-space/" style="font-family:${CAPS};font-size:9px;letter-spacing:.2em;color:${MUTE};text-decoration:none;text-transform:uppercase">LinkedIn</a>` +
  `<span style="color:${HAIR};font-size:9px">&nbsp;&nbsp;·&nbsp;&nbsp;</span>` +
  `<a href="https://www.hexaspace.com.au/" style="font-family:${CAPS};font-size:9px;letter-spacing:.2em;color:${MUTE};text-decoration:none;text-transform:uppercase">Website</a>` +
  `</div>`

// Branded content helpers.
export const bKicker = (t) => `<div style="font-family:${CAPS};font-size:11px;letter-spacing:.28em;color:${OLIVE};text-transform:uppercase;margin:0 0 12px">${t}</div>`
export const bH1 = (t) => `<h1 style="font-family:${SERIF};font-weight:400;font-size:26px;line-height:1.14;color:${INK};margin:0 0 16px">${t}</h1>`
export const bH2 = (t) => `<h2 style="font-family:${SERIF};font-weight:400;font-size:20px;line-height:1.2;color:${INK};margin:0 0 14px">${t}</h2>`
export const bP = (t) => `<p style="font-family:${SANS};font-size:14px;line-height:1.65;color:#3a3a3a;margin:0 0 16px">${t}</p>`
export const bSmall = (t) => `<p style="font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTE};margin:16px 0 0">${t}</p>`
export const bBtn = (label, href) => `<div style="text-align:center;margin:26px 0"><a href="${href}" style="display:inline-block;background:${OLIVE};color:#ffffff;text-decoration:none;padding:13px 34px;font-family:${CAPS};font-size:12px;letter-spacing:.14em;text-transform:uppercase;border-radius:6px"><span style="color:#ffffff;text-decoration:none">${label}</span></a></div>`

// A greige info panel — for credentials, codes, summaries, callouts.
export const bPanel = (inner) => `<div style="background:${GREIGE};border-radius:8px;padding:16px 18px;margin:0 0 18px">${inner}</div>`

// Key/value summary table. rows = [[label, value, strong?], …].
export function bTable(rows = []) {
  const tr = ([l, v, strong]) => `<tr>
    <td style="padding:9px 0;font-family:${SANS};font-size:12px;color:${MUTE};width:150px;border-bottom:1px solid ${HAIR}">${l}</td>
    <td style="padding:9px 0;font-family:${SANS};font-size:13px;color:${INK};${strong ? 'font-weight:600;' : ''}border-bottom:1px solid ${HAIR}">${v}</td>
  </tr>`
  return `<table style="width:100%;border-collapse:collapse;margin:4px 0 22px">${rows.map(tr).join('')}</table>`
}

// Full branded wrapper. `footerLabel` shows a small caps line above the social
// row (e.g. "Function Space Hire", "Referral Partners"); omit for none.
export function brandFrame(inner, { footerLabel = '', company = 'Hexa Space', website = 'hexaspace.com.au' } = {}) {
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
      ${footerLabel ? `<div style="font-family:${CAPS};font-size:10px;letter-spacing:.3em;color:${OLIVE};text-transform:uppercase">${footerLabel}</div>` : `<div style="font-family:${CAPS};font-size:10px;letter-spacing:.3em;color:${OLIVE};text-transform:uppercase">HEXA SPACE &nbsp;·&nbsp; 六合空间</div>`}
      ${SOCIAL_ROW}
      <div style="font-family:${SANS};font-size:11px;color:#9a9aa0;margin-top:10px">${company} &middot; <a href="https://${website}" style="color:#9a9aa0;text-decoration:none">${website}</a></div>
    </div>
  </div>
</body></html>`
}
