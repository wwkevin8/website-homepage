# Current Status

## Latest Task Update

- Date: 2026-07-08
- Scope: Implemented the minimal public pickup/dropoff form timezone copy update. This changed only the existing frontend hint text on `pickup-form.html` plus this status note. No database schema, API, admin logic, existing order data, email behavior, automatic timezone conversion, build output, deployment config, or production data was changed.
- Summary: The public form's existing `.carpool-time-hint` under the `flight_datetime`, `preferred_time`, and `deadline_date` fields now clearly tells customers to enter UK local time and not China time: "时间请统一填写英国当地时间。系统默认按英国时间保存和显示，请不要填写中国时间；如填写中国时间可能会导致接送机安排错误。" The existing field names, input types, submit payload, validation, summary generation, and styling classes were left unchanged.
- Release: GitHub commit `8593979efca0ba7ca8be20ab2fb176decb12c34c` (`fix: add UK time notice to public pickup form`) was pushed to `origin/release/transport-storage-preflight`. GitHub/Vercel auto deployment produced preview `dpl_5HKtF8dDMAEiEMvobvHKguYExHtc` at `https://webside-ddwyff2g8-wwkevin8s-projects.vercel.app`. Manual Vercel production deployment `dpl_DushHkJb55xs53WLrySFuPUDuYbk` is `READY` at `https://webside-b3k71pemi-wwkevin8s-projects.vercel.app`, with aliases `https://ngn.best` and `https://www.ngn.best`.
- Verification: Static inspection confirmed `flight_datetime`, `preferred_time`, and `deadline_date` remain present with their original input types and that only the hint text changed in `pickup-form.html`. `node --check pickup-form.js`, `npm.cmd --prefix apps/admin-vue run build`, `node --check api/admin/[...action].js`, and `node scripts/regression-check.js` passed. Production Vercel inspect confirmed project `webside`, target `production`, status `Ready`, and aliases `https://ngn.best` / `https://www.ngn.best`. Production GET verification confirmed `https://ngn.best/pickup-form.html` contains the new UK-time notice.
- Open risks / follow-up: No known release blocker for this copy-only change. A browser visual spot check can still be done later if the operator wants to confirm exact wrapping on specific devices.

- Date: 2026-06-05
- Scope: Investigated the recurring 2.0 NGN admin transport groups empty-list issue and added a source-level regression guard. This work touched only the Vue admin transport-group list API source already fixed in the hotfix branch, `scripts/regression-check.js`, and this status file. No driver-side work, database change, API behavior change, public page change, email/payment change, or unrelated local dirty work was included.
- Summary: Root cause is release-line drift, not missing production data. The previous fix commit `b2bf2c3` changed `apps/admin-vue/src/api/admin-api.js` and deployed a corrected admin bundle, but it lived only on `origin/codex/hotfix-admin-groups-list`; `origin/release/transport-storage-preflight` still had `fetchTransportGroups()` requesting `/api/transport-groups?...`. Any later production deployment from the release branch would rebuild the old source and reintroduce the broken list request. The true Vue admin source is `apps/admin-vue/src/api/admin-api.js`; `admin/assets/index-*.js` is only build output. The Vue admin list must use `/api/admin/transport-groups`; detail/update/delete/member-save stay on `/api/transport-groups/:id` and `/api/transport-groups/:id/members`.
- Verification: `git show HEAD:apps/admin-vue/src/api/admin-api.js` on the release branch confirmed the old direct list route, while the hotfix branch source contains `/api/admin/transport-groups`. `git branch -r --contains b2bf2c3` showed only `origin/codex/hotfix-admin-groups-list`, proving the prior fix was not in the release branch. `scripts/regression-check.js` now fails if Vue `fetchTransportGroups()` uses the broken direct list route again.
- Open risks / follow-up: Keep this fix merged or fast-forwarded into the actual release/deployment branch before future Vercel production deployments. Legacy `transport-api.js` and one QA runner check still reference `/api/transport-groups?...` for old non-Vue admin/test flows; they were classified as dangerous/legacy but intentionally left untouched for this narrow P0 fix.

## Previous Task Update

