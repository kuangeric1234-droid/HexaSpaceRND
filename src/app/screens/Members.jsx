import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MessageCircle, ChevronRight } from 'lucide-react'
import { useApp } from '../context.js'
import { Screen, BackHeader, Label, EmptyNote } from '../ui.jsx'
import { loadDirectory, loadMyConversations } from '../lib/memberMessages.js'

const initials = (name) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')

// Members directory + member-to-member messaging. Browse the community (from the
// sanitized member_directory view — names + company only, opted-out members
// excluded) and tap a member to open a private 1:1 chat.
export default function Members() {
  const { data } = useApp()
  const { member } = data
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [people, setPeople] = useState(null) // null = loading
  const [convos, setConvos] = useState([])

  useEffect(() => {
    let alive = true
    loadDirectory().then((d) => { if (alive) setPeople(d) }).catch(() => { if (alive) setPeople([]) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!member?.email) return
    let alive = true
    const load = () => loadMyConversations(member.email).then((c) => { if (alive) setConvos(c) }).catch(() => {})
    load()
    const t = setInterval(load, 6000)
    return () => { alive = false; clearInterval(t) }
  }, [member?.email])

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const byCompany = new Map()
    for (const p of people ?? []) {
      const key = p.company_name || 'Hexa Space'
      if (!byCompany.has(key)) byCompany.set(key, [])
      byCompany.get(key).push(p)
    }
    return [...byCompany.entries()]
      .map(([company, list]) => ({
        company,
        people: list.sort((a, b) => (a.name || '').localeCompare(b.name || '')),
      }))
      .filter(({ company, people }) => {
        if (!needle) return true
        return company.toLowerCase().includes(needle) || people.some((p) => (p.name || '').toLowerCase().includes(needle))
      })
      .sort((a, b) => a.company.localeCompare(b.company))
  }, [people, q])

  const openChat = (id, name) => nav(`/dm/${id}`, { state: { name } })

  return (
    <Screen>
      <BackHeader title="Members" fallback="/more" />
      <p className="font-display font-extralight text-[28px] leading-tight text-ink mt-2 mb-6">
        The Hexa Space<br />community.
      </p>

      {/* Your chats */}
      {convos.length > 0 && !q && (
        <div className="mb-8">
          <Label className="mb-2">Your chats</Label>
          <div className="divide-y divide-ink/5 border-y border-ink/10">
            {convos.map((c) => (
              <button key={c.convoId} onClick={() => openChat(c.other.id, c.other.name)}
                className="w-full flex items-center gap-4 py-3.5 text-left active:opacity-60">
                <span className="h-10 w-10 shrink-0 bg-stone text-ink/50 font-heading tracking-label text-[11px] flex items-center justify-center">
                  {initials(c.other.name)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-body text-[14px] text-ink truncate">{c.other.name || 'Member'}</span>
                  <span className="block hx-prose text-[12px] truncate">{c.last?.content || ''}</span>
                </span>
                {c.unread > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 bg-hexa-green text-paper text-[10px] font-heading flex items-center justify-center rounded-full shrink-0">
                    {c.unread}
                  </span>
                )}
                <ChevronRight size={15} className="text-portal-muted shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="flex items-center gap-3 border border-ink/15 bg-paper px-4 min-h-[48px] mb-8">
        <Search size={15} className="text-portal-muted shrink-0" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members or companies"
          className="flex-1 bg-transparent font-body text-[14px] text-ink outline-none placeholder:text-portal-muted" />
      </label>

      {people === null ? (
        <p className="hx-prose text-center py-10">Loading the directory…</p>
      ) : groups.length === 0 ? (
        <EmptyNote label="No members found." sub={q ? 'Try a different search.' : 'The directory is filling up.'} />
      ) : (
        groups.map(({ company, people }) => (
          <section key={company} className="mb-7">
            <Label className="mb-2">{company}</Label>
            <div className="divide-y divide-ink/5 border-y border-ink/10">
              {people.map((p) => {
                const isSelf = p.id === member?.id
                return (
                  <button key={p.id} disabled={isSelf}
                    onClick={() => !isSelf && openChat(p.id, p.name)}
                    className={`w-full flex items-center gap-4 py-3.5 text-left ${isSelf ? '' : 'active:opacity-60'}`}>
                    <span className="h-10 w-10 shrink-0 bg-stone text-ink/50 font-heading tracking-label text-[11px] flex items-center justify-center">
                      {initials(p.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-body text-[14px] text-ink truncate">
                        {p.name}{isSelf && <span className="text-portal-muted"> · You</span>}
                      </span>
                    </span>
                    {!isSelf && <MessageCircle size={16} className="text-portal-muted shrink-0" />}
                  </button>
                )
              })}
            </div>
          </section>
        ))
      )}
    </Screen>
  )
}
