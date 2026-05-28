# Current Status

## Latest Task Update

- Date: 2026-05-28
- Scope: P0 carpool page performance optimization. No commit, no deployment, no production data write, no data clearing, and no test-data upload.
- Summary: Public carpool preview and full board now request latest-first paginated public-safe group data (`limit=9` preview, `limit=20` full board) instead of relying on full-list client slicing. Public list responses omit member detail payloads; detail data is requested separately when the user clicks "查看详情". The public board detail helper now resolves group search through group/member IDs before loading request rows. Admin carpool group management defaults to active/effective groups, latest service time first, and 20 rows per page, with stale responses ignored when filters change quickly. A SQL index file was added for transport group/request/member list filters and latest-first sorting; it has not been applied to any database in this task.

## Previous Task Update

- Date: 2026-05-28
- Scope: Production release of the accepted transport, membership, and storage/admin updates. GitHub was updated before Vercel deployment. No test data was uploaded; no database schema change, data clearing, or production data overwrite was performed.
- GitHub commit: `5573d96` (`Release accepted transport and storage updates`) on `codex/membership-v1`.
- Vercel deployment: `dpl_G2wPtMwemnobQCkDnpdMiPba8ayu`, production URL `https://webside-27a9etrg1-wwkevin8s-projects.vercel.app`, aliases `https://ngn.best` and `https://www.ngn.best`, status `READY`.
- Summary: Production now includes the accepted public carpool ordering/display updates, join-button recovery, admin transport group/request list defaults and recorded-toggle UI, membership pickup/storage sync updates, and P7 storage/buy-box admin detail/list improvements.

## Previous Task Update

- Date: 2026-05-28
- Scope: Membership pickup order recognition and admin highlighting. No commit, no deployment, no database schema change, no production data write, and no test-data upload.
- Summary: Pickup membership selection is now recognized for join-carpool order creation as well as normal pickup submission. The membership status endpoint can display an existing pickup order as the effective linked member reservation when the claim was selected but the historical order lacks stored membership fields. The admin transport request list now marks pickup rows yellow when they are tied to a stored membership claim or inferred from the user's selected pickup membership claim. The profile page now shows the pickup membership standard for selected and bound pickup claims.

## Latest Task Update

- Date: 2026-05-28
- Scope: Public transport board join-button recovery. No commit, no deployment, no database schema change, no production data write, and no test-data upload.
- Summary: The public transport group API now exposes an opaque join target request id for each renderable group so the full board can open the join form from group-based rows. The full board click handler no longer replaces the entire table with an error message when join preparation fails; it preserves the list and shows a temporary inline notice instead. Local verification after restarting the dev server confirmed clicking `加入拼车` keeps the table visible and opens the join modal with a target request id in an authenticated browser context.

## Latest Task Update

- Date: 2026-05-28
- Scope: Membership storage free-amount display sync. No commit, no deployment, no database schema change, no production data write, and no test-data upload.
- Summary: The public membership status API now displays the latest linked `storage_orders` membership discount/final-price fields for storage claims instead of relying only on the older claim snapshot. Admin storage pricing recalculation now also syncs the linked `membership_benefit_claims` amount snapshot, so future recalculations keep the personal-center free amount aligned with the admin order detail.

## Latest Task Update

- Date: 2026-05-28
- Scope: Admin storage detail schedule cleanup and pricing recalculation. No commit, no deployment, no database schema change, no production data write, and no test-data upload.
- Summary: The storage order detail page removed the duplicate read-only storage start/end/date fields. The editable schedule row now shows pickup/return time slot, storage start date, storage end date, and live storage days on one line. Saving schedule changes triggers existing storage price recalculation, and membership-linked storage orders recalculate membership discount/final price from the updated dates.

## Latest Task Update

- Date: 2026-05-28
- Scope: Admin storage order detail address-section deduplication. No commit, no deployment, no API change, no database change, no production data write, and no test-data upload.
- Summary: The admin storage order detail page now removes the duplicate read-only address field grid from the "地址信息" section. The editable address form remains in place for room/building, postcode, lift, upstairs, full address, and save action.

## Latest Task Update

