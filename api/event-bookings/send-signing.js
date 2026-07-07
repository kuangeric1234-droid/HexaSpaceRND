// POST /api/event-bookings/send-signing
//
// mode=undefined        — Admin sends vendor agreement → email vendor signing link
// mode='admin_notify'   — Vendor signed → notify admin
// mode='insurance_deferred' — Vendor deferred insurance → remind admin

import { sendResendEmail } from '../_email.js'
import { brandFrame, bH2, bP, bBtn, bKicker, bSmall, bPanel, bTable, OLIVE, INK, MUTE, HAIR } from '../_brand.js'

const RESEND_API_KEY = process.env.RESEND_API_KEY

const EVENT = {
  name: 'Found Underground',
  date: 'Sunday 7 June 2026',
  hours: '3:00 PM – 9:00 PM',
  venue: 'The Hub, 18 Logistic Court, Box Hill VIC 3128',
}

function frame(bodyHtml) {
  return brandFrame(bodyHtml, { footerLabel: 'Agreement' })
}

function buildVendorSigningEmail({ booking, signingUrl }) {
  const vendor = booking.vendorBusiness || booking.vendorName
  const body =
    bKicker('Vendor Participation Agreement') +
    bH2(`Hi ${booking.vendorName} — please review &amp; sign your vendor agreement`) +
    bP(`We're excited to have <strong>${vendor}</strong> joining us at the <strong>Found Underground on 7 June 2026</strong>. Before the event, please review and sign the Vendor Participation Agreement, Liability Waiver, and Venue Rules using the button below.`) +
    bTable([
      ['Event', EVENT.name, true],
      ['Date', EVENT.date],
      ['Hours', EVENT.hours],
      ['Venue', EVENT.venue],
      ...(booking.vendorType ? [['Vendor Type', booking.vendorType]] : []),
      ...(booking.allocatedSpace ? [['Allocated Space', booking.allocatedSpace]] : []),
    ]) +
    bBtn('Review &amp; Sign Documents', signingUrl) +
    bSmall(`If the button doesn't work, copy this link:<br><a href="${signingUrl}" style="color:${MUTE};word-break:break-all">${signingUrl}</a>`) +
    bSmall(`After signing, you'll be asked to submit a Certificate of Currency for Public Liability Insurance (min. AUD $10,000,000). Please have this ready. Any questions? Reply to this email or contact <a href="mailto:info@hexaspace.com.au" style="color:${OLIVE}">info@hexaspace.com.au</a>.`)
  return frame(body)
}

function buildAdminNotifyEmail({ booking }) {
  const vendor = booking.vendorBusiness || booking.vendorName
  const body =
    bH2('Vendor Agreement Signed ✅') +
    bP(`<strong>${vendor}</strong> has signed their vendor agreement for the <strong>Found Underground</strong>.`) +
    bTable([
      ['Ref', booking.ref, true],
      ['Vendor', vendor],
      ['Vendor Type', booking.vendorType || '—'],
      ...(booking.allocatedSpace ? [['Space', booking.allocatedSpace]] : []),
      ['Signed by', `${booking.signerName}${booking.signerTitle ? ` — ${booking.signerTitle}` : ''}`],
      ['Email', booking.vendorEmail],
    ]) +
    bP('The vendor has been asked to submit their Certificate of Currency. Check the admin portal to confirm insurance status.') +
    bBtn('Open Admin Portal →', 'https://portal.hexaspace.com.au/event-bookings')
  return frame(body)
}

