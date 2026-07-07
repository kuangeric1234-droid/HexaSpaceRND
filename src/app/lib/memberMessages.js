import { supabase } from '../../lib/supabase.js'
import { authHeaders } from '../../lib/apiFetch.js'
import { apiUrl } from './native.js'

// Member-to-member direct messages. Reads are participant-scoped by RLS (see
// migrations/phase8_member_dms.sql), so a plain select only returns the signed-in
// member's own conversations. Sends go through /api/members/message so the
// recipient's email is resolved server-side and never exposed to the client. The
// community directory comes from the sanitized member_directory view (name +
// company only — no emails).

const lc = (s) => String(s || '').toLowerCase()

async function myMessages() {
  const { data, error } = await supabase.from('member_messages').select('data')
  if (error) throw error
  return (data ?? []).map((r) => r.data).filter(Boolean)
}

// Cross-company directory of messageable members (opted-out members are excluded
// by the view). [{ id, name, company_id, company_name }].
export async function loadDirectory() {
  const { data, error } = await supabase.from('member_directory').select('*')
  if (error) throw error
  return data ?? []
}

// The "other participant" from a message row, given my email.
function otherOf(m, myEmail) {
  return lc(m.fromEmail) === lc(myEmail)
    ? { id: m.toId, name: m.toName }
    : { id: m.fromId, name: m.fromName }
}

// All my conversations, newest first: [{ convoId, other:{id,name}, last, unread }].
export async function loadMyConversations(myEmail) {
  const me = lc(myEmail)
  const msgs = await myMessages()
  const map = new Map()
  for (const m of msgs) {
    const cur = map.get(m.convoId) ?? { convoId: m.convoId, other: otherOf(m, me), last: null, unread: 0 }
    if (!cur.last || new Date(m.timestamp) > new Date(cur.last.timestamp)) cur.last = m
    if (lc(m.toEmail) === me && !m.read) cur.unread += 1
    map.set(m.convoId, cur)
  }
  return [...map.values()].sort((a, b) => new Date(b.last?.timestamp || 0) - new Date(a.last?.timestamp || 0))
}

// Count of unread messages addressed to me (bell / badges). Degrades to 0 if the
// table isn't set up yet.
export async function unreadDmCount(myEmail) {
  const me = lc(myEmail)
  try {
    return (await myMessages()).filter((m) => lc(m.toEmail) === me && !m.read).length
  } catch {
    return 0
  }
}

// Thread with one other member (by member id), oldest first.
export async function loadThread(otherId) {
  const msgs = await myMessages()
  return msgs.filter((m) => m.fromId === otherId || m.toId === otherId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
}

// Send via the server endpoint (resolves recipient email server-side).
export async function sendMemberMessage({ toMemberId, content }) {
  const r = await fetch(apiUrl('/api/members/message'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ toMemberId, content }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Message could not be sent.')
  return d.message
}

// Flag as read every message the other member sent me in this thread.
export async function markThreadRead(myEmail, otherId) {
  const me = lc(myEmail)
  const msgs = await myMessages()
  const unread = msgs.filter((m) => m.fromId === otherId && lc(m.toEmail) === me && !m.read)
  await Promise.all(unread.map((m) =>
    supabase.from('member_messages').update({ data: { ...m, read: true } }).eq('id', m.id)))
}
