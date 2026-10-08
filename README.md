<p align="center">
  <img src="docs/assets/readme-banner.svg" alt="NutriLog — Fuel the work. Build the habit." width="100%" />
</p>

<p align="center">
  <strong>Your meals. Your goals. A coach in your corner.</strong><br />
  Track your nutrition and build stronger everyday habits, one meal at a time.
</p>

<p align="center">
  <a href="https://nutrilog-diet-ai.vercel.app/">Open NutriLog ↗</a>
  · <a href="#quick-start">Run locally</a>
  · <a href="#ai-coach">Meet the coach</a>
  · <a href="https://github.com/jitesh523/nutrilog_2.0/issues">Report an issue</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/JavaScript-Vanilla-d7f77d?style=flat-square&labelColor=191c17" alt="Vanilla JavaScript" />
  <img src="https://img.shields.io/badge/Node.js-20.12%2B-d7f77d?style=flat-square&labelColor=191c17" alt="Node.js 20.12 or newer" />
  <img src="https://img.shields.io/badge/Storage-PostgreSQL-a5d5d1?style=flat-square&labelColor=191c17" alt="PostgreSQL storage" />
  <img src="https://img.shields.io/badge/AI-Groq-c5baea?style=flat-square&labelColor=191c17" alt="AI powered by Groq" />
  <img src="https://img.shields.io/badge/Hosted_on-Vercel-f2f3e9?style=flat-square&labelColor=191c17" alt="Hosted on Vercel" />
</p>

---

## Built for the daily routine

NutriLog brings meal logging, nutrition targets, progress tracking and conversational AI into a charcoal-and-lime interface with a gym-inspired feel. It works with familiar foods and household portions, so your routine can include dal and roti, chicken and rice, or whatever fuels your day.

| Feature | What you can do |
| --- | --- |
| **Daily dashboard** | Follow calories, protein, carbs and fat against your saved targets. |
| **Flexible meal logging** | Add, edit and reuse meals, save favourites, and adjust serving sizes. |
| **Food estimates** | Use the built-in calculator or describe a meal for an editable AI estimate. |
| **Personal diet plans** | Build and save a plan, apply its targets, or set your own goals. |
| **Progress tracking** | Review weekly logging consistency, logged-day averages and weight check-ins. |
| **AI nutrition coach** | Discuss meals, compare food swaps and ask follow-up questions with saved history. |
| **Food preferences** | Save diet, cuisine, allergies, budget and cooking-time preferences for the coach. |
| **Account controls** | Change your password, use recovery codes, export your data or delete your account. |
| **Phone-friendly experience** | Use bottom navigation, a full-screen coach chat and home-screen app icons. |

Missing logs are shown as **Not logged**. An unfinished day is treated as incomplete data, so progress summaries use the days you actually logged.

## Quick start

**Requires Node.js 20.12+ and npm.**

```sh
git clone https://github.com/jitesh523/nutrilog_2.0.git
cd nutrilog_2.0
npm ci
cp .env.example .env
npm start
```

