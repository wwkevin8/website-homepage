# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-26
- Scope: P6 performance patch v1 for admin transport request and carpool group list first-screen loading. The patch narrows carpool group list loading to server-side pagination and avoids reloading transport request operator options on every page. Source commit `801a416`; production deployment `dpl_7MjGbchq2YNWLvgRVjC775oYKiWE` is Ready and aliased to `https://ngn.best`. No production data, database schema, SQL indexes, business rules, price logic, payment logic, email behavior, or deployment configuration was changed.

## Latest Completed Work

- Updated `apps/admin-vue/src/views/TransportGroupsView.vue`:
  - Initial carpool group page load now requests `/api/transport-groups?paginate=true&page=1&page_size=10&validity=active&sort=service_time_asc`.
  - Pagination now fetches the requested server page instead of slicing a full in-browser active-group list.
  - Server-supported filters are sent to the API: service type, airport, status, validity, service-time sort, frontend visibility, date range, and keyword.
  - Validity/sort/page-size changes reset to page 1 and refetch.
  - Existing group row UI, action buttons, member enrichment display, dispatch summaries, payment display, price display, and risk display were preserved.

- Updated `api/transport-groups/index.js`:
  - Existing paginated list path is now used by the admin page.
  - Keyword matching for group pagination can resolve group ids and related member request fields before enrichment.
  - Existing enrichment logic remains batch-based and is now limited to the requested page for the default admin list.

- Updated `api/transport-requests/index.js` and `apps/admin-vue/src/views/TransportRequestsView.vue`:
  - Paginated transport request list still defaults to valid orders and nearest flight/service time.
  - `last_operated_by` operator options are loaded on page 1, not every page.
  - The frontend preserves previously loaded operator options when later pages omit `operator_options`, so the operator filter remains usable.

- Updated `docs/PROJECT_MAP.md` for the changed list behavior of `/api/transport-groups` and `/api/transport-requests`.

- Released to production from a clean detached worktree at commit `801a416` so unrelated local uncommitted files were not included:
  - GitHub branch: `origin/codex/p6-performance-v1`
  - Vercel deployment: `dpl_7MjGbchq2YNWLvgRVjC775oYKiWE`
  - Production URL: `https://webside-ljtf7973r-wwkevin8s-projects.vercel.app`
  - Alias: `https://ngn.best`
  - Production state: `READY`

## Verification

- `node --check api/transport-groups/index.js` passed.
- `node --check api/transport-requests/index.js` passed.
- `npm --prefix apps/admin-vue run build` passed with the existing Vite large-chunk warning.
- Build output refreshed:
  - `admin/index.html`
  - `admin/assets/index-CJ4JLX1e.js`
  - `admin/assets/index-Cn3hgMJD.css`
- Vercel production build for deployment `dpl_7MjGbchq2YNWLvgRVjC775oYKiWE` passed and output:
  - `/admin/assets/index-oXl2evCZ.js`
  - `/admin/assets/index-DfE4uMCS.css`
- `git diff --check` passed, with line-ending warnings only.
- Local helper server was started at `http://localhost:3000` and then stopped.
- Browser verification with mocked admin session confirmed:
  - Carpool group initial request: `/api/transport-groups?paginate=true&page=1&page_size=10&validity=active&sort=service_time_asc`
  - Next page request: `/api/transport-groups?paginate=true&page=2&page_size=10&validity=active&sort=service_time_asc`
  - Validity switch request: `/api/transport-groups?paginate=true&page=1&page_size=10&validity=invalid&sort=service_time_asc`
  - Sort switch request: `/api/transport-groups?paginate=true&page=1&page_size=10&validity=invalid&sort=service_time_desc`
  - Transport request initial request remains `/api/transport-requests?paginate=true&page=1&page_size=10&status=active&sort=flight_nearest`
- No production API was called with an authenticated session, and no production data was created, edited, deleted, cleared, or overwritten.

## Current Project State

- Admin Vue source is the canonical admin UI source; `npm --prefix apps/admin-vue run build` refreshes the served `admin/` bundle.
- The carpool group admin list no longer loads all active groups before first-screen pagination.
- The transport request admin list remains server-paginated and keeps its default valid-order filter.
- Production `https://ngn.best` is aliased to P6 performance deployment `dpl_7MjGbchq2YNWLvgRVjC775oYKiWE`.
- No SQL index was added in this patch.

## Open Risks / Follow-Up

- Advanced carpool filters that depend on derived enriched data, such as risk/payment/offline/readiness, are still evaluated on the loaded page data. Moving those fully server-side would be a separate, broader patch.
- `/api/transport-groups` still runs `cleanupEmptyTransportGroups` on GET as existing behavior; this patch did not change group lifecycle cleanup.
- If production is still slow after this patch, add production-safe sampled perf timing around group base query, cleanup, member query, duplicate lookup, and enrichment before considering SQL indexes or RPC/view changes.
