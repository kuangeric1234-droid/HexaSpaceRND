// POST /api/function-bookings/sign  { token, signerName, signerTitle, signerDate, signatureData }
// The client signs their function-hire agreement. Token-verified; only that one
// booking is written. Admin notified from SERVER-loaded data.
import { createClient } from '@supabase/supabase-js';
import { applyCors } from '../_cors.js';

const SUPABASE_URL = process.env.SUPABASE_URL;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Not configured.' });

  const { token, signerName, signerTitle, signerDate, signatureData } = req.body ?? {};
  if (!token) return res.status(400).json({ error: 'Missing token.' });
  if (!signerName || !String(signerName).trim()) return res.status(400).json({ error: 'Signer name required.' });
  if (!signatureData || !String(signatureData).startsWith('data:image')) return res.status(400).json({ error: 'Signature required.' });

  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
  try {
    const { data: rows } = await supabase.from('function_bookings').select('id, data').eq('data->>signingToken', token);
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: 'Invalid link.' });
    const booking = row.data;
    if (booking.signedAt) return res.status(200).json({ ok: true, alreadySigned: true });

    const now = new Date().toISOString();
    const updated = {
      ...booking, stage: 'signed', signedAt: now, signerName: String(signerName).trim(),
      signerTitle: String(signerTitle ?? '').trim(), signerDate: signerDate ?? '', signatureData,
      agreed: true, read: false, updatedAt: now,
    };
    await supabase.from('function_bookings').update({ data: updated, updated_at: now }).eq('id', row.id);

    // Notify the events team using SERVER data (not a client blob).
    const base = `https://${req.headers.host}`;
    // Awaited — Vercel kills unawaited requests once the response goes out.
    await fetch(`${base}/api/function-bookings/notify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking: updated, mode: 'signed' }),
    }).catch((e) => console.error('function sign notify:', e));

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('function-bookings/sign error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
