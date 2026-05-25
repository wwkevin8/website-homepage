# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-25
- Scope: Deployed the 2.0 NGN admin carpool group management / dispatch workbench filter update to Vercel Production and `ngn.best`. The page now defaults to effective groups and service-time nearest-first sorting, with manual switches for effective, invalid, all, ascending, and descending views. No database write, real group data change, test data upload, email change, public page change, price change, order data change, or group member data change was performed.

## Latest Completed Work

- Changed `apps/admin-vue/src/views/TransportGroupsView.vue`:
  - `defaultFilters.validity` is now `"active"`, so first load and reset default to groups whose `group_date` is today or later.
  - `defaultFilters.sort` is now `"service_time_asc"`, so first load and reset default to service time from nearest to farthest.
  - The request query now includes `validity` and `sort`.
  - Client-side filtered results are also sorted by group service time before pagination, using `preferred_time_start`, `flight_time_reference`, `arrival_range.earliest`, then `group_date`.
  - Client-side validity fallback uses London today and date-only comparison so same-day groups remain effective for the full day.

- Changed `apps/admin-vue/src/components/TransportGroupFilters.vue`:
  - Added an effective-status filter with `有效单`, `无效单`, and `全部`.
  - Added a service-time sort filter with `从最近到最远` and `从最远到最近`.

- Changed `api/transport-groups/index.js`:
  - Added `validity=active|invalid|all`; omitted or unknown values default to `active`.
  - `active` applies `group_date >= London today`; `invalid` applies `group_date < London today`; `all` does not apply the validity date boundary.
  - Added `sort=service_time_asc|service_time_desc`; omitted or unknown values default to ascending service time.
  - Existing group status, service type, airport, and manual date-range filters remain available.

- Rebuilt the generated admin bundle:
  - `/admin/` now references `admin/assets/index-Br4HPUCj.js`.
  - Stylesheet remains `admin/assets/index-DfE4uMCS.css`.

- Left real transport group data unchanged:
  - No transport group rows were edited, deleted, closed, or hidden.
  - No schema, migration, payment, email, or deployment behavior was changed.

- Release:
  - Git commit: `abbf81809c2f2ea25a6851af673f7502dc9e9a71` (`Add transport group validity and time filters`)
  - GitHub branch pushed: `codex/transport-group-filters-release`
  - Vercel Production deployment: `dpl_A66pc3GH1JbdMqiTbXLLVXf6qeCW`
  - Production URL: `https://webside-rgi4qvqw0-wwkevin8s-projects.vercel.app`
  - Alias: `https://ngn.best`
  - Production state: `READY`

## Verification

- `node --check api/transport-groups/index.js` passed.
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning.
- Local helper server was restarted after the final build with `npm run dev`; an old Node process on port 3000 was stopped first.
- Confirmed `http://127.0.0.1:3000/admin/index.html` references `admin/assets/index-Br4HPUCj.js`.
- Browser verification with a local signed admin session on `http://127.0.0.1:3000/admin/transport/groups` confirmed:
  - first load controls are `validity=active` and `sort=service_time_asc`;
  - first load request URL includes `validity=active&sort=service_time_asc`;
  - first load returned only groups with `group_date >= 2026-05-25` in the local test database;
  - first load rows are sorted ascending by service time;
  - switching to invalid groups sends `validity=invalid&sort=service_time_asc`;
  - invalid groups returned only rows with `group_date < 2026-05-25`;
  - switching to all sends `validity=all&sort=service_time_asc`;
  - switching sort sends `validity=all&sort=service_time_desc`;
  - descending rows are sorted from farthest to nearest;
  - refreshing the page restores `validity=active` and `sort=service_time_asc`.
- Production verification confirmed:
  - Vercel inspect reports deployment `dpl_A66pc3GH1JbdMqiTbXLLVXf6qeCW` as Ready.
  - Vercel inspect lists aliases `https://ngn.best` and `https://www.ngn.best`.
  - `https://ngn.best/admin/transport/groups` returns 200.
  - The production admin route references `/admin/assets/index-Br4HPUCj.js`.
  - The production bundle contains `validity`, `service_time_asc`, `service_time_desc`, and the default `validity:"active"` logic.
- `git diff --check` passed.

## Current Project State

- Admin Vue source is the canonical admin UI source; `npm --prefix apps/admin-vue run build` refreshes the served `admin/` bundle.
- The carpool group management / dispatch workbench now defaults to effective groups and nearest-to-farthest service-time sorting.
- Operators can manually choose invalid groups, all groups, or reverse service-time sorting.
- The registered airport pickup/dropoff order list still has the prior local default-filter update: active orders and `flight_nearest` sorting.
- Query pagination, export controls, table layout, carpool grouping, price calculation, database schema, and email behavior were not intentionally changed by this task.
- No test data was uploaded and no production data was modified.

## Open Risks / Follow-Up

- `/api/transport-groups` now defaults omitted `validity` to active groups. Callers that need historical groups must send `validity=all` or `validity=invalid`.
- Production visual acceptance still requires a logged-in production operator session after release.
