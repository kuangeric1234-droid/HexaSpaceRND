// Applies SQL to the Supabase project via the Management API (no manual SQL editor).
// Usage: node scripts/migrate.mjs [file.sql]   (default: hexaspace-setup.sql)
// Reads SUPABASE_ACCESS_TOKEN from .env.local. Run from the repo root.
import fs from 'fs';

const REF = 'ihvhnsdsvjwpyquvetzz';

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
const token = env.SUPABASE_ACCESS_TOKEN;
if (!token || !token.startsWith('sbp_')) {
  console.error('ERROR: no valid SUPABASE_ACCESS_TOKEN (sbp_...) in .env.local');
  process.exit(1);
}

const file = process.argv[2] || 'hexaspace-setup.sql';
const sql = fs.readFileSync(file, 'utf8');
console.log(`Applying ${file} (${sql.length} chars) to project ${REF}…`);

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log('HTTP', res.status);
console.log(text.slice(0, 3000));
process.exit(res.ok ? 0 : 1);
