# Family Budget Bot — Claude Code Build Brief
**Lizaveta & Edgar · June 2026 · v1.0**


---

## 1. Project overview

Build a personal family budget management system for two people (Lizaveta and Edgar) using a customised 6 Jars budgeting method. The system has two platforms that share one database:

- A **Telegram bot** — for quick daily expense logging and balance checks only
- A **web application** — for the dashboard, configuration, history, and reporting

Lizaveta is the admin user. Edgar is the second user. The app is self-hosted and private — just for the two of them.

---

### 1.1 Tech stack — use exactly these technologies

> ⚠️ Do not choose alternatives. Use exactly what is listed here.

| Layer | Technology |
|---|---|
| Backend language | Node.js with TypeScript |
| Backend framework | Express.js |
| Database | SQLite (single file, zero config — perfect for self-hosted) |
| ORM | Prisma (manages the database schema and queries) |
| Authentication | JWT tokens stored in HTTP-only cookies |
| Telegram bot library | Grammy (modern Telegram bot framework for Node.js) |
| Web frontend | React with Vite |
| Frontend styling | Tailwind CSS |
| Scheduled jobs | node-cron (for monthly reset and reminders) |
| Email (password reset) | Nodemailer with SMTP |
| Exchange rates | NBP API for PLN/USD and PLN/EUR; manual entry for BYN |
| Monorepo structure | Three folders: /api, /bot, /web — sharing the same Prisma database |

---

### 1.2 Project folder structure

```
FamilyBudget/
  /api                  ← Backend (Express + Prisma)
    /src
      /routes           ← API endpoints
      /services         ← Business logic
      /jobs             ← Cron jobs (reset, reminder)
      /middleware
    /prisma
      schema.prisma
    .env
  /bot                  ← Telegram bot (Grammy)
    /src
      index.ts
      handlers.ts
  /web                  ← React frontend (Vite + Tailwind)
    /src
      /pages
      /components
    index.html
  package.json          ← Root package.json with workspaces
```

---

### 1.3 Environment variables

Create a `.env` file in `/api` with these variables:

```
# Telegram
TELEGRAM_BOT_TOKEN=8935457147:AAGfNBW5Lf90QplDe-K9aJ06yVJ7OIk3kQg

# Database
DATABASE_URL="file:./dev.db"

# Auth
JWT_SECRET=change_this_to_a_long_random_string_at_least_32_chars

# Web app URL (used in Telegram messages)
WEB_APP_URL=http://localhost:5173

# Email (for password reset) — fill in your SMTP details
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Uncategorised reminder threshold (days)
UNCATEGORISED_REMINDER_DAYS=3
```

---

## 2. Budget model — the core logic

This is the most important part. Every calculation in the app flows from this model. Implement this exactly.

### 2.1 How each person's budget is calculated

Run this calculation independently for each person every time the dashboard loads:

1. **Start with income:** use netto if entered for this month. If not, use previous month's netto. If no history at all (first ever use), use brutto.
2. **Subtract 50% of total household overheads** (each person always pays exactly half).
3. **Subtract this person's personal deductions only** (the other person's deductions are invisible to this calculation).
4. **Result = discretionary amount.**
5. **For each shared jar:** apply that jar's % to the discretionary amount. This is this person's contribution to that jar.
6. **Personal jar balance** = discretionary amount minus the sum of all jar contributions.

### 2.2 Shared jar balances

```
Shared jar balance = (Lizaveta's contribution + Edgar's contribution) - total spending from that jar + carry-forward from previous month
```

Both people spend freely from shared jars. There are no individual spending caps within a shared jar.

### 2.3 The jars

