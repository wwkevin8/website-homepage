# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-08
- Scope: P1 Vercel exclusion for root historical HTML / JS / CSS files

## Completed In This Task

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before making changes.
- Updated `E:\webside\.vercelignore` to explicitly exclude root historical/backup files that should not be statically deployed:
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
- Preserved existing `.vercelignore` protections for `.tmp*`, `*.log`, `_inspect_src_zip_2/`, `backup/`, and `brand/`.
- Intentionally did not exclude `styles-pickup-backup.css` because current `pickup.html` still references it.
- Updated `E:\webside\docs\RISK_REGISTER.md` with the mitigation status and follow-up recommendation.
- No HTML, CSS, JS, API route, SQL, `.gitignore`, `package.json`, file move/delete/rename, deployment, or commit was performed.

## Verification

- `git diff -- .vercelignore docs/RISK_REGISTER.md docs/current-status.md`
- Confirmed `styles-pickup-backup.css` was not added to `.vercelignore`.

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

## Open Issues Or Risks

- P0 follow-up: rotate any admin/ops credentials that may have appeared in the previous root JSON payload files.
- P0 follow-up: previous versions of the root JSON payload files may still exist in Git history.
- P0 follow-up: consider moving example payloads to `docs/examples/*.example.json` in a future task.
- P1 follow-up: run a focused API smoke test against `PATCH /api/transport-requests/:id` with safe test data and configured email variables.
- P1 follow-up: verify the next Vercel deployment does not include the newly excluded historical root files.
- P1 follow-up: rename `styles-pickup-backup.css` to a formal production filename in a separate task and update `pickup.html` at the same time.
- P2: transport status contract is inconsistent across current request/group code, SQL, dashboard counts, and general order sync/mapping helpers.
- P2: `transport-public.previous-good.js` is captured HTML with old Vercel auth URLs/nonces.
- P3: `admin-storage.html` storage label issue needs runtime/browser confirmation before code changes.
- Exact production email provider mix remains unclear because code supports Resend and SMTP across different flows.
- Google/OAuth provider status is unclear from repo scan; `google-auth.js` and `auth-callback.html` exist but active provider settings are external.

## Recommended Next Steps

1. Rotate the admin and operations account passwords that may have appeared in the previous root JSON payload files.
2. Decide whether local root payload files should eventually be replaced by non-sensitive example files under `docs/examples`.
3. Commit and deploy the sanitized/ignore/index-removal changes after review.
4. Smoke test transport payment confirmation by marking a safe test request as paid through `PATCH /api/transport-requests/:id`.
5. Verify Vercel deploy output for excluded historical files before promoting the next deployment.
