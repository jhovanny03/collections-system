// functions/index.js
require("dotenv").config();

const functions = require("firebase-functions");
const { onRequest } = require("firebase-functions/https");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

if (!admin.apps.length) admin.initializeApp();

/* -------------------------
 * ✅ SendGrid configuration
 * ------------------------- */
const SENDGRID_KEY =
  process.env.SENDGRID_KEY || process.env.SENDGRID_API_KEY || "";
const SEND_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "";
const SEND_FROM_NAME = process.env.SENDGRID_FROM_NAME || "Rahman Law Collections";

// allow env override but keep your provided template id as default
const SENDGRID_TEMPLATE_ID =
  process.env.SENDGRID_TEMPLATE_ID || "d-b8546a21b68041e2b4af509d3740b6d9";

let sgMail = null;
if (SENDGRID_KEY) {
  sgMail = require("@sendgrid/mail");
  sgMail.setApiKey(SENDGRID_KEY);
  console.log(
    `[SendGrid] ✅ Initialized. from=${SEND_FROM_EMAIL} | template=${SENDGRID_TEMPLATE_ID}`
  );
} else {
  console.warn("[SendGrid] ⚠️ Missing API key; emails will be skipped.");
}

/* Helper: send dynamic email */
async function sendInviteEmail({ to, displayName, verifyLink, resetLink }) {
  if (!sgMail || !SEND_FROM_EMAIL) {
    console.log("Email skipped (SendGrid not configured). Would send to:", to);
    return { skipped: true };
  }
  if (!SENDGRID_TEMPLATE_ID) {
    console.log("Email skipped (missing SENDGRID_TEMPLATE_ID). Would send to:", to);
    return { skipped: true };
  }

  const msg = {
    to,
    from: { email: SEND_FROM_EMAIL, name: SEND_FROM_NAME },
    templateId: SENDGRID_TEMPLATE_ID,
    dynamicTemplateData: {
      display_name: displayName || "",
      verify_link: verifyLink,
      reset_link: resetLink,
      recipient_email: to,
    },
  };

  try {
    await sgMail.send(msg);
    console.log("✅ Invite email sent via SendGrid to:", to);
    return { ok: true };
  } catch (e) {
    console.error("❌ SendGrid send failed:", e?.response?.body || e?.message || e);
    return { ok: false, error: e?.message || "Send failed" };
  }
}

/* -------------------------
 * Employee Invite (HTTP)
 * ------------------------- */
exports.inviteUserHttp = onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method not allowed" });

    try {
      // Verify admin
      const authHeader = req.headers.authorization || "";
      const [, token] = authHeader.split(" ");
      if (!token) return res.status(401).json({ error: "Missing bearer token" });

      let decoded;
      try {
        decoded = await admin.auth().verifyIdToken(token);
      } catch {
        return res.status(401).json({ error: "Invalid token" });
      }

      const uid = decoded?.uid || decoded?.user_id;
      const role =
        decoded?.role || decoded?.claims?.role || decoded?.firebase?.claims?.role;
      console.log("inviteUserHttp caller uid/role:", uid, role);
      if (!uid || role !== "admin") return res.status(403).json({ error: "Admins only" });

      // Validate input
      const { email, displayName, role: newRole = "basic" } = req.body || {};
      if (!email || !/^\S+@\S+\.\S+$/.test(email))
        return res.status(400).json({ error: "Valid email required" });

      const ALLOWED_ROLES = new Set(["admin", "editor", "basic"]);
      if (!ALLOWED_ROLES.has(newRole))
        return res.status(400).json({ error: "Invalid role" });

      // Create user
      let userRecord;
      try {
        userRecord = await admin.auth().createUser({
          email,
          displayName: displayName || "",
          emailVerified: false,
          disabled: false,
        });
      } catch (e) {
        if (e.code === "auth/email-already-exists")
          return res.status(409).json({ error: "User already exists" });
        console.error("Create user failed:", e);
        return res.status(500).json({ error: e.message || "Create user failed" });
      }

      await admin.auth().setCustomUserClaims(userRecord.uid, { role: newRole });

      await admin
        .firestore()
        .doc(`users/${userRecord.uid}`)
        .set(
          {
            name: displayName || "",
            email,
            role: newRole,
            disabled: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

      // 🔗 Generate links
      // Verify link goes to /action with ?next=reset so the handler auto-sends the reset email
      const verifySettings = { url: "https://collectionsapp-7d351.web.app/action?next=reset" };
      // Reset link just lands at /action normally
      const resetSettings = { url: "https://collectionsapp-7d351.web.app/action" };

      const resetLink = await admin.auth().generatePasswordResetLink(email, resetSettings);
      const verifyLink = await admin.auth().generateEmailVerificationLink(email, verifySettings);

      // Send email via SendGrid template
      const emailResult = await sendInviteEmail({
        to: email,
        displayName,
        verifyLink,
        resetLink,
      });

      return res.status(200).json({
        uid: userRecord.uid,
        email,
        result: emailResult,
      });
    } catch (e) {
      console.error("inviteUserHttp error", e);
      return res.status(500).json({ error: "Internal error" });
    }
  });
});

/* -------------------------
 * 🔁 Generate Reset Link (HTTP) for seamless verify → reset flow
 * ------------------------- */
exports.generateResetLinkHttp = onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
      const { email } = req.body || {};
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: "Valid email required" });
      }

      // Ensure the user exists before generating the link
      let user;
      try {
        user = await admin.auth().getUserByEmail(email);
      } catch {
        return res.status(404).json({ error: "User not found" });
      }

      const actionSettings = { url: "https://collectionsapp-7d351.web.app/action" };
      const resetLink = await admin.auth().generatePasswordResetLink(email, actionSettings);

      return res.status(200).json({ resetLink, uid: user.uid });
    } catch (e) {
      console.error("generateResetLinkHttp error", e);
      return res.status(500).json({ error: "Internal error" });
    }
  });
});

/* -------------------------
 * Delete User (HTTP)
 * ------------------------- */
exports.deleteUserHttp = onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method not allowed" });

    try {
      const authHeader = req.headers.authorization || "";
      const [, token] = authHeader.split(" ");
      if (!token) return res.status(401).json({ error: "Missing bearer token" });

      let decoded;
      try {
        decoded = await admin.auth().verifyIdToken(token);
      } catch {
        return res.status(401).json({ error: "Invalid token" });
      }

      const callerUid = decoded?.uid || decoded?.user_id;
      const callerRole =
        decoded?.role || decoded?.claims?.role || decoded?.firebase?.claims?.role;
      if (!callerUid || callerRole !== "admin")
        return res.status(403).json({ error: "Admins only" });

      const { uid: targetUid } = req.body || {};
      if (!targetUid) return res.status(400).json({ error: "uid required" });
      if (targetUid === callerUid) return res.status(400).json({ error: "Cannot delete yourself" });

      await admin.auth().deleteUser(targetUid);
      await admin.firestore().doc(`users/${targetUid}`).delete();

      return res.status(200).json({ ok: true, uid: targetUid });
    } catch (e) {
      console.error("deleteUserHttp error", e);
      return res.status(500).json({ error: "Internal error" });
    }
  });
});