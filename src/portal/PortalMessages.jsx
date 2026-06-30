import { useState, useEffect, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase.js'
import { Send } from 'lucide-react'

function fmt(ts) {
  try { return format(parseISO(ts), 'dd MMM yyyy · h:mm a') } catch { return '' }
}

export default function PortalMessages({ tenant }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    load()
    const timer = setInterval(load, 4000)
    return () => clearInterval(timer)
  }, [tenant.id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function load() {
    const { data } = await supabase.from('portal_messages').select('data')
    const all = (data ?? []).map(r => r.data).filter(m => m.tenantId === tenant.id)
    all.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    setMessages(all)
    for (const m of all.filter(m => m.sender === 'admin' && !m.readByTenant)) {
      supabase.from('portal_messages').upsert({ id: m.id, data: { ...m, readByTenant: true } })
    }
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (!text.trim()) return
    const content = text.trim()
    setText(''); setSending(true)
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      tenantId: tenant.id, sender: 'tenant', content,
      timestamp: new Date().toISOString(), readByAdmin: false, readByTenant: true,
    }
    setMessages(prev => [...prev, msg])
    await supabase.from('portal_messages').insert({ id: msg.id, data: msg })
    fetch('/api/portal/notify-message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantName: tenant.businessName, tenantEmail: tenant.email, message: content }),
    }).catch(() => {})
    setSending(false)
    inputRef.current?.focus()
  }

  return (
    <div className="hx-rise px-5 md:px-10 py-8 md:py-10 max-w-3xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 1px)' }}>
      <div className="shrink-0 border-b border-ink/10 pb-6 mb-6">
        <p className="hx-eyebrow mb-3">Concierge</p>
        <h1 className="hx-display">Messages</h1>
        <p className="hx-prose mt-3">Send a message to the Hexa Space team — we'll reply as soon as we can.</p>
      </div>

      <div className="flex-1 overflow-y-auto hx-card p-5 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full hx-prose">No messages yet. Start the conversation below.</div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === 'tenant' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md px-4 py-3 text-sm ${
              msg.sender === 'tenant' ? 'bg-charcoal text-paper' : 'bg-bone text-ink border border-ink/10'
            }`}>
              <p className="leading-relaxed whitespace-pre-wrap font-body">{msg.content}</p>
              <p className="text-[10px] mt-1.5 opacity-50 font-heading uppercase tracking-nav">{fmt(msg.timestamp)}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={sendMessage} className="mt-4 flex gap-3 shrink-0">
        <input ref={inputRef} value={text} onChange={e => setText(e.target.value)}
          placeholder="Type your message…" className="hx-input flex-1" disabled={sending} autoFocus />
        <button type="submit" disabled={sending || !text.trim()} className="hx-btn shrink-0 disabled:opacity-40">
          <Send size={14} /> Send
        </button>
      </form>
    </div>
  )
}
