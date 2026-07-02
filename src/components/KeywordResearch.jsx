import { useState } from 'react'
import { ArrowLeft, Search, Loader2, Sparkles, Copy, Check, Tag, AlertCircle, Ban, Swords } from 'lucide-react'
import { generateKeywords } from '../lib/ads.js'

const INTENT = {
  high: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  low: 'bg-gray-100 text-gray-500 border-gray-200',
}

export default function KeywordResearch({ store, onBack }) {
  const { spaces = [], settings = {} } = store
  const vacant = spaces.filter((s) => s.status === 'vacant')
  const others = spaces.filter((s) => s.status !== 'vacant')

  const [spaceId, setSpaceId] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [copied, setCopied] = useState('')

  async function run() {
    setLoading(true); setError('')
    try {
      const space = spaces.find((s) => s.id === spaceId) ?? null
      setData(await generateKeywords({ platform: 'google', objective: 'leads', space, company: settings.company, audienceNotes: notes }))
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  function copy(key, text) {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 1500) })
  }
  const allKeywords = data ? [...data.groups.flatMap((g) => g.keywords), ...(data.longTail ?? [])].join('\n') : ''

  const input = 'w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-black mb-4"><ArrowLeft size={14} /> Back to campaigns</button>

      <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-5 text-xs text-blue-800 flex gap-2">
        <Search size={15} className="shrink-0 mt-0.5" />
        <div>AI-suggested keyword themes for Google Ads. Real search volumes &amp; competition will be added here once your Google Ads API access is live (Keyword Planner).</div>
      </div>

      {/* Controls */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-5 mb-5 max-w-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Space to research</label>
            <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className={input}>
              <option value="">— General / available spaces —</option>
              {vacant.length > 0 && <optgroup label="Vacant">{vacant.map((s) => <option key={s.id} value={s.id}>{s.unitNumber} — {s.address ?? s.type}</option>)}</optgroup>}
              {others.length > 0 && <optgroup label="Other">{others.map((s) => <option key={s.id} value={s.id}>{s.unitNumber} — {s.address ?? s.type} ({s.status})</option>)}</optgroup>}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Focus / seed (optional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. fulfilment, 3PL, cold storage" className={input} />
          </div>
        </div>
        <button onClick={run} disabled={loading}
          className="mt-4 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {data ? 'Regenerate' : 'Research keywords'}
        </button>
        {error && <div className="mt-3 bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-700 flex gap-2"><AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}</div>}
      </div>

      {/* Results */}
      {data && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => copy('all', allKeywords)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-black">
              {copied === 'all' ? <><Check size={12} /> Copied all</> : <><Copy size={12} /> Copy all keywords</>}
            </button>
          </div>

          {/* Ad-group themes */}
          <div className="grid md:grid-cols-2 gap-3">
            {data.groups.map((g, i) => (
              <div key={i} className="bg-card border border-border rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{g.name}</span>
                    {g.intent && <span className={`text-xs px-1.5 py-0.5 rounded border capitalize ${INTENT[g.intent?.toLowerCase()] ?? INTENT.low}`}>{g.intent} intent</span>}
                  </div>
                  <button onClick={() => copy(`g${i}`, g.keywords.join('\n'))} className="text-gray-300 hover:text-black">
                    {copied === `g${i}` ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
                {g.matchType && <div className="text-xs text-muted-foreground mb-2">Suggested match: <span className="font-medium text-muted-foreground capitalize">{g.matchType}</span></div>}
                <div className="flex flex-wrap gap-1.5">
                  {g.keywords.map((k, ki) => <span key={ki} className="text-xs px-2 py-0.5 rounded bg-muted/50 text-foreground border border-border flex items-center gap-1"><Tag size={10} /> {k}</span>)}
                </div>
              </div>
            ))}
          </div>

          {/* Long-tail */}
          {data.longTail?.length > 0 && (
            <Section title="Local long-tail queries" icon={Search}>
              <div className="flex flex-wrap gap-1.5">{data.longTail.map((k, i) => <span key={i} className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">{k}</span>)}</div>
            </Section>
          )}

          {/* Negatives */}
          {data.negativeIdeas?.length > 0 && (
            <Section title="Negative keyword ideas" icon={Ban}>
              <div className="flex flex-wrap gap-1.5">{data.negativeIdeas.map((k, i) => <span key={i} className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600">−{k}</span>)}</div>
            </Section>
          )}

          {/* Competitor angles */}
          {data.competitorAngles?.length > 0 && (
            <Section title="Competitor angles" icon={Swords}>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">{data.competitorAngles.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4">
      <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Icon size={13} /> {title}</h4>
      {children}
    </div>
  )
}
