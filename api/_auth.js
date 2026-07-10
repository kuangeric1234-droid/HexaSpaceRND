// Server-side caller verification for api/ endpoints.
//
// Every api/ handler runs with the service role and bypasses RLS, so it MUST
// establish who is calling before acting on any id. Three gates:
//   requireMember(req) — a verified member; resolves their companyId.
//   requireAdmin(req)  — a verified admin (email in the admins allow-list).
//   requireCron(req)   — a Vercel cron invocation (Bearer CRON_SECRET).
// Member/admin identity comes from the caller's Supabase JWT (Authorization:
// Bearer <access_token>), verified via the Auth admin API — never from the body.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;

export function serviceClient() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function bearer(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

// Resolve + verify the caller's JWT → { id, email } or null.
export async function verifiedUser(req, sb) {
  const jwt = bearer(req);
  if (!jwt) return null;
  const { data: { user }, error } = await sb.auth.getUser(jwt);
  if (error || !user?.email) return null;
  return { id: user.id, email: user.email.toLowerCase() };
}

export async function isAdminEmail(sb, email) {
  const { data } = await sb.from('admins').select('email').ilike('email', email).maybeSingle();
  return !!data;
}

// The companyId (tenants.id) a member/email belongs to, resolved server-side.
export async function companyForEmail(sb, email) {
  const { data: m } = await sb.from('members').select('data').ilike('data->>email', email).limit(1);
  const cid = m?.[0]?.data?.companyId;
  if (cid) return cid;
  const { data: t } = await sb.from('tenants').select('id').ilike('data->>email', email).limit(1);
  return t?.[0]?.id ?? null;
}

// Whether a verified member may act as their company's billing authority — view/
// pay invoices and manage the stored card. True for the company's billing or
// contact person, or a company-email login that has no member row (the owner).
// Client twin: src/lib/billingAccess.js canViewBilling(). Admins bypass separately.
export async function isBillingAuthority(sb, email) {
  const { data } = await sb.from('members').select('data').ilike('data->>email', email);
  const rows = (data ?? []).map((r) => r.data).filter((m) => m?.email);
  if (rows.length === 0) return true; // company-email / owner login (no member row)
  return rows.some((m) => m.billingPerson || m.contactPerson);
}

// Gate: a verified member. Returns { sb, user, companyId } or { error, status }.
export async function requireMember(req) {
  const sb = serviceClient();
  const user = await verifiedUser(req, sb);
  if (!user) return { error: 'Sign in required.', status: 401 };
  const companyId = await companyForEmail(sb, user.email);
  return { sb, user, companyId };
}

// Gate: a verified admin. Returns { sb, user } or { error, status }.
export async function requireAdmin(req) {
  const sb = serviceClient();
  const user = await verifiedUser(req, sb);
  if (!user) return { error: 'Sign in required.', status: 401 };
  if (!(await isAdminEmail(sb, user.email))) return { error: 'Admin access required.', status: 403 };
  return { sb, user };
}

// Gate: a Vercel cron invocation. Vercel adds `Authorization: Bearer $CRON_SECRET`
// when the CRON_SECRET env var is set. If it is unset we allow the call (so crons
// keep running before the secret is configured) but flag it — SET CRON_SECRET in
// the Vercel project env to actually enforce this.
export function requireCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: true, unguarded: true };
  const tok = bearer(req) || req.query?.key;
  return tok === secret ? { ok: true } : { ok: false };
}

// Gate for endpoints that are BOTH a Vercel cron and a manual admin action:
// allow the Vercel cron (Bearer CRON_SECRET) or a verified admin. Until
// CRON_SECRET is set in the Vercel env this passes (so crons keep running) but
// flags `unguarded` — set CRON_SECRET to enforce.
export async function requireCronOrAdmin(req) {
  const cron = requireCron(req);
  if (cron.ok) return { ok: true, cron: true, unguarded: cron.unguarded };
  const admin = await requireAdmin(req);
  if (!admin.error) return { ok: true, admin: true };
  return { ok: false, status: 401, error: 'Unauthorized' };
}
