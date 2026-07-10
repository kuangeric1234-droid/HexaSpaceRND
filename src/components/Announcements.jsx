import { useState, useEffect, Fragment } from 'react'
import { useOutletContext } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Megaphone, Send, Loader2, CheckCircle2, ChevronDown, ChevronUp, FlaskConical, Sparkles } from 'lucide-react'
import { authHeaders } from '../lib/apiFetch.js'
import RichTextEditor from './RichTextEditor.jsx'

// Rich content is HTML from the editor. Helpers to (a) tell if it's effectively
// empty, (b) turn AI plain-text drafts into paragraphs the editor can load, and
// (c) strip tags for the plain-text history preview.
const htmlEmpty = (h) => !String(h || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
const plainToHtml = (t) => String(t || '').trim().split(/\n{2,}/)
  .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`)
  .join('') || '<p></p>'
const stripHtml = (h) => String(h || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
  .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()

// Announcements — broadcast emails to members (the OfficeRND "Messages" hub).
// Write a subject + plain-text content, pick who gets it, and it goes out in
// the Hexa Space brand template automatically. History lives in the deny-all
// `announcements` table via /api/announcements (admin-gated).

// Groups offered in the composer — matched case-insensitively server-side.
const GROUPS = [
  { key: 'Active', label: 'Active members', match: ['active'] },
  { key: 'Drop In', label: 'Drop-in members', match: ['drop in'] },
  { key: 'Contact', label: 'Contacts', match: ['contact'] },
  { key: 'Former', label: 'Former members', match: ['former'] },
]

export default function Announcements() {
  const { members = [] } = useOutletContext()
  const [history, setHistory] = useState(null)
  const [compose, setCompose] = useState(false)
  const [openId, setOpenId] = useState(null)

  useEffect(() => { load() }, [])
  async function load() {
    try {
      const r = await fetch('/api/announcements', { headers: await authHeaders() })
      const d = await r.json().catch(() => null)
      if (r.ok) setHistory(d.announcements ?? [])
    } catch { setHistory([]) }
  }

  const groupLabel = (statuses = []) =>
    statuses.map((s) => GROUPS.find((g) => g.key === s)?.label ?? s).join(', ')

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <span className="h-10 w-10 rounded-lg bg-primary text-primary-foreground grid place-items-center"><Megaphone size={18} /></span>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-foreground">Announcements</h1>
          <p className="text-xs text-muted-foreground">Email your members — every send goes out in the Hexa Space branded template.</p>
        </div>
        <button onClick={() => setCompose(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-semibold hover:bg-primary/90">
          <Send size={14} /> Send message
        </button>
      </div>

      {/* History */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground text-xs">
            <tr>{['Message', 'To', 'Recipients', 'Sent by', 'Date', ''].map((h, i) => <th key={i} className="text-left px-4 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {history === null && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>}
            {history?.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No announcements yet — send your first one.</td></tr>}
            {(history ?? []).map((a) => (
              <Fragment key={a.id}>
                <tr className="hover:bg-muted/40 cursor-pointer" onClick={() => setOpenId(openId === a.id ? null : a.id)}>
                  <td className="px-4 py-3 font-medium text-foreground">{a.subject}</td>
                  <td className="px-4 py-3 text-muted-foreground">{groupLabel(a.statuses)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.recipientCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.sentBy}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{a.sentAt ? format(parseISO(a.sentAt), 'd MMM yyyy · h:mmaaa') : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{openId === a.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                </tr>
                {openId === a.id && (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 bg-muted/30">
                      <div className="text-sm text-foreground whitespace-pre-wrap max-w-2xl">{stripHtml(a.content)}</div>
                      {a.failures?.length > 0 && <div className="mt-2 text-xs text-red-600">Failures: {a.failures.join(' · ')}</div>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {compose && <ComposeModal members={members} onClose={() => setCompose(false)} onSent={() => { setCompose(false); load() }} />}
    </div>
  )
}

function ComposeModal({ members, onClose, onSent }) {
  const [statuses, setStatuses] = useState(['Active'])
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(null) // 'test' | 'send'
  const [msg, setMsg] = useState(null)

  // AI drafting — rough brief in, subject + on-brand content out (editable).
  const [brief, setBrief] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [draftErr, setDraftErr] = useState('')

  async function draftWithAI() {
    if (!brief.trim()) { setDraftErr('Say what the announcement is about first.'); return }
    setDrafting(true); setDraftErr('')
    try {
      const r = await fetch('/api/announcements-draft', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ brief: brief.trim() }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Drafting failed.')
      setSubject(d.subject ?? '')
      setContent(plainToHtml(d.content ?? ''))
    } catch (e) { setDraftErr(e.message) } finally { setDrafting(false) }
  }

  const countFor = (g) => members.filter((m) =>
    g.match.includes(String(m.status ?? '').toLowerCase()) && /\S+@\S+/.test(m.email ?? '')).length
  const recipientCount = [...new Set(members
    .filter((m) => statuses.some((s) => (GROUPS.find((g) => g.key === s)?.match ?? []).includes(String(m.status ?? '').toLowerCase())))
    .map((m) => String(m.email ?? '').toLowerCase()).filter((e) => /\S+@\S+/.test(e)))].length

  async function submit(test) {
    if (!subject.trim() || htmlEmpty(content)) { setMsg({ err: 'Subject and content are required.' }); return }
    if (!test && !statuses.length) { setMsg({ err: 'Pick at least one group.' }); return }
    if (!test && !window.confirm(`Send "${subject.trim()}" to ${recipientCount} member${recipientCount === 1 ? '' : 's'}?`)) return
    setBusy(test ? 'test' : 'send'); setMsg(null)
    try {
      const r = await fetch('/api/announcements', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ subject: subject.trim(), content: content.trim(), statuses, test }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Send failed.')
      if (test) setMsg({ ok: `Preview sent to info@hexaspace.com.au — check the inbox.` })
      else { setMsg({ ok: `Sent to ${d.sent} member${d.sent === 1 ? '' : 's'}.` }); setTimeout(onSent, 1200) }
    } catch (e) { setMsg({ err: e.message }) } finally { setBusy(null) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Send message</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Plain text in, Hexa Space branding out — kicker, headline, your message, footer.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">To</label>
            <div className="flex flex-wrap gap-2">
              {GROUPS.map((g) => (
                <label key={g.key} className={`flex items-center gap-2 border rounded-md px-3 py-2 text-sm cursor-pointer ${statuses.includes(g.key) ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground'}`}>
                  <input type="checkbox" checked={statuses.includes(g.key)}
                    onChange={() => setStatuses((s) => s.includes(g.key) ? s.filter((x) => x !== g.key) : [...s, g.key])}
                    className="h-3.5 w-3.5" />
                  {g.label} <span className="text-xs text-muted-foreground">({countFor(g)})</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">{recipientCount} unique email{recipientCount === 1 ? '' : 's'} will receive this — each member gets their own copy (they never see each other).</p>
          </div>
          {/* AI draft */}
          <div className="border border-dashed border-border rounded-lg p-3 bg-muted/30">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              <Sparkles size={12} /> Draft with AI
            </label>
            <div className="flex gap-2">
              <input value={brief} onChange={(e) => setBrief(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); draftWithAI() } }}
                placeholder={'e.g. "carpet cleaning this Sunday 9am–1pm on level 4, apologise for the noise"'}
                className="flex-1 border border-input rounded-md px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring/40" />
              <button onClick={draftWithAI} disabled={drafting}
                className="flex items-center gap-1.5 border border-input px-3 py-2 rounded-md text-sm font-medium hover:bg-muted/50 disabled:opacity-40 whitespace-nowrap">
                {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {drafting ? 'Drafting…' : 'Draft it'}
              </button>
            </div>
            {draftErr && <p className="text-xs text-red-600 mt-1.5">{draftErr}</p>}
            <p className="text-[11px] text-muted-foreground mt-1.5">Describe roughly what you want to say — it fills in the subject and message below in the Hexa voice. Edit before sending.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Deep carpet cleaning notice — this Sunday"
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Message</label>
            <RichTextEditor content={content} onChange={setContent} minHeight={220} />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Use the toolbar for <strong>bold</strong>, italics, links and lists — no code needed. Send a test to yourself first to check how it looks.
            </p>
          </div>
          {msg && (
            msg.ok
              ? <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2"><CheckCircle2 size={14} /> {msg.ok}</div>
              : <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{msg.err}</div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border">
          <button onClick={() => submit(true)} disabled={!!busy}
            className="flex items-center gap-2 border border-input px-4 py-2 rounded-md text-sm font-medium hover:bg-muted/50 disabled:opacity-40">
            {busy === 'test' ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />} Send test to info@
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted/50">Close</button>
            <button onClick={() => submit(false)} disabled={!!busy || recipientCount === 0}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
              {busy === 'send' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send to {recipientCount}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
