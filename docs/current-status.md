# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-25
- Scope: Cleaned the admin transport request list row actions so the right-side operation area exposes the final three entry points: itinerary adjustment, operation log, and close order. No API, database, import, group-membership, payment, SQL, migration, production data, commit, or push action.

## Latest Completed Work

- Cleaned the admin transport request row action area:
  - `apps/admin-vue/src/views/TransportRequestsView.vue` now labels the itinerary entry as `调整行程`;
  - the operation-log row button now says `操作记录` and opens the existing read-only operation-log drawer;
  - the list row no longer exposes a separate request-detail entry from the transport request action area;
  - the workbench row action area now keeps the three primary actions in order: `调整行程`, `操作记录`, `关闭订单`;
  - the row save affordance is demoted to a small note-save link/status below the primary actions, so `已保存` is no longer presented as a peer operation button;
  - `apps/admin-vue/src/styles.css` adds the minimal layout/style needed for the small note-save link/status.

- Verification for the transport request row action cleanup:
  - `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning;
  - the generated admin bundle was refreshed to `admin/assets/index-BVfRgabj.js` and `admin/assets/index-DfE4uMCS.css`.

- Restored target-group choice for route-breaking multi-member itinerary edits:
  - `apps/admin-vue/src/components/TransportOrderChangeDrawer.vue` now keeps the final group-handling selector visible when a changed order cannot remain in its current multi-member group;
  - in that case, `no_group_change` is disabled, while `move_out_new_single` and `transfer_existing_group` remain selectable;
  - confirmation now includes the selected target group as `target_group_search` for transfer saves, so manually searched compatible groups are preserved through the confirm preview rerun;
  - `api/transport-requests/[id]/change-confirm.js` now allows multi-member route-breaking edits to transfer into a preview/searched compatible group, while still blocking keeping the original incompatible group;
  - `docs/PROJECT_MAP.md` documents the confirmed behavior.

- Updated the admin transport request workbench amount column:
  - `apps/admin-vue/src/views/TransportRequestsView.vue` now labels `wb_deposit_amount_gbp` as `已收全款/定金`;
  - widened the column from `98px` to `128px` so the longer header fits more comfortably;
  - rebuilt the generated admin bundle; `/admin/` now serves `admin/assets/index-Cl00qDbt.js` and `admin/assets/index-DJs6utB9.css`;
  - restarted the local `3000` helper server after the frontend bundle change.

- Verification for the received-amount header rename:
  - `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning;
  - `http://127.0.0.1:3000/admin/` returned the new generated bundle references;
  - source/generated-admin search confirmed `已收全款/定金` is present.

- Added a visible row-level `保存` button to `apps/admin-vue/src/views/TransportRequestsView.vue` in the `登记接送机订单` workbench action column:
  - the button calls the existing `saveWorkbenchRow(row)` path used for customer-service workbench fields;
  - it is enabled only when that row has unsaved changes and shows `保存中` while the row is saving;
  - the existing `未保存修改` and row error messages remain in place;
  - rebuilt the generated admin bundle; `/admin/` now serves `admin/assets/index-CjYfWIm_.js` and `admin/assets/index-DJs6utB9.css`;
  - restarted the local `3000` helper server after the functional frontend change.

- Verification for the explicit save-button change:
  - `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning;
  - `http://127.0.0.1:3000/admin/` returned the new generated bundle references;
  - source/generated-admin search confirmed the row action now includes `保存`, `保存中`, and `saveWorkbenchRow(row)`.

