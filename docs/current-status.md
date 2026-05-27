# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-27
- Scope: P7 storage workbench Preview detail-page rollback after manual review: restore `StorageOrderDetailView.vue` exactly to the current Production mother version and remove the extra operation-log detail UI. P6 remains completed/promoted separately and was not changed in this task.

## Latest Completed Work

- P6 transport performance/read-only GET patch was completed separately and promoted to Production before returning to P7. It should stay out of the P7 Preview branch/worktree.
- P7 storage workbench Preview is currently focused only on storage admin list/detail, filters, internal notes, offline-recorded status, export, operation logs, and local-only test-data scripts.
- Current P7 storage list behavior:
  - `StorageAllOrdersView.vue` keeps the Production-style operator list structure: service date, time slot, name, service content, apartment/address, phone, price, fee/payment note, actionable payment button, customer-service note textarea/save behavior, and actions.
  - Payment renders as the current payment state button (`已收款` / `未收款`) while keeping the existing click handler that toggles the same Production billing fields. No waived/zero-price shortcut was added.
  - The offline-recorded status column now renders as a clickable button showing the current state (`已记录` / `未记录`). It calls the same existing `toggleOfflineRecorded` flow as the right-side action button.
  - Top stat cards are clickable shortcuts: current result clears shortcut filters, unrecorded sets `offline_recorded=false`, recorded sets `offline_recorded=true`, unpaid sends `payment_scope=unpaid`, and today/next-7-days sets the visible date range while keeping active orders.
  - `StorageOrdersView.vue` subpages (`买箱订单`, `取寄存订单`, `送寄存订单`) now have the same active/history/all validity filter, default to active orders, and send `validity_scope` through list and export requests.
  - `api/admin/[...action].js` now applies expanded-row `service_date_unified` filtering for the all-orders page and the three storage subpages, so service type plus validity filters share the same pagination/export basis.
  - `StorageOrderDetailView.vue` has been restored exactly to the current Production mother version from commit `42bf796`. Order base info, contact info, storage schedule, address info, box/quantity info, fee breakdown, notes, customer-readable summary, and operation area keep the original structure, field order, and display logic.
  - The extra detail-page operation-log UI from the previous Preview has been removed from the detail page. Existing API compatibility is untouched.
  - `scripts/seed-storage-test-data.js` and `scripts/clear-storage-test-data.js` are local-only helpers guarded by `LOCAL_SUPABASE_URL`; they must not be run against production.

## Verification

- Obsolete P7 Preview deployments that must not be promoted:
  - `dpl_GATcJm1Z77ByqiK5CaPvuJDKcxBd`, URL `https://webside-lbetxmf0g-wwkevin8s-projects.vercel.app`, source `c84fa5d`.
  - `dpl_6Hwa4CqcnViakvXySi5aw18cnKrt`, URL `https://webside-hwoh9snus-wwkevin8s-projects.vercel.app`, source `1e7c1cd`.
  - `dpl_HW72E55Xc4EKvm9DtLzTxhnKdnKe`, URL `https://webside-h3yvwcbkz-wwkevin8s-projects.vercel.app`, source `4e8d8ed`.
  - `dpl_E2fhw9Qi7vf4BCyhDPTWvZ2ovgh4`, URL `https://webside-mu1kuew33-wwkevin8s-projects.vercel.app`, source `64ac74b`.
  - `dpl_C1rsqYFQ5LdaFqKuSW5JHAc543BC`, URL `https://webside-rdxxky71b-wwkevin8s-projects.vercel.app`, source `2edb3e9`.
  - `dpl_GZFPkAwuWEL4fyvTvZ1kUeN4MTpv`, URL `https://webside-l6kegrcov-wwkevin8s-projects.vercel.app`, source `0017a19`.
- Latest P7 subpage-validity source commits:
  - `0017a19` for offline status buttons and subpage validity UI/API.
  - `18e8668` for the subpage service-type filter correction.