- Date: 2026-05-28
- Scope: Admin storage all-orders membership-free price display. No commit, no deployment, no API change, no database change, no production data write, and no test-data upload.
- Summary: In the storage all-orders list, membership-linked orders with a final payable amount of `0` now show `会员免费服务` in the price column instead of `£0.00`. Non-free orders keep the existing money display.

## Latest Task Update

- Date: 2026-05-28
- Scope: Admin storage order detail UI cleanup. No commit, no deployment, no API change, no database change, no production data write, and no test-data upload.
- Summary: The admin 寄存订单详情 page no longer shows the standalone "状态口径" section or its inline payment/offline-recorded action buttons. The top summary badges remain visible, and the following "用户与联系方式" section now moves up directly after "订单基础信息".

## Latest Membership Rule Fix

- Date: 2026-05-28
- Scope: Membership storage entitlement rule correction. No commit, no deployment, no database schema change, no production data write, and no test-data upload.
- Summary: Storage membership now covers up to 6 boxes, includes the matching free paper boxes, and no longer treats delivery/stairs-style service fees as "会员不减免费用". Local-only order `ST-C-260528-0002` was recalculated to `会员减免 £177.60`, `会员不减免费用 £0.00`, and `总费用 £0.00`.

## Latest Acceptance Fix

- Date: 2026-05-28
- Scope: Membership storage discount excluded-fee cleanup. No commit, no deployment, no database schema change, no production data write, and no test-data upload.
- Summary: Storage membership discount calculation now counts buy-box purchase fees once instead of summing duplicate sources. Admin storage detail now labels this line as "会员不减免费用" instead of "附加费用". Local-only order `ST-C-260528-0002` was recalculated to `会员减免 £152.60`, `会员不减免费用 £25.00`, and `总费用 £25.00`.

## Latest Task Update

- Date: 2026-05-28
- Scope: Public transport board action-column layout tightening. No commit, no deployment, no database change, no production data write, and no test-data upload.
- Summary: The full public transport board operation buttons now render on one row with `查看详情` on the left and `加入拼车` on the right. Table row spacing and cell padding were tightened while preserving full button visibility on desktop and mobile horizontal-scroll checks.

## Previous Task Update

- Date: 2026-05-28
- Scope: Public carpool preview and full transport board student-priority display. No commit, no deployment, no database change, no production data write, and no test-data upload.
- Summary: The pickup page public carpool preview now requests and displays up to 9 current/future groups with `limit=9` and upcoming sort. The full transport board now keeps upcoming sort on default load and after filtering, uses the student-priority column order `接送机时间 / 服务类型 / 机场 / 航站楼 / 航班号 / 当前人数 / 拼车组编号 / 操作`, moves the group ID after current headcount, and keeps operation buttons fully visible on desktop and mobile horizontal-scroll verification.

## Previous Acceptance Fix

- Date: 2026-05-28
- Scope: P7 buy-box quantity recalculation and related local test order. No commit, no deployment, no database schema change, no production data write, and no test-data upload.
- Summary: Buy-box quantity saving now recalculates and persists the current buy-box order total, no longer blocks the save when a separate related storage order is missing, and fetches a related storage order for the detail link when one exists. A local-only Supabase test order `TEST-ST-P-007` was created for `TEST-ST-B-007` to support manual linked-order testing.

## Previous Task Update

- Date: 2026-05-28
- Scope: P7 storage all-orders offline-recorded column toggle. No commit, no deployment, no database change, no production data write, and no test-data upload.
- Summary: The storage all-orders list now renders the "线下记录" column itself as a reversible status button. Clicking "已记录" switches the row back to "未记录", clicking "未记录" switches it to "已记录", and the existing `toggleOfflineRecorded` save path is reused.

## Latest Handoff Update

- Date: 2026-05-28
- Scope: P7 buy-box order detail local UI cleanup. No commit, no deployment, no database change, no production data write, and no test-data upload.
- Summary: The buy-box detail page combines the previous "买箱明细" and "费用汇总" blocks into one "买箱与费用汇总" block. Delivery information remains in its own block, box count editing still uses the existing save path, and the related storage-order link remains visible in the merged summary.

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-28
- Scope: Transport request workbench offline-recorded column UI simplification. No commit, no deployment, no database change, no production data write, and no test-data upload.
- Summary: The admin "登记接送机订单" list now uses one status button in the "是否已记录" column. The button text is only `未记录` or `已记录`, and clicking it still reuses the existing row-level offline-recorded toggle behavior.

