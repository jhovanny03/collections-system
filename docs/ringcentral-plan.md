# RingCentral → Collections follow-ups: plan

Status: **plan only**, written 2026-11-20. Nothing is built, deployed or connected to RingCentral.
Owners of the rules: Jhovanny + Arleen. Items marked **(unconfirmed)** could not be confirmed in RingCentral's docs and must be checked with RingCentral sales/support.

## Goal

When billing calls a client who missed the 15th payment:

1. The call is recorded in the app automatically: who called, when, and how long the call was.
2. The call's outcome updates that client's follow-up row:
   - **No answer**: `Attempted-No-Contact`.
   - **Talking**: `Reached-Working`.
   - **Promised to pay**: `Promise`, with the date and amount.
3. A promise creates a payment promise and sets the next follow-up date. Arleen and Jhovanny will define the scheduling rules.
4. The AI summary appears in the client's **Notes & promises** tab with source `ringcentral`.
   - `CommunicationLog.js` already labels these entries "Call summary".
5. "Paid" still comes only from MyCase payments.
   - The hourly sync and `refreshFollowUpsCron` already handle this.
   - A call never marks a row paid.

## 1. What RingCentral offers

| Need | API | What you need on the RingCentral side |
|---|---|---|
| Every call: numbers, direction, result, duration | **Call Log API**: `/restapi/v1.0/account/~/call-log` (whole account) or `.../extension/{id}/call-log` (one user) | App permission `ReadCallLog`. The account-wide endpoint needs the JWT user to be an admin or have a "company call log" role **(unconfirmed; forum only)**. Records appear 15–30 s after the call ends. RingCentral does not keep call logs forever, so we keep our own copy. |
| "Call ended" in real time | **Telephony session webhook**: `/restapi/v1.0/account/~/telephony/sessions` (one user: `.../extension/{id}/telephony/sessions`). A call has ended when its status is `Disconnected`. The payload includes the parties' phone numbers, `direction` and `missedCall`. Filters available: `direction`, `missedCall`, `phoneNumber`, `statusCode`, `withRecordings`. | App permission `CallControl`. Events can arrive out of order, so order them by `sequence`. |
| Recording | Call log `recording.contentUri` | Permission `ReadCallRecording`. **Automatic recording is off by default.** An admin turns it on per user or queue in Admin Portal → Auto-Receptionist. Recordings are kept 90 days, and calls under 30 s are not kept. Which plan includes automatic recording is unclear: Core lists only on-demand recording **(unconfirmed)**. |
| Transcript + AI summary | **AI Conversation Expert (ACE) API**, formerly RingSense: `/ai/ringsense/v1/public/accounts/~/domains/pbx/sessions/{telephonySessionId}/insights`. It returns `Transcript`, `Summary`, `BulletedSummary`, `NextSteps`, `Sentiment`, and also `CallNotes` (AI Notes) when AI Notes was on during the call. | **Paid add-on**, about $60/user/month list price, and the API is still labelled **beta**. Only **recorded** calls by a user **with an ACE licence** get insights. The required permission is `RingSense` / `ReadRingSenseInsights` (the two docs pages disagree). |
| "Summary ready" | **ACE webhook** event filter `/ai/ringsense/v1/public/accounts/~/domains/pbx/insights`. The payload carries the full insights, and a call with AI Notes on sends 2 events. | Same ACE licence. |
| RingCX (contact center) calls | Option A: ACE with the `rcx` domain (needs the ACE events; no lookup API). Option B: RingCX summary API, `GET …/voice/api/v1/summary/accounts/{subAccountId}/segments/{segmentId}/auto`. Option B is **poll-only**, authenticates with a cookie token, and needs AI summaries turned on per queue or campaign. | RingCX licence and AI summaries enabled. RingCX can also send "Post Disposition" triggers, but the payload fields are **(unconfirmed)**. |

What *not* to use:

- **Old AI API.** The "Artificial Intelligence" endpoints (`/ai/audio/v1/async/speech-to-text`, `/ai/text/v1/async/summarize`) are **deprecated**.
- **AI Notes API.** RingEX AI Notes has no API of its own; its text only arrives through ACE as `CallNotes`.

**ACE does not give a promised date or amount as data fields.** It gives free text: a summary and next steps. We must extract the outcome, date and amount from that text ourselves (section 3, step 5).

**Auth**: a private, server-only app using the **JWT flow**:

