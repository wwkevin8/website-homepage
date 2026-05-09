# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-09
- Scope: admin change-password persistence and 404 fix

## Completed In This Task

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before making changes.
- Investigated the admin shell "修改密码" modal showing `The page could not be found`.
- Confirmed the modal logic lives in `admin-shell.js` and calls `AdminApi.changeOwnPassword()` from `admin-api.js`.
- Confirmed the intended backend handler is `POST /api/admin/me/change-password` in `api/admin/[...action].js`.
- Confirmed the request body fields are `current_password`, `new_password`, and `confirm_password`.
- Kept the intended endpoint as the primary request, and added a one-segment admin action fallback for environments where deep catch-all admin routes return 404.
- Added frontend validation for missing current password, short new password, and mismatched confirmation before sending the request.
- Improved admin change-password error messages and changed success handling to log out and redirect to the admin login page.
- Investigated why the old password still worked after changing the bootstrap admin password.
- Confirmed `handleLogin()` runs `ensureBootstrapSuperAdmin()` before password verification, and the previous bootstrap path overwrote an existing bootstrap user's `password_hash` from `ADMIN_BOOTSTRAP_PASSWORD`.
- Updated `api/_lib/admin-auth.js` so an existing bootstrap admin account no longer has `password_hash` overwritten from environment variables; bootstrap password is now only used for initial account creation.
- No password values were logged or written to files.
- No database, SQL, schema, CSS, package file, deployment, or commit was performed.

## Verification

- `node --check admin-shell.js`, `node --check admin-api.js`, `node --check "api/admin/[...action].js"`, and `node --check api/_lib/admin-auth.js` passed.
- Pending: manually retest the admin change-password modal with real credentials through the UI.

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
- The admin change-password modal now has clearer client-side validation and a fallback for deep admin route 404s.
- Existing bootstrap admin accounts no longer have their password hash overwritten from `ADMIN_BOOTSTRAP_PASSWORD` during login.

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
3. Manually retest the admin change-password modal, then commit the small admin auth UI/API routing fix if acceptable.
4. Run a separate focused admin dashboard check for `published` / `matched` transport statistics.
5. Defer any transport status database migration unless future checks find legacy rows.