function buildSpaceAssignedEmail({ booking }) {
  const vendor = booking.vendorBusiness || booking.vendorName
  const space = booking.allocatedSpace
  const body =
    bKicker('Found Underground · Space Confirmed') +
    bH2(`Your space has been assigned, ${booking.vendorName}!`) +
    bP('Great news — your vendor space at the Found Underground has been confirmed. Here are your details:') +
    bPanel(
      `<div style="font-family:'HexaRework','Helvetica Neue',Arial,sans-serif;font-size:11px;color:${MUTE};text-transform:uppercase;letter-spacing:.2em;margin-bottom:6px">Your Allocated Space</div>` +
      `<div style="font-family:'HexaBig',Georgia,serif;font-size:28px;color:${INK};letter-spacing:-0.5px">${space}</div>`
    ) +
    bTable([
      ['Event', EVENT.name, true],
      ['Date', EVENT.date],
      ['Hours', EVENT.hours],
      ['Venue', EVENT.venue],
      ['Bump-In From', '11:00 AM'],
      ...(booking.vendorType ? [['You are', booking.vendorType]] : []),
    ]) +
    bP(`If you have any questions about your space or the event, reply to this email or contact us at <a href="mailto:info@hexaspace.com.au" style="color:${OLIVE}">info@hexaspace.com.au</a>.`) +
    bP('See you on June 7! 🏁')
  return frame(body)
}

function buildInsuranceUploadedEmail({ booking }) {
  const vendor = booking.vendorBusiness || booking.vendorName
  const body =
    bH2('Insurance Certificate Uploaded ✅') +
    bP(`<strong>${vendor}</strong> has uploaded their Certificate of Currency for the Found Underground.`) +
    bTable([
      ['Vendor', vendor],
      ['Ref', booking.ref],
      ['File', booking.insuranceFileName || 'Certificate uploaded'],
    ]) +
    (booking.insuranceUrl ? bBtn('View Certificate →', booking.insuranceUrl) : '') +
    bSmall('Please review the certificate and mark the vendor as confirmed in the admin portal.')
  return frame(body)
}

function buildSigningReminderEmail({ booking, signingUrl }) {
  const vendor = booking.vendorBusiness || booking.vendorName
  const body =
    bKicker('Friendly Reminder · Vendor Participation Agreement') +
    bH2(`Hi ${booking.vendorName} — just a reminder to sign your vendor agreement`) +
    bP(`We noticed you haven't had a chance to sign yet. Here's your link — it only takes a few minutes. Please review and sign the Vendor Participation Agreement, Liability Waiver, and Venue Rules using the button below.`) +
    bTable([
      ['Event', EVENT.name, true],
      ['Date', EVENT.date],
      ['Hours', EVENT.hours],
      ['Venue', EVENT.venue],
      ...(booking.vendorType ? [['Vendor Type', booking.vendorType]] : []),
      ...(booking.allocatedSpace ? [['Allocated Space', booking.allocatedSpace]] : []),
    ]) +
    bBtn('Review &amp; Sign Documents', signingUrl) +
    bSmall(`If the button doesn't work, copy this link:<br><a href="${signingUrl}" style="color:${MUTE};word-break:break-all">${signingUrl}</a>`) +
    bSmall(`After signing, you'll be asked to submit a Certificate of Currency for Public Liability Insurance (min. AUD $10,000,000). Any questions? Reply to this email or contact <a href="mailto:info@hexaspace.com.au" style="color:${OLIVE}">info@hexaspace.com.au</a>.`)
  return frame(body)
}

function buildInsuranceReminderEmail({ booking, signingUrl }) {
  const vendor = booking.vendorBusiness || booking.vendorName
  const body =
    bKicker('Action Required · Insurance Certificate') +
    bH2(`Hi ${booking.vendorName} — please upload your insurance certificate`) +
    bP(`Thanks for signing your Vendor Participation Agreement for the <strong>Found Underground on 7 June 2026</strong>. We're following up to request your <strong>Certificate of Currency for Public Liability Insurance</strong> (minimum AUD $10,000,000).`) +
    (signingUrl
      ? bBtn('Upload Insurance Certificate', signingUrl) +
        bSmall(`If the button doesn't work, copy this link:<br><a href="${signingUrl}" style="color:${MUTE};word-break:break-all">${signingUrl}</a>`)
      : '') +
    bPanel(
      `<p style="font-family:'HexaGT','Helvetica Neue',Arial,sans-serif;font-size:13px;color:#92600a;margin:0;font-weight:600">Don't have Public Liability Insurance?</p>` +
      `<p style="font-family:'HexaGT','Helvetica Neue',Arial,sans-serif;font-size:13px;color:#92600a;margin:8px 0 0">Contact <strong>Jitesh on 0404 339 815</strong> and he'll organise a one-day policy for you.</p>`
    ) +
    bSmall(`Alternatively, you can email your certificate directly to <a href="mailto:info@hexaspace.com.au" style="color:${OLIVE}">info@hexaspace.com.au</a>. Please reference your business name in the subject line.`)
  return frame(body)
}

