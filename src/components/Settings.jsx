import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Plus, Trash2, Check } from 'lucide-react'
import { XERO_ACCOUNTS, DEFAULT_XERO_ACCOUNTS } from './spaces/shared.jsx'
import { xeroStatus, connectXero, disconnectXero, xeroSync } from '../lib/xero.js'

const MENU = [
  {
    section: 'Account Details',
    items: [
      { key: 'company-billing', label: 'Company & Billing' },
      { key: 'admin-users', label: 'Admin Users' },
      { key: 'emails', label: 'Emails & Notifications' },
    ],
  },
  {
    section: 'Operations',
    items: [
      { key: 'contracts', label: 'Contracts' },
      { key: 'email-templates', label: 'Email Templates' },
    ],
  },
  {
    section: 'Billing',
    items: [
      { key: 'billing-rules', label: 'Billing Rules' },
      { key: 'invoicing', label: 'Invoicing' },
    ],
  },
  {
    section: 'Integrations',
    items: [
      { key: 'xero', label: 'Xero' },
      { key: 'stripe', label: 'Stripe' },
    ],
  },
]

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? 'bg-blue-600' : 'bg-muted'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function FormRow({ label, description, children }) {
  return (
    <div className="flex items-start justify-between py-4 border-b border-border last:border-0">
      <div className="flex-1 mr-8 min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
      </div>
      <div className="w-72 shrink-0">{children}</div>
    </div>
  )
}