Open **[http://127.0.0.1:4000](http://127.0.0.1:4000)** and create an account.

For AI features, add your Groq API key to `.env` before starting the server. Without a key, manual logging and the built-in food calculator remain available. Local development uses the ignored `data/app-data.json` file when no database URL is configured.

### Configuration

| Variable | Purpose | Required? |
| --- | --- | --- |
| `GROQ_API_KEY` | Server-side key for meal estimates and coaching | For AI features |
| `GROQ_MODEL` | Groq model; defaults to `openai/gpt-oss-20b` | No |
| `DATABASE_URL` | PostgreSQL connection string | On Vercel |
| `POSTGRES_URL` | Fallback when `DATABASE_URL` is absent | No |
| `ADMIN_EMAIL` | Email eligible for hosted administrator access | No |
| `PORT` | Local port; defaults to `4000` | No |
| `HOST` | Local bind address; defaults to `0.0.0.0` | No |
| `DATA_DIR` | Local file-storage directory; defaults to `data/` | No |

Keep credentials in `.env` or your hosting provider's environment settings. Commit only the empty `.env.example` template. Existing environment variables take precedence over `.env` values.

## Your first session

1. **Create an account** and save your one-time recovery code privately.
2. **Set your targets** in Diet Plan, or save custom calorie and macro goals.
3. **Log a meal** using the calculator, manual values or an AI estimate. Review portions before saving.
4. **Ask the coach** about that meal or an easy improvement for your next one.
5. **Build consistency** by returning to your log and adding weight check-ins when useful.

Meals, plans, preferences, goals and check-ins are saved to your account. Local accounts and data are separate from the hosted app.

## AI coach

Click the animated blue coach in the bottom-right corner, choose **Chat with coach**, or use **Ask coach** on a logged meal.

Try asking:

> “Was my lunch balanced?”
>
> “What could I add to get more protein?”
>
> “Suggest a quick dinner using my preferences.”

The coach uses your selected day's log and targets, saved preferences, up to seven recent logged days, and the latest 12 prior chat messages. Your latest 60 messages are saved to your account across sessions and devices.

| Desktop | Phone |
| --- | --- |
| Compact floating chat | Full-screen chat with keyboard-aware sizing |
| **Enter** to send; **Shift + Enter** for a new line | **Return** for a new line; tap **Send** to submit |
| Close with **×** or **Escape** | Close with **×** |

Drafts remain when you close chat. A green dot marks a reply received while it was closed. Failed replies can be retried, and **New chat** asks for confirmation before clearing the conversation.

Requests run through the backend using [Groq Chat Completions](https://console.groq.com/docs/text-chat). Account records, passwords, recovery hashes, emails and session tokens are excluded from the context assembled by the server. Meal descriptions, preferences and messages you enter are sent to Groq when relevant to an AI request. Requests require authentication, are limited to six per user per minute, and time out after 25 seconds.

Nutrition values and AI suggestions are estimates. Review portions, ingredients and allergy information; the coach does not automatically change your meals or goals.

## Add NutriLog to your home screen

- **iPhone:** Open the live app in Safari, then choose **Share → Add to Home Screen**.
- **Android:** Open the live app in your browser, then choose **Install app** or **Add to Home screen**, depending on the browser.

The manifest includes branded icons, a maskable icon, an Apple touch icon and standalone display settings. The app launches at the dashboard and redirects signed-out visitors to sign in. Meal syncing and AI require an internet connection; offline storage is not included.

## Account recovery and data

New accounts receive a recovery code **once** after signup. Existing users can generate one in **Settings → Password & recovery** using their current password. Save the code privately or download it from the app.

Use **Forgot password?** with your email, recovery code and a new password. Recovery consumes the code and invalidates existing sessions. After signing in, generate a replacement. Generating a new code or changing your password also replaces the old code. Only a SHA-256 hash of the recovery code is stored, and failed attempts are limited to five per email in 15 minutes.

Email reset links are not configured. If both the password and recovery code are lost, this version has no self-service recovery option. Settings also provides JSON data export and account deletion; saved conversations are included in both flows.

## Under the hood

The frontend uses plain HTML, CSS and JavaScript. A Node.js HTTP backend handles authentication, saved nutrition data and Groq requests. Vercel serves static assets and forwards API requests to the serverless adapter.

```mermaid
flowchart LR
    App[Browser / installed web app] --> API[Node.js API]
    API --> Store[(PostgreSQL on Vercel)]
    API --> Local[(JSON file in local development)]
    API --> Groq[Groq · estimates and coach]
```

| File or directory | Responsibility |
| --- | --- |
| `index.html`, `dashboard.html`, `styles.css` | Authentication, dashboard and responsive styling |
| `app.js`, `product.js`, `ai-client.js` | Navigation, meal/account flows and coach chat |
| `nutrition.js`, `planner.js` | Nutrition calculations and plan generation |
| `server.js`, `features.js` | HTTP API, authentication and saved app features |
| `ai.js`, `chat.js` | Groq integration, conversation context and persistence |
| `storage.js` | Local JSON storage and PostgreSQL transactions |
| `manifest.webmanifest`, `icons/` | Home-screen identity and app icons |
| `api/index.js`, `vercel.json`, `scripts/build.js` | Vercel routing and public asset build |
| `tests/` | API, storage, calculations and client-flow tests |

<details>
<summary><strong>Storage and deployment notes</strong></summary>

PostgreSQL tables initialize automatically. App state currently lives in a JSONB document protected by row locks, while AI quotas are shared across instances. Chat generation happens outside the app-wide write transaction; the session and conversation are revalidated before saving a reply. Request IDs make retries idempotent, and a delayed reply cannot restore a cleared conversation.

This storage design suits a small deployment. Higher traffic should move users, meals and check-ins into indexed relational tables. Local file storage is refused on Vercel, where a persistent database is required.

Applying a plan saves its goals in the same transaction. Custom goals replace the calculated plan, historical days retain saved goal snapshots, and clearing a plan keeps the last targets until edited. Older browser-only plans can be imported explicitly in Settings.

</details>

## Development checks

```sh
npm test       # API, storage, nutrition and client-flow checks
npm run build  # Copy approved frontend assets into public/
```

Tests use disposable data directories and mock Groq. They cover account isolation, recovery, meal editing, saved meals, plans, preferences, check-ins, chat history/retries/concurrent clears, mobile chat state and Vercel routing. Client tests use JSDOM; visual checks in real browsers are still useful.

Optional PostgreSQL integration tests require **separate disposable test databases**:

```sh
TEST_DATABASE_URL=postgresql://.../storage_test \
TEST_API_DATABASE_URL=postgresql://.../api_test \
TEST_CHAT_DATABASE_URL=postgresql://.../chat_test \
TEST_FEATURE_DATABASE_URL=postgresql://.../features_test npm test
```

These tests create and modify tables. Do not point them at production data.

## Deploy to Vercel

1. Import this repository into the intended Vercel project, or link it with the Vercel CLI.
2. Configure `DATABASE_URL` (or `POSTGRES_URL`) with persistent PostgreSQL storage.
3. Add `GROQ_API_KEY` as a sensitive environment variable. Set `GROQ_MODEL` and `ADMIN_EMAIL` if needed.
4. Use the included `vercel.json`: build command **`npm run build`**, output directory **`public`**, and no framework preset.
5. Run the checks, deploy, and verify sign-in, meal saving and coach replies on the hosted app.

For a staged production release with an authenticated Vercel CLI:

```sh
vercel deploy --prod --skip-domain
# Verify the exact deployment, then promote it:
vercel promote <deployment-url-or-id>
```

The build copies only approved frontend assets. Backend source, `.env` and local user data are excluded from public assets. `.vercelignore` keeps local credentials and data out of deployment uploads. See [the release report](deployment/RELEASE.md) for the most recently recorded deployment checks.

## Contributing

Open an issue with the steps to reproduce a bug or a concrete feature idea. For code changes, keep the scope focused, run the relevant checks and include screenshots when changing the interface. Never include API keys, account exports or private meal logs in issues or pull requests.

Originally based on [aahlad123/diet](https://github.com/aahlad123/diet). Current development lives at [jitesh523/nutrilog_2.0](https://github.com/jitesh523/nutrilog_2.0).