function buildAgreementCopyEmail({ booking }) {
  const vendor = booking.vendorBusiness || booking.vendorName
  const body =
    bKicker('Found Underground · Signed Agreement') +
    bH2(`Your signed agreement is ready, ${booking.vendorName}`) +
    bP(`Thank you for signing your Vendor Participation Agreement for the <strong>Found Underground on 7 June 2026</strong>. Your countersigned copy is ready to download and keep for your records.`) +
    bBtn('Download Signed Agreement (PDF)', booking.agreementPdfUrl) +
    bSmall(`If the button doesn't work, copy this link:<br><a href="${booking.agreementPdfUrl}" style="color:${MUTE};word-break:break-all">${booking.agreementPdfUrl}</a>`) +
    bTable([
      ['Ref', booking.ref, true],
      ['Business', vendor],
      ['Signed by', `${booking.signerName}${booking.signerTitle ? ` — ${booking.signerTitle}` : ''}`],
      ...(booking.allocatedSpace ? [['Allocated Space', booking.allocatedSpace]] : []),
    ]) +
    bP(`Next step: please upload your <strong>Certificate of Currency for Public Liability Insurance</strong> (minimum AUD $10,000,000) if you haven't already. Don't have PLI? Contact Jitesh on <strong>0404 339 815</strong>.`) +
    bP('See you on June 7! 🏁')
  return frame(body)
}

const EVENT_DOCS = {
  rundown: {
    label: 'Event Rundown',
    url: process.env.SUPABASE_URL + '/storage/v1/object/public/event-insurance/event-docs/rundown.docx',
  },
  map: {
    label: 'Vendor Map',
    url: process.env.SUPABASE_URL + '/storage/v1/object/public/event-insurance/event-docs/vendor-map.pdf',
  },
}

function buildEventDocsEmail({ booking }) {
  const vendor = booking.vendorBusiness || booking.vendorName
  const docCard = (label, cta, url) => `<a href="${url}" style="display:block;border:1px solid ${HAIR};border-radius:8px;padding:16px 20px;text-decoration:none;color:${INK};margin:0 0 12px">` +
    `<div style="font-family:'HexaRework','Helvetica Neue',Arial,sans-serif;font-size:11px;color:${OLIVE};text-transform:uppercase;letter-spacing:.2em;margin-bottom:4px">${label}</div>` +
    `<div style="font-family:'HexaGT','Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:600;color:${INK}">${cta}</div></a>`
  const body =
    bKicker('Found Underground · Event Documents') +
    bH2(`Hi ${booking.vendorName} — your event documents are ready`) +
    bP(`We're getting excited for <strong>Sunday 7 June 2026</strong>! Please find your event documents below. Review these carefully before the day.`) +
    bTable([
      ['Event', EVENT.name, true],
      ['Date', EVENT.date],
      ['Hours', EVENT.hours],
      ['Venue', EVENT.venue],
      ['Bump-In From', '11:00 AM'],
      ...(booking.allocatedSpace ? [['Your Space', booking.allocatedSpace, true]] : []),
    ]) +
    `<div style="margin:0 0 20px">${docCard('Event Rundown', 'Download Rundown →', EVENT_DOCS.rundown.url)}${docCard('Vendor Map', 'Download Map →', EVENT_DOCS.map.url)}</div>` +
    bP(`If you have any questions, reply to this email or contact us at <a href="mailto:info@hexaspace.com.au" style="color:${OLIVE}">info@hexaspace.com.au</a>.`) +
    bP('See you on June 7! 🏁')
  return frame(body)
}

