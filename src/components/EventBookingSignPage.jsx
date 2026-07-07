import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import SignatureCanvas from './SignatureCanvas.jsx'
import { generateAgreementPdf } from '../lib/generateAgreementPdf.js'

// Read a File/Blob as a base64 data URL for POSTing to the upload endpoint.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

// ── Lonsdale 369 permanent pop-up venue ───────────────────────────────────────
// TODO CONFIRM: set the real Lonsdale 369 street address below.
const POPUP_VENUE = 'Lonsdale 369'
const POPUP_ADDRESS = '369 Lonsdale Street, Melbourne VIC 3000'

function fmtDate(d) {
  if (!d) return '—'
  try { return format(parseISO(d), 'EEEE, d MMMM yyyy') } catch { return d }
}
function fmtTime(t) {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}
function fmtMoney(v) {
  if (!v && v !== 0) return null
  return `$${Number(v).toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`
}

// ── Document 1: Event Venue Licence Agreement (verbatim) ──────────────────────

function LicenceAgreementDoc({ booking }) {
  const b = booking
  const vendorDisplay = [b.vendorBusiness, b.vendorName].filter(Boolean).join(' — ')
  const today = format(new Date(), 'd MMMM yyyy')
  const venueName = b.venue || POPUP_VENUE
  const venueAddress = b.venueAddress || POPUP_ADDRESS
  const period = b.bookingStartDate && b.bookingEndDate
    ? `${fmtDate(b.bookingStartDate)} – ${fmtDate(b.bookingEndDate)}`
    : (b.eventDate ? fmtDate(b.eventDate) : '—')

  return (
    <div className="font-serif text-[13px] text-gray-900 leading-relaxed space-y-5">
      <div className="text-center space-y-1">
        <div className="text-xs tracking-widest font-sans font-bold text-gray-500 uppercase">Hexa Space Pty Ltd</div>
        <h1 className="text-2xl font-bold tracking-tight">Pop-up Licence Agreement</h1>
        <div className="text-xs text-gray-500 font-sans">{venueName} · {period}</div>
      </div>

      <hr className="border-gray-300" />

      {/* Schedule */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-700 mb-3">Schedule — Booking Details</h2>
        <table className="w-full text-xs border-collapse">
          <tbody>
            {[
              ['Licensor', 'Hexa Space Pty Ltd (ABN 51 234 567 890)'],
              ['Licensor Address', '402/830 Whitehorse Road, Box Hill VIC 3128'],
              ['Licensor Contact', 'info@hexaspace.com.au'],
              ['Licensee', vendorDisplay || b.vendorName],
              ['Licensee Contact', b.vendorName],
              ['Licensee Email', b.vendorEmail],
              ['Licensee ABN', b.vendorAbn || '—'],
              ['Venue', b.allocatedSpace ? `${b.allocatedSpace} — ${venueAddress}` : venueAddress],
              ['Permitted Use', [b.vendorType, b.vendorDescription].filter(Boolean).join(' — ') || 'Retail / brand pop-up'],
              ['Booking Period', period],
              ['Days Booked', b.bookingDays ? `${b.bookingDays} day${b.bookingDays === 1 ? '' : 's'}` : '—'],
              ['Daily Rate', fmtMoney(b.dailyRate) || '—'],
              ['Licence Fee', fmtMoney(b.participationFee) || '—'],
              ['Bond', fmtMoney(b.bond) || 'Nil'],
              ['Deposit', fmtMoney(b.deposit) || (b.participationFee ? '50% of Licence Fee payable on signing' : 'Nil')],
              ['Balance Due Date', b.balanceDueDate ? fmtDate(b.balanceDueDate) : '7 days before Event Date'],
              ['Included Services', b.includedServices || 'As directed by Licensor'],
              ['Excluded Services', b.excludedServices || 'All items not specified as included'],
              ['Insurance Requirement', 'Min. AUD $20,000,000 Public Liability Insurance per occurrence'],
              ['Security Required', b.securityRequired ? 'Yes' : 'No'],
              ['Alcohol Permitted', b.alcoholPermitted ? 'Yes — subject to all required approvals' : 'No'],
              ['Food Permitted', b.foodPermitted !== false ? 'Yes — subject to all required registrations' : 'No'],
              ['Special Conditions', b.specialConditions || 'Nil'],
            ].map(([label, value]) => (
              <tr key={label} className="border border-gray-200">
                <td className="bg-gray-50 px-3 py-1.5 font-semibold text-gray-700 w-44 align-top">{label}</td>
                <td className="px-3 py-1.5 text-gray-900 whitespace-pre-wrap">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <hr className="border-gray-300" />

      <div>
        <p className="text-xs text-gray-500 italic mb-4">This Agreement is entered into on {today} between the Licensor and Licensee named in the Schedule above.</p>

        {/* Recitals */}
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-700 mb-2">Recitals</h2>
        <div className="space-y-2 text-xs mb-5">
          <p><strong>A.</strong> The Licensor controls and operates the premises situated at 369 Lonsdale Street, Melbourne VIC 3000.</p>
          <p><strong>B.</strong> The Licensee has requested permission to use part of the Premises for the Event.</p>
          <p><strong>C.</strong> The Licensor has agreed to grant the Licensee a temporary, revocable and non-exclusive licence to use the Venue on the terms of this Agreement.</p>
          <p><strong>D.</strong> The parties acknowledge and agree that this Agreement creates a licence only and does not create a lease, tenancy, retail tenancy, periodic tenancy, exclusive possession or any estate or interest in land.</p>
        </div>

        {/* Clauses */}
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-700 mb-3">Terms and Conditions</h2>
        <div className="space-y-4 text-xs">

          <div>
            <strong>1. Recitals</strong>
            <p className="mt-1">The recitals form part of this Agreement.</p>
          </div>

          <div>
            <strong>2. Definitions and Interpretation</strong>
            <p className="mt-1">In this Agreement, unless the context otherwise requires:</p>
            <p className="mt-1"><em>Additional Charges</em> means all charges payable in addition to the Licence Fee, including cleaning charges, waste disposal charges, security charges, staff charges, overtime charges, repair costs, reinstatement costs, call-out fees, utility surcharges and any other amount payable under this Agreement.</p>
            <p className="mt-1"><em>Agreement</em> means this Event Venue Licence Agreement, including the Schedule and any annexures.</p>
            <p className="mt-1"><em>Bond</em> means the security deposit specified in the Schedule.</p>
            <p className="mt-1"><em>Business Day</em> means a day other than a Saturday, Sunday or public holiday in Victoria.</p>
            <p className="mt-1"><em>Event</em> means the event described in the Schedule.</p>
            <p className="mt-1"><em>Event Personnel</em> means the Licensee's employees, contractors, subcontractors, agents, caterers, performers, suppliers, security personnel, invitees, guests, attendees, volunteers and any other person brought onto the Premises by or on behalf of the Licensee.</p>
            <p className="mt-1"><em>Licence Fee</em> means the fee payable for the licence granted under this Agreement, as specified in the Schedule.</p>
            <p className="mt-1"><em>Licence Period</em> means the period commencing at the start of the approved access time, including bump-in, and ending when the Licensee has fully vacated the Venue, completed bump-out, removed all property and complied with its reinstatement obligations.</p>
            <p className="mt-1"><em>Permitted Use</em> means the use of the Venue approved by the Licensor and stated in the Schedule.</p>
            <p className="mt-1"><em>Premises</em> means the land and improvements at 369 Lonsdale Street, Melbourne VIC 3000, including all access points, loading areas, amenities, car parking areas, common areas and external areas made available by the Licensor from time to time.</p>
            <p className="mt-1"><em>Venue</em> means the area or areas within the Premises described in the Schedule.</p>
            <p className="mt-1">Unless the contrary intention appears, headings are for convenience only, the singular includes the plural and vice versa, legislation includes amendments and subordinate instruments, and <em>including</em> is not a term of limitation.</p>
          </div>

          <div>
            <strong>3. Grant of Licence</strong>
            <p className="mt-1">Subject to this Agreement, the Licensor grants to the Licensee a personal, non-exclusive, non-transferable, revocable licence to use the Venue during the Licence Period solely for the Permitted Use.</p>
            <p className="mt-1">The Licensee acknowledges and agrees that the Licence is temporary only, the Licensor retains possession and control of the Venue and Premises at all times, the Licensee has no right to exclusive possession, and the Licensee acquires no tenancy rights, retail leasing rights or other proprietary rights.</p>
            <p className="mt-1">The Licensor may impose reasonable directions, restrictions and conditions regarding access and circulation, occupancy and crowd control, safety and emergency procedures, bump-in and bump-out, noise and amenity, security arrangements, use of services and equipment, lawful operation of the Premises, and protection of the Venue, neighbouring occupiers and the Licensor's reputation.</p>
            <p className="mt-1">The Licensor and its representatives may enter the Venue at any time for operational, safety, emergency, security, compliance, cleaning, maintenance, inspection or repair purposes.</p>
          </div>

          <div>
            <strong>4. Term</strong>
            <p className="mt-1">This Agreement commences on the date it is executed by both parties unless an earlier commencement date is stated in the Schedule.</p>
            <p className="mt-1">The Licensee may access and use the Venue only during the Licence Period and only for the Permitted Use.</p>
            <p className="mt-1">The Licensee must vacate the Venue and the Premises by the expiry of the Licence Period. Holding over is not permitted and may attract overtime and additional charges if allowed by the Licensor.</p>
          </div>

          <div>
            <strong>5. Fees, Bond and Payment</strong>
            <p className="mt-1">The Licensee must pay the Licence Fee, the Bond, all Additional Charges, all other amounts stated in the Schedule and GST on all taxable supplies.</p>
            <p className="mt-1">Unless otherwise stated in the Schedule, a non-refundable deposit of 50% of the Licence Fee is payable on signing, the balance of the Licence Fee is payable no later than 7 days before the Event Date, and the Bond is payable no later than 5 Business Days before the Event Date.</p>
            <p className="mt-1">Time for payment is of the essence. The Licensor is not obliged to provide access to the Venue unless all required monies have been paid in cleared funds.</p>
            <p className="mt-1">The Licensor may apply the Bond toward any amount due under this Agreement, including unpaid fees, cleaning costs, waste removal costs, damage or repair costs, overtime charges, reinstatement costs and costs arising from breach. The Bond does not limit the Licensee's liability.</p>
          </div>

          <div>
            <strong>6. Use of Venue</strong>
            <p className="mt-1">The Licensee must use the Venue strictly for the Permitted Use, during the Licence Period only, in accordance with this Agreement, all laws and approvals, and all lawful directions of the Licensor.</p>
            <p className="mt-1">The Licensee must not, and must ensure that Event Personnel do not, use the Venue for any unlawful, dangerous, immoral, offensive or improper purpose; do anything likely to damage the Licensor's reputation or goodwill; permit overcrowding; obstruct exits, accessways, driveways, loading areas, emergency services or common areas; cause nuisance, disturbance or unreasonable interference; damage, mark, penetrate, alter or attach anything to the Venue without prior written approval; use naked flames, fireworks, pyrotechnics, smoke machines, hazardous substances or dangerous goods without written consent and approvals; bring onto the Premises any unlawful item, weapon or prohibited substance; use the Venue for residential or overnight accommodation purposes; or do anything that may invalidate or prejudice the Licensor's insurance.</p>
            <p className="mt-1">The Licensor may require the immediate cessation of any activity that, in the Licensor's reasonable opinion, is unsafe, unlawful, non-compliant or likely to damage the Venue or interfere with the Premises.</p>
          </div>

          <div>
            <strong>7. No Assignment or Sublicensing</strong>
            <p className="mt-1">The Licensee must not assign, transfer, novate, sublicense, share possession of, or otherwise deal with its rights under this Agreement without the Licensor's prior written consent. Any purported dealing in breach of this clause is void.</p>
          </div>

          <div>
            <strong>8. Compliance With Laws and Approvals</strong>
            <p className="mt-1">The Licensee is solely responsible, at its own cost, for obtaining and maintaining all licences, permits, approvals, registrations and consents required for the Event and the Permitted Use.</p>
            <p className="mt-1">Without limitation, the Licensee must comply with all legal requirements relating to building and occupancy requirements, places of public entertainment, prescribed temporary structures, liquor licensing, food handling and food registration or notification, public health and sanitation, occupational health and safety, crowd control and security, traffic and parking, electrical safety, noise and amenity, copyright and music licensing, and waste disposal and environmental obligations.</p>
            <p className="mt-1">The Licensee must provide to the Licensor, on request and before access is granted, copies of all permits, plans, certificates and approvals relevant to the Event. The Licensor may refuse access or terminate this Agreement if the Licensor is not satisfied, acting reasonably, that the Event may lawfully and safely proceed.</p>
          </div>

          <div>
            <strong>9. Insurance</strong>
            <p className="mt-1">The Licensee must, at its own cost, effect and maintain public liability insurance for not less than AUD $20,000,000 for any one occurrence, workers compensation insurance as required by law, insurance for all property and equipment brought onto the Premises, any motor vehicle insurance required by law, and any additional insurance reasonably required by the Licensor having regard to the nature of the Event.</p>
            <p className="mt-1">The public liability policy should, where reasonably available, note the interest of the Licensor, extend to the use of the Venue and Premises, and not contain exclusions inconsistent with the nature of the approved Event.</p>
            <p className="mt-1">The Licensee must provide the Licensor with certificates of currency no later than 5 Business Days before the Event Date, or earlier on request. Failure to provide satisfactory evidence of insurance entitles the Licensor to deny access, suspend the booking or terminate this Agreement.</p>
          </div>

          <div>
            <strong>10. Safety, Risk Management and Venue Protection</strong>
            <p className="mt-1">The Licensee must ensure that the Event is planned and conducted in a safe manner. The Licensee must identify and manage foreseeable risks, ensure all Event Personnel are suitably qualified, licensed, trained and supervised, comply with site inductions and emergency procedures, ensure exits and firefighting equipment remain unobstructed, ensure electrical equipment used is safe and compliant, and immediately report incidents, injuries, hazards, complaints and emergencies to the Licensor.</p>
            <p className="mt-1">The Licensor may require the Licensee to provide an event management plan, risk assessment, bump-in and bump-out plan, security plan, traffic management plan, emergency management plan, first aid plan, contractor registers, supplier details and evidence of inductions and safety briefings before the Event.</p>
          </div>

          <div>
            <strong>11. Contractors, Suppliers and Event Personnel</strong>
            <p className="mt-1">The Licensee is responsible for all Event Personnel and must ensure that all contractors and suppliers engaged by it are appropriately qualified, licensed and insured, comply with all applicable laws and site rules, act safely and professionally, and do not interfere with the operation, access or reputation of the Premises.</p>
            <p className="mt-1">The Licensor may refuse access to any contractor, supplier, vehicle, structure or equipment that the Licensor reasonably considers unsafe, unsuitable, unlawful or likely to damage the Venue.</p>
          </div>

          <div>
            <strong>12. Security and Conduct</strong>
            <p className="mt-1">The Licensor may require the Licensee to provide licensed security personnel in numbers and on terms acceptable to the Licensor. The Licensee must ensure orderly conduct of all attendees and must immediately comply with any direction of the Licensor concerning safety, intoxication, conduct, noise, access or crowd management.</p>
            <p className="mt-1">The Licensor may remove, or direct the removal of, any person from the Premises who is intoxicated, disorderly, unsafe, non-compliant or otherwise objectionable.</p>
          </div>

          <div>
            <strong>13. Food, Beverage and Alcohol</strong>
            <p className="mt-1">The Licensee must not sell, supply or permit the service of alcohol unless the Licensor has given prior written consent and all necessary liquor licences, permits and approvals have been obtained and complied with.</p>
            <p className="mt-1">The Licensee must not prepare, handle, store, sell or distribute food or beverages unless all legal requirements are satisfied. The Licensee is responsible for all food safety, liquor compliance, RSA compliance, spill management, waste removal and associated cleaning.</p>
            <p className="mt-1">The Licensor may impose special conditions in relation to alcohol service hours, bar service areas, RSA requirements, catering access, glassware restrictions, smoking and vaping restrictions, and cleaning requirements.</p>
          </div>

          <div>
            <strong>14. Access, Delivery, Bump-In and Bump-Out</strong>
            <p className="mt-1">The Licensee may only access the Venue during the times approved by the Licensor. All deliveries, removals, contractor attendance, setup and dismantling must occur only at approved times and via approved access routes.</p>
            <p className="mt-1">The Licensee must not leave any goods, rubbish, pallets, packaging or equipment in common areas, parking areas, accessways or loading zones. The Licensor may charge overtime, staff or call-out fees where the Licensee exceeds approved access times.</p>
          </div>

          <div>
            <strong>15. Cleaning, Waste and Reinstatement</strong>
            <p className="mt-1">The Licensee must keep the Venue and the Premises clean, safe and orderly throughout the Licence Period.</p>
            <p className="mt-1">By the expiry of the Licence Period, the Licensee must remove all persons, goods, decorations, staging, equipment and rubbish; restore the Venue to the condition existing at the commencement of the Licence Period, fair wear and tear excepted; remove all adhesives, tape, fixings, signage and temporary structures without damage; clean all affected areas; and lawfully remove and dispose of all waste.</p>
            <p className="mt-1">The Licensor may carry out cleaning, removal, disposal, reinstatement or repairs required due to the Event, and the Licensee must pay the cost on demand.</p>
          </div>

          <div>
            <strong>16. Damage and Repairs</strong>
            <p className="mt-1">The Licensee occupies and uses the Venue at its own risk and is liable for all loss of or damage to the Venue, Premises and Licensor's property arising from the Event or from the acts or omissions of the Licensee or Event Personnel.</p>
            <p className="mt-1">The Licensor may elect to repair the damage itself, engage others to do so, or require the Licensee to do so under the Licensor's supervision. The Licensee must pay the full cost of repair, replacement, make-good and associated losses on demand.</p>
          </div>

          <div>
            <strong>17. Licensor's Property and Services</strong>
            <p className="mt-1">Any furniture, fixtures, equipment, services, utilities, internet, AV, lighting, power or other facilities supplied by the Licensor are provided on an <em>as is</em> basis unless expressly agreed otherwise in writing. To the maximum extent permitted by law, the Licensor gives no warranty that any such item or service will be uninterrupted, available, suitable or fit for the Licensee's purpose.</p>
            <p className="mt-1">The Licensee must not misuse, overload, tamper with or relocate any Licensor property without consent.</p>
          </div>

          <div>
            <strong>18. Cancellation by Licensee</strong>
            <p className="mt-1">If the Licensee cancels the booking more than 30 days before the Event Date, all deposits paid are forfeited; between 30 and 14 days before the Event Date, 50% of the total contracted charges are payable; and within 14 days of the Event Date, 100% of the total contracted charges are payable.</p>
            <p className="mt-1">The Licensee must also pay all non-recoverable costs incurred by the Licensor in connection with the Event.</p>
          </div>

          <div>
            <strong>19. Suspension, Refusal of Access and Termination by Licensor</strong>
            <p className="mt-1">The Licensor may immediately suspend access, refuse entry, cancel the booking or terminate this Agreement by notice if any amount payable is not paid on time, the Licensee breaches this Agreement, the Licensee fails to provide satisfactory evidence of insurance, permits or plans, the Event is unsafe, unlawful or non-compliant, the Event differs materially from the approved Permitted Use, the conduct of the Licensee or Event Personnel is likely to damage the Venue, interfere with the Premises or adversely affect the Licensor's reputation, or the Venue becomes unavailable due to emergency, damage, government order, essential repair or other cause beyond the Licensor's reasonable control.</p>
            <p className="mt-1">Where termination arises from the Licensee's default, the Licensor may retain all monies paid and recover its Loss. Where the Venue is unavailable for reasons beyond the Licensor's reasonable control and without default by the Licensee, the Licensor's liability is limited to refunding the Licence Fee actually paid for the affected booking, less any non-recoverable third-party costs reasonably incurred.</p>
          </div>

          <div>
            <strong>20. Indemnity</strong>
            <p className="mt-1">The Licensee indemnifies and must keep indemnified the Licensor and its officers, employees, contractors and agents from and against all Loss arising from or in connection with the Event, the use of the Venue or Premises by the Licensee or Event Personnel, any personal injury, death, loss of property or property damage, any breach of this Agreement, any breach of law, any act or omission of the Licensee or Event Personnel, and any claim by any attendee, contractor, supplier or third party connected with the Event, except to the extent the Loss is caused by the negligence or wilful misconduct of the Licensor.</p>
            <p className="mt-1">This indemnity survives expiry or termination of this Agreement.</p>
          </div>

          <div>
            <strong>21. Exclusion and Limitation of Liability</strong>
            <p className="mt-1">To the maximum extent permitted by law, the Licensor excludes all implied terms, conditions, warranties and guarantees.</p>
            <p className="mt-1">The Licensor is not liable for loss, theft or damage to any property of the Licensee or any other person, interruption or failure of utilities, services or equipment, cancellation, disruption or reduced enjoyment of the Event, or any loss of profit, loss of revenue, loss of opportunity, loss of goodwill or consequential loss. Where liability cannot be excluded, it is limited to the maximum extent permitted by law.</p>
          </div>

          <div>
            <strong>22. Force Majeure</strong>
            <p className="mt-1">Neither party is liable for delay or failure to perform caused by events beyond its reasonable control, including fire, flood, storm, pandemic, government order, utility failure, industrial action, civil disturbance or emergency. In such circumstances, the Licensor may cancel, reschedule or suspend the booking, or apply monies paid to a rescheduled date, acting reasonably.</p>
          </div>

          <div>
            <strong>23. Privacy, Photography and Recording</strong>
            <p className="mt-1">The Licensee is responsible for obtaining all consents required for photography, filming, livestreaming, recording and collection or use of personal information in connection with the Event. The Licensor may operate CCTV and security monitoring systems at the Premises for lawful operational and security purposes.</p>
          </div>

          <div>
            <strong>24. Default Interest and Recovery Costs</strong>
            <p className="mt-1">Interest accrues on overdue amounts at the rate of 10% per annum, calculated daily from the due date until payment. The Licensee must pay all reasonable costs incurred by the Licensor in enforcing this Agreement or recovering any debt, including legal costs on a full indemnity basis.</p>
          </div>

          <div>
            <strong>25. Notices</strong>
            <p className="mt-1">A notice under this Agreement must be in writing and sent by hand, prepaid post or email to the recipient's address stated in this Agreement or as later notified. A notice is deemed received if delivered by hand when delivered, if posted in Australia on the second Business Day after posting, and if sent by email when transmitted unless the sender receives an error notice, provided that an email sent after 5.00 pm is deemed received on the next Business Day.</p>
          </div>

          <div>
            <strong>26. GST</strong>
            <p className="mt-1">Unless otherwise stated, all amounts payable under this Agreement are exclusive of GST. If GST is payable on a taxable supply under this Agreement, the recipient must pay the GST in addition to the consideration otherwise payable.</p>
          </div>

          <div>
            <strong>27. General</strong>
            <p className="mt-1">This Agreement constitutes the entire agreement between the parties in relation to its subject matter. No variation is effective unless in writing signed by both parties. A waiver is not effective unless in writing. A failure or delay in exercising a right does not constitute a waiver. Any invalid provision must be read down or severed to the extent necessary without affecting the remainder.</p>
            <p className="mt-1">This Agreement may be executed in counterparts and by electronic signature. This Agreement is governed by the laws of Victoria, Australia, and the parties submit to the exclusive jurisdiction of the courts of Victoria.</p>
          </div>
        </div>
      </div>

      {/* Execution */}
      <div className="mt-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-700 mb-4">Executed as an Agreement</h2>
        <div className="grid grid-cols-2 gap-8 text-xs">
          <div className="space-y-4">
            <div className="font-semibold text-gray-700">SIGNED for and on behalf of</div>
            <div className="font-bold">Hexa Space Pty Ltd (Licensor)</div>
            <div className="border-b border-gray-400 pt-8 w-full" />
            <div className="text-gray-500">Authorised Signatory &nbsp;·&nbsp; Date: ___________</div>
          </div>
          <div className="space-y-4">
            <div className="font-semibold text-gray-700">SIGNED by the Licensee</div>
            <div className="font-bold">{vendorDisplay || b.vendorName}</div>
            <div className="border-b border-gray-400 pt-8 w-full" />
            <div className="text-gray-500">Signature &nbsp;·&nbsp; Date: ___________</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Document 2: Liability Waiver (standalone) ────────────────────────────────

function LiabilityWaiverDoc({ booking }) {
  const b = booking
  const vendor = b.vendorBusiness || b.vendorName
  const today = format(new Date(), 'd MMMM yyyy')
  return (
    <div className="font-serif text-[13px] text-gray-900 leading-relaxed space-y-5">
      <div className="text-center space-y-1">
        <div className="text-xs tracking-widest font-sans font-bold text-gray-500 uppercase">Hexa Space Pty Ltd</div>
        <h1 className="text-xl font-bold tracking-tight">Vendor Liability Waiver and Acknowledgement</h1>
        <div className="text-xs text-gray-500 font-sans">Lonsdale 369 Pop-up · Sunday 7 June 2026 · 369 Lonsdale Street, Melbourne VIC 3000</div>
      </div>

      <hr className="border-gray-300" />

      <p className="text-xs text-gray-600 italic">This Waiver is given by the Vendor named below in favour of Hexa Space Pty Ltd ABN 51 234 567 890 (<strong>Hexa Space</strong>) and is to be read together with and forms part of the Event Venue Licence Agreement between the parties dated {today}.</p>

      <div className="space-y-4 text-xs">
        <div>
          <strong>1. Defined Terms</strong>
          <p className="mt-1">Words defined in the Event Venue Licence Agreement have the same meaning in this Waiver. <em>Vendor</em> means the Licensee named in the Agreement. <em>Vendor Personnel</em> means the Vendor's employees, contractors, agents, representatives and any person operating at or from the Vendor's stall or space.</p>
        </div>

        <div>
          <strong>2. Acknowledgement of Risk</strong>
          <p className="mt-1">The Vendor acknowledges and agrees that:</p>
          <p className="mt-1">(a) participation in the Event as a vendor, stallholder or exhibitor involves inherent risks, including but not limited to personal injury, property damage, theft, financial loss and disruption;</p>
          <p className="mt-1">(b) Hexa Space makes no representation or warranty that the Venue or Premises is suitable for the Vendor's specific purposes or that the Event will attract any particular number of attendees;</p>
          <p className="mt-1">(c) the Vendor has independently assessed the suitability of the Venue and the risks associated with its participation and is satisfied that it is appropriate to proceed on the terms of this Waiver and the Agreement; and</p>
          <p className="mt-1">(d) Hexa Space does not guarantee exclusivity for the Vendor's product or service category at the Event.</p>
        </div>

        <div>
          <strong>3. Waiver and Release</strong>
          <p className="mt-1">To the fullest extent permitted by law, the Vendor, for itself and on behalf of all Vendor Personnel, releases, waives, discharges and covenants not to sue Hexa Space, its officers, directors, employees, contractors and agents (<strong>Released Parties</strong>) from and against any and all claims, demands, causes of action, losses, costs, damages and liabilities of any kind, whether known or unknown, arising directly or indirectly from or in connection with:</p>
          <p className="mt-1">(a) the Vendor's or any Vendor Personnel's presence at, participation in or preparation for the Event;</p>
          <p className="mt-1">(b) any personal injury, illness or death suffered by the Vendor or any Vendor Personnel at or in connection with the Event;</p>
          <p className="mt-1">(c) any loss of or damage to the Vendor's goods, stock, cash, equipment, vehicles, display materials or other property, howsoever caused, including loss or damage caused by theft, other vendors, attendees or third parties;</p>
          <p className="mt-1">(d) any loss of revenue, loss of sales, loss of profit or other financial loss arising from the Vendor's participation in the Event, including reduced attendance or cancellation; and</p>
          <p className="mt-1">(e) any act or omission of any other vendor, exhibitor, attendee, contractor or third party at or in connection with the Event.</p>
        </div>

        <div>
          <strong>4. Vendor's Responsibility for Attendees and Customers</strong>
          <p className="mt-1">The Vendor accepts full responsibility for the safety and conduct of all persons who visit, interact with or purchase from the Vendor's stall or space during the Event, including responsibility for:</p>
          <p className="mt-1">(a) ensuring its stall and display items are stable, safe and do not pose a hazard to attendees;</p>
          <p className="mt-1">(b) any injury or damage caused to an attendee or customer arising from the Vendor's goods, products, samples, displays or operations; and</p>
          <p className="mt-1">(c) any claim by an attendee or customer arising out of the Vendor's goods or services, including any product liability, food safety or consumer law claim.</p>
        </div>

        <div>
          <strong>5. Indemnity</strong>
          <p className="mt-1">In addition to and without limiting clause 20 of the Event Venue Licence Agreement, the Vendor indemnifies and keeps indemnified the Released Parties from and against all Loss arising from or in connection with:</p>
          <p className="mt-1">(a) the Vendor's participation in the Event and use of the Venue;</p>
          <p className="mt-1">(b) any claim by a Vendor customer or attendee arising from the Vendor's goods, services or operations;</p>
          <p className="mt-1">(c) any food safety incident, product defect, or personal injury caused by the Vendor's goods or operations;</p>
          <p className="mt-1">(d) any breach by the Vendor of this Waiver or the Agreement; and</p>
          <p className="mt-1">(e) any non-compliance by the Vendor with applicable laws, including food registration, liquor licensing, electrical safety and occupational health and safety requirements.</p>
          <p className="mt-1">This indemnity survives expiry or termination of the Agreement.</p>
        </div>

        <div>
          <strong>6. Insurance Confirmation</strong>
          <p className="mt-1">The Vendor warrants that it holds, and will maintain in force through the Event Date, public liability insurance of at least AUD $20,000,000 per occurrence, together with workers compensation insurance as required by law and any other insurance reasonably required having regard to the nature of the Vendor's operations. The Vendor acknowledges that it is required to provide a current Certificate of Currency to Hexa Space no later than 5 Business Days before the Event Date and that failure to do so entitles Hexa Space to refuse access to the Venue.</p>
        </div>

        <div>
          <strong>7. Food and Beverage Vendors</strong>
          <p className="mt-1">Where the Vendor's goods or services include food or beverage, the Vendor additionally warrants that all food handlers hold current food safety qualifications, the Vendor holds all required food business registrations or notifications, all food is handled, stored and served in compliance with the Food Act 1984 (Vic) and applicable food standards, and the Vendor will immediately cease food service if directed by Hexa Space or a relevant authority.</p>
        </div>

        <div>
          <strong>8. Preservation of Statutory Rights</strong>
          <p className="mt-1">Nothing in this Waiver excludes, restricts or modifies any right, remedy or guarantee that the Vendor may have under the Australian Consumer Law (Schedule 2 of the Competition and Consumer Act 2010 (Cth)) or any other applicable legislation that cannot by law be excluded, restricted or modified. To the extent that such rights apply, nothing in this Waiver affects those rights.</p>
        </div>

        <div>
          <strong>9. Severability and Governing Law</strong>
          <p className="mt-1">If any provision of this Waiver is held to be void, invalid or unenforceable, that provision must be read down to the minimum extent necessary or severed, and the remaining provisions continue in full force. This Waiver is governed by the laws of Victoria, Australia.</p>
        </div>

        <p className="italic text-gray-600 mt-2">By signing the Event Venue Licence Agreement, the Vendor confirms that it has read, understood and agreed to this Liability Waiver and Acknowledgement on behalf of itself and all Vendor Personnel.</p>
      </div>
    </div>
  )
}

// ── Document 3: Annexure A — Venue Rules (verbatim) ───────────────────────────

function VenueRulesDoc() {
  return (
    <div className="font-serif text-[13px] text-gray-900 leading-relaxed space-y-5">
      <div className="text-center space-y-1">
        <div className="text-xs tracking-widest font-sans font-bold text-gray-500 uppercase">Hexa Space Pty Ltd</div>
        <h1 className="text-xl font-bold tracking-tight">Annexure A</h1>
        <h2 className="text-base font-semibold text-gray-700">Venue Rules and Operating Conditions</h2>
        <div className="text-xs text-gray-500 font-sans">369 Lonsdale Street, Melbourne VIC 3000</div>
      </div>

      <hr className="border-gray-300" />

      <p className="text-xs text-gray-600 italic">These Venue Rules are incorporated into the Agreement. In the event of any inconsistency, the Licensor may direct the stricter requirement to apply to the extent permitted by law.</p>

      <div className="space-y-4 text-xs">
        <div><strong>1.</strong> Only the approved areas of the Premises may be used. Any use of loading areas, parking areas, common areas or back-of-house areas requires prior approval.</div>
        <div><strong>2.</strong> The Licensee must comply with all bump-in and bump-out windows and all directions regarding vehicle movements, deliveries and collections.</div>
        <div><strong>3.</strong> No nails, screws, hooks, glue, tape, paint, fixings or penetrations may be used on any surface without written approval. Any approved fixing must be removed and made good at the Licensee's cost.</div>
        <div><strong>4.</strong> All exits, fire doors, fire extinguishers, hose reels, hydrants, switchboards and emergency access paths must remain clear at all times.</div>
        <div><strong>5.</strong> No unlawful activity is permitted. No dangerous goods, prohibited substances or weapons may be brought onto the Premises.</div>
        <div><strong>6.</strong> Smoking and vaping are prohibited except in any area specifically designated by the Licensor and legally permitted for that purpose.</div>
        <div><strong>7.</strong> Alcohol may only be supplied if expressly approved in writing by the Licensor and all required liquor approvals are in place.</div>
        <div><strong>8.</strong> Food preparation, catering, food trucks, stalls and mobile food operations require prior written approval and compliance with all applicable registration or notification requirements.</div>
        <div><strong>9.</strong> All electrical equipment brought onto the Premises must be safe, suitable and legally compliant. The Licensor may require test and tag evidence where appropriate.</div>
        <div><strong>10.</strong> The Licensee must ensure that guests leave the Premises in an orderly manner and without causing nuisance or disturbance to neighbouring occupiers or surrounding properties.</div>
        <div><strong>11.</strong> The Licensee must remove all rubbish, decorations, packaging, pallets, stock and temporary items by the end of the Licence Period unless otherwise agreed in writing.</div>
        <div><strong>12.</strong> Any cleaning, waste removal, odour treatment, stain treatment, pest treatment, repair or reinstatement required due to the Event may be charged to the Licensee.</div>
        <div><strong>13.</strong> The Licensor may vary access arrangements, close off areas, give operational directions, require additional security or direct cessation of any activity where reasonably necessary for safety, compliance or protection of the Venue.</div>
      </div>
    </div>
  )
}

// ── Document 3: Annexure B + C (verbatim) ─────────────────────────────────────

function ComplianceAndMarketingDoc() {
  return (
    <div className="font-serif text-[13px] text-gray-900 leading-relaxed space-y-8">
      {/* Annexure B */}
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <div className="text-xs tracking-widest font-sans font-bold text-gray-500 uppercase">Hexa Space Pty Ltd</div>
          <h1 className="text-xl font-bold tracking-tight">Annexure B</h1>
          <h2 className="text-base font-semibold text-gray-700">Practical Victorian Compliance Notes</h2>
        </div>

        <hr className="border-gray-300" />

        <p className="text-xs text-gray-600 italic">This annexure is intended as a practical licensor checklist and pre-event compliance guide. It is not a substitute for project-specific legal, building, council, liquor, health or safety advice.</p>

        <div className="space-y-3 text-xs">
          <div><strong>Liquor licensing:</strong> If alcohol will be sold, supplied, served or included in ticketing, packages or other consideration, the organiser should confirm whether a liquor licence or permit is required and provide the relevant approval before the event. No alcohol service should occur without prior written licensor approval and lawful authority.</div>
          <div><strong>Food businesses and caterers:</strong> If food will be handled, sold or distributed, the organiser should ensure that each caterer, stallholder, food truck or mobile operator is properly registered or notified where required and can provide evidence before bump-in.</div>
          <div><strong>Occupational health and safety:</strong> The organiser should prepare a risk assessment and event management plan proportionate to the event profile. Larger or more complex events should also have contractor controls, emergency management, first aid, security and traffic management arrangements.</div>
          <div><strong>Public liability insurance:</strong> A public liability limit of at least AUD $20,000,000 is recommended as the minimum contractual requirement for venue use, together with workers compensation and any event-specific insurance reasonably required by the licensor.</div>
          <div><strong>Places of public entertainment and temporary structures:</strong> Where the event may amount to public entertainment or involve prescribed temporary structures, building or council advice should be obtained early. Temporary stages, marquees, seating stands and similar installations may trigger approval requirements depending on the structure, area and use case.</div>
          <div><strong>First aid and emergency response:</strong> The organiser should assess first aid needs having regard to event size, duration, alcohol service, age profile and risk factors. For larger events, the licensor should request details of the first aid provider, emergency contacts and escalation pathways.</div>
          <div><strong>Smoking and vaping:</strong> The organiser must comply with Victorian smoke-free and vape-free restrictions and any stricter licensor rule applying to the site. As a practical control, smoking and vaping should be prohibited except in any designated area approved by the licensor and legally permitted.</div>
        </div>

        <div>
          <p className="text-xs font-bold text-gray-700 mb-2">Pre-Event Document Checklist</p>
          <ul className="text-xs space-y-1 list-disc list-inside text-gray-700">
            <li>full legal name and ABN / ACN of organiser</li>
            <li>event description and anticipated attendee numbers</li>
            <li>certificate of currency for public liability insurance</li>
            <li>liquor approval or confirmation that no liquor approval is required</li>
            <li>food registration or notification evidence for caterers or food vendors</li>
            <li>event management plan and risk assessment</li>
            <li>contractor and supplier register</li>
            <li>security plan and first aid plan where applicable</li>
            <li>details of any temporary structures, staging, marquees or amplified sound</li>
            <li>building or council advice where public entertainment or temporary structure issues may arise</li>
            <li>waste, cleaning and bump-out plan</li>
            <li>confirmation that all fees and bond have been paid in cleared funds</li>
          </ul>
        </div>

        <p className="text-xs text-gray-500 italic">Reference sources for practical compliance review: Victorian Government liquor licensing guidance; Victorian Department of Health food safety and first aid guidance; WorkSafe Victoria event organiser guidance; and Victorian Building Authority guidance on places of public entertainment and prescribed temporary structures.</p>
      </div>

      <hr className="border-gray-300" />

      {/* Annexure C */}
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold tracking-tight">Annexure C</h1>
          <h2 className="text-base font-semibold text-gray-700">Event, Venue Promotion and Digital Marketing Requirements</h2>
        </div>

        <p className="text-xs text-gray-600 italic">This annexure forms part of the Agreement. The Licensee must comply with these venue promotion requirements unless the Licensor otherwise agrees in writing.</p>

        <div className="space-y-4 text-xs">
          <div>
            <strong>1. Mandatory Promotion Obligation</strong>
            <p className="mt-1">The Licensee must actively promote the Licensor, Event and the Venue, as directed by the Licensor from time to time, in connection with the Event and any related publicity, campaign, invitation, listing, registration page, attendee communication or post-event material.</p>
          </div>

          <div>
            <strong>2. Required Promotion Channels</strong>
            <p className="mt-1">Without limiting the Licensee's obligations, the Licensee must, where reasonably applicable to the Event and to the Licensee's available channels, promote the Licensor, Event and the Venue through one or more of the following:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5 ml-2">
              <li>all social media accounts operated or controlled by the Licensee, including Instagram, Facebook, LinkedIn, Xiaohongshu, WeChat, TikTok, X and any equivalent platform;</li>
              <li>the Licensee's website, landing pages, event registration pages, ticketing pages and event microsites;</li>
              <li>electronic direct mail, newsletters, SMS campaigns and attendee or member communications;</li>
              <li>online listings, directory entries, calendar notices, digital advertisements and sponsored content;</li>
              <li>media releases, blog posts, digital brochures and other online promotional materials; and</li>
              <li>any other online, digital or social promotion channel reasonably required by the Licensor having regard to the nature and profile of the Event.</li>
            </ul>
          </div>

          <div>
            <strong>3. Form of Promotion</strong>
            <p className="mt-1">The Licensee must ensure that all promotional material relating to the Event includes, if required by the Licensor:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5 ml-2">
              <li>the approved name of the Venue and its location at 369 Lonsdale Street, Melbourne VIC 3000;</li>
              <li>any venue branding, logo, tag, handle, hashtag, hyperlink, booking contact or descriptive wording specified by the Licensor;</li>
              <li>any credit line, acknowledgement, venue partner reference or promotional message required by the Licensor;</li>
              <li>any approved venue imagery, photographs, video, map, website link or brand assets supplied or nominated by the Licensor; and</li>
              <li>any mandatory venue rules, access instructions or special conditions that the Licensor directs to be communicated to attendees online.</li>
            </ul>
          </div>

          <div>
            <strong>4. Minimum Content and Timing</strong>
            <p className="mt-1">The Licensor may specify minimum promotional requirements, including the number of posts, publication dates, campaign timing, visibility period, platform mix, wording, tags, links and prominence. The Licensee must comply with those requirements within the timeframes directed by the Licensor.</p>
          </div>

          <div>
            <strong>5. Approval Rights</strong>
            <p className="mt-1">The Licensee must submit promotional copy, artwork, advertisements, listings, captions and digital content referring to the Venue to the Licensor for review if requested by the Licensor. The Licensee must not publish or distribute any material that uses the Venue name, images or branding in a misleading, inaccurate, defamatory, unlawful or reputationally damaging manner.</p>
          </div>

          <div>
            <strong>6. Branding and Intellectual Property</strong>
            <p className="mt-1">The Licensor grants the Licensee a limited, non-exclusive, revocable licence during the Licence Period to use approved Venue names, logos, handles, hashtags, photographs and promotional assets solely for authorised Event promotion. All intellectual property rights in those materials remain with the Licensor. The Licensee must immediately cease use of those materials on request by the Licensor.</p>
          </div>

          <div>
            <strong>7. Accuracy and Compliance</strong>
            <p className="mt-1">The Licensee must ensure that all promotional content relating to the Venue and Event is accurate, current, lawful and compliant with all applicable laws, platform requirements and advertising standards. The Licensee must promptly correct or remove any material if directed by the Licensor.</p>
          </div>

          <div>
            <strong>8. Cross-Promotion and Venue Content</strong>
            <p className="mt-1">If requested by the Licensor, the Licensee must provide the Licensor, without additional charge, with reasonable access to approved event descriptions, logos, still images, promotional artwork and other non-confidential materials so that the Licensor may promote the Event and the Venue on its own channels.</p>
          </div>

          <div>
            <strong>9. Evidence of Compliance</strong>
            <p className="mt-1">Upon request, the Licensee must provide evidence of compliance with this annexure, including copies or screenshots of posts, links to published material, campaign schedules, registration pages and other reasonable proof of publication.</p>
          </div>

          <div>
            <strong>10. Removal and Post-Event Retention</strong>
            <p className="mt-1">The Licensor may require the Licensee to remove, amend or archive promotional content after the Event. Unless otherwise directed, the Licensee must keep at least one reasonable online reference to the Venue's involvement or hosting role live for not less than 30 days after the Event where such retention is within the Licensee's control.</p>
          </div>

          <div>
            <strong>11. Costs</strong>
            <p className="mt-1">Except to the extent otherwise expressly agreed in writing, the Licensee is responsible for all costs of complying with this annexure, including design, media spend, posting, advertising, content creation and distribution costs.</p>
          </div>

          <div>
            <strong>12. Breach</strong>
            <p className="mt-1">Compliance with this annexure is a material obligation of the Licensee. Failure to comply constitutes a breach of the Agreement and entitles the Licensor to require immediate rectification, withhold approvals, refuse future bookings, recover resulting Loss and exercise any other right available under the Agreement.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main sign page ────────────────────────────────────────────────────────────

export default function EventBookingSignPage({ token }) {
  const [state, setState] = useState('loading') // loading|details|ready|signed|invalid|error
  const [booking, setBooking] = useState(null)
  const [view, setView] = useState('doc1')
  const [signerName, setSignerName] = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [signerDate, setSignerDate] = useState(format(new Date(), 'dd/MM/yyyy'))
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [insuranceChoice, setInsuranceChoice] = useState(null)
  const licensorSigRef = useRef(null)
  const sigRef = useRef(null)

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('/api/event-bookings/load', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        if (r.status === 404) { setState('invalid'); return }
        if (!r.ok) { setState('error'); return }
        const { booking: match, licensorSig } = await r.json()
        if (!match) { setState('invalid'); return }
        licensorSigRef.current = licensorSig ?? null
        setBooking(match)
        if (match.signedAt) { setState('signed'); return }
        if (match.vendorName) setSignerName(match.vendorName)
        // If vendor hasn't filled in their details yet, show details form first
        const hasDetails = match.detailsCompleted || (match.vendorBusiness && match.vendorType)
        setState(hasDetails ? 'ready' : 'details')
      } catch {
        setState('error')
      }
    }
    load()
  }, [token])

  async function handleSign() {
    if (!agreed) { alert('Please confirm you have read and agree to all documents.'); return }
    if (!signerName.trim()) { alert('Please enter your full name.'); return }
    if (sigRef.current?.isEmpty()) { alert('Please draw your signature.'); return }

    setSubmitting(true)
    try {
      const signatureData = sigRef.current.toDataURL()
      const signedFields = {
        status: 'signed',
        signedAt: new Date().toISOString(),
        signerName: signerName.trim(),
        signerTitle: signerTitle.trim(),
        signerDate,
        signatureData,
      }

      // Generate the signed PDF client-side (licensor sig came from /load), then
      // upload it via the service-role endpoint (best-effort).
      let agreementPdfUrl = null
      try {
        const pdfBlob = generateAgreementPdf({ ...booking, ...signedFields }, licensorSigRef.current)
        const pdfBase64 = await fileToBase64(pdfBlob)
        const up = await fetch('/api/event-bookings/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, kind: 'agreement', fileBase64: pdfBase64, contentType: 'application/pdf', fileName: `${booking.id}.pdf` }),
        })
        if (up.ok) agreementPdfUrl = (await up.json()).url ?? null
      } catch (_) {}

      const save = await fetch('/api/event-bookings/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, patch: { ...signedFields, ...(agreementPdfUrl ? { agreementPdfUrl } : {}) } }),
      })
      if (!save.ok) throw new Error('save failed')
      const updated = (await save.json()).booking

      // Notify admin + send the vendor their signed copy (server-persisted data).
      fetch('/api/event-bookings/send-signing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking: updated, mode: 'admin_notify' }),
      }).catch(() => {})
      if (updated.agreementPdfUrl) {
        fetch('/api/event-bookings/send-signing', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking: updated, mode: 'agreement_copy' }),
        }).catch(() => {})
      }

      setBooking(updated)
      setState('signed')
    } catch (err) {
      console.error(err)
      alert('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitInsuranceChoice(choice) {
    const patch = choice === 'later'
      ? { status: 'insurance_pending', insuranceStatus: 'pending', insuranceDeferredAt: new Date().toISOString() }
      : { status: 'insurance_received', insuranceStatus: 'received' }
    const save = await fetch('/api/event-bookings/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, patch }),
    })
    const updated = save.ok ? (await save.json()).booking : booking
    setBooking(updated)
    setInsuranceChoice(choice)
    if (choice === 'later') {
      await fetch('/api/event-bookings/send-signing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking: updated, mode: 'insurance_deferred' }),
      }).catch(() => {})
    }
  }

  if (state === 'details') {
    return (
      <VendorDetailsForm
        booking={booking}
        token={token}
        onComplete={(updated) => {
          setBooking(updated)
          if (updated.vendorName) setSignerName(updated.vendorName)
          setState('ready')
        }}
      />
    )
  }

  const TABS = [
    { key: 'doc1', label: '1. Licence Agreement' },
    { key: 'doc3', label: '2. Venue Rules' },
    { key: 'sign', label: '✍ Sign' },
  ]

  if (state === 'loading') return <Screen title="Loading…" />
  if (state === 'invalid') return <Screen icon="🔒" title="Invalid or expired link" subtitle="This signing link is invalid or has already been used. Contact info@hexaspace.com.au for assistance." />
  if (state === 'error') return <Screen icon="⚠️" title="Something went wrong" subtitle="Please try again or contact info@hexaspace.com.au." />

  if (state === 'signed' && insuranceChoice == null) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Header />
        <div className="max-w-xl mx-auto my-10 px-4">
          <div className="bg-white border border-gray-200 rounded-md p-8 shadow-sm">
            <div className="text-4xl mb-4 text-center">✅</div>
            <h2 className="text-lg font-bold text-gray-900 mb-2 text-center">Agreement Signed</h2>
            <p className="text-sm text-gray-500 mb-6 text-center">
              Thank you, {booking?.signerName}. Your agreement is signed. Hexa Space will countersign and be in touch to confirm your participation.
            </p>
            <InsuranceUploadStep booking={booking} token={token} onDone={setInsuranceChoice} />
          </div>
        </div>
      </div>
    )
  }

  if (state === 'signed' && insuranceChoice != null) {
    return (
      <Screen
        icon="✅"
        title="You're all set!"
        subtitle={
          insuranceChoice === 'later'
            ? `Thanks ${booking?.signerName}. Please email your Certificate of Currency to info@hexaspace.com.au and we'll confirm your booking.`
            : `Thanks ${booking?.signerName}. Agreement signed and insurance confirmed — we'll be in touch to confirm your booking.`
        }
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <div className="bg-white border-b border-gray-200 px-4 flex overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              view === tab.key ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view === 'doc1' && (
        <DocFrame><LicenceAgreementDoc booking={booking} /><NavBtn onClick={() => setView('doc3')}>Next: Venue Rules →</NavBtn></DocFrame>
      )}
      {view === 'doc3' && (
        <DocFrame><VenueRulesDoc /><NavBtn onClick={() => setView('sign')}>Proceed to Sign →</NavBtn></DocFrame>
      )}

      {view === 'sign' && (
        <div className="max-w-xl mx-auto my-8 px-4">
          <div className="bg-white border border-gray-200 rounded-md p-8 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Sign as Licensee</h2>
            <p className="text-sm text-gray-500 mb-6">By signing, you confirm you have read and agree to the Pop-up Licence Agreement and the Venue Rules.</p>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
              <input type="text" value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Your full legal name" className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Title / Position</label>
              <input type="text" value={signerTitle} onChange={e => setSignerTitle(e.target.value)} placeholder="e.g. Director, Owner, Manager" className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input type="text" value={signerDate} onChange={e => setSignerDate(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-600">Signature</label>
                <button onClick={() => sigRef.current?.clear()} className="text-xs text-gray-400 hover:text-gray-700 underline">Clear</button>
              </div>
              <SignatureCanvas ref={sigRef} height={140} />
              <p className="text-xs text-gray-400 mt-1">Draw your signature using mouse or finger</p>
            </div>

            <label className="flex items-start gap-3 mb-6 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 shrink-0" />
              <span className="text-sm text-gray-600">
                I confirm I have read and agree to the (1) Pop-up Licence Agreement (including all clauses) and (2) Venue Rules and Operating Conditions, and that I am authorised to sign on behalf of the Licensee.
              </span>
            </label>

            <div className="bg-gray-50 rounded-md p-4 text-xs text-gray-500 mb-6 space-y-1">
              <div><span className="font-medium text-gray-700">Licensee:</span> {[booking?.vendorBusiness, booking?.vendorName].filter(Boolean).join(' — ')}</div>
              {booking?.allocatedSpace && <div><span className="font-medium text-gray-700">Venue / Space:</span> {booking.allocatedSpace}</div>}
              <div><span className="font-medium text-gray-700">Booking:</span> {booking?.venue || POPUP_VENUE}{booking?.bookingStartDate && booking?.bookingEndDate ? ` · ${fmtDate(booking.bookingStartDate)} – ${fmtDate(booking.bookingEndDate)}` : ''}</div>
              <div><span className="font-medium text-gray-700">Licensor:</span> Hexa Space Pty Ltd</div>
            </div>

            <button onClick={handleSign} disabled={submitting || !agreed} className="w-full bg-black text-white py-3 rounded-md text-sm font-bold hover:bg-gray-800 disabled:opacity-40 transition-colors">
              {submitting ? 'Submitting…' : 'Sign & Submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Vendor details form (step 1 before documents) ────────────────────────────

const VENDOR_TYPES = [
  'Food & Beverage',
  'Products / Retail',
  'Brand Activation',
  'Car Display',
  'Services',
  'Sponsor',
  'Other',
]

function VendorDetailsForm({ booking, token, onComplete }) {
  const [form, setForm] = useState({
    vendorBusiness: booking.vendorBusiness || '',
    vendorAbn: booking.vendorAbn || '',
    vendorPhone: booking.vendorPhone || '',
    vendorType: booking.vendorType || '',
    vendorDescription: booking.vendorDescription || '',
    instagramHandle: booking.instagramHandle || '',
    carDetails: booking.carDetails || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.vendorType) { setError('Please select a vendor / participation type.'); return }
    if (!form.vendorDescription.trim()) { setError('Please tell us what you\'re bringing or offering.'); return }
    setSaving(true)
    setError(null)
    try {
      const save = await fetch('/api/event-bookings/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, patch: { ...form, detailsCompleted: true } }),
      })
      if (!save.ok) throw new Error('save failed')
      onComplete((await save.json()).booking)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inp = 'w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900'
  const lab = 'block text-xs font-medium text-gray-700 mb-1'

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <div className="max-w-lg mx-auto my-8 px-4">
        <div className="bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden">
          {/* Welcome header */}
          <div className="bg-black text-white px-8 py-6">
            <div className="text-xs tracking-widest text-gray-400 uppercase mb-1">You're invited</div>
            <h2 className="text-xl font-bold">Lonsdale 369 Pop-up</h2>
            <p className="text-sm text-gray-300 mt-1">Sunday 7 June 2026 · 3:00 PM – 9:00 PM</p>
            <p className="text-xs text-gray-400 mt-0.5">369 Lonsdale Street, Melbourne VIC 3000</p>
          </div>

          <div className="px-8 py-6">
            <p className="text-sm text-gray-600 mb-6">
              Hi <strong>{booking.vendorName}</strong> — before you review and sign your vendor agreement, please confirm your participation details below.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={lab}>Business / Trading Name <span className="text-gray-400">(if applicable)</span></label>
                <input className={inp} value={form.vendorBusiness} onChange={e => set('vendorBusiness', e.target.value)} placeholder="e.g. Carted Crema" />
              </div>

              <div>
                <label className={lab}>ABN <span className="text-gray-400">(if applicable)</span></label>
                <input className={inp} value={form.vendorAbn} onChange={e => set('vendorAbn', e.target.value)} placeholder="00 000 000 000" />
              </div>

              <div>
                <label className={lab}>Mobile Number</label>
                <input type="tel" className={inp} value={form.vendorPhone} onChange={e => set('vendorPhone', e.target.value)} placeholder="04XX XXX XXX" />
              </div>

              <div>
                <label className={lab}>Instagram Handle <span className="text-gray-400">(optional)</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">@</span>
                  <input
                    className={inp + ' pl-7'}
                    value={form.instagramHandle.replace(/^@/, '')}
                    onChange={e => set('instagramHandle', e.target.value.replace(/^@/, ''))}
                    placeholder="yourhandle"
                  />
                </div>
              </div>

              <div>
                <label className={lab}>Participation Type *</label>
                <select className={inp} value={form.vendorType} onChange={e => set('vendorType', e.target.value)} required>
                  <option value="">Select your category…</option>
                  {VENDOR_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className={lab}>What are you bringing / offering? *</label>
                <textarea
                  className={inp}
                  rows={3}
                  value={form.vendorDescription}
                  onChange={e => set('vendorDescription', e.target.value)}
                  placeholder={
                    form.vendorType === 'Car Display'
                      ? 'e.g. Full details of your build, brand, modifications'
                      : form.vendorType === 'Food & Beverage'
                      ? 'e.g. Specialty single-origin espresso, cold brew, and pastries'
                      : 'Describe what you\'ll be selling, showcasing, or doing at the event'
                  }
                  required
                />
              </div>

              <div>
                <label className={lab}>
                  What car(s) are you bringing?{' '}
                  <span className="text-gray-400">(optional — leave blank if not applicable)</span>
                </label>
                <textarea
                  className={inp}
                  rows={3}
                  value={form.carDetails}
                  onChange={e => set('carDetails', e.target.value)}
                  placeholder="e.g. 1993 Toyota Supra — JDM RZ, full body kit, engine bay on display&#10;e.g. 2002 Subaru WRX STi — Stage 3 build, widebody"
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-black text-white py-3 rounded-md text-sm font-bold hover:bg-gray-800 disabled:opacity-40 mt-2"
              >
                {saving ? 'Saving…' : 'Continue to Documents →'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Insurance upload step ─────────────────────────────────────────────────────

function InsuranceUploadStep({ booking, token, onDone }) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const fileRef = useRef(null)

  async function handleUpload(file) {
    if (!file) return
    if (file.size > 4 * 1024 * 1024) { setUploadError('File must be under 4 MB — or email it to info@hexaspace.com.au.'); return }
    setUploading(true)
    setUploadError(null)
    try {
      const fileBase64 = await fileToBase64(file)
      const up = await fetch('/api/event-bookings/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, kind: 'insurance', fileBase64, contentType: file.type, fileName: file.name }),
      })
      if (!up.ok) throw new Error('upload failed')
      const { url } = await up.json()

      const save = await fetch('/api/event-bookings/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, patch: { status: 'insurance_received', insuranceStatus: 'received', insuranceUrl: url, insuranceFileName: file.name, insuranceUploadedAt: new Date().toISOString() } }),
      })
      const updated = save.ok ? (await save.json()).booking : { ...booking, insuranceUrl: url }

      await fetch('/api/event-bookings/send-signing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking: updated, mode: 'insurance_uploaded' }),
      }).catch(() => {})

      onDone('done')
    } catch (err) {
      console.error(err)
      setUploadError('Upload failed. Please try again or email your certificate to info@hexaspace.com.au.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDefer() {
    const save = await fetch('/api/event-bookings/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, patch: { status: 'insurance_pending', insuranceStatus: 'pending', insuranceDeferredAt: new Date().toISOString() } }),
    })
    const updated = save.ok ? (await save.json()).booking : booking
    await fetch('/api/event-bookings/send-signing', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking: updated, mode: 'insurance_deferred' }),
    }).catch(() => {})
    onDone('later')
  }

  return (
    <div className="border border-gray-200 rounded-md p-5">
      <h3 className="font-semibold text-sm text-gray-800 mb-1">Public Liability Insurance Required</h3>
      <p className="text-xs text-gray-500 mb-3">
        Clause 9 of your agreement requires a Certificate of Currency showing at least{' '}
        <strong>AUD $20,000,000 Public Liability Insurance</strong> per occurrence,
        provided no later than 5 Business Days before the event.
      </p>
      <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5 text-xs text-amber-800 mb-4">
        <strong>Don't have public liability insurance?</strong> Contact Jitesh on{' '}
        <a href="tel:0404339815" className="font-semibold underline">0404 339 815</a>{' '}
        and he'll organise a one-day policy for you.
      </div>

      {/* Upload area */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f) }}
        className="border-2 border-dashed border-gray-200 rounded-md p-6 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors mb-3"
      >
        <div className="text-2xl mb-2">📄</div>
        <p className="text-sm font-medium text-gray-700">
          {uploading ? 'Uploading…' : 'Upload Certificate of Currency'}
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF, JPG or PNG · max 10 MB · drag & drop or click</p>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={e => { const f = e.target.files[0]; if (f) handleUpload(f) }}
        />
      </div>

      {uploadError && (
        <p className="text-xs text-red-500 mb-3">{uploadError}</p>
      )}

      <div className="flex items-center gap-3 mt-2">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-xs text-gray-400">or</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      <button
        onClick={handleDefer}
        disabled={uploading}
        className="w-full mt-3 border border-gray-200 text-gray-600 py-2 rounded-md text-sm hover:bg-gray-50 disabled:opacity-40"
      >
        I'll email it to info@hexaspace.com.au
      </button>
    </div>
  )
}

function Header() {
  return (
    <div className="bg-black text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
      <div>
        <span className="font-black tracking-widest text-lg">HEXA SPACE</span>
        <span className="text-gray-400 text-sm ml-3">Event Venue Licence Agreement</span>
      </div>
      <div className="text-right hidden sm:block">
        <div className="text-sm font-medium text-white">Lonsdale 369 Pop-up</div>
        <div className="text-xs text-gray-400">Sunday 7 June 2026 · 17 Logistic Court, Box Hill</div>
      </div>
    </div>
  )
}

function DocFrame({ children }) {
  return (
    <div className="max-w-4xl mx-auto my-6 px-4">
      <div className="bg-white shadow-sm rounded-md overflow-hidden px-10 py-10">{children}</div>
    </div>
  )
}

function NavBtn({ onClick, children }) {
  return (
    <div className="mt-8 flex justify-end">
      <button onClick={onClick} className="bg-black text-white px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-gray-800">{children}</button>
    </div>
  )
}

function Screen({ icon, title, subtitle }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-sm w-full">
        <div className="text-2xl font-black tracking-widest text-gray-900 mb-6">HEXA SPACE</div>
        <div className="bg-white border border-gray-200 rounded-md p-8 shadow-sm">
          {icon && <div className="text-4xl mb-4">{icon}</div>}
          <h1 className="text-lg font-bold text-gray-900 mb-2">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}
