// POST /api/sign/submit  { token, signerName, signerTitle, signerDate, signatureData }
// The licensee signs. The token is verified server-side; only that contract's
// esign_requests row + lease are written. Admin countersign + tenant confirmation
// emails are sent from SERVER-loaded data (never a client-supplied blob).
import { createClient } from '@supabase/supabase-js';
import { applyCors } from '../_cors.js';
import { sendResendEmail } from '../_email.js';
import { brandFrame, bKicker, bH1, bP, bBtn, bSmall, bPanel, INK, MUTE, OLIVE } from '../_brand.js';

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
    const { data: request, error } = await supabase
      .from('esign_requests').select('*').eq('token', token).single();
    if (error || !request) return res.status(404).json({ error: 'Invalid link.' });
    if (request.status === 'fully_signed') return res.status(200).json({ ok: true, alreadySigned: true });
    if (request.status === 'tenant_signed') return res.status(200).json({ ok: true, alreadySigned: true });

    const now = new Date().toISOString();

    const { error: reqErr } = await supabase.from('esign_requests').update({
      status: 'tenant_signed',
      licensee_signature_data: signatureData,
      licensee_signer_name: signerName,
      licensee_signed_at: now,
      licensee_title: signerTitle ?? '',
      licensee_date: signerDate ?? '',
    }).eq('token', token);
    if (reqErr) throw reqErr;

    const { data: lRows } = await supabase.from('leases').select('data').eq('id', request.lease_id);
    const lease = lRows?.[0]?.data;
    if (lease) {
      await supabase.from('leases').update({
        data: { ...lease, signatureStatus: 'out_for_signature', tenantSignedAt: now, tenantSignerName: signerName },
        updated_at: now,
      }).eq('id', request.lease_id);
    }

    // Emails from server-loaded data only.
    const [{ data: tRows }, { data: settRows }] = await Promise.all([
      supabase.from('tenants').select('data').eq('id', lease?.tenantId ?? request.tenant_id),
      supabase.from('settings').select('data').eq('id', 'global'),
    ]);
    const tenant = tRows?.[0]?.data ?? {};
    const settings = settRows?.[0]?.data ?? {};
    const companyName = settings?.company?.name ?? 'Hexa Space';
    const website = settings?.company?.website ?? 'hexaspace.com.au';
    const contractNum = lease?.contractNumber ?? `CON-${String(request.lease_id).slice(-3).toUpperCase()}`;
    const portalUrl = settings?.portalUrl || 'https://portal.hexaspace.com.au';
    const fromName = settings?.emails?.fromName || companyName;
    const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au';
    const from = `${fromName} <${fromEmail}>`;
    const replyTo = settings?.emails?.replyTo || settings?.emails?.notificationEmail;

    const adminList = [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))];
    if (adminList.length) {
      const inner = bKicker('Action Required') + bH1('Countersign contract 🖊') +
        bP(`<strong style="color:${INK}">${tenant?.businessName ?? 'A tenant'}</strong> has signed <strong style="color:${INK}">${contractNum}</strong>. Please log in to the portal to review and countersign.`) +
        bPanel(`<div style="font-family:sans-serif;font-size:13px;color:#3a3a3a"><span style="color:${MUTE}">Signed by:</span> <strong>${signerName}</strong></div>`) +
        bBtn('Open portal to countersign', portalUrl);
      await sendResendEmail({ from, to: adminList, subject: `Action required: ${tenant?.businessName ?? 'Tenant'} has signed ${contractNum}`, html: brandFrame(inner, { company: companyName, website }), replyTo }).catch(() => {});
    }
    if (tenant?.email) {
      const inner = bKicker('Signature Received') + bH1('Signature received ✅') +
        bP(`Hi ${tenant?.contactName ?? 'there'},`) +
        bP(`Your signature for <strong style="color:${INK}">${contractNum}</strong> has been received. ${companyName} will countersign and send you a fully executed copy shortly.`) +
        bSmall('If you have any questions, please contact us directly.');
      await sendResendEmail({ from, to: [tenant.email], subject: `Signature received — ${contractNum}`, html: brandFrame(inner, { company: companyName, website }), replyTo }).catch(() => {});
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('sign/submit error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
