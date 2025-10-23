// scripts/setAdmin.js
const admin = require("firebase-admin");

if (process.argv.length < 3) {
  console.error("Usage: node scripts/setAdmin.js <email>");
  process.exit(1);
}

const email = process.argv[2];

admin.initializeApp({
  credential: admin.credential.cert(require("../serviceAccountKey.json")),
  projectId: "collectionsapp-7d351",
});

(async () => {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { role: "admin" });
    console.log(`✅ Granted role=admin to ${email} (uid: ${user.uid})`);
    process.exit(0);
  } catch (e) {
    console.error("❌ Failed:", e.message || e);
    process.exit(1);
  }
})();