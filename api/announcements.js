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
import { sendResendEmail } from './_email.js'
import { brandFrame, bKicker, bH1, bSmall, SANS } from './_brand.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const TEST_TO = 'info@hexaspace.com.au'
const BCC_CHUNK = 45 // Resend caps recipients per email at 50

export const config = { maxDuration: 60 }

const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))

// Plain text → branded paragraphs (blank line = new paragraph).
function contentHtml(text) {
  return String(text ?? '').trim().split(/\n{2,}/)
    .map((p) => `<p style="font-family:${SANS};font-size:15px;line-height:1.7;color:#3a3a3a;margin:0 0 16px">${esc(p).replace(/\n/g, '<br>')}</p>`)
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

    // BCC in chunks so each member sees only themselves.
    let sent = 0
    const failures = []
    for (let i = 0; i < emails.length; i += BCC_CHUNK) {
      const chunk = emails.slice(i, i + BCC_CHUNK)
      const r = await sendResendEmail({ from, to: fromEmail, bcc: chunk, replyTo, subject, html })
      if (r.ok) sent += chunk.length
      else failures.push(`chunk ${i / BCC_CHUNK + 1}: ${r.status ?? r.error ?? 'failed'}`)
      await new Promise((r2) => setTimeout(r2, 400))
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
