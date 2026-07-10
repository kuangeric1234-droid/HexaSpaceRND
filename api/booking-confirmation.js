// POST /api/booking-confirmation — booking email for ADMIN-made meeting-room
// bookings: sent to the member it was booked for, cc info@ (ops). Covers the
// original confirmation plus admin edits: kind 'amended' (e.g. extended time)
// and 'cancelled'. Member-made bookings use the portal flow (notify-booking).
// Admin-authed. Body: { bookingId, kind?: 'new' | 'amended' | 'cancelled' }
import { requireAdmin } from './_auth.js'
import { sendResendEmail } from './_email.js'
import { brandFrame, bKicker, bH1, bP, bTable, bSmall } from './_brand.js'
import { applyCors } from './_cors.js'

const OPS_EMAIL = 'info@hexaspace.com.au'

const dmy = (d) => String(d || '').split('-').reverse().join('/')
const to12 = (t) => { let [h, m] = String(t || '0:0').split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')}${ap}` }

export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await requireAdmin(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })
  const sb = auth.sb

  const { bookingId, kind = 'new' } = req.body ?? {}
  if (!bookingId) return res.status(400).json({ error: 'bookingId is required.' })

  try {
    const { data: rows } = await sb.from('bookings').select('data').eq('id', bookingId)
    const b = rows?.[0]?.data
    if (!b) return res.status(404).json({ error: 'Booking not found.' })

    const [{ data: spRows }, { data: mRows }, { data: tRows }] = await Promise.all([
      sb.from('spaces').select('data').eq('id', b.resourceId),
      b.memberId ? sb.from('members').select('data').eq('id', b.memberId) : Promise.resolve({ data: [] }),
      b.companyId ? sb.from('tenants').select('data').eq('id', b.companyId) : Promise.resolve({ data: [] }),
    ])
    const room = spRows?.[0]?.data
    // Meeting rooms only — event/function spaces have their own booking flows.
    if (room && room.type !== 'meeting') return res.status(200).json({ skipped: 'not a meeting room' })

    const member = mRows?.[0]?.data
    const company = tRows?.[0]?.data?.businessName || b.companyName || ''
    const roomName = room?.unitNumber || b.resourceName || 'Meeting room'
    const memberEmail = member?.email || null
    const firstName = String(member?.name || '').split(' ')[0] || 'there'

    const copy = {
      new: {
        kicker: 'Booking Confirmation', h1: 'Your meeting room is booked ✅', subject: 'Booking confirmed',
        lead: `Hi ${firstName}, we've booked <strong>${roomName}</strong> for you${company ? ` (${company})` : ''}. Here are the details:`,
        outro: 'Your access pass unlocks the meeting room from 15 minutes before your booking. Need to change or cancel? Reply to this email or manage it in the member portal.',
      },
      amended: {
        kicker: 'Booking Updated', h1: 'Your booking has been updated 🕒', subject: 'Booking updated',
        lead: `Hi ${firstName}, the details of your <strong>${roomName}</strong> booking have changed. Here are the new details:`,
        outro: 'Your door access adjusts to the new time automatically — your pass unlocks the room from 15 minutes before the booking. Questions? Just reply to this email.',
      },
      cancelled: {
        kicker: 'Booking Cancelled', h1: 'Your booking has been cancelled', subject: 'Booking cancelled',
        lead: `Hi ${firstName}, your <strong>${roomName}</strong> booking below has been cancelled. Any credits it used have been returned to your allowance.`,
        outro: 'Need to rebook? Reply to this email or book any time in the member portal.',
      },
    }[kind] ?? {}

    const inner =
      bKicker(copy.kicker ?? 'Booking') +
      bH1(copy.h1 ?? 'Booking update') +
      bP(copy.lead ?? '') +
      bTable([
        ['Room', roomName, true],
        ['Date', dmy(b.date), true],
        ['Time', `${to12(b.startTime)} – ${to12(b.endTime)}`, true],
        ...(b.repeat && b.repeat !== 'none' ? [['Repeats', b.repeat, true]] : []),
        ['Reference', b.reference || '—', true],
        ...(kind !== 'cancelled' && Number(b.creditsUsed) > 0 ? [['Credits used', String(b.creditsUsed), true]] : []),
      ]) +
      bP(copy.outro ?? '') +
      bSmall('Sent by the Hexa Space team.')

    const r = await sendResendEmail({
      from: 'Hexa Space <noreply@hexaspace.com.au>',
      to: memberEmail ?? OPS_EMAIL,
      // Ops always gets a copy; when the member has no email on file the
      // main send above already goes to ops instead.
      ...(memberEmail ? { cc: OPS_EMAIL } : {}),
      replyTo: OPS_EMAIL,
      subject: `${copy.subject ?? 'Booking update'}: ${roomName} — ${dmy(b.date)} ${to12(b.startTime)}${memberEmail ? '' : ' (no member email on file)'}`,
      html: brandFrame(inner, { footerLabel: 'Bookings' }),
    })
    return res.status(200).json({ sent: !!r?.ok, to: memberEmail ?? OPS_EMAIL })
  } catch (err) {
    console.error('booking-confirmation error:', err)
    return res.status(500).json({ error: 'Could not send the confirmation.' })
  }
}
