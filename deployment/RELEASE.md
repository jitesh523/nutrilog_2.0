# NutriLog routines and progress release

- Live app: https://nutrilog-diet-ai.vercel.app/
- Repository: https://github.com/jitesh523/nutrilog_2.0
- Application commit: `b811c2f`
- Deployment: `dpl_9UPEw4n3U2MSeQpduLQVu8vKvvWa`
- Immutable URL: https://nutrilog-diet-kad4ftvb1-jitesh523s-projects.vercel.app
- Environment: production, `jitesh523s-projects` / `nutrilog-diet-ai`
- Status: READY; promoted after hosted verification
- Released: 2026-10-09 (Asia/Kolkata)

## What changed

Guided setup saves a chosen focus, editable targets and food preferences together. A dashboard checklist leads into logging the first meal, and Settings can reopen setup. Changing numerical targets clears the old calculated plan; saving unchanged targets preserves it. Focus labels do not invent personalized calorie targets. Late initial responses cannot overwrite a newly saved setup or recipe list.

Add Meal has a saved recipe library with ingredients, recipe yield and whole-recipe nutrition. Selecting portions scales an editable meal draft. Diet Plan has a weekly menu and an ingredient shopping list with persisted checks and text export. Planning and reviewing portions do not log meals automatically. Recipe access, menus, setup and shopping state belong to the signed-in account and are included in account exports/deletion. Retried menu requests are idempotent. Changing ingredient quantities invalidates old checkmarks, and stale shopping updates are rejected.

Progress switches between 7 and 30 days and compares the selected period with the immediately preceding period. Averages use only logged days, missing days remain unknown, and empty comparisons show no invented change. Weight charts follow the selected period.

Phone changes include keyboard-aware setup dialogs, safe-area spacing, 44px controls, 16px form text and compact recipe/menu layouts. The coach preserves reading position while replies stream and provides a Latest reply button. Vertical scrolling cannot trigger meal deletion swipes; pull-to-refresh ignores dialogs and interactive controls. Web fonts load without blocking the first paint. The service worker shell includes the new public scripts; setup and recipes can use existing account-scoped offline snapshots.

## Verification

**Story:** A signed-in person completes setup, saves a recipe, reviews a scaled portion, plans meals without logging them, checks their shopping list and compares logged progress across periods.

- Full isolated PostgreSQL/API suite: **33/33 passed**, covering storage, authentication, plans, chat, account ownership and routine APIs. All temporary verification schemas were removed.
- Final client/offline/routines regressions: **7/7 passed**, including actual setup and recipe forms, editable portions, menu/shopping interactions, period switching, offline account boundaries and stale-response protections.
- Safari at **390 × 844**: setup steps/save and dashboard loading were checked. Recipe layout and native field validation were inspected. A fresh local origin loaded the completed dashboard with no console errors. Remaining browser rechecks stopped when the Mac locked. A physical phone keyboard, camera and OS installation were not tested.
- Build copied **24 public assets**. JavaScript syntax, whitespace and tracked-source credential scans passed.
- Exact staged verification passed for eleven changed/core assets against local bytes, health/database access, authenticated setup/recipes/menu/shopping, idempotent retries, account isolation, stale-list rejection and exports. Disposable release accounts were removed after the checks.
- Groq integration is unchanged from the preceding release; its real streaming, follow-up and editable draft checks remain recorded in Git history.

- Promotion: live dashboard, routines, progress, styles, coach, service worker and manifest matched the tested release. Database health returned 200; the service worker returned `Cache-Control: no-cache`. The staged deployment HTTP-500 log scan returned no failures.

## Scheduled backups and restore drill

The **Encrypted nightly backup** GitHub Actions workflow runs at **21:37 UTC / 03:07 IST**, with a manual trigger and **14-day artifact retention**. GitHub may delay scheduled runs. A dedicated database role has read access to app-state and AI-usage tables, with no update/delete/create privileges. Credentials and the AES-256-GCM key are protected environment secrets restricted to the main branch. Only encrypted `.nlog` snapshots are uploaded; temporary runner files are removed.

First successful workflow: https://github.com/jitesh523/nutrilog_2.0/actions/runs/37957948620

Its downloaded encrypted artifact passed authentication, decryption and structural verification. An actual restore drill created a new isolated database schema, restored app state and quota rows, compared them exactly, then removed that schema. Live application tables were not replaced. A separate local snapshot also passed this drill. The key is stored separately from local backups, outside the repository. Nightly runs create and verify snapshots; drills are an explicit maintenance command, not part of every nightly run.

Neon point-in-time recovery settings still require console email verification and were not changed. The workflow does not establish a specific provider recovery window. Recovery codes remain the password-reset method.

## Monitoring and publication

The existing Production health workflow checks app/database health every 30 minutes. Runtime logs retain request status/duration; entered text and credentials are excluded from client reports. Source is published to `jitesh523/nutrilog_2.0`; GitHub's contributor API returned only `jitesh523`.
