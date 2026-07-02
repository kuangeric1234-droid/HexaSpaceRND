import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Plus, Pencil, Trash2, FileText, Mail } from 'lucide-react'
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

// Email templates — each has a subject + full HTML body. Extensible: add more
// emailType options here (e.g. lead nurture) as they're built.
const EMAIL_TYPES = [
  { value: 'onboarding', label: 'Onboarding / Welcome' },
  { value: 'esign', label: 'E-Signature request' },
  { value: 'signedContract', label: 'Signed contract copy' },
  { value: 'proposal', label: 'Proposal (cover email)' },
  { value: 'lead_desk', label: 'Lead — Desk / Virtual Office enquiry' },
  { value: 'lead_office', label: 'Lead — Private Office enquiry' },
  { value: 'lead_followup', label: 'Lead — Follow-up (no reply)' },
  { value: 'lead_final', label: 'Lead — Final follow-up' },
  { value: 'custom', label: 'Custom' },
]
const EMAIL_TYPE_BADGE = {
  onboarding: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  esign: 'bg-blue-50 text-blue-700 border-blue-200',
  signedContract: 'bg-green-50 text-green-700 border-green-200',
  proposal: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  lead_desk: 'bg-amber-50 text-amber-700 border-amber-200',
  lead_office: 'bg-amber-50 text-amber-700 border-amber-200',
  lead_followup: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  lead_final: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  custom: 'bg-gray-100 text-gray-600 border-gray-200',
}
// Placeholders available per email type (filled at send time).
const LEAD_VARS = ['{{company}}', '{{name}}', '{{membershipType}}', '{{tourLink}}', '{{website}}']
const VARS_BY_TYPE = {
  onboarding: ['{{company}}', '{{tenantName}}', '{{unit}}', '{{startDate}}', '{{contract}}', '{{portalUrl}}', '{{website}}', '{{address}}', '{{saltoBlock}}'],
  esign: ['{{company}}', '{{tenantName}}', '{{contract}}', '{{signLink}}', '{{signerName}}', '{{website}}'],
  signedContract: ['{{company}}', '{{tenantName}}', '{{contract}}', '{{signedDate}}', '{{website}}'],
  proposal: ['{{company}}', '{{name}}', '{{website}}'],
  lead_desk: LEAD_VARS,
  lead_office: [...LEAD_VARS, '{{officeOptions}}'],
  lead_followup: LEAD_VARS,
  lead_final: LEAD_VARS,
}
const varsFor = (emailType) => VARS_BY_TYPE[emailType] || ['{{company}}', '{{tenantName}}', '{{website}}']
const PREVIEW_VARS = {
  company: 'Hexa Space', tenantName: 'Jane Smith', unit: 'Office 4', startDate: '1 August 2026',
  contract: 'CON-259', portalUrl: 'https://members.hexaspace.com.au', website: 'hexaspace.com.au',
  address: '830 Whitehorse Road, Box Hill VIC 3128', saltoBlock: '',
  signLink: 'https://app.hexaspace.com.au/sign/sample-token', signerName: 'Hexa Space',
  signedDate: '2 July 2026',
  name: 'Jane Smith', membershipType: 'Dedicated Desk', tourLink: 'https://hexaspace.com.au/book-a-tour', officeOptions: '',
}
const fillPreview = (html) => String(html || '').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in PREVIEW_VARS ? PREVIEW_VARS[k] : m))

const EMPTY_DOC = { category: 'document', name: '', version: 'v1.0', type: 'terms', content: '' }
const EMPTY_EMAIL = { category: 'email', name: '', version: 'v1.0', emailType: 'custom', subject: '', content: '' }

const catOf = (t) => t.category || 'document'

// Convert legacy clause-array templates to HTML (backward compat)
function clausesToHtml(clauses) {
  return clauses.map((c) => `<h3>${c.number}. ${c.title}</h3><p>${c.content}</p>`).join('')
}
function getContent(template) {
  if (template?.content) return template.content
  if (template?.clauses?.length) return clausesToHtml(template.clauses)
  return ''
}

