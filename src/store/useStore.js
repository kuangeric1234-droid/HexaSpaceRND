import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { logAudit } from '../lib/audit.js'
import { publishListing } from '../lib/sanity.js'

const STORAGE_KEYS = {
  tenants: 'hexahub_tenants',
  spaces: 'hexahub_spaces',
  leases: 'hexahub_leases',
  templates: 'hexahub_templates',
  invoices: 'hexahub_invoices',
  lastBillRun: 'hexahub_last_bill_run',
  discounts: 'hexahub_discounts',
  settings: 'hexahub_settings',
}

const DEFAULT_SETTINGS = {
  company: {
    name: 'HexaHub Pty Ltd',
    email: 'info@hexahub.com.au',
    logo: '',
    website: 'hexahub.com.au',
  },
  billing: {
    businessName: 'HexaHub Pty Ltd',
    abn: '51 234 567 890',
    gstRegistered: true,
    accountablePerson: '',
    bankName: 'Commonwealth Bank',
    bsb: '063-000',
    acc: '00000000',
    address: '7 Distribution Circuit, Huntingdale VIC 3166',
  },
  adminUsers: [
    { id: 'u1', name: 'HexaHub Admin', email: 'info@hexahub.com.au', role: 'Super Admin', access: 'Full Access' },
  ],
  emails: {
    notificationEmail: 'info@hexahub.com.au',
    replyTo: 'info@hexahub.com.au',
    cc: '',
    bcc: '',
    fromEmail: 'noreply@hexahub.com.au',
    fromName: 'HexaHub',
    dnsVerified: false,
  },
  contracts: {
    numberTemplate: 'CON-{{number}}',
    approvalRequired: false,
    eSignEmail: 'esign@hexahub.com.au',
    eSignName: 'HexaHub',
    terminationReasons: [
      'Office Move - Client request move',
      'Business Closure',
      'Non-Payment',
      'Lease Breach',
      'End of Term',
      'Mutual Agreement',
      'Upgrade / Downgrade',
      'Other',
    ],
  },
  billingRules: {
    billingPeriodStartDay: 1,
    taxEnabled: true,
    taxRate: 10,
    multiLocationBilling: false,
  },
  invoicing: {
    proration: true,
    autoGenerate: true,
    dueDateDays: 14,
    overdueReminderDays: 7,
    invoiceNumberTemplate: 'INV-{{number}}',
    autoSend: false,
  },
  emailTemplates: {
    invoice: {
      subject: 'Invoice {{number}} from {{company}}',
      intro: 'Please find your invoice attached. Payment is due by {{dueDate}}.',
    },
    reminder: {
      subject: 'Payment reminder — {{number}} is overdue',
      intro: 'This is a friendly reminder that invoice {{number}} for {{amount}} was due on {{dueDate}} and remains unpaid. Please arrange payment at your earliest convenience.',
    },
    receipt: {
      subject: 'Payment receipt — {{number}}',
      intro: 'Thank you — your payment of {{amount}} for invoice {{number}} has been received. A receipt is attached for your records.',
    },
    renewal: {
      subject: 'Lease renewal notice — {{contract}} expires {{expiryDate}}',
      intro: 'Your licence agreement is due to expire on {{expiryDate}}. We would love to continue our arrangement with you. Please contact us to discuss renewal terms.',
    },
    esign: {
      subject: 'Please sign: {{contract}} — {{company}}',
      intro: 'Please review and sign the attached licence agreement at your earliest convenience.',
    },
  },
}

// Sample invoices based on the 2 seed leases (today = 2026-05-15)
const SAMPLE_INVOICES = [
  {
    id: 'inv001',
    number: 'INV-0001',
    tenantId: 't1',
    leaseId: 'l1',
    status: 'paid',
    sentStatus: 'sent',
    source: 'bill-run',
    issueDate: '2026-04-01',
    dueDate: '2026-04-14',
    periodStart: '2026-04-01',
    periodEnd: '2026-04-30',
    reference: '',
    paymentMethod: 'Bank Transfer',
    discountPct: 0,
    vatEnabled: true,
    xeroSync: false,
    lineItems: [{
      id: 'li001',
      description: 'O5 – 11 Distribution Circuit · Apr 1 – Apr 30, 2026',
      revenueAccount: 'Membership Fees',
      unitPrice: 4708,
      qty: 1,
      discountPct: 0,
    }],
    payments: [{ id: 'pay001', date: '2026-04-08', amount: 5178.8, method: 'Bank Transfer', note: 'Direct transfer received' }],
    comments: [],
    creditNoteForId: null,
    createdAt: '2026-04-01',
    isProrated: false,
  },
  {
    id: 'inv002',
    number: 'INV-0002',
    tenantId: 't1',
    leaseId: 'l1',
    status: 'pending',
    sentStatus: 'sent',
    source: 'bill-run',
    issueDate: '2026-05-01',
    dueDate: '2026-05-15',
    periodStart: '2026-05-01',
    periodEnd: '2026-05-31',
    reference: '',
    paymentMethod: '',
    discountPct: 0,
    vatEnabled: true,
    xeroSync: false,
    lineItems: [{
      id: 'li002',
      description: 'O5 – 11 Distribution Circuit · May 1 – May 31, 2026',
      revenueAccount: 'Membership Fees',
      unitPrice: 4708,
      qty: 1,
      discountPct: 0,
    }],
    payments: [],
    comments: [],
    creditNoteForId: null,
    createdAt: '2026-05-01',
    isProrated: false,
  },
  {
    id: 'inv003',
    number: 'INV-0003',
    tenantId: 't2',
    leaseId: 'l2',
    status: 'overdue',
    sentStatus: 'sent',
    source: 'bill-run',
    issueDate: '2026-04-01',
    dueDate: '2026-04-14',
    periodStart: '2026-04-01',
    periodEnd: '2026-04-30',
    reference: '',
    paymentMethod: '',
    discountPct: 0,
    vatEnabled: true,
    xeroSync: false,
    lineItems: [{
      id: 'li003',
      description: 'O15 – 20 Logistic Court · Apr 1 – Apr 30, 2026',
      revenueAccount: 'Membership Fees',
      unitPrice: 3000,
      qty: 1,
      discountPct: 0,
    }],
    payments: [],
    comments: [],
    creditNoteForId: null,
    createdAt: '2026-04-01',
    isProrated: false,
  },
  {
    id: 'inv004',
    number: 'INV-0004',
    tenantId: 't2',
    leaseId: 'l2',
    status: 'pending',
    sentStatus: 'not_sent',
    source: 'bill-run',
    issueDate: '2026-05-01',
    dueDate: '2026-05-30',
    periodStart: '2026-05-01',
    periodEnd: '2026-05-30',
    reference: '',
    paymentMethod: '',
    discountPct: 0,
    vatEnabled: true,
    xeroSync: false,
    lineItems: [{
      id: 'li004',
      description: 'O15 – 20 Logistic Court · May 1 – May 30, 2026 (prorated)',
      revenueAccount: 'Membership Fees',
      unitPrice: 2903,
      qty: 1,
      discountPct: 0,
    }],
    payments: [],
    comments: [],
    creditNoteForId: null,
    createdAt: '2026-05-01',
    isProrated: true,
  },
]

const SAMPLE_DISCOUNTS = [
  { id: 'disc001', name: 'Early Sign-Up', type: 'pct', value: 10, description: '10% off first 3 months' },
  { id: 'disc002', name: 'Long-Term Commitment', type: 'pct', value: 5, description: '5% off for 12-month contracts' },
]

