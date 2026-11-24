// scripts/unused-files.js
// Lists files under src/ that nothing reaches from the app's entry point (src/index.js)
// or from a test file, by following every relative import / require / import().
//   node scripts/unused-files.js
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "src");
const EXT = [".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".svg", ".png", ".jpg", ".jpeg", ".gif"];

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function resolve(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  const tries = [base, ...EXT.map((e) => base + e), ...EXT.map((e) => path.join(base, "index" + e))];
  return tries.find((t) => fs.existsSync(t) && fs.statSync(t).isFile()) || null;
}

const all = walk(ROOT);
const code = all.filter((f) => /\.(jsx?|tsx?)$/.test(f));
const roots = [path.join(ROOT, "index.js"), ...code.filter((f) => /\.test\.(jsx?|tsx?)$/.test(f) || f.endsWith("setupTests.js"))];
const seen = new Set();
const stack = [...roots];
const RE = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
while (stack.length) {
  const f = stack.pop();
  if (seen.has(f)) continue;
  seen.add(f);
  if (!/\.(jsx?|tsx?)$/.test(f)) continue;
  const src = fs.readFileSync(f, "utf8");
  let m;
  while ((m = RE.exec(src))) {
    const r = resolve(f, m[1]);
    if (r) stack.push(r);
  }
}
const unused = all.filter((f) => !seen.has(f)).map((f) => path.relative(ROOT, f).replace(/\\/g, "/")).sort();
const lines = (f) => {
  try {
    return fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").length;
  } catch {
    return 0;
  }
};
let total = 0;
for (const f of unused) {
  const n = /\.(jsx?|tsx?|txt|css)$/.test(f) ? lines(f) : 0;
  total += n;
  console.log(`${String(n).padStart(5)}  ${f}`);
}
console.log(`\n${unused.length} unused files, ~${total} lines (reachable: ${seen.size})`);
