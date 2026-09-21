// Merges per-script k6 --summary-export files into a single JSON keyed by script name.
const fs = require('fs');
const path = require('path');
const [dir, out] = process.argv.slice(2);
const merged = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  merged[path.basename(f, '.json')] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
}
fs.writeFileSync(out, JSON.stringify(merged, null, 2));
console.log(`wrote ${out}`);
