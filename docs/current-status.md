# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-08
- Scope: Pushed and deployed admin transport request export fixes to Vercel production

## Completed In This Task

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before deployment work.
- Read the Vercel CLI deployment guidance before using Vercel production deploy commands.
- Updated and deployed `api/transport-requests/export.js` so the admin transport request CSV/Excel export:
  - selects `location_from` from `transport_requests`;
  - includes a new `出发地` column;
  - places `出发地` immediately before `目的地`;
  - formats submitted time and arrival/departure time as Excel text values so they do not display as `########` when opened from CSV.
- Left the admin table display unchanged; this task only changed the downloaded export.
- Committed and pushed commit `3498fb9` to `origin/codex/full-sync`.
- Deployed the pushed code to Vercel production.
- New Vercel deployment:
  - ID: `dpl_DVgMgLdhHkjyjCfMxJXt34JMZyHv`
  - URL: `https://webside-9camg7h8j-wwkevin8s-projects.vercel.app`
  - Status: `READY`
  - Production alias: `https://ngn.best`
- Verified Vercel aliases include `https://ngn.best` and `https://www.ngn.best`.

## Verification

- `node --check E:\webside\api\transport-requests\export.js`
- Reviewed `git diff -- api/transport-requests/export.js` to confirm the change is limited to export column selection/order and date-time export formatting.
- `npm run build:prod`
- `git push origin codex/full-sync`
- `npm run deploy:prod`
- `npx --yes vercel@53.1.0 inspect webside-9camg7h8j-wwkevin8s-projects.vercel.app`
- Production HTTP checks:
  - `https://ngn.best/` returned 200.
  - `https://ngn.best/transport-admin-requests.html` returned 200.
  - `https://ngn.best/api/public/transport-board` returned 200.
  - `https://ngn.best/api/admin/session` returned 200.
  - `https://ngn.best/api/transport-requests/export` returned 401 when unauthenticated.

## Current Project Status

- The transport dispatch app remains a static multi-page website plus Vercel serverless APIs.
- Production is live at `https://ngn.best`.
- Latest deployed production URL is `https://webside-9camg7h8j-wwkevin8s-projects.vercel.app`.
- Latest deployed code commit is `3498fb9` on branch `codex/full-sync`.
- Public-facing pages must continue to avoid exposing private user data.
- Backend admin APIs still perform their own server-side auth checks and must not trust frontend `sessionStorage`.
- Admin session frontend caching is working across same-tab page switches.
- Admin backend performance work is complete enough for the current phase:
  - Dashboard backend total time was measured around 344ms in local logs after lightweight count and cache changes.
  - Orders, users, managers, transport sync audit logs, storage list, transport requests, and transport groups were all in acceptable backend timing range based on local `[perf]` logs.
- Vue admin migration is not currently recommended as a performance fix.
- Further local micro-optimization is not recommended right now; the next meaningful performance check should happen using online Vercel Function Logs.
- Storage order list rows should remain lightweight and must not re-add `customer_form_json`, `final_readable_message`, or `service_flags_json` just to satisfy list-page compatibility.
- Storage booking now keeps stale calculator data out of `storage_return` payloads; only `storage_collection` carries estimate/calculator data.
- Pickup/dropoff registration now normalizes timezone-less form datetime values as `Europe/London` before storing UTC ISO strings, so summer UK times display unchanged after save.

## Open Issues Or Risks

- No authenticated browser download was performed during this task, so the exported file contents were not manually opened in Excel after deployment.
- The deployment was verified with production page/API smoke checks, but no real authenticated pickup/dropoff submission was made during deployment verification.
- Vercel error logs have previously shown Node `[DEP0169] url.parse()` deprecation warnings on some unauthenticated requests. This should be cleaned up later so error-level logs stay useful.
- Vercel cold starts and separate serverless instances can make online API timing differ from local warm-instance logs.
- Local Chrome Network timings around 1.5s-2s should not be treated as direct business-query time without comparing backend `[perf]` totals.
- Dashboard display counts using estimated count may be approximate and should not be treated as audit-grade totals.
- Dashboard cards can be stale for up to 120 seconds on the same warm serverless instance.
- `countMs` is logged as the base Supabase request duration when the count is bundled into the same Supabase query, because PostgREST count timing is not separately exposed by the client.
- `api/transport-sync-audit-logs.js` is the actual route file; there is no current `api/transport-sync-audit-logs/index.js`.
- P2 todo: `admin-storage.html` has `storageTypeLabels is not defined`. Current impact is low because the storage admin page is not officially open; it must be fixed before opening. The fix must not reintroduce heavy JSON fields into the storage list API.
- QA30 recorded non-fatal external/media request failures in local browser context: `img/pickupvideo/pickupvideo2.0.mp4`, Cloudflare Turnstile script, and Google Fonts. These did not affect the core mocked-account flows but should be checked if visual/media completeness is part of launch acceptance.

## Recommended Next Steps

1. Log in to the production admin transport request page and download an export to confirm `出发地` appears immediately before `目的地` and time values display instead of `########` in Excel.
2. Run one controlled authenticated pickup/dropoff submission on production to confirm the displayed time remains exactly the submitted UK time.
3. Retest key admin pages while logged in on `https://ngn.best`, then compare Chrome Network with online Vercel Function Logs.
4. Run one controlled real storage submission in the intended environment before officially opening the storage flow.
5. Confirm whether `img/pickupvideo/pickupvideo2.0.mp4` should exist, be removed from markup, or be treated as optional.
6. Fix the P2 `admin-storage.html` `storageTypeLabels is not defined` issue before opening the storage admin page publicly.
7. Later, clean up Node `[DEP0169] url.parse()` warnings so Vercel error-level logs remain clean.
