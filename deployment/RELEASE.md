# NutriLog upgrade release

- Live app: https://nutrilog-diet-ai.vercel.app/
- Repository: https://github.com/jitesh523/nutrilog_2.0
- Application commit: `19cb8f7`
- Deployment: `dpl_13YYYXjtv9t7mbwUviJcwnPXffRC`
- Immutable URL: https://nutrilog-diet-mh1jmyvzb-jitesh523s-projects.vercel.app
- Environment: production, `jitesh523s-projects` / `nutrilog-diet-ai`
- Status: READY, promoted after staged verification
- Released: 2026-10-09 (Asia/Kolkata)

## What changed

Add Meal now supports previewing and copying an entire logged day, account-owned day templates, and photo estimates. Repeat and photo tools expand on demand to keep the phone screen compact. Photo estimates expose editable foods, grams and macros; changing portions scales nutrition. Applying a photo or coach suggestion opens the meal editor and never saves a meal automatically.

The app now caches its public shell with a service worker. Private API snapshots and a durable meal outbox use IndexedDB, scoped to the authenticated account. Queued meals retain their original date for up to 30 days and stay separate from saved totals. Reconnecting verifies the session before upload. Each new meal gets a fresh request ID; a retry retains that ID. Server receipts prevent duplicate saves and deleted-meal resurrection. IndexedDB queue changes are atomic, and late responses cannot cross account cache boundaries. Logout clears cached views and keeps pending meals for the same account; account deletion clears its local outbox.

Coach replies stream from Groq and persist only after generation and database commit. Failed or interrupted replies retain the user’s message for retry. Follow-up memory, account isolation and concurrent-clear protections remain intact. Each saved assistant message offers an editable meal draft. Progress includes a saved AI weekly review using only logged days, their saved targets and preferences. Missing days remain unknown and source changes invalidate an old review.

Groq vision uses `qwen/qwen3.8-27b` by default. Photo completion requests use a 900-token budget to fit the configured account’s provider limits. Images are resized and re-encoded in the browser, explicitly submitted, validated on the server, and kept out of database/offline storage.

## Verification

**Story:** A signed-in person can repeat a day, log during an outage and reconnect, discuss meals with a streaming coach, review a suggested meal draft, generate a weekly review and confirm/edit a photo estimate before saving.

- **Automated checks:** The full isolated PostgreSQL/API run passed 28 tests. After the browser found an inherited request-ID issue in reused meals, the fix passed client/offline regression checks and the final local suite passed 23 tests with one optional PostgreSQL-only test skipped in that local invocation. Earlier PostgreSQL checks covered storage transactions, quotas, authentication, plans, chat and every new API. All test schemas were removed.
- **Browser:** Safari desktop and 390 × 844 responsive viewport checks covered navigation, day-copy review/save and the phone coach composer with a real Groq reply. With the local server stopped, a reused meal stayed in the device outbox across a full reload. Restoring the server and retrying uploaded it once, cleared the outbox and updated totals. Expired-session handling preserved pending meals, and another account could not see the first account’s outbox. A physical phone keyboard and OS installation were not tested.
- **AI drafts:** Client checks verified that changing grams scales item macros and applying the draft only fills the editor. API checks verified that estimation does not add a meal, and account exports/deletion include the new account-owned data.
- **Exact staged deployment:** Twelve core assets matched local bytes; health returned 200 and backend source/credentials returned 404. Hosted template ownership, day copy, original-date offline replay and idempotent retries passed.
- **Real hosted AI:** Weekly review persisted for two logged days. SSE deltas arrived before the final saved event (244 ms observed gap). A follow-up recalled the nickname from the previous turn. A coach suggestion produced a four-item editable meal draft without changing the meal log. Vision correctly returned no foods for a brand icon; recognizable-food estimates and portion editing were checked with controlled provider fixtures. Nutritional accuracy was not independently measured.
- **Production promotion:** Live dashboard, upgraded scripts, service worker and manifest matched the tested files. Database health passed and `/sw.js` returned `Cache-Control: no-cache`.
- **Build:** Production build copied 22 public assets. JavaScript syntax, whitespace checks and npm audit passed (zero reported vulnerabilities at install).
- **Publication:** Pushed to `jitesh523/nutrilog_2.0`; GitHub’s contributor API returned only `jitesh523`.

## Monitoring

Server logs record request IDs, failed/slow responses and duration. Client reports contain fixed error categories and page names, with per-account limits; no entered text or exception stacks are sent. The staged deployment’s HTTP-500 scan returned no failures.

The Production health GitHub Actions workflow checks the live app/database every 30 minutes, with retries and a manual trigger. Alerts follow the owner’s GitHub notification settings. Scheduled execution can be delayed by GitHub. Manual release verification run: https://github.com/jitesh523/nutrilog_2.0/actions/runs/37828806134

## Backups and recovery

The existing Neon database is connected and available on its Free plan. A consistent live snapshot of app state and quota records was encrypted with AES-256-GCM, written outside the repository with private file permissions, decrypted and compared with the captured snapshot. The key is stored separately from the backup. The backup utility’s tests reject the wrong key and tampered ciphertext. `scripts/backup.js verify` checks decryption and structure without writing to the database.

This is a verified manual snapshot, not a scheduled backup service or a completed database restore drill. Neon’s automatic point-in-time recovery window could not be inspected: its console requires email verification to link the existing Vercel Marketplace identity. No provider plan, billing or recovery settings were changed. Complete that verification before relying on a specific automatic recovery window.

## Existing behavior retained

Recovery codes remain the password-reset method; email resets are not configured. Existing meals, accounts, saved goals, plans, preferences, weight check-ins and chat remain in the same persistent database. Keys stay server-side.
