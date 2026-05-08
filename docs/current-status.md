# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-08
- Scope: Added origin column and prevented Excel hash marks in admin transport request export

## Completed In This Task

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before implementation.
- Updated `api/transport-requests/export.js` so the admin transport request CSV/Excel export:
  - selects `location_from` from `transport_requests`;
  - includes a new `出发地` column;
  - places `出发地` immediately before `目的地`;
  - formats submitted time and arrival/departure time as Excel text values so they do not display as `########` when opened from CSV.
- Left the admin table display unchanged; this task only changed the downloaded export.

## Verification

- `node --check E:\webside\api\transport-requests\export.js`
- Reviewed `git diff -- api/transport-requests/export.js` to confirm the change is limited to export column selection/order and date-time export formatting.

## Current Project Status

- The transport dispatch app remains a static multi-page website plus Vercel serverless APIs.
- Production is live at `https://ngn.best`.
- Latest deployed production URL is `https://webside-c5q5l26i9-wwkevin8s-projects.vercel.app`.
- Latest deployed code commit is `e7d292c` on branch `codex/full-sync`.
- Local working tree now contains an undeployed change in `api/transport-requests/export.js` for the admin transport request export.
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

- The export-column and Excel date-time display changes have been syntax-checked locally but have not been deployed to Vercel production yet.
- No authenticated browser download was performed during this task, so the exported file contents were not manually opened in Excel.
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

1. Deploy the export changes after pushing the intended code to GitHub.
2. After deployment, log in to the admin transport request page and download an export to confirm `出发地` appears immediately before `目的地` and time values display instead of `########` in Excel.
3. Run one controlled authenticated pickup/dropoff submission on production to confirm the displayed time remains exactly the submitted UK time.
4. Retest key admin pages while logged in on `https://ngn.best`, then compare Chrome Network with online Vercel Function Logs.
5. Run one controlled real storage submission in the intended environment before officially opening the storage flow.
6. Confirm whether `img/pickupvideo/pickupvideo2.0.mp4` should exist, be removed from markup, or be treated as optional.
7. Fix the P2 `admin-storage.html` `storageTypeLabels is not defined` issue before opening the storage admin page publicly.
8. Later, clean up Node `[DEP0169] url.parse()` warnings so Vercel error-level logs remain clean.