- Date: 2026-05-30
- Scope: Released postage request submission and postage admin workbench V1 to production. GitHub was updated before Vercel deployment. No test order was submitted and no production business order data was created during verification.
- GitHub commits: `eeb56d4` (`Add postage request workflow`) and `091b200` (`Update postage release handoff`) on `release/transport-storage-preflight`, pushed to `origin`.
- Supabase migration: Applied `supabase/20260530_postage_orders.sql` to project `brmsymzkmdnxzhrcaghw` via `supabase db query --linked --file`. Verification confirmed `postage_orders`, `postage_order_logs`, and `allocate_postage_order_no` exist; `postage_order_counters`, `postage_orders`, and `postage_order_logs` have RLS enabled and forced.
- Vercel production deployment: `dpl_o26ASWKmCwjkgpxYvympVCkTDjrg`, production URL `https://webside-gm0dxyz0k-wwkevin8s-projects.vercel.app`, aliases `https://ngn.best` and `https://www.ngn.best`, status `READY`.
- Summary: Added logged-in postage request submission at `/postage/submit`, public `/postage` CTAs, server-side postage order creation with `POST-YYYYMMDD-###` order numbers, independent order status and box-delivery status fields, 2号箱子 frontend/server blocking, student-only Resend confirmation email with客服微信 `NOTTINGHAMNGN`, phone `07941 008555`, and `/img/storage-service-qr.jpg` QR image. Added admin-only `/admin/postage/orders` Vue workbench with list filters, quick filters, search, pagination, copy summary, and right-side drawer editing. No customer-service reminder email logic or customer-service notification recipient env var was added.
- Database/docs: Added `supabase/20260530_postage_orders.sql` for `postage_orders`, `postage_order_logs`, and postage order-number allocation with RLS enabled/forced and anon/authenticated direct access revoked. Updated `docs/PROJECT_MAP.md` for the new page, APIs, tables, admin route, statuses, email helper, and QR/contact fallback notes.
- Verification: `node --check postage-submit.js`, `node --check postage.js`, `node --check api/_lib/postage-orders.js`, `node --check api/_lib/postage-order-notifier.js`, `node --check public-api-handlers/postage-order-submit.js`, `node --check api/_lib/postage-admin.js`, and `node --check api/admin/[...action].js` passed. `vercel.json` parsed successfully. `npm --prefix apps/admin-vue run build`, `npm run build:preview`, and `node scripts/regression-check.js` passed. Browser checks against the local service confirmed `/postage` has three login-protected “提交邮寄需求” CTAs, the unauthenticated click redirects to `login.html?return_to=%2Fpostage%2Fsubmit`, desktop/mobile public postage pages have no forbidden commitment wording, and mobile width has no page-level horizontal overflow. Vercel env listing confirmed `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, session secrets, Turnstile, and cron secret exist for target environments. Supabase CLI migration execution is currently blocked because no local Supabase access token is configured. The local helper server does not apply the `/postage/submit` rewrite directly, but `vercel.json` and the preview build include it.

- Production release verification: `npm run build:prod` passed. Production smoke checks confirmed `/`, `/postage`, `/postage/submit`, `/img/storage-service-qr.jpg`, and `/admin/postage/orders` return 200; unauthenticated `/api/admin/postage-orders` returns 401; GET `/api/public/postage-order-submit` returns 405; unauthenticated POST `/api/public/postage-order-submit` returns 401; `/postage/submit` contains the unavailable 2号箱子 text, support WeChat/phone fallback, and no forbidden commitment wording.

## Previous Task Update

- Date: 2026-05-30
- Scope: Reworked the public postage page art direction locally after the user rejected the pale-green visual direction. No commit, no deployment, no database schema change, no API change, no payment/email integration, no admin/backend logic, and no production data write were performed.
- Summary: Updated the postage CSS in `styles.css` from the previous pale-green service aesthetic to a stronger airmail/editorial direction using deep navy, paper white, cobalt blue, and amber. The hero now uses a full-width dark airmail plane with a paper-label service panel, the resource dock and estimator/result panels use the new palette, and mobile hero layout was fixed so the title and actions appear immediately instead of being pushed off-screen.
- Verification: `node --check postage.js` and `node --check postage-data.js` passed. Local Playwright verification against `http://127.0.0.1:3000/postage.html` confirmed the rendered hero colors are navy/white/amber/cobalt rather than pale green, the prohibited modal still opens with 17 items, desktop width 1440px and mobile width 390px have no page-level horizontal overflow, and the mobile hero title is visible in the first viewport.