const SAMPLE_TEMPLATES = [
  {
    id: 'tmpl1',
    name: 'Terms and Conditions',
    version: 'v2.0',
    type: 'terms',
    content: `<h2>Warehouse &amp; Storage Licence Agreement — Terms &amp; Conditions</h2><h3>1. Definitions</h3><p>In this Agreement: <strong>"Agreement"</strong> means this Warehouse &amp; Storage Licence Agreement; <strong>"Commencement Date"</strong> means the start date in the Key Details; <strong>"End Date"</strong> means the end date in the Key Details; <strong>"Exit Fee"</strong> means the fee payable upon termination or expiry as specified herein; <strong>"HexaHub"</strong> means HexaHub Pty Ltd; <strong>"House Rules"</strong> means the Found Huntingdale House Rules as amended from time to time; <strong>"Interest Rate"</strong> means 2% per month or the maximum rate permitted by law, whichever is lower; <strong>"Licence Fee"</strong> means the monthly fee in the Key Details; <strong>"Licensee"</strong> means the party identified on page 1; <strong>"Premises"</strong> means the warehouse or storage unit at Found Huntingdale, 17–31 Franklyn Street, Huntingdale VIC 3166; <strong>"Security Deposit"</strong> means the deposit amount in the Key Details; <strong>"Service Term"</strong> means the term specified in the Key Details.</p><h3>2. Term</h3><p>(a) This Agreement commences on the Commencement Date and continues until the End Date, unless terminated earlier in accordance with its terms.</p><p>(b) Unless either party provides written notice of non-renewal no later than the Minimum Notice Period prior to the End Date, this Agreement will automatically renew for a further term equal to the original Service Term on the same terms, subject to any Licence Fee adjustment.</p><h3>3. Permitted Use</h3><p>(a) The Licensee is granted a licence to occupy and use the Premises solely for lawful warehousing, storage, fulfilment, and light industrial operations directly related to the Licensee's business as declared at application. The Premises must not be used for retail, residential, manufacturing involving hazardous processes, or any purpose not approved in writing by HexaHub.</p><p>(b) This Agreement is a licence only and does not create a tenancy, lease, or any right of exclusive possession at law. The Licensee acknowledges they obtain no proprietary interest in the Premises.</p><h3>4. HexaHub Obligations</h3><p>(a) HexaHub agrees to provide the Licensee with access to the Premises and to maintain the structural integrity of the building, common driveways, and shared services in good repair throughout the Service Term.</p><p>(b) HexaHub may relocate the Licensee to a comparable unit within the complex on 30 days' written notice where reasonably required for operational purposes.</p><h3>5. Licensee Obligations</h3><p>(a) The Licensee agrees to: (i) comply with this Agreement and the House Rules at all times; (ii) use the Premises only for the Permitted Use; (iii) keep the Premises in a clean, safe, and good condition; (iv) not carry out any structural alterations without prior written consent; (v) ensure all employees, contractors, and visitors comply with this Agreement and the House Rules; (vi) maintain all required regulatory licences and permits for its operations; (vii) not sublet or grant any other person a right to use the Premises without prior written consent; and (viii) comply with all applicable laws including the Occupational Health and Safety Act 2004 (Vic), Environmental Protection Act 1970 (Vic), and Dangerous Goods Act 1985 (Vic).</p><p>(b) The Licensee must, upon HexaHub's request, provide evidence of all regulatory compliance relevant to its operations, including dangerous goods licences, EPA permits, and OH&amp;S management plans.</p><h3>6. Security Deposit</h3><p>(a) The Licensee must pay the Security Deposit prior to the Commencement Date as security for the performance of its obligations. HexaHub may apply the Security Deposit to any amounts owing, including unpaid Licence Fees, damage, or cleaning costs. The Security Deposit cannot be applied as a substitute for Licence Fee payments.</p><p>(b) Subject to deductions, the Security Deposit will be refunded without interest within 60 days of the later of (i) expiry or termination and (ii) the Licensee fulfilling all obligations to HexaHub's reasonable satisfaction.</p><h3>7. Fees, Payment &amp; Invoicing</h3><p>(a) <strong>Licence Fee:</strong> Payable monthly in advance on the first day of each month by direct bank transfer. The first payment (inclusive of any prorated amount for the commencement month) is due on or before the Commencement Date.</p><p>(b) <strong>Late Payment:</strong> If any amount remains unpaid 5 business days after the due date, HexaHub may: (i) charge interest at the Interest Rate; (ii) charge a late payment fee of $80; (iii) suspend the Licensee's access to the Premises on 3 business days' notice; and/or (iv) terminate this Agreement in accordance with clause 12.</p><p>(c) <strong>Outgoings:</strong> The Licence Fee is exclusive of separately metered utilities unless stated otherwise in the Key Details. Any utilities consumed by the Licensee beyond shared allocations will be charged at cost.</p><p>(d) <strong>GST:</strong> All amounts are exclusive of GST. The Licensee must pay GST in addition to all amounts payable under this Agreement.</p><p>(e) <strong>Annual Adjustment:</strong> The Licence Fee will be reviewed annually on each anniversary of the Commencement Date. HexaHub will provide 30 days' written notice of any adjustment. Annual increases will not exceed 8% and will be subject to a minimum increase of 3% or the change in CPI for Victoria for the preceding 12 months, whichever is greater.</p><p>(f) <strong>Exit Fee:</strong> Upon expiry or termination, the Licensee shall pay an exit fee as specified in the Key Details to cover cleaning and restoration, payable within 7 days of invoice.</p><p>(g) <strong>Direct Debit Authority:</strong> If any invoice remains unpaid for 14 or more calendar days after its due date, the Licensee irrevocably authorises HexaHub to debit the Licensee's nominated bank account or credit card for all outstanding amounts, with at least 2 business days' prior written notice.</p><h3>8. Access to the Premises</h3><p>HexaHub's personnel may, on reasonable written notice (except in an emergency), enter the Premises for: (a) routine inspections; (b) repair, maintenance, or safety works; (c) showing the Premises to prospective Licensees after notice of non-renewal; or (d) any other reasonable purpose specified in the notice.</p><h3>9. Alterations &amp; Fit-Out</h3><p>(a) The Licensee must not make any structural alterations, additions, or improvements to the Premises without prior written approval from HexaHub. All approved works must be carried out by licensed contractors in compliance with all applicable building codes and regulations, at the Licensee's expense.</p><p>(b) Unless otherwise agreed in writing, the Licensee must remove all fit-out and restore the Premises to its original condition at the end of the Service Term at the Licensee's cost.</p><h3>10. Insurance</h3><p>(a) The Licensee must obtain and maintain throughout the Service Term: (i) public liability insurance with a minimum cover of $20,000,000 per occurrence; (ii) workers' compensation insurance as required by law; and (iii) insurance covering the Licensee's goods, stock, and equipment for their full replacement value. Evidence of current insurance must be provided to HexaHub upon request.</p><p>(b) HexaHub's insurance does not cover the Licensee's goods, property, or liability. HexaHub is not responsible for any loss of or damage to the Licensee's property at the Premises.</p><h3>11. Termination</h3><p>HexaHub may immediately terminate this Agreement by written notice if: (a) the Licence Fee or any other amount remains unpaid for 5 business days after written notice; (b) the Licensee breaches any provision of this Agreement or the House Rules and fails to remedy the breach within 14 days of written notice; (c) the Licensee uses the Premises for an unlawful purpose; (d) insolvency or bankruptcy proceedings are commenced against the Licensee; or (e) the Licensee causes material damage to the Premises or poses a risk to the safety of others.</p><h3>12. Effect of Termination or Expiry</h3><p>(a) Upon termination or expiry: (i) the Licensee must immediately vacate and return all access credentials; (ii) all goods and property must be removed within 5 business days; (iii) the Premises must be restored to original condition; (iv) all outstanding amounts become immediately due; and (v) HexaHub may re-occupy the Premises immediately. Any property left after 5 business days will be deemed abandoned and may be disposed of at the Licensee's cost.</p><p>(b) If this Agreement is terminated prior to the End Date due to the Licensee's breach, the Licensee remains liable for Licence Fees for the balance of the Service Term.</p><h3>13. HexaHub Liability</h3><p>(a) To the extent permitted by law, HexaHub excludes all implied warranties and conditions. HexaHub is not liable for: (i) loss of or damage to the Licensee's goods or property; (ii) interruption to the Licensee's business; (iii) indirect or consequential loss; or (iv) loss caused by third parties. Nothing limits liability for personal injury or death caused by HexaHub's negligence or for non-excludable consumer guarantees.</p><h3>14. Licensee's Liability</h3><p>(a) The Licensee indemnifies HexaHub and its personnel from all claims, losses, and costs arising from: (i) the Licensee's use of the Premises; (ii) breach of this Agreement or House Rules; (iii) injury, death, or property damage caused by the Licensee or its personnel; or (iv) any environmental contamination caused by the Licensee's operations.</p><p>(b) The Licensee is responsible for all damage caused by its operations, fair wear and tear excepted.</p><h3>15. General</h3><p>(a) <strong>Entire Agreement:</strong> This Agreement and the House Rules constitute the entire agreement between the parties in respect of the Premises. (b) <strong>Governing Law:</strong> This Agreement is governed by the laws of Victoria, Australia, and the parties submit to the exclusive jurisdiction of the Victorian courts. (c) <strong>Severability:</strong> If any provision is illegal or unenforceable, it will be severed and the remainder continues in full force. (d) <strong>Assignment:</strong> The Licensee must not assign this Agreement without HexaHub's prior written consent. (e) <strong>Notices:</strong> Notices must be in writing and delivered by email, effective upon confirmed receipt. (f) <strong>Waiver:</strong> Failure to enforce any provision does not constitute a waiver.</p>`,
    updatedAt: '2026-05-15',
    createdAt: '2025-01-01',
  },
  {
    id: 'tmpl2',
    name: 'House Rules',
    version: 'v2.0',
    type: 'house-rules',
    content: `<h2>Found Huntingdale — House Rules</h2><p>These House Rules govern the use of the Found Huntingdale premises at 17–31 Franklyn Street, Huntingdale VIC 3166 ("the Premises"), operated by HexaHub Pty Ltd ("HexaHub"). They apply to all Licensees, their employees, contractors, agents, and visitors. HexaHub reserves the right to amend these House Rules at any time with reasonable notice.</p><h3>1. Access &amp; Security</h3><p>Access to the Premises is provided 24 hours a day, 7 days a week via electronic access credentials (key fob, access card, or digital key). Licensees are responsible for the security of their access credentials and must not share, duplicate, or transfer them to unauthorised persons. Any loss, theft, or suspected compromise of access credentials must be reported to HexaHub in writing immediately. Replacement fees apply at HexaHub's prevailing rates. All visitors must register with HexaHub management or sign in at the access point. The Licensee is responsible for the conduct of all visitors to their unit at all times.</p><h3>2. Loading, Deliveries &amp; Vehicle Movements</h3><p>All loading and unloading must be conducted using the designated loading docks and access points allocated to each unit. Vehicles must not obstruct common driveways, access roads, loading areas, fire lanes, or emergency exits at any time. Large vehicle movements (semi-trailers, B-doubles, over-dimensional loads) must be pre-approved by HexaHub management and coordinated to avoid peak access periods. Forklifts, pallet jacks, and other materials-handling equipment are permitted within the Licensee's allocated unit and designated loading areas only. All operators must hold current and appropriate licences and certifications. HexaHub accepts no liability for deliveries received in common areas or outside the Licensee's unit.</p><h3>3. Parking</h3><p>Car parking spaces allocated under the Licence Agreement are for the exclusive use of the Licensee's personnel. Vehicles must not be parked in fire lanes, loading zones, or in a manner that obstructs other Licensees' access. Unallocated vehicles may be towed at the owner's expense without notice. Overnight vehicle storage and long-term trailer storage within the complex require prior written approval from HexaHub and may be subject to additional charges.</p><h3>4. Prohibited Items &amp; Hazardous Materials</h3><p>The following are strictly prohibited from the Premises unless specifically authorised in writing by HexaHub:</p><ul><li>Flammable, explosive, or combustible materials beyond quantities permitted under applicable codes and the Dangerous Goods Act 1985 (Vic)</li><li>Toxic, corrosive, radioactive, or chemically reactive substances</li><li>Illegal goods, stolen property, or contraband of any kind</li><li>Firearms, weapons, or ammunition</li><li>Livestock or animals (except approved assistance animals)</li><li>Any goods producing excessive odour, dust, or noise that may affect other Licensees or neighbouring properties</li></ul><p>Where the Licensee's operations involve regulated dangerous goods, the Licensee must comply with all applicable regulations and provide HexaHub with current compliance documentation upon request. Any chemical spill or environmental incident must be reported to HexaHub and relevant authorities immediately.</p><h3>5. Fire Safety &amp; Emergency Procedures</h3><p>Licensees must not obstruct fire exits, fire extinguisher access points, sprinkler systems, or emergency evacuation routes at any time. Storage within 600mm of any sprinkler head is strictly prohibited. A clear evacuation path must be maintained within each unit at all times. In the event of fire or emergency, the Licensee must evacuate immediately, call emergency services (000), and notify HexaHub. The Premises must not be re-entered until cleared by emergency services and HexaHub. Hot works (welding, cutting, grinding) require a written hot works permit from HexaHub management at least 48 hours in advance. Fire extinguishers and safety equipment within the unit must be maintained in serviceable condition at the Licensee's expense.</p><h3>6. Structural Alterations &amp; Fit-Out</h3><p>No structural alterations, penetrations, drilling, or modifications to walls, floors, ceilings, roller doors, or building services may be made without prior written consent from HexaHub. All approved works must be conducted by appropriately licensed tradespeople in compliance with the Building Act 1993 (Vic), National Construction Code, and all applicable Australian Standards. The Licensee is responsible for all associated costs, including council approvals where required. The Premises must be restored to original condition at the Licensee's cost upon vacating unless otherwise agreed in writing.</p><h3>7. Waste Management &amp; Cleanliness</h3><p>The Licensee is responsible for the disposal of all waste generated by its operations using the designated waste areas and bins. Bulk waste, pallets, and cardboard must be broken down and placed in allocated recycling areas. Waste must not be placed in common driveways, car parks, or in a manner that obstructs access or creates a hazard. Hazardous, chemical, and e-waste must be disposed of in accordance with applicable Victorian regulations and must not be placed in general waste receptacles. Units must be kept in a clean and tidy condition at all times. HexaHub reserves the right to charge a cleaning fee if a unit is left in an unsatisfactory condition.</p><h3>8. Noise &amp; Hours of Operation</h3><p>While 24/7 access is available, operational activities generating significant noise — including heavy machinery, power tools, and loading equipment — must be conducted between 7:00 AM and 9:00 PM Monday to Saturday. Activities outside these hours require prior written approval from HexaHub. Operations must not cause unreasonable interference with other Licensees or neighbouring properties at any time. The Licensee must comply with the Environment Protection Act 2017 (Vic) noise provisions and any applicable EPA guidelines.</p><h3>9. Maintenance &amp; Reporting</h3><p>The Licensee must promptly report any damage to the unit, building services, roller doors, or common areas to HexaHub management in writing. The Licensee is responsible for maintaining the interior of their unit in good condition, including replacing globes and maintaining any fixtures specific to their occupation. HexaHub is responsible for structural maintenance, common area upkeep, and building services outside the unit boundary. Routine maintenance requests should be submitted in writing with reasonable notice.</p><h3>10. Compliance with Laws</h3><p>Licensees must at all times comply with all applicable Commonwealth and Victorian laws, regulations, and by-laws relevant to their operations, including but not limited to the Occupational Health and Safety Act 2004 (Vic), Environmental Protection Act 2017 (Vic), Dangerous Goods Act 1985 (Vic), Building Act 1993 (Vic), Workplace Injury Rehabilitation and Compensation Act 2013 (Vic), and relevant Australian Standards. The Licensee must not use the Premises for any unlawful purpose. HexaHub reserves the right to immediately suspend or terminate access if a breach of law is identified or reasonably suspected.</p>`,
    updatedAt: '2026-05-15',
    createdAt: '2025-01-01',
  },
]

