# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-05
- Scope: implemented storage entry ordering, box quick order, and storage-return history linkage

## Completed In This Task

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before analysis.
- Reordered the storage estimate page entry buttons to `买箱子 / 送箱`, `预约寄存 / 入仓`, then `取寄存 / 取回`.
- Added the same-page `买箱子 / 送箱` quick form with required delivery/contact fields and direct `box_delivery` submission.
- Kept `预约寄存 / 入仓` gated by a valid calculator estimate plus login before entering `storage-booking.html?service=storage_collection`.
- Changed `取寄存 / 取回` so it only requires login before entering `storage-booking.html?service=storage_return`; it no longer requires a calculator estimate.
- Added `GET /api/public/my-storage-orders`, scoped to the authenticated user's active `storage_collection` orders and limited to safe return-form fields.
- Added storage-return history matching during `storage_return` submission and records `customer_form_json.storage_return_history_check`.
- Updated the `storage_return` booking form to show matching historical storage orders, default-select the latest one, and auto-fill related return fields.
- Kept manual `storage_return` submission available when no history is found, with a warning that the backend will manually verify it.
- Updated admin storage list/detail views to show a red manual-verification warning when a `storage_return` order is not matched to an active same-account `storage_collection` order, and to show the matched order number when matched.
- Ran focused syntax checks for `script.js`, `admin-pages.js`, `public-api-handlers/my-storage-orders.js`, `public-api-handlers/storage-order-submit.js`, `api/public/[...action].js`, and `api/admin/[...action].js`.
- Performed a local browser smoke check on `storage.html`, `storage-booking.html?service=storage_collection`, `storage-booking.html?service=storage_return`, and confirmed `storage-booking.html?service=box_delivery` redirects back to `storage.html#storageBoxQuickOrder`.

## Current Project Status

- Project rules explicitly forbid paid, proprietary, subscription-only, or unclear-license fonts; future visual work should use only free commercial-use fonts or safe system font stacks.
- The storage implementation now includes dedicated entry behavior for buy-box, storage collection, and storage return flows.
- The storage estimate page uses warmer booking-entry buttons, a same-page buy-box form, and a light rainbow total-price card.
- The storage booking page now treats buy-box as estimate-page-only; direct `service=box_delivery` requests redirect back to the estimate page quick form.
- The public storage-history API and backend return-history match metadata are implemented in local source.
- Static pages now point at a fresh shared asset version string to force browsers to request updated CSS/JS after deployment.
- Vercel cache headers are configured for conservative freshness on HTML and API responses.
- Production is live on Vercel at `https://ngn.best`; latest deployment URL is `https://webside-awveerjas-wwkevin8s-projects.vercel.app`.
- The local source also includes the prior order center detail 404 route fix, but it has not yet been deployed to production.
- The workspace is still noisy because `.tmp-dpl-3ReB2SCYt-output/` contains many generated edits and several work-log files are untracked.
- Running earlier Vercel builds pulled local `.vercel` project settings and preview environment files; `.vercel` is already ignored by Git.

## Open Issues Or Risks

- The new storage-history API and real order creation/matching still need authenticated database-backed verification with actual front-desk/test accounts.
- The storage changes have not been committed, pushed, or deployed to production yet.
- Production still has the order center detail 404 until the prior route fix is committed, pushed, and deployed.
- Users who already have an old HTML document open may need to reload once after the new deployment lands.
- Production log scan found Node `[DEP0169] url.parse()` deprecation warnings marked as error-level logs, but the expanded log entries were warnings rather than business endpoint crashes.
- The generated `.tmp-dpl-3ReB2SCYt-output/` tree remains in the working copy and continues to obscure meaningful repo changes.
- The storage SQL migration still needs to be applied in the target database environment.
- The earlier transport schema/status-drift risks remain open separately: duplicate prevention is mostly application-side, group/request/member status can drift, and live `create_site_transport_request` differs from repository SQL.

## Recommended Next Steps

1. Verify the new storage flows with authenticated test accounts: buy-box submission, storage collection estimate gating, return-history auto-fill, no-history manual submission, and forged-order mismatch.
2. Commit, push, and deploy the storage changes together with the existing order detail route fix when ready.
3. After deployment, verify the production storage pages and admin storage warnings on `https://ngn.best`.
4. Apply `supabase/20260503_storage_service_order_types.sql` in the target Supabase environment if it has not already been applied.
5. Replace remaining `url.parse()` usage or dependency paths causing Node `[DEP0169]` warnings so Vercel error-level logs stay clean.
6. Clean up or isolate `.tmp-dpl-3ReB2SCYt-output/` so the real source diff is easier to review.