## Previous Task Update

- Date: 2026-05-30
- Scope: Simplified and re-layered the public postage page UI locally after follow-up design feedback. No commit, no deployment, no database schema change, no API change, no payment/email integration, no admin/backend logic, and no production data write were performed.
- Summary: Reworked `postage.html`, `postage.js`, and the postage CSS in `styles.css` so the page reads as a simpler service console: the hero remains visually strong, a new resource dock opens price/packing/prohibited/FAQ/tracking information in modal windows, detailed lower-page sections are collapsed by default, and route cards now show compact summaries with full route detail available in a modal. This preserves the full reference data while reducing visible page clutter and making the information hierarchy clearer.
- Verification: `node --check postage.js` and `node --check postage-data.js` passed. Local Playwright verification against `http://127.0.0.1:3000/postage.html` confirmed five resource-dock buttons, five collapsed detail panels, route detail modal behavior, prohibited modal with 17 items, price modal and expanded price detail with 30 rows, FAQ modal with 15 items, and no page-level horizontal overflow at 1440px or 390px widths.

## Previous Task Update

- Date: 2026-05-30
- Scope: Improved the public postage service page UI and interactions locally. No commit, no deployment, no database schema change, no API change, no payment/email integration, no admin/backend logic, and no production data write were performed.
- Summary: Enhanced `postage.html`, `postage.js`, and the postage styles in `styles.css` with a richer first viewport, service metric chips, a parcel/status visual, route-category filter controls, estimator quick presets, fee-composition bars, and a copyable estimate summary. The estimator now also correctly hides route-specific fields through a scoped `[hidden]` style so ordinary routes do not show the special quantity input.
- Verification: `node --check postage.js` and `node --check postage-data.js` passed. Local Playwright verification against `http://127.0.0.1:3000/postage.html` confirmed the route filters show the expected special routes, the document preset switches to `certificateUps` and shows `£35`, the result renders three fee bars and a copy-estimate button, and desktop/mobile widths had no page-level horizontal overflow (`scrollWidth` matched `clientWidth` at 1440px and 390px). Mobile verification confirmed ordinary routes hide the special quantity field and certificate UPS hides the weight field while showing the quantity field.

## Previous Task Update

- Date: 2026-05-29
- Scope: Added the public V1 postage service page locally. No commit, no deployment, no database schema change, no API change, no payment/email integration, no admin/backend logic, and no production data write were performed.
- Summary: Added `/postage` / `postage.html` as a static NGN/GBCN postage information page with service-route cards, cautious quick-route guidance, a front-end estimator, full 1-30kg postage reference data from `img/post/微信图片_20260529214726.jpg`, box/material information, prohibited-item warnings, FAQ accordions, tracking links, and contact CTA. The estimator calculates ordinary international routes as single-box route price times box count, then adds box and upstairs pickup fees; UK domestic, certificate UPS, and milk powder routes use their separate rules instead of the ordinary kg table. Public service navigation now links to the postage page from homepage, pickup, storage, and moving pages.
- Verification: `node --check postage-data.js` and `node --check postage.js` passed. `vercel.json` parsed successfully. Local `http://127.0.0.1:3000/postage` and `/postage.html` returned 200. Playwright screenshots were saved under `output/playwright/` for desktop, mobile, estimator, price-table horizontal scroll, FAQ, and prohibited-item sections. Mobile overflow check returned `clientWidth=390` and `scrollWidth=390`, so the page itself does not horizontally overflow. Estimator verification confirmed Hong Kong Post air `20kg × 3 boxes` shows `£87 × 3 = £261` postage, UK domestic uses its own 10kg rule, certificate UPS uses document-count pricing, and milk powder uses can-count pricing. `npm run build:preview` passed and produced preview build output under `.vercel/output`.

## Previous Task Update

