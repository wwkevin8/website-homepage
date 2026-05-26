# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-26
- Scope: P7 storage workbench Preview list UI correction after manual review. P6 has already been promoted separately and was used only as the clean baseline; no transport/P6/P0 dirty files were restored into the P7 Preview branch.

## Latest Completed Work

- P6 transport performance/read-only GET patch was completed separately and promoted to Production before returning to P7. It should stay out of the P7 Preview branch/worktree.
- P7 storage workbench local work exists for:
  - `StorageAllOrdersView.vue` now keeps the Production-style operator list structure: service date, time slot, name, service content, apartment/address, phone, price, fee/payment note, payment status, customer-service note, and actions. P7 stats, filters, export, pagination, and offline-recorded actions remain.
  - `StorageOrderDetailView.vue` storage order detail migration/cleanup, customer-readable summary, internal notes, offline-recorded state, fee breakdown display, and operation logs.
  - `api/admin/[...action].js` and `api/_lib/storage-orders.js` support for storage workbench filtering, current stats, detail operation logs, internal notes, and offline-recorded operation log labels.
  - `scripts/seed-storage-test-data.js` and `scripts/clear-storage-test-data.js` are local-only helpers guarded by `LOCAL_SUPABASE_URL`; they must not be run against production.

## Verification

- P7 Preview source commit: `c84fa5d` (`codex/p7-storage-preview`).
- P7 Preview deployment: `dpl_GATcJm1Z77ByqiK5CaPvuJDKcxBd`, URL `https://webside-lbetxmf0g-wwkevin8s-projects.vercel.app`.
- Manual review found the first P7 Preview list UI was too simplified and should not be promoted.
- Corrected P7 Preview source commit: `1e7c1cd`.
- Corrected P7 Preview deployment: `dpl_6Hwa4CqcnViakvXySi5aw18cnKrt`, URL `https://webside-hwoh9snus-wwkevin8s-projects.vercel.app`.
- Corrected Preview changed only:
  - `apps/admin-vue/src/views/StorageAllOrdersView.vue`
  - `apps/admin-vue/src/styles.css`
- Corrected Preview read-only validation:
  - Storage workbench route returns 200.
  - Storage list returned 15 rows total, page size 10, total pages 2.
  - Current-result stats returned total 15, offline recorded 1, offline unrecorded 14, unpaid 13, today/next 7 days 3.
  - Default service-date ordering is correct.
  - Search by sample order number returned 1 matching row.
  - Detail GET works for sample order `ST260410-0001` and returned one operation log.
  - Export current filtered results returned an Excel payload.
- Corrected Preview remote build completed successfully; admin Vue build produced `admin/index.html`, `admin/assets/index-ColA0E3k.css`, and `admin/assets/index-BmrtX8AB.js` in the remote build output only.
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
- P7 must still not include transport API changes, close-expired automation, maintenance POST calls, production data cleanup, or test-data uploads.
