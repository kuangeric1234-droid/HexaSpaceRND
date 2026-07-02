import { useState, useEffect, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { Upload, FileDown, Trash2, File, FileText, Image } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const MAX_SIZE_MB = 5

function fileIcon(name) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return Image
  if (['pdf'].includes(ext)) return FileText
  return File
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function DocumentsPanel({ tenantId, leaseId, title = 'Documents' }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  const scopeKey = leaseId ? `leaseId:${leaseId}` : `tenantId:${tenantId}`

  useEffect(() => {
    load()
  }, [tenantId, leaseId]) // eslint-disable-line

  async function load() {
    setLoading(true)
    let query = supabase.from('documents').select('id, data')
    if (leaseId) query = query.eq('data->>leaseId', leaseId)
    else if (tenantId) query = query.eq('data->>tenantId', tenantId)
    const { data } = await query.order('updated_at', { ascending: false })
    setDocs((data ?? []).map((r) => ({ id: r.id, ...r.data })))
    setLoading(false)
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`File too large. Maximum size is ${MAX_SIZE_MB} MB.`)
      return
    }
    setUploading(true)
    try {
      const base64 = await fileToBase64(file)
      const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const doc = {
        id, tenantId: tenantId ?? null, leaseId: leaseId ?? null,
        name: file.name, size: file.size, mimeType: file.type,
        content: base64,
        uploadedAt: new Date().toISOString(),
      }
      await supabase.from('documents').insert({ id, data: doc })
      setDocs((prev) => [doc, ...prev])
    } catch (err) {
      alert(`Upload failed: ${err.message}`)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleDelete(doc) {
    if (!window.confirm(`Delete "${doc.name}"?`)) return
    await supabase.from('documents').delete().eq('id', doc.id)
    setDocs((prev) => prev.filter((d) => d.id !== doc.id))
  }

  function handleDownload(doc) {
    const a = document.createElement('a')
    a.href = doc.content
    a.download = doc.name
    a.click()
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Max {MAX_SIZE_MB} MB per file</span>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50"
          >
            <Upload size={12} /> {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <input ref={inputRef} type="file" className="hidden" onChange={handleUpload}
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.xlsx,.csv,.txt" />
        </div>
      </div>

      {loading ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="px-5 py-5 text-sm text-muted-foreground">No documents uploaded yet. Click Upload to add files.</p>
      ) : (
        <ul className="divide-y divide-border">
          {docs.map((doc) => {
            const Icon = fileIcon(doc.name)
            return (
              <li key={doc.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50">
                <Icon size={16} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtSize(doc.size)} · {doc.uploadedAt ? format(parseISO(doc.uploadedAt), 'dd/MM/yyyy HH:mm') : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleDownload(doc)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Download">
                    <FileDown size={14} />
                  </button>
                  <button onClick={() => handleDelete(doc)}
                    className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
