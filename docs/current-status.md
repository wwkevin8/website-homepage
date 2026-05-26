# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-26
- Scope: P0 public carpool loading/performance/sorting fix released to production. Source commit `72f5b25`; Vercel production deployment `dpl_GY2wEYPMXdKvv3rs7MdvztkLt6gh` is Ready and aliased to `https://ngn.best`. The release was built from clean worktree `E:\webside-p0-deploy` and did not include local test data, destructive SQL, P7/P8 work, or any production data import/delete/overwrite.

## Latest Completed Work

- P0 public carpool loading/performance/sorting release:
  - Root cause: the production public groups endpoint returned HTTP 200 but fetched and enriched the full public group set before slicing for `limit=3`, making the homepage preview slow enough to show the frontend fallback `Load failed`. The full board also defaulted toward the legacy/latest ordering when no date filter was selected.
  - Updated `public-api-handlers/transport-groups.js` so public reads no longer run empty-group cleanup, select only public display fields, default to future joinable groups, sort by service/group time from nearest to farthest, paginate on the server, and enrich only the current page with one batched member lookup.
  - Updated `transport-public.js` so the homepage preview requests `mode=preview&limit=10`, the full board requests `limit=20&page=N`, default sorting is `upcoming`, and failure/empty copy is Chinese instead of raw `Load failed`.
  - Updated `docs/PROJECT_MAP.md` for the public transport groups preview/pagination/default sorting behavior.
  - Production deployment `dpl_GY2wEYPMXdKvv3rs7MdvztkLt6gh` is Ready at `https://webside-995229nwo-wwkevin8s-projects.vercel.app` and aliased to `https://ngn.best`.
  - No production write SQL, test-data upload, order/group/member delete, visibility change, or status rewrite was run for this performance fix.

- P0 production release:
  - Updated `public-api-handlers/transport-groups.js` so public group rows include a public-safe `target_request_id` for the first active member, without changing public visibility, group status, filters, member rows, or transport group rows.
  - Updated `transport-public.js` so `加入拼车` checks login before resolving fallback board data, uses `target_request_id` when available, shows join errors as a notice instead of replacing the board list, and avoids stale empty pagination pages.
  - Added `supabase/migrations/20260526150111_users_source_user_composite_unique.sql` for the registration sync fix: `users(source_user_table, source_user_id)` uniqueness plus hardened `sync_user_from_site_users()`.
  - Updated `docs/PROJECT_MAP.md` for the public groups target id and registration migration.
  - Deployed production URL `https://webside-ksw4pn879-wwkevin8s-projects.vercel.app`; aliases include `https://ngn.best` and `https://www.ngn.best`.
  - Production Supabase migration history already includes `20260526151604 users_source_user_composite_unique`; no destructive SQL was run during this deployment task.

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

- P0 public carpool loading/performance/sorting verification:
  - Read `E:\webside\AGENTS.md`, `E:\webside\docs\current-status.md`, Supabase task guidance, Vercel deployment guidance, Browser guidance, and Vercel deployment guidance before release/verification.
  - `node --check public-api-handlers/transport-groups.js` passed.
  - `node --check transport-public.js` passed.
  - `git diff --check` passed with line-ending warnings only.
  - `npm run build:prod` passed; Vite still reports the existing admin large-chunk warning, and root install still reports the existing moderate `ws` advisory. No dependency files were changed.
  - Local API checks on port `3011` returned HTTP 200 in about 224 ms for preview and about 234 ms for full-board page 1.
  - Production API checks after deployment returned HTTP 200: preview 10 rows in about 525 ms, full-board page 1 20 rows in about 677 ms, and page 2 19 rows in about 407 ms. Dates were ordered from `2026-05-27` forward.
  - Production browser Network checks: mobile homepage preview request was HTTP 200 in about 766 ms with no `Load failed`; desktop full-board page 1 was HTTP 200 in about 730 ms; page 2 was HTTP 200 in about 477 ms.
  - Unauthenticated production `加入拼车` redirected to login without showing the empty-board message.
  - Vercel logs for deployment `dpl_GY2wEYPMXdKvv3rs7MdvztkLt6gh` showed no HTTP 500 logs in the checked window.

- P0 production release verification:
  - Read `E:\webside\AGENTS.md`, `E:\webside\docs\current-status.md`, Supabase task guidance, Vercel deployment guidance, and `vercel.json`.
  - Clean release worktree `E:\webside-p0-deploy` contained only the P0 source/migration/docs changes before deployment.
  - `node --check public-api-handlers/transport-groups.js` passed.
  - `node --check transport-public.js` passed.
  - `git diff --check` passed with line-ending warnings only.
  - `npm run build:prod` passed; Vite reported the existing large-chunk warning and root `npm audit` still reports the existing moderate `ws` advisory. No dependency files were changed.
  - Production deployment `dpl_7vCcMQ7bNXdWVRrgcsgaEtNgNzFs` completed with status Ready.
  - Online API verification: `GET https://ngn.best/api/public/transport-groups?page=1&limit=20` returned HTTP 200, 20 public rows, and the first row had `target_request_id`.
  - Online browser verification: `https://ngn.best/transport-board.html` rendered 10 visible cards; unauthenticated `加入拼车` redirected to login and returning to the board still rendered 10 cards.
  - Online registration verification: requested signup code, verified code, completed registration, logged in, and confirmed one synced `users` row for the new `site_users` account.
  - Online logged-in board verification: after login the board still rendered 10 cards; clicking `加入拼车` opened the join modal, left 10 cards visible, and showed 0 `.transport-empty` blocks.
  - Online refresh verification: reloading the board still rendered 10 cards.
  - Production read-only data counts after verification: `transport_groups=49`, `transport_group_members=49`, `transport_requests=50`, `site_users=35`. No transport orders, groups, or members were created, deleted, hidden, or overwritten by this deployment task.
  - Vercel logs for the deployment had no HTTP 500 logs in the checked window. Two runtime entries were Node deprecation warnings on HTTP 200 requests.

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
- Production `https://ngn.best` is aliased to P0 deployment `dpl_7vCcMQ7bNXdWVRrgcsgaEtNgNzFs`.
- The deployed P0 code commit is `f5f96d8` on branch `origin/codex/p0-join-register-prod`.
- The registration sync migration file is now in the repo; production already has the idempotent migration applied and verified.

## Open Risks / Follow-Up

- Advanced carpool filters that depend on derived enriched data, such as risk/payment/offline/readiness, are still evaluated on the loaded page data. Moving those fully server-side would be a separate, broader patch.
- `/api/transport-groups` still runs `cleanupEmptyTransportGroups` on GET as existing behavior; this patch did not change group lifecycle cleanup.
- If production is still slow after this patch, add production-safe sampled perf timing around group base query, cleanup, member query, duplicate lookup, and enrichment before considering SQL indexes or RPC/view changes.
- One production verification account was created to complete the requested new-account registration check; no transport request/group/member test data was created.
- Root `npm audit` still reports an existing moderate advisory in `ws`; dependency remediation was intentionally left out of this P0 hotfix.
