// ── Function Space Hire — shared pricing engine, constants & terms ────────────
// Single source of truth used by the admin hub (FunctionBookings.jsx), the public
// agreement/sign page (FunctionSignPage.jsx) and the members portal
// (PortalFunction.jsx). Keeping the maths in one place means the price the client
// sees on the website, in the agreement and on their invoice is always identical.

// Rates are quoted EX-GST. Weekday vs weekend is decided by the event date.
export const RATES = { weekday: 250, weekend: 325 }
export const CLEANING_FEE = 200          // mandatory, ex-GST
export const SECURITY_DEPOSIT = 300      // fixed, refundable, no GST
export const LATE_FEE = 250              // booked within LATE_WINDOW_DAYS of the event
export const LATE_WINDOW_DAYS = 7
export const STAFF_RATE = 40             // per hour, ex-GST
export const STAFF_GUEST_THRESHOLD = 80  // staff only charged for functions over 80 pax
export const GST_RATE = 0.10
export const DEPOSIT_PCT = 0.5           // non-refundable deposit = 50% of venue hire
export const BUFFER_MIN = 30             // 30-min turnover buffer each side of the event
export const BALANCE_DUE_DAYS = 14       // full balance due this many days before the event

// Selectable add-ons (staff is auto-applied for 80+ pax, so it isn't listed here).
export const ADDONS = [
  { key: 'parking', label: 'Additional onsite parking', price: 100 },
  { key: 'nameTags', label: 'Name tags', price: 50 },
  { key: 'photographer', label: 'Event photographer', price: 600 },
]

const round = (n) => Math.round((Number(n) || 0) * 100) / 100

