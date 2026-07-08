import { supabase } from '../../lib/supabase.js'
import { bookingFeeName } from '../../lib/credits.js'

// Booking writes for the app — mirrors the portal's PortalCalendar confirm()
// exactly (same bookings/fees/tenants writes, same credit model) so the two
// surfaces stay in lock-step. 1 credit = A$40; overage becomes a Booking Fee
// on the month-end bill. Keep in sync with PortalCalendar.jsx.

export const CREDIT_VALUE = 40

export const toDec = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return h + m / 60 }
export const fromDec = (d) => `${String(Math.floor(d)).padStart(2, '0')}:${String(Math.round((d % 1) * 60)).padStart(2, '0')}`
export const overlaps = (aS, aE, bS, bE) => toDec(aS) < toDec(bE) && toDec(bS) < toDec(aE)

export function isFree(allBookings, resourceId, date, startTime, endTime) {
  return !(allBookings ?? []).some((b) =>
    b.resourceId === resourceId && b.date === date && b.status !== 'Cancelled' &&
    overlaps(startTime, endTime, b.startTime, b.endTime))
}

const monthKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Company credit balance right now (monthly pool, resets on a new month). */
export function creditBalance(company) {
  return company?.creditsPeriod === monthKey()
    ? Number(company?.creditsRemaining ?? 0)
    : Number(company?.monthlyAllowance ?? company?.creditsRemaining ?? 0)
}

/**
 * Create a single booking request: writes the booking, deducts the company's
 * credit pool, raises a Booking Fee for any overage.
 * Returns { booking, company: updatedCompany, fee } — throws on clash/db error.
 */
export async function createBooking({ room, date, startTime, endTime, title, member, company, allBookings }) {
  if (!isFree(allBookings, room.id, date, startTime, endTime)) {
    throw new Error('That time was just taken — please choose another slot.')
  }

  const rate = room.hourlyRate ?? room.rate ?? 0
  const hrs = Math.max(0, toDec(endTime) - toDec(startTime))
  const cost = hrs * rate
  const perCredits = Math.round((cost / CREDIT_VALUE) * 100) / 100

  const bal = creditBalance(company)
  const used = Math.max(0, Math.min(bal, perCredits))
  const newBal = Math.round((bal - used) * 100) / 100
  const shortfall = Math.round((perCredits - used) * 100) / 100

  const booking = {
    id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    reference: `BKG-${Math.floor(100000 + Math.random() * 900000)}`,
    resourceId: room.id, memberId: member?.id ?? '', companyId: company?.id ?? '',
    date, startTime, endTime, title: title || '',
    status: 'Pending', source: 'Portal', repeat: 'none', createdBy: 'Member',
    createdAt: new Date().toISOString().split('T')[0],
    creditsUsed: used,
    paidBy: shortfall > 0 ? (used > 0 ? 'part_credits' : 'fee') : 'credits',
  }

  const nowIso = new Date().toISOString()
  const updatedCompany = company?.id
    ? { ...company, creditsRemaining: newBal, creditsPeriod: monthKey() }
    : company

  const writes = [supabase.from('bookings').upsert({ id: booking.id, data: booking, updated_at: nowIso })]
  if (company?.id) {
    // update, not upsert: members have UPDATE-only RLS on tenants.
    writes.push(supabase.from('tenants').update({ data: updatedCompany, updated_at: nowIso }).eq('id', company.id))
  }

  let fee = null
  if (shortfall > 0 && company?.id) {
    const feeId = `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    fee = {
      id: feeId,
      name: bookingFeeName({
        roomName: room.unitNumber, rate, date, startTime, endTime, usedCredits: used,
      }),
      type: 'Booking Fee', memberId: member?.id ?? null, companyId: company.id,
      date: new Date().toISOString().split('T')[0],
      price: Math.round(shortfall * CREDIT_VALUE * 100) / 100,
      status: 'Not Paid', notes: `Portal booking · ${shortfall} credits over allowance`,
      createdAt: new Date().toISOString().split('T')[0],
    }
    writes.push(supabase.from('fees').upsert({ id: feeId, data: fee, updated_at: nowIso }))
  }

  const results = await Promise.all(writes)
  const dbErr = results.find((r) => r.error)?.error
  if (dbErr) throw new Error(dbErr.message)

  return { booking, company: updatedCompany, fee }
}