- Latest P7 subpage-validity Preview deployment: `dpl_8RTUsM3bzDG4DLR6Q4WAtwy4Bki6`, URL `https://webside-3r0obcfuu-wwkevin8s-projects.vercel.app`.
- Latest P7 detail-page correction source commit: `b8d8934`.
- Latest P7 detail-page correction Preview deployment: `dpl_81GVoLSXqrK2C5gs6AJAqAxvpZmQ`, URL `https://webside-3f9zq5miu-wwkevin8s-projects.vercel.app`.
- That detail correction Preview is now obsolete because it still added operation-log UI to the detail page.
- Latest P7 detail-page full rollback source commit: `fd4bae8`.
- Latest P7 detail-page full rollback Preview deployment: `dpl_6wQy9JbofANiWYvzToxaKzzZRjwi`, URL `https://webside-qxes7f8b4-wwkevin8s-projects.vercel.app`.
- It removes detail-page operation-log UI and keeps no detail-page UI additions beyond the current Production mother page.
- Latest P7 subpage-validity changed:
  - `api/admin/[...action].js`
  - `apps/admin-vue/src/views/StorageAllOrdersView.vue`
  - `apps/admin-vue/src/views/StorageOrdersView.vue`
  - `apps/admin-vue/src/styles.css`
- Local verification:
  - `node --check api/admin/[...action].js` passed.
  - `git diff --check` passed for modified P7 files.
  - `npm run build:preview` passed after the detail-page Production-body restore. Root dependency audit still reports one existing moderate vulnerability; no dependency files were changed in this task.
- Latest subpage-validity Preview read-only validation:
  - `买箱订单`: active 2 rows/1 page, history 4 rows/1 page, all 6 rows/1 page; all returned rows have `storage_order_kind=box_order`.
  - `取寄存订单`: active 5 rows/1 page, history 4 rows/1 page, all 9 rows/1 page; all returned rows have `storage_order_kind=storage_collection`.
  - `送寄存订单`: active/history/all all returned 0 rows/0 pages, matching current data; no unrelated service type leaked into the result.
  - Active exports for all three subpages returned Excel payloads.
  - The offline-recorded status column button was code/build verified only; no offline toggle write was executed against real data.
- Latest detail-page correction Preview read-only validation:
  - Detail route `/admin/storage/storage-orders/58c63b90-b5d3-4698-8ff8-727cfa861a27` returned HTTP 200.
  - Detail API GET `/api/admin/storage-orders?id=58c63b90-b5d3-4698-8ff8-727cfa861a27` returned old top-level order fields plus additive `operation_logs`.
  - The check used only GET/HEAD requests; no save, status change, offline-recorded toggle, delete, maintenance POST, cleanup, or production data mutation was executed.
- Latest local detail rollback verification:
  - `git diff 42bf796 -- apps/admin-vue/src/views/StorageOrderDetailView.vue` returned no diff.
  - `npm run build:preview` passed after the exact detail-page rollback. Root dependency audit still reports one existing moderate vulnerability; no dependency files were changed in this task.
  - Preview detail route `/admin/storage/storage-orders/58c63b90-b5d3-4698-8ff8-727cfa861a27` returned HTTP 200 on `dpl_6wQy9JbofANiWYvzToxaKzzZRjwi`.
- A full dirty-worktree backup stash still exists in the original worktree: `stash@{0}: backup-before-p7-preview-isolation`.
- No Production promote was run.
- No maintenance POST was run.
- No production data was modified.
- No test data was uploaded.

## Current Project State

- P7 Preview branch files are limited to storage workbench files and docs:
  - `api/_lib/storage-orders.js`
  - `api/admin/[...action].js`
  - `apps/admin-vue/src/views/StorageAllOrdersView.vue`
  - `apps/admin-vue/src/views/StorageOrderDetailView.vue`
  - `apps/admin-vue/src/views/StorageOrdersView.vue`
  - `apps/admin-vue/src/styles.css`
  - `docs/PROJECT_MAP.md`
  - `docs/current-status.md`
  - `scripts/seed-storage-test-data.js`
  - `scripts/clear-storage-test-data.js`
- Build output, transport/P6/P0 files, SQL files, CSV files, and package changes are excluded from the P7 Preview branch.

## Open Risks / Follow-Up

- P7 Preview write-class features were intentionally not exercised against real production data: payment toggles, bulk offline-recorded toggles, single-row offline-recorded toggles, internal-note saves, status changes, and delete.
- Before any P7 Production promote, perform a full regression with an explicitly approved safe test order if write validation is required.
- The latest Preview is ready for manual UI review, but it should not be promoted until the user explicitly approves it.
- P7 must still not include transport API changes, close-expired automation, maintenance POST calls, production data cleanup, or test-data uploads.