| Jar | Type | Default % |
|---|---|---|
| Food | Fixed household overhead — 2000 PLN/month total (1000 each). Also a jar for spend tracking. | Fixed |
| Eating Out | Shared jar — % of each person's discretionary | 5% |
| Health & Beauty | Shared jar — % of each person's discretionary | 2.5% |
| Entertainment | Shared jar — % of each person's discretionary | 2.5% |
| House | Shared jar — % of each person's discretionary | 2.5% |
| Safety | Shared jar — % of each person's discretionary | 5% |
| Vacation | Shared jar — % of each person's discretionary | 5% |
| Personal | Private per person — the remainder after all jar contributions. Never visible to the other person. | Remainder |

### 2.4 Lizaveta's personal deductions (pre-configure at setup)

- University savings: 300 PLN/month
- IKZE: 200 PLN/month

Edgar has no personal deductions currently. Both users can manage their own deductions from the Budget screen.

---

## 3. Database schema (Prisma)

Build this exact schema in `prisma/schema.prisma`.

### Users
- `id` — auto-increment integer, primary key
- `name` — string
- `email` — string, unique
- `passwordHash` — string
- `role` — enum: ADMIN, USER
- `telegramId` — string, nullable, unique — set when user links Telegram account
- `telegramLinkCode` — string, nullable — one-time code for linking
- `createdAt` — datetime

### Income
- `id` — auto-increment
- `userId` — foreign key → User
- `month` — string, format YYYY-MM (e.g. `2026-06`)
- `brutto` — decimal — current brutto for this person
- `netto` — decimal, nullable — null until user enters it
- `bruttoHistory` — JSON — array of `{ previousValue, newValue, effectiveDate, reason }` objects
- `createdAt`, `updatedAt` — datetime

### Overheads
- `id`, `name` — string, `amountPln` — decimal
- `isOneOff` — boolean, default false
- `active` — boolean, default true
- `createdAt`, `updatedAt`

### Jars
- `id`, `name` — string
- `percent` — decimal (e.g. 5.0 for 5%)
- `status` — enum: ACTIVE, ARCHIVED
- `archivedAt` — datetime, nullable
- `isPersonal` — boolean — true only for the Personal jar
- `isFood` — boolean — true only for the Food jar

### Expenses
- `id`, `userId` — foreign key → User
- `jarId` — foreign key → Jar, **nullable** — null = uncategorised
- `amountPln` — decimal — always stored in PLN
- `originalAmount` — decimal — the amount in the original currency
- `originalCurrency` — enum: PLN, USD, EUR, BYN
- `exchangeRate` — decimal, nullable — rate used at time of entry
- `isManualRate` — boolean, default false
- `description` — string, nullable
- `date` — date — the date of the expense (not necessarily today)
- `createdAt`, `updatedAt`

### PersonalDeductions
- `id`, `userId` — foreign key → User
- `name` — string, `amountPln` — decimal
- `isOneOff` — boolean, default false
- `active` — boolean, default true
- `createdAt`, `updatedAt`

### MonthlySnapshots
- `id`, `month` — string YYYY-MM
- `snapshotData` — JSON — full pre-reset summary for both users
- `carryForwards` — JSON — per-jar carry-forward amounts
- `foodOverspend` — decimal — amount rolled into next month's food overhead
- `createdAt`

### JarCarryForwards
- `id`, `jarId` — foreign key → Jar
- `month` — string YYYY-MM
- `amount` — decimal — positive = surplus, negative = deficit

### UncategorisedReminders
- `id`, `userId` — foreign key → User
- `sentAt` — datetime
- `expenseCount` — integer — how many uncategorised expenses triggered this reminder

---

## 4. API endpoints

All endpoints except `/auth/login` are protected by JWT middleware. Admin-only endpoints must return 403 for non-admin users. Personal jar data must be filtered server-side to only return the requesting user's own data.

### 4.1 Auth
- `POST /api/auth/login` — body: `{ email, password }` → sets JWT cookie
- `POST /api/auth/logout` — clears cookie
- `POST /api/auth/reset-password/request` — body: `{ email }` → sends reset email
- `POST /api/auth/reset-password/confirm` — body: `{ token, newPassword }`

