# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-20
- Scope: Storage sync audit cron frequency alignment

## Latest Completed Work

- Prepared the isolated storage sync audit cron release on branch `codex/storage-sync-audit-cron`:
  - added admin-only storage sync audit log reading and manual run endpoints;
  - added cron-only `GET /api/cron/run-storage-sync-audit`, protected only by `Authorization: Bearer <CRON_SECRET>`;
  - added `storage_sync_audit_logs` SQL plus additive `cutover_at` and `notification` metadata columns;
  - added `STORAGE_SYNC_AUDIT_SITE_USER_CUTOVER_AT` support, defaulting to `2026-05-07T00:00:00Z`;
  - legacy missing `site_user_id` before the cutover is skipped as `legacy_no_site_user_id`;
  - missing `site_user_id` on or after the cutover is a mismatch as `no_site_user_id_after_cutover`;
  - sensitive mismatch fields such as phone, WeChat/WhatsApp, email, and address are logged as presence-only values;
  - added daily summary email support through `STORAGE_SYNC_AUDIT_NOTIFY_EMAIL`, `STORAGE_SYNC_AUDIT_EMAIL_FROM`, existing `RESEND_API_KEY`, and SMTP fallback;
  - added `vercel.json` cron schedule `15 */3 * * *` for `/api/cron/run-storage-sync-audit`, matching the transport active audit cadence;
  - added the Vue admin read-only log page `/admin-vue/storage/sync-logs`;
  - this release intentionally excludes QA order creation, test users, test orders, automatic deletion, automatic repair, instant anomaly notification, all-orders migration, buy-box detail migration, and storage detail migration.
- Deployed and verified the storage sync audit cron release:
  - Git commit deployed: `6a1772f` (`add storage sync audit cron and daily summary`);
  - Vercel deployment: `dpl_3MJZtkxwhpn5mfQCxsXsnCLh7BmL`;
  - Production URL: `https://ngn.best`;
  - direct unauthenticated `GET /api/cron/run-storage-sync-audit` returned 403;
  - authenticated `GET /api/cron/run-storage-sync-audit` with `Authorization: Bearer <CRON_SECRET>` returned 200;
  - the latest audit log row from the deployment had sampled order count 1, order-center count 1, personal-center count 1, mismatch count 0, skipped count 0, and cutover `2026-05-07T00:00:00+00:00`;
  - latest log notification metadata showed Resend accepted the daily summary for `STORAGE_SYNC_AUDIT_NOTIFY_EMAIL`;
  - `/admin-vue/storage/sync-logs` returned 200 from production;
  - unauthenticated `GET /api/storage-sync-audit-logs` returned 401, confirming the log API remains admin-only;
  - Vercel production environment variables exist for `CRON_SECRET`, `STORAGE_SYNC_AUDIT_NOTIFY_EMAIL`, `STORAGE_SYNC_AUDIT_EMAIL_FROM`, and `RESEND_API_KEY`;
  - next time-based check is to confirm the scheduled Vercel cron adds a new audit log on the next 3-hour cadence and sends at most one successful daily summary per London date.
- Aligned storage audit cron frequency with the transport audit cadence:
  - `/api/cron/run-storage-sync-audit` now runs every 3 hours through `15 */3 * * *`;
  - the cron endpoint still requires `Authorization: Bearer <CRON_SECRET>`;
  - the endpoint still performs passive audit only and writes only `storage_sync_audit_logs`;
  - daily digest email now checks recent `storage_sync_audit_logs.notification` metadata and skips sending if a successful storage digest has already been sent for the current London date;
  - this prevents the higher audit frequency from becoming a 3-hourly email blast.
- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before the checkpoint.
- Completed full acceptance of the Vue admin read-only list version.
- Migrated Vue admin pages now covered by the checkpoint:
  - dashboard: `/admin-vue/`;
  - users: `/admin-vue/users`;
  - orders: `/admin-vue/orders`;
  - managers: `/admin-vue/managers`;
  - transport requests: `/admin-vue/transport/requests`;
  - transport groups: `/admin-vue/transport/groups`;
  - transport sync audit logs: `/admin-vue/transport/sync-logs`;
  - storage box orders: `/admin-vue/storage/box-orders`;
  - storage collections: `/admin-vue/storage/collections`;
  - storage returns: `/admin-vue/storage/returns`;
  - memberships readonly: `/admin-vue/memberships`;
  - community readonly: `/admin-vue/community`.
- All old admin pages remain available as rollback entries, including:
  - `admin-dashboard.html`;
  - `admin-orders.html`;
  - `admin-users.html`;
  - `admin-managers.html`;
  - `transport-admin-requests.html`;
  - `transport-admin-groups.html`;
  - `transport-admin-sync-logs.html`;
  - `admin-storage.html`;
  - `admin-memberships.html`;
  - `admin-community.html`.