// ── Real Found Huntingdale data (PDF: 17 April 2026) ──────────────────────────
// Prices in PDF are annual ex-GST ex-outgoings. monthlyRate = annualRate / 12 (rounded).
// "reserved" = Under Offer per PDF.

const SAMPLE_TENANTS = [
  {
    id: 't1',
    businessName: 'Meridian Fulfilment Pty Ltd',
    contactName: 'Sarah Chen',
    email: 'sarah@meridianful.com.au',
    phone: '0412 345 678',
    abn: '51 234 567 890',
    industry: 'E-commerce & Logistics',
    country: 'Australia',
    createdAt: '2024-06-01',
  },
  {
    id: 't2',
    businessName: 'BluePeak Distribution Co',
    contactName: 'James Okafor',
    email: 'james@bluepeak.com.au',
    phone: '0398 765 432',
    abn: '78 901 234 567',
    industry: 'Wholesale Distribution',
    country: 'Australia',
    createdAt: '2025-01-10',
  },
]

const SAMPLE_SPACES = [
  // ── Hexa Space — Box Hill (pin onto Level 2/4/5 in the Plan view) ─────────
  { id: 'hx_off_1pax',   unitNumber: '1 Pax',        type: 'office',  size: '1 desk',  monthlyRate: 700,   status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: '1 person internal private office.' },
  { id: 'hx_off_2pax',   unitNumber: '2 Pax',        type: 'office',  size: '2 pax',   monthlyRate: 1800,  status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: '2 person external private office.' },
  { id: 'hx_off_4pax_e', unitNumber: '4 Pax Ext',    type: 'office',  size: '4 pax',   monthlyRate: 2800,  status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: '4 person external private office.' },
  { id: 'hx_off_4pax_i', unitNumber: '4 Pax Int',    type: 'office',  size: '4 pax',   monthlyRate: 2800,  status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: '4 person internal private office.' },
  { id: 'hx_off_5pax',   unitNumber: '5 Pax',        type: 'office',  size: '5 pax',   monthlyRate: 4500,  status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: '5 person external private office.' },
  { id: 'hx_off_6pax',   unitNumber: '6 Pax',        type: 'office',  size: '6 pax',   monthlyRate: 5400,  status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: '6 person external private office.' },
  { id: 'hx_off_8pax',   unitNumber: '8 Pax',        type: 'office',  size: '8 pax',   monthlyRate: 7200,  status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: '8 person external private office.' },
  { id: 'hx_suite_12',   unitNumber: '12 Pax Suite', type: 'office',  size: '12 pax',  monthlyRate: 10800, status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: '12 person external suite.' },
  { id: 'hx_suite_26',   unitNumber: '26 Pax Ent',   type: 'office',  size: '26 pax',  monthlyRate: 20000, status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: '26 person enterprise suite.' },
  { id: 'hx_mr_sky',     unitNumber: 'Sky',          type: 'meeting', size: 'Up to 4',  monthlyRate: 0, hourlyRate: 20,  status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: 'Sky (Tian) consulting room · $20/hr · up to 4.' },
  { id: 'hx_mr_earth',   unitNumber: 'Earth',        type: 'meeting', size: 'Up to 4',  monthlyRate: 0, hourlyRate: 20,  status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: 'Earth (Di) · $20/hr · up to 4.' },
  { id: 'hx_mr_north',   unitNumber: 'North',        type: 'meeting', size: 'Up to 8',  monthlyRate: 0, hourlyRate: 60,  status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: 'North (Bei) · $60/hr · up to 8.' },
  { id: 'hx_mr_south',   unitNumber: 'South',        type: 'meeting', size: 'Up to 4',  monthlyRate: 0, hourlyRate: 60,  status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: 'South (Nan) · $60/hr · up to 4.' },
  { id: 'hx_mr_east',    unitNumber: 'East',         type: 'meeting', size: 'Up to 6',  monthlyRate: 0, hourlyRate: 80,  status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: 'East (Dong) Chinese tearoom · $80/hr · up to 6.' },
  { id: 'hx_mr_west',    unitNumber: 'West',         type: 'meeting', size: 'Up to 8',  monthlyRate: 0, hourlyRate: 80,  status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: 'West (Xi) · $80/hr · up to 8.' },
  { id: 'hx_mr_central', unitNumber: 'Central',      type: 'meeting', size: 'Up to 14', monthlyRate: 0, hourlyRate: 80,  status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: 'Central (Zhong) · $80/hr · up to 14.' },
  { id: 'hx_func',       unitNumber: 'Function',     type: 'meeting', size: '20–100',   monthlyRate: 0, hourlyRate: 250, status: 'vacant', location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: 'Hexa Function Space · $250/hr · 20–100 guests.' },

  // ── Distribution Circuit — Block B ────────────────────────────────────────
  {
    id: 'so5',
    unitNumber: 'O5',
    type: 'warehouse',
    size: '240 m²',
    monthlyRate: 4708,   // $56,500/yr ÷ 12
    status: 'occupied',
    location: 'huntingdale',
    address: '11 Distribution Circuit',
    cars: 5,
    attributes: 'Street frontage, rear access tilt door & full floor office.',
  },
  {
    id: 'so7',
    unitNumber: 'O7',
    type: 'warehouse',
    size: '240 m²',
    monthlyRate: 4708,
    status: 'vacant',
    location: 'huntingdale',
    address: '15 Distribution Circuit',
    cars: 5,
    attributes: 'Street frontage, rear access tilt door & full floor office.',
  },
  {
    id: 'so11',
    unitNumber: 'O11',
    type: 'warehouse',
    size: '128 m²',
    monthlyRate: 3333,   // $40,000/yr ÷ 12
    status: 'vacant',
    location: 'huntingdale',
    address: '103 Distribution Circuit',
    cars: 2,
    attributes: 'Corner 1st floor office with natural light and district views.',
  },
  {
    id: 'so10',
    unitNumber: 'O10',
    type: 'warehouse',
    size: '140 m²',
    monthlyRate: 3583,   // $43,000/yr ÷ 12
    status: 'vacant',
    location: 'huntingdale',
    address: '103 Distribution Circuit',
    cars: 3,
    attributes: 'Corner 1st floor office with natural light and district views.',
  },
  // ── Logistic Court ────────────────────────────────────────────────────────
  {
    id: 'so14',
    unitNumber: 'O14',
    type: 'warehouse',
    size: '136 m²',
    monthlyRate: 3000,   // $36,000/yr ÷ 12
    status: 'vacant',
    location: 'huntingdale',
    address: '19 Logistic Court',
    cars: 3,
    attributes: 'Ground floor office with private access direct from Franklyn Street.',
  },
  {
    id: 'so15',
    unitNumber: 'O15',
    type: 'warehouse',
    size: '136 m²',
    monthlyRate: 3000,
    status: 'occupied',
    location: 'huntingdale',
    address: '20 Logistic Court',
    cars: 3,
    attributes: 'Ground floor office with private access direct from Franklyn Street.',
  },
  {
    id: 's55w',
    unitNumber: '55W',
    type: 'warehouse',
    size: '223 m²',
    monthlyRate: 4083,   // $49,000/yr ÷ 12
    status: 'vacant',
    location: 'huntingdale',
    address: '6 Logistic Court',
    cars: 3,
    attributes: 'Positioned directly opposite the storage driveway for improved access and vehicle manoeuvrability.',
  },
  {
    id: 's51w',
    unitNumber: '51W',
    type: 'warehouse',
    size: '223 m²',
    monthlyRate: 4083,
    status: 'vacant',
    location: 'huntingdale',
    address: '2 Logistic Court',
    cars: 3,
    attributes: 'Easy access — first warehouse from Franklyn Street driveway. Traditional office/warehouse with standard inclusions.',
  },
  {
    id: 's61w',
    unitNumber: '61W',
    type: 'warehouse',
    size: '243 m²',
    monthlyRate: 4833,   // $58,000/yr ÷ 12
    status: 'vacant',
    location: 'huntingdale',
    address: '15 Logistic Court',
    cars: 3,
    attributes: 'Additional dual level office with balcony to the top floor.',
  },
  // ── Storage — 18 Logistic Court ───────────────────────────────────────────
  {
    id: 's61s',
    unitNumber: '61S',
    type: 'storage',
    size: '37 m²',
    monthlyRate: 942,    // $11,300/yr ÷ 12
    status: 'vacant',
    location: 'huntingdale',
    address: '25/18 Logistic Court',
    cars: 0,
    attributes: 'Wireless keypad and 2x bollards.',
  },
  {
    id: 's56s',
    unitNumber: '56S',
    type: 'storage',
    size: '39 m²',
    monthlyRate: 975,    // $11,700/yr ÷ 12
    status: 'vacant',
    location: 'huntingdale',
    address: '34/18 Logistic Court',
    cars: 0,
    attributes: 'Opposite The Hub.',
  },
  {
    id: 's42s',
    unitNumber: '42S',
    type: 'storage',
    size: '71 m²',
    monthlyRate: 1567,   // $18,800/yr ÷ 12
    status: 'reserved',  // Under Offer per PDF
    location: 'huntingdale',
    address: '38/18 Logistic Court',
    cars: 0,
    attributes: 'Opposite the Hub and drive through.',
  },
  {
    id: 's43s',
    unitNumber: '43S',
    type: 'storage',
    size: '31 m²',
    monthlyRate: 827,    // $9,920/yr ÷ 12
    status: 'reserved',  // Under Offer per PDF
    location: 'huntingdale',
    address: '39/18 Logistic Court',
    cars: 0,
    attributes: 'Base storage unit.',
  },
  {
    id: 's48s',
    unitNumber: '48S',
    type: 'storage',
    size: '75 m²',
    monthlyRate: 1625,   // $19,500/yr ÷ 12
    status: 'vacant',
    location: 'huntingdale',
    address: '44/18 Logistic Court',
    cars: 0,
    attributes: 'Drive through.',
  },
  {
    id: 's57s',
    unitNumber: '57S',
    type: 'storage',
    size: '43 m²',
    monthlyRate: 1075,   // $12,900/yr ÷ 12
    status: 'vacant',
    location: 'huntingdale',
    address: '47/18 Logistic Court',
    cars: 0,
    attributes: 'Opposite The Hub.',
  },
  {
    id: 's26s',
    unitNumber: '26S',
    type: 'storage',
    size: '39 m²',
    monthlyRate: 975,
    status: 'vacant',
    location: 'huntingdale',
    address: '58/18 Logistic Court',
    cars: 0,
    attributes: 'Base storage unit.',
  },
]

