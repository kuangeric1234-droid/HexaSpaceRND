import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Printer, FileText } from 'lucide-react'
import { usePrintAccount } from './usePrintPin.js'
import { authHeaders } from '../lib/apiFetch.js'
import { Page, PageHeader, Card, Eyebrow, Empty } from './ui.jsx'

// Printing — the member's own print account in one place: PaperCut Hexa-Secure
// PIN, live printing balance, and their print-job history with each job's cost
// coming off the balance. PIN/balance/jobs all come from JWT-verified,
// owner-only endpoints (print-pin, print-jobs) — never the shared member data.
// Device setup lives in Guides → Printer Setup.

const money = (n) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`
const dmyt = (ts) => {
  const d = new Date(ts)
  return `${d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '')}`
}

export default function PortalPrinting({ member }) {
  const account = usePrintAccount()
  const [jobs, setJobs] = useState(null) // null = loading
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/portal/print-jobs', { headers: await authHeaders() })
        const d = res.ok ? await res.json() : null
        if (alive) setJobs(d?.jobs ?? [])
      } catch { if (alive) setJobs([]) }
    })()
    return () => { alive = false }
  }, [])

  // Running balance, reconstructed backwards from the current balance. Only
  // meaningful within the current month — the $30 allowance reset at month
  // start breaks the chain for older jobs, so those just show their cost.
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const withBalance = (() => {
    if (!jobs) return []
    let bal = account.balance
    return jobs.map((j) => {
      const inMonth = j.ts && new Date(j.ts) >= monthStart
      const canChain = bal != null && inMonth && j.cost != null
      const after = canChain ? bal : null
      if (canChain) bal = Math.round((bal + j.cost) * 100) / 100 // going back in time, the balance was higher
      return { ...j, balanceAfter: after }
    })
  })()

  return (
    <Page>
      <PageHeader kicker="Printing · Box Hill" title="Printing">
        Your print account, balance and activity. Device setup lives in{' '}
        <Link to="/guides" className="text-hexa-green">Guides → Printer Setup</Link>.
      </PageHeader>

      <PrintAccount member={member} account={account} />

      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <Eyebrow>Print activity</Eyebrow>
          {jobs && jobs.length > 0 && <span className="hx-prose text-[12px]">{jobs.length} job{jobs.length === 1 ? '' : 's'} · updated with the daily sync</span>}
        </div>

        {jobs === null ? (
          <Card className="p-6"><p className="hx-prose text-[13px]">Loading your print jobs…</p></Card>
        ) : jobs.length === 0 ? (
          <Empty label="No print jobs yet — your activity appears here after your first print." />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-ink/10">
                  {['When', 'Document', 'Printer', 'Pages', 'Cost', 'Balance after'].map((h) => (
                    <th key={h} className="hx-eyebrow px-5 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {withBalance.map((j) => (
                  <tr key={j.id}>
                    <td className="px-5 py-3.5 hx-prose text-[13px] whitespace-nowrap">{j.ts ? dmyt(j.ts) : '—'}</td>
                    <td className="px-5 py-3.5 max-w-[260px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={13} className="text-portal-muted shrink-0" />
                        <span className="font-heading uppercase tracking-nav text-[11px] text-ink truncate">{j.document || 'Print job'}</span>
                      </div>
                      {(j.grayscale != null || j.duplex != null) && (
                        <div className="hx-prose text-[11px] mt-0.5">{[j.grayscale ? 'Greyscale' : 'Colour', j.duplex ? 'double-sided' : null].filter(Boolean).join(' · ')}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 hx-prose text-[13px] whitespace-nowrap">{j.printer || '—'}</td>
                    <td className="px-5 py-3.5 hx-prose text-[13px] whitespace-nowrap">{j.pages ?? '—'}{j.copies > 1 ? ` × ${j.copies}` : ''}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap font-heading uppercase tracking-nav text-[11px] text-ink">{j.cost != null ? money(-Math.abs(j.cost)) : '—'}</td>
                    <td className={`px-5 py-3.5 whitespace-nowrap font-heading uppercase tracking-nav text-[11px] ${j.balanceAfter == null ? 'text-portal-muted' : j.balanceAfter < 0 ? 'text-amber-700' : 'text-hexa-green'}`}>
                      {j.balanceAfter != null ? money(j.balanceAfter) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <p className="hx-prose text-[12px] mt-4">
          Each month starts with a $30 print allowance. Printing past it shows as a negative balance and is billed on your next invoice.
          Balance-after is shown for this month's jobs; jobs before the monthly reset show their cost only.
        </p>
      </div>
    </Page>
  )
}

// The member's OWN print account: PaperCut Hexa-Secure PIN, live printing
// balance and sign-in details — all from the owner-scoped endpoint.
function PrintAccount({ member, account }) {
  const { pin, balance, balanceUpdatedAt } = account
  const owing = balance != null && balance < 0
  const asAt = balanceUpdatedAt
    ? new Date(balanceUpdatedAt).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  return (
    <div className="bg-charcoal text-paper p-7">
      <div className="flex items-center justify-between">
        <span className="font-heading uppercase tracking-label text-[11px] text-paper/50">Your print account</span>
        <Printer size={16} strokeWidth={1.4} className="text-paper/40" />
      </div>
      <p className="font-display font-extralight text-2xl mt-3">PaperCut · Hexa-Secure</p>

      {(pin || balance != null) && (
        <div className="grid sm:grid-cols-2 gap-px bg-paper/15 mt-5 border border-paper/20">
          {pin && (
            <div className="bg-charcoal px-5 py-4 flex items-end justify-between gap-4">
              <div>
                <span className="block font-heading uppercase tracking-label text-[10px] text-paper/50">Your print PIN</span>
                <span className="block hx-prose text-[11px] text-paper/40 mt-1">Type at the keypad, or tap your pass</span>
              </div>
              <span className="font-mono text-3xl tracking-[0.3em] text-hexa-green leading-none shrink-0">{pin}</span>
            </div>
          )}
          {balance != null && (
            <div className="bg-charcoal px-5 py-4 flex items-end justify-between gap-4">
              <div>
                <span className="block font-heading uppercase tracking-label text-[10px] text-paper/50">Printing balance</span>
                <span className="block hx-prose text-[11px] text-paper/40 mt-1">
                  {owing ? 'Above allowance — billed on your next invoice' : 'Monthly allowance remaining'}{asAt ? ` · as at ${asAt}` : ''}
                </span>
              </div>
              <span className={`font-display font-extralight text-3xl leading-none shrink-0 ${owing ? 'text-amber-400' : 'text-hexa-green'}`}>{money(balance)}</span>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-paper/15 my-5" />
      <div className="grid sm:grid-cols-2 gap-x-10 gap-y-2">
        <PrintKV k="Sign-in" v={member?.email || 'your member email'} />
        <PrintKV k="Queue" v="Hexa-Secure" />
        <PrintKV k="Portal" v={<a href="http://172.16.200.14:9191/app" target="_blank" rel="noreferrer" className="text-hexa-green">172.16.200.14:9191/app</a>} />
        <PrintKV k="Release" v="Tap your access pass at any printer" />
      </div>
    </div>
  )
}

function PrintKV({ k, v }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="hx-prose text-[12px] text-paper/50">{k}</span>
      <span className="font-body text-[13px] text-paper text-right break-all">{v}</span>
    </div>
  )
}
