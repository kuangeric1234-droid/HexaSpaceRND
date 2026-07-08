// Resolve the primary contact shown on a contract / licence agreement.
//
// Company records often carry only an email (imports), while the real contact
// details live on the company's member rows. Preference order: the member the
// contract names (lease.memberName) → the billing person → the contact person
// → the first member — each field falling back to the tenant record.
export function resolvePrimaryContact(lease, tenant, members = []) {
  const team = (members ?? []).filter((m) => m.companyId === tenant?.id)
  const named = lease?.memberName
    ? team.find((m) => (m.name || '').trim().toLowerCase() === String(lease.memberName).trim().toLowerCase())
    : null
  const pick = named
    ?? team.find((m) => m.billingPerson)
    ?? team.find((m) => m.contactPerson)
    ?? team[0]
    ?? null
  return {
    name: lease?.memberName || pick?.name || tenant?.contactName || '',
    phone: (named ?? pick)?.phone || tenant?.phone || '',
    email: (named ?? pick)?.email || tenant?.email || '',
  }
}
