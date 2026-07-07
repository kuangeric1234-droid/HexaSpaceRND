// The deliberately-PUBLIC subset of the global settings row.
//
// The full `settings` row holds admin-only material (adminUsers allow-list,
// outbound-email config incl. safeMode, billingRules, xero mappings, email
// templates). Public/portal pages only ever need company identity + the bank
// details that already appear on every invoice/contract a client receives, plus
// a couple of public URLs. This helper is the single source of truth for that
// split — used by the public sign endpoints and the portal settings endpoint so
// nothing else leaks the whole blob to the browser.
export function publicSettings(settings = {}) {
  const s = settings || {};
  return {
    company: {
      name: s.company?.name ?? 'Hexa Space',
      email: s.company?.email ?? 'info@hexaspace.com.au',
      website: s.company?.website ?? 'hexaspace.com.au',
      logo: s.company?.logo ?? '',
    },
    // Bank details + ABN are printed on invoices/contracts the client holds —
    // public to the authenticated client/member, NOT secret.
    billing: {
      businessName: s.billing?.businessName ?? '',
      abn: s.billing?.abn ?? '',
      gstRegistered: s.billing?.gstRegistered ?? true,
      bankName: s.billing?.bankName ?? '',
      bsb: s.billing?.bsb ?? '',
      acc: s.billing?.acc ?? '',
      address: s.billing?.address ?? '',
    },
    contracts: {
      eSignName: s.contracts?.eSignName ?? s.company?.name ?? 'Hexa Space',
      eSignEmail: s.contracts?.eSignEmail ?? 'esign@hexaspace.com.au',
    },
    billingRules: {
      // Tax rate/flag are needed to render invoice/contract totals; not secret.
      taxEnabled: s.billingRules?.taxEnabled ?? true,
      taxRate: s.billingRules?.taxRate ?? 10,
    },
    portalUrl: s.portalUrl ?? 'https://portal.hexaspace.com.au',
    functionBookingUrl: s.functionBookingUrl ?? '',
  };
}
