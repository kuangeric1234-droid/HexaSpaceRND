// POST /api/function-bookings/load  { token }
// Loads the ONE function booking whose signingToken matches — replaces the
// public page's old "pull the whole function_bookings table via anon" load.
import { createClient } from '@supabase/supabase-js';
import { applyCors } from '../_cors.js';

const SUPABASE_URL = process.env.SUPABASE_URL;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Not configured.' });

  const { token } = req.body ?? {};
  if (!token) return res.status(400).json({ error: 'Missing token.' });

  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
  try {
    const { data, error } = await supabase.from('function_bookings').select('data').eq('data->>signingToken', token);
    if (error) return res.status(500).json({ error: 'error' });
    const booking = data?.[0]?.data;
    if (!booking) return res.status(404).json({ error: 'invalid' });
    return res.status(200).json({ booking });
  } catch (err) {
    console.error('function-bookings/load error:', err);
    return res.status(500).json({ error: 'error' });
  }
}
