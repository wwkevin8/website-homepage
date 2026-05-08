# Risk Register

Last reviewed: 2026-05-08

Scope: documentation-only risk review. No business code, config, SQL, HTML, CSS, or JS was changed.

## Summary

| Priority | Risk | Status | Recommended Fix Order |
| --- | --- | --- | --- |
| P0 | Root JSON files contained admin/ops credential payloads and were tracked by Git | Mitigated locally; removed from tracking; credential rotation still required | 1 |
| P1 | Missing `api/_lib/transport-payment-email.js` breaks transport payment confirmation email path | Mitigated locally; needs endpoint smoke test | 2 |
| P1 | Static backup/temporary/inspection files may be publicly deployable | Mitigated locally; needs next deploy verification | 3 |
| P2 | Transport status model mixes current and legacy values | Application-layer mitigated; Supabase read-only check found no legacy status data migration needed | 4 |
| P2 | `transport-public.previous-good.js` is HTML captured as `.js` | Confirmed | 5 |
| P3 | `admin-storage.html` `storageTypeLabels is not defined` risk appears stale or non-reproducible by static scan | Needs confirmation | 6 |

## P0 Risks

### P0-1 Root JSON Credentials May Be Publicly Deployable

Status as of 2026-05-08:

- Local payload files were sanitized:
  - `admin-create-ops.json`
  - `admin-login-payload.json`
  - `ops-login.json`
- The files remain as test/request payload templates, but now use obvious placeholder values only.
- `.vercelignore` now explicitly excludes:
  - `admin-create-ops.json`
  - `admin-login-payload.json`
  - `ops-login.json`
  - `*.local.json`
  - `*.secret.json`
  - `*.payload.json`
  - `.tmp*`
  - `*.log`
  - `_inspect_src_zip_2/`
  - `backup/`
  - `brand/`
- `.gitignore` now excludes:
  - `admin-create-ops.json`
  - `admin-login-payload.json`
  - `ops-login.json`
  - `*.local.json`
  - `*.secret.json`
  - `*.payload.json`
  - `.tmp*`
  - `*.log`
- Remaining required action: manually rotate any account passwords or credentials that may have appeared in the previous versions of these files.

Git tracking close-out as of 2026-05-08:

- `git rm --cached admin-create-ops.json admin-login-payload.json ops-login.json` was run to remove these files from the repository index while keeping local copies.
- `git ls-files -- admin-create-ops.json admin-login-payload.json ops-login.json` returns no tracked files.
- `git status` now shows the files as removed from the index, not ordinary modified tracked files.
- Local copies remain present and are ignored by the explicit `.gitignore` file-name rules.
- Current content status:
  - no real sensitive value was intentionally retained in the working tree version.
  - placeholder values are present.
- Important Git note:
  - these files may still exist in prior Git history.
  - repository history exposure is not fixed by removing the current index entries.
- Naming/location recommendation:
  - safer long-term shape is to replace them with non-sensitive example files, such as `docs/examples/*.example.json`, or remove them entirely after the workflow is documented.
  - if root copies must remain locally, they should be untracked and ignored explicitly.

Evidence:

- Before mitigation, `admin-create-ops.json:1` contained an admin creation payload with sensitive fields.
- Before mitigation, `admin-login-payload.json:1` contained an admin login payload with sensitive fields.
- Before mitigation, `ops-login.json:1` contained an ops login payload with sensitive fields.
- Before mitigation, `.vercelignore` did not exclude these root JSON files.

Impact:

- If these files are deployed as static assets, they may be accessible by URL.
- If the credentials still work in any environment, this is credential exposure.

Needs confirmation:

- Whether these credentials are valid in production, preview, local, or any Supabase/admin environment.
- Whether Vercel currently serves root JSON files from this project.

Recommended limited fix scope:

- Completed locally: sanitize the three root JSON files.
- Completed locally: add root test payload patterns to `.vercelignore`.
- Completed locally: remove the three root JSON files from Git tracking with `git rm --cached`.
- Completed locally: add explicit root JSON file names to `.gitignore`.
- Still required: rotate any possibly exposed credentials.
- Still recommended: decide whether to replace local root payloads with `docs/examples/*.example.json` in a future cleanup task.