function buildExecutedAgreementEmail({ booking }) {
  const vendor = booking.vendorBusiness || booking.vendorName
  const licensorName = booking.licensorSignerName || 'Hexa Space Pty Ltd'
  const body =
    bKicker('Found Underground · Fully Executed Agreement') +
    bH2(`Your agreement is fully executed, ${booking.vendorName}!`) +
    bP(`Your Vendor Participation Agreement for the <strong>Found Underground on 7 June 2026</strong> has been countersigned by <strong>${licensorName}</strong> on behalf of Hexa Space. The agreement is now fully executed. Please download your copy for your records.`) +
    bBtn('Download Executed Agreement (PDF)', booking.agreementPdfUrl) +
    bSmall(`If the button doesn't work, copy this link:<br><a href="${booking.agreementPdfUrl}" style="color:${MUTE};word-break:break-all">${booking.agreementPdfUrl}</a>`) +
    bTable([
      ['Ref', booking.ref, true],
      ['Business', vendor],
      ['Signed by', `${booking.signerName}${booking.signerTitle ? ` — ${booking.signerTitle}` : ''}`],
      ['Countersigned by', `${licensorName}${booking.licensorSignerTitle ? ` — ${booking.licensorSignerTitle}` : ''}`],
      ...(booking.allocatedSpace ? [['Allocated Space', booking.allocatedSpace]] : []),
    ]) +
    bP(`We're looking forward to having you at the event. See you on June 7! 🏁`) +
    bSmall(`Questions? Reply to this email or contact <a href="mailto:info@hexaspace.com.au" style="color:${OLIVE}">info@hexaspace.com.au</a>.`)
  return frame(body)
}

function buildInsuranceDeferredEmail({ booking }) {
  const vendor = booking.vendorBusiness || booking.vendorName
  const body =
    bH2('Insurance Pending — Follow Up Required ⚠️') +
    bP(`<strong>${vendor}</strong> has indicated they will email their Certificate of Currency separately. Please follow up to ensure it is received before the event date.`) +
    bTable([
      ['Vendor', vendor],
      ['Email', booking.vendorEmail],
      ['Ref', booking.ref],
      ['Requirement', 'Min. AUD $10,000,000 Public Liability Insurance'],
    ]) +
    bSmall('Once received, mark the vendor as "Insurance Received" in the admin portal.')
  return frame(body)
}

