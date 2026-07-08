import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import SignatureCanvas from './SignatureCanvas.jsx'
import ContractTemplate from './ContractTemplate.jsx'
import { requiresCardOnFile } from '../lib/onboarding.js'

export default function SignPage({ token }) {
  const [state, setState] = useState('loading') // loading|ready|tenant_signed|fully_signed|invalid|error
  const [request, setRequest] = useState(null)
  const [lease, setLease] = useState(null)
  const [tenant, setTenant] = useState(null)
  const [members, setMembers] = useState([])
  const [space, setSpace] = useState(null)
  const [settings, setSettings] = useState(null)
  const [attachedTemplates, setAttachedTemplates] = useState([])
  const [signerName, setSignerName] = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [signerDate, setSignerDate] = useState(format(new Date(), 'dd/MM/yyyy'))
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [view, setView] = useState('contract')
  const [docPages, setDocPages] = useState([]) // sequential read-through pages (T&Cs, House Rules)
  const [reached, setReached] = useState(0)     // highest step index unlocked via Next
  const sigRef = useRef(null)
  // Card-on-file step (VO/desk memberships): ?card=saved is the Stripe setup
  // return; the webhook writes the card to the tenant in the background.
  const [cardSaved] = useState(() => new URLSearchParams(window.location.search).get('card') === 'saved')
  const [cardBusy, setCardBusy] = useState(false)

  async function startCardSetup() {
    setCardBusy(true)
    try {
      const r = await fetch('/api/sign/card-setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, returnTo: window.location.pathname }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Could not start card setup.')
      window.location.href = d.url
    } catch (e) {
      alert(e.message)
      setCardBusy(false)
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('/api/sign/load', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        if (!r.ok) { setState('invalid'); return }
        const payload = await r.json()
        const req = payload.request
        if (!req) { setState('invalid'); return }

        setRequest(req)
        if (req.status === 'fully_signed') { setState('fully_signed'); return }
        if (req.status === 'tenant_signed') {
          // Still load the lease + tenant: the post-sign card-on-file step
          // needs them (e.g. the client signed, then came back to the link).
          if (payload.lease) setLease(payload.lease)
          if (payload.tenant) setTenant(payload.tenant)
          setState('tenant_signed')
          return
        }

        const leaseData = payload.lease
        if (!leaseData) { setState('invalid'); return }
        setLease(leaseData)
        setSettings(payload.settings ?? null)
        setTenant(payload.tenant ?? null)
        setMembers(payload.members ?? [])
        setSpace(payload.space ?? null)
        if (payload.tenant?.contactName) setSignerName(payload.tenant.contactName)

        const allTemplates = payload.templates ?? []
        const contractTerms = leaseData.contractTerms ?? []
        const attached = contractTerms
          .map((ref) => allTemplates.find((t) => t.id === ref) ?? allTemplates.find((t) => `${t.name} - ${t.version}` === ref || t.name === ref))
          .filter(Boolean)
          .filter((t) => (t.category || 'document') !== 'email')
        setAttachedTemplates(attached)

        // Sequential read-through pages after the agreement: Terms & Conditions,
        // then House Rules. Prefer the versions attached to this lease; fall back
        // to the global documents so they always appear.
        const isDoc = (t) => (t.category || 'document') !== 'email'
        const pick = (re) => attached.find((t) => re.test(t.name || '')) || allTemplates.find((t) => isDoc(t) && re.test(t.name || ''))
        const pages = [pick(/terms/i), pick(/house\s*rules|house/i)].filter(Boolean)
        // de-dupe in case one template matches both patterns
        setDocPages(pages.filter((p, i) => pages.findIndex((x) => x.id === p.id) === i))

        setState('ready')
      } catch (err) {
        console.error(err)
        setState('error')
      }
    }
    load()
  }, [token])

  async function handleSign() {
    if (!agreed) { alert('Please confirm you have read and agree to the agreement.'); return }
    if (!signerName.trim()) { alert('Please enter your full name.'); return }
    if (sigRef.current?.isEmpty()) { alert('Please draw your signature.'); return }

    setSubmitting(true)
    try {
      const signatureData = sigRef.current.toDataURL()
      const r = await fetch('/api/sign/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signerName, signerTitle, signerDate, signatureData }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error ?? 'Something went wrong.')
      }
      // Reflect the countersignature-pending state locally for the card step.
      setLease((l) => (l ? { ...l, signatureStatus: 'out_for_signature' } : l))
      setState('tenant_signed')
    } catch (err) {
      console.error(err)
      alert('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Status screens ─────────────────────────────────────────────────────────
  if (state === 'loading') return <StatusScreen title="Loading contract…" subtitle="" />

  if (state === 'invalid') return (
    <StatusScreen
      icon="🔒"
      title="Invalid or expired link"
      subtitle="This signing link is invalid or has expired. Please contact Hexa Space for a new link."
    />
  )

  if (state === 'error') return (
    <StatusScreen icon="⚠️" title="Something went wrong" subtitle="Please try again or contact Hexa Space." />
  )

  if (state === 'tenant_signed') {
    // VO/desk memberships must save a verified payment card as part of the
    // contract journey (per the agreement's payment authority). The card is
    // stored by Stripe; we never see the number.
    const needsCard = lease && requiresCardOnFile(lease) && !tenant?.stripePaymentMethodId && !cardSaved
    if (needsCard) return (
      <StatusScreen
        icon="💳"
        title="One last step — verify your payment card"
        subtitle={`Thank you${request?.licensee_signer_name ? `, ${request.licensee_signer_name}` : ''} — your signature has been received. Your membership requires a payment card on file: it's stored securely by Stripe, shown in your member portal, and only charged for amounts owing under your agreement (e.g. overdue invoices), as authorised in the document you just signed.`}
      >
        <button onClick={startCardSetup} disabled={cardBusy} className="hx-btn mt-6 disabled:opacity-50">
          {cardBusy ? 'Opening secure card page…' : 'Verify card with Stripe →'}
        </button>
      </StatusScreen>
    )
    return (
      <StatusScreen
        icon="✅"
        title={cardSaved ? 'Card verified & signature received' : 'Signature received'}
        subtitle={`Thank you${request?.licensee_signer_name ? `, ${request.licensee_signer_name}` : ''}. ${cardSaved ? 'Your payment card is safely on file with Stripe. ' : ''}Your signature has been received. Hexa Space will countersign and send you a copy shortly.`}
      />
    )
  }

  if (state === 'fully_signed') return (
    <StatusScreen
      icon="✅"
      title="Agreement fully signed"
      subtitle="This agreement has been signed by all parties. A copy has been sent to your email."
    />
  )

  const contractNum = lease?.contractNumber ?? `CON-${lease?.id?.slice(-3).toUpperCase()}`

  // Ordered steps: Agreement → (Terms & Conditions) → (House Rules) → Sign.
  const steps = [
    { key: 'contract', label: 'Agreement' },
    ...docPages.map((d, i) => ({ key: `doc${i}`, label: d.name || `Document ${i + 1}` })),
    { key: 'sign', label: 'Sign' },
  ]
  const curIdx = Math.max(0, steps.findIndex((s) => s.key === view))
  const lastContentIdx = steps.length - 2 // step just before Sign
  const goTo = (idx) => {
    if (idx < 0 || idx >= steps.length) return
    setReached((r) => Math.max(r, idx))
    setView(steps[idx].key)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-bone font-body text-ink">
      {/* Header */}
      <div className="bg-charcoal text-paper px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-baseline gap-3">
          <span className="font-heading uppercase tracking-[0.28em] text-sm">Hexa&nbsp;Space</span>
          <span className="font-heading uppercase tracking-nav text-[10px] text-paper/50">Contract Signing</span>
        </div>
        <div className="font-heading uppercase tracking-nav text-[11px] text-paper/70">{contractNum}</div>
      </div>

      {/* Step bar — future steps stay locked until you've read the earlier pages */}
      <div className="bg-paper border-b border-ink/10 px-6 flex overflow-x-auto">
        {steps.map((s, idx) => {
          const locked = idx > reached
          return (
            <button
              key={s.key}
              onClick={() => !locked && setView(s.key)}
              disabled={locked}
              className={`shrink-0 px-5 py-3 font-heading uppercase tracking-nav text-[11px] border-b-2 -mb-px transition-colors ${
                view === s.key ? 'border-hexa-green text-ink' : locked ? 'border-transparent text-portal-muted/40 cursor-not-allowed' : 'border-transparent text-portal-muted hover:text-ink'
              }`}
            >
              <span className="text-portal-muted/60 mr-1.5">{idx + 1}</span>{s.label}
            </button>
          )
        })}
      </div>

      {/* Step 1 — the licence agreement */}
      {view === 'contract' && (
        <div className="max-w-4xl mx-auto my-6 px-4">
          <div className="bg-paper border border-ink/10 shadow-sm overflow-hidden">
            <ContractTemplate lease={lease} tenant={tenant} space={space} settings={settings} members={members} />
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={() => goTo(curIdx + 1)} className="hx-btn">
              {steps[curIdx + 1]?.key === 'sign' ? 'Proceed to sign →' : `Next: ${steps[curIdx + 1]?.label} →`}
            </button>
          </div>
        </div>
      )}

      {/* Read-through document steps — Terms & Conditions, then House Rules */}
      {docPages.map((tmpl, i) => (
        view === `doc${i}` && (
          <div key={tmpl.id} className="max-w-4xl mx-auto my-6 px-4">
            <div className="bg-paper border border-ink/10 shadow-sm overflow-hidden px-8 md:px-12 py-10">
              <div className="hx-eyebrow text-hexa-green mb-2">Please read carefully</div>
              <h2 className="font-display font-extralight text-2xl text-ink mb-3">{tmpl.name}</h2>
              <hr className="border-ink/15 mb-6" />
              <div
                className="template-html-body"
                style={{ lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: tmpl.content ?? '' }}
              />
            </div>
            <div className="mt-6 flex justify-between">
              <button onClick={() => goTo(curIdx - 1)} className="hx-btn-ghost">← Back</button>
              <button onClick={() => goTo(curIdx + 1)} className="hx-btn">
                {steps[curIdx + 1]?.key === 'sign' ? 'I have read this — proceed to sign →' : `Next: ${steps[curIdx + 1]?.label} →`}
              </button>
            </div>
          </div>
        )
      ))}

      {/* Final step — Sign */}
      {view === 'sign' && (
        <div className="max-w-xl mx-auto my-8 px-4">
          {curIdx > 0 && (
            <div className="mb-3"><button onClick={() => goTo(curIdx - 1)} className="hx-btn-ghost">← Back</button></div>
          )}
          <div className="bg-paper border border-ink/10 p-8 shadow-sm">
            <div className="hx-eyebrow text-hexa-green mb-2">Licence Agreement</div>
            <h2 className="font-display font-extralight text-2xl text-ink mb-1">Sign as Licensee</h2>
            <p className="hx-prose text-[14px] mb-6">By signing below you confirm you have read and agree to the terms of <strong>{contractNum}</strong>.</p>

            <div className="mb-4">
              <label className="hx-eyebrow block mb-1.5">Full name</label>
              <input type="text" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Your full legal name" className="hx-input" />
            </div>
            <div className="mb-4">
              <label className="hx-eyebrow block mb-1.5">Title</label>
              <input type="text" value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} placeholder="e.g. Director, Manager" className="hx-input" />
            </div>
            <div className="mb-5">
              <label className="hx-eyebrow block mb-1.5">Date</label>
              <input type="text" value={signerDate} onChange={(e) => setSignerDate(e.target.value)} className="hx-input" />
            </div>

            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <label className="hx-eyebrow">Signature</label>
                <button onClick={() => sigRef.current?.clear()} className="hx-prose text-[12px] underline">Clear</button>
              </div>
              <SignatureCanvas ref={sigRef} height={140} />
              <p className="hx-prose text-[12px] text-portal-muted mt-1">Draw your signature using mouse or finger</p>
            </div>

            <label className="flex items-start gap-3 mb-6 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 accent-[#7F8B2F]" />
              <span className="hx-prose text-[14px]">I have read and agree to the terms of this Licence Agreement and confirm that I am authorised to sign on behalf of the company.</span>
            </label>

            <div className="bg-bone border border-ink/10 p-4 mb-6 space-y-1">
              <div className="hx-prose text-[13px]"><span className="font-heading uppercase tracking-nav text-[10px] text-portal-muted">Company</span>&nbsp;&nbsp;{tenant?.businessName}</div>
              <div className="hx-prose text-[13px]"><span className="font-heading uppercase tracking-nav text-[10px] text-portal-muted">Contract</span>&nbsp;&nbsp;{contractNum}</div>
              <div className="hx-prose text-[13px]"><span className="font-heading uppercase tracking-nav text-[10px] text-portal-muted">Date</span>&nbsp;&nbsp;{format(new Date(), 'dd MMM yyyy')}</div>
            </div>

            <button onClick={handleSign} disabled={submitting || !agreed} className="hx-btn w-full disabled:opacity-40">
              {submitting ? 'Submitting…' : 'Sign & submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusScreen({ icon, title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-bone flex items-center justify-center px-4 font-body">
      <div className="text-center max-w-sm w-full">
        <div className="font-heading uppercase text-2xl tracking-[0.22em] text-ink mb-6">Hexa&nbsp;Space</div>
        <div className="bg-paper border border-ink/10 p-8 shadow-sm">
          {icon && <div className="text-4xl mb-4">{icon}</div>}
          <h1 className="font-display font-extralight text-2xl text-ink mb-2">{title}</h1>
          {subtitle && <p className="hx-prose text-[14px]">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}

