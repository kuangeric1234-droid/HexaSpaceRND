import { supabase } from '../../lib/supabase.js'
import { bookingFeeName, isPerkRoom, perkHoursUsed, companyPerk, round2, companyCanAfterHours, bookingWindow } from '../../lib/credits.js'

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
export async function createBooking({ room, date, startTime, endTime, title, member, company, allBookings, leases, spaces, settings }) {
  if (!isFree(allBookings, room.id, date, startTime, endTime)) {
    throw new Error('That time was just taken — please choose another slot.')
  }

  const hrs = Math.max(0, toDec(endTime) - toDec(startTime))

  // Booking window: everyone gets core hours; only 24/7 memberships reach the
  // extended (after-hours) window. Reject anything outside the company's band.
  const canAfterHours = companyCanAfterHours(company?.id, leases, spaces, settings)
  const win = bookingWindow(canAfterHours, settings)
  const hLabel = (h) => `${(h % 12) || 12}${h >= 12 ? 'pm' : 'am'}`
  if (toDec(startTime) < win.start || toDec(endTime) > win.end) {
    throw new Error(canAfterHours
      ? `Bookings are available from ${hLabel(win.start)} to ${hLabel(win.end)}.`
      : `That's outside business hours (${hLabel(win.start)}–${hLabel(win.end)}). After-hours booking is included with Private Office & Dedicated Desk memberships.`)
  }

  // Office perk: private-office (suite) companies book Sky/Earth/Sun/Moon free,
  // capped per booking + per company per day.
  const perk = companyPerk(company?.id, leases, spaces, settings)
  const isPerk = isPerkRoom(room, perk)
  if (isPerk) {
    if (hrs > perk.maxHoursPerBooking) throw new Error(`${room.unitNumber} is included with your membership — up to ${perk.maxHoursPerBooking}h per booking.`)
    const usedToday = perkHoursUsed({ companyId: company?.id, date, bookings: allBookings, perk, spaces })
    if (usedToday + hrs > perk.maxHoursPerDay) {
      throw new Error(`Your membership includes up to ${perk.maxHoursPerDay}h/day in these rooms — you have ${round2(Math.max(0, perk.maxHoursPerDay - usedToday))}h left today.`)
    }
  }

  const rate = room.hourlyRate ?? room.rate ?? 0
  const cost = isPerk ? 0 : hrs * rate
  const perCredits = Math.round((cost / CREDIT_VALUE) * 100) / 100

  const bal = creditBalance(company)
  const used = isPerk ? 0 : Math.max(0, Math.min(bal, perCredits))
  const newBal = isPerk ? bal : Math.round((bal - used) * 100) / 100
  const shortfall = isPerk ? 0 : Math.round((perCredits - used) * 100) / 100

  const booking = {
    id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    reference: `BKG-${Math.floor(100000 + Math.random() * 900000)}`,
    resourceId: room.id, memberId: member?.id ?? '', companyId: company?.id ?? '',
    date, startTime, endTime, title: title || '',
    status: 'Pending', source: 'Portal', repeat: 'none', createdBy: 'Member',
    createdAt: new Date().toISOString().split('T')[0],
    creditsUsed: used,
    paidBy: isPerk ? 'included' : (shortfall > 0 ? (used > 0 ? 'part_credits' : 'fee') : 'credits'),
  }

  const nowIso = new Date().toISOString()
  const updatedCompany = (!isPerk && company?.id)
    ? { ...company, creditsRemaining: newBal, creditsPeriod: monthKey() }
    : company

  const writes = [supabase.from('bookings').upsert({ id: booking.id, data: booking, updated_at: nowIso })]
  if (!isPerk && company?.id) {
    // update, not upsert: members have UPDATE-only RLS on tenants.
    writes.push(supabase.from('tenants').update({ data: updatedCompany, updated_at: nowIso }).eq('id', company.id))
  }

  let fee = null
  if (!isPerk && shortfall > 0 && company?.id) {
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
