# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-26
- Scope: P6 admin transport read-only GET and performance follow-up promoted to Production after Preview approval. Promoted Preview `dpl_CP6JbVUpXN1SxKng4hXuvTzFMymm` to Production deployment `dpl_F8J9STpjLnmcqy9dcZkMz91YxSN3`, live at `https://ngn.best`. Source code commit for the promoted artifact is `e3ee8a5` on branch `codex/p6-readonly-perf-fix`; post-verification status commit is `8be0f32`. No P7/P8/P9 code was changed.

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

- P6 read-only GET and performance follow-up:
  - Removed automatic maintenance writes from transport page/list/detail GET routes:
    - `GET /api/transport-requests/:id` no longer runs `backfillMissingPickupGroups` or `closeExpiredRequests`.
    - `GET /api/transport-groups` no longer runs `cleanupEmptyTransportGroups`.
    - `GET /api/transport-groups/:id` no longer runs `cleanupEmptyTransportGroups` or `deleteEmptyGroupIfEligible`.
    - Public transport board/my-transport/groups GET handlers no longer run transport lifecycle cleanup/backfill/expiry writes.
  - Added explicit admin-only `POST /api/transport-maintenance` for `backfill_missing_pickup_groups`, `close_expired_requests`, `cleanup_empty_groups`, and `run_all`.
  - Changed `/api/cron/close-expired-transport-requests` from GET to POST so this standalone transport maintenance route is not a writing GET.
  - Added temporary server perf logs for admin transport request detail, transport group list, and transport group detail.
  - Deployed Preview `dpl_CP6JbVUpXN1SxKng4hXuvTzFMymm` from clean branch `codex/p6-readonly-perf-fix`.
  - Promoted the validated Preview to Production deployment `dpl_F8J9STpjLnmcqy9dcZkMz91YxSN3`; aliases include `https://ngn.best` and `https://www.ngn.best`.
  - The accidental Preview-created group `GRP-260526-7L55` remains in production. It is a closed, non-public pickup group linked only to closed request `PU260526-0071`; rollback should be confirmed before any delete is run.

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
- P6 follow-up Preview verification on `https://webside-oipeaq2vk-wwkevin8s-projects.vercel.app`:
  - `node --check` passed for changed API/public handler files.
  - `npm run build:preview` passed with the existing admin large-chunk warning and existing root moderate `ws` advisory.
  - `git diff --check` passed with line-ending warnings only.
  - Preview deployment inspect shows `dpl_CP6JbVUpXN1SxKng4hXuvTzFMymm` is Ready.
  - Authenticated Preview API timings through Vercel protected access: transport request list about 1.5s, transport request detail about 1.8s, transport group list about 1.7s, transport group detail about 1.8s.
  - Default filters remained active/valid orders; default sorting remained nearest service/flight time first.
  - Pagination totals remained consistent: transport requests `total=41`, `total_pages=5`; transport groups `total=40`, `total_pages=4`.
  - Production counts before and after Preview GET checks stayed unchanged: `transport_requests=52`, `transport_groups=50`, `transport_group_members=50`, `admin_operation_logs=394`.
  - `GET /api/transport-maintenance` returns 405 and `GET /api/cron/close-expired-transport-requests` returns 405.
- P6 follow-up Production verification on `https://ngn.best` after promote to `dpl_F8J9STpjLnmcqy9dcZkMz91YxSN3`:
  - Production table counts stayed unchanged before/after each checked GET: `transport_requests=52`, `transport_groups=50`, `transport_group_members=50`, `admin_operation_logs=394`.
  - Admin transport request list returned HTTP 200 in about 1.8s with `total=41`, `total_pages=5`, active-order filtering, and nearest-time sorting.
  - Admin transport request detail returned HTTP 200 in about 1.5s and did not change production counts.
  - Admin transport group list returned HTTP 200 in about 2.4s with `total=40`, `total_pages=4`, active validity filtering, and nearest service-time sorting.
  - Admin transport group detail returned HTTP 200 in about 2.0s and did not change production counts.
  - Full request table returned HTTP 200 in about 0.8s with 41 rows; full group table returned HTTP 200 in about 1.9s with 40 rows.
  - Public transport groups endpoint returned HTTP 200 in about 1.2s with 20 rows and upcoming sorting.
  - No maintenance POST, data cleanup, test-data upload, order/group/member deletion, price rewrite, or P7 change was run.

## Current Project State

- Admin Vue source is the canonical admin UI source; `npm --prefix apps/admin-vue run build` refreshes the served `admin/` bundle.
- The carpool group admin list no longer loads all active groups before first-screen pagination.
- The transport request admin list remains server-paginated and keeps its default valid-order filter.
- P6 transport list/detail GET routes are now read-only for the checked admin/public transport surfaces.
- Production `https://ngn.best` is aliased to P6 follow-up deployment `dpl_F8J9STpjLnmcqy9dcZkMz91YxSN3`.
- The promoted P6 source code commit is `e3ee8a5` on branch `codex/p6-readonly-perf-fix`; `8be0f32` records the Preview verification status.
- No SQL index was added in this patch.

## Open Risks / Follow-Up

- Advanced carpool filters that depend on derived enriched data, such as risk/payment/offline/readiness, are still evaluated on the loaded page data. Moving those fully server-side would be a separate, broader patch.
- Full-project scan still shows some non-P6 scheduled or auth/profile GET-shaped routes that can write by design, such as storage sync cron and auth/session cookie clearing. This P6 follow-up only changed transport page/list/detail GETs and the standalone transport close-expired cron route.
- If production is still slow after this patch, use the temporary `[perf][transport-groups]`, `[perf][transport-group-detail]`, and `[perf][transport-request-detail]` logs to identify whether base query, member query, logs query, or enrichment is dominant before considering SQL indexes or RPC/view changes.
