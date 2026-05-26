# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-26
- Scope: P6 performance patch v2 for the admin carpool group management page, rebuilt from production-good baseline commit `a88b1f1` instead of the broken P6 v1 commit `801a416`. The patch keeps the restored group list, validity filter, service-time sort filter, service type, airport, group status, keyword, advanced filters, UI actions, price display, payment display, member enrichment, and risk display. No production database writes, test data, SQL, price logic, payment logic, email behavior, or production deployment were performed.

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

- Updated `docs/PROJECT_MAP.md` for the `/api/transport-groups` paginated admin-list behavior.
- Rebuilt the generated admin bundle:
  - `/admin/` now references `admin/assets/index-D2JRQ_Iz.js`.
  - Stylesheet remains `admin/assets/index-DfE4uMCS.css`.

## Verification

- Read `E:\webside\AGENTS.md`, `E:\webside\docs\current-status.md`, and the Vercel deployment skill instructions for this task.
- Confirmed baseline commit `a88b1f1` (`Fix transport request active default`) and created clean branch/worktree `codex/p6-performance-v2` from it.
- Confirmed the main `E:\webside` worktree is dirty and was not used as the v2 baseline.
- `node --check api/transport-groups/index.js` passed.
- `npm --prefix apps/admin-vue ci` completed with `0 vulnerabilities`.
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning.
- Preview deployment and online browser/API validation are still pending.

## Current Project State

- Production `https://ngn.best` remains on the rollback-restored usable deployment before P6 v2; production has not been changed by this task.
- Admin Vue source is the canonical admin UI source; `npm --prefix apps/admin-vue run build` refreshes the served `admin/` bundle.
- The intended v2 branch is `codex/p6-performance-v2` from baseline `a88b1f1`.
- P6 v2 is ready for GitHub push and Vercel Preview deployment.

## Open Risks / Follow-Up

- Preview must confirm the admin group page still displays groups and keeps the validity/time-sort UI.
- Preview must confirm the first network request includes `paginate=true&page=1&page_size=10` and page 2 requests include `page=2&page_size=10`.
- Preview must confirm unauthenticated `/api/transport-groups` returns JSON/401 and does not expose source text.
- Advanced filters based on derived enriched data, such as risk/payment/offline/readiness, remain evaluated on the loaded page data. Moving those fully server-side would be a separate, broader patch.
