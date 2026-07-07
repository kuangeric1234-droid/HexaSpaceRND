// Provisions (or tears down) a DISPOSABLE test member for the adversarial probe.
// Creates a throwaway company (tenant) + a member row + a Supabase Auth user so
// scripts/security-probe.mjs can attempt cross-tenant access with a real member
// JWT. Everything is namespaced `__sectest__` and removed by the `down` mode.
//
//   node scripts/security-test-member.mjs up      # create + print env
//   node scripts/security-test-member.mjs down    # remove everything
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

function parseEnv(path) {
  if (!fs.existsSync(path)) return {};
  const out = {};
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}
const env = parseEnv('.env.local');
const URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing SUPABASE_URL / SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const CO = '__sectest__co';
const MEMBER = '__sectest__member';
const EMAIL = 'sectest.member@hexaspace.invalid';
const PASSWORD = 'SecTest!' + '9x27Qz';

async function findUser(email) {
  // page through until found (small dir expected)
  for (let page = 1; page <= 20; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    const u = data?.users?.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u;
    if (!data?.users?.length || data.users.length < 200) break;
  }
  return null;
}

const mode = process.argv[2] || 'up';

if (mode === 'up') {
  const now = new Date().toISOString();
  await sb.from('tenants').upsert({ id: CO, data: { id: CO, businessName: 'SecTest Co', email: EMAIL, status: 'Active' }, updated_at: now });
  await sb.from('members').upsert({ id: MEMBER, data: { id: MEMBER, companyId: CO, email: EMAIL, name: 'SecTest Member', portalAccess: true, status: 'Active' }, updated_at: now });
  let u = await findUser(EMAIL);
  if (!u) {
    const { data, error } = await sb.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
    if (error) { console.error('createUser failed:', error.message); process.exit(1); }
    u = data.user;
  } else {
    await sb.auth.admin.updateUserById(u.id, { password: PASSWORD });
  }
  console.log('Test member provisioned.');
  console.log(`TEST_MEMBER_EMAIL=${EMAIL}`);
  console.log(`TEST_MEMBER_PASSWORD=${PASSWORD}`);
  console.log(`VICTIM_COMPANY_ID=${CO}`);
  console.log(`VICTIM_TENANT_ID=tc4`);
} else if (mode === 'down') {
  await sb.from('members').delete().eq('id', MEMBER);
  await sb.from('tenants').delete().eq('id', CO);
  const u = await findUser(EMAIL);
  if (u) await sb.auth.admin.deleteUser(u.id);
  console.log('Test member removed.');
} else {
  console.error('usage: security-test-member.mjs up|down');
  process.exit(1);
}
