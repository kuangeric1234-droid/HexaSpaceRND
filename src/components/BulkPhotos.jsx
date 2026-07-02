import { useState } from 'react'
import { X, Upload, Loader2, Check, Trash2, Images, AlertCircle } from 'lucide-react'
import { uploadListingImage, publishListing } from '../lib/sanity.js'

export default function BulkPhotos({ store, onClose }) {
  const { spaces = [], updateSpace } = store
  const types = [...new Set(spaces.map((s) => s.type))]

  const [typeFilter, setTypeFilter] = useState(types[0] ?? 'warehouse')
  const matching = spaces.filter((s) => s.type === typeFilter)
  const [selected, setSelected] = useState(() => new Set(matching.map((s) => s.id)))
  const [photos, setPhotos] = useState([])      // [{ assetId, url, alt }]
  const [mode, setMode] = useState('replace')   // replace | append
  const [uploading, setUploading] = useState(false)
  const [applying, setApplying] = useState(null) // { done, total }
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  function pickType(t) {
    setTypeFilter(t)
    setSelected(new Set(spaces.filter((s) => s.type === t).map((s) => s.id)))
  }
  function toggle(id) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function onFiles(e) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    setUploading(true); setError('')
    try {
      for (const file of files) {
        const { assetId, url } = await uploadListingImage(file)
        setPhotos((p) => [...p, { assetId, url, alt: '' }])
      }
    } catch (err) { setError(err.message) } finally { setUploading(false) }
  }

  async function apply() {
    const ids = [...selected]
    if (!ids.length || !photos.length) return
    setApplying({ done: 0, total: ids.length }); setError('')
    let d = 0
    for (const id of ids) {
      const space = spaces.find((s) => s.id === id)
      if (!space) { d++; continue }
      const merged = mode === 'append' ? [...(space.photos ?? []), ...photos] : photos
      try {
        updateSpace(id, { photos: merged, publishedToWeb: true, webSyncedAt: new Date().toISOString() })
        await publishListing({ ...space, photos: merged })
      } catch (err) { setError(`${space.unitNumber}: ${err.message}`) }
      d++; setApplying({ done: d, total: ids.length })
    }
    setApplying(null); setDone({ units: ids.length, photos: photos.length })
  }

  const input = 'w-full border border-input rounded px-3 py-2 text-sm'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground flex items-center gap-2"><Images size={16} /> Bulk add photos</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="p-6 overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4 text-xs text-red-700 flex gap-2"><AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}</div>}

          {done ? (
            <div className="text-center py-10">
              <Check size={30} className="mx-auto text-green-500 mb-3" />
              <p className="text-sm text-foreground font-medium">Added {done.photos} photo{done.photos === 1 ? '' : 's'} to {done.units} unit{done.units === 1 ? '' : 's'}.</p>
              <p className="text-xs text-muted-foreground mt-2">They're published — the website listings update within ~60s.</p>
              <button onClick={onClose} className="mt-5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium">Done</button>
            </div>
          ) : (
            <>
              {/* 1. Units */}
              <section className="mb-5">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">1. Units to update</h3>
                <div className="flex gap-1 bg-muted rounded-md p-0.5 mb-3 w-max">
                  {types.map((t) => (
                    <button key={t} onClick={() => pickType(t)}
                      className={`px-3 py-1.5 text-sm font-medium rounded capitalize ${typeFilter === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t}</button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {matching.map((s) => (
                    <button key={s.id} onClick={() => toggle(s.id)}
                      className={`text-xs px-2 py-1 rounded border ${selected.has(s.id) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border'}`}>
                      {s.unitNumber}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">{selected.size} of {matching.length} selected</p>
              </section>

              {/* 2. Photos */}
              <section className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">2. Photos for these units</h3>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-primary-foreground bg-primary px-3 py-1.5 rounded-md cursor-pointer hover:bg-primary/90">
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {uploading ? 'Uploading…' : 'Upload images'}
                    <input type="file" accept="image/*" multiple onChange={onFiles} disabled={uploading} className="hidden" />
                  </label>
                </div>
                {photos.length === 0 ? (
                  <div className="border border-dashed border-border rounded-md p-6 text-center text-xs text-muted-foreground">No photos uploaded yet.</div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {photos.map((p, i) => (
                      <div key={p.assetId} className="relative border border-border rounded-md overflow-hidden group">
                        <img src={p.url} alt="" className="w-full h-20 object-cover" />
                        <button onClick={() => setPhotos((arr) => arr.filter((_, idx) => idx !== i))}
                          className="absolute top-1 right-1 bg-white/90 rounded p-0.5 text-muted-foreground hover:text-red-600"><Trash2 size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 3. Mode + apply */}
              <section className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <select value={mode} onChange={(e) => setMode(e.target.value)} className={input.replace('w-full', 'w-auto')}>
                    <option value="replace">Replace existing photos</option>
                    <option value="append">Add to existing photos</option>
                  </select>
                </label>
                <button onClick={apply} disabled={!!applying || !selected.size || !photos.length}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
                  {applying ? <Loader2 size={15} className="animate-spin" /> : <Images size={15} />}
                  {applying ? `Applying ${applying.done}/${applying.total}…` : `Apply to ${selected.size} unit${selected.size === 1 ? '' : 's'}`}
                </button>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