- Date: 2026-05-29
- Scope: Production release for pre-freeze transport/storage safety fixes and the admin recent-operation cleanup display fix. GitHub was updated before Vercel production deployment. No database schema change, no production data cleanup, and no test-data upload were performed.
- GitHub commit: `d08bc2f` (`chore: hide system cleanup from recent operations`) on `release/transport-storage-preflight`.
- Vercel preview deployment: `dpl_Bc6LFNH79abwUVRATJmbRAw7XguE`, preview URL `https://webside-4tcs0dvrb-wwkevin8s-projects.vercel.app`, status `READY`.
- Vercel production deployment: `dpl_BfcgVkpGi3ZUZPBejUwYxRFyb6gT`, production URL `https://webside-fs3ibssfo-wwkevin8s-projects.vercel.app`, aliases `https://ngn.best` and `https://www.ngn.best`, status `READY`.
- Summary: Public carpool APIs expose only public-safe fields, the membership storage 5-box display / 6-box billing-free threshold remains documented, batch transport import templates remain header-only, root test CSV/XLSX files are excluded from Vercel uploads, the QA daily-flow cron is no longer scheduled, and empty carpool auto-cleanup no longer appears in admin recent-operation logs as an unknown administrator action.
- Verification: `node --check api/_lib/transport-group-lifecycle.js`, `node --check api/admin/[...action].js`, and `node scripts/regression-check.js` passed before deployment. Production Vercel inspect confirmed `target production` and `READY`. `https://ngn.best/`, `/admin/`, `/api/public/transport-groups`, and `/api/public/transport-board` returned 200. Public transport group and board API key checks found no `location_from`, `location_to`, `address`, `order_no`, `source_order_no`, `source_order_nos`, or `source_order_no_preview` fields.

## Previous Task Update

- Date: 2026-05-29
- Scope: Pre-freeze minimal fixes for the accepted pickup/carpool and storage membership flows. GitHub was updated before Vercel preview deployment. No production deployment, no database schema change, no production data write, no production data cleanup, and no test-data upload were performed.
- GitHub commit: `f91e6ed` (`chore: pre-release fixes for transport and storage modules`) on `release/transport-storage-preflight`.
- Vercel preview deployment: `dpl_DdWMoAer3MGNFQS61mMGpfxBo3GJ`, preview URL `https://webside-f5g1jk590-wwkevin8s-projects.vercel.app`, status `READY`.
- Summary: Public carpool list APIs now stop exposing detailed route addresses, source order numbers, and order numbers beyond the fields needed by the current public carpool display. Storage membership now records the intended split rule: public/display copy remains 5 standard boxes and 5 free paper boxes, while billing uses a 6-box free threshold and starts charging from the 7th box. The Vue admin batch manual transport import template now generates header-only copy/CSV/XLSX templates and the helper panel says `请按字段格式填写后导入` instead of presenting directly importable test rows.
- Verification: `node --check public-api-handlers/transport-groups.js`, `node --check public-api-handlers/transport-board.js`, and `node --check api/_lib/membership.js` passed. A local calculation check with test price `£10` per standard box returned final price `£0` for 5 boxes, `£0` for 6 boxes, and `£10` for 7 boxes. `npm --prefix apps/admin-vue run build` passed and refreshed the local admin static output to `admin/assets/index-ZJr_YCzC.js`. `node scripts/regression-check.js` passed. Static scans confirmed no direct test sample names/phone rows in the import template source, no `可直接测试` / `填写示例` template wording, and no public board response mapping for `location_from`, `location_to`, or `order_no`.

## Previous Task Update

- Date: 2026-05-29
- Scope: Production release for admin storage all-orders table/export column cleanup. GitHub was updated before Vercel deployment. No database schema change, no test-data upload, and no production order data was modified; production verification performed only admin login/session, read-only list/detail/API/export checks, and pagination/filter navigation.
- GitHub commit: `407d4e8` (`Adjust storage order list columns`) on `codex/membership-v1`.
- Vercel deployment: `dpl_57zKVHJNivBBw9HLKccqrTg2Tuop`, production URL `https://webside-qc95l7byz-wwkevin8s-projects.vercel.app`, alias `https://ngn.best`, status `READY`.
- Summary: `/admin/storage/orders` no longer displays the pinyin column. The visible execution-table order is now selection/sequence, service date, name, service content, apartment/detail address, time slot, charge status, phone, price, payment status, offline record, internal remark, and actions. The storage order execution export also keeps the time-slot column after the address column and continues to omit pinyin.
- Verification: `node --check api/admin/[...action].js`, `node scripts/regression-check.js`, and `npm run build:prod` passed before deployment. Production `/admin/storage/orders` rendered headers as `序号 / 服务日期 / 姓名 / 服务内容 / 公寓 / 详细地址 / 时间段 / 是否收费 / 电话 / 价格 / 收款状态 / 线下记录 / 内部备注 / 操作`, showed no `拼音`, and kept time slot after address. Production filter/query reloaded the list, switching to all orders showed `第 1 / 2 页，共 17 条` and next page loaded `第 2 / 2 页`. `查看详情` opened the storage detail route successfully. `标记已记录`/`删除` buttons were visible and enabled but were not clicked to avoid modifying live orders. Exported current filtered results to `storage-orders-all-202605291348.xls`; export headers were `序号 / 服务日期 / 名字 / 服务内容 / 公寓（详细地址） / 时间段 / 电话 / 价格 / 费用/支付备注 / 客服备注`, with no `拼音` and time slot after address.

