// Audit (default) or repair (--fix) double-encoded UTF-8 ("mojibake") in source.
// Some files were saved after a UTF-8 → Windows-1252 → UTF-8 round-trip, so an
// em-dash "—" became "â€"", "'" became "â€™", "🎉" became "ðŸŽ‰", etc.
//
// SURGICAL repair: walk the text; whenever a run of chars maps (via cp1252) back
// to a valid multi-byte UTF-8 sequence, decode it to the real character. Genuine
// clean characters (a real "→", CJK, a clean "—") don't form such a run and pass
// through untouched — so this is safe on mixed and already-clean files alike.
import fs from 'fs';

// cp1252 0x80–0x9F printable specials → byte.
const SPECIAL = { 0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,
  0x2020:0x86,0x2021:0x87,0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,
  0x0152:0x8C,0x017D:0x8E,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,
  0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02DC:0x98,0x2122:0x99,0x0161:0x9A,
  0x203A:0x9B,0x0153:0x9C,0x017E:0x9E,0x0178:0x9F };

// A char's cp1252 byte, or -1 if it isn't representable in cp1252 (⇒ genuine
// clean char, not part of a mojibake run).
function toByte(cp) {
  if (cp <= 0x7F) return cp;
  if (cp >= 0xA0 && cp <= 0xFF) return cp;
  if (SPECIAL[cp] !== undefined) return SPECIAL[cp];
  if (cp >= 0x80 && cp <= 0x9F) return cp; // raw C1 passthrough (some emoji)
  return -1;
}

function fixSurgical(s) {
  const chars = [...s]; // code points
  const out = [];
  let i = 0;
  while (i < chars.length) {
    const b = toByte(chars[i].codePointAt(0));
    let len = 0;
    if (b >= 0xC2 && b <= 0xDF) len = 2;
    else if (b >= 0xE0 && b <= 0xEF) len = 3;
    else if (b >= 0xF0 && b <= 0xF4) len = 4;
    if (len && i + len <= chars.length) {
      const bytes = [b];
      let ok = true;
      for (let k = 1; k < len; k++) {
        const bb = toByte(chars[i + k].codePointAt(0));
        if (bb < 0x80 || bb > 0xBF) { ok = false; break; }
        bytes.push(bb);
      }
      if (ok) {
        const dec = Buffer.from(bytes).toString('utf8');
        if (!dec.includes('�')) { out.push(dec); i += len; continue; }
      }
    }
    out.push(chars[i]); i += 1;
  }
  return out.join('');
}

function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (!/node_modules|\.git|dist/.test(p)) out = out.concat(walk(p)); }
    else if (/\.(js|jsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

const FIX = process.argv.includes('--fix');
const files = ['api', 'src'].flatMap((r) => (fs.existsSync(r) ? walk(r) : []));
let changed = 0;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const fixed = fixSurgical(s);
  if (fixed !== s) {
    changed++;
    const n = [...s].length - [...fixed].length; // chars removed (mojibake is longer)
    console.log(`  ${FIX ? 'FIXED' : 'would fix'}  ${f}  (${n} mojibake char(s) collapsed)`);
    if (FIX) fs.writeFileSync(f, fixed);
  }
}
console.log(`\nScanned ${files.length} files; ${changed} ${FIX ? 'repaired' : 'need repair'}.`);
if (!FIX && changed) console.log('Run with --fix to repair.');
