# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-09
- Scope: transport-flow QA closed request search fix and verification

## Completed In This Task

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before making changes.
- Investigated the `qa:playwright:transport-flow` failure where the admin requests page could not find a `status=closed` QA order.
- Confirmed the admin requests page uses `transport-admin.js` and `transport-api.js` to call `GET /api/transport-requests`.
- Confirmed `api/_lib/transport.js` supports `status=closed` and exact `transport_requests.order_no` filtering.
- Identified the failure as a QA timing/submission issue: the script could submit the admin requests form before frontend submit handling was fully initialized, causing native query-string navigation instead of the AJAX list refresh.
- Updated `scripts/playwright-transport-flow.js` so admin requests searches wait for page initialization, dispatch the already-bound submit handler, and wait for the matching `/api/transport-requests` response.
- Ran `node --check scripts/playwright-transport-flow.js`.
- Ran `npm run qa:playwright:transport-flow`; the flow passed.
- Cleaned all QA/test data created by the successful run and deleted the run's generated `output/playwright/transport-flow-*` screenshots and JSON report.
- No API routes, SQL, schema, CSS, package files, deployment, or production data were modified.

## Verification

- `node --check scripts/playwright-transport-flow.js` passed.
- `npm run qa:playwright:transport-flow` passed against `http://localhost:3000`.
- The QA flow covered pickup request creation, group creation, regrouping, public board sync, capacity update, group close hiding from public board, admin request/group search, join preview/submit, request deletion, replacement group creation, and service-center sync.
- QA/test data cleanup completed: run-specific `site_users`, `transport_requests`, `transport_group_members`, `transport_groups`, and transport-source `orders` all returned to 0 residual rows.
- Post-QA status checks: `transport_groups.status = open` is 0, invalid `transport_requests.status` is 0, and transport-source `orders.status` mismatches against `transport_requests.status` are 0.
- Pending: review and commit the local `scripts/playwright-transport-flow.js` and `docs/current-status.md` changes.

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
- The P2 transport request status contract is partially aligned at the orders/admin statistics layer: transport requests now use `published`, `matched`, `closed` there.
- The P2 transport group API/listing fallback paths are partially aligned: edited group API endpoints no longer write `open`, and public joinable listing now uses `single_member` and `active`.
- The P2 transport group lifecycle helper now avoids new `open` writes and normalizes historical `open` reads to `active`.
- Supabase read-only verification found no current production data migration need for transport status cleanup.
- The local transport-flow QA now passes after making the admin requests search step wait for the page's AJAX filtering path.

## Open Issues Or Risks

- P0 follow-up: rotate any admin/ops credentials that may have appeared in the previous root JSON payload files.
- P0 follow-up: previous versions of the root JSON payload files may still exist in Git history.
- P0 follow-up: consider moving example payloads to `docs/examples/*.example.json` in a future task.
- P1 follow-up: run a focused API smoke test against `PATCH /api/transport-requests/:id` with safe test data and configured email variables.
- P1 follow-up: verify the next Vercel deployment does not include the newly excluded historical root files.
- P1 follow-up: rename `styles-pickup-backup.css` to a formal production filename in a separate task and update `pickup.html` at the same time.
- P2 follow-up: verify admin dashboard transport counts in a separate focused check.
- P2 follow-up: decide whether `api/_lib/transport.js` legacy `open` / `draft` normalization should remain as read compatibility or be narrowed in a future task.
- P2: `transport-public.previous-good.js` is captured HTML with old Vercel auth URLs/nonces.
- P3: `admin-storage.html` storage label issue needs runtime/browser confirmation before code changes.
- Exact production email provider mix remains unclear because code supports Resend and SMTP across different flows.
- Google/OAuth provider status is unclear from repo scan; `google-auth.js` and `auth-callback.html` exist but active provider settings are external.

## Recommended Next Steps

1. Rotate the admin and operations account passwords that may have appeared in the previous root JSON payload files.
2. Decide whether local root payload files should eventually be replaced by non-sensitive example files under `docs/examples`.
3. Review and commit the transport-flow QA timing fix if acceptable.
4. Run a separate focused admin dashboard check for `published` / `matched` transport statistics.
5. Defer any transport status database migration unless future checks find legacy rows.