function TabBar({ tabs, active, onSelect }) {
  return (
    <div className="flex border-b border-border mb-6">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            active === key
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function SaveButton({ onClick, saved }) {
  return (
    <div className="mt-6 pt-4 border-t border-border flex items-center gap-3">
      <button
        onClick={onClick}
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md font-medium hover:bg-blue-700"
      >
        Save Changes
      </button>
      {saved && (
        <span className="flex items-center gap-1.5 text-sm text-green-600">
          <Check size={14} /> Saved
        </span>
      )}
    </div>
  )
}

function TextInput({ value, onChange, type = 'text', placeholder = '', mono = false }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${mono ? 'font-mono' : ''}`}
    />
  )
}

// ── Company & Billing ─────────────────────────────────────────────────────────
function CompanyBillingSection({ settings, updateSettings }) {
  const [tab, setTab] = useState('company')
  const [companyForm, setCompanyForm] = useState(() => ({ ...settings.company }))
  const [billingForm, setBillingForm] = useState(() => ({ ...settings.billing }))
  const [saved, setSaved] = useState(false)

  function save() {
    updateSettings({ company: companyForm, billing: billingForm })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function setC(f) { return (v) => setCompanyForm((p) => ({ ...p, [f]: v })) }
  function setB(f) { return (v) => setBillingForm((p) => ({ ...p, [f]: v })) }

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground mb-1">Company & Billing</h1>
      <p className="text-sm text-muted-foreground mb-6">Manage your company details and billing information used on invoices and contracts.</p>

      <TabBar
        tabs={[['company', 'Company Info'], ['billing', 'Billing Details']]}
        active={tab}
        onSelect={setTab}
      />

      {tab === 'company' && (
        <>
          <FormRow label="Company Name" description="Trading name shown across the system">
            <TextInput value={companyForm.name} onChange={setC('name')} />
          </FormRow>
          <FormRow label="Company Email" description="Primary contact email for the company">
            <TextInput type="email" value={companyForm.email} onChange={setC('email')} />
          </FormRow>
          <FormRow label="Website" description="Shown in invoice footers">
            <TextInput value={companyForm.website} onChange={setC('website')} />
          </FormRow>
          <FormRow label="Company Logo" description="Upload a logo for invoices and contracts (PNG, JPG)">
            {companyForm.logo ? (
              <div className="flex items-center gap-3">
                <img src={companyForm.logo} alt="Logo" className="h-10 max-w-[140px] object-contain border border-border rounded px-1" />
                <button
                  onClick={() => setCompanyForm((p) => ({ ...p, logo: '' }))}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="cursor-pointer">
                <div className="border border-dashed border-input rounded-md px-4 py-2.5 text-sm text-muted-foreground hover:border-blue-400 hover:text-blue-500 transition-colors text-center">
                  Click to upload logo
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = (ev) => setCompanyForm((p) => ({ ...p, logo: ev.target.result }))
                    reader.readAsDataURL(file)
                  }}
                />
              </label>
            )}
          </FormRow>
        </>
      )}

      {tab === 'billing' && (
        <>
          <FormRow label="Business Name" description="Legal entity name on invoices and contracts">
            <TextInput value={billingForm.businessName} onChange={setB('businessName')} />
          </FormRow>
          <FormRow label="ABN (Registration Number)" description="Australian Business Number">
            <TextInput value={billingForm.abn} onChange={setB('abn')} />
          </FormRow>
          <FormRow label="GST Registered" description="Include GST (10%) on all invoices by default">
            <Toggle
              checked={billingForm.gstRegistered ?? true}
              onChange={(v) => setBillingForm((p) => ({ ...p, gstRegistered: v }))}
            />
          </FormRow>
          <FormRow label="Accountable Person" description="Person responsible for billing queries">
            <TextInput value={billingForm.accountablePerson} onChange={setB('accountablePerson')} />
          </FormRow>
          <FormRow label="Bank Name" description="Name of your financial institution">
            <TextInput value={billingForm.bankName} onChange={setB('bankName')} />
          </FormRow>
          <FormRow label="BSB" description="Bank-State-Branch number (e.g. 063-000)">
            <TextInput value={billingForm.bsb} onChange={setB('bsb')} placeholder="063-000" />
          </FormRow>
          <FormRow label="ACC (Account Number)" description="Bank account number">
            <TextInput value={billingForm.acc} onChange={setB('acc')} placeholder="00000000" />
          </FormRow>
          <FormRow label="Billing Address" description="Address shown on invoices and contracts">
            <TextInput value={billingForm.address} onChange={setB('address')} />
          </FormRow>
        </>
      )}

      <SaveButton onClick={save} saved={saved} />
    </div>
  )
}

function AddExistingUserForm({ users, updateSettings }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'Admin' })
  const [done, setDone] = useState(false)

  function handleAdd(e) {
    e.preventDefault()
    if (!form.email.trim()) return
    const newUser = {
      id: `u_${Date.now()}`,
      name: form.name.trim() || form.email.trim(),
      email: form.email.trim().toLowerCase(),
      role: form.role,
      access: form.role === 'Super Admin' ? 'Full Access' : 'Standard Access',
    }
    updateSettings({ adminUsers: [...users, newUser] })
    setForm({ name: '', email: '', role: 'Admin' })
    setDone(true)
    setTimeout(() => setDone(false), 3000)
  }

  return (
    <form onSubmit={handleAdd} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Name</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Full name" className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Email *</label>
          <input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="user@hexaspace.com.au" className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Role</label>
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 bg-card">
            <option value="Admin">Admin</option>
            <option value="Super Admin">Super Admin</option>
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md font-medium hover:bg-primary/90">
          Add User
        </button>
        {done && <span className="text-sm text-green-600">✓ Added successfully</span>}
      </div>
    </form>
  )
}

// ── Admin Users ───────────────────────────────────────────────────────────────
function AdminUsersSection({ settings, updateSettings }) {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('Admin')
  const [status, setStatus] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const users = settings.adminUsers ?? []

  function updateUserRole(id, role) {
    const updated = users.map(u => u.id === id ? { ...u, role } : u)
    updateSettings({ adminUsers: updated })
  }

  function removeUser(id) {
    if (!window.confirm('Remove this user from the admin list?')) return
    updateSettings({ adminUsers: users.filter(u => u.id !== id) })
  }

  async function handleInvite(e) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setStatus('sending')
    setErrorMsg('')
    try {
      const res = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Invite failed')
      // Add to adminUsers list
      const newUser = {
        id: `u_${Date.now()}`,
        name: inviteName.trim() || inviteEmail.trim(),
        email: inviteEmail.trim(),
        role: inviteRole,
        access: inviteRole === 'Super Admin' ? 'Full Access' : 'Standard Access',
      }
      updateSettings({ adminUsers: [...users, newUser] })
      setStatus('sent')
      setInviteEmail('')
      setInviteName('')
      setInviteRole('Admin')
      setTimeout(() => setStatus(null), 4000)
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground mb-1">Admin Users</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Manage who has access to Hexa Space and their permission level.
      </p>

      {/* Current users table */}
      {users.length > 0 && (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-border bg-muted/50">
            <span className="text-sm font-semibold text-foreground">Current Users</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-muted/50">
                  <td className="px-5 py-3 font-medium text-foreground">{u.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-5 py-3">
                    <select
                      value={u.role}
                      onChange={e => updateUserRole(u.id, e.target.value)}
                      className="border border-input rounded px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 bg-card"
                    >
                      <option value="Admin">Admin</option>
                      <option value="Super Admin">Super Admin</option>
                    </select>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => removeUser(u.id)} className="text-xs text-muted-foreground hover:text-red-500">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Role explanation */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">Role Permissions</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-3">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-900 text-white shrink-0">Super Admin</span>
            <span className="text-muted-foreground">Full access — including permanently deleting invoices from the system.</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-300 shrink-0">Admin</span>
            <span className="text-muted-foreground">Standard access — can manage everything except permanent invoice deletion.</span>
          </div>
        </div>
      </div>

      {/* Add existing user (no invite email) */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-6 mb-4">
        <h2 className="text-sm font-semibold text-foreground mb-1">Add existing user</h2>
        <p className="text-xs text-muted-foreground mb-4">Already have a Supabase login? Add them to the admin list without sending an email.</p>
        <AddExistingUserForm users={users} updateSettings={updateSettings} />
      </div>

      {/* Invite form */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-1">Invite a new team member</h2>
        <p className="text-xs text-muted-foreground mb-4">Creates a Supabase account and sends them a setup email.</p>
        <form onSubmit={handleInvite} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Name</label>
              <input
                type="text"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                placeholder="Full name"
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Role</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 bg-card"
              >
                <option value="Admin">Admin</option>
                <option value="Super Admin">Super Admin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-muted-foreground mb-1">Email address *</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="teammate@hexaspace.com.au"
                required
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>
            <button
              type="submit"
              disabled={status === 'sending'}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
            >
              <Plus size={14} />
              {status === 'sending' ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </form>

        {status === 'sent' && (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            <Check size={14} /> Invite sent — they'll receive an email to set their password.
          </div>
        )}
        {status === 'error' && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Emails & Notifications ────────────────────────────────────────────────────
function EmailsSection({ settings, updateSettings }) {
  const [form, setForm] = useState(() => ({ ...settings.emails }))
  const [saved, setSaved] = useState(false)

  function save() {
    updateSettings({ emails: form })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function set(f) { return (v) => setForm((p) => ({ ...p, [f]: v })) }

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground mb-1">Emails & Notifications</h1>
      <p className="text-sm text-muted-foreground mb-6">Configure email addresses for invoices, contracts, and system notifications.</p>

      {/* Safe mode — global outbound-email block */}
      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-amber-900">Safe mode — block outbound email</div>
            <div className="text-xs text-amber-700 mt-0.5">When ON, every email (invoices, confirmations, reminders, invites…) is redirected to the single test address below — no client, member or lead receives anything until you turn this off.</div>
          </div>
          <Toggle checked={form.safeMode !== false} onChange={(v) => setForm((p) => ({ ...p, safeMode: v }))} />
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium text-amber-900 mb-1">Test recipient (receives all email while safe mode is on)</label>
          <TextInput type="email" value={form.safeRecipient ?? 'eric@hexaspace.com.au'} onChange={set('safeRecipient')} placeholder="eric@hexaspace.com.au" />
        </div>
        <div className="mt-2 text-xs font-medium">
          {form.safeMode !== false
            ? <span className="text-amber-800">● Blocking — only {form.safeRecipient || 'eric@hexaspace.com.au'} will receive email. Remember to Save.</span>
            : <span className="text-green-700">● Live — emails send to real recipients.</span>}
        </div>
      </div>

      <FormRow label="Notification Email" description="Receive system notifications at this address">
        <TextInput type="email" value={form.notificationEmail} onChange={set('notificationEmail')} />
      </FormRow>
      <FormRow label="Reply To" description="Tenants will reply to this address">
        <TextInput type="email" value={form.replyTo} onChange={set('replyTo')} />
      </FormRow>
      <FormRow label="CC" description="Carbon copy all outbound emails">
        <TextInput type="email" value={form.cc} onChange={set('cc')} placeholder="Optional" />
      </FormRow>
      <FormRow label="BCC" description="Blind copy all outbound emails">
        <TextInput type="email" value={form.bcc} onChange={set('bcc')} placeholder="Optional" />
      </FormRow>

      <div className="pt-4 pb-2 mt-2">
        <div className="text-sm font-semibold text-foreground">Sender Details</div>
        <p className="text-xs text-muted-foreground mt-0.5">Used as the From address when emails are sent to tenants.</p>
      </div>

      <FormRow label="From Name" description="Display name on outbound emails">
        <TextInput value={form.fromName} onChange={set('fromName')} />
      </FormRow>
      <FormRow label="From Email" description="Email address invoices and contracts are sent from">
        <div className="space-y-2">
          <TextInput type="email" value={form.fromEmail} onChange={set('fromEmail')} />
          <div className={`flex items-center justify-between gap-1.5 text-xs px-2.5 py-1.5 rounded border ${
            form.dnsVerified
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-orange-50 text-orange-700 border-orange-200'
          }`}>
            <span>{form.dnsVerified ? '✓ DNS Verified' : '⚠ DNS not verified — emails may land in spam'}</span>
            {!form.dnsVerified && (
              <button
                onClick={() => setForm((p) => ({ ...p, dnsVerified: true }))}
                className="underline text-xs shrink-0"
              >
                Mark Verified
              </button>
            )}
          </div>
        </div>
      </FormRow>

      <SaveButton onClick={save} saved={saved} />
    </div>
  )
}

// ── Contracts (Operations) ────────────────────────────────────────────────────
function ContractsSection({ settings, updateSettings }) {
  const [tab, setTab] = useState('general')
  const [form, setForm] = useState(() => ({ ...settings.contracts }))
  const [reasons, setReasons] = useState(() => [...(settings.contracts?.terminationReasons ?? [])])
  const [newReason, setNewReason] = useState('')
  const [saved, setSaved] = useState(false)

  function save() {
    updateSettings({ contracts: { ...form, terminationReasons: reasons } })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function set(f) { return (v) => setForm((p) => ({ ...p, [f]: v })) }

  const numPreview = (form.numberTemplate ?? 'CON-{{number}}').replace('{{number}}', '001')

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground mb-1">Contracts</h1>
      <p className="text-sm text-muted-foreground mb-6">Configure contract numbering, eSignature sender, and termination reasons.</p>

      <TabBar
        tabs={[['general', 'General'], ['esign', 'eSignatures'], ['termination', 'Termination Reasons']]}
        active={tab}
        onSelect={setTab}
      />

      {tab === 'general' && (
        <>
          <FormRow label="Contract Number Template" description="Use {{number}} as the auto-increment placeholder">
            <div className="space-y-1">
              <TextInput value={form.numberTemplate} onChange={set('numberTemplate')} mono />
              <div className="text-xs text-muted-foreground">Preview: {numPreview}</div>
            </div>
          </FormRow>
          <FormRow label="Approval Required" description="Require manager approval before contracts can be sent">
            <Toggle checked={form.approvalRequired ?? false} onChange={set('approvalRequired')} />
          </FormRow>
        </>
      )}

      {tab === 'esign' && (
        <>
          <FormRow label="Signing Email" description="Email address used as the eSign sender">
            <TextInput type="email" value={form.eSignEmail} onChange={set('eSignEmail')} />
          </FormRow>
          <FormRow label="Signing Display Name" description="Name shown on eSign request emails">
            <TextInput value={form.eSignName} onChange={set('eSignName')} />
          </FormRow>
          <FormRow label="eSign Platform" description="Signing service used for electronic signatures">
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2 border border-border">
              Hexa eSign (Built-in)
            </div>
          </FormRow>
        </>
      )}

      {tab === 'termination' && (
        <>
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              These reasons appear in the <strong>Terminate Contract</strong> dropdown. Edit or add your own.
            </p>
          </div>
          <div className="space-y-2 mb-4">
            {reasons.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={r}
                  onChange={(e) => {
                    const updated = [...reasons]
                    updated[i] = e.target.value
                    setReasons(updated)
                  }}
                  className="flex-1 border border-input rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => setReasons((prev) => prev.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-red-500 shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newReason.trim()) {
                  setReasons((prev) => [...prev, newReason.trim()])
                  setNewReason('')
                }
              }}
              placeholder="Add new termination reason…"
              className="flex-1 border border-input rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => {
                if (newReason.trim()) {
                  setReasons((prev) => [...prev, newReason.trim()])
                  setNewReason('')
                }
              }}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded font-medium hover:bg-primary/90"
            >
              <Plus size={14} />
            </button>
          </div>
        </>
      )}

      <SaveButton onClick={save} saved={saved} />
    </div>
  )
}

// ── Billing Rules ─────────────────────────────────────────────────────────────
function BillingRulesSection({ settings, updateSettings }) {
  const [form, setForm] = useState(() => ({ ...settings.billingRules }))
  const [saved, setSaved] = useState(false)

  function save() {
    updateSettings({ billingRules: form })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function set(f) { return (v) => setForm((p) => ({ ...p, [f]: v })) }

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground mb-1">Billing Rules</h1>
      <p className="text-sm text-muted-foreground mb-6">Configure billing periods, taxes, and multi-location billing.</p>

      <FormRow label="Billing Period Start Day" description="Day of month when billing periods start (1 = 1st of month)">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={28}
            value={form.billingPeriodStartDay ?? 1}
            onChange={(e) => setForm((p) => ({ ...p, billingPeriodStartDay: Math.min(28, Math.max(1, Number(e.target.value))) }))}
            className="w-20 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
          />
          <span className="text-xs text-muted-foreground">of the month</span>
        </div>
      </FormRow>
      <FormRow label="Tax (GST)" description="Apply GST to all invoices by default">
        <Toggle checked={form.taxEnabled ?? true} onChange={set('taxEnabled')} />
      </FormRow>
      <FormRow label="Tax Rate (%)" description="GST rate applied to taxable line items">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            value={form.taxRate ?? 10}
            onChange={(e) => setForm((p) => ({ ...p, taxRate: Number(e.target.value) }))}
            className="w-20 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </FormRow>
      <FormRow label="Multi-Location Billing" description="Enable billing across multiple locations on a single invoice">
        <Toggle checked={form.multiLocationBilling ?? false} onChange={set('multiLocationBilling')} />
      </FormRow>

      <SaveButton onClick={save} saved={saved} />
    </div>
  )
}

// ── Invoicing ─────────────────────────────────────────────────────────────────
function InvoicingSection({ settings, updateSettings }) {
  const [form, setForm] = useState(() => ({ ...settings.invoicing }))
  const [saved, setSaved] = useState(false)

  function save() {
    updateSettings({ invoicing: form })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function set(f) { return (v) => setForm((p) => ({ ...p, [f]: v })) }

  const invPreview = (form.invoiceNumberTemplate ?? 'INV-{{number}}').replace('{{number}}', '0001')

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground mb-1">Invoicing</h1>
      <p className="text-sm text-muted-foreground mb-6">Configure invoice generation, numbering, due dates, and sending rules.</p>

      <FormRow label="Invoice Number Template" description="Use {{number}} as the auto-increment placeholder">
        <div className="space-y-1">
          <TextInput value={form.invoiceNumberTemplate} onChange={set('invoiceNumberTemplate')} mono />
          <div className="text-xs text-muted-foreground">Preview: {invPreview}</div>
        </div>
      </FormRow>
      <FormRow label="Due Date" description="Number of days after invoice issue date that payment is due">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={90}
            value={form.dueDateDays ?? 14}
            onChange={(e) => setForm((p) => ({ ...p, dueDateDays: Number(e.target.value) }))}
            className="w-20 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
          />
          <span className="text-xs text-muted-foreground">days after issue</span>
        </div>
      </FormRow>
      <FormRow label="Proration" description="Prorate first month's invoice when a tenant starts mid-month">
        <Toggle checked={form.proration ?? true} onChange={set('proration')} />
      </FormRow>
      <FormRow label="Auto-Generate Invoices" description="Automatically generate invoices at the start of each billing period">
        <Toggle checked={form.autoGenerate ?? true} onChange={set('autoGenerate')} />
      </FormRow>
      <FormRow label="Auto-Send Invoices" description="Automatically email invoices to tenants upon generation">
        <Toggle checked={form.autoSend ?? false} onChange={set('autoSend')} />
      </FormRow>
      <FormRow label="Overdue Reminder" description="Send a reminder this many days after a payment is overdue">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={60}
            value={form.overdueReminderDays ?? 7}
            onChange={(e) => setForm((p) => ({ ...p, overdueReminderDays: Number(e.target.value) }))}
            className="w-20 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
          />
          <span className="text-xs text-muted-foreground">days past due</span>
        </div>
      </FormRow>

      <SaveButton onClick={save} saved={saved} />
    </div>
  )
}

// ── Email Templates ───────────────────────────────────────────────────────────
const EMAIL_TEMPLATE_DEFS = [
  { key: 'invoice',  label: 'Invoice Email',          vars: '{{number}}, {{company}}, {{dueDate}}' },
  { key: 'reminder', label: 'Overdue Reminder',        vars: '{{number}}, {{amount}}, {{dueDate}}' },
  { key: 'receipt',  label: 'Payment Receipt',         vars: '{{number}}, {{amount}}' },
  { key: 'renewal',  label: 'Renewal Notice',          vars: '{{contract}}, {{expiryDate}}' },
  { key: 'esign',    label: 'eSign Invitation',        vars: '{{contract}}, {{company}}' },
  { key: 'onboarding', label: 'Onboarding / Welcome',  vars: '{{company}}, {{unit}}, {{startDate}}, {{contract}}, {{tenantName}}' },
  { key: 'bondRefund', label: 'Bond Refund',           vars: '{{company}}, {{amount}}, {{unit}}, {{number}}, {{tenantName}}' },
]

// Fallback copy so newly-added templates are readable/editable even on installs
// whose saved settings predate them (e.g. Onboarding).
const EMAIL_TEMPLATE_FALLBACKS = {
  onboarding: {
    subject: 'Welcome to {{company}} — your space is ready',
    intro: 'Your agreement is signed and settled. Welcome aboard — here is everything you need to get started.',
  },
  bondRefund: {
    subject: 'Bond refund approved — {{number}}',
    intro: 'Good news — your security deposit refund of {{amount}} for {{unit}} has been approved and a credit note ({{number}}) has been issued.',
  },
}

function EmailTemplatesSection({ settings, updateSettings }) {
  const defaults = settings.emailTemplates ?? {}
  const [form, setForm] = useState(() => {
    const f = {}
    EMAIL_TEMPLATE_DEFS.forEach(({ key }) => {
      const fb = EMAIL_TEMPLATE_FALLBACKS[key] ?? { subject: '', intro: '' }
      f[key] = {
        subject: defaults[key]?.subject ?? fb.subject,
        intro: defaults[key]?.intro ?? fb.intro,
      }
    })
    return f
  })
  const [saved, setSaved] = useState(false)

  function save() {
    updateSettings({ emailTemplates: form })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const input = 'w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'

  return (
    <div>
      <div className="px-6 py-5 border-b border-border">
        <h2 className="text-base font-semibold text-foreground">Email Templates</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Customise the subject and opening paragraph for each email type. Use placeholders shown below each field.
        </p>
      </div>
      <div className="px-6 py-4 space-y-8">
        {EMAIL_TEMPLATE_DEFS.map(({ key, label, vars }) => (
          <div key={key} className="border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">{label}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Subject line</label>
                <input
                  value={form[key]?.subject ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: { ...f[key], subject: e.target.value } }))}
                  className={input}
                />
                <p className="text-xs text-muted-foreground mt-1">Available: {vars}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Opening paragraph</label>
                <textarea
                  rows={3}
                  value={form[key]?.intro ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: { ...f[key], intro: e.target.value } }))}
                  className={`${input} resize-none`}
                />
                <p className="text-xs text-muted-foreground mt-1">Available: {vars}</p>
              </div>
            </div>
          </div>
        ))}
        <div className="flex justify-end pt-2">
          <button onClick={save}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90">
            {saved ? <><Check size={14} /> Saved</> : 'Save Email Templates'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Xero Integration ──────────────────────────────────────────────────────────
function XeroConnectionTab({ settings, updateSettings }) {
  const xs = settings.xero ?? {}
  const [st, setSt] = useState(null) // null = loading
  const [banner, setBanner] = useState(null)
  const [busy, setBusy] = useState(null) // 'dry' | 'push' | 'pull' | 'disconnect'
  const [result, setResult] = useState(null)
  const [err, setErr] = useState(null)
  const [syncForm, setSyncForm] = useState({
    syncEnabled: xs.syncEnabled === true,
    syncFrom: xs.syncFrom ?? '2026-09-01',
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => { xeroStatus().then(setSt) }, [])

  // Surface the OAuth redirect result (?xero=connected|error), then clean the URL.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const flag = q.get('xero')
    if (flag) {
      setBanner(flag === 'connected' ? 'ok' : 'error')
      q.delete('xero'); q.delete('section')
      window.history.replaceState({}, '', window.location.pathname + (q.toString() ? `?${q}` : ''))
    }
  }, [])

  function saveSync() {
    updateSettings({ xero: { ...(settings.xero ?? {}), ...syncForm } })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function run(kind) {
    setBusy(kind); setErr(null); setResult(null)
    try {
      if (kind === 'disconnect') {
        await disconnectXero()
        setSt(await xeroStatus())
      } else {
        const r = await xeroSync(kind === 'pull' ? 'pull' : 'push', { dryRun: kind === 'dry' })
        setResult(r)
        if (kind !== 'dry') setSt(await xeroStatus())
      }
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(null)
    }
  }

  const syncOn = xs.syncEnabled === true
  const fmtDT = (iso) => iso ? new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div>
      {banner === 'ok' && (
        <div className="mb-4 px-4 py-3 rounded-md bg-green-50 border border-green-200 text-sm text-green-700">
          Xero connected successfully.
        </div>
      )}
      {banner === 'error' && (
        <div className="mb-4 px-4 py-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
          Xero connection failed — check the app credentials and try again.
        </div>
      )}

      {/* Connection card */}
      <div className="border border-border rounded-md p-5 mb-6">
        {st === null ? (
          <div className="text-sm text-muted-foreground">Checking connection…</div>
        ) : !st.configured ? (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Not configured.</span> Set{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">XERO_CLIENT_ID</code> and{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">XERO_CLIENT_SECRET</code> in Vercel,
            with redirect URI <code className="text-xs bg-muted px-1 py-0.5 rounded">https://&lt;domain&gt;/api/xero/callback</code>{' '}
            registered at developer.xero.com.
          </div>
        ) : st.connected ? (
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-foreground">Connected to {st.tenantName ?? 'Xero'}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
                <div>Connected {fmtDT(st.connectedAt)}</div>
                <div>Last push: {fmtDT(st.lastPush)} · Last payment pull: {fmtDT(st.lastPull)}</div>
              </div>
            </div>
            <button
              onClick={() => run('disconnect')}
              disabled={!!busy}
              className="px-3 py-1.5 text-sm border border-input rounded-md text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              <span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-2" />
              Not connected
            </div>
            <button
              onClick={connectXero}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md font-medium hover:bg-blue-700"
            >
              Connect to Xero
            </button>
          </div>
        )}
      </div>

      {/* Sync gate */}
      <FormRow
        label="Enable Xero sync"
        description={`Master switch. While OFF nothing is pushed or pulled — connect and dry-run safely. Planned go-live: 1 September 2026, after the migration and invoices are verified.`}
      >
        <div className="flex justify-end">
          <Toggle checked={syncForm.syncEnabled} onChange={(v) => setSyncForm((p) => ({ ...p, syncEnabled: v }))} />
        </div>
      </FormRow>
      <FormRow label="Sync from" description="Only invoices with a billing period starting on/after this date are ever pushed. Keeps migrated history out of Xero.">
        <TextInput type="date" value={syncForm.syncFrom} onChange={(v) => setSyncForm((p) => ({ ...p, syncFrom: v }))} />
      </FormRow>
      <SaveButton onClick={saveSync} saved={saved} />

      {/* Actions */}
      {st?.connected && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-foreground mb-3">Sync actions</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => run('dry')}
              disabled={!!busy}
              className="px-4 py-2 border border-input text-sm rounded-md font-medium hover:bg-muted disabled:opacity-50"
            >
              {busy === 'dry' ? 'Previewing…' : 'Preview push (dry run)'}
            </button>
            <button
              onClick={() => run('push')}
              disabled={!!busy || !syncOn}
              title={syncOn ? '' : 'Turn on "Enable Xero sync" and save first'}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {busy === 'push' ? 'Pushing…' : 'Push invoices to Xero'}
            </button>
            <button
              onClick={() => run('pull')}
              disabled={!!busy || !syncOn}
              title={syncOn ? '' : 'Turn on "Enable Xero sync" and save first'}
              className="px-4 py-2 border border-input text-sm rounded-md font-medium hover:bg-muted disabled:opacity-50"
            >
              {busy === 'pull' ? 'Pulling…' : 'Pull payments from Xero'}
            </button>
          </div>
          {!syncOn && (
            <p className="text-xs text-muted-foreground mt-2">
              Sync is off — live push/pull are locked. Dry run is always available.
            </p>
          )}

          {err && (
            <div className="mt-4 px-4 py-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>
          )}

          {result && (
            <div className="mt-4 border border-border rounded-md p-4 text-sm">
              {result.dryRun && result.wouldPush && (
                <>
                  <div className="font-medium text-foreground mb-2">
                    Dry run — {result.wouldPush.length} invoice{result.wouldPush.length !== 1 ? 's' : ''} would be pushed (from {result.syncFrom})
                  </div>
                  {result.wouldPush.length > 0 && (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b border-border">
                          <th className="py-1.5 pr-3">Invoice</th><th className="py-1.5 pr-3">Tenant</th>
                          <th className="py-1.5 pr-3 text-right">Total (ex GST)</th><th className="py-1.5">Accounts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.wouldPush.map((w) => (
                          <tr key={w.number} className="border-b border-border/50 last:border-0">
                            <td className="py-1.5 pr-3 font-mono">{w.number}</td>
                            <td className="py-1.5 pr-3">{w.tenant}</td>
                            <td className="py-1.5 pr-3 text-right">${Number(w.total).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                            <td className="py-1.5 font-mono">{(w.accounts ?? []).join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
              {!result.dryRun && result.pushed && (
                <div className="font-medium text-foreground">
                  Pushed {result.pushed.length} invoice{result.pushed.length !== 1 ? 's' : ''} to Xero.
                </div>
              )}
              {result.paidMarked && (
                <div className="font-medium text-foreground">
                  Checked {result.checked} — marked {result.paidMarked.length} paid
                  {result.partial?.length ? `, ${result.partial.length} partially paid (left pending)` : ''}
                  {result.voidedInXero?.length ? `, ${result.voidedInXero.length} voided in Xero (review manually)` : ''}.
                </div>
              )}
              {result.skipped?.length > 0 && (
                <div className="text-xs text-muted-foreground mt-2">
                  Skipped: {result.skipped.map((s) => `${s.number} (${s.reason})`).join(', ')}
                </div>
              )}
              {result.errors?.length > 0 && (
                <div className="mt-2 text-xs text-red-600">
                  {result.errors.map((e, i) => <div key={i}>{e.number}: {e.error}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function XeroSection({ settings, updateSettings }) {
  const [tab, setTab] = useState('connection')
  const [form, setForm] = useState(() => ({ ...DEFAULT_XERO_ACCOUNTS, ...(settings.xero?.revenueAccounts ?? {}) }))
  const [saved, setSaved] = useState(false)

  function save() {
    updateSettings({ xero: { ...(settings.xero ?? {}), revenueAccounts: form } })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }
  function set(f) { return (v) => setForm((p) => ({ ...p, [f]: v })) }

  const ACCOUNT_ROWS = [
    ['deposits',      'Deposits',              'System account for refundable deposits'],
    ['membershipL45', 'Membership Fees',       'Default account for membership fees (Level 4 & 5)'],
    ['oneOffL45',     'One-off Fees',          'Default account for one-off fees (Level 4 & 5)'],
    ['bookingL45',    'Booking Fees',          'Meeting rooms, event space & media studios'],
    ['orderL45',      'Order Fees',            'Default account for order fees'],
    ['membershipL2',  'Level 2 Membership Fees', 'Revenue / income for Level 2 members'],
    ['parkingL2',     'Level 2 Parking Fees',  'Parking space & other for Level 2'],
  ]

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground mb-1">Xero</h1>
      <p className="text-sm text-muted-foreground mb-6">Connect your Xero organisation, map revenue accounts, and control when invoices start syncing.</p>

      <TabBar
        tabs={[['connection', 'Connection & Sync'], ['revenue', 'Revenue Accounts'], ['payment', 'Payment Accounts'], ['tax', 'Tax Rates']]}
        active={tab}
        onSelect={setTab}
      />

      {tab === 'connection' && <XeroConnectionTab settings={settings} updateSettings={updateSettings} />}

      {tab === 'revenue' && (
        <>
          {ACCOUNT_ROWS.map(([key, label, desc]) => (
            <FormRow key={key} label={label} description={desc}>
              <select
                value={form[key] ?? ''}
                onChange={(e) => set(key)(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {XERO_ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </FormRow>
          ))}
          <SaveButton onClick={save} saved={saved} />
        </>
      )}

      {(tab === 'payment' || tab === 'tax') && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {tab === 'payment' ? 'Payment account mapping' : 'Tax rate mapping'} — coming with the live Xero connection.
        </div>
      )}
    </div>
  )
}

// ── Stripe Integration ────────────────────────────────────────────────────────
function StripeSection({ settings, updateSettings }) {
  const [st, setSt] = useState(null)
  const [enabled, setEnabled] = useState(settings.stripe?.paymentsEnabled === true)
  const [autoCharge, setAutoCharge] = useState(settings.stripe?.autoChargeOverdue === true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/stripe/status').then((r) => r.json()).then(setSt).catch(() => setSt({ configured: false }))
  }, [])

  function save() {
    updateSettings({ stripe: { ...(settings.stripe ?? {}), paymentsEnabled: enabled, autoChargeOverdue: autoCharge } })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const ready = st?.configured && st?.webhookConfigured

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground mb-1">Stripe</h1>
      <p className="text-sm text-muted-foreground mb-6">Online invoice payments — members see a Pay button on pending invoices in the portal; payments mark the invoice paid automatically.</p>

      <div className="border border-border rounded-md p-5 mb-6 text-sm">
        {st === null ? (
          <span className="text-muted-foreground">Checking configuration…</span>
        ) : (
          <div className="space-y-1.5">
            {[
              ['Secret key (STRIPE_SECRET_KEY)', st.configured],
              ['Webhook secret (STRIPE_WEBHOOK_SECRET)', st.webhookConfigured],
            ].map(([label, ok]) => (
              <div key={label} className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-400'}`} />
                <span className={ok ? 'text-foreground' : 'text-muted-foreground'}>{label} {ok ? 'set' : 'missing'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <FormRow
        label="Enable online payments"
        description="Master switch. While OFF the Pay button politely refuses and members pay by bank transfer as usual."
      >
        <div className="flex justify-end">
          <Toggle checked={enabled} onChange={setEnabled} />
        </div>
      </FormRow>
      <FormRow
        label="Auto-charge overdue invoices to card on file"
        description="The daily overdue run charges a tenant's verified saved card for overdue invoices (as authorised by the payment authority in their signed agreement) and emails them a receipt. Cards are captured during signing for Virtual Office and desk memberships. One attempt per invoice per day; failures fall back to the reminder email."
      >
        <div className="flex justify-end">
          <Toggle checked={autoCharge} onChange={setAutoCharge} />
        </div>
      </FormRow>
      {!ready && st !== null && (
        <p className="text-xs text-amber-600 mt-2">Both keys must be set in Vercel before enabling — payments will fail otherwise.</p>
      )}
      <SaveButton onClick={save} saved={saved} />
    </div>
  )
}

// ── Main Settings ─────────────────────────────────────────────────────────────
export default function Settings() {
  const { settings, updateSettings } = useOutletContext()
  // ?section=xero deep-links here (used by the Xero OAuth callback redirect)
  const [selectedKey, setSelectedKey] = useState(() => {
    const section = new URLSearchParams(window.location.search).get('section')
    return section && MENU.some((m) => m.items.some((i) => i.key === section)) ? section : 'company-billing'
  })

  const SECTIONS = {
    'company-billing': <CompanyBillingSection settings={settings} updateSettings={updateSettings} />,
    'admin-users': <AdminUsersSection settings={settings} updateSettings={updateSettings} />,
    'emails': <EmailsSection settings={settings} updateSettings={updateSettings} />,
    'contracts': <ContractsSection settings={settings} updateSettings={updateSettings} />,
    'billing-rules': <BillingRulesSection settings={settings} updateSettings={updateSettings} />,
    'invoicing': <InvoicingSection settings={settings} updateSettings={updateSettings} />,
    'email-templates': <EmailTemplatesSection settings={settings} updateSettings={updateSettings} />,
    'xero': <XeroSection settings={settings} updateSettings={updateSettings} />,
    'stripe': <StripeSection settings={settings} updateSettings={updateSettings} />,
  }

  return (
    <div className="flex h-full bg-muted/50">
      {/* Left sidebar */}
      <aside className="w-56 shrink-0 border-r border-border bg-card h-full overflow-y-auto">
        <div className="px-5 py-5 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Settings</h2>
        </div>
        <nav className="py-3">
          {MENU.map(({ section, items }) => (
            <div key={section} className="mb-2">
              <div className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {section}
              </div>
              {items.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    selectedKey === key
                      ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl">
          {SECTIONS[selectedKey]}
        </div>
      </main>
    </div>
  )
}
