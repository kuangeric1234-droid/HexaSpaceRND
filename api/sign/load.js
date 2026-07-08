// POST /api/sign/load  { token }
// Public e-sign page loader. The token (esign_requests.token) is the only secret;
// we resolve it server-side and return ONLY the one contract's data — never the
// whole tables the browser used to pull with the anon key.
import { createClient } from '@supabase/supabase-js';
import { applyCors } from '../_cors.js';
import { publicSettings } from '../_publicSettings.js';

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
    const { data: request, error } = await supabase
      .from('esign_requests').select('*').eq('token', token).single();
    if (error || !request) return res.status(404).json({ error: 'invalid' });

    // Only ever expose the status + the signer name back to the page.
    const reqOut = {
      status: request.status,
      licensee_signer_name: request.licensee_signer_name ?? null,
    };
    if (request.status === 'fully_signed') return res.status(200).json({ request: reqOut });

    const { data: lRows } = await supabase.from('leases').select('data').eq('id', request.lease_id);
    const lease = lRows?.[0]?.data ?? null;
    if (!lease) return res.status(404).json({ error: 'invalid' });

    const { data: tRows } = await supabase.from('tenants').select('data').eq('id', lease.tenantId);
    const t = tRows?.[0]?.data ?? {};
    // Minimal tenant fields the page renders/needs (card-on-file decision).
    const tenant = {
      id: t.id, businessName: t.businessName, contactName: t.contactName, email: t.email,
      phone: t.phone ?? null, abn: t.abn ?? null,
      stripePaymentMethodId: t.stripePaymentMethodId ?? null,
    };

    // The agreement's PRIMARY CONTACT falls back to the company's members
    // (billing/contact person) when the tenant record has no name/number.
    // Minimal fields only — this is a public (token-gated) page.
    const { data: mRows } = await supabase.from('members').select('data').eq('data->>companyId', lease.tenantId);
    const members = (mRows ?? []).map((r) => r.data).map((m) => ({
      companyId: m.companyId, name: m.name ?? null, phone: m.phone ?? null, email: m.email ?? null,
      billingPerson: !!m.billingPerson, contactPerson: !!m.contactPerson,
    }));

    if (request.status === 'tenant_signed') {
      return res.status(200).json({ request: reqOut, lease, tenant });
    }

    const [{ data: sRows }, { data: settRows }, { data: tmplRows }] = await Promise.all([
      supabase.from('spaces').select('data').eq('id', lease.spaceId),
      supabase.from('settings').select('data').eq('id', 'global'),
      supabase.from('templates').select('id,data'),
    ]);

    const templates = (tmplRows ?? []).map((r) => ({ id: r.id, ...r.data }));

    return res.status(200).json({
      request: reqOut,
      lease,
      tenant,
      members,
      space: sRows?.[0]?.data ?? null,
      settings: publicSettings(settRows?.[0]?.data),
      templates,
    });
  } catch (err) {
    console.error('sign/load error:', err);
    return res.status(500).json({ error: 'error' });
  }
}
