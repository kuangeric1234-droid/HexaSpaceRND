// POST /api/event-bookings/save  { token, patch }
// Vendor (token holder) updates THEIR OWN booking: participation details, the
// signature, or the insurance choice. The token is verified server-side and only
// a whitelisted set of fields may be written — pricing, allocated space, ref and
// identity fields cannot be tampered with. Optionally fires a notify email.
import { createClient } from '@supabase/supabase-js';
import { applyCors } from '../_cors.js';

const SUPABASE_URL = process.env.SUPABASE_URL;

// Fields the vendor is allowed to set on their own booking.
const ALLOWED = new Set([
  'vendorBusiness', 'vendorAbn', 'vendorPhone', 'vendorType', 'vendorDescription',
  'instagramHandle', 'carDetails', 'detailsCompleted',
  'status', 'signedAt', 'signerName', 'signerTitle', 'signerDate', 'signatureData',
  'agreementPdfUrl',
  'insuranceStatus', 'insuranceUrl', 'insuranceFileName', 'insuranceUploadedAt',
  'insuranceDeferredAt',
]);
// status may only move within this vendor-driven set.
const OK_STATUS = new Set(['signed', 'insurance_pending', 'insurance_received']);

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Not configured.' });

  const { token, patch } = req.body ?? {};
  if (!token) return res.status(400).json({ error: 'Missing token.' });
  if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'Missing patch.' });

  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
  try {
    const { data: rows } = await supabase.from('event_bookings').select('id, data').eq('data->>signingToken', token);
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: 'Invalid link.' });

    const clean = {};
    for (const [k, v] of Object.entries(patch)) {
      if (!ALLOWED.has(k)) continue;
      if (k === 'status' && !OK_STATUS.has(v)) continue;
      clean[k] = v;
    }
    const now = new Date().toISOString();
    const updated = { ...row.data, ...clean, updatedAt: now };
    await supabase.from('event_bookings').update({ data: updated, updated_at: now }).eq('id', row.id);
    return res.status(200).json({ ok: true, booking: updated });
  } catch (err) {
    console.error('event-bookings/save error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