### 4.2 Budget & dashboard
- `GET /api/dashboard` — returns full calculated dashboard state for the requesting user: income breakdown, all shared jar balances, own personal jar balance, uncategorised count, netto warning state
- `GET /api/budget/summary` — both users' income side by side, overheads, own deductions (for Budget screen)

### 4.3 Income
- `POST /api/income/netto` — body: `{ month, netto }` — user enters their own netto for this month
- `GET /api/income/history/:userId` — brutto change history (admin only for other user)
- `POST /api/income/brutto` — body: `{ userId, newBrutto, reason }` — admin only, records change with effective date of next month's 1st

### 4.4 Expenses
- `POST /api/expenses` — body: `{ amountPln, originalAmount, originalCurrency, exchangeRate, isManualRate, jarId, description, date }`
- `PATCH /api/expenses/:id` — edit own expense (all fields including jar reassignment)
- `DELETE /api/expenses/:id` — delete own expense
- `GET /api/expenses` — query params: `jarId`, `userId`, `dateFrom`, `dateTo`, `minAmount`, `maxAmount`, `currency`, `sort`, `uncategorised=true`

### 4.5 Jars
- `GET /api/jars` — all active jars with current balances
- `POST /api/jars` — create jar (admin only)
- `PATCH /api/jars/:id` — update name or percent (admin only)
- `POST /api/jars/:id/archive` — admin only; stops accepting expenses immediately
- `POST /api/jars/:id/restore` — admin only
- `DELETE /api/jars/:id` — admin only; only permitted if zero transaction history
- `GET /api/jars/archived` — list archived jars with metadata

### 4.6 Overheads & deductions
- `GET /api/overheads` — list all active overheads
- `POST /api/overheads`, `PATCH /api/overheads/:id`, `DELETE /api/overheads/:id` — admin only
- `GET /api/deductions` — own deductions only
- `POST /api/deductions`, `PATCH /api/deductions/:id`, `DELETE /api/deductions/:id`

### 4.7 Exchange rates
- `GET /api/rates` — returns current PLN/USD and PLN/EUR rates (fetched from NBP, cached)
- `POST /api/rates/manual` — body: `{ currency, rate }` — manual override

**NBP API endpoint:** `https://api.nbp.pl/api/exchangerates/rates/a/{currency}/`

**BYN rule:** NBP does not carry BYN. Always require manual rate entry for BYN — never attempt to auto-fetch it.

**Fetch failure rule:** If NBP fetch fails for USD or EUR, block entry and require manual rate. No silent fallback for any currency.

### 4.8 Telegram account linking
- `POST /api/account/telegram/generate-code` — generates a 6-digit one-time code, stores in `User.telegramLinkCode`
- `POST /api/account/telegram/confirm` — called by the bot when a user sends the code; links their Telegram ID to the account

### 4.9 History & reporting
- `GET /api/history` — filterable transaction log (same filters as GET /api/expenses)
- `GET /api/snapshots` — list of monthly snapshots
- `GET /api/snapshots/:month` — full snapshot for a specific month

---

## 5. Critical business logic rules

Implement all of these exactly.

### 5.1 Income fallback chain
- If netto is entered for this month → use netto
- Else if previous month has a netto → use that, mark as **"Estimated"** in the UI
- Else (first ever use, no history) → use brutto, mark as **"Based on brutto (first month)"**

The dashboard must show which figure is active for each person and allow them to enter their own netto inline.

### 5.2 Exchange rates
- PLN/USD and PLN/EUR: fetch from NBP API. Cache the result for the session.
- BYN: never auto-fetch. Always block entry and require manual rate.
- If NBP fetch fails for USD or EUR: block entry and require manual rate. No silent fallback.
- Store `originalAmount`, `originalCurrency`, `exchangeRate`, and `isManualRate` on every non-PLN expense.

### 5.3 Monthly reset — runs automatically on the 1st of each month at 00:01

