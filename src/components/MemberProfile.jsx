import { useState } from 'react'
import { ArrowLeft, Pencil, Check } from 'lucide-react'
import { displayStatus, accessRoles } from './Members.jsx'

const TABS = ['Overview', 'Memberships', 'Bookings', 'Day Passes', 'Credits', 'One-off Fees', 'Invoices', 'Comments']

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} className={`w-9 h-5 rounded-full transition-colors relative ${on ? 'bg-blue-600' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 ${on ? 'left-4' : 'left-0.5'} w-4 h-4 bg-white rounded-full transition-all`} />
    </button>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between py-1.5 text-xs">
      <span className="text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-gray-800 text-right max-w-[60%]">{children || <span className="text-gray-300">—</span>}</span>
    </div>
  )
}

function Section({ title, addLabel, onAdd, children }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-2">
        <h3 className="font-bold text-gray-900">{title}</h3>
        {addLabel && <button onClick={onAdd} disabled={!onAdd} className={`text-xs px-2.5 py-1 rounded font-medium ${onAdd ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>{addLabel}</button>}
      </div>
      <div className="bg-white border border-gray-200 rounded-md p-5 text-sm text-gray-400">
        {children}
      </div>
    </div>
  )
}

export default function MemberProfile({ member, ctx, onBack, onEdit }) {
  const { tenants = [], invoices = [], updateMember } = ctx
  const [tab, setTab] = useState('Overview')
  const company = tenants.find((t) => t.id === member.companyId)
  const memberInvoices = invoices.filter((i) => i.tenantId === member.companyId)
  const st = displayStatus(member)
  const show = (s) => tab === 'Overview' || tab === s
  const set = (k, v) => updateMember(member.id, { [k]: v })

  return (
    <div className="p-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4"><ArrowLeft size={15} /> Back to Members</button>

      <div className="flex gap-5 items-start">
        {/* Left sidebar */}
        <aside className="w-64 shrink-0 space-y-5">
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Member</span>
              <button onClick={onEdit} className="flex items-center gap-1 text-xs border border-gray-200 rounded px-2 py-1 hover:bg-gray-50"><Pencil size={12} /> Edit Details</button>
            </div>
            <div className="w-16 h-16 rounded-full bg-gray-100 mx-auto mb-2" />
            <div className="text-center">
              <div className="font-bold text-gray-900">{member.name}</div>
              {member.email && <div className="text-xs text-gray-500">{member.email}</div>}
              {company && <div className="text-xs text-gray-500 mt-0.5">{company.businessName}</div>}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">General</div>
            <Row label="Location">Hexa Space</Row>
            <Row label="Status"><span className="inline-flex gap-1">{[st, ...accessRoles(member).map((a) => a.split(' ')[0])].map((b, i) => <span key={i} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{b}</span>)}</span></Row>
            <Row label="Phone">{member.phone}</Row>
            <Row label="Email">{member.email}</Row>
            <Row label="Address">{member.address}</Row>
            <div className="flex items-center justify-between py-1.5 text-xs"><span className="text-gray-400 uppercase tracking-wide">Use Day Passes</span><Toggle on={!!member.useDayPasses} onClick={() => set('useDayPasses', !member.useDayPasses)} /></div>
            <Row label="Presence"><span className="text-gray-400">Not in</span></Row>
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Member Apps</div>
            <div className="flex items-center justify-between py-1.5 text-xs"><span className="text-gray-400 uppercase tracking-wide">Hide from Portal</span><Toggle on={!!member.hideFromPortal} onClick={() => set('hideFromPortal', !member.hideFromPortal)} /></div>
            <div className="flex items-center justify-between py-1.5 text-xs"><span className="text-gray-400 uppercase tracking-wide">Portal Access</span><Toggle on={!!member.portalAccess} onClick={() => set('portalAccess', !member.portalAccess)} /></div>
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Integrations</div>
            <Row label="Door Access"><span className="text-gray-400">Salto — not linked</span></Row>
            <Row label="Accounting"><span className="text-gray-400">Xero — not connected</span></Row>
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Billing Details</div>
            <Row label="Business Name">{member.billBusinessName}</Row>
            <Row label="ABN">{member.abn}</Row>
            <Row label="City">{member.city}</Row>
            <Row label="State">{member.state}</Row>
            <Row label="Country">{member.country}</Row>
            <Row label="Tax Rate">{member.taxRate}</Row>
            <Row label="Billing Date">{member.billingPeriodStart}</Row>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0">
          <div className="flex gap-5 border-b border-gray-200 mb-5 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`pb-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{t}</button>
            ))}
          </div>

          {(tab === 'Overview') && (
            <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 mb-6 text-sm text-amber-800">
              <strong>Automated Bill Run Summary</strong> · upcoming period · auto-send
            </div>
          )}

          {show('Memberships') && <Section title="Memberships" addLabel="Add membership">No memberships to show.</Section>}
          {show('Bookings') && <Section title="Bookings" addLabel="New booking">No bookings to show.</Section>}
          {show('Day Passes') && <Section title="Day Passes" addLabel="Add Day Passes">No day passes to show.</Section>}
          {show('Credits') && <Section title="Credits" addLabel="Add credits">No credits to show.</Section>}
          {show('One-off Fees') && <Section title="One-off Fees" addLabel="Add fee">No one-off fees to show.</Section>}
          {show('Invoices') && (
            <Section title="Invoices" addLabel="Add invoice">
              {memberInvoices.length === 0 ? 'No invoices to show.' : (
                <table className="w-full text-sm text-gray-700">
                  <thead><tr className="text-xs text-gray-400 uppercase"><th className="text-left pb-2">Number</th><th className="text-left pb-2">Status</th><th className="text-right pb-2">Amount</th></tr></thead>
                  <tbody>{memberInvoices.map((i) => (
                    <tr key={i.id} className="border-t border-gray-100"><td className="py-2">{i.number}</td><td className="py-2 capitalize">{i.status}</td><td className="py-2 text-right">A${Number((i.lineItems || []).reduce((s, l) => s + (l.unitPrice || 0) * (l.qty || 1), 0)).toLocaleString('en-AU')}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </Section>
          )}
          {show('Comments') && <Section title="Comments">No comments yet.</Section>}
        </div>

        {/* Right sidebar */}
        <aside className="w-56 shrink-0 space-y-5 hidden xl:block">
          {['Payment Details', 'Attachments', 'Opportunities'].map((t) => (
            <div key={t} className="bg-white border border-gray-200 rounded-md p-4">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">{t}</div>
              <p className="text-xs text-gray-400">Nothing to show.</p>
            </div>
          ))}
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Activity</div>
            <button className="text-xs text-blue-600 hover:underline">View member’s activity</button>
          </div>
        </aside>
      </div>
    </div>
  )
}
