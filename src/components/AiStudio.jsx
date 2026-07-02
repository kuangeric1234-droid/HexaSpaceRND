import { useState } from 'react'
import { Sparkles, Loader2, Copy, Check, RefreshCw, AlertCircle, Megaphone, Target, Search, Image as ImageIcon, Download, Save } from 'lucide-react'
import { generateMarketing } from '../lib/aiMarketing.js'
import { generateImage, saveImageToSanity } from '../lib/aiImage.js'

const MODES = [
  { key: 'post',  label: 'Social Post', icon: Megaphone, platforms: ['Instagram', 'LinkedIn', 'Facebook'] },
  { key: 'ad',    label: 'Ad Copy',     icon: Target,    platforms: ['Google', 'Meta', 'LinkedIn'] },
  { key: 'seo',   label: 'SEO',         icon: Search,    platforms: [] },
  { key: 'image', label: 'Image',       icon: ImageIcon, platforms: [] },
]
const TONES = ['professional', 'friendly', 'bold', 'minimal']
const SIZES = [
  { v: '1536x1024', label: 'Landscape (ad/web)' },
  { v: '1024x1024', label: 'Square (social)' },
  { v: '1024x1536', label: 'Portrait (story)' },
]

function suggestPrompt(space) {
  const subject = space ? `a ${space.type} unit (${space.size ?? ''})${space.attributes ? `, ${space.attributes}` : ''}` : 'a modern industrial warehouse unit'
  return `Professional architectural marketing photograph of ${subject}. Clean, modern industrial commercial space, natural daylight, wide-angle, photorealistic, high quality. No text, no logos, no watermarks, no people.`
}

