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

The server reads `PEXELS_API_KEY` from a Wrangler secret (and ignored `.dev.vars` for the preview). Build assets never include it. To replace the key, run `node scripts/wrangler.cjs secret put PEXELS_API_KEY` and enter it interactively. Restart the preview after changing `.dev.vars`.

Images have `data-target`, `data-query` and `data-kind` attributes. The frontend asks `/api/images` for a query-selected Pexels photo, with stable selection per target. The Worker authenticates upstream, caches matching results for a day and returns photo credits. People/property images are illustrative. Unavailable images retain generated initials or neutral placeholders; fixed photo URLs are not used in the app.

## Opening the preview

Use `http://localhost:3000` for the Worker preview. VS Code Live Server on port 5500/5501 serves static files only and cannot handle `/api` requests. The HTML redirects those local static previews to the Worker on port 3000, preserving the selected hash. Public deployments keep their same-origin API routing.

The Students view uses an inline profile on the left and a searchable, selectable directory on the right. Full details and history expand in place. Dashboard content panels use an 8:4 grid on desktop and stack on smaller screens.

Add property accepts an optional JPG, PNG or WebP upload up to 8 MB. The browser resizes it to at most 960 pixels and compresses it before saving. New uploaded photos are stored in R2 and served through the Worker; property lists contain only the image path. The earlier D1 upload route remains available for legacy photos. Without an upload, the configured Pexels search query is used.

## R2 image storage

The remote `MEDIA` binding uses the dedicated `adotrip-campus-crm-images` R2 bucket. Add student and Add property both accept photo uploads with preview/removal. New uploads store binary photos in R2 and only the image path in D1. Existing legacy D1 property photos remain readable. A failed record insert removes its R2 upload.

Uploaded photos load at `/api/media/students/:id` or `/api/media/properties/:id`. Add `?download=1` for an attachment. Query-selected photos load at `/api/images/file?target=...&query=...&kind=person|hotel`; the Worker caches their bytes in R2 and supports `download=1`. The UI includes Photo download on student profiles and a download icon on property cards. The bucket remains private; the Worker serves the photos.

The lead pipeline includes active and closed views, owner/search filters, monthly opportunity values and due follow-up counts. Cards open the corresponding student profile. Change stages from the dropdown or drag between columns; changes persist through the D1 API. On mobile, the board scrolls horizontally within its container.

## Team login

Open `/login`. The first administrator is `pooja@adotrip.com`; the generated starter password is in the ignored, mode-600 local `private/first-login.txt` file. First login requires a new password before any CRM API, photo or download can be accessed. The administrator photo supplied during setup is stored privately in R2.

Passwords use standard salted PBKDF2-SHA-512 with 210,000 iterations and 64-byte derived keys through `@noble/hashes`, avoiding the Workers native iteration cap. SHA-1024 is not a standard SHA algorithm. Starter passwords follow `Campus-<8 random characters>-<8 random characters>-<4 random hex characters>!`; they are randomly generated, never derived from names or emails.

Sessions use random tokens in HttpOnly, SameSite=Strict cookies (Secure over HTTPS), hashed session tokens in D1, and an eight-hour expiry. A password change revokes previous sessions and creates a fresh one. Sign-in has per-account/IP attempt limits. Authenticated administrators can generate first-login accounts in Settings; plaintext starter passwords are returned once and can be cleared from the UI.

The login screen, Dashboard welcome banner, and Student workspace use the shared `welcome-card workspace-hero` classes. Workspace banners show live student/pipeline/follow-up information; the greeting uses the signed-in name and India time.