- A RingCentral user creates a JWT credential in the Developer Console. The JWT does not expire unless we set an expiry, and it can be revoked.
- The server exchanges the JWT, client ID and client secret for an access token. The token lasts about 1 hour, and the server gets a new one by sending the JWT again.
- The app acts **as that user**. Reading the whole account's calls therefore needs an admin user, or a dedicated "integration" user with the call-log and recording roles.

**Webhooks**:

- **Setup:** RingCentral first sends a `Validation-Token` header. Our endpoint must echo it back with HTTP 200 within 3 s.
- **Checking each delivery:** we set a `verificationToken`, and RingCentral sends it back in a `verification-token` header on every delivery.
- **Failures are serious:** if our endpoint fails or has a long outage, the subscription is **blacklisted permanently** and must be recreated. So the endpoint must answer 200 at once and do the work later.
- **Expiry:** subscriptions expire. A daily job should renew them, or recreate them if they were dropped.

**Rate limits**: the Call Log API is in the "Heavy" group, which allows 10 requests per minute per user and app. Webhooks keep us well under this.

**Sandbox**: RingCentral retired its developer sandbox (around Dec 2024 / Jan 2025). Testing now happens on a developer plan or on the firm's real account. Until go-live we build and test against **saved sample payloads in the Firebase emulator**.

## 2. Data flow

```
Billing user calls client (RingEX app, extension with auto-recording + ACE)
        │
        ├─► [webhook] telephony session → Disconnected
        │        ringcentralWebhook (Firebase, answers 200 at once)
        │        → ringcentralCalls/{telephonySessionId}   (numbers, direction, duration, missed?, caller ext.)
        │        → match client by phone (phoneIndex)                         ── section 4
        │        → no answer / voicemail / very short → follow-up row "No answer", history entry
        │
        └─► [webhook] ACE insights ready (only for recorded, answered calls)
                 → attach summary to ringcentralCalls/{id}
                 → extract outcome {talked | promised, date, amount, reason}  ── step 5
                 → client.communicationLogs += { source: "ringcentral", message: summary, user: caller }
                 → followUpsCohorts/{YYYY-MM}/items/{clientId}: status, lastContact*, history[], nextFollowUpAt
                 → promise → paymentPromises + client.paymentPromise (same shape as savePaymentPromise)

MyCase payment (hourly sync) ─► client.payments ─► refreshFollowUpsCron marks row Paid   (unchanged)
                                                 ─► checkPromisesCron marks promise kept/broken (unchanged)
```

Design rules:

- **One record per call**: the document id is RingCentral's `telephonySessionId`. Repeated or out-of-order webhook deliveries never create two history entries.
- **The webhook only stores the raw event.** A Firestore trigger (`onDocumentWritten` on `ringcentralCalls`) does the matching and the updates, so a slow step never gets the subscription blacklisted.
- **Safety net:** a nightly job reads the Call Log for billing extensions and fills in any calls the webhooks missed.
- **Store the summary, not the transcript.** We keep the summary, outcome and a RingCentral reference. Full transcripts and recordings stay in RingCentral (1 year for ACE, 90 days for recordings). This keeps privileged content out of Firestore; see the open questions.
- **Who made the call:** the RingCentral extension maps to an app user. Add `ringcentralExtensionId` to `users/{uid}`. `lastContactBy` and the history `by` field are then that person, so the Team page keeps counting calls per person.
- **Only billing calls count.** Calls from extensions that are not on the billing list are ignored.

## 3. Where it plugs into the app