export default function Templates() {
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useOutletContext()
  const [tab, setTab] = useState('document') // 'document' | 'email'
  const [mode, setMode] = useState('list') // 'list' | 'create' | 'edit'
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_DOC)

  const isEmail = form.category === 'email'
  const docs = templates.filter((t) => catOf(t) === 'document')
  const emails = templates.filter((t) => catOf(t) === 'email')
  const rows = tab === 'email' ? emails : docs

  function openNew() {
    setForm(tab === 'email' ? { ...EMPTY_EMAIL } : { ...EMPTY_DOC })
    setEditingId(null)
    setMode('create')
  }

  function openEdit(t) {
    if (catOf(t) === 'email') {
      setForm({ category: 'email', name: t.name ?? '', version: t.version ?? 'v1.0', emailType: t.emailType ?? 'custom', subject: t.subject ?? '', content: getContent(t) })
    } else {
      setForm({ category: 'document', name: t.name ?? '', version: t.version ?? 'v1.0', type: t.type ?? 'terms', content: getContent(t) })
    }
    setEditingId(t.id)
    setMode('edit')
  }

  function handleSave() {
    if (!form.name.trim()) return
    if (mode === 'edit' && editingId) updateTemplate(editingId, { ...form })
    else addTemplate({ ...form })
    setMode('list')
  }

  function handleDelete(id) {
    if (window.confirm('Delete this template?')) deleteTemplate(id)
  }

  // ── Editor view ──────────────────────────────────────────────────────────
  if (mode === 'create' || mode === 'edit') {
    return (
      <div className="flex flex-col h-full bg-muted/50">
        <div className="bg-card border-b border-border px-8 py-5 shrink-0">
          <h1 className="text-lg font-semibold text-foreground">
            {mode === 'edit' ? 'Edit' : 'New'} {isEmail ? 'Email Template' : 'Template'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isEmail ? 'Emails' : 'Documents'} / {form.name || 'Untitled'} · {form.version}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {/* Meta row */}
          <div className="bg-card border border-border rounded-xl shadow-sm px-6 py-5 mb-4">
            <div className="grid grid-cols-4 gap-4 items-end">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Title *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={isEmail ? 'e.g. Onboarding / Welcome' : 'e.g. Terms and Conditions'}
                  className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{isEmail ? 'Email type' : 'Type'}</label>
                {isEmail ? (
                  <select value={form.emailType} onChange={(e) => setForm({ ...form, emailType: e.target.value })}
                    className="w-full border border-input rounded px-3 py-2 text-sm bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                    {EMAIL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                ) : (
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full border border-input rounded px-3 py-2 text-sm bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                    {TEMPLATE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Version</label>
                <input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })}
                  placeholder="v1.0" className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
              </div>
            </div>

            {isEmail && (
              <div className="mt-4">
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Subject line</label>
                <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Welcome to {{company}} — your space is ready"
                  className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
                <p className="text-xs text-muted-foreground mt-2">
                  Placeholders: {varsFor(form.emailType).map((v) => <code key={v} className="mx-0.5 bg-muted px-1 py-0.5 rounded text-[11px]">{v}</code>)}
                </p>
              </div>
            )}
          </div>

          {/* Body editor */}
          {isEmail ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
                <div className="px-5 py-3 border-b border-border bg-muted/50 text-sm font-semibold text-foreground">HTML</div>
                <textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  spellCheck={false}
                  className="flex-1 min-h-[460px] w-full font-mono text-xs p-4 focus:outline-none resize-none bg-card text-foreground" />
              </div>
              <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
                <div className="px-5 py-3 border-b border-border bg-muted/50 text-sm font-semibold text-foreground">Preview <span className="text-xs font-normal text-muted-foreground">· sample data</span></div>
                <iframe title="preview" srcDoc={fillPreview(form.content)} className="flex-1 min-h-[460px] w-full bg-white" />
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/50">
                <span className="text-sm font-semibold text-foreground">Content</span>
                <span className="text-xs text-muted-foreground">Use headings for section titles, body text for clauses</span>
              </div>
              <RichTextEditor content={form.content} onChange={(html) => setForm((f) => ({ ...f, content: html }))} minHeight={420} />
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-card px-8 py-4 flex justify-end gap-3">
          <button type="button" onClick={() => setMode('list')} className="px-5 py-2 text-sm font-medium text-foreground border border-input rounded hover:bg-muted/50">Discard</button>
          <button type="button" onClick={handleSave} disabled={!form.name.trim()}
            className="px-5 py-2 text-sm font-medium text-primary-foreground bg-primary rounded hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
            {mode === 'edit' ? 'Save Changes' : 'Save Template'}
          </button>
        </div>
      </div>
    )
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tab === 'email'
              ? `${emails.length} email template${emails.length !== 1 ? 's' : ''} · sent to members automatically`
              : `${docs.length} document template${docs.length !== 1 ? 's' : ''} · attached to contracts & PDF agreements`}
          </p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus size={15} /> New {tab === 'email' ? 'Email' : 'Template'}
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex border border-border rounded-md overflow-hidden w-fit mb-5">
        {[['document', 'Documents', FileText, docs.length], ['email', 'Emails', Mail, emails.length]].map(([key, label, Icon, n]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm border-l first:border-l-0 border-border transition-colors ${tab === key ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}>
            <Icon size={14} /> {label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === key ? 'bg-white/20' : 'bg-muted text-muted-foreground'}`}>{n}</span>
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {(tab === 'email' ? ['Name', 'Type', 'Subject', 'Version', 'Last Updated', ''] : ['Document Name', 'Type', 'Version', 'Last Updated', '']).map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={tab === 'email' ? 6 : 5} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  No {tab === 'email' ? 'email ' : ''}templates yet.{' '}
                  <button onClick={openNew} className="text-blue-600 hover:underline">Create one</button>
                </td>
              </tr>
            )}
            {rows.map((tmpl) => {
              const email = catOf(tmpl) === 'email'
              const typeMeta = email ? EMAIL_TYPES.find((t) => t.value === tmpl.emailType) : TEMPLATE_TYPES.find((t) => t.value === tmpl.type)
              const badge = email ? (EMAIL_TYPE_BADGE[tmpl.emailType] ?? EMAIL_TYPE_BADGE.custom) : (TYPE_BADGE[tmpl.type] ?? TYPE_BADGE.other)
              return (
                <tr key={tmpl.id} className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => openEdit(tmpl)}>
                  <td className="px-4 py-3 font-medium text-foreground">{tmpl.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${badge}`}>{typeMeta?.label ?? (email ? tmpl.emailType : tmpl.type)}</span>
                  </td>
                  {email && <td className="px-4 py-3 text-muted-foreground truncate max-w-[280px]">{tmpl.subject || '—'}</td>}
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{tmpl.version}</td>
                  <td className="px-4 py-3 text-muted-foreground">{tmpl.updatedAt ? format(parseISO(tmpl.updatedAt), 'dd/MM/yyyy') : '—'}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => openEdit(tmpl)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Edit"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(tmpl.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600" title="Delete"><Trash2 size={14} /></button>
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