1. Take a snapshot of the current month's state before making any changes.
2. Calculate carry-forwards for every jar: surplus = positive, deficit = negative.
3. Check food spending. If total food expenses > 2000 PLN, add the excess to next month's food overhead amount.
4. Save current netto values as "previous month netto" for the fallback chain.
5. Deactivate any one-off overheads and deductions.
6. Send a Telegram notification to both users listing only jars with non-zero carry-forwards.

### 5.4 Jar archiving rules
- Archived jar stops accepting new expenses **immediately**
- Its % contribution drops to 0 from the **next** monthly reset
- Remaining balance carries to Personal jar at next reset (not immediately)
- All historical transactions remain in history — never deleted
- Admin can restore archived jars; they resume from next reset with their previous %
- Permanent delete only allowed if the jar has zero transaction history

### 5.5 Uncategorised expenses
- Expenses with no jar assigned are stored with `jarId = null`
- They do not affect any jar balance until a jar is assigned
- After 3 days without a jar, send one Telegram reminder (once per batch, not per expense)
- The 3-day threshold comes from `UNCATEGORISED_REMINDER_DAYS` env variable
- Reminder stops when all expenses in that batch have a jar assigned

### 5.6 Privacy enforcement — must be at the data layer, not just the UI
- Personal jar expenses: API must only return expenses where `userId` = requesting user. Never expose another user's Personal jar data.
- Personal deductions: same — only return own deductions.
- Shared jar expenses: both users can see all transactions.

### 5.7 Dashboard recalculation
- Recalculate on every page load — not real-time.
- After any action that changes balances (expense saved, netto entered, overhead changed, jar archived): show a toast with a **Reload** button. The toast stays until dismissed.

### 5.8 No session expiry
- JWT tokens do not expire.
- Users stay logged in permanently.
- Password reset via email only.

---

## 6. Web application screens

Desktop-first layout. Mobile-responsive is not required in this version.

Navigation bar always visible: **Dashboard · Jars · Budget · History · Account**

### 6.1 Login screen (`/login`)
- Email and password fields
- Error message on failure: `"Wrong email or password."`
- No registration screen — accounts are created by the database seed
- Password reset link → triggers reset email

### 6.2 Onboarding (`/onboarding`) — admin only, triggered on first login

A linear 5-step wizard. Progress indicator at top (e.g. "Step 2 of 5"). No skipping required steps.

Edgar sees a holding screen: *"Setup in progress. You'll get access once Lizaveta completes setup."*

- **Step 1 — Lizaveta's income:** brutto (required), netto this month (optional, skippable)
- **Step 2 — Edgar's income:** same pattern
- **Step 3 — Household overheads:** Food pre-filled at 2000 PLN (required, editable), add more if needed. At least food required to proceed.
- **Step 4 — Lizaveta's personal deductions:** pre-fill with University savings 300 PLN + IKZE 200 PLN (all editable/removable). Fully skippable.
- **Step 5 — Jar allocations:** all jars listed, all % fields empty, running total shown ("Total allocated: 0% of discretionary"). No validation block on 0%.
- Final button: **"Go to Dashboard"**

### 6.3 Dashboard (`/`)

Panels in this order from top to bottom:

1. **Reset summary card** — only visible after monthly reset, until manually dismissed. Shows only jars with non-zero carry-forwards. Example: *"January wrapped. Vacation +120.00 PLN carried forward · Eating Out −45.00 PLN carried forward."*
2. **Netto warning** — shown as an `"Estimated"` tag inline on the income strip when active. Tapping it opens an inline input (not a modal) to enter netto. Tag disappears after saving.
3. **Uncategorised prompt** — *"3 expenses need a jar →"* — only shown when uncategorised expenses exist. Links to History filtered to uncategorised.
4. **Income strip** — compact, collapsed by default. Shows both people's income side by side. Expandable to show full calculation breakdown: brutto → overheads → deductions → discretionary.
5. **Shared jar cards** — grid, one card per active jar. Shows jar name, balance remaining, progress bar. Negative balance in red: *"−45.00 PLN over — carried to next month"*.
6. **Personal jar** — at the bottom, visually distinct. Shows own balance only. No progress bar. Not visible to the other user.