## P1 Risks

### P1-1 Missing Transport Payment Email Module

Status as of 2026-05-08:

- `api/_lib/transport-payment-email.js` has been added.
- The existing `api/transport-requests/[id].js` dynamic require path was left unchanged.
- The helper exports `sendTransportPaymentConfirmationEmail(supabase, request)` to match the existing call at `api/transport-requests/[id].js:149`.
- The helper also exports `buildTransportPaymentConfirmationEmail(request)` for narrow validation.
- Delivery uses Resend when `RESEND_API_KEY` is configured and falls back to SMTP when SMTP environment variables are configured.
- Missing recipient email returns `skipped: true` with reason `missing email context`.
- Missing email delivery configuration returns `skipped: true` with reason `missing email configuration` and logs a clear server-side warning.
- Resend or SMTP delivery failure returns `skipped: false` with an `error` field; the payment update response remains successful because `api/transport-requests/[id].js` already isolates email failures.

Evidence:

- `api/transport-requests/[id].js:148` dynamically requires `../_lib/transport-payment-email`.
- `api/transport-requests/[id].js:149` calls `sendTransportPaymentConfirmationEmail(supabase, updatedRequest)`.
- Before mitigation, `api/_lib/transport-payment-email.js` was not present in the current file list.
- `work-log/2026-04-14.md` and `work-log/2026-04-15.md` mention `api/_lib/transport-payment-email.js`, so the file likely existed or was intended at some earlier point.
- Similar email files exist:
  - `api/_lib/transport-order-submission-email.js`
  - `api/_lib/transport-sync-audit-email.js`
  - `api/_lib/auth-email.js`
  - `api/_lib/storage-order-notifier.js`

Execution path:

- The route is `PATCH /api/transport-requests/:id`.
- It first maps and updates the request.
- It computes:
  - `wasPaid = parsePaymentStatus(existing.admin_note) === "paid"`
  - `isPaid = parsePaymentStatus(payload.admin_note) === "paid"`
- The missing module path is reached only when an admin update changes payment marker from not paid to paid:
  - old `admin_note` does not contain `[payment:paid]`
  - new `admin_note` contains `[payment:paid]`
- `transport-admin.js` triggers this path when an operator clicks payment buttons and sends updated `admin_note`.

Previous likely behavior:

- The request update itself has already happened before the dynamic require runs.
- The dynamic `require` throws `Cannot find module '../_lib/transport-payment-email'`.
- The catch block stores the error in `payment_email`.
- API probably returns success with `payment_email.error`, so the admin UI may show "marked paid, but confirmation email failed."

Current impact after mitigation:

- The missing module error should no longer occur.
- Payment state should still be saved before email delivery is attempted.
- If email delivery cannot run because of missing environment variables or provider failure, the API response includes `payment_email.skipped` or `payment_email.error` instead of throwing an unhandled module error.

Recommended limited fix scope:

- Completed locally: added only `api/_lib/transport-payment-email.js`.
- No change was made to `api/transport-requests/[id].js`.
- Still recommended: run a focused `PATCH /api/transport-requests/:id` smoke test with a safe test request and configured email environment.

### P1-2 Deployable Backup / Temporary / Inspection Files

Status as of 2026-05-08:

- `.vercelignore` now explicitly excludes these root historical files:
  - `transport-public.previous-good.js`
  - `index-homepage-backup.html`
  - `index-homepage-brand.html`
  - `index-homepage-brand-v2.html`
  - `pickup-backup.html`
  - `pickup-original-backup.html`
  - `script-homepage-backup.js`
  - `script-homepage-brand.js`
  - `script-homepage-brand-v2.js`
  - `styles-homepage-backup.css`
  - `styles-homepage-brand.css`
  - `styles-homepage-brand-v2.css`
