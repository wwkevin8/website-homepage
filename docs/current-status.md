# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-26
- Scope: P7 storage workbench Preview deployment and read-only validation. P6 has already been promoted separately and was used only as the clean baseline; no transport/P6/P0 dirty files were restored into the P7 Preview branch.

## Latest Completed Work

- P6 transport performance/read-only GET patch was completed separately and promoted to Production before returning to P7. It should stay out of the P7 Preview branch/worktree.
- P7 storage workbench local work exists for:
  - `StorageAllOrdersView.vue` list compaction, filters, current-result stats, internal-note summary/editing, offline-recorded toggles, export, and pagination.
  - `StorageOrderDetailView.vue` storage order detail migration/cleanup, customer-readable summary, internal notes, offline-recorded state, fee breakdown display, and operation logs.
  - `api/admin/[...action].js` and `api/_lib/storage-orders.js` support for storage workbench filtering, current stats, detail operation logs, internal notes, and offline-recorded operation log labels.
  - `scripts/seed-storage-test-data.js` and `scripts/clear-storage-test-data.js` are local-only helpers guarded by `LOCAL_SUPABASE_URL`; they must not be run against production.

## Verification

- P7 Preview source commit: `c84fa5d` (`codex/p7-storage-preview`).
- P7 Preview deployment: `dpl_GATcJm1Z77ByqiK5CaPvuJDKcxBd`, URL `https://webside-lbetxmf0g-wwkevin8s-projects.vercel.app`.
- Vercel remote build completed successfully; admin Vue build produced `admin/index.html`, `admin/assets/index-BPBprzA8.css`, and `admin/assets/index-O6-bXhk_.js` in the remote build output only.
- Read-only Preview validation used GET requests and export only:
  - Storage workbench route returns 200.
  - Storage list returned 15 rows total, page size 10, total pages 2.
  - Current-result stats returned total 15, offline recorded 1, offline unrecorded 14, unpaid 15, today/next 7 days 3.
  - Default service-date ordering is correct when checked against `service_date_unified`, the same expanded-row date used by the workbench.
  - Search by order number, name, phone, and address returned matching rows.
  - Service type, charge status, payment status, offline-recorded status, date range, and last-operator filters returned valid paginated results.
  - Export current filtered results returned an Excel payload.
  - Detail GET works with the base storage order UUID used by the actual list detail link; sample order `ST260410-0001` returned full order data and one operation log.
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
