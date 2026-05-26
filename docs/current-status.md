# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-27
- Scope: P7 storage workbench Preview repair using the current Production list as the mother version, with only minimal P7 enhancements re-applied. P6 remains completed/promoted separately and was not changed in this task.

## Latest Completed Work

- P6 transport performance/read-only GET patch was completed separately and promoted to Production before returning to P7. It should stay out of the P7 Preview branch/worktree.
- P7 storage workbench Preview was repaired after manual review rejected the earlier simplified list:
  - `StorageAllOrdersView.vue` was restored to the Production-style operator list structure: service date, time slot, name, service content, apartment/address, phone, price, fee/payment note, actionable payment button, customer-service note textarea/save behavior, and actions.
  - Minimal P7 list enhancements remain layered on top: current-result stats, search placeholder including apartment/address, existing filters, pagination total/total pages, default service-date sort, and export current filtered result.
  - `StorageOrderDetailView.vue` remains the P7 detail migration/cleanup with customer-readable summary, internal notes, fee breakdown display, offline-recorded state, and operation logs. It no longer sends pricing recalculation flags from schedule/address saves.
  - `api/admin/[...action].js` adds current stats and detail operation logs as additive fields while keeping the old detail GET top-level order response shape.
  - `scripts/seed-storage-test-data.js` and `scripts/clear-storage-test-data.js` are local-only helpers guarded by `LOCAL_SUPABASE_URL`; they must not be run against production.

## Verification

- Obsolete P7 Preview deployments that must not be promoted:
  - `dpl_GATcJm1Z77ByqiK5CaPvuJDKcxBd`, URL `https://webside-lbetxmf0g-wwkevin8s-projects.vercel.app`, source `c84fa5d`.
  - `dpl_6Hwa4CqcnViakvXySi5aw18cnKrt`, URL `https://webside-hwoh9snus-wwkevin8s-projects.vercel.app`, source `1e7c1cd`.
- Current repaired P7 Preview source commit: `4e8d8ed`.
- Current repaired P7 Preview deployment: `dpl_HW72E55Xc4EKvm9DtLzTxhnKdnKe`, URL `https://webside-h3yvwcbkz-wwkevin8s-projects.vercel.app`.
- Current repaired Preview changed:
  - `api/admin/[...action].js`
  - `apps/admin-vue/src/views/StorageAllOrdersView.vue`
  - `apps/admin-vue/src/views/StorageOrderDetailView.vue`
  - `apps/admin-vue/src/styles.css`
- Current repaired Preview read-only validation:
  - Storage workbench route returns 200.
  - Storage list returned 15 rows total, page size 10, total pages 2.
  - Current-result stats returned total 15, offline recorded 1, offline unrecorded 14, unpaid 13, today/next 7 days 3.
  - Default service-date sort is active.
  - Search by sample order number returned 1 matching row.
  - Service-type filter returned 5 matching rows for the sampled storage collection type.
  - Offline-recorded filters returned 1 recorded row and 14 unrecorded rows.
  - Date filter for 2026-05-15 returned 3 rows and 1 page.
  - Detail GET works for sample order `ST260410-0001` and returned one operation log.
  - Export current filtered results returned an Excel payload.
- Current repaired Preview remote build completed successfully; generated admin build output was not committed.
- Local build verification passed with `npm run build:preview`. Root dependency audit still reports one existing moderate vulnerability; no dependency files were changed in this task.
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

- P7 Preview write-class features were intentionally not exercised against real production data: bulk offline-recorded toggles, single-row offline-recorded toggles, internal-note saves, status changes, and delete.
- Before any P7 Production promote, perform a full regression with an explicitly approved safe test order if write validation is required.
- The current repaired Preview is ready for manual UI review, but it should not be promoted until the user explicitly approves it.
- P7 must still not include transport API changes, close-expired automation, maintenance POST calls, production data cleanup, or test-data uploads.
