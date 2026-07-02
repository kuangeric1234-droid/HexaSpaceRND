import { useEffect, useState } from 'react'
import { Link2, Copy, Check, DollarSign, Users, Award, Clock } from 'lucide-react'

const SITE = 'https://www.hexaspace.com.au'
const money = (n) => `$${Number(n || 0).toLocaleString('en-AU')}`

const STAGE_TONE = { new: 'bg-gray-100 text-gray-600', engaged: 'bg-blue-50 text-blue-700', won: 'bg-green-50 text-green-700', lost: 'bg-red-50 text-red-500' }
const COMM_TONE = { pending: 'bg-amber-50 text-amber-700 border border-amber-200', approved: 'bg-blue-50 text-blue-700 border border-blue-200', paid: 'bg-green-50 text-green-700 border border-green-200' }

export default function ReferrerDashboard({ token }) {
  const [state, setState] = useState('loading') // loading | ready | invalid | error
  const [data, setData] = useState(null)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/referrer-dashboard?token=${encodeURIComponent(token)}`)
        if (res.status === 404) { setState('invalid'); return }
        if (!res.ok) { setState('error'); return }
        setData(await res.json())
        setState('ready')
      } catch { setState('error') }
    }
    load()
  }, [token])

  function copy(key, text) {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 1500) })
  }

  if (state === 'loading') {
    return <Shell><p className="text-sm text-muted-foreground">Loading your dashboard…</p></Shell>
  }
  if (state === 'invalid') {
    return <Shell><p className="text-sm text-muted-foreground">This referral link is not valid. Please check the link or contact Hexa Space.</p></Shell>
  }
  if (state === 'error') {
    return <Shell><p className="text-sm text-muted-foreground">Something went wrong loading your dashboard. Please try again shortly.</p></Shell>
  }

  const { referrer, leads, commissions, totals } = data
  const tenantLink = `${SITE}/?ref=${referrer.code}`
  const sellerLink = `${SITE}/list-your-property?ref=${referrer.code}&intent=list`

  return (
    <Shell wide>
      <div className="mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1">Referral dashboard</p>
        <h1 className="text-2xl font-bold text-foreground">Welcome, {referrer.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your code <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{referrer.code}</span> · {referrer.commissionRate}% commission
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat icon={Users} label="Referrals" value={totals.leads} />
        <Stat icon={Award} label="Deals won" value={totals.won} />
        <Stat icon={Clock} label="Pending payout" value={money(totals.pending)} />
        <Stat icon={DollarSign} label="Paid to you" value={money(totals.paid)} />
      </div>

      {/* Share links */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3"><Link2 size={15} /> Your share links</h2>
        <div className="space-y-3">
          <LinkRow label="Refer someone looking to lease or buy" url={tenantLink} copied={copied === 't'} onCopy={() => copy('t', tenantLink)} />
          <LinkRow label="Refer a seller / landlord (list a property)" url={sellerLink} copied={copied === 's'} onCopy={() => copy('s', sellerLink)} />
        </div>
      </div>

      {/* Referred leads */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">Your referrals</h2>
        {leads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No referrals yet — share your link to get started.</p>
        ) : (
          <div className="divide-y divide-border">
            {leads.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="text-foreground">{l.label}</span>
                  <span className="text-xs text-muted-foreground ml-2">{l.intent === 'list' ? 'seller' : 'tenant/buyer'}{l.createdAt ? ` · ${l.createdAt}` : ''}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${STAGE_TONE[l.stageCategory] ?? 'bg-muted text-muted-foreground'}`}>{l.stageName}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Commissions */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Your commissions</h2>
        {commissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No commissions yet. When a referred deal closes, it appears here.</p>
        ) : (
          <div className="divide-y divide-border">
            {commissions.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="text-foreground">{c.leadName || '—'}</span>
                  <span className="text-xs text-muted-foreground ml-2">{money(c.dealValue)} {c.dealType} · {c.rate}%</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-semibold text-foreground">{money(c.amount)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded capitalize ${COMM_TONE[c.status] ?? ''}`}>{c.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-8">Hexa Space · build locally, scale sustainably</p>
    </Shell>
  )
}

function Shell({ children, wide }) {
  return (
    <div className="min-h-screen bg-muted/50">
      <div className="bg-black">
        <div className={`mx-auto ${wide ? 'max-w-3xl' : 'max-w-md'} px-6 py-4`}>
          <span className="text-white font-black tracking-widest">HEXA SPACE</span>
        </div>
      </div>
      <div className={`mx-auto ${wide ? 'max-w-3xl' : 'max-w-md'} px-6 py-8`}>{children}</div>
    </div>
  )
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm px-4 py-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1"><Icon size={12} /> {label}</div>
      <div className="text-xl font-bold text-foreground mt-0.5">{value}</div>
    </div>
  )
}

function LinkRow({ label, url, copied, onCopy }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <input readOnly value={url} className="flex-1 border border-input rounded px-2 py-1.5 text-xs font-mono text-foreground bg-muted/50" />
        <button onClick={onCopy} className="flex items-center gap-1 text-xs font-medium border border-input text-foreground px-2.5 py-1.5 rounded hover:bg-muted/50">
          {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>
    </div>
  )
}