- Completed the controlled A-class transport fix set:
  - `apps/admin-vue/src/components/TransportOrderChangeDrawer.vue` now reads and sends the received amount through `deposit_amount_gbp`, matching the amount field used by the transport request list.
  - `api/transport-requests/[id]/change-preview.js` now recognizes `deposit_amount_gbp` in changed fields, so previews and operation logs can show the before/after amount.
  - `api/transport-requests/[id]/change-confirm.js` now confirms and saves `deposit_amount_gbp`, and asserts that changed effective transport requests have exactly one group membership after confirmation.
  - `api/transport-requests/[id]/group.js` now blocks the legacy `remove_group` path instead of allowing an effective order to become ungrouped.
  - `api/_lib/transport-group-lifecycle.js` now supports a unique-constraint-safe move-out flow: create the replacement group without membership, delete the old membership, insert the new membership, restore the old membership on failure, and clean up the new empty group where possible.
  - `api/_lib/transport-manual-import.js` now rolls back just-created requests when group/member creation fails, deletes just-created empty groups where possible, and fails the batch instead of reporting success when rollback cannot be completed.
  - `npm --prefix apps/admin-vue run build` refreshed the generated admin bundle to `admin/assets/index-JBzejV_B.js`.

- Verification for the controlled A-class fix set:
  - `node --check api/_lib/transport-group-lifecycle.js`
  - `node --check api/_lib/transport-manual-import.js`
  - `node --check api/transport-requests/[id]/group.js`
  - `node --check api/transport-requests/[id]/change-preview.js`
  - `node --check api/transport-requests/[id]/change-confirm.js`
  - `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning.

- Restored route-breaking multi-member carpool edit choices in `apps/admin-vue/src/components/TransportOrderChangeDrawer.vue`:
  - when preview says the order cannot stay in the current multi-member carpool group, the drawer disables keeping the original group but still allows a replacement single-member group or a compatible target group;
  - for that required move-out case, the drawer keeps the final-handling selector visible instead of forcing only the single-member-group path;
  - duplicate red/yellow risk sections were merged into one Chinese `风险提示` block, so operators still see the risk without repeated blocking copy.

- Added target carpool-group number search to `apps/admin-vue/src/components/TransportOrderChangeDrawer.vue`:
  - when final handling is joining a specified compatible carpool group, operators can enter a `GRP-...` group number and click the Chinese validation button;
  - the drawer calls the existing order-change preview endpoint with the current draft itinerary and target group number;
  - if the group can be joined, it is added to the dropdown and automatically selected;
  - if it cannot be joined, the drawer shows the returned Chinese reason instead of only showing an empty dropdown.

- Extended `api/transport-requests/[id]/change-preview.js` for target group number search:
  - validates the searched group against the current draft request using the same server-side join rules as final confirmation;
  - returns `group_context.searched_target_group` with `joinable`, `reason`, and group summary when applicable;
  - Chinese reasons cover missing group number, current group, closed/cancelled/unjoinable group, service type mismatch, airport mismatch, date mismatch, no active members, capacity shortage, time window over 3 hours, invalid passenger count, and already-in-target cases.

- Updated `docs/PROJECT_MAP.md` to document optional target-group number search in `change-preview`.

- Made batch manual import CSV/template examples safer to open in Excel:
  - changed template/example phone numbers from plain leading-zero values such as `071...` to spaced UK text values such as `+44 7100 010001`;
  - regenerated `transport-bulk-import-group-test.csv` and `transport-bulk-import-group-test-utf8-bom.csv` with no plain `071...` values, so Excel should no longer show the default conversion warning about deleting leading zeros when opening the test CSV;
  - created `transport-bulk-import-group-test-v3.xlsx` with the same updated validation rows;
  - rebuilt the generated local admin bundle and restarted the local `3000` helper server.

- Added target carpool-group number search to `apps/admin-vue/src/components/TransportOrderChangeDrawer.vue`:
  - when final handling is `加入指定兼容拼车组`, operators can enter a `GRP-...` group number and click `校验拼车组`;
  - the drawer calls the existing order-change preview endpoint with the current draft itinerary and target group number;
  - if the group can be joined, it is added to the dropdown and automatically selected;
  - if it cannot be joined, the drawer shows the returned Chinese reason instead of only showing an empty dropdown.

- Extended `api/transport-requests/[id]/change-preview.js` for target group number search:
  - validates the searched group against the current draft request using the same server-side join rules as final confirmation;
  - returns `group_context.searched_target_group` with `joinable`, `reason`, and group summary when applicable;
  - Chinese reasons cover missing group number, current group, closed/cancelled/unjoinable group, service type mismatch, airport mismatch, date mismatch, no active members, capacity shortage, time window over 3 hours, invalid passenger count, and already-in-target cases.

- Updated `docs/PROJECT_MAP.md` to document optional target-group number search in `change-preview`.

- Fixed batch manual import `.xlsx` upload crash:
  - `apps/admin-vue/src/views/TransportRequestsView.vue` now reads XLSX uploads with `trim: false` so `read-excel-file` does not crash when template/example rows contain blank cells;
  - the existing import normalization still converts blank/null cells to empty strings before preview validation;
  - rebuilt the generated local admin bundle and restarted the local `3000` helper server.

- Fixed the batch manual import preview treating filled temporary group identifiers as blank:
  - `api/_lib/transport-manual-import.js` now recognizes the shared template label `拼车组标识（可选）` and related Chinese/English aliases when normalizing uploaded rows;
  - UTF-8 BOM is stripped from frontend and backend import header normalization so BOM CSV headers do not miss alias matching;
  - the batch import template no longer includes the unused `是否愿意拼车` column;
  - the batch import preview table no longer displays the unused `是否愿意拼车` column;
  - regenerated `transport-bulk-import-group-test.csv` and `transport-bulk-import-group-test-utf8-bom.csv` without the unused column and with three `测试组A` rows;
  - created `transport-bulk-import-group-test-v2.xlsx` with the same updated test rows because the previous `.xlsx` was locked open by Excel;
  - updated `docs/PROJECT_MAP.md` to record that preview recognizes the current Chinese group-identifier template header and aliases;
  - rebuilt the generated local admin bundle and restarted the local `3000` helper server.

- Removed the shareable selectable control from `apps/admin-vue/src/components/TransportOrderChangeDrawer.vue`:
  - the itinerary edit drawer no longer lets operators switch a request to not-shareable;
  - opening the drawer sets the draft `shareable` value to `true`;
  - preview/confirm payloads always send `shareable: true`, so target carpool-group lookup is not blocked by an old stored not-shareable value;
  - removed the temporary UI gating that disabled target-group transfer for not-shareable previews;
  - cleaned the previous temporary `group_context.request_shareable` response field from `api/transport-requests/[id]/change-preview.js`;
  - refreshed the generated local admin bundle and restarted the local `3000` helper server after the functional change.

- Clarified batch manual import group identifier guidance:
  - `shared/transport-manual-import-columns.json` now explains that a blank `拼车组标识（可选）` creates a separate single-member group for each blank row, not one group for the whole batch;
  - the same field note explains that repeated temporary identifiers such as `新组A` create one shared new group for those rows;
  - the same field note explains that existing `GRP-...` identifiers are joined only if found, and missing identifiers are red preview errors;
  - the batch import modal now shows these three rules before the full template field list;
  - the test-example section now labels which example row tests blank single-group creation, missing `GRP` blocking, and shared temporary-group creation;
  - refreshed the generated local admin bundle with `npm --prefix apps/admin-vue run build`.

- Removed the `是否愿意拼车` selectable control from `apps/admin-vue/src/components/TransportOrderChangeDrawer.vue`:
  - the itinerary edit drawer no longer lets operators switch a request to not-shareable;
  - opening the drawer sets the draft `shareable` value to `true`;
  - preview/confirm payloads always send `shareable: true`, so target carpool-group lookup is not blocked by an old stored not-shareable value;
  - removed the temporary UI gating that disabled `加入指定兼容拼车组` for not-shareable previews;
  - cleaned the previous temporary `group_context.request_shareable` response field from `api/transport-requests/[id]/change-preview.js`;
  - refreshed the generated local admin bundle and restarted the local `3000` helper server after the functional change.

- Clarified admin transport order-change candidate behavior:
  - `api/transport-requests/[id]/change-preview.js` now includes `group_context.request_shareable` so the UI can tell whether the previewed order is allowed to join a carpool group;
  - `apps/admin-vue/src/components/TransportOrderChangeDrawer.vue` disables `加入指定兼容拼车组` when the previewed order has `是否愿意拼车 = 否`;
  - the drawer now tells operators to change `是否愿意拼车` to `是` and re-preview before trying to join a target carpool group;
  - confirmation also blocks a disabled group action instead of falling through to a generic missing-target error;
  - refreshed the generated local admin bundle and restarted the local `3000` helper server after the functional change.

- Regenerated batch manual import validation files for Excel-safe testing:
  - replaced `transport-bulk-import-group-test.csv` with a UTF-8 BOM CSV so Excel can detect Chinese text correctly;
  - added duplicate-named explicit BOM copy `transport-bulk-import-group-test-utf8-bom.csv`;
  - added native Excel workbook `transport-bulk-import-group-test.xlsx` with the same four validation rows.

- Added a testing rule to `AGENTS.md`: after any functional code change, restart the relevant local server before verification so frontend/API behavior is not tested against a stale running process.

- Created `transport-bulk-import-group-test.csv` in the project root for manual admin validation of batch import group handling:
  - one blank group identifier row to verify automatic single-member group creation;
  - two rows with the same temporary identifier `测试组A` to verify one shared new group is created;
  - one row with `GRP-DOES-NOT-EXIST` to verify preview blocks non-existent existing group identifiers.

- Investigated the follow-up target-group dropdown case:
  - cross-terminal mismatch is no longer the blocking condition in current source;
  - candidate lookup still deliberately excludes target groups with blocked status (`full`, `closed`, `cancelled`) or insufficient `remaining_passenger_count`;
  - the screenshot target `GRP-P6LOCAL-FULL` is consistent with the full/no-capacity test group path, so it would remain excluded even after cross-terminal joining is allowed;
  - if this was tested against an already-running local API process or deployed site, that environment may also need a server restart/deploy before the previous source change is active.

- Relaxed transport group transfer terminal compatibility in `api/_lib/transport-group-lifecycle.js`:
  - same service type, airport, service date, joinable status, active members, remaining capacity, current-group exclusion, and 3-hour time window are still enforced;
  - target groups with a different terminal are no longer rejected outright;
  - cross-terminal candidates now return a `cross_terminal_surcharge` warning telling customer service to confirm the cross-terminal fee and group price;
  - the same server-side validation is used again at confirmation time, so the dropdown preview and final save now agree on cross-terminal eligibility.

- Updated `docs/PROJECT_MAP.md` to document that admin candidate-group lookup and order-change preview allow cross-terminal candidates with surcharge/price-confirmation warnings.

- Investigated the transport itinerary edit drawer's target-group filtering:
  - read the shared admin drawer in `apps/admin-vue/src/components/TransportOrderChangeDrawer.vue`;
  - read the preview API in `api/transport-requests/[id]/change-preview.js`;
  - read group candidate validation in `api/_lib/transport-group-lifecycle.js`;
  - confirmed the target-group dropdown is populated only from preview-returned compatible groups;
  - confirmed compatible groups currently require same service type, same airport, same service date, joinable group status, enough remaining passenger capacity, active members, service time within 3 hours, and matching terminal when both the order and group have terminals;
  - no code behavior was changed.

- Removed the WeChat column from the admin transport request list in `apps/admin-vue/src/views/TransportRequestsView.vue`:
  - removed the current workbench table column `wb_wechat`;
  - removed the legacy transport request table column `wechat`;
  - removed the matching table cell templates, so the list no longer renders a standalone WeChat column;
  - left search, manual supplement, batch import preview, and itinerary editing fields untouched;
  - refreshed the generated local admin bundle with `npm --prefix apps/admin-vue run build`;
  - verification: admin build passed with only the existing Vite chunk-size warning, and source search found no `wb_wechat` / `cell-wb_wechat` list column remnants.

- Fixed batch manual transport import group assignment:
  - added `拼车组标识（可选）` to the shared import template column definition used by CSV, Excel, copied headers, and paste parsing;
  - preview now shows each row's group handling result: blank values auto-create a single-member group, `GRP-...` values join an existing group, and repeated non-`GRP` temporary keys create one shared new group for those rows;
  - preview now blocks non-existent `GRP-...` group identifiers as red errors and surfaces compatibility/capacity concerns as yellow warnings requiring operator confirmation;
  - commit now creates each `transport_requests` row and immediately creates or joins a `transport_group`, writing `transport_group_members` for every imported request;
  - repeated temporary group identifiers in the same batch reuse the first newly created group instead of creating one group per row;
  - failed group creation/join rolls back the just-created request so batch import does not intentionally leave imported requests without group membership;
  - `docs/PROJECT_MAP.md` now documents the new preview/commit behavior.

- Simplified the transport request operation-log drawer in `apps/admin-vue/src/views/TransportRequestsView.vue`:
  - changed the row audit button back to concise Chinese `记录`;
  - changed the drawer title, close/loading/empty/error copy back to concise Chinese;
  - replaced the repeated audit table with compact cards showing action, operator, time, and up to five readable field changes;
  - mapped technical actions and fields to short customer-service labels such as `行程更新`, `航班时间`, `服务时间`, `人数`, `行李`, and `已收`;
  - compacted timestamps and long UUID-like values so audit rows fit without noisy wrapping;
  - refreshed the generated local admin bundle with `npm --prefix apps/admin-vue run build`;
  - verification: admin build passed with only the existing Vite chunk-size warning, and source/generated-admin searches found no leftover English Activity copy from the previous iteration.

- Simplified the transport request list in `apps/admin-vue/src/views/TransportRequestsView.vue`:
  - removed the list-row `详情` / `查看详情` entry for pickup/dropoff transport requests;
  - row actions now expose `调整行程`, `操作记录`, and `关闭订单` in the transport list action column;
  - `调整行程` now fetches the latest single-order detail before opening `TransportOrderChangeDrawer`, so the drawer remains the single place to view and modify itinerary/payment/note fields with preview and confirm;
  - added a right-side operation-log drawer that fetches the latest request detail and displays operation type, changed field, before value, after value, operator, and operation time;
  - empty audit state shows `暂无操作记录`;
  - removed the Vue admin route for `/admin/transport/requests/:id`, so the standalone transport request detail page is no longer reachable from the router;
  - updated general order-center transport links to return to `/admin/transport/requests` instead of the removed transport request detail route;
  - refreshed the generated local admin bundle with `npm --prefix apps/admin-vue run build`;
  - verification: admin build passed with only the existing Vite chunk-size warning, and source/generated-admin search found no active transport request detail route or list-row detail handler.

- Simplified the shared transport itinerary edit drawer in `apps/admin-vue/src/components/TransportOrderChangeDrawer.vue`:
  - removed the duplicate `保留当前拼车组` UI option and maps old keep aliases to `不调整拼车组`;
  - keeps exactly three group-handling choices: `不调整拼车组`, `移出并创建新的单人拼车组`, and `加入指定兼容拼车组`;
  - preview now defaults the final handling dropdown to `不调整拼车组`;
  - selecting `加入指定兼容拼车组` shows a target-group dropdown with group id, airport, terminal, service time, and current/max passenger count;
  - saving still blocks transfer when no target group is selected and only sends `target_group_id` for transfer;
  - refreshed the generated local admin bundle with `npm --prefix apps/admin-vue run build`;
  - verification: admin build passed with only the existing Vite chunk-size warning, and source/generated-admin search found no `保留当前拼车组` option text.

- Simplified the single `补录接送机订单` modal in `apps/admin-vue/src/views/TransportRequestsView.vue`:
  - removed optional manual-entry controls for `拼音/英文名`, `邮箱`, `行李数量`, `行李备注`, the `记录与收款` section, and `客服备注`;
  - kept required fields for student/contact, trip details, passenger count, and carpool group handling;
  - existing default values are still included in the manual submit payload, so API/database/payment/email behavior was not changed;
  - refreshed the generated local admin bundle with `npm --prefix apps/admin-vue run build`;
  - verification: source-template search found no removed optional controls in the single supplement modal, and the admin build passed with only the existing Vite chunk-size warning.

## Previous Transport Work Kept As Context

- The shared transport itinerary edit drawer no longer renders the redundant `预览结果` heading or the red-boxed price/group summary metrics after preview; it still keeps risk warnings, change summary, group-handling selection, consequence copy, and `确认保存`.

- Single manual supplement orders now require an explicit carpool-group result:
  - `apps/admin-vue/src/views/TransportRequestsView.vue` shows only `创建新的单人拼车组，并自动加入` and `加入已有拼车组` in `拼车组处理`;
  - new/reset manual supplement forms default to `create_single`;
  - `apps/admin-vue/src/api/admin-api.js` defaults missing manual group handling to `create_single`;
  - `api/_lib/transport-manual-import.js` rejects the old manual no-group choice with a Chinese error instead of creating an order outside a carpool group.

- Multi-member high-risk itinerary edits now keep the clear replacement-group path:
  - `api/transport-requests/[id]/change-preview.js` resolves airport/date/service-type group-breaking changes to `move_out_new_single`;
  - `api/transport-requests/[id]/change-confirm.js` requires `move_out_new_single`, removes the order from the old group, creates the replacement single-member group, preserves payment data, and logs `transport_request_removed_from_group`;
  - the Vue change drawer and detail-page itinerary edit controls show the operator action as creating a new single-member carpool group, with no old no-group outcome copy.

- Current admin transport source and the generated local admin bundle no longer contain the removed hidden-queue wording.
- Existing orders that currently have no group are displayed with neutral carpool wording such as `无拼车组` / `暂无拼车组`, not the removed wording.
- `docs/PROJECT_MAP.md` now documents that single manual supplement defaults to single-member group creation, can manually join a validated existing group, and rejects the old no-group manual handling.

## Verification

- `node --check api/transport-requests/[id]/change-confirm.js`
- `node --check api/transport-requests/[id]/change-preview.js`
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning; current generated bundle is `admin/assets/index-Cl00qDbt.js`.
- Restarted the local `3000` helper server after the functional change.
- `http://127.0.0.1:3000/admin/` returns `admin/assets/index-Cl00qDbt.js` and `admin/assets/index-DJs6utB9.css`.
- `http://127.0.0.1:3000/api/admin/session` returned LOCAL TEST MODE with `is_production=false`.
- Browser navigation to `/admin/` reached the admin login page; modal-level browser acceptance still requires a logged-in admin session.

