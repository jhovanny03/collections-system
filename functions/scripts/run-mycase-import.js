// Local runner: node scripts/run-mycase-import.js
// Needs FEED_URL and FEED_TOKEN. Writes to the Firestore EMULATOR only: it refuses to
// run unless FIRESTORE_EMULATOR_HOST is set, so it can never touch production data.
const admin = require("firebase-admin");
const { runAll } = require("../mycaseSync");
const { createFirestoreStore } = require("../mycasePaymentsStore");

const { FEED_URL, FEED_TOKEN, FIRESTORE_EMULATOR_HOST } = process.env;
if (!FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing to run: set FIRESTORE_EMULATOR_HOST (e.g. 127.0.0.1:8080).");
  process.exit(1);
}
if (!FEED_URL || !FEED_TOKEN) {
  console.error("Set FEED_URL and FEED_TOKEN.");
  process.exit(1);
}

admin.initializeApp({ projectId: "demo-collections" });
runAll({
  store: createFirestoreStore(admin.firestore()),
  baseUrl: FEED_URL,
  token: FEED_TOKEN,
}).then(
  (s) => console.log(s),
  (e) => { console.error(e); process.exit(1); }
);
