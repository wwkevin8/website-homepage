# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-27
- Scope: P7 storage workbench Preview minimal follow-up fixes after manual review: add a list offline-recorded status column and make top stat cards clickable filters. P6 remains completed/promoted separately and was not changed in this task.

## Latest Completed Work

- P6 transport performance/read-only GET patch was completed separately and promoted to Production before returning to P7. It should stay out of the P7 Preview branch/worktree.
- P7 storage workbench Preview was repaired after manual review rejected the earlier simplified list:
  - `StorageAllOrdersView.vue` keeps the Production-style operator list structure: service date, time slot, name, service content, apartment/address, phone, price, fee/payment note, actionable payment button, customer-service note textarea/save behavior, and actions.
  - Payment renders as the current payment state button (`已收款` / `未收款`) while keeping the existing click handler that toggles the same Production billing fields. No waived/zero-price shortcut was added.
  - A read-only offline-recorded status column was added after the payment column. It displays the existing `offline_recorded` value as `已记录` / `未记录` without changing toggle behavior, operation logs, or API field meaning.
  - Top stat cards are clickable shortcuts: current result clears shortcut filters, unrecorded sets `offline_recorded=false`, recorded sets `offline_recorded=true`, unpaid sends `payment_scope=unpaid`, and today/next-7-days sets the visible date range while keeping active orders.
  - Minimal P7 list enhancements remain layered on top: current-result stats, clickable stats shortcuts, search placeholder including apartment/address, existing filters, validity filter (`有效单` / `历史单 / 无效单` / `全部`), pagination total/total pages, default service-date sort, and export current filtered result.
  - `StorageOrderDetailView.vue` remains the P7 detail migration/cleanup with customer-readable summary, internal notes, fee breakdown display, offline-recorded state, and operation logs. It no longer sends pricing recalculation flags from schedule/address saves.
  - `api/admin/[...action].js` adds current stats, stat shortcut filters, and detail operation logs as additive fields while keeping the old detail GET top-level order response shape.
  - `scripts/seed-storage-test-data.js` and `scripts/clear-storage-test-data.js` are local-only helpers guarded by `LOCAL_SUPABASE_URL`; they must not be run against production.

## Verification

- Obsolete P7 Preview deployments that must not be promoted:
  - `dpl_GATcJm1Z77ByqiK5CaPvuJDKcxBd`, URL `https://webside-lbetxmf0g-wwkevin8s-projects.vercel.app`, source `c84fa5d`.
  - `dpl_6Hwa4CqcnViakvXySi5aw18cnKrt`, URL `https://webside-hwoh9snus-wwkevin8s-projects.vercel.app`, source `1e7c1cd`.
  - `dpl_HW72E55Xc4EKvm9DtLzTxhnKdnKe`, URL `https://webside-h3yvwcbkz-wwkevin8s-projects.vercel.app`, source `4e8d8ed`.
  - `dpl_E2fhw9Qi7vf4BCyhDPTWvZ2ovgh4`, URL `https://webside-mu1kuew33-wwkevin8s-projects.vercel.app`, source `64ac74b`.
- Latest P7 stat-shortcut source commit: `2edb3e9`.
- Latest P7 stat-shortcut Preview deployment: `dpl_C1rsqYFQ5LdaFqKuSW5JHAc543BC`, URL `https://webside-rdxxky71b-wwkevin8s-projects.vercel.app`.
- Latest P7 stat-shortcut changed:
  - `api/admin/[...action].js`
  - `apps/admin-vue/src/views/StorageAllOrdersView.vue`
  - `apps/admin-vue/src/styles.css`
- Local verification:
  - `node --check api/admin/[...action].js` passed.
  - `git diff --check` passed for modified P7 files.
  - `npm run build:preview` passed. Root dependency audit still reports one existing moderate vulnerability; no dependency files were changed in this task.
- Latest stat-shortcut Preview read-only validation:
  - Storage workbench route returns 200.
  - Default active view returned 7 rows total, 1 page; all 7 rows are unrecorded and unpaid under the existing Production-compatible payment check.
  - Unrecorded shortcut (`offline_recorded=false`) returned 7 rows total, 1 page.
  - Recorded shortcut (`offline_recorded=true`) returned 0 rows total, 0 pages for the current active view.
  - Unpaid shortcut (`payment_scope=unpaid`) returned 7 rows total, 1 page, using the existing `payment_status === "paid"` check to exclude paid rows.
  - Today/next-7-days shortcut (UK date range 2026-05-27 through 2026-06-03) returned 3 rows total, 1 page.
  - Exports for unrecorded, recorded, unpaid, and today/next-7-days shortcuts all returned Excel payloads.
  - No shortcut validation used write methods.
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