- Source search confirmed `TransportOrderChangeDrawer.vue` defaults `selectedGroupAction` from preview `required_group_action`, keeps risk warnings, and now keeps selectable group handling for required move-out cases.
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning; current generated bundle is `admin/assets/index-BAVj2NC9.js`.
- Restarted the local `3000` helper server after the functional change; `http://127.0.0.1:3000/admin/` now serves `admin/assets/index-BAVj2NC9.js` and `admin/assets/index-DJs6utB9.css`.

- Source search confirmed the admin drawer now contains `搜索拼车组编号`, `校验拼车组`, `targetGroupSearch`, and merged selectable target-group handling.
- Source search confirmed `change-preview` now accepts `target_group_search` and returns `group_context.searched_target_group`.
- `node --check api/transport-requests/[id]/change-preview.js`
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning; current generated bundle is `admin/assets/index-2GJNjjHH.js`.
- Restarted the local `3000` helper server after the functional change; `http://127.0.0.1:3000/admin/` now serves `admin/assets/index-2GJNjjHH.js` and `admin/assets/index-DJs6utB9.css`.
- `http://127.0.0.1:3000/api/admin/session` returned LOCAL TEST MODE with `is_production=false`.

- Shared import template JSON parses successfully after the Excel-safe sample phone changes.
- Regenerated `transport-bulk-import-group-test.csv` still starts with UTF-8 BOM bytes `EF BB BF`.
- Verified the regenerated test CSV no longer contains plain comma-prefixed leading-zero phone values matching `,0[0-9]{8,}`.
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning; current generated bundle is `admin/assets/index-2GJNjjHH.js`.
- Restarted the local `3000` helper server after the template-example change.
- Verified `read-excel-file` fails on `transport-bulk-import-group-test-v2.xlsx` with default trimming but succeeds with `{ trim: false }`.
- Verified `transport-bulk-import-group-test-v2.xlsx` reads as 6 rows / 17 columns and preserves the group identifier values: blank, `测试组A`, `测试组A`, `测试组A`, `GRP-DOES-NOT-EXIST`.
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning; current generated bundle is `admin/assets/index-BR-QHnT1.js`.
- Restarted the local `3000` helper server after the XLSX upload fix.
- Shared import template JSON parses successfully after removing the batch `是否愿意拼车` column.
- `node --check api/_lib/transport-manual-import.js`
- Backend normalization test confirmed a row keyed by `拼车组标识（可选）` reads `测试组A` into `clean.group_id`.
- Backend preview test confirmed:
  - blank group identifier -> `自动创建单人组`;
  - three `测试组A` rows -> `创建新的多人拼车组：临时标识 测试组A`;
  - `GRP-DOES-NOT-EXIST` -> red error `拼车组不存在`.
