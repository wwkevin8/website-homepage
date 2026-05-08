# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-08
- Scope: Fixed pickup/dropoff registration time showing one hour later after submission

## Completed In This Task

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before testing and changes.
- Investigated the pickup/dropoff registration time path without changing business code.
- Confirmed `pickup-form.js` submits `datetime-local` values such as `2026-06-01T10:00` without timezone information.
- Confirmed backend normalization in `api/_lib/transport.js` uses `new Date(value).toISOString()`, so on Vercel's UTC runtime a summer UK local time can be saved one hour later than intended when later displayed in `Europe/London`.
- Reproduced the offset with a UTC runtime example: `2026-06-01T10:00` saves as `2026-06-01T10:00:00.000Z` and displays as `2026/06/01 11:00` in London time.
- Fixed `api/_lib/transport.js` so timezone-less transport datetime values from `datetime-local` inputs are parsed as `Europe/London` local time before being stored as UTC ISO strings.
- Preserved existing behavior for datetime values that already include an explicit timezone, such as values ending in `Z`.
- Ran a 30-account local comprehensive browser test on an isolated local helper server at `http://localhost:3108`.
- Covered 30 mocked authenticated accounts across:
  - 10 `storage_return`取寄存/取回 submissions
  - 10 `storage_collection` calculator-to-booking submissions
  - 5 pickup form submissions
  - 5 logged-in navigation/service-center checks
- Verified each account could load public pages, view only its own mocked service-center storage order, and avoid leaking the next account's mocked order number.
- Verified 20 storage booking submissions and 5 pickup form submissions via mocked public submit endpoints, so no real orders or notifications were created.
- Found and fixed a storage booking payload issue: when a user had previously visited the storage estimate page, `storage_return` could carry stale estimate/calculator data. `storage_return` now submits empty `estimateSummary` and `calculatorSnapshot`; only `storage_collection` carries calculator data.
- Final QA30 report:
  - Run ID: `qa30-green-2026-05-08T02-51-45-106Z`
  - Output: `E:\webside\output\qa30\qa30-green-2026-05-08T02-51-45-106Z\`
  - 30/30 accounts passed
  - 90/90 checks passed
  - Page errors: 0
  - Failed non-static/non-external requests: 0
  - Storage submits: 20 total, 10 return and 10 collection
  - `storage_return` with estimate summary: 0
  - Transport submits: 5

## Verification

- Reviewed `pickup-form.js`, `api/_lib/transport.js`, `public-api-handlers/transport-request-submit.js`, `api/_lib/transport-group-lifecycle.js`, `transport-shared.js`, and `service-center.js`.
- Ran a UTC runtime date parsing check for `datetime-local` values.
- Verified `mapRequestPayload` converts summer UK local `2026-06-01T10:00` to `2026-06-01T09:00:00.000Z` and displays back as `2026/06/01 10:00` in `Europe/London`.
- Verified `mapRequestPayload` keeps winter UK local `2026-01-01T10:00` as `2026-01-01T10:00:00.000Z`.
- Verified `mapGroupPayload` applies the same London-local conversion for transport group flight and preferred times.
- `node --check E:\webside\api\_lib\transport.js`
- `node --check E:\webside\script.js`
- QA30 comprehensive browser automation against `http://localhost:3108`
- `npm run build:prod`

## Current Project Status

- The transport dispatch app remains a static multi-page website plus Vercel serverless APIs.
- Production is live at `https://ngn.best`.
- Latest deployed production URL is `https://webside-kfq6rikzk-wwkevin8s-projects.vercel.app`.
- Latest deployed code commit is `52ac208` on branch `codex/full-sync`.
- The latest local QA30 run passed across 30 mocked accounts and 90 checks, but the payload fix in `script.js` is a new local change after the latest production deployment.
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

- The `script.js` payload fix has passed local QA and production build, but it is not yet pushed or deployed in the latest production deployment listed above.
- The `api/_lib/transport.js` timezone fix has passed local parsing checks and production build, but it is not yet pushed or deployed in the latest production deployment listed above.
- Vercel error logs still show Node `[DEP0169] url.parse()` deprecation warnings on some unauthenticated requests. This should be cleaned up later so error-level logs stay useful.
- Vercel cold starts and separate serverless instances can make online API timing differ from local warm-instance logs.
- Local Chrome Network timings around 1.5s-2s should not be treated as direct business-query time without comparing backend `[perf]` totals.
- Dashboard display counts using estimated count may be approximate and should not be treated as audit-grade totals.
- Dashboard cards can be stale for up to 120 seconds on the same warm serverless instance.
- `countMs` is logged as the base Supabase request duration when the count is bundled into the same Supabase query, because PostgREST count timing is not separately exposed by the client.
- `api/transport-sync-audit-logs.js` is the actual route file; there is no current `api/transport-sync-audit-logs/index.js`.
- P2 todo: `admin-storage.html` has `storageTypeLabels is not defined`. Current impact is low because the storage admin page is not officially open; it must be fixed before opening. The fix must not reintroduce heavy JSON fields into the storage list API.
- QA30 recorded non-fatal external/media request failures in local browser context: `img/pickupvideo/pickupvideo2.0.mp4`, Cloudflare Turnstile script, and Google Fonts. These did not affect the core mocked-account flows but should be checked if visual/media completeness is part of launch acceptance.

## Recommended Next Steps

1. Push and deploy the local `script.js` payload fix and `api/_lib/transport.js` timezone fix before relying on the current QA30 result in production.
2. Retest key admin pages while logged in on `https://ngn.best`, then compare Chrome Network with online Vercel Function Logs.
3. Run one controlled real storage submission in the intended environment before officially opening the storage flow.
4. Confirm whether `img/pickupvideo/pickupvideo2.0.mp4` should exist, be removed from markup, or be treated as optional.
5. Fix the P2 `admin-storage.html` `storageTypeLabels is not defined` issue before opening the storage admin page publicly.
6. Later, clean up Node `[DEP0169] url.parse()` warnings so Vercel error-level logs remain clean.