const SAMPLE_LEASES = [
  {
    id: 'l1',
    tenantId: 't1',
    spaceId: 'so5',  // Meridian in O5 (11 Distribution Circuit)
    startDate: '2025-07-01',
    endDate: '2026-06-15',  // 31 days from 2026-05-15 → shows in Renewals
    monthlyRent: 4708,
    bondAmount: 9416,
    status: 'active',
    notes: 'Renewal discussion pending. Tenant is happy with the space and access.',
    createdAt: '2025-06-20',
  },
  {
    id: 'l2',
    tenantId: 't2',
    spaceId: 'so15',  // BluePeak in O15 (20 Logistic Court)
    startDate: '2026-01-01',
    endDate: '2026-05-30',  // 15 days from 2026-05-15 → urgent in Renewals
    monthlyRent: 3000,
    bondAmount: 6000,
    status: 'active',
    notes: '',
    createdAt: '2025-12-10',
  },
]

// ── Lead pipeline ─────────────────────────────────────────────────────────────
// Default stages mirror Reuvi's pipeline categories (new|engaged|won|lost) so
// reporting keeps machine meaning whatever the labels say.

const DEFAULT_STAGES = [
  { id: 'stage_new',    name: 'New',    tone: 'gray',   sortOrder: 0, category: 'new' },
  { id: 'stage_toured', name: 'Toured', tone: 'blue',   sortOrder: 1, category: 'engaged' },
  { id: 'stage_quoted', name: 'Quoted', tone: 'orange', sortOrder: 2, category: 'engaged' },
  { id: 'stage_won',    name: 'Won',    tone: 'green',  sortOrder: 3, category: 'won' },
  { id: 'stage_lost',   name: 'Lost',   tone: 'red',    sortOrder: 4, category: 'lost' },
]

