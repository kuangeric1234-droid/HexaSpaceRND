import { useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { X, Check, Building2, User, FileText, ClipboardCheck } from 'lucide-react'
import ContractForm from './ContractForm.jsx'

const today = () => new Date().toISOString().split('T')[0]
const ic = 'w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
    </label>
  )
}

const STEP_META = [
  { key: 'company', label: 'Company', icon: Building2 },
  { key: 'contact', label: 'Contact', icon: User },
  { key: 'contract', label: 'Contract', icon: FileText },
  { key: 'review', label: 'Review & bill', icon: ClipboardCheck },
]

// One guided flow: create the company, its primary contact, the contract, then
// raise the security-deposit invoice and hand off to signing. Records are created
// progressively so nothing is lost if the admin steps away mid-way.
export default function SignupWizard({ onClose }) {
  const ctx = useOutletContext()
  const { addTenant, addMember, addLease, addInvoice, updateLease,
    leases = [], tenants = [], spaces = [], templates = [] } = ctx
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [tenant, setTenant] = useState(null)
  const [member, setMember] = useState(null)
  const [lease, setLease] = useState(null)
  const [depositRaised, setDepositRaised] = useState(false)

  const [co, setCo] = useState({
    businessName: '', email: '', phone: '', abn: '', industry: '',
    address: '', city: '', state: '', zip: '', country: 'Australia',
    paymentMethod: 'Bank Transfer', billingPeriodStart: '1', taxRate: 'GST 10%',
  })
  const [contact, setContact] = useState({
    name: '', email: '', phone: '', contactPerson: true, billingPerson: true, portalAccess: true,
  })
  const [err, setErr] = useState('')

  function saveCompany() {
    if (!co.businessName.trim()) { setErr('Company name is required'); return }
    setErr('')
    const t = addTenant({ ...co, status: 'Active', startDate: today() })
    setTenant(t)
    // Seed the contact from the company where blank.
    setContact((c) => ({ ...c, email: c.email || co.email, phone: c.phone || co.phone }))
    setStep(1)
  }

  function saveContact() {
    if (!contact.name.trim()) { setErr('Contact name is required'); return }
    if (!contact.email.trim()) { setErr('Contact email is required — it drives signing, invoices and the welcome/portal invite'); return }
    setErr('')
    const m = addMember({ ...contact, companyId: tenant.id, startDate: today(), status: 'Active' })
    setMember(m)
    setStep(2)
  }

  function saveContract(data) {
    const l = addLease({
      ...data,
      tenantId: tenant.id,
      memberId: member?.id,
      memberName: data.memberName || member?.name,
      companyName: tenant.businessName,
    })
    setLease(l)
    setStep(3)
  }

  const depositAmount = Number(lease?.items?.[0]?.deposit ?? lease?.bondAmount ?? 0)
  const unitName = spaces.find((s) => s.id === lease?.spaceId)?.unitNumber ?? lease?.resource ?? 'Membership'

  function raiseDeposit() {
    if (depositRaised || depositAmount <= 0) return
    const due = new Date(); due.setDate(due.getDate() + 14)
    addInvoice({
      tenantId: tenant.id, leaseId: lease.id,
      status: 'pending', sentStatus: 'not_sent', source: 'signup',
      invoiceType: 'deposit',
      issueDate: today(), dueDate: due.toISOString().split('T')[0],
      periodStart: null, periodEnd: null, vatEnabled: true,
      lineItems: [{ id: `li${Date.now()}`, description: `Security Deposit — ${unitName}`, revenueAccount: 'Security Deposit', unitPrice: depositAmount, qty: 1, discountPct: 0 }],
      payments: [],
    })
    setDepositRaised(true)
  }

  function finish(goSign) {
    if (goSign && lease) navigate('/leases', { state: { openLeaseId: lease.id } })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 pt-8">
        <div className="bg-card rounded-xl w-full max-w-4xl shadow-2xl">
          {/* Header + stepper */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Sign up new company</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
          </div>
          <div className="flex items-center gap-1 px-6 py-4 border-b border-border">
            {STEP_META.map((s, i) => {
              const Icon = s.icon
              const done = i < step
              const cur = i === step
              return (
                <div key={s.key} className="flex items-center gap-1">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${cur ? 'bg-primary text-primary-foreground' : done ? 'text-green-700' : 'text-muted-foreground'}`}>
                    {done ? <Check size={13} /> : <Icon size={13} />} {s.label}
                  </div>
                  {i < STEP_META.length - 1 && <div className={`w-6 h-px ${done ? 'bg-green-400' : 'bg-muted'}`} />}
                </div>
              )
            })}
          </div>

          {err && <div className="mx-6 mt-4 text-sm bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2">{err}</div>}

          {/* Step 0 — Company */}
          {step === 0 && (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Company name" required><input value={co.businessName} onChange={(e) => setCo({ ...co, businessName: e.target.value })} className={ic} placeholder="Acme Pty Ltd" /></Field>
                <Field label="ABN"><input value={co.abn} onChange={(e) => setCo({ ...co, abn: e.target.value })} className={ic} /></Field>
                <Field label="Company email"><input value={co.email} onChange={(e) => setCo({ ...co, email: e.target.value })} className={ic} placeholder="accounts@acme.com" /></Field>
                <Field label="Phone"><input value={co.phone} onChange={(e) => setCo({ ...co, phone: e.target.value })} className={ic} /></Field>
                <Field label="Industry"><input value={co.industry} onChange={(e) => setCo({ ...co, industry: e.target.value })} className={ic} /></Field>
                <Field label="Address"><input value={co.address} onChange={(e) => setCo({ ...co, address: e.target.value })} className={ic} /></Field>
                <Field label="City"><input value={co.city} onChange={(e) => setCo({ ...co, city: e.target.value })} className={ic} /></Field>
                <Field label="State"><input value={co.state} onChange={(e) => setCo({ ...co, state: e.target.value })} className={ic} /></Field>
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Billing defaults</p>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Payment method">
                    <select value={co.paymentMethod} onChange={(e) => setCo({ ...co, paymentMethod: e.target.value })} className={ic}>
                      {['Bank Transfer', 'Direct Debit', 'Stripe', 'Credit Card'].map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </Field>
                  <Field label="Billing day of month"><input type="number" min="1" max="28" value={co.billingPeriodStart} onChange={(e) => setCo({ ...co, billingPeriodStart: e.target.value })} className={ic} /></Field>
                  <Field label="Tax rate"><input value={co.taxRate} onChange={(e) => setCo({ ...co, taxRate: e.target.value })} className={ic} /></Field>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={onClose} className="px-4 py-2 text-sm text-foreground border border-input rounded-md hover:bg-muted/50">Cancel</button>
                <button onClick={saveCompany} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">Next: Contact →</button>
              </div>
            </div>
          )}

          {/* Step 1 — Contact */}
          {step === 1 && (
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">Primary contact for <span className="font-medium text-foreground">{tenant?.businessName}</span>. Their email is used for signing, invoices and the portal invite.</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Full name" required><input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} className={ic} /></Field>
                <Field label="Email" required><input value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className={ic} /></Field>
                <Field label="Phone"><input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className={ic} /></Field>
              </div>
              <div className="flex flex-wrap gap-5 pt-1">
                {[['contactPerson', 'Contact person'], ['billingPerson', 'Billing person'], ['portalAccess', 'Portal access']].map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" checked={contact[k]} onChange={(e) => setContact({ ...contact, [k]: e.target.checked })} className="h-4 w-4 rounded border-input" /> {l}
                  </label>
                ))}
              </div>
              <div className="flex justify-between gap-3 pt-2">
                <button onClick={() => { setErr(''); setStep(0) }} className="px-4 py-2 text-sm text-foreground border border-input rounded-md hover:bg-muted/50">← Back</button>
                <button onClick={saveContact} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">Next: Contract →</button>
              </div>
            </div>
          )}

          {/* Step 2 — Contract (reuses ContractForm) */}
          {step === 2 && (
            <ContractForm
              editLease={{ tenantId: tenant.id, memberName: contact.name }}
              leases={leases}
              tenants={tenants}
              spaces={spaces}
              templates={templates}
              onSave={saveContract}
              onDiscard={() => setStep(1)}
              lockTenant
            />
          )}

          {/* Step 3 — Review & bill */}
          {step === 3 && (
            <div className="p-6 space-y-5">
              <div className="bg-green-50 border border-green-200 rounded-md p-4 text-sm text-green-800 flex items-center gap-2">
                <Check size={16} /> Company, contact and contract created.
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="border border-border rounded-xl p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Company</p>
                  <p className="font-medium text-foreground">{tenant?.businessName}</p>
                  <p className="text-muted-foreground text-xs mt-1">{contact.name} · {contact.email}</p>
                </div>
                <div className="border border-border rounded-xl p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Contract</p>
                  <p className="font-medium text-foreground">{lease?.contractNumber} · {unitName}</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    {lease?.startDate} – {lease?.endDate || '∞'} · ${Number(lease?.monthlyRent || 0).toLocaleString('en-AU')}/mo
                  </p>
                </div>
              </div>

              <div className="border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Billing</p>
                {depositAmount > 0 ? (
                  depositRaised ? (
                    <p className="text-sm text-green-700 flex items-center gap-2"><Check size={15} /> Security deposit invoice raised — ${depositAmount.toLocaleString('en-AU')} (due in 14 days).</p>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground">Security deposit: <span className="font-semibold">${depositAmount.toLocaleString('en-AU')}</span></span>
                      <button onClick={raiseDeposit} className="text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90">Raise deposit invoice</button>
                    </div>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">No security deposit on this contract.</p>
                )}
                <p className="text-xs text-muted-foreground mt-2">The first monthly invoice is raised automatically by the bill run for the billing period.</p>
              </div>

              <div className="flex justify-between gap-3 pt-1">
                <button onClick={() => finish(false)} className="px-4 py-2 text-sm text-foreground border border-input rounded-md hover:bg-muted/50">Finish</button>
                <button onClick={() => finish(true)} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">Finish & send for signing →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