- No real `DELETE`, `POST`, `PATCH`, export, moderation, payment confirmation, deletion, membership mutation, or other dangerous requests were found in the Vue read-only acceptance pass.
- Checkpoint pre-commit checks completed:
  - `git status` reviewed;
  - `npm run build:admin-vue` passed;
  - `npm run build:prod` passed;
  - intended Vue/admin build files were scanned for secret, token, and cookie patterns with no matches;
  - Vue source scan confirmed no `innerHTML`, `document.querySelector`, or `addEventListener`;
  - Vue source scan confirmed no references to old `admin-pages.js`, `transport-admin.js`, `admin-users.js`, or `admin-orders.js`.
- This checkpoint does not deploy, push, merge, create a PR, add new pages, change APIs, change database schema, change public frontend pages, or implement dangerous operations.
- Hardened the pending admin-manager root permission fix:
  - `isRootManagerAccount()` no longer uses mutable display `name` or editable `username` as root authority;
  - Wkevin/root is now identified by the fixed configured email only, pending a future fixed admin id migration;
  - the old admin page's UI-only root helper was aligned to the same fixed-email rule so fake `name=Wkevin` does not expose root controls;
  - local branch tests confirmed fake `name=Wkevin`, fake `username=superadmin`, normal `super_admin`, and `operations_admin` are not treated as root;
  - local branch tests confirmed Wkevin/root can manage another `super_admin`, cannot delete/disable self, and nobody can delete/disable/downgrade the last active `super_admin`.
- This root-permission hardening is still uncommitted and has not been pushed or deployed.
- Repaired Vue admin list "view detail" behavior without migrating new pages or implementing dangerous operations:
  - `/admin-vue/orders` now routes storage orders to `admin-storage-detail.html?id=...` and transport orders to `transport-admin-request-edit.html?id=...` when a stable id is available;
  - `/admin-vue/transport/requests` now opens `transport-admin-request-edit.html?id=...` for view actions, while Group ID links continue to open `transport-admin-group-edit.html?id=...`;
  - `/admin-vue/transport/groups` now uses the shared legacy group link helper for `transport-admin-group-edit.html?id=...`;
  - `/admin-vue/storage/box-orders`, `/admin-vue/storage/collections`, and `/admin-vue/storage/returns` now use the shared storage detail helper with id fallbacks;
  - `/admin-vue/memberships` sends readonly benefit-detail and operation-record actions to `admin-memberships.html`, while mutation actions remain placeholders;
  - `/admin-vue/community` remains readonly-detail only and still performs no moderation mutations.
- `npm run build:admin-vue` passed after the detail-link repair.
- Migrated the first readonly Vue detail page:
  - added `/admin-vue/storage/:id` for storage order readonly details;
  - the three storage Vue list pages now open the Vue detail route as the primary detail entry;
  - the Vue detail page uses the existing `GET /api/admin/storage-orders?id=...` endpoint and does not change backend API shape;
  - the detail page keeps the old storage detail structure as readonly sections: order basics, user/contact, service appointment, address, boxes/items/quantity, price/fees, notes, folded JSON previews, and a disabled/placeholder operations area;
  - `admin-storage-detail.html` remains available through an "open old detail" fallback link.
- `npm run build:admin-vue` passed after the storage detail migration.
- Migrated the second readonly Vue detail page:
  - added `/admin-vue/transport/requests/:id` for transport request readonly details;
  - the Vue transport request list now opens the Vue detail route as the primary detail entry;
  - the Vue detail page uses the existing `GET /api/transport-requests/:id` endpoint and does not change backend API shape;
  - the detail page keeps the old transport request edit structure as readonly sections: order basics, student/contact, flight and airport, trip, carpool, membership/price, notes, folded extra JSON, and a placeholder operations area;
  - `transport-admin-request-edit.html` remains available through an "open old detail" fallback link.
- `npm run build:admin-vue` passed after the transport request detail migration.
- Migrated the third readonly Vue detail page:
  - added `/admin-vue/transport/groups/:id` for transport group readonly details;
  - the Vue transport group list now opens the Vue detail route as the primary detail entry;
  - Group ID links from the Vue transport request list and transport request detail now prefer the Vue group detail route;
  - the Vue detail page uses the existing `GET /api/transport-groups/:id` endpoint and does not change backend API shape;
  - the detail page keeps the old transport group edit structure as readonly sections: group basics, trip, seats, payment, members, driver/dispatch summary, notes, folded extra JSON, and a placeholder operations area;
  - `transport-admin-group-edit.html` remains available through an "open old group detail" fallback link.
- `npm run build:admin-vue` passed after the transport group detail migration.
- Migrated the fourth readonly Vue detail page:
  - added `/admin-vue/orders/:id` for order center readonly summary details;
  - the Vue order center list now opens the Vue order detail route as the primary detail entry;
  - the Vue detail page uses the existing `GET /api/admin/orders/:id` endpoint and does not change backend API shape;
  - the detail page keeps order center detail structure as readonly sections: order basics, customer info, service summary, notes/logs, professional detail entry, folded extra fields, and a placeholder operations area;
  - professional detail entries route storage orders to `/admin-vue/storage/:id` and transport orders to `/admin-vue/transport/requests/:id` using the existing source id;
  - `admin-orders.html` remains available through an "open old order center" fallback link.