const SAMPLE_LEADS = [
  {
    id: 'lead001',
    name: 'Priya Nair',
    businessName: 'Nair Imports Pty Ltd',
    email: 'priya@nairimports.com.au',
    phone: '0421 998 112',
    spaceId: 'so7',   // O7 — vacant warehouse
    source: 'website',
    stageId: 'stage_toured',
    value: 4708,
    notes: 'Toured O7 on site, wants rear tilt-door access confirmed.',
    tenantId: null,
    createdAt: '2026-06-02',
    stageEnteredAt: '2026-06-10',
  },
  {
    id: 'lead002',
    name: 'Daniel Roszak',
    businessName: 'Forge & Co',
    email: 'dan@forgeandco.com.au',
    phone: '0438 221 760',
    spaceId: 'so11',  // O11 — vacant warehouse
    source: 'referral',
    stageId: 'stage_new',
    value: 3333,
    notes: 'Referred by Meridian. Needs first-floor office for ~3 staff.',
    tenantId: null,
    createdAt: '2026-06-14',
    stageEnteredAt: '2026-06-14',
  },
]

// ── Supabase helpers ──────────────────────────────────────────────────────────

function syncRow(table, id, data) {
  supabase.from(table)
    .upsert({ id, data, updated_at: new Date().toISOString() })
    .then(({ error }) => { if (error) console.error(`Supabase sync (${table}):`, error) })
}

function deleteRow(table, id) {
  supabase.from(table)
    .delete().eq('id', id)
    .then(({ error }) => { if (error) console.error(`Supabase delete (${table}):`, error) })
}

async function seedTable(table, items) {
  const rows = items.map((item) => ({ id: item.id, data: item, updated_at: new Date().toISOString() }))
  const { error } = await supabase.from(table).upsert(rows)
  if (error) console.error(`Supabase seed (${table}):`, error)
}

function extractRows(data) {
  return (data ?? []).map((r) => r.data)
}

