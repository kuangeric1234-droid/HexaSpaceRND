import { useState, useEffect } from 'react'
import { authHeaders } from '../../lib/apiFetch.js'
import { CreditCard, Plus } from 'lucide-react'
import { useApp } from '../context.js'
import { Screen, BackHeader, Label, Card, Chip, Rule, EmptyNote, StatusBadge, fmt, money } from '../ui.jsx'
import { invoiceTotal, unpaidInvoices } from '../lib/invoiceTotal.js'
import { apiUrl, openPayment } from '../lib/native.js'
import { supabase } from '../../lib/supabase.js'
import { CARD_AUTHORITY_TEXT, cardAuthorityFields } from '../../lib/cardAuthority.js'
import { canViewBilling } from '../../lib/billingAccess.js'
import PaySheet from './PaySheet.jsx'

// Billing & invoices — pay outstanding invoices (saved card / Checkout),
// see the membership, manage the card on file. Mirrors PortalBilling reads.
export default function Billing() {
  const { data, patch } = useApp()
  const { company, invoices, leases, spaces } = data
  // Invoices, payments and the stored card are limited to the company's
  // billing/contact person (server-enforced too). Teammates see membership only.
  const canBilling = canViewBilling(data.member)
  const [payInvoice, setPayInvoice] = useState(null)
  const [busyCard, setBusyCard] = useState(false)
  const [authorityTicked, setAuthorityTicked] = useState(false)
  // Pre-authority contracts: storing a card is opt-in — consent is recorded
  // on the company record before Stripe setup starts (see lib/cardAuthority.js).
  const needsAuthority = !company?.cardAuthorityAccepted

  const [cardSaved] = useState(() => new URLSearchParams(window.location.search).get('card') === 'saved')
  const [justPaid] = useState(() => new URLSearchParams(window.location.search).get('paid'))
  useEffect(() => {
    if (cardSaved || justPaid) window.history.replaceState({}, '', window.location.pathname)
  }, [cardSaved, justPaid])

  const unpaid = unpaidInvoices(invoices)
  const rest = [...invoices]
    .filter((i) => !unpaid.includes(i))
    .sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate))
    .slice(0, 12)
  const activeLeases = (leases ?? []).filter((l) => l.status === 'active')
  const hasCard = !!company?.stripePaymentMethodId
  const nameFor = (id) => spaces.find((s) => s.id === id)?.unitNumber

  async function startCardSetup() {
    if (needsAuthority && !authorityTicked) return
    setBusyCard(true)
    try {
      if (needsAuthority) {
        const consented = { ...company, ...cardAuthorityFields(data.member?.email || company.email) }
        await supabase.from('tenants').update({ data: consented, updated_at: new Date().toISOString() }).eq('id', company.id)
        patch((prev) => ({ ...prev, company: consented }))
      }
      const r = await fetch(apiUrl('/api/stripe/setup'), {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ tenantId: company.id, returnTo: '/app/more/billing' }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Could not start card setup.')
      await openPayment(d.url)
      setBusyCard(false)
    } catch (e) {
      alert(e.message)
      setBusyCard(false)
    }
  }

  return (
    <Screen>
      <BackHeader title="Billing" fallback="/more" />

      {justPaid && (
        <div className="mb-5 border border-hexa-green/40 bg-hexa-green/10 px-4 py-3">
          <p className="hx-prose text-[13px] text-ink">✓ Payment received for {justPaid} — it will show as paid within a few minutes.</p>
        </div>
      )}
      {cardSaved && (
        <div className="mb-5 border border-hexa-green/40 bg-hexa-green/10 px-4 py-3">
          <p className="hx-prose text-[13px] text-ink">✓ Card verified — it will appear here within a few minutes.</p>
        </div>
      )}

      {/* Outstanding — billing contact only */}
      {canBilling && (
        <>
          <Label className="mb-3 mt-2">Outstanding</Label>
          {unpaid.length === 0 ? (
            <Card className="p-5"><p className="hx-prose text-[13px]">Nothing outstanding — you're all paid up.</p></Card>
          ) : (
            <div className="space-y-px bg-ink/10">
              {unpaid.map((inv) => (
                <Card key={inv.id} className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-heading uppercase tracking-nav text-[11px] text-ink">{inv.number}</div>
                      <div className="hx-prose text-[12px] mt-1">Due {fmt(inv.dueDate)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display font-extralight text-2xl">{money(invoiceTotal(inv))}</div>
                      <StatusBadge status={inv.status} />
                    </div>
                  </div>
                  <button onClick={() => setPayInvoice(inv)}
                    className="mt-4 w-full min-h-[46px] bg-ink text-paper font-heading uppercase tracking-nav text-[11px] active:bg-charcoal">
                    Pay now
                  </button>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Membership */}
      <Label className="mb-3 mt-9">Membership</Label>
      {activeLeases.length === 0 ? (
        <Card className="p-5"><p className="hx-prose text-[13px]">No active membership on file.</p></Card>
      ) : (
        <div className="space-y-px bg-ink/10">
          {activeLeases.map((l) => (
            <Card key={l.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-heading uppercase tracking-nav text-[11px] text-ink">
                    {nameFor(l.spaceId) || l.contractNumber || 'Membership'}
                  </div>
                  <div className="hx-prose text-[12px] mt-1">{fmt(l.startDate)} – {fmt(l.endDate)}</div>
                </div>
                {/* Monthly cost is commercially sensitive — billing/contact person only */}
                {canBilling && (
                  <div className="text-right">
                    <div className="font-display font-extralight text-xl">{money(l.monthlyRent)}</div>
                    <div className="hx-prose text-[11px]">per month + GST</div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Card on file — billing contact only */}
      {canBilling && (<>
      <Label className="mb-3 mt-9">Payment method</Label>
      <Card className="p-6 text-center">
        <CreditCard size={20} strokeWidth={1.4} className="mx-auto text-portal-muted" />
        {hasCard ? (
          <>
            <p className="font-heading uppercase tracking-nav text-[12px] text-ink mt-3">
              {(company.cardBrand || 'Card').toUpperCase()} •••• {company.cardLast4}
            </p>
            {company.cardExpMonth && (
              <p className="hx-prose text-[11px] mt-1">Expires {String(company.cardExpMonth).padStart(2, '0')}/{company.cardExpYear}</p>
            )}
            <button onClick={startCardSetup} disabled={busyCard}
              className="mt-4 hx-btn mx-auto disabled:opacity-50">{busyCard ? 'Opening…' : 'Replace card'}</button>
          </>
        ) : (
          <>
            <p className="hx-prose text-[13px] mt-3">No payment method saved.</p>
            {needsAuthority && (
              <label className="flex items-start gap-3 text-left mt-4 cursor-pointer">
                <input type="checkbox" checked={authorityTicked} onChange={(e) => setAuthorityTicked(e.target.checked)} className="mt-1 shrink-0" />
                <span className="hx-prose text-[12px]">{CARD_AUTHORITY_TEXT}</span>
              </label>
            )}
            <button onClick={startCardSetup} disabled={busyCard || (needsAuthority && !authorityTicked)}
              className="mt-4 hx-btn mx-auto disabled:opacity-50">
              <Plus size={13} /> {busyCard ? 'Opening…' : 'Add payment method'}
            </button>
          </>
        )}
        <p className="hx-prose text-[11px] mt-4">Held securely by Stripe — we never see the number.</p>
      </Card>

      {/* History */}
      {rest.length > 0 && (
        <>
          <Label className="mb-2 mt-9">History</Label>
          <div className="divide-y divide-ink/5 border-y border-ink/10">
            {rest.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <div className="font-heading uppercase tracking-nav text-[11px] text-ink">{inv.number}</div>
                  <div className="hx-prose text-[12px] mt-0.5">Due {fmt(inv.dueDate)}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-display font-extralight text-lg">{money(invoiceTotal(inv))}</span>
                  <StatusBadge status={inv.status} />
                </div>
              </div>
            ))}
          </div>
          <p className="hx-prose text-[11px] mt-4">
            Need a PDF? Every invoice can be downloaded from the web portal at portal.hexaspace.com.au.
          </p>
        </>
      )}

      {invoices.length === 0 && <><Rule className="mt-9" /><EmptyNote label="No invoices yet." /></>}
      </>)}

      {!canBilling && (
        <p className="hx-prose text-[13px] mt-9 text-portal-muted">
          Invoices and payments are managed by your company’s billing contact.
        </p>
      )}

      {payInvoice && (
        <PaySheet
          invoice={payInvoice}
          company={company}
          returnTo="/app/more/billing"
          onClose={() => setPayInvoice(null)}
          onPaid={(updated) => {
            patch((prev) => ({
              ...prev,
              invoices: prev.invoices.map((i) => (i.id === updated.id ? updated : i)),
            }))
            setPayInvoice(null)
          }}
        />
      )}
    </Screen>
  )
}
