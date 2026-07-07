// Portal-adoption core (migration): who SHOULD have portal access (members of
// companies with an active lease), who's been invited, and who has actually
// signed in. Shared by GET /api/auth/adoption (the board) and
// POST /api/auth/bulk-invite (the blast). Auth-user sign-in state comes from
// the Supabase Auth admin API (last_sign_in_at).

async function fetchAll(sb, table) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select('id, data').order('id', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out.map((r) => r.data)
}

async function listAuthUsers(sb) {
  const users = new Map() // email -> { lastSignInAt }
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`auth users: ${error.message}`)
    for (const u of data?.users ?? []) {
      if (u.email) users.set(u.email.toLowerCase(), { lastSignInAt: u.last_sign_in_at || null })
    }
    if (!data || data.users.length < 1000) break
  }
  return users
}

export async function loadAdoption(sb) {
  const [members, tenants, leases, authUsers] = await Promise.all([
    fetchAll(sb, 'members'), fetchAll(sb, 'tenants'), fetchAll(sb, 'leases'), listAuthUsers(sb),
  ])
  const activeTenantIds = new Set(leases.filter((l) => l.status === 'active').map((l) => l.tenantId))
  const tenantName = new Map(tenants.map((t) => [t.id, t.businessName]))

  const rows = members
    .filter((m) => m.email && m.portalAccess !== false && activeTenantIds.has(m.companyId))
    .map((m) => {
      const au = authUsers.get(m.email.toLowerCase())
      return {
        id: m.id, name: m.name || '', email: m.email,
        company: tenantName.get(m.companyId) || '',
        invitedAt: m.portalInvitedAt || null,
        remindedAt: m.portalRemindedAt || null,
        signedInAt: au?.lastSignInAt || null,
      }
    })
    .sort((a, b) => (a.company || '').localeCompare(b.company || '') || (a.name || '').localeCompare(b.name || ''))

  return {
    rows,
    counts: {
      active: rows.length,
      registered: rows.filter((r) => r.signedInAt).length,
      invited: rows.filter((r) => !r.signedInAt && r.invitedAt).length,
      notInvited: rows.filter((r) => !r.signedInAt && !r.invitedAt).length,
    },
  }
}
