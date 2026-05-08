# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-09
- Scope: P2 first-pass transport request status mapping cleanup

## Completed In This Task

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before making changes.
- Updated `E:\webside\api\_lib\orders.js` so general orders sourced from `transport_requests` validate against current request statuses: `published`, `matched`, `closed`.
- Updated `E:\webside\api\admin\[...action].js` dashboard transport active/pending count to use `published` and `matched` instead of legacy `draft` and `open`.
- Added dashboard card fields for `transport_requests_published` and `transport_requests_matched`.
- Left storage order statuses unchanged.
- Left transport group legacy `open` fallback untouched for the next scoped task.
- Updated `E:\webside\docs\RISK_REGISTER.md` with first-pass P2 mitigation status.
- No HTML, CSS, frontend JS, admin page JS, SQL, `package.json`, transport group API, public transport group API, deployment, or commit was performed.

## Verification

- `node --check api\_lib\orders.js`
- `node --check "api\admin\[...action].js"`
- `rg` check confirmed `api/_lib/orders.js` now maps transport source statuses to `published`, `matched`, and `closed`.
- `rg` check confirmed `api/admin/[...action].js` dashboard transport count now uses `published` and `matched`.
- Pending manual/API check: verify admin dashboard cards from `/api/admin/dashboard` with real data.

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
- Transport group legacy `open` compatibility remains unresolved and should be handled separately.

## Open Issues Or Risks

- P0 follow-up: rotate any admin/ops credentials that may have appeared in the previous root JSON payload files.
- P0 follow-up: previous versions of the root JSON payload files may still exist in Git history.
- P0 follow-up: consider moving example payloads to `docs/examples/*.example.json` in a future task.
- P1 follow-up: run a focused API smoke test against `PATCH /api/transport-requests/:id` with safe test data and configured email variables.
- P1 follow-up: verify the next Vercel deployment does not include the newly excluded historical root files.
- P1 follow-up: rename `styles-pickup-backup.css` to a formal production filename in a separate task and update `pickup.html` at the same time.
- P2 follow-up: verify admin dashboard transport counts and general order status updates after first-pass mapping cleanup.
- P2 follow-up: transport group legacy `open` compatibility remains in group lifecycle/API/public group query code.
- P2: `transport-public.previous-good.js` is captured HTML with old Vercel auth URLs/nonces.
- P3: `admin-storage.html` storage label issue needs runtime/browser confirmation before code changes.
- Exact production email provider mix remains unclear because code supports Resend and SMTP across different flows.
- Google/OAuth provider status is unclear from repo scan; `google-auth.js` and `auth-callback.html` exist but active provider settings are external.

## Recommended Next Steps

1. Rotate the admin and operations account passwords that may have appeared in the previous root JSON payload files.
2. Decide whether local root payload files should eventually be replaced by non-sensitive example files under `docs/examples`.
3. Commit and deploy the sanitized/ignore/index-removal changes after review.
4. Verify admin dashboard cards from `/api/admin/dashboard`, especially transport total, active/pending, published, and matched counts.
5. Plan the next scoped P2 task for transport group legacy `open` cleanup.