| App piece | Change |
|---|---|
| `functions/index.js` | Add these functions. **(new)** marks a function that doesn't exist yet; the rest are new parts of existing logic.<br>• `ringcentralWebhook` **(new)**: HTTPS endpoint (`onRequest`, v2). Secrets `RC_CLIENT_ID`, `RC_CLIENT_SECRET`, `RC_JWT` and `RC_VERIFICATION_TOKEN`, stored with `defineSecret` the way `MYCASE_FEED_TOKEN` is. Add a hosting rewrite `/api/ringcentral/webhook`, like the MyCase callback.<br>• `ringcentralSubscriptionsCron` **(new)**: daily create, renew or recreate of the webhook subscriptions.<br>• `ringcentralCallLogBackfill` **(new)**: nightly safety net.<br>• `onRingcentralCall`: the Firestore trigger that matches the client and applies the outcome. |
| `functions/ringcentral/*.js` | Pure, tested modules, like `mycasePayments.js` / `plans.js`:<br>• `normalizePhone`<br>• `matchClient`<br>• `outcomeFromCall`<br>• `outcomeFromInsights`<br>• `nextFollowUpDate` (the rule table, to be filled in by Arleen and Jhovanny) |
| `followUpsCohorts/{YYYY-MM}/items/{clientId}` | Same fields the "Log call" dialog writes today: `status`, `attemptCount`, `lastContactAt`, `lastContactSummary`, `lastContactBy(Email)` and `history[]`.<br>• Each history entry also gets `source: "ringcentral"` and `callId`.<br>• Add `lastCallId` and `aiSuggestion` (see step 5) to **`TRACKED_FIELDS`** in `overwriteCohortItems`, so the 2-hourly refresh keeps them. |
| `PaymentPromise.js` `savePaymentPromise` | Runs in the browser with the signed-in user. The server needs its own copy that writes the **same shape** (`clients/{id}.paymentPromise`, a `communicationLogs` entry and `paymentPromises` with `status: "open"`), plus `source: "ringcentral"` and `callId`.<br>• `checkPromisesCron` then marks the promise kept or broken with no changes. |
| `FollowUps.jsx` | Show the client's phone number on each row, with a click-to-call link that opens the RingCentral app.<br>• Show a "RingCentral" chip on history entries that came from a call.<br>• Add a suggestion banner (step 5). |
| `CommunicationLog.js` | Already shows `source: "ringcentral"` as "Call summary"; no change needed. Optionally add a "Open in RingCentral" link. |
| `MyCase-Integration` (Azure) | New `/feed/clients` endpoint returning MyCase client id, `cell_phone`, `work_phone`, `home_phone` and case ids. The data is already in its Postgres `clients` table. |

## 4. Matching a call to a client

Collections clients have no phone numbers today; MyCase does (`clients.cell_phone / work_phone / home_phone` in the Azure service).

1. **Get phone numbers from MyCase.** The Azure service's new `/feed/clients` endpoint returns each client's phone numbers and case ids. `importMyCasePayments` mirrors it into Firestore (`mycaseClients`), using the same token-gated pattern as cases, invoices and payments.
2. **Build a phone index.**
   - Normalize every number to E.164 with `libphonenumber-js`, assuming US when there is no country code. Immigration clients may have foreign numbers, so keep the country code when it is there.
   - Build the index `phoneIndex/{+1XXXXXXXXXX}` → `{ mycaseClientIds, caseIds, collectionsClientIds }`.
   - Collections records are per case, so a MyCase case id maps to a Collections client through `mycaseCaseId` or `caseIdFromLink(myCaseLink)`.
3. **Find the client on a call.**
   - Take the client's number: `to.phoneNumber` on an outbound call, `from.phoneNumber` on an inbound one.
   - Look it up in the index.
4. **When more than one record matches** (the same person with two cases, or relatives sharing a phone):
   - Pick the record that is **open on this month's follow-up list**.
   - If that is still not exactly one record, the call goes to an **"Unmatched calls"** list on the Follow-ups page, where billing picks the client by hand.
   - Never guess between two clients.
5. **When nothing matches**, the call also goes to "Unmatched calls".
   - Optional later: billing can add a number to a client from there.

Step 1 is useful on its own: the follow-up list gets phone numbers and click-to-dial even before any AI work.

## 5. What to build, in order

