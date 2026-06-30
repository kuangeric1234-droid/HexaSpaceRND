// Creates a Supabase auth user (admin login) via the Auth Admin API.
// Usage: node scripts/create-admin.mjs <email> <password>
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local. Run from repo root.
import fs from 'fs';

function parseEnv(path) {
  const out = {};
  if (!fs.existsSync(path)) return out;
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const env = parseEnv('.env.local');
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
const password = process.argv[3];
if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!email || !password) { console.error('Usage: node scripts/create-admin.mjs <email> <password>'); process.exit(1); }

const res = await fetch(`${url}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, email_confirm: true }),
});
const text = await res.text();
console.log('HTTP', res.status);
console.log(text.slice(0, 800));
process.exit(res.ok ? 0 : 1);