**Jar drawer:** clicking a jar card opens a panel sliding in from the right. Shows jar name, balance, %, transaction list (date / description / amount / person), + Add Expense button (pre-selects this jar), Archive jar button (admin only). Close by tapping outside or an explicit close button.

### 6.4 Add Expense modal

Triggered from the **"+ Add expense"** button (top right of dashboard) or from within a jar drawer.

**Fields:**
- Amount (required, numeric)
- Currency (PLN default — dropdown: PLN / USD / EUR / BYN)
- Jar (optional — dropdown of active jars, plus "No jar")
- Description (optional, text)
- Date (default today, editable)

**Currency states:**
- BYN selected: inline rate field appears below currency selector: *"No live BYN rate. Enter rate manually: 1 BYN = ___ PLN"*. Blocks save until entered.
- USD or EUR selected and NBP fetch failed: same pattern.

**No jar on save:** warning before saving: *"This will be saved as uncategorised. You can assign a jar later."* → **Save anyway · Go back**

**Modal behaviour:**
- Background scroll locked while open
- Clicking outside modal does nothing
- Explicit Cancel always visible
- On successful save: modal closes, toast appears

**Edit expense:** same modal, pre-filled. All fields editable. Delete button at bottom of modal.

### 6.5 Jars screen (`/jars`)

- List of active jars: name (editable inline for admin), current balance, % (editable inline for admin), Archive button
- Running % total: *"Total allocated: 22.50% of discretionary"* — updates live as values are typed
- If total > 100%: total label turns red, Save allocations button disables, inline message: *"Total exceeds 100% — your Personal jar would be negative."*
- **Archive jar:** confirmation before acting: *"Archiving Entertainment. Remaining balance of 120.00 PLN will move to your Personal jar at next reset. Past transactions stay in history."* → **Archive jar · Cancel**
- **Archived jars section** below active jars: collapsible. Shows name, month archived, historical balance, Restore button.
- **Restore confirmation:** *"Restore Entertainment? It will resume from the next reset with its previous % allocation."* → **Restore jar · Cancel**
- **Permanent delete:** only available if jar has zero transaction history. Label: **"Delete jar"**. Confirmation required.
- Edgar's view: all controls read-only.

### 6.6 Budget screen (`/budget`)

Three sections on one page, no tabs:

