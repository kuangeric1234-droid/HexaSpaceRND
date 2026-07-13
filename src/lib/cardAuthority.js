// Card payment authority — consent capture for storing + charging a card.
//
// WHY: existing members' agreements pre-date the payment-authority clause, so
// stored-card charging must be OPT-IN for them: they tick this authority when
// adding a card, and we record what they agreed to and when on the tenant.
// New contracts contain the clause, so their card setup ticks through the same
// flow and everyone converges. The overdue auto-charge cron only ever charges
// tenants with cardAuthorityAccepted === true (api/overdue-reminders.js);
// member-initiated payments (tapping “Pay”) are their own authorisation.

export const CARD_AUTHORITY_VERSION = 'v2-2026-07'

export const CARD_AUTHORITY_TEXT =
  'I authorise Hexa Space Pty Ltd to charge this card for amounts owing under my ' +
  'membership or booking agreement — including overdue invoices after the grace ' +
  'period, with at least 2 business days’ prior written notice by email before any ' +
  'such charge — until I remove the card or withdraw this authority in writing.'

/** Fields stamped onto the tenant record when the authority is accepted. */
export function cardAuthorityFields(byEmail) {
  return {
    cardAuthorityAccepted: true,
    cardAuthorityAcceptedAt: new Date().toISOString(),
    cardAuthorityVersion: CARD_AUTHORITY_VERSION,
    cardAuthorityBy: byEmail || '',
  }
}
