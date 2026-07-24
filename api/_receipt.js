// Payment receipt — emailed automatically when an invoice is marked paid on any
// SERVER path (off-session card charge, pay-link/portal Stripe checkout). The
// in-app admin "mark paid" is handled client-side in useStore. Idempotent via
// receiptSentAt; skips refunds/credit notes and missing recipients.
import { sendResendEmail } from './_email.js'
import { brandFrame, bKicker, bH2, bP, bSmall } from './_brand.js'

export async function sendInvoiceReceipt(supabase, invoice, tenant, amount) {
  try {
    if (!invoice || invoice.receiptSentAt) return
    if (invoice.invoiceType === 'bond_refund' || invoice.creditNoteForId) return
    const to = tenant?.email || invoice.clientEmail
    if (!to) return
    const { data } = await supabase.from('settings').select('data').eq('id', 'global').single()
    const settings = data?.data ?? {}
    const name = settings?.billing?.businessName || settings?.company?.name || 'Hexa Space'
    const website = settings?.company?.website || 'hexaspace.com.au'
    const from = `${settings?.emails?.fromName || name} <${settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'}>`
    const paidStr = `$${Number(amount || 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
    const when = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    const inner = bKicker('Payment Receipt') + bH2('Payment received — thank you.') +
      bP(`Hi ${tenant?.contactName || tenant?.businessName || 'there'},`) +
      bP(`We've received your payment of <strong>${paidStr}</strong> for invoice <strong>${invoice.number}</strong>. Thank you.`) +
      bSmall(`Invoice ${invoice.number} · Paid ${when}${invoice.periodStart ? ` · Period ${invoice.periodStart} – ${invoice.periodEnd}` : ''}`) +
      bSmall('Keep this email for your records — no further action is needed.')
    const r = await sendResendEmail({ from, to: [to], subject: `Payment receipt — ${invoice.number}`, html: brandFrame(inner, { company: name, website, footerLabel: 'Payment Receipt' }) })
    if (r.ok || r.skipped) {
      await supabase.from('invoices').upsert({ id: invoice.id, data: { ...invoice, receiptSentAt: new Date().toISOString() }, updated_at: new Date().toISOString() })
    }
  } catch (e) { console.error('sendInvoiceReceipt failed:', e) }
}
