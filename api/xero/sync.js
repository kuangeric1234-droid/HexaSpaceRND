// POST /api/xero/sync — pushes platform invoices to Xero and pulls payment
// status back. Body: { action: 'push' | 'pull', dryRun?: boolean }
//
// HARD GATE: live sync only runs when Settings → Integrations → Xero has
// "Enable Xero sync" turned ON (settings.xero.syncEnabled), and only touches
// invoices whose period starts on/after settings.xero.syncFrom (default
// 2026-09-01). A dry run is allowed while sync is off — it reports what
// WOULD be pushed without writing anything to Xero or the platform.

import { getSupabase, loadConnection, stampConnection, xeroFetch, parseXeroDate } from './_client.js'
import { selectAllRows } from '../_db.js'
import { sendResendEmail } from '../_email.js'
import { brandFrame, bKicker, bH1, bP, bSmall } from '../_brand.js'

// ── account mapping (mirrors src/components/spaces/shared.jsx) ──────────────
const DEFAULT_XERO_ACCOUNTS = {
  deposits:      'Deposit in Advance (810)',
  membershipL45: 'L4&5 Membership Fees - Offices, Hotdesks, Virtual Offices (201)',
  oneOffL45:     'L4&5 Membership Fees - Parking Space & Other (202)',
  bookingL45:    'L4&5 Membership Fees - Meeting Rooms, Event Space & Media Studios (203)',
  orderL45:      'L4&5 Membership Fees - Meeting Rooms, Event Space & Media Studios (203)',
  membershipL2:  'L2 Membership Fees - Offices, Hotdesks, Virtual Offices (201.1)',
  parkingL2:     'L2 Membership Fees - Parking Space & Other (202.2)',
}

// Short code in trailing parens, e.g. "L4&5 … (201)" → "201".
function accountCode(s) {
  const m = String(s || '').match(/\(([^)]+)\)\s*$/)
  return m ? m[1] : ''
}

function lineAccountCode(li, invoice, space, settings) {
  const x = { ...DEFAULT_XERO_ACCOUNTS, ...(settings.xero?.revenueAccounts ?? {}) }
  const name = String(li.revenueAccount ?? '')
  const isL2 = space?.floor === 'l2'

  const direct = accountCode(name)
  if (direct) return direct
  if (invoice.invoiceType === 'deposit' || /deposit/i.test(name)) return accountCode(x.deposits)
  if (/booking|meeting|event|studio/i.test(name)) return accountCode(x.bookingL45)
  // Room/studio BOOKING lines whose revenue account carries no signal (e.g.
  // "Additional Services") — the description does: "Media Studios Booking …".
  if (/booking/i.test(String(li.description ?? ''))) return accountCode(x.bookingL45)
  if (/parking/i.test(name)) return accountCode(isL2 ? x.parkingL2 : x.oneOffL45)
  if (space?.type === 'parking') return accountCode(isL2 ? x.parkingL2 : x.oneOffL45)
  return accountCode(isL2 ? x.membershipL2 : x.membershipL45)
}