## Previous Task Update

- Date: 2026-05-28
- Scope: P0 transport group service-time sort label/value fix. GitHub was updated before Vercel deployment. No test data was uploaded and no production business data was deleted, cleared, or modified; admin verification wrote only normal admin login/session metadata.
- GitHub commits: `af6878e` (`Fix transport group service time sort labels`) and `a29cab1` (`Sort public transport board by service time`) on `codex/membership-v1`.
- Vercel deployment: `dpl_BgmJ9KeH89ohYEzueC5dCzrCZ1VK`, production URL `https://webside-nbtz3su6k-wwkevin8s-projects.vercel.app`, alias `https://ngn.best`, status `READY`.
- Summary: Admin carpool group filters now explicitly map `service_time_asc` to `服务时间：最近到最远` and `service_time_desc` to `服务时间：最远到最近`. Admin and public sort normalization accept service-time aliases consistently, with ascending as nearest-to-farthest and descending/farthest as farthest-to-nearest. Public transport board now sorts and filters its final rendered rows by the displayed service time after group enrichment, preventing request-time ordering from overriding the board order.
- Verification: `node --check` for changed API handlers passed, `node scripts/regression-check.js` passed, and `npm run build:prod` passed. Production admin API returned ASC times `2026-05-28 -> 2026-05-29 -> 2026-05-30 -> 2026-06-02` and DESC/farthest times `2026-09-20 -> 2026-09-19 -> 2026-09-18 -> 2026-08-12` with `zero_count=0`. Logged-in browser verification showed default dropdown `service_time_asc / 服务时间：最近到最远`, and selecting `service_time_desc / 服务时间：最远到最近` loaded farthest-first rows. Public `/api/public/transport-groups` and `/api/public/transport-board` both returned correct upcoming/farthest service-time order.

## Previous Task Update

- Date: 2026-05-28
- Scope: P0 production cleanup for empty/effectively-empty carpool groups. GitHub was updated before Vercel deployment. A one-time protected production cleanup deleted only `transport_groups` with zero effective active members older than 10 minutes plus their `transport_group_members` links; no `transport_requests` original orders were deleted. Admin login verification wrote only normal admin-session/login metadata.
- GitHub commit: `b34c581` (`Restore empty carpool group cleanup`) on `codex/membership-v1`.
- Vercel deployment: `dpl_DxaJtZ3btLutYucBexQnyWfonc7E`, production URL `https://webside-iue46oymp-wwkevin8s-projects.vercel.app`, alias `https://ngn.best`, status `READY`.
- Summary: Server cleanup now runs before public carpool lists, public board data, admin transport group lists, and admin transport-dispatch aggregate routes. It uses a 10-minute grace window and deletes groups only when effective active member count is zero, so stale closed-order member links no longer keep 0/5 groups visible. One-time cleanup removed 13 historical groups including `GRP-260526-7L55`; follow-up dry-run found zero remaining candidates and direct DB checks found no remaining rows or member links for the removed group IDs while the original screenshot order `PU260526-0071` remained in `transport_requests`.
- Verification: syntax checks passed for changed API/script files; `node scripts/regression-check.js` passed; `npm run build:prod` passed. Production warm API checks returned `zero_count=0` for `/api/public/transport-groups`, `/api/public/transport-board`, `/api/transport-groups`, `/api/admin/transport-groups`, and `/api/admin/transport-dispatch`. Playwright production checks opened `transport-board.html` and logged-in `admin/transport/groups`; neither showed `GRP-260526-7L55` or `0 / 5`, detail opened without failure, and the join button remained visible.