- Existing `.vercelignore` coverage remains in place for:
  - `.tmp*`
  - `*.log`
  - `_inspect_src_zip_2/`
  - `backup/`
  - `brand/`
- `styles-pickup-backup.css` is intentionally not excluded because current `pickup.html` still references it.
- Follow-up recommendation: open a separate scoped task to rename `styles-pickup-backup.css` to a formal production filename and update the `pickup.html` reference at the same time.

Evidence:

- Before mitigation, `.vercelignore` did not exclude root backup/brand HTML/JS/CSS files:
  - `index-homepage-backup.html`
  - `index-homepage-brand.html`
  - `index-homepage-brand-v2.html`
  - `pickup-backup.html`
  - `pickup-original-backup.html`
  - `script-homepage-backup.js`
  - `script-homepage-brand.js`
  - `script-homepage-brand-v2.js`
  - `styles-homepage-backup.css`
  - `styles-homepage-brand.css`
  - `styles-homepage-brand-v2.css`
  - `transport-public.previous-good.js`
- Current `.vercelignore` excludes `_inspect_src_zip_2/`.
- Current `.vercelignore` excludes root `.tmp*` files and `*.log`.
- Current `.vercelignore` excludes `work-log/`, `output/`, and `.tmp-dpl-3ReB2SCYt-output`.

Impact:

- Old pages/scripts may be publicly accessible and confuse users or search engines.
- Captured/temporary files may disclose internal tooling or old URLs.
- Root JSON credential payloads are a separate P0 issue.

Needs confirmation:

- Whether Vercel static deployment currently serves all non-ignored root files.
- Which backup/brand files are intentionally public.

Recommended limited fix scope:

- Completed locally: update only `.vercelignore` for generated/backup/inspection artifacts confirmed as historical.
- Move intentional archives under a non-deploying archive path if needed.
- Do not remove `styles-pickup-backup.css` blindly because active `pickup.html` uses it.
- Still recommended: verify the next Vercel deployment does not include the explicitly excluded historical root files.

## P2 Risks

### P2-1 Transport Status Model Mixes Current And Legacy Values

Status as of 2026-05-09:

- First application-layer cleanup completed for general orders and dashboard stats.
- `api/_lib/orders.js` now treats `transport_requests` source statuses as `published`, `matched`, and `closed`.
- `api/admin/[...action].js` dashboard active/pending transport count now uses `published` and `matched` instead of legacy `draft` and `open`.
- Dashboard stats now also expose separate `transport_requests_published` and `transport_requests_matched` counts for callers that need to distinguish unmatched active requests from matched active requests.
- Storage order statuses remain unchanged: `pending_confirmation`, `confirmed`, `cancelled`.
- Second application-layer cleanup completed for the allowed transport group API/listing files:
  - `api/transport-groups/index.js` no longer converts `single_member` or `active` to `open` in its missing-`group_id` fallback insert path.
  - `api/transport-groups/[id].js` no longer converts `single_member` or `active` to `open` in its missing-`group_id` fallback update path.
  - `api/transport-groups/index.js` and `api/transport-groups/[id].js` now normalize legacy input `status=open` to `active` before payload validation, so `open` is not written by these endpoints.
  - `public-api-handlers/transport-groups.js` now treats public `status=open` input as `single_member` plus `active` and no longer includes `open` or `full` in the default public joinable listing query.
- `transport-shared.js` still keeps the legacy `open` label only as display compatibility.
- Third application-layer cleanup completed for `api/_lib/transport-group-lifecycle.js`:
  - legacy missing-`group_id` group creation fallback now writes `single_member` for non-closed single-request groups instead of `open`.
  - legacy missing-`group_id` group sync fallback now writes the computed current status directly: `single_member`, `active`, `full`, or `closed`.
  - legacy `open` group records are still accepted on read, but normalized to `active` before the helper returns them.