export function useStore() {
  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState([])
  const [spaces, setSpaces] = useState([])
  const [leases, setLeases] = useState([])
  const [templates, setTemplates] = useState([])
  const [invoices, setInvoices] = useState([])
  const [discounts, setDiscounts] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [leads, setLeads] = useState([])
  const [pipelineStages, setPipelineStages] = useState([])
  const [eventRegistrations, setEventRegistrations] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [referrers, setReferrers] = useState([])
  const [commissions, setCommissions] = useState([])
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

  // Always-current settings ref for callbacks
  const settingsRef = useRef(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])

  // ── Load all data from Supabase on mount ──────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [
          { data: tData }, { data: sData }, { data: lData },
          { data: tmData }, { data: invData }, { data: discData },
          { data: maintData }, { data: settData }, { data: metaData },
          { data: leadData }, { data: stageData }, { data: regData },
          { data: campData }, { data: refData }, { data: commData },
        ] = await Promise.all([
          supabase.from('tenants').select('data'),
          supabase.from('spaces').select('data'),
          supabase.from('leases').select('data'),
          supabase.from('templates').select('data'),
          supabase.from('invoices').select('data'),
          supabase.from('discounts').select('data'),
          supabase.from('maintenance').select('data'),
          supabase.from('settings').select('data').eq('id', 'global'),
          supabase.from('meta').select('*'),
          supabase.from('leads').select('data'),
          supabase.from('lead_pipeline_stages').select('data'),
          supabase.from('event_registrations').select('data'),
          supabase.from('campaigns').select('data'),
          supabase.from('referrers').select('data'),
          supabase.from('commissions').select('data'),
        ])

        // 'seeded' flag — once set, we NEVER fall back to sample data again
        const isSeeded = metaData?.find((m) => m.key === 'seeded')?.value === 'true'

        const loadedTenants   = tData?.length    ? extractRows(tData)    : (isSeeded ? [] : SAMPLE_TENANTS)
        const loadedSpaces    = sData?.length    ? extractRows(sData)    : (isSeeded ? [] : SAMPLE_SPACES)
        const loadedLeases    = lData?.length    ? extractRows(lData)    : (isSeeded ? [] : SAMPLE_LEASES)
        const loadedTemplates = tmData?.length   ? extractRows(tmData)   : (isSeeded ? [] : SAMPLE_TEMPLATES)
        const loadedInvoices  = invData?.length  ? extractRows(invData)  : (isSeeded ? [] : SAMPLE_INVOICES)
        const loadedDiscounts   = discData?.length  ? extractRows(discData)  : (isSeeded ? [] : SAMPLE_DISCOUNTS)
        const loadedMaintenance = maintData?.length ? extractRows(maintData) : []
        const loadedLeads       = leadData?.length  ? extractRows(leadData)  : (isSeeded ? [] : SAMPLE_LEADS)
        const loadedStages      = stageData?.length ? extractRows(stageData) : DEFAULT_STAGES
        const loadedRegistrations = regData?.length ? extractRows(regData) : []
        const loadedCampaigns     = campData?.length ? extractRows(campData) : []
        const loadedReferrers     = refData?.length ? extractRows(refData) : []
        const loadedCommissions   = commData?.length ? extractRows(commData) : []
        const loadedSettings    = settData?.[0]?.data ?? DEFAULT_SETTINGS
        const lastBillRun     = metaData?.find((m) => m.key === 'last_bill_run')?.value ?? null

        // Seed sample data only on the very first ever load
        if (!isSeeded) {
          if (!tData?.length)    await seedTable('tenants',   SAMPLE_TENANTS)
          if (!sData?.length)    await seedTable('spaces',    SAMPLE_SPACES)
          if (!lData?.length)    await seedTable('leases',    SAMPLE_LEASES)
          if (!tmData?.length)   await seedTable('templates', SAMPLE_TEMPLATES)
          if (!invData?.length)  await seedTable('invoices',  SAMPLE_INVOICES)
          if (!discData?.length) await seedTable('discounts', SAMPLE_DISCOUNTS)
          if (!leadData?.length) await seedTable('leads',     SAMPLE_LEADS)
          if (!settData?.length) await supabase.from('settings').upsert({ id: 'global', data: loadedSettings })
          await supabase.from('meta').upsert({ key: 'seeded', value: 'true' })
        }

        // Pipeline stages are config (not sample data) — seed the defaults whenever
        // the table is empty, even on an already-seeded install.
        if (!stageData?.length) await seedTable('lead_pipeline_stages', DEFAULT_STAGES)

        setTenants(loadedTenants)
        setSpaces(loadedSpaces)
        setLeases(loadedLeases)
        setTemplates(loadedTemplates)
        setDiscounts(loadedDiscounts)
        setMaintenance(loadedMaintenance)
        setLeads(loadedLeads)
        setPipelineStages([...loadedStages].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
        setEventRegistrations(loadedRegistrations)
        setCampaigns(loadedCampaigns)
        setReferrers(loadedReferrers)
        setCommissions(loadedCommissions)
        setSettings(loadedSettings)
        settingsRef.current = loadedSettings

        // ── Auto bill run ──────────────────────────────────────────────
        const today = new Date()
        const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

        if (lastBillRun !== currentMonthKey && loadedSettings.invoicing?.autoGenerate !== false) {
          const s = loadedSettings
          const invTemplate = s.invoicing?.invoiceNumberTemplate ?? 'INV-{{number}}'
          const dueDateDays = s.invoicing?.dueDateDays ?? 14
          const prorateEnabled = s.invoicing?.proration !== false
          const startDay = Math.min(28, Math.max(1, s.billingRules?.billingPeriodStartDay ?? 1))
          const monthStart = new Date(today.getFullYear(), today.getMonth(), startDay)
          const periodMonthEnd = startDay === 1
            ? new Date(today.getFullYear(), today.getMonth() + 1, 0)
            : new Date(today.getFullYear(), today.getMonth() + 1, startDay - 1 || 1)
          const daysInPeriod = Math.floor((periodMonthEnd - monthStart) / 86400000) + 1

          const activeLeases = loadedLeases.filter((l) => {
            if (l.status !== 'active') return false
            const start = new Date(l.startDate)
            const end = new Date(l.endDate)
            return start <= periodMonthEnd && end >= monthStart
          })

          const newInvoices = []
          for (const lease of activeLeases) {
            const alreadyBilled = loadedInvoices.some(
              (inv) => inv.leaseId === lease.id && inv.status !== 'voided' && inv.periodStart?.startsWith(currentMonthKey)
            )
            if (alreadyBilled) continue

            const leaseStart = new Date(lease.startDate)
            const leaseEnd = new Date(lease.endDate)
            const space = loadedSpaces.find((sp) => sp.id === lease.spaceId)
            const periodStart = leaseStart > monthStart ? leaseStart : monthStart
            const periodEnd = leaseEnd < periodMonthEnd ? leaseEnd : periodMonthEnd
            const daysOccupied = Math.floor((periodEnd - periodStart) / 86400000) + 1
            const isProrated = prorateEnabled && daysOccupied < daysInPeriod
            const amount = isProrated
              ? Math.round((lease.monthlyRent * daysOccupied / daysInPeriod) * 100) / 100
              : lease.monthlyRent

            const fmt = (d) => d.toISOString().split('T')[0]
            const periodLabel = `${periodStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${periodEnd.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}${isProrated ? ' (prorated)' : ''}`
            const desc = `${space?.unitNumber ?? ''}${space?.address ? ` – ${space.address}` : ''} · ${periodLabel}`

            const allNums = [...loadedInvoices, ...newInvoices]
              .map((i) => parseInt(i.number?.replace(/\D/g, '') || '0', 10))
              .filter((n) => !isNaN(n))
            const nextNum = allNums.length > 0 ? Math.max(...allNums) + 1 : 1
            const dueDate = new Date(monthStart.getTime())
            dueDate.setDate(dueDate.getDate() + dueDateDays)

            newInvoices.push({
              id: `inv${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              number: invTemplate.replace('{{number}}', String(nextNum).padStart(4, '0')),
              tenantId: lease.tenantId, leaseId: lease.id,
              status: 'pending', sentStatus: 'not_sent', source: 'bill-run',
              issueDate: fmt(monthStart), dueDate: fmt(dueDate),
              periodStart: fmt(periodStart), periodEnd: fmt(periodEnd),
              reference: '', paymentMethod: '', discountPct: 0,
              vatEnabled: true, xeroSync: false, isProrated,
              lineItems: [{ id: `li${Date.now()}`, description: desc, revenueAccount: 'Membership Fees', unitPrice: amount, qty: 1, discountPct: 0 }],
              payments: [], comments: [], creditNoteForId: null,
              createdAt: fmt(today),
            })
          }

          // ── Deposit invoices for signed contracts ─────────────────────
          const signedStatuses = ['manually_signed', 'e_signed']
          const allLeasesList = loadedLeases ?? []
          for (const lease of allLeasesList) {
            if (!signedStatuses.includes(lease.signatureStatus)) continue
            const depositAmount = lease.items?.[0]?.deposit ?? lease.bondAmount ?? 0
            if (!depositAmount || depositAmount <= 0) continue
            const alreadyHasDeposit = [...loadedInvoices, ...newInvoices].some(
              (inv) => inv.leaseId === lease.id && inv.invoiceType === 'deposit' && inv.status !== 'voided'
            )
            if (alreadyHasDeposit) continue
            const fmt = (d) => d.toISOString().split('T')[0]
            const space = loadedSpaces.find((sp) => sp.id === lease.spaceId)
            const allNums = [...loadedInvoices, ...newInvoices]
              .map((i) => parseInt(i.number?.replace(/\D/g, '') || '0', 10))
              .filter((n) => !isNaN(n))
            const nextNum = allNums.length > 0 ? Math.max(...allNums) + 1 : 1
            const dueDate = new Date(today.getTime())
            dueDate.setDate(dueDate.getDate() + dueDateDays)
            newInvoices.push({
              id: `inv${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              number: invTemplate.replace('{{number}}', String(nextNum).padStart(4, '0')),
              tenantId: lease.tenantId, leaseId: lease.id,
              status: 'pending', sentStatus: 'not_sent', source: 'bill-run',
              invoiceType: 'deposit',
              issueDate: fmt(today), dueDate: fmt(dueDate),
              periodStart: null, periodEnd: null,
              reference: '', paymentMethod: '', discountPct: 0,
              vatEnabled: true, xeroSync: false, isProrated: false,
              lineItems: [{
                id: `li${Date.now()}`,
                description: `Security Deposit — ${space?.unitNumber ?? lease.spaceId}`,
                revenueAccount: 'Security Deposit',
                unitPrice: depositAmount,
                qty: 1,
                discountPct: 0,
              }],
              payments: [], comments: [], creditNoteForId: null,
              createdAt: fmt(today),
            })
          }

          if (newInvoices.length > 0) {
            setInvoices([...loadedInvoices, ...newInvoices])
            await seedTable('invoices', [...loadedInvoices, ...newInvoices])
          } else {
            setInvoices(loadedInvoices)
          }

          await supabase.from('meta').upsert({ key: 'last_bill_run', value: currentMonthKey })
        } else {
          setInvoices(loadedInvoices)
        }

        // ── Mark overdue invoices ─────────────────────────────────────────
        const todayStr = new Date().toISOString().split('T')[0]
        const toMarkOverdue = loadedInvoices.filter(
          (inv) => inv.status === 'pending' && inv.dueDate && inv.dueDate < todayStr
        )
        if (toMarkOverdue.length > 0) {
          setInvoices((prev) =>
            prev.map((inv) => toMarkOverdue.some((o) => o.id === inv.id) ? { ...inv, status: 'overdue' } : inv)
          )
          await Promise.all(toMarkOverdue.map((inv) => syncRow('invoices', inv.id, { ...inv, status: 'overdue' })))
        }
      } catch (err) {
        console.error('Supabase load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tenants ───────────────────────────────────────────────────────────────
  const addTenant = useCallback((tenant) => {
    const item = { ...tenant, id: `t${Date.now()}`, createdAt: new Date().toISOString().split('T')[0] }
    setTenants((prev) => [...prev, item])
    syncRow('tenants', item.id, item)
    logAudit('create', 'tenant', item.id, item.businessName)
    return item
  }, [])

  const updateTenant = useCallback((id, updates) => {
    setTenants((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
      const updated = next.find((t) => t.id === id)
      if (updated) syncRow('tenants', id, updated)
      return next
    })
  }, [])

  const deleteTenant = useCallback((id) => {
    setTenants((prev) => { const t = prev.find((x) => x.id === id); logAudit('delete', 'tenant', id, t?.businessName ?? id); return prev.filter((x) => x.id !== id) })
    deleteRow('tenants', id)
  }, [])

  // ── Spaces ────────────────────────────────────────────────────────────────
  const addSpace = useCallback((space) => {
    const item = { ...space, id: `s${Date.now()}` }
    setSpaces((prev) => [...prev, item])
    syncRow('spaces', item.id, item)
    return item
  }, [])

  const updateSpace = useCallback((id, updates) => {
    setSpaces((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
      const updated = next.find((s) => s.id === id)
      if (updated) syncRow('spaces', id, updated)
      return next
    })
  }, [])

  const deleteSpace = useCallback((id) => {
    setSpaces((prev) => prev.filter((s) => s.id !== id))
    deleteRow('spaces', id)
  }, [])

  // ── Leases ────────────────────────────────────────────────────────────────
  const addLease = useCallback((lease) => {
    const item = { ...lease, id: `l${Date.now()}`, createdAt: new Date().toISOString().split('T')[0] }
    setLeases((prev) => [...prev, item])
    syncRow('leases', item.id, item)
    logAudit('create', 'lease', item.id, item.contractNumber ?? item.id)
    setSpaces((prev) => {
      const next = prev.map((s) => (s.id === lease.spaceId ? { ...s, status: 'occupied' } : s))
      const updated = next.find((s) => s.id === lease.spaceId)
      if (updated) {
        syncRow('spaces', updated.id, updated)
        // Auto-remove from website: if the unit was published, re-sync so its
        // Sanity status flips to 'leased'. Fire-and-forget — never block leasing.
        if (updated.publishedToWeb) publishListing(updated).catch((e) => console.error('Listing auto-sync:', e))
      }
      return next
    })
    return item
  }, [])

  const updateLease = useCallback((id, updates) => {
    setLeases((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
      const updated = next.find((l) => l.id === id)
      if (updated) { syncRow('leases', id, updated); logAudit('update', 'lease', id, updated.contractNumber ?? id, Object.keys(updates).join(', ')) }
      return next
    })
  }, [])

  const deleteLease = useCallback((id) => {
    setLeases((prev) => {
      const lease = prev.find((l) => l.id === id)
      if (lease) {
        setSpaces((spaces) => {
          const next = spaces.map((s) => (s.id === lease.spaceId ? { ...s, status: 'vacant' } : s))
          const updated = next.find((s) => s.id === lease.spaceId)
          if (updated) syncRow('spaces', updated.id, updated)
          return next
        })
      }
      return prev.filter((l) => l.id !== id)
    })
    deleteRow('leases', id)
  }, [])

  // ── Templates ─────────────────────────────────────────────────────────────
  const addTemplate = useCallback((template) => {
    const today = new Date().toISOString().split('T')[0]
    const item = { ...template, id: `tmpl${Date.now()}`, createdAt: today, updatedAt: today }
    setTemplates((prev) => [...prev, item])
    syncRow('templates', item.id, item)
    return item
  }, [])

  const updateTemplate = useCallback((id, updates) => {
    setTemplates((prev) => {
      const next = prev.map((t) => t.id === id
        ? { ...t, ...updates, updatedAt: new Date().toISOString().split('T')[0] } : t)
      const updated = next.find((t) => t.id === id)
      if (updated) syncRow('templates', id, updated)
      return next
    })
  }, [])

  const deleteTemplate = useCallback((id) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id))
    deleteRow('templates', id)
  }, [])

  // ── Invoices ──────────────────────────────────────────────────────────────
  const addInvoice = useCallback((invoice) => {
    setInvoices((prev) => {
      const invTemplate = settingsRef.current?.invoicing?.invoiceNumberTemplate ?? 'INV-{{number}}'
      const nums = prev.map((i) => parseInt(i.number?.replace(/\D/g, '') || '0', 10)).filter((n) => !isNaN(n))
      const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1
      const newInv = {
        ...invoice,
        id: `inv${Date.now()}`,
        number: invoice.number || invTemplate.replace('{{number}}', String(nextNum).padStart(4, '0')),
        createdAt: new Date().toISOString().split('T')[0],
        payments: invoice.payments ?? [],
        comments: invoice.comments ?? [],
      }
      syncRow('invoices', newInv.id, newInv)
      return [...prev, newInv]
    })
  }, [])

  const updateInvoice = useCallback((id, updates) => {
    setInvoices((prev) => {
      const next = prev.map((i) => (i.id === id ? { ...i, ...updates } : i))
      const updated = next.find((i) => i.id === id)
      if (updated) syncRow('invoices', id, updated)
      return next
    })
  }, [])

  const voidInvoice = useCallback((id) => {
    setInvoices((prev) => {
      const inv = prev.find((i) => i.id === id)
      logAudit('void', 'invoice', id, inv?.number ?? id)
      const next = prev.map((i) => (i.id === id ? { ...i, status: 'voided' } : i))
      const updated = next.find((i) => i.id === id)
      if (updated) syncRow('invoices', id, updated)
      return next
    })
  }, [])

  const deleteInvoice = useCallback((id) => {
    setInvoices((prev) => {
      const inv = prev.find((i) => i.id === id)
      logAudit('delete', 'invoice', id, inv?.number ?? id, 'Permanently deleted')
      deleteRow('invoices', id)
      return prev.filter((i) => i.id !== id)
    })
  }, [])

  const addPaymentToInvoice = useCallback((invoiceId, payment) => {
    setInvoices((prev) => {
      const inv = prev.find((i) => i.id === invoiceId)
      logAudit('payment', 'invoice', invoiceId, inv?.number ?? invoiceId, `$${Number(payment.amount).toFixed(2)} via ${payment.method ?? '—'}`)
      const next = prev.map((i) => i.id === invoiceId
        ? { ...i, payments: [...(i.payments ?? []), { ...payment, id: `pay${Date.now()}` }], status: 'paid' }
        : i)
      const updated = next.find((i) => i.id === invoiceId)
      if (updated) syncRow('invoices', invoiceId, updated)
      return next
    })
  }, [])

  const addCommentToInvoice = useCallback((invoiceId, text) => {
    setInvoices((prev) => {
      const next = prev.map((i) => i.id === invoiceId
        ? { ...i, comments: [...(i.comments ?? []), { id: `cmt${Date.now()}`, text, createdAt: new Date().toISOString().split('T')[0] }] }
        : i)
      const updated = next.find((i) => i.id === invoiceId)
      if (updated) syncRow('invoices', invoiceId, updated)
      return next
    })
  }, [])

  // ── Discounts ─────────────────────────────────────────────────────────────
  const addDiscount = useCallback((discount) => {
    const item = { ...discount, id: `disc${Date.now()}` }
    setDiscounts((prev) => [...prev, item])
    syncRow('discounts', item.id, item)
  }, [])

  const updateDiscount = useCallback((id, updates) => {
    setDiscounts((prev) => {
      const next = prev.map((d) => (d.id === id ? { ...d, ...updates } : d))
      const updated = next.find((d) => d.id === id)
      if (updated) syncRow('discounts', id, updated)
      return next
    })
  }, [])

  const deleteDiscount = useCallback((id) => {
    setDiscounts((prev) => prev.filter((d) => d.id !== id))
    deleteRow('discounts', id)
  }, [])

  // ── Maintenance ───────────────────────────────────────────────────────────
  const addMaintenanceIssue = useCallback((issue) => {
    const item = { ...issue, id: `maint${Date.now()}`, createdAt: new Date().toISOString().split('T')[0] }
    setMaintenance((prev) => [item, ...prev])
    syncRow('maintenance', item.id, item)
  }, [])

  const updateMaintenanceIssue = useCallback((id, updates) => {
    setMaintenance((prev) => prev.map((m) => m.id === id ? { ...m, ...updates } : m))
    setMaintenance((prev) => { const m = prev.find((i) => i.id === id); if (m) syncRow('maintenance', id, { ...m, ...updates }); return prev })
  }, [])

  const deleteMaintenanceIssue = useCallback((id) => {
    setMaintenance((prev) => prev.filter((m) => m.id !== id))
    deleteRow('maintenance', id)
  }, [])

  // ── Leads (CRM pipeline) ────────────────────────────────────────────────────
  const addLead = useCallback((lead) => {
    const today = new Date().toISOString().split('T')[0]
    const item = {
      tenantId: null, value: 0, notes: '', source: 'website', read: true,
      ...lead,
      id: `lead${Date.now()}`,
      createdAt: today,
      stageEnteredAt: today,
    }
    setLeads((prev) => [item, ...prev])
    syncRow('leads', item.id, item)
    logAudit('create', 'lead', item.id, item.name ?? item.businessName ?? item.id)
    return item
  }, [])

  const updateLead = useCallback((id, updates) => {
    setLeads((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
      const updated = next.find((l) => l.id === id)
      if (updated) syncRow('leads', id, updated)
      return next
    })
  }, [])

  const moveLeadToStage = useCallback((id, stageId) => {
    const stageEnteredAt = new Date().toISOString().split('T')[0]
    setLeads((prev) => {
      const next = prev.map((l) => (l.id === id
        ? { ...l, stageId, stageEnteredAt, activity: [...(l.activity ?? []), { id: `act${Date.now()}`, type: 'stage', stageId, createdAt: new Date().toISOString() }] }
        : l))
      const updated = next.find((l) => l.id === id)
      if (updated) syncRow('leads', id, updated)
      return next
    })
  }, [])

  // Append a timeline entry (note, email sent, etc.) to a lead.
  const appendLeadActivity = useCallback((id, entry) => {
    setLeads((prev) => {
      const next = prev.map((l) => (l.id === id
        ? { ...l, activity: [...(l.activity ?? []), { id: `act${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, createdAt: new Date().toISOString(), ...entry }] }
        : l))
      const updated = next.find((l) => l.id === id)
      if (updated) syncRow('leads', id, updated)
      return next
    })
  }, [])

  const deleteLead = useCallback((id) => {
    setLeads((prev) => { const l = prev.find((x) => x.id === id); logAudit('delete', 'lead', id, l?.name ?? id); return prev.filter((x) => x.id !== id) })
    deleteRow('leads', id)
  }, [])

  const convertLeadToTenant = useCallback((leadId) => {
    let createdTenant = null
    setLeads((prev) => {
      const lead = prev.find((l) => l.id === leadId)
      if (!lead) return prev
      // Reuse addTenant so the tenant lands in Supabase + audit log identically.
      createdTenant = addTenant({
        businessName: lead.businessName ?? lead.name ?? 'New tenant',
        contactName: lead.name ?? '',
        email: lead.email ?? '',
        phone: lead.phone ?? '',
        abn: '',
        industry: '',
        country: 'Australia',
      })
      const wonStage = DEFAULT_STAGES.find((s) => s.category === 'won')
      const next = prev.map((l) => l.id === leadId
        ? { ...l, tenantId: createdTenant.id, stageId: wonStage?.id ?? l.stageId, stageEnteredAt: new Date().toISOString().split('T')[0],
            activity: [...(l.activity ?? []), { id: `act${Date.now()}`, type: 'convert', text: `Converted to tenant: ${createdTenant.businessName}`, createdAt: new Date().toISOString() }] }
        : l)
      const updated = next.find((l) => l.id === leadId)
      if (updated) syncRow('leads', leadId, updated)
      return next
    })
    return createdTenant
  }, [addTenant])

  // ── Pipeline stages ─────────────────────────────────────────────────────────
  const addStage = useCallback((stage) => {
    const item = { tone: 'gray', category: 'engaged', sortOrder: 99, ...stage, id: `stage${Date.now()}` }
    setPipelineStages((prev) => [...prev, item].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
    syncRow('lead_pipeline_stages', item.id, item)
    return item
  }, [])

  const updateStage = useCallback((id, updates) => {
    setPipelineStages((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...updates } : s)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      const updated = next.find((s) => s.id === id)
      if (updated) syncRow('lead_pipeline_stages', id, updated)
      return next
    })
  }, [])

  const deleteStage = useCallback((id) => {
    setPipelineStages((prev) => prev.filter((s) => s.id !== id))
    deleteRow('lead_pipeline_stages', id)
  }, [])

  // ── Event registrations (captured from Sanity event RSVP forms) ─────────────
  const markRegistrationRead = useCallback((id, read = true) => {
    setEventRegistrations((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, read } : r))
      const updated = next.find((r) => r.id === id)
      if (updated) syncRow('event_registrations', id, updated)
      return next
    })
  }, [])

  const deleteEventRegistration = useCallback((id) => {
    setEventRegistrations((prev) => prev.filter((r) => r.id !== id))
    deleteRow('event_registrations', id)
  }, [])

  // Optimistic local update after the reminder endpoint emails registrants
  // (the endpoint already persisted reminderSentAt server-side).
  const markRegistrationsReminded = useCallback((ids = []) => {
    const at = new Date().toISOString()
    setEventRegistrations((prev) => prev.map((r) => ids.includes(r.id) ? { ...r, reminderSentAt: r.reminderSentAt ?? at } : r))
  }, [])

  // ── Ad campaigns ────────────────────────────────────────────────────────────
  const addCampaign = useCallback((campaign) => {
    const item = {
      status: 'draft', spend: 0, leads: 0,
      ...campaign,
      id: `camp${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    }
    setCampaigns((prev) => [item, ...prev])
    syncRow('campaigns', item.id, item)
    logAudit('create', 'campaign', item.id, item.name ?? item.id)
    return item
  }, [])

  const updateCampaign = useCallback((id, updates) => {
    setCampaigns((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
      const updated = next.find((c) => c.id === id)
      if (updated) syncRow('campaigns', id, updated)
      return next
    })
  }, [])

  const deleteCampaign = useCallback((id) => {
    setCampaigns((prev) => { const c = prev.find((x) => x.id === id); logAudit('delete', 'campaign', id, c?.name ?? id); return prev.filter((x) => x.id !== id) })
    deleteRow('campaigns', id)
  }, [])

  // ── Referrers (referral / affiliate program) ────────────────────────────────
  const addReferrer = useCallback((referrer) => {
    const letters = String(referrer.name || 'REF').replace(/[^a-zA-Z]/g, '').slice(0, 5).toUpperCase() || 'REF'
    const rand = (n) => Array.from({ length: n }, () => '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 32)]).join('')
    const item = {
      commissionRate: 5, status: 'active', notes: '', phone: '', email: '',
      ...referrer,
      id: `ref${Date.now()}`,
      code: `${letters}${rand(3)}`,
      token: rand(12),
      createdAt: new Date().toISOString().split('T')[0],
    }
    setReferrers((prev) => [item, ...prev])
    syncRow('referrers', item.id, item)
    logAudit('create', 'referrer', item.id, item.name ?? item.id)
    return item
  }, [])

  const updateReferrer = useCallback((id, updates) => {
    setReferrers((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
      const updated = next.find((r) => r.id === id)
      if (updated) syncRow('referrers', id, updated)
      return next
    })
  }, [])

  const deleteReferrer = useCallback((id) => {
    setReferrers((prev) => prev.filter((r) => r.id !== id))
    deleteRow('referrers', id)
  }, [])

  // ── Commissions (deal-close payouts for referred leads) ─────────────────────
  // Record a closed deal on a lead: stamps deal value, moves it to the Won stage,
  // and — if the lead was referred — creates a pending commission (rate × value).
  // Returns { commission, referrer, lead } so the caller can email the referrer.
  const recordDealClose = useCallback((leadId, { dealType, dealValue }) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return null
    const referrer = lead.referrerId ? referrers.find((r) => r.id === lead.referrerId) : null
    const value = Number(dealValue) || 0
    const rate = Number(referrer?.commissionRate) || 0
    const amount = Math.round(value * rate) / 100 // rate is a percentage

    let commission = null
    if (referrer) {
      commission = {
        id: `comm${Date.now()}`,
        leadId,
        referrerId: referrer.id,
        referrerName: referrer.name,
        leadName: lead.name || lead.businessName || '',
        dealType,            // 'lease' | 'sale'
        dealValue: value,
        rate,
        amount,
        status: 'pending',   // pending | approved | paid
        createdAt: new Date().toISOString().split('T')[0],
        paidAt: null,
      }
      setCommissions((prev) => [commission, ...prev])
      syncRow('commissions', commission.id, commission)
      logAudit('create', 'commission', commission.id, `${referrer.name} · $${amount.toLocaleString('en-AU')}`)
    }

    const wonStage = pipelineStages.find((s) => s.category === 'won') ?? DEFAULT_STAGES.find((s) => s.category === 'won')
    const activityEntry = {
      id: `act${Date.now()}`,
      type: 'commission',
      text: referrer
        ? `Deal closed — $${value.toLocaleString('en-AU')} (${dealType}). Commission $${amount.toLocaleString('en-AU')} to ${referrer.name}.`
        : `Deal closed — $${value.toLocaleString('en-AU')} (${dealType}).`,
      createdAt: new Date().toISOString(),
    }
    const updatedLead = {
      ...lead,
      dealClosed: true,
      dealType,
      dealValue: value,
      stageId: wonStage?.id ?? lead.stageId,
      stageEnteredAt: new Date().toISOString().split('T')[0],
      activity: [...(lead.activity ?? []), activityEntry],
    }
    setLeads((prev) => prev.map((l) => (l.id === leadId ? updatedLead : l)))
    syncRow('leads', leadId, updatedLead)
    return { commission, referrer, lead: updatedLead }
  }, [leads, referrers, pipelineStages])

  const updateCommission = useCallback((id, updates) => {
    setCommissions((prev) => {
      const next = prev.map((c) => {
        if (c.id !== id) return c
        const merged = { ...c, ...updates }
        if (updates.status === 'paid' && !merged.paidAt) merged.paidAt = new Date().toISOString().split('T')[0]
        if (updates.status && updates.status !== 'paid') merged.paidAt = null
        return merged
      })
      const updated = next.find((c) => c.id === id)
      if (updated) syncRow('commissions', id, updated)
      return next
    })
  }, [])

  const deleteCommission = useCallback((id) => {
    setCommissions((prev) => prev.filter((c) => c.id !== id))
    deleteRow('commissions', id)
  }, [])

  // ── Settings ──────────────────────────────────────────────────────────────
  const updateSettings = useCallback((patch) => {
    logAudit('update', 'settings', 'global', 'Settings', Object.keys(patch).join(', '))
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      settingsRef.current = next
      supabase.from('settings').upsert({ id: 'global', data: next })
        .then(({ error }) => { if (error) console.error('Supabase settings sync:', error) })
      return next
    })
  }, [])

  // ── Reset sample data ─────────────────────────────────────────────────────
  const resetSampleData = useCallback(async () => {
    if (!window.confirm('Load Found Huntingdale sample data?\n\nThis will replace all current data.')) return
    setTenants(SAMPLE_TENANTS)
    setSpaces(SAMPLE_SPACES)
    setLeases(SAMPLE_LEASES)
    setTemplates(SAMPLE_TEMPLATES)
    setInvoices(SAMPLE_INVOICES)
    setDiscounts(SAMPLE_DISCOUNTS)
    await Promise.all([
      seedTable('tenants', SAMPLE_TENANTS),
      seedTable('spaces', SAMPLE_SPACES),
      seedTable('leases', SAMPLE_LEASES),
      seedTable('templates', SAMPLE_TEMPLATES),
      seedTable('invoices', SAMPLE_INVOICES),
      seedTable('discounts', SAMPLE_DISCOUNTS),
      supabase.from('meta').upsert({ key: 'seeded', value: 'true' }),
    ])
  }, [])

  // runAutoBillRun is now handled inside the load useEffect — kept as no-op for compatibility
  const runAutoBillRun = useCallback(() => {}, [])

  // Derive current user's role from Supabase session + adminUsers settings
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserEmail(user?.email ?? '')
    })
  }, [])
  const currentUserRole = (() => {
    if (!currentUserEmail) return 'admin'
    const match = settings.adminUsers?.find(
      u => u.email?.toLowerCase() === currentUserEmail.toLowerCase()
    )
    return (match?.role ?? 'admin').toLowerCase().replace(/\s+/g, '_') // 'super_admin' | 'admin'
  })()

  return {
    loading,
    tenants, addTenant, updateTenant, deleteTenant,
    spaces, addSpace, updateSpace, deleteSpace,
    leases, addLease, updateLease, deleteLease,
    templates, addTemplate, updateTemplate, deleteTemplate,
    invoices, addInvoice, updateInvoice, voidInvoice, deleteInvoice, addPaymentToInvoice, addCommentToInvoice, runAutoBillRun,
    discounts, addDiscount, updateDiscount, deleteDiscount,
    maintenance, addMaintenanceIssue, updateMaintenanceIssue, deleteMaintenanceIssue,
    leads, addLead, updateLead, moveLeadToStage, deleteLead, convertLeadToTenant, appendLeadActivity,
    pipelineStages, addStage, updateStage, deleteStage,
    eventRegistrations, markRegistrationRead, deleteEventRegistration, markRegistrationsReminded,
    campaigns, addCampaign, updateCampaign, deleteCampaign,
    referrers, addReferrer, updateReferrer, deleteReferrer,
    commissions, recordDealClose, updateCommission, deleteCommission,
    settings, updateSettings,
    currentUserRole, currentUserEmail,
    resetSampleData,
  }
}
