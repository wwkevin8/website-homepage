# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-26
- Scope: Promoted the already validated P6 performance patch v2.4 Preview to Vercel Production. The promoted version keeps the restored admin carpool group list, validity filter, service-time sort filter, service type, airport, group status, keyword, advanced filters, UI actions, price display, payment display, member enrichment, risk display, and stable pagination metadata. No production database writes, test data, SQL, price logic, payment logic, email behavior, or additional feature changes were performed.

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
  - P6 v2.3 adds lightweight list mode via `mode=list`; the first-screen list no longer waits for exact count, payment/offline enrichment, duplicate-future checks, risk construction, stats enrichment, or dispatch-readiness construction.
  - P6 v2.3 adds async current-page enrichment via `enrich_only=true&ids=...`; the admin page first renders the lightweight rows and then merges badge/risk/payment/readiness details when the enrichment response returns.
  - P6 v2.4 fixes light-mode pagination metadata: the API now returns stable `total`, `total_pages`, `has_next`, and `has_prev` from a count query using the same filters as the data query, without applying pagination range to count.
  - P6 v2.4 updates the admin pagination UI to use backend pagination metadata only, instead of falling back to current page row counts.

- Updated `docs/PROJECT_MAP.md` for the `/api/transport-groups` paginated admin-list behavior.
- Rebuilt the generated admin bundle:
  - `/admin/` now references `admin/assets/index-BcOYHrXF.js`.
  - Stylesheet remains `admin/assets/index-DfE4uMCS.css`.

- Release state:
  - Git commit: `bf2a7c1` (`Improve transport group admin first load`)
  - P6 v2.1 commit: `e441e36` (`Instrument transport group pagination performance`)
  - P6 v2.3 commit: `c6b7c4c` (`Split transport group list enrichment`)
  - P6 v2.4 commit: `e3dc578` (`Fix transport group pagination metadata`)
  - GitHub branch pushed: `origin/codex/p6-performance-v2`
  - Vercel Preview deployment: `dpl_HoTpHt3pcPZqitK8Dvp5aTX67cFe`
  - Preview URL: `https://webside-873hcdq0u-wwkevin8s-projects.vercel.app`
  - Preview state: `READY`
  - Vercel Production deployment: `dpl_B5jweX9oB93vJeavj21vJ2vGW9vf`
  - Production URL: `https://webside-i4qy69v4i-wwkevin8s-projects.vercel.app`
  - Production aliases: `https://ngn.best`, `https://www.ngn.best`
  - Production state: `READY`

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
- P6 v2.3 verification:
  - `node --check api/transport-groups/index.js` passed.
  - `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning.
  - `git diff --check` passed with line-ending warnings only.
  - Vercel Preview deployment `dpl_tQt1F9rwNQkSwFW39KPVUpSQVGiL` completed successfully and reported `READY`.
  - `vercel curl /api/transport-groups --deployment webside-gzk7mpo85-wwkevin8s-projects.vercel.app` returned admin 401 JSON, confirming the route is still a serverless API and not source text.
  - `vercel curl /admin/transport/groups --deployment webside-gzk7mpo85-wwkevin8s-projects.vercel.app` confirmed the preview admin page serves `/admin/assets/index-3VEMiO2e.js`.
  - Local browser verification with mocked admin session/API confirmed the first request is `/api/transport-groups?paginate=true&mode=list&page=1&page_size=10&validity=active&sort=service_time_asc`, followed by async `/api/transport-groups?enrich_only=true&ids=...`, and the lightweight group row renders before enrichment.
- P6 v2.4 verification:
  - `node --check api/transport-groups/index.js` passed.
  - `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning.
  - `git diff --check` passed with line-ending warnings only.
  - Local browser verification with mocked pagination metadata confirmed first page shows `第 1 / 4 页，共 35 条`, after three next-page clicks the last page shows `第 4 / 4 页，共 35 条`, and page 1-4 requests keep identical filters except `page`.
  - Vercel Preview deployment `dpl_HoTpHt3pcPZqitK8Dvp5aTX67cFe` completed successfully and reported `READY`.
  - `vercel curl /api/transport-groups --deployment webside-873hcdq0u-wwkevin8s-projects.vercel.app` returned admin 401 JSON, confirming the route is still a serverless API and not source text.
  - `vercel curl /admin/transport/groups --deployment webside-873hcdq0u-wwkevin8s-projects.vercel.app` confirmed the preview admin page serves `/admin/assets/index-BcOYHrXF.js`.
- P6 v2.4 production promotion verification:
  - Promoted Preview `webside-873hcdq0u-wwkevin8s-projects.vercel.app` to Production deployment `dpl_B5jweX9oB93vJeavj21vJ2vGW9vf`.
  - `vercel inspect ngn.best` and `vercel inspect www.ngn.best` both reported Production deployment `dpl_B5jweX9oB93vJeavj21vJ2vGW9vf` with state `READY`.
  - Cache-busted HTML checks for `https://ngn.best/admin/transport/groups?cache_bust=p6v24` and `https://www.ngn.best/admin/transport/groups?cache_bust=p6v24` both referenced `/admin/assets/index-BcOYHrXF.js`, confirming the aliases serve the v2.4 admin bundle.
  - Unauthenticated `GET https://ngn.best/api/transport-groups` returned HTTP 401, confirming the route is protected and did not return source text.
  - A logged-in Production browser session is still required to measure the real `/api/transport-groups` first-screen timing and visually confirm page 1/page 4 pagination after promotion.

## Current Project State

- Production `https://ngn.best` and `https://www.ngn.best` now point to P6 v2.4 deployment `dpl_B5jweX9oB93vJeavj21vJ2vGW9vf`.
- Admin Vue source is the canonical admin UI source; `npm --prefix apps/admin-vue run build` refreshes the served `admin/` bundle.
- The intended v2 branch is `codex/p6-performance-v2` from baseline `a88b1f1`.
- P6 v2.4 remains available on Preview `https://webside-873hcdq0u-wwkevin8s-projects.vercel.app` and has been promoted to Production.

## Open Risks / Follow-Up

- The Preview URL is protected by Vercel Deployment Protection, so direct browser access without Vercel authentication shows the Vercel auth interstitial. Use Vercel-authenticated access or `vercel curl` for agent verification.
- A logged-in Production operator should hard-refresh the carpool group admin page, confirm it serves the v2.4 bundle, verify page 1 and the last page show the same total/page count, and capture the real `/api/transport-groups` first-screen timing from browser Network.
- Advanced filters based on derived enriched data, such as risk/payment/offline/readiness, remain evaluated on the loaded page data. Moving those fully server-side would be a separate, broader patch.
