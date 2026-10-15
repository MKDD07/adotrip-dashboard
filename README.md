# Adotrip Campus CRM — Cloudflare Workers + D1

The Worker serves the UI and `/api/*` from the same origin. All runtime data uses the `DB` D1 binding for database ID `252798d7-026a-414d-a0a7-daadbd24c70a`. No local SQLite fallback or example records are used. `crm.db` and `schema.sql` are legacy files and are not uploaded.

## Setup and deployment

Node.js 22 or newer is recommended. The npm script launcher downloads a managed Node 22 runtime when invoked from Node 18–21. Requires access to the Cloudflare account that owns the database.

```sh
npm install
node scripts/wrangler.cjs login
node scripts/wrangler.cjs d1 info DB
node scripts/wrangler.cjs d1 execute DB --remote --command="SELECT name, sql FROM sqlite_master WHERE type='table'"
```

Inspect the existing schema first. `0001_crm.sql` creates missing CRM tables without inserting demo data. `0002_followup_outcomes.sql` adds outcome and completion timestamp columns. If those columns already exist, reconcile the migration before applying it. An existing database with different table/column names needs a schema mapping before this Worker can read it.

```sh
npm run db:migrate
npm run deploy
```

Live CRM: [adotrip-campus-crm.mkmkataria07.workers.dev](https://adotrip-campus-crm.mkmkataria07.workers.dev/). This existing Worker serves both the frontend and backend; opening a GitHub/static copy does not run the CRM API. Pushes update the repository; run `npm run deploy` to update the Worker unless Cloudflare Git integration is configured.

Open the Worker URL returned by deployment. The frontend calls the same-origin `/api` endpoints; it no longer requests localhost. The D1 binding uses parameterized queries and batches related writes.

```sh
npm start
```

Development serves the Worker on port 3000 and uses the **remote D1 database**, because `remote: true` is set. Changes made during development persist in that database. `npm test` uses an isolated temporary SQLite database through a D1-compatible test adapter, never the remote database.

Only `index.html`, `app.js`, and `styles.css` are copied to `dist/` and uploaded as assets. Backend source, the legacy database, credentials and SQL files are not public assets. Protect a production CRM with Cloudflare Access for the team's domain; the CRM now requires team authentication and a password change on first sign-in.

## Student workflow

The arrow in Students opens the full student profile without modifying status. It shows contact details, requirements, assigned employee, properties and leads, payment/booking records, pending tasks, and completed follow-up outcomes. The next-action card explains what to do for the student's current stage.

Use **Save status** to explicitly change the stage. Use **Schedule follow-up** to create a task. Use **Complete follow-up** with an outcome note to mark it done and retain its completion time. Calendar events open the corresponding profile.

## API

- `GET /api/health`, `/api/state`, `/api/export`
- `POST /api/students`, `/api/students/import`, `/api/properties`, `/api/leads`, `/api/followups`, `/api/payments`
- `PATCH /api/students/:id`, `/api/leads/:id` with `status`
- `PATCH /api/followups/:id` with `status: "Done"` and required `outcome`

Gateway/messaging keys in Settings are still local placeholders. Actual payment processing and messaging providers are not connected. Integration secrets belong in Worker secrets, never in frontend code.

The initial migration and transfer of the 19 legacy records into remote D1 were completed on 13 October 2026. Do not re-import them.

## Indian demo profiles and query images

Ten additional Indian demo people were added to remote D1 with structured personal, education, guardian and accommodation details, plus 10 properties, 10 leads, 20 follow-ups and 10 payments. They use `DEMO-` IDs, fictional contact numbers and `example.com` emails. Existing records are preserved. `scripts/seed-demo.cjs` regenerates the idempotent `data/demo.sql` import and a readable `data/demo-profiles.json` reference.

Historical fictional Indian student enquiries for serviced apartments in London and Toronto for August and September 2026 are generated with `node scripts/seed-history.cjs`. Import `data/demo-history.sql` with `node scripts/wrangler.cjs d1 execute DB --remote --file data/demo-history.sql`. The import uses unique `DEMO-HIST-` IDs. It updates destination and accommodation details only for these historical demo IDs, preserving amounts, statuses and existing non-demo records. Demo budgets and payments are fictional INR equivalents. August has 6 students and 2 bookings; September has 8 students and 3 bookings. Dashboard Month uses the current calendar month; Year includes historical records from the current year.

The server reads `PEXELS_API_KEY` from a Wrangler secret (and ignored `.dev.vars` for the preview). Build assets never include it. To replace the key, run `node scripts/wrangler.cjs secret put PEXELS_API_KEY` and enter it interactively. Restart the preview after changing `.dev.vars`.

Images have `data-target`, `data-query` and `data-kind` attributes. The frontend asks `/api/images` for a query-selected Pexels photo, with stable selection per target. The Worker authenticates upstream, caches matching results for a day and returns photo credits. People/property images are illustrative. Unavailable images retain generated initials or neutral placeholders; fixed photo URLs are not used in the app.

## Opening the preview

Use `http://localhost:3000` for the Worker preview. Wrangler’s custom build watches the five app source files and rebuilds `dist` automatically when they change, including when Wrangler is launched directly. Builds add content-based versions to CSS and JavaScript URLs; app assets and CRM API requests bypass browser caching. After updating the development runner itself, restart `npm run dev` once. VS Code Live Server on port 5500/5501 serves static files only and cannot handle `/api` requests. The HTML redirects those local static previews to the Worker on port 3000, preserving the selected hash. Public deployments keep their same-origin API routing.

The Students view uses an inline profile on the left and a searchable, selectable directory on the right. Full details and history expand in place. Dashboard content panels use an 8:4 grid on desktop and stack on smaller screens.

Add property accepts an optional JPG, PNG or WebP upload up to 8 MB. The browser resizes it to at most 960 pixels and compresses it before saving. New uploaded photos are stored in R2 and served through the Worker; property lists contain only the image path. The earlier D1 upload route remains available for legacy photos. Without an upload, the configured Pexels search query is used.

## R2 image storage

The remote `MEDIA` binding uses the dedicated `adotrip-campus-crm-images` R2 bucket. Add student and Add property both accept photo uploads with preview/removal. New uploads store binary photos in R2 and only the image path in D1. Existing legacy D1 property photos remain readable. A failed record insert removes its R2 upload.

Uploaded photos load at `/api/media/students/:id` or `/api/media/properties/:id`. Add `?download=1` for an attachment. Query-selected photos load at `/api/images/file?target=...&query=...&kind=person|hotel`; the Worker caches their bytes in R2 and supports `download=1`. The UI includes Photo download on student profiles and a download icon on property cards. The bucket remains private; the Worker serves the photos.

The lead pipeline includes active and closed views, owner/search filters, monthly opportunity values and due follow-up counts. Cards open the corresponding student profile. Change stages from the dropdown or drag between columns; changes persist through the D1 API. On mobile, the board scrolls horizontally within its container.

## Team login

Open `/login`. The first administrator is `pooja@adotrip.com`; the generated starter password is in the ignored, mode-600 local `private/first-login.txt` file. First login requires a new password before any CRM API, photo or download can be accessed. The administrator photo supplied during setup is stored privately in R2.

Passwords retain salted PBKDF2-SHA-512 with 210,000 iterations and 64-byte derived keys, computed through native Web Crypto in the browser. The Worker performs only a fast SHA-256 check: it stores SHA-256 of the derived key, not the key that is sent over HTTPS. This preserves the previous password work factor while avoiding the Free plan's server CPU limit. Existing password hashes are wrapped into this verifier format when login metadata is requested, without changing the password or sessions. Login metadata exposes only the public salt and fixed derivation parameters. Account creation and password changes also derive keys in the browser. Starter passwords follow `Campus-<8 random characters>-<8 random characters>-<4 random hex characters>!`; they are randomly generated, never derived from names or emails.

Sessions use random tokens in HttpOnly, SameSite=Strict cookies (Secure over HTTPS), hashed session tokens in D1, and an eight-hour expiry. A password change revokes previous sessions and creates a fresh one. Sign-in has per-account/IP attempt limits. Authenticated administrators can generate first-login accounts in Settings; plaintext starter passwords are returned once and can be cleared from the UI.

The login screen, Dashboard welcome banner, and Student workspace use the shared `welcome-card workspace-hero` classes. Workspace banners show live student/pipeline/follow-up information; the greeting uses the signed-in name and India time.

Property demo listings use international serviced apartments. `node scripts/international-properties.cjs` prepares `data/international-properties.sql`, which replaces the 14 original Indian property listings in place while retaining IDs and booking links. Names and prices are fictional; monetary values remain INR demo equivalents. The demo seed and photo-search defaults also use international apartment destinations.

Demo rents are city-specific monthly INR estimates (roughly ₹1.5–₹3.3 lakh). `node scripts/price-demo.cjs` prepares `data/demo-prices.sql` to align seeded student budgets and demo payments: successful payments use one month’s rent; pending/refunded booking amounts use 20%. It updates only known seeded IDs. These are fictional scenarios, not live quotes. Reference examples: [London furnished rentals](https://www.thehomelike.com/es/apartamentos-amueblados/londres/), [Toronto furnished rentals](https://maplestayhomes.ca/explore?q=Toronto), [Australian extended stays](https://extendedstays.com.au/locations), and [XE currency reference](https://www.xe.com/en-gb/currencytables/?date=2026-10-09&from=INR). Rounded modelling rates: GBP ₹128, CAD ₹68, AUD ₹68, EUR ₹108; no automatic live FX conversion.

Historical demo assignments are grouped into distinct apartments with at most three students per apartment. The history seed updates the related lead and payment property IDs together, preserving financial amounts and statuses.

Notifications use the shared `crm_activity` log for CRM record creation and updates, including the acting team member. Activity and the associated mutation are saved together. Pending follow-ups generate reminders from two calendar days before their scheduled date, using India time; completion removes the reminder. Read and dismissed notifications persist per user in `notification_receipts`. The client polls CRM state and notifications every five seconds while visible, and refreshes on window focus. Dashboard schedules update during form editing; full profile rendering waits until editing ends. Existing records are not assigned invented activity history. Apply migration `0008_notifications.sql` before deploying these changes.

The sidebar Team directory lists all CRM accounts and their roles, with direct messaging between signed-in members. Conversations are visible only to their sender and recipient. Unread dots and hover previews show incoming unread messages for the current user; opening a conversation marks only its displayed incoming messages as read. Team/message refresh runs with the existing five-second polling. Apply migration `0009_direct_messages.sql` for message storage.

Team lists exclude the signed-in user. Green/red presence dots reflect a session heartbeat from a visible workspace: online when any unexpired session was seen within 60 seconds. Heartbeats are throttled to one database write per 15 seconds and checked by five-second polling. Closing/backgrounding the app expires presence after about a minute; logging out removes that session immediately. Apply migration `0010_team_presence.sql`.

The GitHub Pages URL `https://mkdd07.github.io/adotrip-dashboard/` redirects to the Cloudflare Worker, preserving the selected view. Its login page redirects to the Worker login as well. The CRM does not make cross-origin API calls from GitHub Pages, so authentication cookies and backend routes stay on the same origin.

The app and login JavaScript also detect the GitHub Pages host and redirect before starting API requests, protecting older cached HTML. Source entrypoints include versioned CSS/JS URLs as well as built assets. Data-error reporting tolerates missing banner nodes so older documents cannot turn an API failure into an unhandled JavaScript exception.

Password changes recheck the current session before submitting. First sign-in requires only a new password; existing accounts use `/login?change=1` and must provide their current password. Expired sessions return to sign-in. Authentication errors preserve structured server messages and include HTTP status when no reason is returned.

Students can be permanently deleted using the trash button in their profile. Confirmation shows linked lead, follow-up and payment counts. The authenticated deletion API removes the student and linked records atomically, cleans up prior student notifications, deletes the uploaded R2 photo and records a deletion event without retaining the student name. Apartments and team login accounts remain available.

The Pending and Finalized sidebar tabs share the student directory and profile design. Pending contains students whose status is not Converted; Finalized contains Converted students. Counts and lists update from the same D1 records. Profile links choose the correct tab automatically, and moving a student out of Converted returns them to Pending.

Notifications show only unread real activity and reminders for non-demo students. Tabs group activity by its author (plus All and Reminders), with a distinct subtle card tint for each author. Reading clears cards immediately from the selected tab and persists per signed-in user; the mark-read action targets only the selected tab.

Previous-year demo data: `node scripts/seed-history.cjs --previous-years` generates `data/demo-previous-years.sql`. It adds 48 linked records total (4 properties, 11 students, 11 leads, 11 completed follow-ups and 11 payments): 2024 has 5 enquiries / 2 confirmed bookings; 2025 has 6 enquiries / 3 confirmed bookings. Reuses fictional profiles with year-specific IDs and contacts, and different yearly INR budgets and payment amounts. Import with `node scripts/wrangler.cjs d1 execute DB --remote --file data/demo-previous-years.sql`. Re-importing does not duplicate records.

Students have permanent display references such as `ADO26-012`, stored in `students.student_code`. Migration `0011_student_codes.sql` numbers existing students by enquiry year (India time), then creation date and internal ID. A database trigger allocates references for new students and CSV imports with a separate counter per year; deleted references are not reused. References appear in Student Overview, Recent enquiries, Today’s schedule and the lead pipeline, which supports searching by reference. Internal record IDs and existing booking links remain intact.

Student Overview shows a 10% initial / 60% after accommodation completion / 30% final payment plan based on the assigned property's monthly INR rent. A confirmed booking is preferred; a single assignment is selected automatically, while several assignments require a selection from that student's properties. Without an assignment, the monthly budget is shown as an estimate and recording is disabled. Amounts are calculated in paise with the final stage absorbing rounding. Successful tagged receipts stay on their stage, while previous untagged receipts fill remaining stages in order; pending, failed and refunded records are excluded.

Display currencies: INR, USD, GBP, EUR, CAD, AUD, AED and SGD. Authenticated `GET /api/exchange-rates` retrieves [Frankfurter daily reference rates](https://frankfurter.dev/) with an INR base, cached for one hour and shared across simultaneous requests. Currency selection converts estimates in the overview and profile payment history; recorded amounts remain INR. The UI shows the rate date and a refresh control. Provider failures use clearly marked previously fetched rates when available, otherwise INR remains available and unavailable conversions show a dash. No fixed fallback rates are used.

Student removal is restricted to administrators and uses an archive first. `DELETE /api/students/:id` now sets `archived_at` and `archived_by`, retaining the student reference, photo, leads, follow-ups and payments. Active state, exports and notifications exclude archived students and their linked records, and archived records reject ordinary edits. Administrators manage the archive in **Settings → Student archive**: `GET /api/students/archive` lists records, `POST /api/students/:id/restore` restores them, and `DELETE /api/students/:id/permanent` removes an already archived student and linked data after UI confirmation. All three archive operations and student removal enforce the admin role on the server. Migration `0012_student_archive.sql` must be applied before deployment; its delete guard prevents an active student from being purged, including if restoration races with deletion. No existing students are archived by the migration.

Colored payment-stage cards provide the single payment-entry UI in Student Overview. The inline form fills in the student, assigned property, stage and remaining INR amount. It records payment method (UPI, bank transfer, card, cash or other), transaction ID/receipt number, UTR/bank reference, payment time in India, optional notes and the signed-in recorder. UPI and bank transfers require UTR; card payments require a transaction ID. `POST /api/students/:id/payments` validates the assignment, amount and stage balance, rejects duplicate references, and uses an idempotency key plus an atomic balance guard to prevent duplicate or concurrent over-recording. Receipts are shown under the plan and in the read-only Payments tab. Recording a stage receipt does not change the lead pipeline status. Apply `0013_payment_receipts.sql` before deployment.
