# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-26
- Scope: P7 storage workbench Preview preparation is in isolation cleanup. P6 has already been promoted separately and must not be mixed into this P7 Preview. This P7 pass is limited to storage admin list/detail, filters, internal notes, offline-recorded status, export, operation logs, and local-only test-data scripts.

## Latest Completed Work

- P6 transport performance/read-only GET patch was completed separately and promoted to Production before returning to P7. It should stay out of the P7 Preview branch/worktree.
- P7 storage workbench local work exists for:
  - `StorageAllOrdersView.vue` list compaction, filters, current-result stats, internal-note summary/editing, offline-recorded toggles, export, and pagination.
  - `StorageOrderDetailView.vue` storage order detail migration/cleanup, customer-readable summary, internal notes, offline-recorded state, fee breakdown display, and operation logs.
  - `api/admin/[...action].js` and `api/_lib/storage-orders.js` support for storage workbench filtering, current stats, detail operation logs, internal notes, and offline-recorded operation log labels.
  - `scripts/seed-storage-test-data.js` and `scripts/clear-storage-test-data.js` are local-only helpers guarded by `LOCAL_SUPABASE_URL`; they must not be run against production.

## Verification

- Current task performed workspace isolation only.
- A full dirty-worktree backup stash was created before cleanup: `stash@{0}: backup-before-p7-preview-isolation`.
- No Preview deployment was run.
- No maintenance POST was run.
- No production data was read or modified by this isolation cleanup.
- No test data was uploaded.

## Current Project State

- P7 Preview candidate files should be limited to storage workbench files and docs:
  - `api/_lib/storage-orders.js`
  - `api/admin/[...action].js`
  - `apps/admin-vue/src/views/StorageAllOrdersView.vue`
  - `apps/admin-vue/src/views/StorageOrderDetailView.vue`
  - `apps/admin-vue/src/styles.css`
  - `docs/PROJECT_MAP.md`
  - `docs/current-status.md`
  - `scripts/seed-storage-test-data.js`
  - `scripts/clear-storage-test-data.js`
- Build output, transport/P6/P0 files, SQL files, CSV files, and package changes are excluded from the current P7 Preview candidate.

## Open Risks / Follow-Up

- Before deploying P7 Preview, run a local/admin build and confirm generated `admin/` bundle changes are fresh and limited to the P7 build output.
- P7 Preview must not include transport API changes, close-expired automation, maintenance POST calls, production data cleanup, or test-data uploads.
- If Preview lacks enough storage orders for manual verification, use only local seed data in a local Supabase environment; do not seed Preview or Production.
