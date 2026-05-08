# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-08
- Scope: record completed admin performance phases and deployment-readiness recommendation

## Completed In This Task

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before updating status.
- Updated this handoff document only; no business code, UI, database schema, Vue migration, or frontend page changes were made in this task.
- Recorded the current admin performance investigation outcome:
  - Phase 1: list/API query optimization completed.
  - Phase 2: auth/session repeated request optimization completed.
  - Phase 3: performance log coverage completed.
  - Phase 4: dashboard backend lightweight optimization completed.
- Recorded the latest dashboard validation result:
  - Before: `statsQueryMs` 579ms, `countMs` 579ms, `totalMs` 862ms.
  - After: `authMs` 146ms, `statsQueryMs` 197ms, `countMs` 197ms, `totalMs` 344ms, `cacheTtlMs` 120000.
- Recorded the current conclusion that backend business APIs are generally healthy and local Chrome Network delays are likely dominated by local `vercel dev`, function wrapping, browser waiting, or platform overhead rather than business query code.

## Verification

- Documentation-only update; no code verification required.

## Current Project Status

- The transport dispatch app remains a static multi-page website plus Vercel serverless APIs.
- Public-facing pages must continue to avoid exposing private user data.
- Backend admin APIs still perform their own server-side auth checks and must not trust frontend `sessionStorage`.
- Admin session frontend caching is working across same-tab page switches.
- Admin backend performance work is complete enough for the current phase:
  - Dashboard backend total time is now around 344ms in local logs after lightweight count and cache changes.
  - Orders, users, managers, transport sync audit logs, storage list, transport requests, and transport groups are all currently in an acceptable backend timing range based on `[perf]` logs.
- Vue admin migration is not currently recommended as a performance fix.
- Further local micro-optimization is not recommended right now; the next meaningful performance check should happen after deployment using online Vercel Function Logs.
- Performance logs are for diagnosis only and should not output cookies, session tokens, passwords, complete user profiles, or full order JSON.
- Storage order list rows should remain lightweight and must not re-add `customer_form_json`, `final_readable_message`, or `service_flags_json` just to satisfy list-page compatibility.

## Open Issues Or Risks

- Vercel cold starts and separate serverless instances can still make API timing differ from local warm-instance logs.
- Local Chrome Network timings around 1.5s-2s should not be treated as direct business-query time without comparing backend `[perf]` totals.
- Dashboard display counts using estimated count may be approximate and should not be treated as audit-grade totals.
- Dashboard cards can be stale for up to 120 seconds on the same warm serverless instance.
- `countMs` is logged as the base Supabase request duration when the count is bundled into the same Supabase query, because PostgREST count timing is not separately exposed by the client.
- `api/transport-sync-audit-logs.js` is the actual route file; there is no current `api/transport-sync-audit-logs/index.js`.
- P2 todo: `admin-storage.html` has `storageTypeLabels is not defined`. Current impact is low because the storage admin page is not officially open; it must be fixed before opening. The fix must not reintroduce heavy JSON fields into the storage list API.

## Recommended Next Steps

1. Stop further local performance optimization for now.
2. Prepare deployment when the intended code state is ready, following the project rule to push the latest intended code to GitHub before any Vercel deployment.
3. After deployment, retest admin pages using online Vercel Function Logs and compare `[perf]` backend totals with Chrome Network timings.
4. Fix the P2 `admin-storage.html` `storageTypeLabels is not defined` issue before opening the storage admin page publicly.
