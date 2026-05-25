# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-25
- Scope: Released the admin transport group management default status filter fix to production. GitHub commit `fcf2a07`; Vercel production deployment `dpl_HQus2qYYV1ehbrBXDMG99z1GpTjM` aliased to `https://ngn.best`. No database write, delete, migration, seed, test-data upload, API logic, email, price, order, or carpool data change.

## Latest Completed Work

- Released the transport group-management default-filter fix to production:
  - confirmed `apps/admin-vue/src/views/TransportGroupsView.vue` had `defaultFilters.status = "active"`, which made the page default to the `进行中` filter;
  - changed only that default to `status: ""`, so initial load and reset now mean `全部`;
  - confirmed `resetFilters()` resets to the same default filter object;
  - confirmed initial `loadGroups(1)` calls `fetchTransportGroups(buildQuery())` and does not add any extra `status=active` outside filter state;
  - confirmed `TransportGroupFilters.vue` already has empty-value `全部` before `进行中`;
  - did not change `api/transport-groups`, database schema/data, seed/migration files, price logic, export logic, order data, or入组/退组 logic;
  - rebuilt with `npm --prefix apps/admin-vue run build`, producing `admin/assets/index-DC0ATA7m.js`;
  - committed and pushed `fcf2a07` (`Fix transport groups default filter`) to `origin/codex/membership-v1`;
  - deployed production with Vercel deployment `dpl_HQus2qYYV1ehbrBXDMG99z1GpTjM`;
  - `https://ngn.best/admin/transport/groups` now serves HTML referencing `admin/assets/index-DC0ATA7m.js`;
  - production bundle check confirmed the deployed transport group view state contains `status:""` and no default `status:"active"` for that filter object.

- Released the order-list default-filter fix to production:
  - confirmed `apps/admin-vue/src/views/TransportRequestsView.vue` has `defaultFilters.status = ""`;
  - confirmed `resetFilters()` resets to that default filter object;
  - confirmed initial `loadRequests(1)` calls `fetchTransportRequests(buildQuery(page))` and does not add `status=active` outside the filter state;
  - confirmed the order-status dropdown has empty-value `全部`, then `有效单`, then `已关闭/过期单`;
  - rebuilt with `npm --prefix apps/admin-vue run build`, producing `admin/assets/index-aWx2_NFV.js`;
  - committed and pushed `893e0a4` (`Fix transport request default filter`) to `origin/codex/membership-v1`;
  - deployed production with Vercel deployment `dpl_7fUBsVnFuyoy7K3s1yqTBNtqYw8P`;
  - `https://ngn.best/admin/transport/requests` now serves HTML referencing `admin/assets/index-aWx2_NFV.js`, replacing the old production bundle `admin/assets/index-Qsmlano-.js`;
  - production bundle check confirmed the deployed transport request view state contains `status:""`.

- Production verification notes for the default-filter release:
  - browser navigation to `https://ngn.best/admin/transport/requests` reached `admin-login.html` because this Codex session has no production admin login cookie;
  - unauthenticated direct production API checks for `/api/transport-requests?paginate=true&page=1&page_size=10` and the same URL with `status=active` both returned `401`, confirming admin API auth is enforced but preventing row-count comparison without a logged-in admin session;
  - logged-in production acceptance still needs an operator session to confirm the visible default dropdown says `全部`, the default network request omits `status=active`, and manual status filters return the expected `published/matched` vs `closed` subsets.

- Added and finalized the `行程地址` column in the admin `登记接送机订单` workbench table:
  - source: `apps/admin-vue/src/views/TransportRequestsView.vue`;
  - placement: after `航班时间` and before `人数`;
  - width: `220px`;
  - display: direct address text only;
  - empty address display: `-`;
  - long address behavior: one-line ellipsis with hover title;
  - address source logic still reads existing fields only, with destination-first pickup handling and origin-first dropoff handling.

- Preserved the existing registered-airport-order default status filter behavior:
  - `defaultFilters.status` remains `""`, so the first load/reset state means `全部`;
  - the existing status dropdown still allows operators to choose `有效单` or `已关闭/过期单`.

- Rebuilt the generated admin bundle:
  - `/admin/` now serves `admin/assets/index-aWx2_NFV.js`;
  - stylesheet remains `admin/assets/index-DfE4uMCS.css`.

## Verification

- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning.
- `git diff --check` passed.
- Source inspection confirmed the workbench column order is `wb_flight_datetime`, `wb_itinerary_address`, `wb_passenger_count`.
- Source inspection confirmed `itineraryAddressText(row)` returns `address || "-"`.
- Source inspection confirmed the address prefixes are no longer in `apps/admin-vue/src/views/TransportRequestsView.vue`.
- Existing query/filter component, pagination component, export function import, and table wrapper/horizontal-scroll styling remain in place.
- Local helper server was restarted after the final build.
- `http://127.0.0.1:3000/admin/` returns `admin/assets/index-aWx2_NFV.js` and `admin/assets/index-DfE4uMCS.css`.
- `http://127.0.0.1:3000/api/admin/session` returned LOCAL TEST MODE and unauthenticated admin state.

## Current Project State

- Admin Vue source is the canonical admin UI source; `npm --prefix apps/admin-vue run build` refreshes the served `admin/` bundle.
- The `登记接送机订单` page defaults the order-status filter to `全部`; operators can still manually choose `有效单`.
- The admin transport request workbench includes a read-only `行程地址` column between `航班时间` and `人数`, derived from existing address fields only and shown without route-prefix labels.
- Query, filter, pagination, horizontal-scroll table layout, export controls, price calculation, carpool grouping, API behavior, database schema, and email behavior were not intentionally changed by this task.
- No test data was uploaded and no production data was modified.

## Open Risks / Follow-Up

- Browser-level row acceptance still requires a logged-in admin session for direct visual confirmation of rows with non-empty and empty addresses.
- No deployment was performed in this task. Follow the release order in `AGENTS.md` before any production or preview deployment.
