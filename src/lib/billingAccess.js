// Who may VIEW invoices, PAY them, and manage the company's stored card in the
// member portal + app. Limited to the company's billing or contact person — or
// the company/owner account itself (member is null when signed in with the
// company email). Regular teammates cannot. Server twin: api/stripe/checkout.js
// and api/stripe/setup.js enforce the same rule so hiding the UI isn't the only gate.
export function canViewBilling(member) {
  return !member || !!member.billingPerson || !!member.contactPerson
}
