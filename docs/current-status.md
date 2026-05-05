# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-05
- Scope: pushed and deployed storage flow updates plus order detail route fix

## Completed In This Task

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before analysis.
- Used the Vercel deployment workflow and followed the project rule to push GitHub before deploying to Vercel.
- Reordered the storage estimate page entry buttons for buy-box, storage collection, and storage return flows.
- Added the same-page buy-box quick form with required delivery/contact fields and direct `box_delivery` submission.
- Kept storage collection gated by a valid calculator estimate plus login before entering `storage-booking.html?service=storage_collection`.
- Changed storage return so it only requires login before entering `storage-booking.html?service=storage_return`; it no longer requires a calculator estimate.
- Added `GET /api/public/my-storage-orders`, scoped to the authenticated user's active `storage_collection` orders and limited to safe return-form fields.
- Added storage-return history matching during `storage_return` submission and records `customer_form_json.storage_return_history_check`.
- Updated the `storage_return` booking form to show matching historical storage orders, default-select the latest one, and auto-fill related return fields.
- Kept manual `storage_return` submission available when no history is found, with a warning that the backend will manually verify it.
- Updated admin storage list/detail views to show a red manual-verification warning when a `storage_return` order is not matched to an active same-account `storage_collection` order, and to show the matched order number when matched.
- Added `api/admin/orders/[id].js` so Vercel routes `/api/admin/orders/:id` to the existing unified admin handler.
- Ran `npm run build:prod` successfully.
- Committed the intended deployable changes as `97d93d1` (`Fix order detail route and storage return flow`) and pushed `codex/full-sync` to GitHub before Vercel deployment.
- Deployed the prebuilt production output to Vercel. Deployment `dpl_CBcRq14sjeLZAmQM4uWDHT7qZbbX` is `READY`.
- Confirmed Vercel aliased the deployment to `https://ngn.best`.
- Verified `https://ngn.best/admin-orders.html` returns 200.
- Verified `https://ngn.best/api/admin/orders/test-id` now reaches the admin API and returns 401 instead of Vercel 404 when unauthenticated.
- Verified `https://ngn.best/api/public/my-storage-orders` reaches the public API and returns 401 when unauthenticated.

## Current Project Status

- Project rules explicitly forbid paid, proprietary, subscription-only, or unclear-license fonts; future visual work should use only free commercial-use fonts or safe system font stacks.
- The storage implementation now includes dedicated entry behavior for buy-box, storage collection, and storage return flows.
- The storage estimate page uses warmer booking-entry buttons, a same-page buy-box form, and a light rainbow total-price card.
- The storage booking page now treats buy-box as estimate-page-only; direct `service=box_delivery` requests redirect back to the estimate page quick form.
- The public storage-history API and backend return-history match metadata are deployed.
- Static pages point at the shared `20260505-cache-bust-1` asset version string to force browsers to request updated CSS/JS after deployment.
- Vercel cache headers are configured for conservative freshness on HTML and API responses.
- Production is live on Vercel at `https://ngn.best`; latest deployment URL is `https://webside-qk0vnb497-wwkevin8s-projects.vercel.app`.
- The order center detail route fix is now deployed to production.
- After the production deploy, local `script.js`, `storage.html`, and `styles.css` contain additional uncommitted buy-box quantity/detail edits that were not part of commit `97d93d1` and were not included in deployment `dpl_CBcRq14sjeLZAmQM4uWDHT7qZbbX`.
- The workspace is still noisy because `.tmp-dpl-3ReB2SCYt-output/` contains many generated edits and several work-log files are untracked.
- Running Vercel builds pulled local `.vercel` project settings and preview/production output files; `.vercel` is already ignored by Git.

## Open Issues Or Risks

- The new storage-history API and real order creation/matching still need authenticated database-backed verification with actual front-desk/test accounts.
- Local `script.js`, `storage.html`, and `styles.css` have additional uncommitted edits that need review before any later commit or deployment.
- Users who already have an old HTML document open may need to reload once after the new deployment lands.
- Production log scan after deployment found Node `[DEP0169] url.parse()` deprecation warnings marked as error-level logs on unauthenticated verification requests, but no business endpoint crash was observed.
- The generated `.tmp-dpl-3ReB2SCYt-output/` tree remains in the working copy and continues to obscure meaningful repo changes.
- The storage SQL migration still needs to be applied in the target database environment.
- The earlier transport schema/status-drift risks remain open separately: duplicate prevention is mostly application-side, group/request/member status can drift, and live `create_site_transport_request` differs from repository SQL.

## Recommended Next Steps

1. Verify the deployed storage flows on `https://ngn.best` with authenticated test accounts: buy-box submission, storage collection estimate gating, return-history auto-fill, no-history manual submission, and forged-order mismatch.
2. Verify clicking `查看详情` in production order center opens the detail drawer while logged in as an admin.
3. Apply `supabase/20260503_storage_service_order_types.sql` in the target Supabase environment if it has not already been applied.
4. Replace remaining `url.parse()` usage or dependency paths causing Node `[DEP0169]` warnings so Vercel error-level logs stay clean.
5. Clean up or isolate `.tmp-dpl-3ReB2SCYt-output/` so the real source diff is easier to review.