- Supabase read-only production verification completed:
  - `transport_groups.status`: `active` 2, `closed` 3, `full` 1, `single_member` 12.
  - `transport_groups.status = open`: 0 rows.
  - `transport_requests.status`: `closed` 3, `matched` 2, `published` 2.
  - `transport_requests` invalid statuses outside `published` / `matched` / `closed`: 0 rows.
  - `orders` where `source_table = transport_requests`: `closed` 3, `matched` 2, `published` 2.
  - `orders.status` mismatches against `transport_requests.status`: 0 rows.

Confirmed current transport request statuses:

- `api/_lib/transport.js:1` defines `REQUEST_STATUSES = ["published", "matched", "closed"]`.
- `supabase/transport_dispatch.sql:42` checks request status in `published`, `matched`, `closed`.
- `supabase/transport_request_status_unification.sql:31` also checks request status in `published`, `matched`, `closed`.

Confirmed current transport group statuses:

- `api/_lib/transport.js:2` defines `GROUP_STATUSES = ["single_member", "active", "full", "closed", "cancelled"]`.
- `supabase/transport_dispatch.sql:214` checks group status in `single_member`, `active`, `full`, `closed`, `cancelled`.
- `supabase/transport_dispatch.sql:350` repeats the same group status check.

Legacy or conflicting status usage:

- Before first mitigation, `api/_lib/orders.js:3` mapped `transport_requests` statuses as `["draft", "open", "closed", "cancelled"]`.
- Before first mitigation, `api/admin/[...action].js:635` counted pending transport requests with `["draft", "open"]`.
- `api/_lib/transport.js:164` maps group values `open` or `draft` to `single_member`.
- `api/_lib/transport.js:304` normalizes group records with `open` or `draft`.
- Before third mitigation, `api/_lib/transport-group-lifecycle.js:99` wrote group status `"open"` when a request was not closed.
- Before third mitigation, `api/_lib/transport-group-lifecycle.js:316-319` could compute `"open"` in group lifecycle logic.
- Before second mitigation, `api/transport-groups/index.js:463` mapped `single_member`/`active` to `"open"` in an insert path.
- Before second mitigation, `api/transport-groups/[id].js:314` mapped `single_member`/`active` to `"open"` in an update path.
- Before second mitigation, `public-api-handlers/transport-groups.js:45` included `open` and `full` in the public joinable listing status filter.
- `supabase/20260416_public_transport_groups_indexes.sql:8` and `:18` include group status `open`.

Interpretation:

- `published`, `matched`, `closed` are current `transport_requests` statuses.
- `single_member`, `active`, `full`, `closed`, `cancelled` are current `transport_groups` statuses.
- `open` and `draft` appear to be legacy group/request concepts or general-order labels.
- `cancelled` is current for groups and storage/general order, but not a current transport request status.

Impact:

- Dashboard pending/active transport count has been aligned to `published/matched`.
- The edited group insert/update fallback paths no longer write `open` to `transport_groups`.
- Public group listing now queries only `single_member` and `active` by default, so `full`, `closed`, and `cancelled` are excluded from the joinable public list.
- The edited lifecycle helper paths no longer write or compute `open`; historical `open` records read through this helper normalize to `active` before return.
- Supabase read-only verification found no real `transport_groups.status = open` rows and no invalid `transport_requests.status` rows.
- Transport-source `orders.status` currently matches `transport_requests.status`.
- General order status validation for transport source rows has been aligned to current `transport_requests.status`.

Needs confirmation:

- Whether any DB trigger/view maps `open` to `single_member` after API writes.
- Whether general `orders` table intentionally keeps legacy transport labels independent of `transport_requests.status`.
- Whether future historical imports or manual DB edits could still introduce `open` / `draft` values.

Recommended limited fix scope:

- Completed first pass:
  - `api/_lib/orders.js`
  - `api/admin/[...action].js`
- Completed second pass for allowed transport group API/listing files:
  - `api/transport-groups/index.js`
  - `api/transport-groups/[id].js`
  - `public-api-handlers/transport-groups.js`
  - `transport-shared.js` checked; no code change needed because `open` is label-only compatibility there.
- Completed third pass for lifecycle write/compute paths:
  - `api/_lib/transport-group-lifecycle.js`
