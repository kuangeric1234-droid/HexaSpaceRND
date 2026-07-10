// /api/announcements — admin broadcast emails to members (OfficeRND-style
// "Messages"), always wrapped in the Hexa Space brand template.
//
//   GET  → history, newest first.
//   POST { subject, content, statuses: ['Active','Drop In',…], test?: true }
//     test → one branded preview to info@hexaspace.com.au, nothing recorded.
//     real → BCC-chunked send to every matching member email (deduped),
//            recorded in the deny-all `announcements` table.
//
// Every send goes through sendResendEmail, so safe mode still guards it.
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from './_auth.js'
import { sendResendEmail, sendResendBatch } from './_email.js'
import { brandFrame, bKicker, bH1, bSmall, SANS, OLIVE } from './_brand.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const TEST_TO = 'info@hexaspace.com.au'
const BATCH_SIZE = 100 // Resend caps the batch endpoint at 100 messages/request

export const config = { maxDuration: 60 }

const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))

const A = (href, text) => `<a href="${href}" style="color:${OLIVE};text-decoration:underline">${text}</a>`

// Lightweight, SAFE inline Markdown → HTML. The input is ALREADY html-escaped, so
// we only ever ADD our own known-good tags — user text can't inject markup. Links
// are restricted to http(s)/mailto so nothing dangerous (e.g. javascript:) slips in.
// Supports [text](url), **bold**, _italic_, and bare URLs.
function inlineMd(escaped) {
  const stash = []
  let s = escaped
  // [text](url) first — stash as a token so bare-URL auto-linking can't double-wrap it.
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (_, text, url) => {
    stash.push(A(url, text))
    return `@@X${stash.length - 1}@@`
  })
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, '$1<em>$2</em>')
  s = s.replace(/(https?:\/\/[^\s<]+)/g, (m) => A(m, m)) // bare URLs
  s = s.replace(/@@X(\d+)@@/g, (_, i) => stash[Number(i)])
  return s
}

// Plain text (+ light Markdown) → branded paragraphs (blank line = new paragraph).
function contentHtml(text) {
  return String(text ?? '').trim().split(/\n{2,}/)
    .map((p) => `<p style="font-family:${SANS};font-size:15px;line-height:1.7;color:#3a3a3a;margin:0 0 16px">${inlineMd(esc(p)).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function buildHtml(subject, content) {
  const inner =
    bKicker('Hexa Space · Member Update') +
    bH1(esc(subject)) +
    contentHtml(content) +
    bSmall('You’re receiving this because you’re a member of Hexa Space — 402/830 Whitehorse Road, Box Hill VIC 3128.')
  return brandFrame(inner, { footerLabel: 'Community' })
}

export default async function handler(req, res) {
  const auth = await requireAdmin(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })
  const sb = auth.sb ?? createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  if (req.method === 'GET') {
    const { data } = await sb.from('announcements').select('data').order('updated_at', { ascending: false }).limit(100)
    return res.status(200).json({ announcements: (data ?? []).map((r) => r.data) })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { subject, content, statuses = [], test = false } = req.body ?? {}
  if (!subject?.trim() || !content?.trim()) return res.status(400).json({ error: 'Subject and content are required.' })

  const { data: settRows } = await sb.from('settings').select('data').eq('id', 'global')
  const settings = settRows?.[0]?.data ?? {}
  const fromName = settings?.emails?.fromName || 'Hexa Space'
  const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
  const from = `${fromName} <${fromEmail}>`
  const replyTo = settings?.emails?.replyTo || 'info@hexaspace.com.au'
  const html = buildHtml(subject, content)

  try {
    if (test) {
      const r = await sendResendEmail({ from, to: TEST_TO, replyTo, subject: `[PREVIEW] ${subject}`, html })
      return res.status(200).json({ test: true, sent: r.ok ? 1 : 0, to: TEST_TO })
    }

    if (!statuses.length) return res.status(400).json({ error: 'Pick at least one member group.' })

    // Resolve recipients: members whose status matches (case-insensitive), deduped.
    const { data: mRows } = await sb.from('members').select('data')
    const wanted = new Set(statuses.map((s) => String(s).toLowerCase()))
    const emails = [...new Set(
      (mRows ?? []).map((r) => r.data)
        .filter((m) => wanted.has(String(m.status ?? '').toLowerCase()))
        .map((m) => String(m.email ?? '').trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    )]
    if (!emails.length) return res.status(400).json({ error: 'No members with emails match that filter.' })

    // Send each member their OWN email (proper To:, so it actually lands in
    // their inbox) via Resend's batch endpoint, in chunks of 100.
    let sent = 0
    const failures = []
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const chunk = emails.slice(i, i + BATCH_SIZE)
      const messages = chunk.map((to) => ({ from, to, replyTo, subject, html }))
      const r = await sendResendBatch(messages)
      if (r.ok) sent += r.sent
      else failures.push(`batch ${Math.floor(i / BATCH_SIZE) + 1}: ${r.status ?? r.error ?? 'failed'}`)
      await new Promise((r2) => setTimeout(r2, 500))
    }

    const id = `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const record = {
      id, subject: subject.trim(), content: content.trim(), statuses,
      recipientCount: sent, recipients: emails,
      sentAt: new Date().toISOString(), sentBy: auth.user.email,
      failures: failures.length ? failures : undefined,
    }
    await sb.from('announcements').upsert({ id, data: record, updated_at: new Date().toISOString() })

    return res.status(200).json({ sent, total: emails.length, failures })
  } catch (err) {
    console.error('announcements error:', err)
    return res.status(500).json({ error: 'Could not send the announcement.' })
  }
}
