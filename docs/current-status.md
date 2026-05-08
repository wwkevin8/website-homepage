# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-08
- Scope: push current storage/admin updates to GitHub and deploy production to Vercel

## Completed In This Task

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before deployment work.
- Confirmed the working tree was clean before deployment.
- Confirmed branch `codex/full-sync` was already synced with `origin/codex/full-sync` at commit `52ac208`.
- Ran `git push origin codex/full-sync`; GitHub reported `Everything up-to-date`.
- Ran `npm run build:prod`; production build completed successfully.
- Ran `npm run deploy:prod`; Vercel production deployment completed successfully.
- New Vercel deployment:
  - ID: `dpl_4AzvXkfedLM7o1bifevoHu9UJ69e`
  - URL: `https://webside-kfq6rikzk-wwkevin8s-projects.vercel.app`
  - Status: `READY`
  - Production alias: `https://ngn.best`
- Verified these production pages return 200:
  - `https://ngn.best/`
  - `https://ngn.best/storage.html`
  - `https://ngn.best/storage-booking.html?service=storage_return`
  - `https://ngn.best/admin-dashboard.html`
  - `https://ngn.best/admin-storage.html`
- Verified protected API routing:
  - `https://ngn.best/api/admin/dashboard` returns 401 when unauthenticated.
  - `https://ngn.best/api/public/my-storage-orders` returns 401 when unauthenticated.
  - `https://ngn.best/api/admin/session` reaches the API and returns 200 with unauthenticated session state.
- Inspected the deployment with Vercel CLI; deployment is `Ready` and aliases include `https://ngn.best` and `https://www.ngn.best`.
- Checked deployment error logs. No business 500 was observed; Vercel showed two Node `[DEP0169] url.parse()` deprecation warnings on unauthenticated verification requests.

## Verification

- `git status -sb`
- `git rev-list --left-right --count origin/codex/full-sync...HEAD`
- `git push origin codex/full-sync`
- `npm run build:prod`
- `npm run deploy:prod`
- Vercel inspect for `dpl_4AzvXkfedLM7o1bifevoHu9UJ69e`
- Production HTTP checks for public, storage, and admin pages.
- Production unauthenticated API checks for admin/public protected routes.
- Vercel error-log scan for the new deployment.

## Current Project Status

- The transport dispatch app remains a static multi-page website plus Vercel serverless APIs.
- Production is live at `https://ngn.best`.
- Latest deployed production URL is `https://webside-kfq6rikzk-wwkevin8s-projects.vercel.app`.
- Latest deployed code commit is `52ac208` on branch `codex/full-sync`.
- Public-facing pages must continue to avoid exposing private user data.
- Backend admin APIs still perform their own server-side auth checks and must not trust frontend `sessionStorage`.
- Admin session frontend caching is working across same-tab page switches.
- Admin backend performance work is complete enough for the current phase:
  - Dashboard backend total time was measured around 344ms in local logs after lightweight count and cache changes.
  - Orders, users, managers, transport sync audit logs, storage list, transport requests, and transport groups were all in acceptable backend timing range based on local `[perf]` logs.
- Vue admin migration is not currently recommended as a performance fix.
- Further local micro-optimization is not recommended right now; the next meaningful performance check should happen using online Vercel Function Logs.
- Storage order list rows should remain lightweight and must not re-add `customer_form_json`, `final_readable_message`, or `service_flags_json` just to satisfy list-page compatibility.

## Open Issues Or Risks

- Vercel error logs still show Node `[DEP0169] url.parse()` deprecation warnings on some unauthenticated requests. This should be cleaned up later so error-level logs stay useful.
- Vercel cold starts and separate serverless instances can make online API timing differ from local warm-instance logs.
- Local Chrome Network timings around 1.5s-2s should not be treated as direct business-query time without comparing backend `[perf]` totals.
- Dashboard display counts using estimated count may be approximate and should not be treated as audit-grade totals.
- Dashboard cards can be stale for up to 120 seconds on the same warm serverless instance.
- `countMs` is logged as the base Supabase request duration when the count is bundled into the same Supabase query, because PostgREST count timing is not separately exposed by the client.
- `api/transport-sync-audit-logs.js` is the actual route file; there is no current `api/transport-sync-audit-logs/index.js`.
- P2 todo: `admin-storage.html` has `storageTypeLabels is not defined`. Current impact is low because the storage admin page is not officially open; it must be fixed before opening. The fix must not reintroduce heavy JSON fields into the storage list API.

## Recommended Next Steps

1. Retest key admin pages while logged in on `https://ngn.best`, then compare Chrome Network with online Vercel Function Logs.
2. Run one controlled real storage submission in the intended environment before officially opening the storage flow.
3. Fix the P2 `admin-storage.html` `storageTypeLabels is not defined` issue before opening the storage admin page publicly.
4. Later, clean up Node `[DEP0169] url.parse()` warnings so Vercel error-level logs remain clean.
