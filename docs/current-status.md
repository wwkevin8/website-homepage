# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-26
- Scope: Public carpool board performance patch prepared for release. Homepage preview now shows up to 10 future public groups, `/api/public/transport-groups` uses lightweight preview and server-side page-size-plus-one pagination, and the additive Supabase index migration has been applied to production. No transport orders/groups were created, edited, deleted, imported, or cleared; no test data was uploaded.

## Latest Completed Work

- Updated `public-api-handlers/transport-groups.js`:
  - Removed public GET empty-group cleanup, so public reads no longer scan/delete empty groups.
  - Added `mode=preview&limit=10` for the homepage with public-safe minimal fields.
  - Changed full-board listing to server-side `page/pageSize` pagination with `pageSize + 1` `has_next` detection instead of exact count.
  - Moved `group_id`, service type, airport, and date filters into the Supabase query.
  - Replaced broad `select("*")` and full-page enrichment with selected public columns plus one batched member-summary lookup for only the current page.
- Updated `transport-public.js` and `transport-api.js`:
  - Homepage preview now requests preview mode and displays up to 10 rows with the "仅展示最近 10 组" label.
  - Full board now requests `pageSize=20`, keeps pagination server-driven, shows slow-load text, exposes retry buttons on failures, and cancels/ignores stale requests.
- Added `supabase/20260526_public_transport_groups_perf_indexes.sql`:
  - Includes `CREATE EXTENSION IF NOT EXISTS pg_trgm`.
  - Adds public joinable/time, service/airport/time, group-id trigram, and member lookup indexes.
- Applied Supabase migration `20260526135503 public_transport_groups_perf_indexes` to production project `ngn-transport` (`brmsymzkmdnxzhrcaghw`):
  - Confirmed indexes now exist on production: `idx_transport_groups_public_joinable_time`, `idx_transport_groups_public_service_airport_time`, `idx_transport_groups_group_id_trgm`, and `idx_transport_group_members_group_created_request`.
  - Verified production `transport_groups.status` values remained `single_member=46` and `closed=3`.
- Updated `docs/PROJECT_MAP.md` for the public transport groups preview/pagination/index behavior.

## Previous Completed Work

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

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before analysis, implementation, and release work.
- Read and checked `supabase/20260526_public_transport_groups_perf_indexes.sql` before applying; it contains only `CREATE EXTENSION IF NOT EXISTS pg_trgm` and `CREATE INDEX IF NOT EXISTS` statements, with no `insert`, `update`, `delete`, `drop`, or `alter table`.
- Supabase plugin verification after applying the migration confirmed migration `20260526135503 public_transport_groups_perf_indexes` is listed on project `brmsymzkmdnxzhrcaghw`.
- Supabase index verification confirmed all four target indexes exist.
- `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for the future visible public-board query completed with execution time about 1.5 ms on the current small production table.
- Local public API timing checks before release:
  - `GET /api/public/transport-groups?mode=preview&limit=10`: HTTP 200, 413 ms via PowerShell, 8,957 bytes, 10 items; browser desktop network run measured 39 ms and mobile measured 35 ms.
  - `GET /api/public/transport-groups?page=1&pageSize=20`: HTTP 200, 64 ms via PowerShell, 14,442 bytes, 14 items; browser desktop network run measured 26 ms and mobile measured 30 ms.
  - `GET /api/public/transport-groups?page=1&pageSize=20&group_id=GRP-260525-N`: HTTP 200, 51 ms, 1,182 bytes, 1 item.
  - `GET /api/public/transport-groups?page=1&pageSize=20&date_from=2026-06-01&date_to=2026-06-30`: HTTP 200, 108 ms, 6,341 bytes, 6 items.
- Local browser verification at desktop 1440x1000 and mobile 390x844 confirmed homepage preview renders 10 rows, full board uses `pageSize=20`, and each page load made one public groups request.
- `node --check public-api-handlers/transport-groups.js` passed.
- `node --check transport-api.js` passed.
- `node --check transport-public.js` passed.
- No test data was uploaded, and no real transport orders or transport groups were created, edited, deleted, imported, or cleared during this work.

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
- The public carpool homepage preview now requests `/api/public/transport-groups?mode=preview&limit=10` and displays up to 10 future public groups.
- The public full board now requests `/api/public/transport-groups?page=1&pageSize=20...`; `total` is intentionally `null` by default and `has_next` comes from page-size-plus-one fetches.
- Supabase production already has migration `20260526135503 public_transport_groups_perf_indexes`.
- Production `https://ngn.best` is still aliased to P6 performance deployment `dpl_7MjGbchq2YNWLvgRVjC775oYKiWE` until this release is deployed.

## Open Risks / Follow-Up

- Advanced carpool filters that depend on derived enriched data, such as risk/payment/offline/readiness, are still evaluated on the loaded page data. Moving those fully server-side would be a separate, broader patch.
- `/api/transport-groups` still runs `cleanupEmptyTransportGroups` on GET as existing behavior; this patch did not change group lifecycle cleanup.
- After Vercel deployment, verify production Network timings for the homepage preview, full board first page, and filters against `https://ngn.best`.