- Regenerated CSV files start with UTF-8 BOM and no longer include `是否愿意拼车`.
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning; current generated bundle is `admin/assets/index-BpHFgvGR.js`.
- Restarted the local `3000` helper server after the functional change.
- Browser navigation to `/admin/transport/requests` reached the admin login page; modal-level browser acceptance still requires a logged-in admin session.
- Shared import template JSON parses successfully.
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning after the batch import help-text clarification.
- Source/generated-admin searches confirmed the clarified blank-row, repeated-temporary-key, and missing-`GRP` explanation text is present.
- Source search confirms the visible `是否愿意拼车` select control, `request_shareable`, and temporary not-shareable warning copy are no longer present in `TransportOrderChangeDrawer.vue` / `change-preview.js`.
- `node --check api/transport-requests/[id]/change-preview.js`
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning.
- Restarted the local `3000` helper server after the functional change; `http://127.0.0.1:3000/admin/` now serves `admin/assets/index-D3-3GNNw.js` and `admin/assets/index-DJs6utB9.css`.
- `http://127.0.0.1:3000/api/admin/session` returned LOCAL TEST MODE with `is_production=false`.
- `node --check api/transport-requests/[id]/change-preview.js`
- `node --check api/transport-requests/[id]/change-confirm.js`
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning.
- Restarted the local `3000` helper server after the functional change; `http://127.0.0.1:3000/admin/` now serves `admin/assets/index-CcozX21F.js` and `admin/assets/index-DJs6utB9.css`.
- `http://127.0.0.1:3000/api/admin/session` returned LOCAL TEST MODE with `is_production=false`.
- Verified the regenerated CSV file starts with UTF-8 BOM bytes `EF BB BF`.
- Verified PowerShell `Import-Csv` reads the regenerated CSV with correct Chinese headers and values.
- Verified `transport-bulk-import-group-test.xlsx` exists.
- Documentation/rule-only update; no functional files were edited for this task.
- Verified `transport-bulk-import-group-test.csv` exists and contains the intended four test rows.
- `node --check api/_lib/transport-group-lifecycle.js`
- `node --check api/transport-requests/[id]/change-preview.js`
- `node --check api/transport-requests/[id]/change-confirm.js`
- `node --check api/transport-requests/[id]/time-adjust-candidate-groups.js`
- Documentation/status-only update; verified the relevant compatibility logic by reading `api/transport-requests/[id]/change-preview.js`, `api/_lib/transport-group-lifecycle.js`, and `apps/admin-vue/src/components/TransportOrderChangeDrawer.vue`.
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning after removing the transport request list WeChat column.
- Source/generated-admin searches found no `wb_wechat` or `cell-wb_wechat` remnants for the transport request workbench table.
- Shared import template JSON parses successfully.
- `node --check api/_lib/transport-manual-import.js`
- `node --check api/transport-manual-import/preview.js`
- `node --check api/transport-manual-import/commit.js`
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning after the batch import group-assignment fix.
- Search confirmed the old "batch import remains request-only / ignores Group ID" implementation wording is no longer present in current code or docs.
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning after changing the operation-log drawer back to concise Chinese.
- Source/generated-admin searches found no leftover `Activity`, `No activity yet`, `No visible field changes`, `Activity failed`, `Order created`, `Trip updated`, `Flight time`, `Service time`, `Pax`, `Bags`, or `Payment` copy in the transport request operation-log source/bundle.
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning after the transport list entry simplification.
- Source/generated-admin searches found no active `transport/requests/:id`, `transport-request-detail`, `TransportRequestDetailView`, `openRequestDetail`, or `requestDetailHref` references in the routed admin list/bundle. The old `TransportRequestDetailView.vue` source file remains in the tree but is no longer imported by the router.
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning after the itinerary edit drawer simplification.
- Source/generated-admin search found no `保留当前拼车组` option text after rebuilding the local admin bundle.
- `node --check api/_lib/transport-manual-import.js`
- `node --check api/transport-requests/[id]/change-preview.js`
- `node --check api/transport-requests/[id]/change-confirm.js`
- `node --check api/transport-requests/[id]/group.js`
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning.
- Source-template search confirmed the removed optional fields no longer render in the single manual supplement modal; matching labels may still appear in batch-import preview/template code and workbench columns.
- Local browser navigation to `/admin/transport/requests` reached the admin login redirect, so modal-level browser acceptance still requires a logged-in admin session.
- Source/generated-admin searches found no removed hidden-queue wording in current transport admin/API files.

## Current Project State

- Admin Vue source is the canonical admin UI source; `npm --prefix apps/admin-vue run build` refreshes the served `admin/` bundle.
- The transport request list no longer links to a standalone transport request detail page; operators should use list filters for scanning, `调整行程` for full order view/edit with preview-confirm, and `操作记录` for audit review.
- Manual single-order supplement now creates a single-member group by default or joins a compatible existing group by entered group code/id.
- Bulk manual import now requires an explicit group outcome for every imported row through `拼车组标识（可选）`: blank creates a single-member group, existing `GRP-...` joins that group, and repeated temporary identifiers create one shared new group.
- One-click payment, email behavior, public pages, production deployment, and production database state were not changed.

## Open Risks / Follow-Up

- Browser-level acceptance still needs a logged-in admin session to manually confirm the batch import modal, row-level `调整行程`, and `操作记录` drawers.
- Historical database rows may still have old compatibility values; this task did not run cleanup SQL. If cleanup is needed, prepare a separate reviewable Supabase plan before any migration.
- The repository had pre-existing unrelated modified files before this task; they were left intact.
