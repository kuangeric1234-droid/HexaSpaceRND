// POST /api/members/message — send a member-to-member direct message.
// Body: { toMemberId, content }. The recipient's email is resolved server-side
// (never exposed to the client) and the row is written with the service role;
// reads/mark-read stay client-side under member_messages RLS. Returns { message }.
import { applyCors } from '../_cors.js'
import { requireMember } from '../_auth.js'

export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await requireMember(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })
  const { sb, user } = auth

  const { toMemberId, content } = req.body ?? {}
  const text = String(content ?? '').trim()
  if (!toMemberId || !text) return res.status(400).json({ error: 'toMemberId and content are required.' })
  if (text.length > 4000) return res.status(400).json({ error: 'Message is too long.' })

  try {
    // Sender identity (the caller's own member row).
    const { data: fromRows } = await sb.from('members').select('data').ilike('data->>email', user.email).limit(1)
    const from = fromRows?.[0]?.data
    if (!from) return res.status(403).json({ error: 'No member profile found for your account.' })

    // Recipient, by member id.
    const { data: toRows } = await sb.from('members').select('data').eq('data->>id', toMemberId).limit(1)
    const to = toRows?.[0]?.data
    if (!to?.email) return res.status(404).json({ error: 'Member not found.' })
    if (to.portalAccess === false || to.allowMessages === false) {
      return res.status(403).json({ error: 'This member is not accepting messages.' })
    }
    const fromEmail = user.email.toLowerCase()
    const toEmail = String(to.email).toLowerCase()
    if (fromEmail === toEmail) return res.status(400).json({ error: "You can't message yourself." })

    const msg = {
      id: `dm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      convoId: [fromEmail, toEmail].sort().join('__'),
      fromEmail, fromId: from.id, fromName: from.name || fromEmail,
      toEmail, toId: to.id, toName: to.name || toEmail,
      content: text,
      timestamp: new Date().toISOString(),
      read: false,
    }
    const { error } = await sb.from('member_messages').insert({ id: msg.id, data: msg })
    if (error) { console.error('member_messages insert:', error); return res.status(500).json({ error: 'Could not send the message.' }) }

    return res.status(200).json({ message: msg })
  } catch (err) {
    console.error('member message error:', err)
    return res.status(500).json({ error: 'Could not send the message.' })
  }
}
