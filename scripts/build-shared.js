// scripts/build-shared.js
// Copies the app's billing math into functions/shared as CommonJS, so the server
// jobs (nightly aging snapshot) run exactly the same code as the app. Run after
// changing any of these files (and before deploying):
//   node scripts/build-shared.js
const fs = require("fs");
const path = require("path");
const { transform } = require("sucrase");

const ROOT = path.resolve(__dirname, "..");
const FILES = ["utils/dates.js", "billing/plans.js", "billing/ledger.js", "billing/mycaseOverlay.js", "billing/contact.js", "billing/book.js", "billing/insights.js"];

for (const rel of FILES) {
  const src = path.join(ROOT, "src", rel);
  const out = path.join(ROOT, "functions", "shared", rel);
  const code = transform(fs.readFileSync(src, "utf8"), { transforms: ["imports"], filePath: src }).code;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `// GENERATED from src/${rel} by scripts/build-shared.js. Do not edit here.\n${code}`);
  console.log("wrote", path.relative(ROOT, out));
}
