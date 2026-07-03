import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase.js'
import { sendEmail } from '../lib/sendEmail.js'
import SignatureCanvas from './SignatureCanvas.jsx'
import ContractTemplate from './ContractTemplate.jsx'

export default function SignPage({ token }) {
  const [state, setState] = useState('loading') // loading|ready|tenant_signed|fully_signed|invalid|error
  const [request, setRequest] = useState(null)
  const [lease, setLease] = useState(null)
  const [tenant, setTenant] = useState(null)
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

  useEffect(() => {
    async function load() {
      try {
        const { data: req, error } = await supabase
          .from('esign_requests').select('*').eq('token', token).single()

        if (error || !req) { setState('invalid'); return }

        setRequest(req)
        if (req.status === 'fully_signed') { setState('fully_signed'); return }
        if (req.status === 'tenant_signed') { setState('tenant_signed'); return }

        const [{ data: leaseRows }, { data: settRows }] = await Promise.all([
          supabase.from('leases').select('data').eq('id', req.lease_id),
          supabase.from('settings').select('data').eq('id', 'global'),
        ])

        const leaseData = leaseRows?.[0]?.data
        if (!leaseData) { setState('invalid'); return }
        setLease(leaseData)
        setSettings(settRows?.[0]?.data ?? null)

        const [{ data: tenantRows }, { data: spaceRows }, { data: tmplRows }] = await Promise.all([
          supabase.from('tenants').select('data').eq('id', leaseData.tenantId),
          supabase.from('spaces').select('data').eq('id', leaseData.spaceId),
          supabase.from('templates').select('id,data'),
        ])
        setTenant(tenantRows?.[0]?.data ?? null)
        setSpace(spaceRows?.[0]?.data ?? null)
        if (tenantRows?.[0]?.data?.contactName) setSignerName(tenantRows[0].data.contactName)

        const allTemplates = (tmplRows ?? []).map((r) => ({ id: r.id, ...r.data }))
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
      const now = new Date().toISOString()

      await supabase.from('esign_requests').update({
        status: 'tenant_signed',
        licensee_signature_data: signatureData,
        licensee_signer_name: signerName,
        licensee_signed_at: now,
        licensee_title: signerTitle,
        licensee_date: signerDate,
      }).eq('token', token)

      // Update lease to show it's waiting for countersignature
      await supabase.from('leases').update({
        data: { ...lease, signatureStatus: 'out_for_signature', tenantSignedAt: now, tenantSignerName: signerName },
      }).eq('id', request.lease_id)

      const companyName = settings?.company?.name ?? 'Hexa Space'
      const contractNum = lease.contractNumber ?? `CON-${lease.id?.slice(-3).toUpperCase()}`
      const portalUrl = settings?.portalUrl || `https://portal.hexaspace.com.au`

      // Notify admins to countersign (both eric@ and info@ + any configured address)
      const adminList = [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))]
      if (adminList.length) {
        await sendEmail({
          to: adminList,
          subject: `Action required: ${tenant?.businessName ?? 'Tenant'} has signed ${contractNum}`,
          html: adminCountersignHtml({ tenant, settings, signerName, contractNum, now, portalUrl }),
          settings,
        }).catch(() => {})
      }

      // Confirm to tenant
      if (tenant?.email) {
        await sendEmail({
          to: tenant.email,
          subject: `Signature received — ${contractNum}`,
          html: tenantConfirmHtml({ tenant, settings, signerName, contractNum, now, companyName }),
          settings,
        }).catch(() => {})
      }

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

  if (state === 'tenant_signed') return (
    <StatusScreen
      icon="✅"
      title="Signature received"
      subtitle={`Thank you${request?.licensee_signer_name ? `, ${request.licensee_signer_name}` : ''}. Your signature has been received. Hexa Space will countersign and send you a copy shortly.`}
    />
  )

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
            <ContractTemplate lease={lease} tenant={tenant} space={space} settings={settings} />
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

function StatusScreen({ icon, title, subtitle }) {
  return (
    <div className="min-h-screen bg-bone flex items-center justify-center px-4 font-body">
      <div className="text-center max-w-sm w-full">
        <div className="font-heading uppercase text-2xl tracking-[0.22em] text-ink mb-6">Hexa&nbsp;Space</div>
        <div className="bg-paper border border-ink/10 p-8 shadow-sm">
          {icon && <div className="text-4xl mb-4">{icon}</div>}
          <h1 className="font-display font-extralight text-2xl text-ink mb-2">{title}</h1>
          {subtitle && <p className="hx-prose text-[14px]">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

function adminCountersignHtml({ tenant, settings, signerName, contractNum, now, portalUrl }) {
  const company = settings?.company?.name ?? 'Hexa Space'
  const date = format(parseISO(now), 'dd MMM yyyy, h:mm a')
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1a1a1a;background:#f5f5f5;margin:0;padding:0">
  <div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
    <div style="background:#000;padding:20px 32px"><span style="color:#fff;font-size:18px;font-weight:bold;letter-spacing:2px">${company.toUpperCase()}</span></div>
    <div style="padding:32px">
      <h2 style="margin:0 0 12px;font-size:16px">Action required: Countersign contract 🖊</h2>
      <p style="color:#555;font-size:14px;margin:0 0 20px"><strong>${tenant?.businessName ?? 'A tenant'}</strong> has signed <strong>${contractNum}</strong>. Please log in to the portal to review and countersign.</p>
      <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:4px;padding:16px;font-size:13px;color:#555;margin-bottom:20px">
        <div><strong>Signed by:</strong> ${signerName}</div>
        <div><strong>Date:</strong> ${date}</div>
        <div><strong>Contract:</strong> ${contractNum}</div>
      </div>
      <a href="${portalUrl}" style="background:#000;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block">Open Portal to Countersign →</a>
    </div>
  </div></body></html>`
}

function tenantConfirmHtml({ tenant, settings, signerName, contractNum, companyName }) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1a1a1a;background:#f5f5f5;margin:0;padding:0">
  <div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
    <div style="background:#000;padding:20px 32px"><span style="color:#fff;font-size:18px;font-weight:bold;letter-spacing:2px">${companyName.toUpperCase()}</span></div>
    <div style="padding:32px">
      <h2 style="margin:0 0 12px;font-size:16px">Signature received ✅</h2>
      <p style="color:#555;font-size:14px;margin:0 0 16px">Hi ${tenant?.contactName ?? ''},</p>
      <p style="color:#555;font-size:14px;margin:0 0 16px">Your signature for <strong>${contractNum}</strong> has been received. ${companyName} will countersign and send you a fully executed copy shortly.</p>
      <p style="font-size:12px;color:#888;margin-top:24px">If you have any questions, please contact us directly.</p>
    </div>
  </div></body></html>`
}
