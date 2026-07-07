import { useState, useEffect, useRef } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Send } from 'lucide-react'
import { useApp } from '../context.js'
import { BackHeader } from '../ui.jsx'
import { loadThread, sendMemberMessage, markThreadRead } from '../lib/memberMessages.js'

function fmtTs(ts) {
  try { return format(parseISO(ts), 'dd MMM · h:mm a') } catch { return '' }
}

// 1:1 direct message thread with another member (by id). Same chat layout as the
// concierge Messages screen; polls every 4s. The other member's name comes from
// nav state (from the directory) or is derived from the thread.
export default function MemberChat() {
  const { otherId } = useParams()
  const location = useLocation()
  const { data } = useApp()
  const me = data.member
  const myEmail = me?.email

  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  // Prefer the name passed from the directory; fall back to the latest thread row.
  const nameFromThread = messages.length
    ? (messages.find((m) => m.fromId === otherId)?.fromName || messages.find((m) => m.toId === otherId)?.toName)
    : null
  const otherName = location.state?.name || nameFromThread || 'Member'

  useEffect(() => {
    if (!myEmail || !otherId) return
    let alive = true
    async function refresh() {
      try {
        const thread = await loadThread(otherId)
        if (alive) setMessages(thread)
        markThreadRead(myEmail, otherId).catch(() => {})
      } catch { /* table not set up yet */ }
    }
    refresh()
    const timer = setInterval(refresh, 4000)
    return () => { alive = false; clearInterval(timer) }
  }, [myEmail, otherId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send(e) {
    e.preventDefault()
    const content = text.trim()
    if (!content) return
    setText(''); setSending(true)
    const optimistic = {
      id: `tmp_${Date.now()}`, fromEmail: myEmail, toId: otherId,
      content, timestamp: new Date().toISOString(), _mine: true,
    }
    setMessages((prev) => [...prev, optimistic])
    try {
      const saved = await sendMemberMessage({ toMemberId: otherId, content })
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? saved : m)))
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      alert(err.message || 'Message could not be sent.')
    } finally { setSending(false) }
  }

  return (
    <div className="app-safe-top px-5 flex flex-col" style={{ height: '100dvh', paddingBottom: 'calc(120px + env(safe-area-inset-bottom))' }}>
      <BackHeader title={otherName} fallback="/more/members" />
      <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pb-4">
        {messages.length === 0 && (
          <p className="hx-prose text-center pt-16">
            Say hello to {otherName.split(' ')[0]} — your messages are private between the two of you.
          </p>
        )}
        {messages.map((msg) => {
          const mine = msg._mine || (msg.fromEmail || '').toLowerCase() === (myEmail || '').toLowerCase()
          return (
            <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-4 py-3 text-sm ${mine ? 'bg-charcoal text-paper' : 'bg-paper text-ink border border-ink/10'}`}>
                <p className="leading-relaxed whitespace-pre-wrap font-body">{msg.content}</p>
                <p className="text-[9px] mt-1.5 opacity-50 font-heading uppercase tracking-nav">{fmtTs(msg.timestamp)}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="app-cartbar flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${otherName.split(' ')[0]}…`}
          className="hx-input flex-1 min-h-[50px] shadow-[0_6px_24px_rgba(0,0,0,0.08)]" disabled={sending} />
        <button type="submit" disabled={sending || !text.trim()} aria-label="Send"
          className="h-[50px] w-[50px] shrink-0 bg-ink text-paper flex items-center justify-center disabled:opacity-40 active:bg-charcoal">
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}
