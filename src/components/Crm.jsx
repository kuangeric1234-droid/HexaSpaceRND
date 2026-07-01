import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Users } from 'lucide-react'
import LeadsBoard from './LeadsBoard.jsx'
import EnquiriesInbox from './EnquiriesInbox.jsx'
import ReferralsPanel from './ReferralsPanel.jsx'

// CRM — the customer pipeline. Leads & Enquiries are the core; Referrals feed it.
const TABS = [
  { key: 'leads',     label: 'Leads' },
  { key: 'enquiries', label: 'Enquiries' },
  { key: 'referrals', label: 'Referrals' },
]

export default function Crm() {
  const store = useOutletContext()
  const [tab, setTab] = useState('leads')

  const { leads = [], pipelineStages = [] } = store
  const wonStageId = pipelineStages.find((s) => s.category === 'won')?.id
  const lostStageId = pipelineStages.find((s) => s.category === 'lost')?.id
  const openLeads = leads.filter((l) => l.stageId !== wonStageId && l.stageId !== lostStageId).length
  const monthKey = new Date().toISOString().slice(0, 7)
  const wonThisMonth = leads.filter((l) => l.stageId === wonStageId && (l.stageEnteredAt ?? '').startsWith(monthKey)).length
  const unreadEnquiries = leads.filter((l) => !l.read).length

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={22} /> CRM
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {openLeads} open {openLeads === 1 ? 'lead' : 'leads'} · {unreadEnquiries} new {unreadEnquiries === 1 ? 'enquiry' : 'enquiries'} · {wonThisMonth} won this month
          </p>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="border-b border-gray-200 mb-6 flex">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
              tab === key ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
            {key === 'enquiries' && unreadEnquiries > 0 && (
              <span className="bg-blue-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">{unreadEnquiries}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'leads' && <LeadsBoard store={store} />}
      {tab === 'enquiries' && <EnquiriesInbox store={store} />}
      {tab === 'referrals' && <ReferralsPanel store={store} />}
    </div>
  )
}