- Completed Supabase read-only production data check:
  - no transport status cleanup migration is currently needed for existing production rows.
- Next pass should handle remaining deeper normalization or persistence compatibility points:
  - `api/_lib/transport.js` legacy normalization if the team wants to remove or narrow `open`/`draft` compatibility
  - any future Supabase migration/view file only if new evidence shows legacy rows or SQL constraints still require it
- Verify admin dashboard counts and general order transport status updates before continuing to group status cleanup.

### P2-2 `transport-public.previous-good.js` Is HTML Captured As JS

Evidence:

- `transport-public.previous-good.js:1` starts with `<!doctype html><html...><title>Authentication Required</title>`.
- It includes Vercel auth instructions and links to `vercel.com/sso-api`.
- `rg` found no active HTML page loading `transport-public.previous-good.js`.
- Active pages load `transport-public.js`:
  - `pickup.html:826`
  - `transport-board.html:96`
  - `pickup-original-backup.html:328`

Impact:

- If accessed directly, the `.js` file serves HTML content with a JavaScript extension.
- If accidentally referenced later, it would break client-side behavior.
- It may expose old Vercel deployment URLs/nonces captured at the time.

Needs confirmation:

- Whether the file is intentionally retained as historical evidence.
- Whether production static deploy serves this file.

Recommended limited fix scope:

- Move to a non-deploying archive location or delete after confirmation.
- Alternatively add it to `.vercelignore`.

## P3 Risks

### P3-1 `admin-storage.html` `storageTypeLabels is not defined` Appears Stale Or Not Reproducible By Static Scan

Evidence:

- `admin-pages.js:11` defines `const storageTypeLabels = {...}` inside the top-level IIFE.
- `admin-pages.js:1189` references `storageTypeLabels` inside `buildStorageDetailReadableMessage`.
- `admin-pages.js:1405` references `storageTypeLabels` inside storage detail rendering.
- `admin-storage.html:71-73` loads scripts in this order:
  - `admin-api.js`
  - `admin-shell.js`
  - `admin-pages.js`
- `admin-storage-detail.html:91-93` loads the same required sequence.
- Static search found no `storageTypeLabels` references outside `admin-pages.js`.

Interpretation:

- The specific `storageTypeLabels is not defined` risk in `docs/current-status.md` may be from an older version or a runtime path not visible from static scan.
- Based on current file contents, there is a local definition before the references in the same closure.

Impact:

- Needs browser/runtime confirmation.
- If the error still happens, it may be caused by cached old `admin-pages.js`, stale deployed asset, or a different undefined symbol nearby.

Recommended limited fix scope:

- Do not change code until reproduced.
- Verify with admin-storage page in browser console against current local and production assets.
- If reproducible, limit changes to `admin-pages.js` and possibly cache-bust query strings in `admin-storage.html` / `admin-storage-detail.html`.

## Recommended Fix Order

1. P0: secure/remove/ignore root credential JSON files and rotate any exposed credentials.
2. P1: restore or replace `api/_lib/transport-payment-email.js` payment confirmation helper.
3. P1: decide deploy retention policy for backup/tmp/inspection files and update deploy exclusions.
4. P2: define the canonical transport request/group/general-order status contract, then align mappings.
5. P2: archive or ignore `transport-public.previous-good.js`.
6. P3: reproduce or close the `storageTypeLabels` issue with browser verification.

## Human Confirmation Needed

1. Are the credentials in `admin-create-ops.json`, `admin-login-payload.json`, and `ops-login.json` real or still valid anywhere?
2. Should root JSON payload files ever be kept in the deployable project root?
3. Which backup/brand pages are intentionally public, if any?
4. Should `_inspect_src_zip_2/` and root `.tmp-*` logs be excluded from deployment?
5. Is payment confirmation email a required production workflow?
6. What is the intended canonical status model for general `orders` rows sourced from `transport_requests`?
7. Has `admin-storage.html` recently shown `storageTypeLabels is not defined` in production or only in an older local run?