**Section 1 — Income**
- Two columns side by side: Lizaveta · Edgar
- Each column: brutto (admin can edit via inline expand form), netto this month (inline entry if not yet entered), discretionary amount (calculated, read-only)
- **Brutto change flow (admin only):** tapping edit expands an inline form: new brutto amount, effective date (next month's 1st, read-only), reason (optional). On save: shows *"From [Month]"* tag until it takes effect.
- **View history** link per person — opens chronological read-only list: previous brutto, new brutto, effective date, reason.

**Section 2 — Household overheads**
- Table: overhead name, monthly amount, each person's 50% share
- Admin: edit icon and delete button per row, + Add overhead button
- One-off items tagged visually
- Edgar: same table, read-only
- Changes apply from next reset. Toast: *"Saved. Changes apply from next reset."*

**Section 3 — Personal deductions**
- Each person sees **only their own deductions**. The other person's section is not rendered — not hidden, simply absent.
- Table: deduction name, amount, edit and delete per row, + Add deduction button
- Changes apply from next reset.

### 6.7 History screen (`/history`)

- Default view: all shared jar transactions, newest first, current month
- Personal transactions visible only to the owner

**Filter bar (always visible):**
- Jar (dropdown, multi-select)
- Person (Lizaveta / Edgar / Both)
- Date range (from / to, default current month)

**More filters (expandable):**
- Amount range (min / max PLN)
- Currency (PLN / USD / EUR / BYN)

**Sort options:** Date newest (default), Date oldest, Amount high-to-low, Amount low-to-high, Person

**Each row:** Date · Jar name · Description · Amount · Person. Click to open edit modal.

**Uncategorised view:** accessible via dashboard prompt or by selecting "Uncategorised" in the jar filter.

### 6.8 Account screen (`/account`)
- Display name, email
- Password reset (email-based)
- Telegram account link: shows a unique 6-digit code to send to the bot. After linking, shows "Linked as @username".

### 6.9 Toast system

All toasts appear bottom-right. Stay until dismissed or Reload tapped. **No auto-dismiss.**

| Action | Toast |
|---|---|
| Expense saved | *"Expense saved"* + Reload |
| Expense updated | *"Expense updated"* + Reload |
| Expense deleted | *"Expense deleted"* + Reload |
| Netto entered | *"Netto saved"* + Reload |
| Jar archived | *"Jar archived. Balance moves to Personal at next reset."* + Reload |
| Jar restored | *"Jar restored."* + Reload |
| Config saved (overheads, deductions, %) | *"Saved. Changes apply from next reset."* |
| Brutto updated | *"Brutto updated. Applies from [Month]."* |

### 6.10 Error states

| Situation | Message |
|---|---|
| Expense save fails | *"Couldn't save. Try again."* → Retry · Cancel |
| Rate fetch fails (any currency) | *"Couldn't fetch rate. Enter manually:"* → inline rate field |
| Login fails | *"Wrong email or password."* |
| Password reset sent | *"Check your email for a reset link."* |
| Connection lost mid-action | *"Something went wrong. Your data wasn't changed."* |

### 6.11 Number formatting — apply everywhere

- Always 2 decimal places: `1 200.50 PLN`
- Thousands separator: space
- Decimal separator: dot
- Currency label always appended: PLN, USD, EUR, BYN
- Negative amounts in red, prefixed with −: `−45.00 PLN`
- Original currency shown alongside PLN equivalent: `50.00 BYN (16.50 PLN)`

---

## 7. Telegram bot

The bot has exactly **two user-facing actions**: log an expense, and check a jar balance. Everything else is web app only.

### 7.1 User identification

The bot identifies users by their Telegram user ID, linked once via the Account screen.

If a message comes from an unlinked Telegram ID, reply: *"Link your Telegram account first at [WEB_APP_URL]/account"*

### 7.2 Expense logging — all states

**Happy path:**
- User: *"spent 45 on eating out"*
- Bot: *"45.00 PLN · Eating Out — save it?"* → **Save · Edit · Cancel** (inline keyboard)
- On Save: *"Saved ✓"*

**Ambiguous jar (not recognised):**
- Bot: *"45.00 PLN — which jar?"* → buttons for each active jar + **No jar · Cancel**
- User picks jar → confirmation → **Save · Cancel**

**No jar given:**
- Bot saves as uncategorised: *"Saved as uncategorised. Assign a jar on the web app."*

**BYN or any currency with no live rate:**
- Bot: *"No BYN rate available. Enter the rate (1 BYN = ? PLN):"* → **Cancel**
- User enters rate → *"50.00 BYN = 16.50 PLN · Eating Out — save it?"* → **Save · Edit · Cancel**

**Cancel at any point:** *"OK, nothing saved."*

**Unlinked user:** *"Link your Telegram account first at [WEB_APP_URL]/account"*

### 7.3 Balance check — all states

- `/balance` or `"balance"` → list of all shared jars: *"Eating Out: 320.00 PLN left of 450.00 PLN · Day 18/31"*
- `"how much in eating out"` or `"/balance eating out"` → just that jar
- Personal jar balance: only shown in **private chat** with the bot, never in a group chat

### 7.4 System messages (sent automatically, not by user request)

**Monthly reset notification:**
> *"New month, fresh start. Vacation +120.00 PLN · Eating Out −45.00 PLN."*
> Only jars with non-zero carry-forwards listed.

**Uncategorised reminder (after 3 days, once per batch):**
> *"You have 2 expenses without a jar. Assign them on the web app at [WEB_APP_URL]"*

---

## 8. Build order — follow this sequence exactly

> ⚠️ Complete each phase fully before starting the next. Say **"Phase N complete"** and wait for confirmation before continuing.

### Phase 1 — Project setup
- Initialise npm workspaces monorepo
- Install all dependencies for all three packages (/api, /bot, /web)
- Create Prisma schema with all tables from Section 3
- Run `prisma migrate dev` to create the database
- Create `.env` with all variables from Section 1.3
- **Seed the database:** create Lizaveta (admin) and Edgar (user), create all default jars from Section 2.3, create default overhead (Food 2000 PLN), create Lizaveta's default deductions (University savings 300 PLN, IKZE 200 PLN)

Default seed credentials:
- Lizaveta: `lizaveta@family.local` / `changeme123`
- Edgar: `edgar@family.local` / `changeme123`

### Phase 2 — Core backend services
- Budget calculation service (the pure function from Section 2 — build and test this in isolation first)
- Exchange rate service (NBP fetch + BYN manual-only logic)
- Auth endpoints (login, logout, password reset)
- All expense endpoints with privacy enforcement
- Jar endpoints including archive/restore
- Overhead and deduction endpoints
- Dashboard endpoint that runs the full calculation and returns complete state

### Phase 3 — Scheduled jobs
- Monthly reset cron job (1st of month, 00:01)
- Uncategorised reminder cron job (daily at 09:00, checks the threshold)

### Phase 4 — Telegram bot
- Bot setup with Grammy
- Account linking flow (generate code, confirm code via `/api/account/telegram/confirm`)
- Expense logging conversation with all states from Section 7
- Balance check commands
- System message sending functions (called by the cron jobs in Phase 3)

### Phase 5 — Web application
- Vite + React + Tailwind setup
- Auth: login screen, protected routes, persistent session (no expiry)
- Onboarding wizard (5 steps, admin only)
- Dashboard with all panels in correct order
- Add Expense modal with all currency and rate states
- Jar drawer (slides in from the right)
- Jars screen with live % total validation
- Budget screen (3 sections: income, overheads, deductions)
- History screen with all filters and sort options
- Account screen with Telegram linking
- Toast system (manual dismiss only, no auto-hide)

### Phase 6 — Final wiring and verification
- Verify the bot and web app read from and write to the same database
- Verify personal jar privacy: log in as Edgar and confirm Lizaveta's Personal jar data is completely inaccessible
- Verify monthly reset logic with a manual test trigger
- Verify exchange rate fallback states (missing rate, BYN)
- Provide exact commands to run the full app locally

---

## 9. How to run the app

At the end of the build, provide these commands:

```bash
# From the FamilyBudget root folder:
npm run dev          # starts all three: api, bot, and web

# Or individually:
npm run dev:api      # backend on port 3001
npm run dev:bot      # telegram bot
npm run dev:web      # web app on port 5173
```

Then open `http://localhost:5173` in a browser and log in as Lizaveta to complete onboarding.

---

## 10. If Claude Code asks you something

You don't need to know anything technical to answer. Here are the likely questions:

| If Claude Code asks... | Say this |
|---|---|
| Which database do you want? | SQLite as specified in the brief. |
| Which frontend framework? | React with Vite and Tailwind CSS as specified. |
| Should I use TypeScript? | Yes, TypeScript throughout. |
| How should I handle authentication? | JWT tokens in HTTP-only cookies, no session expiry. |
| Should I add tests? | Skip automated tests for now. Focus on the working app. |
| What port should the API run on? | 3001 for the API, 5173 for the web app. |
| Should I add Docker? | No, just local development for now. |
| Anything about deployment | Skip for now, local only. |
| Anything not covered in this brief | Use your best judgment and keep it simple. |

---

*Family Budget Bot — Claude Code Build Brief v1.0 · June 2026*
