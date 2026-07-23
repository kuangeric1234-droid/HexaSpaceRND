// Derives the lobby directory boards from live data, so the TVs follow tenant
// moves without anyone retyping the board:
//   suites    — occupied offices on the board's floor (active, already-started
//               contracts; multi-office contracts count every item's space)
//   community — companies holding an active virtual-office or desk membership
//
// Hand-polished display text is precious (bilingual second lines, "A / B"
// pairings, dropped "Pty Ltd"s) — an entry's text is KEPT while the occupant
// behind it is unchanged, and only replaced when the suite actually changes
// hands. Board chrome (headings, address, showCommunity) always carries over.
//
// Used by the Directory admin ("Refresh from live data") and the daily
// reconcile cron for boards with autoSync enabled.

const todayISO = () => new Date().toISOString().split('T')[0]

// Loose company-name matcher: case/punctuation-insensitive, ignores the
// Pty Ltd tail, keeps CJK so bilingual strings still contain the match.
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\b(pty|ltd|limited|p\/l)\b/g, '')
    .replace(/[^a-z0-9一-鿿]/g, '')

// Which office floors feed each board. Level 5 offices are deliberately not
// shown (no L5 board exists) — add 'l5' here if one ever goes up.
const BOARD_FLOORS = { 4: ['l4'], 2: ['l2'] }

// Alphabetise by the English part — bilingual names lead with Chinese.
const sortKeyOf = (n) => n.replace(/^[^A-Za-z0-9]+/, '') || n

const leaseSpaceIds = (l) =>
  [...new Set([l.spaceId, ...(l.items ?? []).map((i) => i.spaceId)].filter(Boolean))]

export function buildDirectoryBoard(level, prev, { tenants, leases, spaces }) {
  const t = todayISO()
  const tenantOf = (id) => tenants.find((x) => x.id === id)
  // A member-confirmed directoryName (getting-started email → /directory-name
  // page) always wins over the raw business name.
  const tenantName = (id) => {
    const ten = tenantOf(id)
    return ten?.directoryName?.trim() || ten?.businessName || ''
  }
  const hasConfirmedName = (id) => !!tenantOf(id)?.directoryName?.trim()
  const active = leases.filter((l) => l.status === 'active' && (l.startDate ?? '') <= t)

  // spaceId → occupying tenant ids
  const occ = new Map()
  for (const l of active) {
    for (const sid of leaseSpaceIds(l)) {
      if (!occ.has(sid)) occ.set(sid, new Set())
      occ.get(sid).add(l.tenantId)
    }
  }

  // ── Suites ────────────────────────────────────────────────────────────────
  const floors = BOARD_FLOORS[String(level)] ?? []
  const suiteLabel = (u) => String(u ?? '').replace(/^\s*(suite|office)\s*/i, '').trim()
  const prevSuites = prev?.suites ?? []
  const suites = spaces
    .filter((s) => s.type === 'office' && floors.includes(s.floor))
    .map((sp) => ({ sp, ids: [...(occ.get(sp.id) ?? [])].sort() }))
    .filter((x) => x.ids.length)
    .map(({ sp, ids }) => {
      const suite = suiteLabel(sp.unitNumber)
      const names = ids.map(tenantName).filter(Boolean)
      const tenantKey = ids.join(',')
      const prevEntry = prevSuites.find((p) => String(p.suite).trim() === suite)
      // Same occupant → keep the admin's display text. Auto rows match by
      // tenantKey; legacy manual rows match if the text contains the name.
      // A member-confirmed directoryName overrides preserved text: multi-line
      // names stay as typed for sole occupants, flatten when sharing a suite.
      const anyConfirmed = ids.some(hasConfirmedName)
      const unchanged =
        !anyConfirmed &&
        prevEntry &&
        (prevEntry.tenantKey === tenantKey ||
          (!prevEntry.tenantKey && names.some((n) => norm(n).length >= 3 && norm(prevEntry.name).includes(norm(n)))))
      const freshName = names.length === 1 ? names[0] : names.map((n) => n.replace(/\n+/g, ' ')).join(' / ')
      return {
        suite,
        name: unchanged ? prevEntry.name : freshName,
        tenantKey,
        _k: Number.parseInt(suite, 10) || 9999,
      }
    })
    .sort((a, b) => a._k - b._k || a.suite.localeCompare(b.suite))
    .map(({ _k, ...s }) => s)

  // ── Community members ─────────────────────────────────────────────────────
  const commSpaceIds = new Set(spaces.filter((s) => ['virtual', 'desk'].includes(s.type)).map((s) => s.id))
  const commIds = new Set()
  for (const l of active) {
    if (leaseSpaceIds(l).some((sid) => commSpaceIds.has(sid))) commIds.add(l.tenantId)
  }
  const prevComm = prev?.community ?? []
  const community = [
    ...new Set(
      [...commIds]
        .map((id) => {
          // Community rows are single-line — flatten a two-line confirmed name.
          const n = tenantName(id).replace(/\n+/g, ' ').trim()
          if (!n) return ''
          if (hasConfirmedName(id)) return n // member's confirmed spelling wins
          const k = norm(n)
          if (k.length < 3) return n
          // Keep the admin's existing spelling of this company if present.
          return prevComm.find((p) => norm(p).includes(k) || k.includes(norm(p))) ?? n
        })
        .filter(Boolean)
    ),
  ].sort((a, b) => sortKeyOf(a).localeCompare(sortKeyOf(b), 'en', { sensitivity: 'base' }))

  return { ...(prev ?? {}), level: String(level), suites, community }
}