| # | Step | Depends on |
|---|---|---|
| 0 | **Decisions and licences** (section 6):<br>• which billing users get ACE and auto-recording<br>• RingEX or RingCX for these calls<br>• consent wording<br>• the outcome and next-date rules | User, Arleen, RingCentral admin |
| 1 | **Phone numbers.** Azure `/feed/clients` → `mycaseClients` → `phoneIndex`. Show the phone and click-to-dial on Follow-ups rows. Tests for normalizing and matching. | — |
| 2 | **RingCentral app.** Register a private server-only JWT app with the permissions `ReadAccounts`, `ReadCallLog`, `CallControl`, `ReadCallRecording`, `WebhookSubscriptions` and `RingSense`. Create a dedicated integration user and its JWT. Store the secrets in Firebase Secret Manager. Map each billing extension to an app user. | 0 |
| 3 | **Webhook and subscriptions.**<br>• `ringcentralWebhook`: validation handshake, verification-token check, stores raw events.<br>• `ringcentralSubscriptionsCron`.<br>• Test in the emulator with saved sample payloads. | 2 |
| 4 | **Calls → "No answer".** On a `Disconnected` event:<br>• Write `ringcentralCalls`, match the client, and for missed, voicemail or very short calls set "No answer" with a history entry.<br>• Add the nightly Call Log backfill.<br>• Add the "Unmatched calls" list.<br>This step works **without ACE**. | 1, 3 |
| 5 | **Summary → outcome.** On the ACE insights event:<br>• Save the summary to Notes & promises.<br>• Extract `{ outcome, promiseDate, promiseAmount, nonPayReason }` from `Summary`, `NextSteps` and `CallNotes`.<br>**Start in "suggest" mode:** the row shows *"RingCentral: promised $300 on Dec 5 — Accept / Edit / Ignore"*, and nothing is written until billing accepts. Switch to automatic only after Arleen has checked a few weeks of suggestions.<br>Extraction choices:<br>• Strict rules over the summary text, which is cheap but brittle.<br>• An LLM call that returns JSON, which is more accurate but sends call text to one more vendor (see open questions). | 4, ACE licence |
| 6 | **Promise and next date.** On an accepted promise:<br>• Write the server-side promise, using the same shape as `savePaymentPromise`.<br>• Set `nextFollowUpAt = nextFollowUpDate(outcome, promiseDate, today)`.<br>Placeholder rules until Arleen and Jhovanny decide:<br>• no answer → next business day<br>• talked → +3 business days<br>• promise → promise date + 1 business day<br>The row then shows on the Follow-ups calendar on that date. | 5 |
| 7 | **Rules that guard the row:**<br>• Never change a row that is already Paid or Resolved; only add history to it.<br>• Never move a row back to "No answer" from "Promise" while that promise is still open.<br>• A call in a month with no list (before the 16th) still goes to Notes & promises. | 4–6 |
| 8 | **Go-live.**<br>• Run on Jhovanny's extension only for a week.<br>• Then turn it on for the billing team.<br>• Deploy only with the user's approval. | all |

## 6. Open questions for the user and Arleen

**Licences and setup**

1. **RingEX or RingCX for billing calls?** Do billing staff make these calls from the RingEX app, or as RingCX agents?
   - ACE webhooks work for both.
   - RingCX's own summary API is poll-only.
   - If both are used, we build the RingEX path first.
2. **ACE add-on.** Is it bought, or will it be?
   - It is about $60/user/month list price and still beta.
   - Which billing users would get it?
   - Is it included in any bundle the firm already has? **(unconfirmed)**
   - Without ACE we can still do step 4 (No answer, call counts, who called), but there are no summaries.
3. **Automatic recording.**
   - Does the firm's RingEX plan include it? **(unconfirmed)**
   - Can it be turned on for billing extensions only?
   - ACE only works on recorded calls.
4. **Integration user.** Who creates it (a RingCentral admin), and with which roles? It needs to read company call logs and recordings.
5. **AI Notes.** Turn it on for billing users? It adds `CallNotes` to the summary.

**Which calls count**

6. **Which lines and users?** List the billing extensions (and the RingCX queue if used).
7. **Inbound calls.** Should a client calling *in* to billing count as a follow-up contact?
8. **No answer.** What counts as "No answer"? RingCentral `missedCall`, a voicemail, under N seconds talk time?
9. **Language.** Are many calls in Spanish (or other languages)? Check whether ACE transcribes and summarizes them well before relying on it.

**Consent, recording and privilege**

10. **Recording consent.** NY is a one-party consent state, but clients may live in all-party consent states (e.g. CA, FL, PA, WA). Use a recorded announcement ("this call may be recorded") on billing lines? Who signs off: an attorney at the firm?
11. **Privilege and retention.**
    - Billing calls can touch case details. Is it acceptable for RingCentral to store recordings and transcripts (90 days and 1 year)?
    - Should the app store only the summary? This plan recommends only the summary.
12. **Outside AI vendor.** If ACE's summary is not enough to pull out the date and amount, is sending call summaries to another AI vendor (for example the Claude API) allowed? Or should we stay with rules plus billing confirmation?

**Rules (Arleen and Jhovanny)**

13. **Outcome rules.** Should the AI write directly to the row after a trial, or always wait for billing to accept?
14. **Next-date rules.** Next follow-up date for each outcome; and what happens when a promise date passes unpaid (`checkPromisesCron` marks it broken: should that put the row back to call?).
15. **Unmatched calls.** Who works the "Unmatched calls" list?

## 7. Not in scope

- Payments and "paid" status: these stay with MyCase.
- Texting (SMS) and video meetings.
- Changing anything in the `mycase-rebuild` database.
