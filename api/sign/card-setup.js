// POST /api/sign/card-setup  { token, returnTo }
// Starts a Stripe card-setup Checkout session for the tenant on THIS signing
// request. The tenant is derived from the esign token server-side — the caller
// cannot point card setup at an arbitrary tenantId (unlike /api/stripe/setup,
// which is being locked to authenticated owners separately).
import { createClient } from '@supabase/supabase-js';
import { applyCors } from '../_cors.js';
import { stripeConfigured, stripeFetch, ensureStripeCustomer } from '../_stripe.js';

const SUPABASE_URL = process.env.SUPABASE_URL;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!stripeConfigured() || !serviceKey) return res.status(500).json({ error: 'Stripe not configured.' });

  const { token, returnTo } = req.body ?? {};
  if (!token) return res.status(400).json({ error: 'Missing token.' });

  try {
    const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
    const { data: request } = await supabase.from('esign_requests').select('lease_id, tenant_id').eq('token', token).single();
    if (!request) return res.status(404).json({ error: 'Invalid link.' });

    // Prefer the lease's tenantId; fall back to the request's tenant_id.
    let tenantId = request.tenant_id;
    if (request.lease_id) {
      const { data: lRows } = await supabase.from('leases').select('data->>tenantId').eq('id', request.lease_id);
      tenantId = lRows?.[0]?.tenantId || tenantId;
    }
    if (!tenantId) return res.status(404).json({ error: 'Account not found.' });

    const { data: tRow } = await supabase.from('tenants').select('data').eq('id', tenantId).single();
    const tenant = tRow?.data;
    if (!tenant) return res.status(404).json({ error: 'Account not found.' });

    const customerId = await ensureStripeCustomer(supabase, tenant);
    const base = `https://${req.headers.host}`;
    const back = returnTo && String(returnTo).startsWith('/') ? `${base}${returnTo}` : `${base}/sign/${token}`;
    const sep = back.includes('?') ? '&' : '?';
    const r = await stripeFetch('/checkout/sessions', {
      mode: 'setup',
      customer: customerId,
      'payment_method_types[0]': 'card',
      success_url: `${back}${sep}card=saved`,
      cancel_url: back,
      metadata: { tenantId, kind: 'card_setup' },
    });
    if (!r.ok || !r.json.url) return res.status(500).json({ error: r.json.error?.message ?? 'Could not start card setup.' });
    return res.status(200).json({ url: r.json.url });
  } catch (err) {
    console.error('sign/card-setup error:', err);
    return res.status(500).json({ error: err.message });
  }
}
