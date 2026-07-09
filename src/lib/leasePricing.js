// Contract step pricing — the ONE place a step's discount is applied.
//
// A pricing step stores `listPrice` (RRP) and `discount` — either a percentage
// label ('10%') or a dollar amount off per month ('$200'). Everything that
// turns a step into money — the payment schedule (and therefore the bill run),
// the licence-agreement document, the contract detail view and the saved
// lease.monthlyRent — must charge the DISCOUNTED amount, not list.

// '10%' → {type:'pct', value:10} · '$200' / '200' → {type:'amount', value:200}
// blank/invalid → null.
export function parseDiscount(discount) {
  const s = String(discount ?? '').trim()
  if (!s) return null
  if (s.endsWith('%')) {
    const n = Number(s.slice(0, -1).replace(/,/g, ''))
    return Number.isFinite(n) && n > 0 ? { type: 'pct', value: Math.min(n, 100) } : null
  }
  const m = s.match(/^\$?\s*([\d,]+(?:\.\d+)?)$/)
  if (m) {
    const n = Number(m[1].replace(/,/g, ''))
    return Number.isFinite(n) && n > 0 ? { type: 'amount', value: n } : null
  }
  return null
}

// Back-compat: percentage value when the discount is a %, else 0.
export function discountPct(discount) {
  const d = parseDiscount(discount)
  return d?.type === 'pct' ? d.value : 0
}

const round2 = (n) => Math.round(n * 100) / 100

function applyDiscount(gross, discount) {
  const d = parseDiscount(discount)
  if (!d) return round2(gross)
  if (d.type === 'pct') return round2(gross * (1 - d.value / 100))
  return round2(Math.max(0, gross - d.value)) // $ off per month, floor at $0
}

export function discountedPrice(listPrice, discount) {
  return applyDiscount(Number(listPrice ?? 0), discount)
}

// A step's effective monthly charge (list × qty, less its discount).
export function stepMonthly(step) {
  return applyDiscount(Number(step?.listPrice ?? 0) * Number(step?.qty ?? 1), step?.discount)
}