// ── Time helpers ──────────────────────────────────────────────────────────────
export function toMin(t) {
  const [h, m] = String(t || '0:0').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
export function fromMin(x) {
  const clamped = Math.max(0, Math.min(24 * 60, x))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
export function shiftTime(t, deltaMin) {
  return fromMin(toMin(t) + deltaMin)
}
export function hoursBetween(start, end) {
  return Math.max(0, (toMin(end) - toMin(start)) / 60)
}
export function isWeekendDate(dateStr) {
  if (!dateStr) return false
  const d = new Date(`${dateStr}T00:00:00`)
  const day = d.getDay()
  return day === 0 || day === 6
}
function daysBetween(fromStr, toStr) {
  if (!fromStr || !toStr) return null
  const a = new Date(`${fromStr}T00:00:00`)
  const b = new Date(`${toStr}T00:00:00`)
  return Math.floor((b - a) / 86400000)
}

// The physical calendar hold — event window widened by the 30-min buffer each side.
export function bufferedWindow(startTime, endTime) {
  return {
    blockStart: shiftTime(startTime, -BUFFER_MIN),
    blockEnd: shiftTime(endTime, BUFFER_MIN),
  }
}

// ── Pricing engine ──────────────────────────────────────────────────────────
// input: { eventDate, startTime, endTime, guests, addons:{parking,nameTags,photographer}, bookedOn }
// bookedOn defaults to eventDate (no late fee) if not supplied — callers that know
// "today" should pass it so the late-booking surcharge auto-applies.
export function computeQuote(input = {}) {
  const { eventDate, startTime, endTime, guests, addons = {}, bookedOn } = input
  const isWeekend = isWeekendDate(eventDate)
  const rate = isWeekend ? RATES.weekend : RATES.weekday
  const hours = round(hoursBetween(startTime, endTime))

  const rental = round(rate * hours)
  const rentalDeposit = round(rental * DEPOSIT_PCT)
  const rentalBalance = round(rental - rentalDeposit)

  const cleaning = CLEANING_FEE
  const staffApplies = Number(guests) > STAFF_GUEST_THRESHOLD
  const staff = staffApplies ? round(STAFF_RATE * hours) : 0
  const parking = addons.parking ? 100 : 0
  const nameTags = addons.nameTags ? 50 : 0
  const photographer = addons.photographer ? 600 : 0
  const addonsTotal = round(staff + parking + nameTags + photographer)

  const days = daysBetween(bookedOn, eventDate)
  const lateFee = days != null && days >= 0 && days < LATE_WINDOW_DAYS ? LATE_FEE : 0

  const taxable = round(rental + cleaning + addonsTotal + lateFee)
  const gst = round(taxable * GST_RATE)
  const total = round(taxable + gst)

  // Payable now = 50% rental deposit (+ its GST) + refundable security deposit.
  const depositGst = round(rentalDeposit * GST_RATE)
  const dueNow = round(rentalDeposit + depositGst + SECURITY_DEPOSIT)
  const balanceDue = round(total - (rentalDeposit + depositGst))

  return {
    isWeekend, rate, hours,
    rental, rentalDeposit, rentalBalance,
    cleaning, staff, staffApplies, parking, nameTags, photographer, addonsTotal,
    lateFee,
    taxable, gst, total,
    securityDeposit: SECURITY_DEPOSIT,
    depositGst, dueNow, balanceDue,
  }
}

// Balance invoice due date = BALANCE_DUE_DAYS before the event (YYYY-MM-DD).
export function balanceDueDate(eventDate) {
  if (!eventDate) return null
  const d = new Date(`${eventDate}T00:00:00`)
  d.setDate(d.getDate() - BALANCE_DUE_DAYS)
  return d.toISOString().split('T')[0]
}

// ── Terms & Conditions (from the Function Space Hire Form) ────────────────────
// Shown in full on the agreement/sign page; the client must tick to accept.
export const TERMS_INTRO =
  '"Hexa Space" refers to the function space within our workspace, available for rental. ' +
  '"Client" refers to the individual or entity renting Hexa Space for an event. ' +
  '"Event" refers to the specific gathering or occasion for which the Client is renting Hexa Space.'

export const TERMS = [
  { title: 'Rental Fees', body: 'The venue hire rate for Hexa Space is $250 +GST per hour on weekdays and $325 +GST per hour on weekends. These fees must be paid in full at least 14 days prior to the event date. A non-refundable deposit of 50% of the total rental fee is required at the time of booking to secure the reservation.' },
  { title: 'Booking Confirmation', body: 'Bookings only commence once the deposit has been paid. No reservation is confirmed or held until Hexa Space has received the required deposit.' },
  { title: 'Cleaning Fee', body: 'A mandatory cleaning fee of $200 +GST will be added to the total rental cost. This fee covers the basic cleaning and maintenance of Hexa Space after the event.' },
  { title: 'Security Deposit', body: 'A refundable security deposit of $300 is required at the time of booking. The security deposit will be refunded within 5 business days after the event, provided that no damages or additional fees have been incurred.' },
  { title: 'Bump-In / Bump-Out', body: 'Each booking includes 1 hour of complimentary bump-in and 1 hour of complimentary bump-out. Additional set-up or pack-down time is charged at a rate per 30 minutes. A 30-minute turnover buffer is reserved before and after your event.' },
  { title: 'Meeting Rooms', body: 'All meeting rooms remain locked by default. Where meeting room access is required, the Hexa team will book the rooms internally to avoid clashes with other bookings.' },
  { title: 'Liability', body: 'The Client agrees to indemnify, defend, and hold harmless Hexa Space, its owners, employees, agents, and representatives from any and all claims, liabilities, damages, or expenses (including reasonable attorney’s fees) arising from or related to the use of Hexa Space for the Event, except for any claims or liabilities caused solely by the negligence or misconduct of Hexa Space.' },
  { title: 'Damages & Additional Charges', body: 'The Client is responsible for any damages to Hexa Space or its property caused by the Client, their guests, or any third-party vendors hired by the Client. The cost of any necessary repairs or replacements will be deducted from the security deposit. If the damages exceed the security deposit amount, the Client will be billed for the additional costs. Additional cleaning and/or damage fees apply in cases of misconduct, excessive cleaning requirements, or venue damage.' },
  { title: 'Rules and Regulations', body: 'The Client is responsible for obtaining any necessary permits, licenses, or approvals required for the Event. The Client shall ensure that the noise level during the Event does not exceed any applicable legal limits or cause a disturbance to others. Smoking is not allowed inside Hexa Space. The Client agrees to comply with all applicable laws, ordinances, and regulations during the Event.' },
  { title: 'Late Booking Fee', body: 'A $250 surcharge applies to any booking made within 7 days of the event date.' },
  { title: 'Cancellation Policy', body: 'If the Client cancels the Event more than 30 days prior to the scheduled date, the initial deposit will be forfeited. If the Client cancels the Event within 14 to 30 days before the scheduled date, the Client will be responsible for 75% of the total rental fee. If the Client cancels the Event within 14 days of the scheduled date, the Client will be responsible for 100% of the total rental fee.' },
  { title: 'Force Majeure', body: 'Neither party shall be liable for any failure to perform its obligations under this Agreement if such failure is caused by events beyond its reasonable control, such as acts of God, war, terrorism, civil unrest, natural disasters, or any other similar occurrences.' },
]

// ── Lifecycle stages ──────────────────────────────────────────────────────────
export const STAGES = {
  enquiry:          { label: 'Enquiry',        cls: 'bg-gray-100 text-gray-600' },
  quoted:           { label: 'Quoted',         cls: 'bg-slate-100 text-slate-700' },
  agreement_sent:   { label: 'Agreement Sent', cls: 'bg-blue-100 text-blue-700' },
  pending_approval: { label: 'Awaiting Approval', cls: 'bg-amber-100 text-amber-700' },
  signed:           { label: 'Signed',         cls: 'bg-yellow-100 text-yellow-700' },
  confirmed:        { label: 'Confirmed',      cls: 'bg-green-100 text-green-700' },
  completed:        { label: 'Completed',      cls: 'bg-teal-100 text-teal-700' },
  refunded:         { label: 'Deposit Refunded', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled:        { label: 'Cancelled',      cls: 'bg-red-100 text-red-600' },
}

export function money(v) {
  const n = Number(v) || 0
  return `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
