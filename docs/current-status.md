# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-25
- Scope: Final regression check and commit preparation for the admin `行程地址` column display. The column now shows the raw address only, with no `目的地：`, `出发地：`, or `地址：` prefix. No API, database, price, carpool grouping, export, test-data, production-data, push, or deploy action.

## Latest Completed Work

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
