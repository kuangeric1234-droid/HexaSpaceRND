import { unpaidInvoices } from './invoiceTotal.js'

const DAY = 86400000
function daysUntil(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`)
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')
  return Math.round((d - today) / DAY)
}
function eventWhen(days) {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

// Member-app notification model — the actionable, member-specific signals the
// bell flags: mail awaiting collection, live drink orders, unpaid invoices, and
// events the member has RSVP'd to that fall within the next two weeks.
export function buildNotifications(data) {
  const mail = (data?.mailItems ?? []).filter((m) => m.status === 'awaiting')
  const orders = (data?.orders ?? []).filter((o) => ['placed', 'accepted'].includes(o.status))
  const unpaid = unpaidInvoices(data?.invoices ?? [])
  // Only flag registered events happening within 14 days so far-off ones don't
  // sit as a permanent badge.
  const soonEvents = (data?.eventReminders ?? []).filter((e) => daysUntil(e.date) <= 14)

  const items = []
  if (mail.length) {
    items.push({
      key: 'mail', to: '/mail', tone: 'green', group: 'Mail',
      label: mail.length === 1 ? 'An item is waiting for collection' : `${mail.length} items waiting for collection`,
      sub: 'Mail & deliveries · at reception',
    })
  }
  orders.forEach((o) => {
    items.push({
      key: `order-${o.id}`, to: '/food', tone: 'green', group: 'Drinks',
      label: `Order ${o.number} — ${o.status === 'accepted' ? 'being prepared' : 'placed'}`,
      sub: 'Seoul Bakery',
    })
  })
  if (unpaid.length) {
    items.push({
      key: 'invoices', to: '/more/billing', tone: 'ink', group: 'Billing',
      label: unpaid.length === 1 ? 'You have an invoice due' : `${unpaid.length} invoices due`,
      sub: 'Billing & invoices',
    })
  }
  soonEvents.forEach((e) => {
    items.push({
      key: `event-${e.id}`, to: '/more/events', tone: 'green', group: 'Events',
      label: e.title,
      sub: `Event · ${eventWhen(daysUntil(e.date))}`,
    })
  })

  return {
    items,
    mail: mail.length,
    orders: orders.length,
    invoices: unpaid.length,
    events: soonEvents.length,
    count: mail.length + orders.length + unpaid.length + soonEvents.length,
  }
}