- `npm run build:admin-vue` passed after the order center detail migration.
- Vue source scan still found no `innerHTML`, `document.querySelector`, `addEventListener`, `admin-orders.js`, or `admin-pages.js` usage.
- Dangerous request scan found no new `PATCH`, `DELETE`, or export calls; only the existing shared fetch wrapper and existing logout `POST` remain.
- Migrated the fifth readonly Vue detail page:
  - added `/admin-vue/memberships/:id` for membership entitlement readonly details;
  - the Vue membership list now opens the Vue detail route for "benefit detail" and "operation record" actions;
  - the route uses `membership_entitlements.id` as the stable detail id, with the clicked row cached for precise readonly display and the existing `GET /api/admin/memberships` list endpoint as a no-API-change fallback;
  - the detail page keeps the old membership business structure as readonly sections: user basics, membership entitlement, activation-code summary, benefit/audit records, folded extra fields, and a placeholder operations area;
  - `admin-memberships.html` remains available through an "open old membership admin" fallback link.
- `npm run build:admin-vue` passed after the membership detail migration.
- Vue source scan still found no `innerHTML`, `document.querySelector`, `addEventListener`, `admin-memberships.js`, or `admin-pages.js` usage.
- Dangerous request scan found no new `PATCH`, `DELETE`, or export calls; only the existing shared fetch wrapper and existing logout `POST` remain.
- Migrated the sixth readonly Vue detail page:
  - added `/admin-vue/community/posts/:id` for community post readonly details;
  - the Vue community post list now opens the Vue detail route for post detail viewing;
  - the detail page uses the existing `GET /api/admin/community-posts?id=...` endpoint and does not change backend API shape;
  - the detail page keeps the old community management structure as readonly sections: post basics, publisher/risk info, images, reports, comments, folded extra fields, and a placeholder operations area;
  - `admin-community.html` remains available through an "open old community admin" fallback link.
- `npm run build:admin-vue` passed after the community post detail migration.
- Vue source scan still found no `innerHTML`, `document.querySelector`, `addEventListener`, `admin-community.js`, or `admin-pages.js` usage.
- Dangerous request scan found no new `PATCH`, `DELETE`, or export calls; only the existing shared fetch wrapper and existing logout `POST` remain.

## Current Project State

- New Vue admin remains parallel-only and available through `/admin-vue/` after building.
- Old admin remains the rollback and official legacy operator entry.
- Detailed edit workflows and dangerous operations remain on old admin until explicitly migrated.
- Storage order readonly details now live in Vue as the main route; old storage detail remains a fallback and rollback entry.
- Transport request readonly details now live in Vue as the main route; old transport request edit remains a fallback and rollback entry.
- Transport group readonly details now live in Vue as the main route; old transport group edit remains a fallback and rollback entry.
- Order center readonly summary details now live in Vue as the main route; old `admin-orders.html` remains a fallback and rollback entry.
- Membership entitlement readonly details now live in Vue as the main route for benefit detail and operation record viewing; old `admin-memberships.html` remains a fallback and rollback entry.
- Community post readonly details now live in Vue as the main route for post detail viewing; old `admin-community.html` remains a fallback and rollback entry.
- No old admin HTML/JS files were removed or replaced.
- No public frontend pages were intentionally modified.
- No API response structures, database schema, email behavior, or secrets/env files were modified.
- Frontend session state in Vue remains UI-only; backend APIs still enforce authorization server-side.
- The root `admin-vue/` folder is generated build output from `npm run build:admin-vue`.

## Open Issues And Risks

- P2 before opening the storage admin page publicly:
  - page: `admin-storage.html`;
  - issue: `storageTypeLabels is not defined`;
  - impact: storage admin page is not officially open, so this does not affect current live business;
  - requirement: fix before opening storage admin, without re-adding heavy list fields such as `customer_form_json`, `final_readable_message`, or `service_flags_json` to the list API.
- Membership Vue page and membership detail page are intentionally readonly in this phase. Real membership opening, code generation/deletion, benefit registration, operation log mutation, entitlement deletion, and benefit reset still belong to old admin until explicitly migrated.
- Community Vue page and community post detail page are intentionally readonly in this phase. Real moderation actions such as hide, restore, delete, pin, update expiry, image deletion, comment moderation, and user bans still belong to old admin until explicitly migrated.
- The Vue community post detail migration regenerated the root `admin-vue/` build output. Treat that folder as generated output and rebuild it when committing Vue source changes.
- Existing unrelated dirty changes were present before this checkpoint and were not reverted:
  - `admin-api.js`;
  - `admin-managers.html`;
  - `admin-pages.js`;
  - `api/_lib/admin-managers.js`;
  - `api/admin/[...action].js`.

## Recommended Next Steps

- Next Vue phase can refine readonly detail field presentation after operator review, or plan the server-side permission review needed before any write-operation migration.
- Do not implement real dangerous operations until the corresponding detail/read-only flow is accepted and server-side permission boundaries are reviewed.
- For deployment later, follow the fixed release order: commit and push the intended changes to GitHub first, then deploy to Vercel.