## Latest Completed Work

- Regression protection exists:
  - `REGRESSION_CHECKLIST.md` defines the required pre-commit checks for accepted transport request, transport group, storage workbench, and data-safety behavior.
  - `scripts/regression-check.js` performs a static guard check for default filters/sorts, key fields/buttons, detail-page operation-section regressions, legacy-admin test entry usage, and local-only test-data script safety.
  - `.gitignore` excludes `scripts/seed-storage-test-data.js` and `scripts/clear-storage-test-data.js` so local-only test data helpers cannot be accidentally committed.
- P7 storage workbench local work now includes:
  - `StorageAllOrdersView.vue` list compaction, a single visible filter form for validity, quick date, service content, payment status, offline-recorded status, operator, manual dates, sort, export, and pagination. The earlier duplicate top shortcut bar was removed so operators only use one filter area. The statistics cards are clickable and apply the matching list filters immediately.
  - `StorageOrderDetailView.vue` detail migration/cleanup, customer-readable summary, internal notes, fee display, Chinese operation logs, the standalone "状态口径" block removed from the detail layout, and the duplicate read-only address grid removed from the "地址信息" section.
  - `BoxOrderDetailView.vue` editable delivery information including delivery method, merged "买箱与费用汇总" block with the buy-box table, editable box quantity, box fee, delivery fee, adjustment/discount display, total fee, related storage-order link, payment/offline-recorded action buttons under internal notes/operation logs, and no old operation-section/backend-processing block.
  - `api/admin/[...action].js` and `api/_lib/storage-orders.js` support storage workbench filtering, current stats, detail operation logs, internal notes, offline-recorded operation log labels, and buy-box quantity updates that recalculate pricing and sync a related storage order when one can be found.
  - P7-specific CSS helper classes use storage-prefixed names where newly introduced for the workbench/detail pages.
  - `StorageAllOrdersView.vue` filters send `date_scope`, `quick_date`, `date_start`, `date_end`, `offline_recorded`, `payment_status`, and `service_type` through the same query builder used by the table and export flow.
  - Storage list loading ignores stale responses when a newer filter request has already started.
- P6 carpool group regression fix:
  - `TransportGroupFilters.vue` visibly renders active/all/invalid group validity options and nearest/farthest service-time sort options.
  - `TransportGroupsView.vue` keeps default `validity: "active"` and `sort: "service_time_asc"`.
  - `scripts/regression-check.js` checks that the carpool group validity and service-time sort controls remain present.
- Transport request workbench cleanup:
  - `TransportRequestsView.vue` exposes the existing `toggleOfflineRecorded` behavior directly in both the legacy transport request list column and the current workbench `是否已记录` column.
  - The column now renders one status button only: `未记录` for unrecorded rows and `已记录` for recorded rows. The previous extra `切为未记录` / `标记已记录` action text was removed from this column.
  - `styles.css` adds a scoped `offline-recorded-toggle` button style for the gray/green state button.
  - `scripts/regression-check.js` now guards that transport request rows use one status toggle button and do not show the extra action text.

## Verification