function invoiceTotal(inv) {
  return (inv.lineItems ?? []).reduce((sum, li) => {
    const net = Number(li.unitPrice ?? 0) * Number(li.qty ?? 1) * (1 - Number(li.discountPct ?? 0) / 100)
    return sum + net
  }, 0)
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function loadTable(supabase, table) {
  const rows = await selectAllRows(supabase, table)
  return rows.map((r) => r.data)
}

async function saveRow(supabase, table, id, data) {
  const { error } = await supabase.from(table).upsert({ id, data, updated_at: new Date().toISOString() })
  if (error) throw new Error(`${table}/${id}: ${error.message}`)
}

// Find-or-create the Xero contact for a tenant; caches ContactID on the tenant.
async function ensureContact(supabase, tenant, dryRun) {
  if (tenant.xeroContactId) return tenant.xeroContactId
  if (dryRun) return null

  const term = encodeURIComponent(tenant.businessName ?? tenant.contactName ?? tenant.email ?? '')
  const found = await xeroFetch(supabase, `/Contacts?searchTerm=${term}`)
  let contact = (found.json?.Contacts ?? []).find(
    (c) =>
      c.Name?.toLowerCase() === (tenant.businessName ?? '').toLowerCase() ||
      (tenant.email && c.EmailAddress?.toLowerCase() === tenant.email.toLowerCase())
  )

  if (!contact) {
    const created = await xeroFetch(supabase, '/Contacts', {
      method: 'POST',
      body: {
        Contacts: [{
          Name: tenant.businessName ?? tenant.contactName ?? tenant.email,
          FirstName: (tenant.contactName ?? '').split(' ')[0] || undefined,
          LastName: (tenant.contactName ?? '').split(' ').slice(1).join(' ') || undefined,
          EmailAddress: tenant.email || undefined,
          TaxNumber: tenant.abn || undefined,
        }],
      },
    })
    contact = created.json?.Contacts?.[0]
    if (!created.ok || !contact?.ContactID) {
      throw new Error(`Contact create failed for ${tenant.businessName}: ${JSON.stringify(created.json?.Elements?.[0]?.ValidationErrors ?? created.json)}`)
    }
  }

  tenant.xeroContactId = contact.ContactID
  await saveRow(supabase, 'tenants', tenant.id, tenant)
  return contact.ContactID
}

export default async function handler(req, res) {
  // GET = the scheduled auto-pull cron (marks platform invoices paid when
  // they've been reconciled in Xero); POST = the Settings UI actions.
  const isCron = req.method === 'GET'
  if (req.method !== 'POST' && !isCron) return res.status(405).json({ error: 'Method not allowed' })

  // Cron (GET, Bearer CRON_SECRET) or a verified admin (POST from Settings) only.
  const { requireCronOrAdmin } = await import('../_auth.js')
  const _g = await requireCronOrAdmin(req)
  if (!_g.ok) return res.status(_g.status).json({ error: _g.error })

  const { action = 'push', dryRun = false } = isCron ? { action: 'pull', dryRun: false } : (req.body ?? {})

  try {
    const supabase = getSupabase()
    const conn = await loadConnection(supabase)
    if (!conn?.refreshToken) {
      // The cron must not register as a failure while Xero simply isn't connected.
      if (isCron) return res.status(200).json({ skipped: 'Xero is not connected.' })
      return res.status(400).json({ error: 'Xero is not connected.' })
    }

    const { data: settRow } = await supabase.from('settings').select('data').eq('id', 'global').single()
    const settings = settRow?.data ?? {}
    const syncEnabled = settings.xero?.syncEnabled === true
    // Pull (payment status flowing BACK from Xero) can be enabled on its own,
    // ahead of the push go-live — it only ever marks platform invoices paid.
    const pullEnabled = syncEnabled || settings.xero?.pullEnabled === true
    const syncFrom = settings.xero?.syncFrom || '2026-09-01'

    if (!dryRun && action === 'pull' && !pullEnabled) {
      const msg = 'Xero pull is switched OFF in Settings — enable "Xero sync" or "Pull payments only" first.'
      return res.status(isCron ? 200 : 403).json(isCron ? { skipped: msg } : { error: msg })
    }
    if (!dryRun && action !== 'pull' && !syncEnabled) {
      return res.status(403).json({
        error: `Xero sync is switched OFF in Settings (planned go-live ${syncFrom}). Run a dry run to preview, or enable sync first.`,
      })
    }

    const [invoices, tenants, leases, spaces] = await Promise.all([
      loadTable(supabase, 'invoices'),
      loadTable(supabase, 'tenants'),
      loadTable(supabase, 'leases'),
      loadTable(supabase, 'spaces'),
    ])

    // ── PULL: mark platform invoices paid when they're paid in Xero ─────────
    if (action === 'pull') {
      // Overdue counts too — an unpaid invoice flips to 'overdue' after its
      // due date, and those are exactly the ones that get paid late.
      const candidates = invoices.filter((i) => i.xeroInvoiceId && ['pending', 'overdue'].includes(i.status))
      const paidMarked = [], partial = [], voidedInXero = [], receipts = [], linkedByNumber = []

      // Unpaid invoices with NO Xero link (migration/backfill gaps) are
      // invisible to the ID-based pull — try to adopt the Xero twin by invoice
      // number first. Xero raises its own INV-#### invoices with no platform
      // twin, so a number match only counts as the twin when it's an ACCREC
      // sales invoice AND the totals agree.
      const unlinked = invoices.filter((i) => !i.xeroInvoiceId && ['pending', 'overdue'].includes(i.status) && i.number)
      for (const batch of chunk(unlinked, 40)) {
        const nums = batch.map((i) => encodeURIComponent(i.number)).join(',')
        const r = await xeroFetch(supabase, `/Invoices?InvoiceNumbers=${nums}`)
        if (!r.ok) break // linking is best-effort; the ID-based pull below still runs
        for (const xi of r.json?.Invoices ?? []) {
          if (xi.Type !== 'ACCREC' || xi.Status === 'VOIDED' || xi.Status === 'DELETED') continue
          const inv = batch.find((i) => String(i.number).trim() === String(xi.InvoiceNumber).trim() && !i.xeroInvoiceId)
          if (!inv) continue
          const ownTotal = Math.round(invoiceTotal(inv) * (inv.vatEnabled !== false ? 1.1 : 1) * 100) / 100
          if (Math.abs(Number(xi.Total) - ownTotal) > 0.05) continue // same number, different invoice
          inv.xeroInvoiceId = xi.InvoiceID
          if (!dryRun) await saveRow(supabase, 'invoices', inv.id, inv)
          linkedByNumber.push({ number: inv.number })
          candidates.push(inv) // now visible to the paid check below
        }
      }

      for (const batch of chunk(candidates, 40)) {
        const ids = batch.map((i) => i.xeroInvoiceId).join(',')
        const r = await xeroFetch(supabase, `/Invoices?IDs=${ids}`)
        if (!r.ok) throw new Error(`Xero invoice fetch failed: ${JSON.stringify(r.json)}`)

        for (const xi of r.json?.Invoices ?? []) {
          const inv = batch.find((i) => i.xeroInvoiceId === xi.InvoiceID)
          if (!inv) continue
          if (xi.Status === 'PAID') {
            // Several platform invoices can share one combined Xero invoice
            // (migrated office+parking) — record each invoice's OWN total,
            // not the combined AmountPaid. Count ALL invoices sharing the
            // link (an already-paid group-mate still means "combined").
            const shared = invoices.filter((c) => c.xeroInvoiceId === xi.InvoiceID && c.status !== 'voided').length > 1
            const ownTotal = Math.round(invoiceTotal(inv) * (inv.vatEnabled !== false ? 1.1 : 1) * 100) / 100
            if (!dryRun) {
              inv.payments = [
                ...(inv.payments ?? []),
                {
                  id: `pay_xero_${xi.InvoiceID.slice(0, 8)}_${inv.id.slice(-4)}`,
                  amount: shared ? ownTotal : xi.AmountPaid,
                  date: parseXeroDate(xi.FullyPaidOnDate) ?? new Date().toISOString().split('T')[0],
                  method: 'xero',
                  reference: 'Synced from Xero',
                },
              ]
              inv.status = 'paid'
              await saveRow(supabase, 'invoices', inv.id, inv)
              receipts.push({ inv, amount: shared ? ownTotal : xi.AmountPaid })
            }
            paidMarked.push({ number: inv.number, amount: shared ? ownTotal : xi.AmountPaid })
          } else if (xi.Status === 'VOIDED' || xi.Status === 'DELETED') {
            voidedInXero.push({ number: inv.number }) // reported, never auto-voided here
          } else if (Number(xi.AmountPaid) > 0) {
            partial.push({ number: inv.number, paid: xi.AmountPaid, due: xi.AmountDue })
          }
        }
      }

      // Payment receipt to each tenant's billing contact (goes through the
      // central email guard — safe mode redirects until deliberately lifted).
      const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
      const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
      for (const { inv, amount } of receipts) {
        const tenant = tenants.find((t) => t.id === inv.tenantId)
        if (!tenant?.email) continue
        const inner =
          bKicker('Payment Receipt') +
          bH1(`$${Number(amount).toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`) +
          bP(`Hi ${tenant.contactName || tenant.businessName},`) +
          bP(`We've received your payment for invoice <strong>${inv.number}</strong>. Thank you — no further action is needed.`) +
          bSmall(`This is an automated receipt from ${fromName}. Questions about your account? Just reply to this email.`)
        await sendResendEmail({
          from: `${fromName} <${fromEmail}>`,
          to: tenant.email,
          subject: `Payment receipt — ${inv.number} (${fromName})`,
          html: brandFrame(inner, { footerLabel: 'Accounts' }),
        }).catch(() => {})
      }

      // stampConnection, NOT saveConnection({...conn}): getAccessToken rotated
      // the refresh token during this run — writing the stale conn back would
      // re-install the consumed token and kill the connection (forced reconnect).
      if (!dryRun) await stampConnection(supabase, { lastPull: new Date().toISOString() })
      return res.status(200).json({ action, dryRun, checked: candidates.length, paidMarked, receipted: receipts.length, partial, voidedInXero, linkedByNumber })
    }

    // ── PUSH: send unsynced invoices to Xero ─────────────────────────────────
    const gateDate = (i) => i.periodStart ?? i.issueDate ?? ''
    // Invoices RAISED on the platform after the OfficeRND cutover exist in no
    // other system — they must reach Xero even though their period predates the
    // syncFrom go-live (that gate only keeps MIGRATED history out). Without
    // this, a July-raised invoice has nothing in Xero to reconcile its bank
    // payment against.
    const NEW_INVOICE_PUSH_FROM = '2026-07-01'
    const eligible = [], skipped = []
    for (const i of invoices) {
      if (i.status === 'voided' || i.xeroSync) continue
      // Already linked to a Xero invoice (migration backfill or the pull's
      // number-adoption) — pushing again would create a duplicate.
      if (i.xeroInvoiceId) continue
      if (!['pending', 'paid', 'overdue'].includes(i.status)) continue
      if (gateDate(i) < syncFrom && (i.issueDate ?? '') < NEW_INVOICE_PUSH_FROM) { continue } // pre-go-live history stays out of Xero
      const total = invoiceTotal(i)
      if (total < 0) { skipped.push({ number: i.number, reason: 'credit note — push manually as ACCRECCREDIT' }); continue }
      eligible.push(i)
    }

    const taxRate = settings.billingRules?.taxEnabled !== false
    const results = { pushed: [], linked: [], errors: [], skipped }

    // Xero UPSERTS POST /Invoices by InvoiceNumber — if the number already
    // exists there (an earlier push that never got xeroInvoiceId stamped back,
    // or an invoice Xero raised itself from its own INV-#### sequence), the
    // push becomes an UPDATE of that invoice, and Xero rejects updates to paid
    // ones ("status AUTHORISED cannot be applied … has payments allocated").
    // Check first: a same-number ACCREC with the same total is OUR invoice
    // already in Xero — adopt it as synced instead of pushing. A same-number
    // invoice with a different total belongs to someone else — never push
    // onto it.
    const adopted = new Set(), taken = new Set()
    for (const batch of chunk(eligible, 40)) {
      const nums = batch.map((i) => encodeURIComponent(i.number)).join(',')
      const r = await xeroFetch(supabase, `/Invoices?InvoiceNumbers=${nums}`)
      if (!r.ok) break // best-effort — a collision then surfaces as a push validation error
      for (const xi of r.json?.Invoices ?? []) {
        if (xi.Status === 'VOIDED' || xi.Status === 'DELETED') continue
        const inv = batch.find((i) => String(i.number).trim() === String(xi.InvoiceNumber).trim())
        if (!inv) continue
        const ownTotal = Math.round(invoiceTotal(inv) * (inv.vatEnabled !== false ? 1.1 : 1) * 100) / 100
        if (xi.Type === 'ACCREC' && Math.abs(Number(xi.Total) - ownTotal) <= 0.05) {
          adopted.add(inv.number)
          results.linked.push({ number: inv.number, xeroInvoiceId: xi.InvoiceID })
          if (!dryRun) {
            inv.xeroInvoiceId = xi.InvoiceID
            inv.xeroSync = true
            inv.xeroSyncedAt = new Date().toISOString()
            await saveRow(supabase, 'invoices', inv.id, inv)
          }
        } else {
          taken.add(inv.number)
          skipped.push({ number: inv.number, reason: `number already used in Xero by a different invoice (${xi.Contact?.Name ?? '?'} $${xi.Total}) — renumber before pushing` })
        }
      }
    }
    const toPush = eligible.filter((i) => !adopted.has(i.number) && !taken.has(i.number))

    // Build payloads (and resolve contacts) invoice by invoice.
    const payloads = []
    for (const inv of toPush) {
      const tenant = tenants.find((t) => t.id === inv.tenantId)
      if (!tenant) { results.errors.push({ number: inv.number, error: 'No tenant on platform' }); continue }
      const lease = leases.find((l) => l.id === inv.leaseId)
      const space = spaces.find((s) => s.id === lease?.spaceId)

      let contactId = null
      try {
        contactId = await ensureContact(supabase, tenant, dryRun)
      } catch (err) {
        results.errors.push({ number: inv.number, error: err.message })
        continue
      }

      // Security deposits are never a taxable supply while held — force
      // GST-exempt regardless of the invoice's vatEnabled flag.
      const taxType = inv.invoiceType === 'deposit' ? 'EXEMPTOUTPUT'
        : (taxRate && inv.vatEnabled !== false ? 'OUTPUT' : 'EXEMPTOUTPUT')
      payloads.push({
        inv,
        xero: {
          Type: 'ACCREC',
          Contact: dryRun ? { Name: tenant.businessName } : { ContactID: contactId },
          InvoiceNumber: inv.number,
          Reference: lease?.contractNumber ?? '',
          Date: inv.issueDate,
          DueDate: inv.dueDate,
          Status: 'AUTHORISED',
          LineAmountTypes: 'Exclusive',
          CurrencyCode: 'AUD',
          LineItems: (inv.lineItems ?? []).map((li) => ({
            Description: li.description,
            Quantity: Number(li.qty ?? 1),
            UnitAmount: Number(li.unitPrice ?? 0),
            DiscountRate: Number(li.discountPct ?? 0) || undefined,
            AccountCode: lineAccountCode(li, inv, space, settings),
            TaxType: taxType,
          })),
        },
      })
    }

    if (dryRun) {
      return res.status(200).json({
        action, dryRun: true, syncEnabled, syncFrom,
        wouldPush: payloads.map((p) => ({
          number: p.inv.number,
          tenant: p.xero.Contact.Name ?? p.inv.tenantId,
          total: Math.round(invoiceTotal(p.inv) * 100) / 100,
          accounts: [...new Set(p.xero.LineItems.map((l) => l.AccountCode))],
        })),
        wouldLink: results.linked,
        skipped, errors: results.errors,
      })
    }

    // Live push, batched. SummarizeErrors=false → per-invoice validation results.
    for (const batch of chunk(payloads, 40)) {
      const r = await xeroFetch(supabase, '/Invoices?SummarizeErrors=false', {
        method: 'POST',
        body: { Invoices: batch.map((p) => p.xero) },
      })
      const returned = r.json?.Invoices ?? []
      for (let idx = 0; idx < batch.length; idx++) {
        const { inv } = batch[idx]
        const xi = returned[idx]
        const validationErrors = xi?.ValidationErrors ?? []
        if (xi?.InvoiceID && validationErrors.length === 0) {
          inv.xeroSync = true
          inv.xeroInvoiceId = xi.InvoiceID
          inv.xeroSyncedAt = new Date().toISOString()
          await saveRow(supabase, 'invoices', inv.id, inv)
          results.pushed.push({ number: inv.number, xeroInvoiceId: xi.InvoiceID })
        } else {
          results.errors.push({
            number: inv.number,
            error: validationErrors.map((e) => e.Message).join('; ') || `Xero rejected the batch (HTTP ${r.status})`,
          })
        }
      }
    }

    await stampConnection(supabase, { lastPush: new Date().toISOString() })
    return res.status(200).json({ action, dryRun: false, ...results })
  } catch (err) {
    console.error('Xero sync error:', err)
    return res.status(500).json({ error: err.message })
  }
}
