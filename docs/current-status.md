# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-09
- Scope: sitewide favicon and public clean URLs

## Completed In This Task

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before making changes.
- Added a Vercel route so `/pickup` serves the existing `pickup.html` page.
- Added a permanent Vercel redirect from `/pickup.html` to `/pickup` so the old URL remains compatible but user-visible links become cleaner.
- Updated active public-facing pickup service links from `./pickup.html` to `./pickup` in homepage/navigation, service center, storage, transport board, and pickup form return paths.
- Updated the pickup quote login return path in `script.js` from `/pickup.html#pickup-quote` to `/pickup#pickup-quote`.
- Did not rename `pickup.html`; it remains the canonical static file behind the clean route.
- Added root `favicon.ico`, `favicon.png`, and `apple-touch-icon.png` files generated from the existing NGN brand logo so browsers have a real site icon instead of the default globe.
- Added explicit favicon links to all root HTML pages so non-pickup pages do not rely only on browser fallback.
- Added Vercel redirects from `/index.html` to `/` and `/storage.html` to `/storage`.
- Added a Vercel rewrite so `/storage` serves the existing `storage.html` page.
- Updated active public-facing homepage and storage links to use `./` and `./storage` instead of `./index.html` and `./storage.html`.
- No backend API, admin auth, database, SQL, email, package, dependency, payment, or deployment action was performed.

## Verification

- `node --check script.js` passed.
- `node --check service-center.js` passed.
- `vercel.json` parsed successfully as JSON.
- Fixed-string search confirmed the edited active files no longer contain `pickup.html` references except the Vercel redirect/rewrite mapping.
- Local helper server served `http://localhost:3000/pickup` with HTTP 200.
- Playwright opened `http://localhost:3000/pickup` and confirmed the page rendered the pickup page heading.
- Local helper server served `/favicon.ico`, `/favicon.png`, and `/apple-touch-icon.png` with HTTP 200 and the expected image content types.
- Local helper server served `/`, `/storage`, and `/pickup` with HTTP 200.
- Playwright opened `/` and `/storage`, confirmed both rendered page titles and each had favicon declarations.
- Pending: after the next Vercel deployment, confirm `https://ngn.best/`, `https://ngn.best/storage`, and `https://ngn.best/pickup` load and their `.html` counterparts redirect.

## Current Project Status

- The transport dispatch app remains a static multi-page website plus Vercel serverless APIs.
- Production is live at `https://ngn.best`.
- Latest deployed production URL remains `https://webside-9camg7h8j-wwkevin8s-projects.vercel.app`.
- Latest deployed code commit remains `3498fb9` on branch `codex/full-sync`.
- The P0 root JSON exposure risk is mitigated in the current working tree by sanitization, deployment ignores, `.gitignore` rules, and removal from the Git index.
- The three JSON files are no longer tracked in the current Git index, and local copies remain ignored.
- Manual credential rotation is still required because previous values must be treated as potentially exposed and may remain in Git history.
- The P1 missing transport payment email module risk is locally mitigated by `api/_lib/transport-payment-email.js`.
- Transport payment email delivery now depends on configured Resend or SMTP environment variables and a recipient email on the transport request.
- The P1 deploy exposure risk for known root historical/backup HTML, JS, and CSS files is locally mitigated through explicit `.vercelignore` entries.
- `styles-pickup-backup.css` remains deployable because it is still an active dependency of `pickup.html`.
- The pickup service now has a clean public route configured as `/pickup`, with `/pickup.html` retained only as a redirected compatibility URL after deployment.
- The homepage, pickup page, and storage page now have clean public routes configured as `/`, `/pickup`, and `/storage`; `.html` URLs are retained as redirected compatibility URLs after deployment.
- All root HTML pages explicitly declare the site favicon; the root favicon files are present for browser fallback and use the existing NGN brand logo.
- The P2 transport request status contract is partially aligned at the orders/admin statistics layer: transport requests now use `published`, `matched`, `closed` there.
- The P2 transport group API/listing fallback paths are partially aligned: edited group API endpoints no longer write `open`, and public joinable listing now uses `single_member` and `active`.
- The P2 transport group lifecycle helper now avoids new `open` writes and normalizes historical `open` reads to `active`.
- Supabase read-only verification found no current production data migration need for transport status cleanup.
- The local transport-flow QA now passes after making the admin requests search step wait for the page's AJAX filtering path.
- The admin change-password modal now has clearer client-side validation and a fallback for deep admin route 404s.
- Existing bootstrap admin accounts no longer have their password hash overwritten from `ADMIN_BOOTSTRAP_PASSWORD` during login.

## Open Issues Or Risks

- P0 follow-up: rotate any admin/ops credentials that may have appeared in the previous root JSON payload files.
- P0 follow-up: previous versions of the root JSON payload files may still exist in Git history.
- P0 follow-up: consider moving example payloads to `docs/examples/*.example.json` in a future task.
- P1 follow-up: run a focused API smoke test against `PATCH /api/transport-requests/:id` with safe test data and configured email variables.
- P1 follow-up: verify the next Vercel deployment does not include the newly excluded historical root files.
- P1 follow-up: verify the next Vercel deployment applies clean URL redirects from `/index.html` to `/`, `/pickup.html` to `/pickup`, and `/storage.html` to `/storage`.
- P1 follow-up: after deployment, confirm Chrome shows the new favicon; if it still shows the globe, clear Chrome's favicon cache or test in a private window.
- P1 follow-up: rename `styles-pickup-backup.css` to a formal production filename in a separate task and update `pickup.html` at the same time.
- P2 follow-up: verify admin dashboard transport counts in a separate focused check.
- P2 follow-up: decide whether `api/_lib/transport.js` legacy `open` / `draft` normalization should remain as read compatibility or be narrowed in a future task.
- P2: `transport-public.previous-good.js` is captured HTML with old Vercel auth URLs/nonces.
- P3: `admin-storage.html` storage label issue needs runtime/browser confirmation before code changes.
- Exact production email provider mix remains unclear because code supports Resend and SMTP across different flows.
- Google/OAuth provider status is unclear from repo scan; `google-auth.js` and `auth-callback.html` exist but active provider settings are external.

## Recommended Next Steps

1. Deploy the clean URL and sitewide favicon change, then confirm `https://ngn.best/`, `https://ngn.best/storage`, and `https://ngn.best/pickup` load and their `.html` counterparts redirect.
2. Rotate the admin and operations account passwords that may have appeared in the previous root JSON payload files.
3. Decide whether local root payload files should eventually be replaced by non-sensitive example files under `docs/examples`.
4. Manually retest the admin change-password modal, then commit the small admin auth UI/API routing fix if acceptable.
5. Run a separate focused admin dashboard check for `published` / `matched` transport statistics.
