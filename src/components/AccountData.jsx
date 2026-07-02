import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, RefreshCw, Loader2, AlertCircle, BarChart2, Info, ChevronDown, ChevronRight } from 'lucide-react'
import { googleAdsReport } from '../lib/googleAds.js'

const REPORTS = [
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'ad_groups', label: 'Ad groups' },
  { key: 'keywords', label: 'Keywords' },
  { key: 'search_terms', label: 'Search terms' },
]
const RANGES = [
  { v: 'LAST_7_DAYS', label: 'Last 7 days' },
  { v: 'LAST_30_DAYS', label: 'Last 30 days' },
  { v: 'LAST_MONTH', label: 'Last month' },
]
const $ = (v) => '$' + Number(v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (v) => Number(v || 0).toLocaleString('en-AU')

export default function AccountData({ store, onBack }) {
  const { settings = {} } = store
  const ga = settings.googleAds ?? {}
  const [reportType, setReportType] = useState('campaigns')
  const [dateRange, setDateRange] = useState('LAST_30_DAYS')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [guide, setGuide] = useState(false)

  const load = useCallback(async () => {
    if (!ga.customerId) { setError('Set your Customer ID in the Ads connection bar first.'); return }
    setLoading(true); setError('')
    try {
      const r = await googleAdsReport({ reportType, customerId: ga.customerId, loginCustomerId: ga.loginCustomerId, dateRange })
      setRows(r.rows ?? [])
    } catch (e) { setError(e.message); setRows([]) } finally { setLoading(false) }
  }, [reportType, dateRange, ga.customerId, ga.loginCustomerId])

  useEffect(() => { load() }, [load])

  const totals = rows.reduce((t, r) => ({
    cost: t.cost + (r.cost || 0), clicks: t.clicks + (r.clicks || 0),
    impressions: t.impressions + (r.impressions || 0), conversions: t.conversions + (r.conversions || 0),
  }), { cost: 0, clicks: 0, impressions: 0, conversions: 0 })

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft size={14} /> Back to campaigns</button>

      {/* Conversion tracking checklist */}
      <div className="bg-amber-50 border border-amber-200 rounded-md mb-5 text-xs text-amber-900">
        <button onClick={() => setGuide(!guide)} className="w-full flex items-center gap-2 p-3 text-left">
          {guide ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Info size={14} /> <span className="font-medium">Conversion tracking — set this up first, or Conv/CPA stay at 0</span>
        </button>
        {guide && (
          <div className="px-9 pb-3 space-y-1 leading-relaxed">
            <p>Optimization is blind without conversion tracking. In Google Ads → Goals → Conversions, create conversion actions for:</p>
            <ul className="list-disc list-inside ml-1">
              <li><strong>Enquiry submit</strong> — fire on your website's enquiry "thank you" (Google tag / GA4 import)</li>
              <li><strong>Phone calls</strong> — from ads and from the website number</li>
              <li><strong>Book a tour</strong> — fire on the tour-request success</li>
            </ul>
            <p>Then primary-goal them so Smart Bidding optimizes to leases, not clicks.</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          {REPORTS.map((r) => (
            <button key={r.key} onClick={() => setReportType(r.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${reportType === r.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="border border-input rounded px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
          {RANGES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
        </select>
        <button onClick={load} disabled={loading} className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4 text-xs text-red-700 flex gap-2"><AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}</div>}

      {/* Totals */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="Cost" value={$(totals.cost)} />
          <Stat label="Clicks" value={num(totals.clicks)} />
          <Stat label="Impressions" value={num(totals.impressions)} />
          <Stat label="Conversions" value={num(Math.round(totals.conversions * 10) / 10)} />
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground text-sm"><Loader2 size={18} className="animate-spin mx-auto mb-2" /> Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <BarChart2 size={24} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm">{error ? 'Could not load data.' : 'No data for this report / date range yet.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="px-4 py-2.5 font-medium">{REPORTS.find((r) => r.key === reportType)?.label.replace(/s$/, '')}</th>
                  <th className="px-4 py-2.5 font-medium text-right">Impr</th>
                  <th className="px-4 py-2.5 font-medium text-right">Clicks</th>
                  <th className="px-4 py-2.5 font-medium text-right">CTR</th>
                  <th className="px-4 py-2.5 font-medium text-right">Avg CPC</th>
                  <th className="px-4 py-2.5 font-medium text-right">Cost</th>
                  <th className="px-4 py-2.5 font-medium text-right">Conv</th>
                  <th className="px-4 py-2.5 font-medium text-right">CPA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/50">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-foreground">{r.name || '—'}</div>
                      {(r.campaign || r.matchType || r.status) && (
                        <div className="text-xs text-muted-foreground">{[r.campaign, r.matchType, r.status].filter(Boolean).join(' · ')}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{num(r.impressions)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{num(r.clicks)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{r.ctr != null ? `${r.ctr}%` : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{r.avgCpc ? $(r.avgCpc) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-foreground">{$(r.cost)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{r.conversions ?? 0}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{r.costPerConv ? $(r.costPerConv) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold text-foreground mt-0.5">{value}</div>
    </div>
  )
}
