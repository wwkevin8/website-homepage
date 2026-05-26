# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-26
- Scope: P6 performance patch v2.1 for the admin carpool group management API after Preview acceptance found first-screen `/api/transport-groups` still near 7 seconds. The patch keeps the restored group list, validity filter, service-time sort filter, service type, airport, group status, keyword, advanced filters, UI actions, price display, payment display, member enrichment, and risk display. The branch was pushed to GitHub and deployed to Vercel Preview only. No production database writes, test data, SQL, price logic, payment logic, email behavior, or production deployment were performed.

## Latest Completed Work

- Updated `apps/admin-vue/src/views/TransportGroupsView.vue`:
  - The first carpool group admin request now uses server pagination with `paginate=true&page=1&page_size=10&validity=active&sort=service_time_asc`.
  - Page changes now request only the selected server page instead of slicing a full loaded list in the browser.
  - Service type, airport, group status, validity, service-time sort, keyword, frontend visibility, date range, and page size changes reset to page 1 and refetch.
  - Empty filter values are stripped before the request, so blank UI controls are not sent as active conditions.
  - Existing row rendering, actions, export behavior, member display, price/payment display, offline/risk/readiness display, and advanced filter controls are preserved.

- Updated `api/transport-groups/index.js`:
  - Existing paginated GET support is now used by the admin page.
  - Keyword/group search can match group id plus related member request fields including order number, student name, phone, WeChat, flight number, address, and terminal before page enrichment.
  - Enrichment remains batch-based and is limited to the requested page for the default list path.
  - P6 v2.1 adds Preview-safe performance logs for auth/session, query parsing, cleanup, base page query, count query, member enrichment, payment/offline summary building, duplicate future lookup, stats, risk/status row building, and total handler time.
  - P6 v2.1 skips the existing empty-group cleanup for paginated GET list requests so the first-screen list remains read-only and does not scan/delete groups before returning page 1. Non-paginated GET keeps the existing cleanup behavior.
  - P6 v2.1 separates data and count queries and runs them in parallel, and runs dispatch-status and member enrichment queries in parallel for the current page group ids only.

- Updated `docs/PROJECT_MAP.md` for the `/api/transport-groups` paginated admin-list behavior.
- Rebuilt the generated admin bundle:
  - `/admin/` now references `admin/assets/index-D2JRQ_Iz.js`.
  - Stylesheet remains `admin/assets/index-DfE4uMCS.css`.

- Release state:
  - Git commit: `bf2a7c1` (`Improve transport group admin first load`)
  - P6 v2.1 commit: `e441e36` (`Instrument transport group pagination performance`)
  - GitHub branch pushed: `origin/codex/p6-performance-v2`
  - Vercel Preview deployment: `dpl_Hqr5BzazFjZEM5Ka99HuhwpcofBP`
  - Preview URL: `https://webside-bd00d1cyw-wwkevin8s-projects.vercel.app`
  - Preview state: `READY`

## Verification

- Read `E:\webside\AGENTS.md`, `E:\webside\docs\current-status.md`, and the Vercel deployment skill instructions for this task.
- Confirmed baseline commit `a88b1f1` (`Fix transport request active default`) and created clean branch/worktree `codex/p6-performance-v2` from it.
- Confirmed the main `E:\webside` worktree is dirty and was not used as the v2 baseline.
- `node --check api/transport-groups/index.js` passed.
- `npm --prefix apps/admin-vue ci` completed with `0 vulnerabilities`.
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning.
- `git diff --check` passed with line-ending warnings only.
- Vercel Preview deployment completed successfully and reported `READY`.
- `vercel curl /admin/transport/groups --deployment webside-1unf4p573-wwkevin8s-projects.vercel.app` confirmed the preview admin page serves `/admin/assets/index-D2JRQ_Iz.js`.
- `vercel curl /api/transport-groups --deployment webside-1unf4p573-wwkevin8s-projects.vercel.app` returned the admin 401 JSON body `{"data":null,"error":{"message":"请先登录后台账号","details":null}}`, confirming the route is a serverless API and not source text.
- Local browser verification against the built Preview-equivalent bundle with mocked admin session/API confirmed:
  - First group request: `/api/transport-groups?paginate=true&page=1&page_size=10&validity=active&sort=service_time_asc`
  - Next-page request: `/api/transport-groups?paginate=true&page=2&page_size=10&validity=active&sort=service_time_asc`
  - Mock group data rendered in the table.
  - Validity and service-time sort controls remained present.
- P6 v2.1 verification:
  - `node --check api/transport-groups/index.js` passed.
  - `git diff --check` passed with line-ending warnings only.
  - Vercel Preview deployment `dpl_Hqr5BzazFjZEM5Ka99HuhwpcofBP` completed successfully and reported `READY`.
  - `vercel curl /api/transport-groups --deployment webside-bd00d1cyw-wwkevin8s-projects.vercel.app` returned the admin 401 JSON body `{"data":null,"error":{"message":"请先登录后台账号","details":null}}`, confirming the route is still a serverless API and not source text.
  - Authenticated operator timing logs are still pending because the agent does not have a real admin browser session.

## Current Project State

- Production `https://ngn.best` remains on the rollback-restored usable deployment before P6 v2; production has not been changed by this task.
- Admin Vue source is the canonical admin UI source; `npm --prefix apps/admin-vue run build` refreshes the served `admin/` bundle.
- The intended v2 branch is `codex/p6-performance-v2` from baseline `a88b1f1`.
- P6 v2.1 is deployed to Preview for operator timing validation before any production promotion.

## Open Risks / Follow-Up

- The Preview URL is protected by Vercel Deployment Protection, so direct browser access without Vercel authentication shows the Vercel auth interstitial. Use Vercel-authenticated access or `vercel curl` for agent verification.
- A logged-in production-like operator should refresh the v2.1 Preview group page once or twice so the new `[perf][transport-groups]` logs can confirm the exact first-screen timing split and whether warm requests are under the 3 second target.
- Advanced filters based on derived enriched data, such as risk/payment/offline/readiness, remain evaluated on the loaded page data. Moving those fully server-side would be a separate, broader patch.