async function sendMail({ to, subject, html }) {
  const r = await sendResendEmail({
    from: 'Hexa Space <info@hexaspace.com.au>',
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  })
  return r.ok
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'Email not configured.' })

  const { booking, signingUrl, mode } = req.body
  if (!booking) return res.status(400).json({ error: 'Missing booking.' })

  try {
    if (!mode) {
      if (!booking.vendorEmail) return res.status(400).json({ error: 'No vendor email.' })
      if (!signingUrl) return res.status(400).json({ error: 'Missing signingUrl.' })

      const vendor = booking.vendorBusiness || booking.vendorName
      const ok = await sendMail({
        to: booking.vendorEmail,
        subject: `Vendor Agreement — Found Underground · ${vendor}`,
        html: buildVendorSigningEmail({ booking, signingUrl }),
      })
      return res.status(ok ? 200 : 500).json({ sent: ok })
    }

    if (mode === 'admin_notify') {
      const vendor = booking.vendorBusiness || booking.vendorName
      const ok = await sendMail({
        to: 'info@hexaspace.com.au',
        subject: `Vendor signed: ${vendor} — Found Underground`,
        html: buildAdminNotifyEmail({ booking }),
      })
      return res.status(200).json({ sent: ok })
    }

    if (mode === 'space_assigned') {
      if (!booking.vendorEmail) return res.status(400).json({ error: 'No vendor email.' })
      const vendor = booking.vendorBusiness || booking.vendorName
      const ok = await sendMail({
        to: booking.vendorEmail,
        subject: `Your space is confirmed — ${booking.allocatedSpace} · Found Underground`,
        html: buildSpaceAssignedEmail({ booking }),
      })
      return res.status(200).json({ sent: ok })
    }

    if (mode === 'insurance_uploaded') {
      const vendor = booking.vendorBusiness || booking.vendorName
      const ok = await sendMail({
        to: 'info@hexaspace.com.au',
        subject: `Insurance uploaded: ${vendor} — Found Underground`,
        html: buildInsuranceUploadedEmail({ booking }),
      })
      return res.status(200).json({ sent: ok })
    }

    if (mode === 'executed_agreement') {
      if (!booking.vendorEmail) return res.status(400).json({ error: 'No vendor email.' })
      if (!booking.agreementPdfUrl) return res.status(400).json({ error: 'No PDF URL.' })
      const vendor = booking.vendorBusiness || booking.vendorName
      const ok = await sendMail({
        to: booking.vendorEmail,
        subject: `Fully executed agreement — Found Underground · ${vendor}`,
        html: buildExecutedAgreementEmail({ booking }),
      })
      return res.status(200).json({ sent: ok })
    }

    if (mode === 'agreement_copy') {
      if (!booking.vendorEmail) return res.status(400).json({ error: 'No vendor email.' })
      if (!booking.agreementPdfUrl) return res.status(400).json({ error: 'No PDF URL.' })
      const vendor = booking.vendorBusiness || booking.vendorName
      const ok = await sendMail({
        to: booking.vendorEmail,
        subject: `Your signed agreement — Found Underground · ${vendor}`,
        html: buildAgreementCopyEmail({ booking }),
      })
      return res.status(200).json({ sent: ok })
    }

    if (mode === 'signing_reminder') {
      if (!booking.vendorEmail) return res.status(400).json({ error: 'No vendor email.' })
      if (!signingUrl) return res.status(400).json({ error: 'Missing signingUrl.' })
      const vendor = booking.vendorBusiness || booking.vendorName
      const ok = await sendMail({
        to: booking.vendorEmail,
        subject: `Reminder: Please sign your vendor agreement — Found Underground · ${vendor}`,
        html: buildSigningReminderEmail({ booking, signingUrl }),
      })
      return res.status(200).json({ sent: ok })
    }

    if (mode === 'insurance_reminder') {
      if (!booking.vendorEmail) return res.status(400).json({ error: 'No vendor email.' })
      const vendor = booking.vendorBusiness || booking.vendorName
      const ok = await sendMail({
        to: booking.vendorEmail,
        subject: `Insurance required: Please upload your certificate — Found Underground · ${vendor}`,
        html: buildInsuranceReminderEmail({ booking, signingUrl }),
      })
      return res.status(200).json({ sent: ok })
    }

    if (mode === 'event_docs') {
      if (!booking.vendorEmail) return res.status(400).json({ error: 'No vendor email.' })
      const vendor = booking.vendorBusiness || booking.vendorName
      const ok = await sendMail({
        to: booking.vendorEmail,
        subject: `Event documents — Found Underground · ${vendor}`,
        html: buildEventDocsEmail({ booking }),
      })
      return res.status(200).json({ sent: ok })
    }

    if (mode === 'insurance_deferred') {
      const vendor = booking.vendorBusiness || booking.vendorName
      const ok = await sendMail({
        to: 'info@hexaspace.com.au',
        subject: `Insurance pending: ${vendor} — Found Underground`,
        html: buildInsuranceDeferredEmail({ booking }),
      })
      return res.status(200).json({ sent: ok })
    }

    return res.status(400).json({ error: 'Unknown mode.' })
  } catch (err) {
    console.error('send-signing error:', err)
    return res.status(500).json({ error: 'Internal error.' })
  }
}
