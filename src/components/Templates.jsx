import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import RichTextEditor from './RichTextEditor.jsx'

const TEMPLATE_TYPES = [
  { value: 'terms', label: 'Terms & Conditions' },
  { value: 'house-rules', label: 'House Rules' },
  { value: 'privacy', label: 'Privacy Policy' },
  { value: 'whs', label: 'WHS Policy' },
  { value: 'other', label: 'Other' },
]

const TYPE_BADGE = {
  terms: 'bg-blue-50 text-blue-700 border-blue-200',
  'house-rules': 'bg-green-50 text-green-700 border-green-200',
  privacy: 'bg-purple-50 text-purple-700 border-purple-200',
  whs: 'bg-orange-50 text-orange-700 border-orange-200',
  other: 'bg-gray-100 text-gray-600 border-gray-200',
}

const EMPTY_FORM = { name: '', version: 'v1.0', type: 'terms', content: '' }

// Convert legacy clause-array templates to HTML (backward compat)
function clausesToHtml(clauses) {
  return clauses
    .map((c) => `<h3>${c.number}. ${c.title}</h3><p>${c.content}</p>`)
    .join('')
}

function getContent(template) {
  if (template?.content) return template.content
  if (template?.clauses?.length) return clausesToHtml(template.clauses)
  return ''
}

export default function Templates() {
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useOutletContext()
  const [mode, setMode] = useState('list') // 'list' | 'create' | 'edit'
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  function openNew() {
    setForm({ ...EMPTY_FORM })
    setEditingId(null)
    setMode('create')
  }

  function openEdit(template) {
    setForm({
      name: template.name,
      version: template.version,
      type: template.type,
      content: getContent(template),
    })
    setEditingId(template.id)
    setMode('edit')
  }

  function handleSave() {
    if (!form.name.trim()) return
    if (mode === 'edit' && editingId) {
      updateTemplate(editingId, { ...form })
    } else {
      addTemplate({ ...form })
    }
    setMode('list')
  }

  function handleDelete(id) {
    if (
      window.confirm(
        'Delete this template? Contracts that reference it will no longer include its content in PDF exports.'
      )
    ) {
      deleteTemplate(id)
    }
  }

  // ── Editor view ──────────────────────────────────────────────────────────
  if (mode === 'create' || mode === 'edit') {
    return (
      <div className="flex flex-col h-full bg-muted/50">
        {/* Header */}
        <div className="bg-card border-b border-border px-8 py-5 shrink-0">
          <h1 className="text-lg font-semibold text-foreground">
            {mode === 'edit' ? 'Edit Template' : 'New Template'}
          </h1>
          {mode === 'edit' && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Documents / {form.name} · {form.version}
            </p>
          )}
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {/* Title + version + type row — matches OfficeRND header row */}
          <div className="bg-card border border-border rounded-xl shadow-sm px-6 py-5 mb-4">
            <div className="grid grid-cols-4 gap-4 items-end">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Title *
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Terms and Conditions"
                  className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Type
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full border border-input rounded px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TEMPLATE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Version
                </label>
                <input
                  value={form.version}
                  onChange={(e) => setForm({ ...form, version: e.target.value })}
                  placeholder="v1.0"
                  className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Rich text editor */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/50">
              <span className="text-sm font-semibold text-foreground">Content</span>
              <span className="text-xs text-muted-foreground">
                Use headings for section titles, body text for clauses
              </span>
            </div>
            <RichTextEditor
              content={form.content}
              onChange={(html) => setForm((f) => ({ ...f, content: html }))}
              minHeight={420}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border bg-card px-8 py-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setMode('list')}
            className="px-5 py-2 text-sm font-medium text-foreground border border-input rounded hover:bg-muted/50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!form.name.trim()}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mode === 'edit' ? 'Save Changes' : 'Save as New Template'}
          </button>
          {mode === 'edit' && (
            <button
              type="button"
              onClick={() => {
                const updated = { ...form }
                updateTemplate(editingId, updated)
                setMode('list')
              }}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Update Current Template
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {templates.length} document template{templates.length !== 1 ? 's' : ''} · attached to
            contracts and included in PDF agreements
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={15} /> New Template
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {['Document Name', 'Type', 'Version', 'Last Updated', ''].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  No templates yet.{' '}
                  <button onClick={openNew} className="text-blue-600 hover:underline">
                    Create your first template
                  </button>
                </td>
              </tr>
            )}
            {templates.map((tmpl) => {
              const typeMeta = TEMPLATE_TYPES.find((t) => t.value === tmpl.type)
              return (
                <tr
                  key={tmpl.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer"
                  onClick={() => openEdit(tmpl)}
                >
                  <td className="px-4 py-3 font-medium text-foreground">{tmpl.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded border ${
                        TYPE_BADGE[tmpl.type] ?? TYPE_BADGE.other
                      }`}
                    >
                      {typeMeta?.label ?? tmpl.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{tmpl.version}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {tmpl.updatedAt ? format(parseISO(tmpl.updatedAt), 'dd/MM/yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        onClick={() => openEdit(tmpl)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(tmpl.id)}
                        className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
