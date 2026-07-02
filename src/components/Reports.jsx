import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { Download, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

function fmtAud(n) {
  return `$${Number(n ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
}

const EMAIL_TYPE_LABEL = {
  invoice:  { label: 'Invoice',  cls: 'bg-blue-100 text-blue-700' },
  reminder: { label: 'Reminder', cls: 'bg-red-100 text-red-700' },
  receipt:  { label: 'Receipt',  cls: 'bg-green-100 text-green-700' },
  renewal:  { label: 'Renewal',  cls: 'bg-amber-100 text-amber-700' },
  esign:    { label: 'eSign',    cls: 'bg-purple-100 text-purple-700' },
  general:  { label: 'General',  cls: 'bg-gray-100 text-gray-600' },
}

export default function Reports() {
  const { invoices, tenants, settings } = useOutletContext()
  const [tab, setTab] = useState('financial')
  const [emailLog, setEmailLog] = useState([])
  const [emailLoading, setEmailLoading] = useState(false)
  const [auditLog, setAuditLog] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [months] = useState(12)

  const taxRate = (settings?.billingRules?.taxRate ?? 10) / 100

  useEffect(() => {
    if (tab !== 'email') return
    setEmailLoading(true)
    supabase.from('email_log').select('data').order('updated_at', { ascending: false }).limit(200)
      .then(({ data }) => {
        setEmailLog((data ?? []).map((r) => r.data).filter(Boolean))
        setEmailLoading(false)
      })
  }, [tab])

  useEffect(() => {
    if (tab !== 'audit') return
    setAuditLoading(true)
    supabase.from('audit_log').select('data').order('updated_at', { ascending: false }).limit(300)
      .then(({ data }) => {
        setAuditLog((data ?? []).map((r) => r.data).filter(Boolean))
        setAuditLoading(false)
      })
  }, [tab])

  // ── Financial calculations ─────────────────────────────────────────────
  // Build month buckets for last N months
  const today = new Date()
  const monthBuckets = Array.from({ length: months }, (_, i) => {
    const d = subMonths(startOfMonth(today), months - 1 - i)
    return format(d, 'yyyy-MM')
  })

  function invTotal(inv) {
    const sub = (inv.lineItems ?? []).reduce((s, l) => s + Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100, 0)
    const gst = inv.vatEnabled !== false ? Math.round(sub * taxRate * 100) / 100 : 0
    return sub + gst
  }

  const monthlyData = monthBuckets.map((month) => {
    const monthInvoices = invoices.filter((inv) =>
      inv.status !== 'voided' && inv.issueDate?.startsWith(month)
    )
    const invoiced = monthInvoices.reduce((s, inv) => s + invTotal(inv), 0)

    const collected = invoices.reduce((s, inv) => {
      const monthPays = (inv.payments ?? []).filter((p) => p.date?.startsWith(month))
      return s + monthPays.reduce((a, p) => a + Number(p.amount), 0)
    }, 0)

    const outstanding = monthInvoices
      .filter((inv) => inv.status !== 'paid')
      .reduce((s, inv) => {
        const paid = (inv.payments ?? []).reduce((a, p) => a + Number(p.amount), 0)
        return s + Math.max(0, invTotal(inv) - paid)
      }, 0)

    return { month, invoiced, collected, outstanding, count: monthInvoices.length }
  })

  // By-tenant outstanding
  const tenantOutstanding = tenants.map((t) => {
    const tInvoices = invoices.filter((inv) => inv.tenantId === t.id && inv.status !== 'voided')
    const totalInvoiced = tInvoices.reduce((s, inv) => s + invTotal(inv), 0)
    const totalPaid = tInvoices.reduce((s, inv) => s + (inv.payments ?? []).reduce((a, p) => a + Number(p.amount), 0), 0)
    const outstanding = Math.max(0, totalInvoiced - totalPaid)
    const overdueCount = tInvoices.filter((inv) => inv.status === 'overdue').length
    return { tenant: t, totalInvoiced, totalPaid, outstanding, overdueCount }
  }).filter((r) => r.totalInvoiced > 0).sort((a, b) => b.outstanding - a.outstanding)

  // Totals
  const totals = monthlyData.reduce((acc, m) => ({
    invoiced: acc.invoiced + m.invoiced,
    collected: acc.collected + m.collected,
    outstanding: acc.outstanding + m.outstanding,
  }), { invoiced: 0, collected: 0, outstanding: 0 })

  function exportFinancialCSV() {
    const rows = [['Month', 'Invoices', 'Total Invoiced', 'Collected', 'Outstanding']]
    monthlyData.forEach((m) => rows.push([m.month, m.count, m.invoiced.toFixed(2), m.collected.toFixed(2), m.outstanding.toFixed(2)]))
    rows.push(['TOTAL', '', totals.invoiced.toFixed(2), totals.collected.toFixed(2), totals.outstanding.toFixed(2)])
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `financial_report_${format(today, 'yyyy-MM-dd')}.csv`
    a.click()
  }

  function exportTenantCSV() {
    const rows = [['Tenant', 'Total Invoiced', 'Total Paid', 'Outstanding', 'Overdue Invoices']]
    tenantOutstanding.forEach((r) => rows.push([r.tenant.businessName, r.totalInvoiced.toFixed(2), r.totalPaid.toFixed(2), r.outstanding.toFixed(2), r.overdueCount]))
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `tenant_outstanding_${format(today, 'yyyy-MM-dd')}.csv`
    a.click()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Financial history and activity logs</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border mb-6">
        {[['financial', 'Financial Report'], ['email', 'Email Activity Log'], ['audit', 'Audit Log']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Financial Report ── */}
      {tab === 'financial' && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              ['Total Invoiced (12 mo)', fmtAud(totals.invoiced), 'text-foreground'],
              ['Total Collected (12 mo)', fmtAud(totals.collected), 'text-green-700'],
              ['Total Outstanding', fmtAud(totals.outstanding), totals.outstanding > 0 ? 'text-red-600' : 'text-foreground'],
            ].map(([label, value, cls]) => (
              <div key={label} className="bg-card border border-border rounded-xl shadow-sm p-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                <p className={`text-2xl font-bold ${cls}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Monthly table */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground text-sm">Monthly Breakdown — Last 12 Months</h3>
              <button onClick={exportFinancialCSV}
                className="flex items-center gap-1.5 text-xs border border-input rounded px-3 py-1.5 text-foreground hover:bg-muted/50">
                <Download size={12} /> Export CSV
              </button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Month', 'Invoices', 'Total Invoiced', 'Collected', 'Outstanding'].map((h) => (
                    <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((row) => (
                  <tr key={row.month} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-5 py-3 font-medium text-foreground">{format(parseISO(`${row.month}-01`), 'MMM yyyy')}</td>
                    <td className="px-5 py-3 text-muted-foreground">{row.count}</td>
                    <td className="px-5 py-3 text-foreground">{fmtAud(row.invoiced)}</td>
                    <td className="px-5 py-3 text-green-700">{fmtAud(row.collected)}</td>
                    <td className={`px-5 py-3 font-medium ${row.outstanding > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{fmtAud(row.outstanding)}</td>
                  </tr>
                ))}
                <tr className="bg-muted/50 border-t-2 border-border font-semibold">
                  <td className="px-5 py-3 text-foreground">Total</td>
                  <td className="px-5 py-3 text-muted-foreground">{monthlyData.reduce((s, m) => s + m.count, 0)}</td>
                  <td className="px-5 py-3 text-foreground">{fmtAud(totals.invoiced)}</td>
                  <td className="px-5 py-3 text-green-700">{fmtAud(totals.collected)}</td>
                  <td className={`px-5 py-3 ${totals.outstanding > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{fmtAud(totals.outstanding)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* By-tenant outstanding */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground text-sm">Outstanding Balance by Tenant</h3>
              <button onClick={exportTenantCSV}
                className="flex items-center gap-1.5 text-xs border border-input rounded px-3 py-1.5 text-foreground hover:bg-muted/50">
                <Download size={12} /> Export CSV
              </button>
            </div>
            {tenantOutstanding.length === 0 ? (
              <p className="px-5 py-5 text-sm text-muted-foreground">No invoice data yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {['Tenant', 'Total Invoiced', 'Total Paid', 'Outstanding', 'Overdue'].map((h) => (
                      <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tenantOutstanding.map(({ tenant, totalInvoiced, totalPaid, outstanding, overdueCount }) => (
                    <tr key={tenant.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="px-5 py-3 font-medium text-foreground">{tenant.businessName}</td>
                      <td className="px-5 py-3 text-muted-foreground">{fmtAud(totalInvoiced)}</td>
                      <td className="px-5 py-3 text-green-700">{fmtAud(totalPaid)}</td>
                      <td className={`px-5 py-3 font-semibold ${outstanding > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{fmtAud(outstanding)}</td>
                      <td className="px-5 py-3">
                        {overdueCount > 0 ? <span className="text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded">{overdueCount} overdue</span> : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Email Activity Log ── */}
      {tab === 'email' && (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Mail size={15} /> Email Activity Log
            </h3>
            <span className="text-xs text-muted-foreground">{emailLog.length} recent emails</span>
          </div>
          {emailLoading ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Loading…</p>
          ) : emailLog.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">No emails logged yet. Emails will appear here after being sent.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Sent At', 'Type', 'To', 'Subject', 'Tenant', 'Attachment'].map((h) => (
                    <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {emailLog.map((log) => {
                  const typeMeta = EMAIL_TYPE_LABEL[log.emailType] ?? EMAIL_TYPE_LABEL.general
                  const tenant = tenants.find((t) => t.id === log.tenantId)
                  return (
                    <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="px-5 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {log.sentAt ? format(parseISO(log.sentAt), 'dd/MM/yyyy HH:mm') : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${typeMeta.cls}`}>{typeMeta.label}</span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{log.to}</td>
                      <td className="px-5 py-3 text-foreground text-xs max-w-xs truncate">{log.subject}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{tenant?.businessName ?? '—'}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{log.hasAttachment ? '📎 Yes' : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Audit Log ── */}
      {tab === 'audit' && (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground text-sm">Audit Log</h3>
            <span className="text-xs text-muted-foreground">{auditLog.length} recent events</span>
          </div>
          {auditLoading ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Loading…</p>
          ) : auditLog.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">No audit events yet. Actions will be logged here automatically.</p>
          ) : (
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {['Time', 'Action', 'Type', 'Name', 'User'].map((h) => (
                      <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((log) => {
                    const actionStyle = {
                      create: 'bg-green-100 text-green-700',
                      update: 'bg-blue-100 text-blue-700',
                      delete: 'bg-red-100 text-red-700',
                      void:   'bg-orange-100 text-orange-700',
                      send:   'bg-purple-100 text-purple-700',
                      sign:   'bg-teal-100 text-teal-700',
                    }[log.action] ?? 'bg-gray-100 text-gray-600'
                    return (
                      <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                        <td className="px-5 py-3 text-muted-foreground text-xs whitespace-nowrap">
                          {log.timestamp ? format(parseISO(log.timestamp), 'dd/MM/yyyy HH:mm') : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${actionStyle}`}>{log.action}</span>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground text-xs capitalize">{log.entityType}</td>
                        <td className="px-5 py-3 text-foreground text-xs font-medium">{log.entityName || log.entityId}</td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">{log.userEmail}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