export default function AiStudio({ store }) {
  const { spaces = [], settings = {}, updateSpace } = store
  const [kind, setKind] = useState('post')
  const mode = MODES.find((m) => m.key === kind)

  const [spaceId, setSpaceId] = useState('')
  const [platform, setPlatform] = useState('Instagram')
  const [tone, setTone] = useState('professional')
  const [count, setCount] = useState(3)
  const [notes, setNotes] = useState('')

  // image mode
  const [size, setSize] = useState('1536x1024')
  const [imgPrompt, setImgPrompt] = useState('')
  const [imgB64, setImgB64] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [output, setOutput] = useState('')
  const [copied, setCopied] = useState(false)

  const vacant = spaces.filter((s) => s.status === 'vacant')
  const others = spaces.filter((s) => s.status !== 'vacant')
  const space = spaces.find((s) => s.id === spaceId) ?? null

  function switchMode(k) {
    setKind(k)
    const m = MODES.find((x) => x.key === k)
    setPlatform(m.platforms[0] ?? '')
    setOutput(''); setError(''); setImgB64(''); setSaveMsg('')
    if (k === 'image') setImgPrompt(suggestPrompt(spaces.find((s) => s.id === spaceId) ?? null))
  }

  function onSpaceChange(id) {
    setSpaceId(id)
    if (kind === 'image') setImgPrompt(suggestPrompt(spaces.find((s) => s.id === id) ?? null))
  }

  async function handleGenerate() {
    setLoading(true); setError(''); setCopied(false); setSaveMsg('')
    try {
      if (kind === 'image') {
        setImgB64(await generateImage(imgPrompt || suggestPrompt(space), size))
      } else {
        setOutput(await generateMarketing({
          kind, platform: mode.platforms.length ? platform : undefined,
          tone, count, space, company: settings.company, notes,
        }))
      }
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  function copyOut() {
    navigator.clipboard.writeText(output).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }

  async function saveToUnit() {
    if (!space) return
    setSaving(true); setSaveMsg('')
    try {
      const { assetId, url } = await saveImageToSanity(imgB64, `${space.unitNumber}-ai.png`)
      updateSpace(space.id, { photos: [...(space.photos ?? []), { assetId, url, alt: `${space.unitNumber} marketing image` }] })
      setSaveMsg(`Added to ${space.unitNumber}. Publish/Update it on the Listings tab to push it live.`)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  function downloadImg() {
    const a = document.createElement('a')
    a.href = `data:image/png;base64,${imgB64}`
    a.download = `${space?.unitNumber ?? 'hexaspace'}-ai.png`
    a.click()
  }

  const input = 'w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Controls */}
      <div>
        <div className="flex gap-1 bg-muted rounded-md p-0.5 mb-5">
          {MODES.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => switchMode(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-sm font-medium rounded transition-colors ${
                kind === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Space {kind === 'image' ? '(for "save to listing")' : '(optional)'}</label>
            <select value={spaceId} onChange={(e) => onSpaceChange(e.target.value)} className={input}>
              <option value="">— General / brand —</option>
              {vacant.length > 0 && <optgroup label="Vacant">{vacant.map((s) => <option key={s.id} value={s.id}>{s.unitNumber} — {s.address ?? s.type}</option>)}</optgroup>}
              {others.length > 0 && <optgroup label="Other">{others.map((s) => <option key={s.id} value={s.id}>{s.unitNumber} — {s.address ?? s.type} ({s.status})</option>)}</optgroup>}
            </select>
          </div>

          {kind === 'image' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Size</label>
                <select value={size} onChange={(e) => setSize(e.target.value)} className={input}>
                  {SIZES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Image prompt</label>
                <textarea value={imgPrompt} rows={5} onChange={(e) => setImgPrompt(e.target.value)}
                  placeholder="Describe the image…" className={`${input} resize-none`} />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                {mode.platforms.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Platform</label>
                    <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={input}>
                      {mode.platforms.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Tone</label>
                  <select value={tone} onChange={(e) => setTone(e.target.value)} className={`${input} capitalize`}>
                    {TONES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                </div>
                {kind !== 'seo' && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Variations</label>
                    <input type="number" min={1} max={6} value={count} onChange={(e) => setCount(e.target.value)} className={input} />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Extra direction (optional)</label>
                <textarea value={notes} rows={3} onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. emphasise 24/7 access and proximity to the freeway" className={`${input} resize-none`} />
              </div>
            </>
          )}

          <button onClick={handleGenerate} disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loading ? 'Generating…' : (output || imgB64) ? 'Regenerate' : 'Generate'}
          </button>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-700 flex gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>
      </div>

      {/* Output */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Output</span>
          {kind !== 'image' && output && (
            <button onClick={copyOut} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-black">
              {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
          )}
        </div>

        {kind === 'image' ? (
          <div>
            <div className="bg-card border border-border rounded-xl shadow-sm p-3 min-h-[320px] flex items-center justify-center">
              {imgB64 ? (
                <img src={`data:image/png;base64,${imgB64}`} alt="Generated" className="max-h-[420px] w-full object-contain rounded" />
              ) : (
                <div className="text-center text-gray-300 py-16">
                  <ImageIcon size={26} className="mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Generated images appear here.</p>
                </div>
              )}
            </div>
            {imgB64 && (
              <div className="flex items-center gap-3 mt-3">
                <button onClick={saveToUnit} disabled={!space || saving}
                  className="flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground px-3 py-2 rounded-md hover:bg-primary/90 disabled:opacity-40">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save to {space ? space.unitNumber : 'unit'} photos
                </button>
                <button onClick={downloadImg} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-black">
                  <Download size={14} /> Download
                </button>
              </div>
            )}
            {!space && imgB64 && <p className="text-xs text-muted-foreground mt-2">Pick a space above to save this to its listing.</p>}
            {saveMsg && <p className="text-xs text-green-700 mt-2">{saveMsg}</p>}
          </div>
        ) : (
          <>
            <div className="bg-card border border-border rounded-xl shadow-sm p-4 min-h-[320px] text-sm text-foreground whitespace-pre-wrap">
              {output ? output : (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-300 py-16">
                  <Sparkles size={26} className="mb-2" />
                  <p className="text-sm text-muted-foreground">Pick a space and hit Generate.<br />Posts, ads and SEO copy appear here.</p>
                </div>
              )}
            </div>
            {output && (
              <button onClick={handleGenerate} disabled={loading} className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-black">
                <RefreshCw size={12} /> Generate another set
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