- `Select-String` checks for `enhancedAddressFields` and `ReadonlyField v-for="item in enhancedAddressFields"` in `apps\admin-vue\src\views\StorageOrderDetailView.vue` returned no matches.
- `npm --prefix apps/admin-vue run build` passed and refreshed the local `admin/` static output to `admin/assets/index-Bob6B9G_.js` and `admin/assets/index-DVcvb6_8.css`.
- `rg -n "状态口径|statusFields|toggleOfflineRecorded|togglePaymentReceived|savingOffline|savingPayment" apps\admin-vue\src\views\StorageOrderDetailView.vue` returned no matches.
- `npm --prefix apps/admin-vue run build` passed and refreshed the local `admin/` static output to `admin/assets/index-C3dKwvOn.js` and `admin/assets/index-DVcvb6_8.css`.
- `node --check transport-public.js` passed.
- `node --check public-api-handlers/transport-groups.js` passed.
- `node --check public-api-handlers/transport-board.js` passed.
- Local API verification at `http://localhost:3000/api/public/transport-groups?sort=upcoming&limit=9&page=1` returned 9 items, `page_size: 9`, `sort: upcoming`, current/future-only times, and ascending effective service times.
- Browser verification on `pickup.html` confirmed the preview request URL includes `limit=9`, the preview rendered 9 rows, and the rendered times were ascending from future nearest to farthest.
- Browser verification on `transport-board.html` confirmed default and post-filter requests include `sort=upcoming`, headers render in the student-priority order, the first row starts with `接送机时间`, group ID appears after current headcount, and operation buttons are fully visible on desktop plus after mobile horizontal scroll.
- Browser verification on `transport-board.html` after the action-column tightening confirmed `查看详情` and `加入拼车` are on the same row, `加入拼车` is to the right, row gaps are 6px, and the two buttons remain visible on desktop and mobile horizontal-scroll checks.
- `node scripts/regression-check.js` passed.
- `npm --prefix apps/admin-vue run build` passed and refreshed the local `admin/` static output to `admin/assets/index-mouLrgPG.js` and `admin/assets/index-DVcvb6_8.css`.
- Browser verification attempted at `http://127.0.0.1:3000/admin/transport/requests`, but the in-app browser was redirected to `admin-login.html` because it had no current administrator session. Authenticated click testing still needs a logged-in admin session.
- A local-only Supabase row `TEST-ST-P-007` was created for manual linked-order testing; no Preview, Production, or maintenance endpoint was called.
- Release verification on 2026-05-28:
  - `node scripts/regression-check.js` passed before deployment.
  - `npm run build:prod` passed before deployment.
  - `git push origin codex/membership-v1` pushed release commit `5573d96` before production deployment.
  - `npm run deploy:prod` deployed production `dpl_G2wPtMwemnobQCkDnpdMiPba8ayu`, status `READY`, alias `https://ngn.best`.
  - Production public API `https://ngn.best/api/public/transport-groups?sort=upcoming&limit=9&page=1` returned 9 items, `page_size: 9`, `sort: upcoming`, and ascending service times.
  - Production full board API with `limit=10` returned ascending service times.
  - Production browser check confirmed pickup preview renders 9 cards and requests `limit=9`.
  - Production browser check confirmed full board field order: `接送机时间 / 服务类型 / 机场 / 航站楼 / 航班号 / 当前人数 / 拼车组编号 / 操作`.
  - Production browser check confirmed the first full-board join button text is `加入拼车`, is enabled, and is fully visible at desktop and mobile widths.
  - Production browser check confirmed unauthenticated `加入拼车` click redirects to `login.html?return_to=%2Ftransport-board.html`; no join form was submitted and no production data was written.
  - Production browser check confirmed `查看详情` opens the detail modal without removing the board rows.
  - Production admin bundle `admin/assets/index-CyiSAfn1.js` matches the committed release bundle, and unauthenticated admin API access returns `401`.
  - Vercel inspect confirmed deployment `dpl_G2wPtMwemnobQCkDnpdMiPba8ayu` is production `Ready`.
  - Vercel error-level logs in the first hour showed only Node `[DEP0169] url.parse()` deprecation warnings on successful `200` requests; no 5xx deployment failure was observed.
- No test data was uploaded.
- No production data was written.
- No production data was cleared, overwritten, or modified during release verification. Admin login and recorded-toggle clicks were intentionally not executed because they would write production `last_login_at` or order status data.

## Current Project State

- Production release `5573d96` is live on `https://ngn.best`.
- Public carpool student-priority display and join-button changes are deployed.
- Admin transport group defaults, transport request recorded-toggle UI, and P7 storage/buy-box admin changes are deployed.
- Committed admin build output points to `admin/assets/index-CyiSAfn1.js` and `admin/assets/index-DVcvb6_8.css`.
- Local-only storage seed/clear helpers remain ignored and must not be run against Preview or Production.

## Open Risks / Follow-Up

- Before the next commit, run `node scripts/regression-check.js` and include the result in the commit/release note.
- The regression check is intentionally static/minimal; it does not replace focused browser/API verification before future releases.
- Admin recorded-toggle click testing was not performed on production because it would modify live order data. If the operator wants a live click test, choose a safe real order and explicitly authorize the temporary toggle and revert.
- Investigate the Vercel/Node `[DEP0169] url.parse()` deprecation warning separately; it appeared as error-level logs on successful requests and was not a release blocker.
