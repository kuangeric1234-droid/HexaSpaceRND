import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Trash2, UserPlus, CheckCircle2, Inbox } from 'lucide-react'
import LeadDetail from './LeadDetail.jsx'

const SOURCE_BADGE = {
  website:  'bg-blue-50 text-blue-700',
  referral: 'bg-purple-50 text-purple-700',
  'walk-in': 'bg-amber-50 text-amber-700',
  phone:    'bg-green-50 text-green-700',
  email:    'bg-muted text-muted-foreground',
  'book-tour': 'bg-orange-50 text-orange-700',
}

function fmt(d) {
  if (!d) return '—'
  try { return format(parseISO(d), 'dd/MM/yyyy') } catch { return d }
}

export default function EnquiriesInbox({ store }) {
  const { leads = [], spaces = [], pipelineStages = [], updateLead, deleteLead, convertLeadToTenant } = store
  const [filter, setFilter] = useState('all') // all | unread
  const [openId, setOpenId] = useState(null)

  const rows = [...leads]
    .filter((l) => filter === 'all' || !l.read)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

  const unread = leads.filter((l) => !l.read).length
  const stageName = (id) => pipelineStages.find((s) => s.id === id)?.name ?? '—'
  const spaceLabel = (id) => spaces.find((s) => s.id === id)?.unitNumber ?? null
  const openLead = leads.find((l) => l.id === openId) ?? null

  function openDetail(lead) {
    setOpenId(lead.id)
    if (!lead.read) updateLead(lead.id, { read: true })
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          {['all', 'unread'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm font-medium rounded capitalize transition-colors ${filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {f === 'all' ? `All (${leads.length})` : `Unread (${unread})`}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-card border border-border rounded-xl shadow-sm p-12 text-center text-muted-foreground">
          <Inbox size={26} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm">No enquiries yet. Submissions from hexaspace.com.au land here.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Enquiring about</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((lead) => {
                // What they're enquiring about — the structured interest from the
                // website (e.g. "Virtual Office", "Private Office"); tours show
                // "Private tour"; otherwise fall back to a matched unit.
                const about =
                  lead.enquiryType ||
                  lead.interest ||
                  (lead.source === 'book-tour' ? 'Private tour' : spaceLabel(lead.spaceId))
                const converted = lead.tenantId
                return (
                  <tr key={lead.id} onClick={() => openDetail(lead)}
                    className={`cursor-pointer hover:bg-muted/50 ${!lead.read ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        {!lead.read && <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />}
                        {fmt(lead.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`${!lead.read ? 'font-semibold' : 'font-medium'} text-foreground hover:underline`}>{lead.name || '—'}</div>
                      {lead.businessName && <div className="text-xs text-muted-foreground">{lead.businessName}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{about || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded capitalize ${SOURCE_BADGE[lead.source] ?? 'bg-muted text-muted-foreground'}`}>{lead.source ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{stageName(lead.stageId)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {converted ? (
                          <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><CheckCircle2 size={12} /> Tenant</span>
                        ) : (
                          <button onClick={() => convertLeadToTenant(lead.id)} title="Convert to tenant"
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><UserPlus size={14} /></button>
                        )}
                        <button onClick={() => { if (window.confirm('Delete this enquiry?')) deleteLead(lead.id) }} title="Delete"
                          className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {openLead && <LeadDetail lead={openLead} store={store} onClose={() => setOpenId(null)} />}
    </div>
  )
}
