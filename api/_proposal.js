// Shared helpers for the public proposal endpoints.

// A proposal expires validityDays (default 14) after it was sent. Legacy
// proposals with no sentAt never expire.
export function proposalExpired(proposal, now = new Date()) {
  if (!proposal?.sentAt) return false
  const days = Number(proposal.validityDays ?? 14)
  if (!days || days <= 0) return false
  const expiry = new Date(proposal.sentAt)
  expiry.setDate(expiry.getDate() + days)
  return now > expiry
}
