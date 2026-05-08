# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-08
- Scope: P0 security close-out by removing sanitized root JSON payload files from Git tracking

## Completed In This Task

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before making changes.
- Ran `git rm --cached admin-create-ops.json admin-login-payload.json ops-login.json` to remove the sanitized payload files from Git tracking while keeping local copies.
- Added explicit ignore rules to `.gitignore` for:
  - `E:\webside\admin-create-ops.json`
  - `E:\webside\admin-login-payload.json`
  - `E:\webside\ops-login.json`
- Confirmed `git ls-files` no longer reports the three JSON files as tracked.
- Confirmed local copies still exist and are now ignored.
- Updated `E:\webside\docs\RISK_REGISTER.md` to record the tracking removal, remaining Git history risk, and manual credential-rotation requirement.
- No HTML, CSS, JS business code, API routes, SQL, `package.json`, or feature behavior were modified.

## Verification

- `git rm --cached admin-create-ops.json admin-login-payload.json ops-login.json`
- `git ls-files -- admin-create-ops.json admin-login-payload.json ops-login.json`
- `git status --short -- admin-create-ops.json admin-login-payload.json ops-login.json .gitignore docs/RISK_REGISTER.md docs/current-status.md`
- `Test-Path admin-create-ops.json`, `Test-Path admin-login-payload.json`, and `Test-Path ops-login.json`

## Current Project Status

- The transport dispatch app remains a static multi-page website plus Vercel serverless APIs.
- Production is live at `https://ngn.best`.
- Latest deployed production URL remains `https://webside-9camg7h8j-wwkevin8s-projects.vercel.app`.
- Latest deployed code commit remains `3498fb9` on branch `codex/full-sync`.
- The P0 root JSON exposure risk is mitigated in the current working tree by sanitization, deployment ignores, `.gitignore` rules, and removal from the Git index.
- The three JSON files are no longer tracked in the current Git index, and local copies remain ignored.
- Manual credential rotation is still required because previous values must be treated as potentially exposed and may remain in Git history.

## Open Issues Or Risks

- P0 follow-up: rotate any admin/ops credentials that may have appeared in the previous root JSON payload files.
- P0 follow-up: previous versions of the root JSON payload files may still exist in Git history.
- P0 follow-up: consider moving example payloads to `docs/examples/*.example.json` in a future task.
- P1: transport payment confirmation email path fails when payment marker changes from unpaid/not paid to paid.
- P1: root backup/static/temp/inspection artifacts may be publicly accessible unless Vercel/static behavior or ignore rules prevent it.
- P2: transport status contract is inconsistent across current request/group code, SQL, dashboard counts, and general order sync/mapping helpers.
- P2: `transport-public.previous-good.js` is captured HTML with old Vercel auth URLs/nonces.
- P3: `admin-storage.html` storage label issue needs runtime/browser confirmation before code changes.
- Exact production email provider mix remains unclear because code supports Resend and SMTP across different flows.
- Google/OAuth provider status is unclear from repo scan; `google-auth.js` and `auth-callback.html` exist but active provider settings are external.

## Recommended Next Steps

1. Rotate the admin and operations account passwords that may have appeared in the previous root JSON payload files.
2. Decide whether local root payload files should eventually be replaced by non-sensitive example files under `docs/examples`.
3. Commit and deploy the sanitized/ignore/index-removal changes after review.
4. Restore or replace `api/_lib/transport-payment-email.js` if transport payment confirmation email is required.
5. Decide the broader deploy retention policy for backup/brand/temp/inspection files.