## Previous Task Update

- Date: 2026-05-28
- Scope: P0 carpool page performance optimization production release. GitHub was updated before each Vercel deployment. No test data was uploaded; no production business data was deleted, cleared, overwritten, or modified by the release scripts. Admin login verification wrote only normal admin-session/login metadata.
- GitHub commits: `2e91e75` (`Speed up public carpool group pagination`), `8f22504` (`Avoid cleanup during public carpool listing`), `da92fe0` (`Avoid cleanup during admin carpool group listing`), `7c28f69` (`Fix carpool board upcoming sort`), and `aefd7c4` (`Use upcoming sort for carpool detail requests`) on `codex/membership-v1`.
- Vercel deployment: `dpl_6NPXyMgxu7xmBPSiDL82xxsjFhtZ`, production URL `https://webside-o56cau5o6-wwkevin8s-projects.vercel.app`, alias `https://ngn.best`, status `READY`.
- Summary: Production Supabase index migration `transport_carpool_perf_indexes` was applied and `ANALYZE` was run for `transport_groups`, `transport_requests`, and `transport_group_members`. Public carpool preview and full board now use effective/current-future paginated public-safe group data (`limit=9` preview, `limit=20` board), nearest upcoming service time first, omit heavy member detail payloads on list responses, and load details only after the detail button is clicked. Public and admin list GET endpoints no longer run empty-group cleanup during page open, so these read paths stay fast and do not perform maintenance writes. Admin carpool group management defaults to active/effective groups, nearest upcoming service time first, and 20 rows per page.

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

- `node --check api/admin/[...action].js` passed after the storage export column-order change.
- `npm --prefix apps/admin-vue run build` passed and refreshed the local admin static output to `admin/assets/index-Ql51SaM9.js` plus the existing `admin/assets/index-DVcvb6_8.css`.
- Mocked authenticated Playwright verification of `/admin/storage/orders` confirmed the table no longer shows `拼音`, the time-slot column appears after the address column, row action buttons render, the filter form can trigger a new list request, and pagination renders.
- Direct local browser login to `/admin/storage/orders` was blocked by local `/api/admin/login` returning `500`, so the real authenticated local-data table could not be checked in the current environment.
- `node scripts/regression-check.js` passed.
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

- Production release `dpl_o26ASWKmCwjkgpxYvympVCkTDjrg` is live on `https://ngn.best`.
- Postage submission/admin V1 is deployed, and `supabase/20260530_postage_orders.sql` has been applied to Supabase project `brmsymzkmdnxzhrcaghw`.
- Public carpool student-priority display and join-button changes are deployed.
- Admin transport group defaults, service-time sort label/value fix, P0 carpool pagination/read-path performance changes, 10-minute empty/effectively-empty carpool group cleanup, transport request recorded-toggle UI, and P7 storage/buy-box admin changes are deployed.
- Current local admin build output points to `admin/assets/index-CzlmK430.js` and `admin/assets/index-DhGdrE2_.css`.
- Local-only storage seed/clear helpers remain ignored and must not be run against Preview or Production.

## Open Risks / Follow-Up

- Perform one controlled authenticated postage submission test and verify the student confirmation email, created `POST-YYYYMMDD-###` order, and `/admin/postage/orders` drawer editing with a safe test account.
- Production postage confirmation email needs `RESEND_API_KEY` and a confirmed sender (`POSTAGE_EMAIL_FROM` optional; otherwise auth/SMTP fallback sender is used). There is intentionally no customer-service notification recipient.
- Before the next commit/release, include the latest `node scripts/regression-check.js`, admin build, and preview build results in the note.
- The regression check is intentionally static/minimal; it does not replace focused browser/API verification before future releases.
- Full logged-in `/postage/submit` form submission and admin drawer editing were not executed in production during release verification because that would create a real postage order; use a safe test account/order for the next verification pass.
- Admin recorded-toggle click testing was not performed on production because it would modify live order data. If the operator wants a live click test, choose a safe real order and explicitly authorize the temporary toggle and revert.
- Investigate the Vercel/Node `[DEP0169] url.parse()` deprecation warning separately; it appeared as error-level logs on successful requests and was not a release blocker.
