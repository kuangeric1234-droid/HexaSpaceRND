// POST /api/event-bookings/upload  { token, kind, fileBase64, contentType, fileName }
// Uploads the signed-agreement PDF or an insurance certificate for THIS booking
// to the event-insurance bucket via the service role (the browser no longer
// touches storage with the anon key). kind = 'agreement' | 'insurance'.
import { createClient } from '@supabase/supabase-js';
import { applyCors } from '../_cors.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const MAX_BYTES = 4 * 1024 * 1024; // Vercel body cap headroom; larger → email path.

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Not configured.' });

  const { token, kind, fileBase64, contentType, fileName } = req.body ?? {};
  if (!token) return res.status(400).json({ error: 'Missing token.' });
  if (!fileBase64 || !['agreement', 'insurance'].includes(kind)) return res.status(400).json({ error: 'Bad request.' });

  const b64 = String(fileBase64).replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'File too large — please email it to info@hexaspace.com.au.' });

  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
  try {
    const { data: rows } = await supabase.from('event_bookings').select('id').eq('data->>signingToken', token);
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: 'Invalid link.' });

    const safeExt = (fileName?.split('.').pop() || (kind === 'agreement' ? 'pdf' : 'bin')).replace(/[^a-z0-9]/gi, '').slice(0, 5);
    const path = kind === 'agreement'
      ? `agreements/${row.id}.pdf`
      : `${row.id}/${Date.now()}.${safeExt}`;
    const { error: upErr } = await supabase.storage.from('event-insurance').upload(path, buf, {
      contentType: contentType || 'application/octet-stream',
      upsert: true,
    });
    if (upErr) return res.status(500).json({ error: 'Upload failed.' });
    const { data: { publicUrl } } = supabase.storage.from('event-insurance').getPublicUrl(path);
    return res.status(200).json({ ok: true, url: publicUrl, path });
  } catch (err) {
    console.error('event-bookings/upload error:', err);
    return res.status(500).json({ error: 'Upload failed.' });
  }
}
