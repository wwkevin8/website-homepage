# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-26
- Scope: Promoted the validated P6 v2.4 admin carpool group performance patch on top of the P0 public carpool baseline (`5941da3`) to Vercel Production. The release restores the admin group page lightweight server-paginated first load while preserving the P0 public carpool join/list fixes. No production database write, test-data upload, SQL/schema change, P7/P8 work, price logic change, payment logic change, or public carpool logic overwrite was performed.

## Latest Completed Work

- P6 v2.4 on P0 Preview merge:
  - Created clean worktree `E:\webside-p6v24-on-p0` from current Production P0 commit `5941da3`.
  - Merged only the admin performance files from `origin/codex/p6-performance-v2`: `api/transport-groups/index.js`, `apps/admin-vue/src/views/TransportGroupsView.vue`, `apps/admin-vue/src/components/Pagination.vue`, and `docs/PROJECT_MAP.md`.
  - Rebuilt the admin bundle; `admin/index.html` now references `admin/assets/index-v-E3-1Zq.js` and keeps `admin/assets/index-DfE4uMCS.css`.
  - Preserved P0 public carpool files without modification: `api/_lib/transport-join.js`, `public-api-handlers/transport-groups.js`, `transport-public.js`, and the existing Supabase migration files.
  - Pushed branch `origin/codex/p6-v24-on-p0` at commit `dc0bae6`.
  - Deployed Vercel Preview `dpl_Db8PQBr6p45gLKycFqzrzdNDmeUW`: `https://webside-6m8o80mjp-wwkevin8s-projects.vercel.app`.
  - Promoted the validated Preview to Production deployment `dpl_CoTmyhA6Gk35S6V5nRAo5YrCCy29`: `https://webside-9rys6jlut-wwkevin8s-projects.vercel.app`.
  - Production aliases `https://ngn.best` and `https://www.ngn.best` now point to the promoted deployment.

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

- P6 v2.4 on P0 Preview verification:
  - Read `E:\webside\AGENTS.md`, `E:\webside\docs\current-status.md`, and Vercel deployment guidance before merging/deploying.
  - Confirmed `5941da3` contains P0 public joinability fix and has `f5f96d8` as an ancestor.
  - Confirmed the dirty main worktree `E:\webside` was not used as the deployment baseline.
  - `node --check api/transport-groups/index.js` passed.
  - `node --check public-api-handlers/transport-groups.js`, `node --check transport-public.js`, and `node --check api/_lib/transport-join.js` passed, confirming preserved P0 public files remain syntactically valid.
  - `npm --prefix apps/admin-vue ci` completed with `0 vulnerabilities`.
  - `npm --prefix apps/admin-vue run build` passed with the existing large admin bundle warning.
  - `git diff --check` passed after cleaning the generated admin entry file.
  - Vercel Preview deployment `dpl_Db8PQBr6p45gLKycFqzrzdNDmeUW` reported `READY` with target `preview`.
  - `vercel curl /admin/transport/groups --deployment webside-6m8o80mjp-wwkevin8s-projects.vercel.app` confirmed the Preview admin page serves `/admin/assets/index-v-E3-1Zq.js`, not the old `/admin/assets/index-oXl2evCZ.js`.
  - `vercel curl /api/transport-groups --deployment webside-6m8o80mjp-wwkevin8s-projects.vercel.app` returned admin 401 JSON, confirming the route is protected and not source text.
  - `vercel curl /api/public/transport-groups?page=1&limit=3 --deployment webside-6m8o80mjp-wwkevin8s-projects.vercel.app` returned public group rows with `target_request_id`, confirming the public P0 list/join target behavior remains present.
  - User completed authenticated Preview admin validation and approved Production promotion.
- P6 v2.4 on P0 Production promotion verification:
  - Promoted `dpl_Db8PQBr6p45gLKycFqzrzdNDmeUW` to Production. Vercel created Production deployment `dpl_CoTmyhA6Gk35S6V5nRAo5YrCCy29`.
  - `vercel inspect ngn.best` and `vercel inspect www.ngn.best` both report `dpl_CoTmyhA6Gk35S6V5nRAo5YrCCy29` with status `Ready`.
  - Cache-busted checks of `https://ngn.best/admin/transport/groups` and `https://www.ngn.best/admin/transport/groups` both reference `/admin/assets/index-v-E3-1Zq.js`, not the old `/admin/assets/index-oXl2evCZ.js`.
  - Unauthenticated `GET https://ngn.best/api/transport-groups` returned HTTP 401 in about 842 ms, confirming the admin route is protected and not source text.
  - `GET https://ngn.best/api/public/transport-groups?page=1&limit=3` returned HTTP 200 with 3 public group rows, first group `GRP-260526-MLJ4`, and `target_request_id=12cd6120-fa57-42eb-a4d4-26e73a002767`.
  - Logged-in Production admin timing/default-filter validation still requires an authenticated browser session; the user had already completed equivalent Preview validation before promotion.

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
- Branch `codex/p6-v24-on-p0` contains the deployed combined release: current P0 public carpool baseline plus P6 v2.4 admin group first-load optimization.
- The transport request admin list remains server-paginated and keeps its default valid-order filter.
- Production `https://ngn.best` and `https://www.ngn.best` are aliased to `dpl_CoTmyhA6Gk35S6V5nRAo5YrCCy29`.
- The deployed source branch is `origin/codex/p6-v24-on-p0` with code commit `dc0bae6` plus status-record commit `0cd6245`.
- The registration sync migration file is now in the repo; production already has the idempotent migration applied and verified.

## Open Risks / Follow-Up

- Advanced carpool filters that depend on derived enriched data, such as risk/payment/offline/readiness, are still evaluated on the loaded page data. Moving those fully server-side would be a separate, broader patch.
- After Production promotion, an operator should hard-refresh `https://ngn.best/admin/transport/groups` and confirm browser Network uses `/admin/assets/index-v-E3-1Zq.js` and the authenticated `/api/transport-groups?paginate=true&mode=list...` timing remains close to the approved Preview result.
- One production verification account was created to complete the requested new-account registration check; no transport request/group/member test data was created.
- Root `npm audit` still reports an existing moderate advisory in `ws`; dependency remediation was intentionally left out of this P0 hotfix.
