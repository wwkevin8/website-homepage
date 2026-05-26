# Project Map

This document is the editable project inventory for `webside-transport-dispatch`. Keep it current when pages, APIs, tables, status flows, roles, services, or environment variables change.

Last structure scan: 2026-05-08. Scope: documentation-only scan of current files; unclear items are marked `需要确认`.

## System Summary

| Area | Current Shape | Notes |
| --- | --- | --- |
| Frontend | Static HTML/CSS/JS | No framework detected. Most pages use `styles.css`; service-specific pages add page scripts. |
| Backend | Vercel Serverless Functions under `api/` | Public and admin APIs use aggregate dispatch routes plus shared handlers/helpers. |
| Database/Auth | Supabase | Server-side code uses service-role client in `api/_lib/supabase.js`; user/admin sessions are custom signed cookies. |
| Email | Resend and SMTP/nodemailer | Different flows use Resend-only or Resend/SMTP fallback. Production provider settings need confirmation. |
| Deployment | Vercel | `vercel.json` defines cache headers and five cron entries. Node engine is `24.x` in `package.json`. |
| Main business areas | Storage orders, pickup/dropoff, carpool/transport requests, public board, admin operations | Public data boundaries are critical. |

## Page Inventory

| File Path | Page Purpose | Type | Associated JS/CSS | Associated API | Notes |
| --- | --- | --- | --- | --- | --- |
| `index.html` | Homepage | 前台 | `site-auth.js`, `script.js`, `styles.css` | `/api/auth/session` via site auth | Active public entry. |
| `benefits.html` | Benefits/content page | 前台 | `script.js`, `styles.css` | None detected | Content page. |
| `campus.html` | Campus/content page | 前台 | `script.js`, `styles.css` | None detected | Content page. |
| `team.html` | Team/content page | 前台 | `script.js`, `styles.css` | None detected | Content page. |
| `privacy-policy.html` | Privacy policy | 前台 | `styles.css` | None detected | Legal/static. |
| `terms-of-service.html` | Terms of service | 前台 | `styles.css` | None detected | Legal/static. |
| `service-center.html` | Service entry page | 前台/用户 | `site-auth.js`, `service-center.js`, `styles.css` | `/api/auth/session`, `/api/public/membership/me`, `/api/public/membership/benefit-selection`, `/api/public/membership/redeem-code` | Personal center homepage; primary NGN membership entry now lives below the user info card and supports activation-code redemption plus four-choice benefit selection. |
| `pickup.html` | Pickup/dropoff public service and board entry | 前台 | `site-auth.js`, `script.js`, `transport-shared.js`, `transport-api.js`, `transport-public.js`, `styles.css`, `styles-pickup-backup.css` | `/api/public/transport-board`, `/api/public/transport-groups`, join APIs through `transport-api.js` | Uses `img/pickupvideo/pickupvideo2.0.mp4`; file existence/status needs confirmation. |
| `pickup-form.html` | Pickup/dropoff or transport request form | 用户前台 | `site-auth.js`, `script.js`, `pickup-form.js`, `styles.css` | `/api/public/transport-request-submit`, `/api/public/my-transport-requests`, `/api/auth/session`, `/api/public/membership/me` | Auth-related user form; shows a read-only NGN pickup membership hint when the current live claim is pickup selected/reserved. |
| `transport-board.html` | Public transport board/carpool display | 前台 | `site-auth.js`, `transport-shared.js`, `transport-api.js`, `transport-public.js`, `styles.css` | `/api/public/transport-board`, `/api/public/transport-groups`, `/api/public/transport-join-preview`, `/api/public/transport-join-submit`, `/api/public/my-transport-requests` | Critical public privacy boundary. |
| `storage.html` | Storage service public page/calculator | 前台 | `site-auth.js`, `script.js`, `styles.css` | Uses storage booking links; reads `/api/public/membership/me` for read-only membership hint | Public service page; does not calculate membership discount on the frontend. |
| `storage-booking.html` | Storage booking form | 用户前台 | `site-auth.js`, `script.js`, `styles.css` | `/api/public/storage-order-submit`, `/api/auth/session`, `/api/public/membership/me` | User-facing storage order flow; shows a read-only NGN storage membership hint when the current live claim is storage selected/reserved. |
| `login.html` | User login | 用户前台 | Cloudflare Turnstile script, `auth-i18n.js`, `site-auth.js`, `login.js`, `styles.css` | `/api/public/auth-config`, `/api/auth/login` | Turnstile is hidden by default and shown only when `/api/auth/login` returns `needCaptcha=true`. |
| `register.html` | User registration | 用户前台 | Cloudflare Turnstile script, `auth-i18n.js`, `site-auth.js`, `register.js`, `styles.css` | `/api/public/auth-config`, `/api/auth/request-signup-code`, `/api/auth/verify-signup-code`, `/api/auth/register` | Sends auth code email; Turnstile is shown only when the signup-code API returns `needCaptcha=true`. |
| `reset-password.html` | Password reset | 用户前台 | Cloudflare Turnstile script, `auth-i18n.js`, `site-auth.js`, `reset-password.js`, `styles.css` | `/api/public/auth-config`, `/api/auth/request-password-reset`, `/api/auth/reset-password` | Sends password reset email. |
| `profile.html` | User profile and membership status | 用户前台 | `site-auth.js`, `profile.js`, `styles.css` | `/api/auth/profile`, `/api/public/membership/me`, `/api/public/membership/benefit-selection` | Requires logged-in user; membership module exposes four primary choices (`storage`, `pickup`, `moving`, `welcome_pack`), selected/reserved/used/cancelled state display, linked order/discount fields where applicable, and contact-service copy for offline benefits. |
| `community.html` | Community Noticeboard list/search/category page | 前台 | `site-auth.js`, `community.js`, `community.css` | `/api/public/community-posts` | Flarum-style discussion list without Flarum; links to formal `/community-post/{id}` detail URLs and never displays contact fields. |
| `community-submit.html` | Community Noticeboard post submission | 用户前台 | `site-auth.js`, `community-submit.js`, `community.css` | `/api/public/community-posts`, `/api/public/community-image-upload`, `/api/public/community-image-finalize` | Requires logged-in user; ordinary users can submit non-official categories only. Contact fields are collected for backend/admin use and are not displayed publicly. Image upload is shown only for `second_hand` and `sublet`. |
| `community-post.html` | Community Noticeboard JS fallback detail page | 前台/fallback | `site-auth.js`, `community.js`, `community.css` | `/api/public/community-posts`, `/api/public/community-comments`, `/api/public/community-post-reports`, `/api/public/community-comment-reports` | Noindex JS fallback for `community-post.html?id=...`; canonical SEO detail is `/community-post/{id}`. Renders public-safe post detail, images from short-lived signed URLs, published comments, comment form, post/comment report actions, disclaimer, and NGN service links. |
| `auth-callback.html` | Auth callback page | 用户前台/不确定 | inline script, `styles.css` | Supabase/provider callback behavior needs confirmation | No external JS detected in scan. |
| `admin-login.html` | Unified admin login | 后台 | `admin-api.js`, `styles.css` | `/api/admin/login`, `/api/admin/session` | Admin entry point. |
| `admin-dashboard.html` | Admin dashboard | 后台 | `admin-api.js`, `admin-shell.js`, `admin-pages.js`, `styles.css` | `/api/admin/dashboard`, `/api/admin/session` | Dashboard counts can be cached/estimated. |
| `admin-orders.html` | General order admin | 后台 | `admin-api.js`, `admin-shell.js`, `admin-orders.js`, `styles.css` | `/api/admin/orders`, `/api/admin/orders/:id`, notes/archive APIs | General order workflow. |
| `admin-storage.html` | Storage order admin list | 后台 | `admin-api.js`, `admin-shell.js`, `admin-pages.js`, `styles.css` | `/api/admin/storage-orders` | Known risk: `storageTypeLabels is not defined` before public opening. |
| `admin-storage-detail.html` | Storage order admin detail | 后台 | `admin-api.js`, `admin-shell.js`, `admin-pages.js`, `styles.css` | `/api/admin/storage-orders?id=...` | Keep storage list API lightweight. |
| `admin-users.html` | User management | 后台 | `admin-api.js`, `admin-shell.js`, `admin-pages.js`, `styles.css` | `/api/admin/users`, `/api/admin/users/:id` | Admin only. |
| `admin-memberships.html` | NGN membership entitlement admin | 后台 | `admin-api.js`, `admin-shell.js`, `admin-memberships.js`, `styles.css` | `/api/admin/memberships`, `/api/admin/memberships/users`, `/api/admin/membership-claims/*`, `/api/admin/membership-codes*` | First-stage manual grant and one-time activation-code management; user search by name/email/phone/WeChat; entitlement/claim list with linked order, advisor, and discount fields; mark-used, cancel/reset, audit log, code generation/list/delete. |
| `admin-community.html` | Community Noticeboard admin | 后台 | `admin-api.js`, `admin-shell.js`, `admin-community.js`, `styles.css` | `/api/admin/community-posts`, `/api/admin/community-comments`, `/api/admin/community-images`, `/api/admin/community-users` | Admin-only community moderation for posts, comments, reports, contact fields, images, and user posting bans. |
| `admin-managers.html` | Admin manager management | 后台 | `admin-api.js`, `admin-shell.js`, `admin-pages.js`, `styles.css` | `/api/admin/managers`, `/api/admin/managers/:id`, reset password | Super-admin-only operations. |
| `transport-admin-login.html` | Transport admin login redirect | 后台/兼容入口 | `styles.css` | redirects to `admin-login.html` | Contains meta refresh; appears to be compatibility shim. |
| `transport-admin-requests.html` | Transport request admin list/export | 后台 | `admin-api.js`, `admin-shell.js`, `transport-shared.js`, `transport-api.js`, `transport-admin.js`, `styles.css` | `/api/transport-requests`, `/api/transport-requests/export` | Critical operator workflow. |
| `transport-admin-request-new.html` | Create transport request | 后台 | same transport admin bundle | `/api/transport-requests` | Critical operator workflow. |
| `transport-admin-request-edit.html` | Edit transport request | 后台 | same transport admin bundle | `/api/transport-requests/:id`, `/api/transport-requests/:id/recreate` | Payment email risk noted below. |
| `transport-admin-groups.html` | Transport group admin list | 后台 | same transport admin bundle | `/api/transport-groups` | Critical grouping workflow. |
| `transport-admin-group-new.html` | Create transport group | 后台 | same transport admin bundle | `/api/transport-groups` | Group lifecycle-sensitive. |
| `transport-admin-group-edit.html` | Edit group and members | 后台 | same transport admin bundle | `/api/transport-groups/:id`, `/api/transport-groups/:id/members`, `/api/transport-group-members/:id` | Group/member lifecycle-sensitive. |
| `transport-admin-sync-logs.html` | Transport sync audit logs | 后台 | same transport admin bundle | `/api/transport-sync-audit-logs` | Cron/email audit support. |
| `/admin/storage/today-work-orders` | Storage daily work-order sheet | 后台 Vue | `apps/admin-vue` | `/api/admin/storage-orders` | Operator worksheet for today's UK-date storage service orders, including buy-box, storage collection, and storage return rows; table supports sortable execution columns, inline payment toggle, and customer-service remarks without adding database fields. |
| `/admin/storage/sync-logs` | Storage sync audit logs | 后台 Vue | `apps/admin-vue` | `/api/storage-sync-audit-logs`, `/api/run-storage-sync-audit` | Read-only storage sync audit logs with manual admin run; scheduled passive cron and daily summary email use the cron-only route. |
| `pickup-admin.html` | Local/browser pickup admin prototype | 不确定/可能历史 | `script.js`, `styles.css` | No server API detected; script references local pickup-admin flow | Text says local-only admin; production use needs confirmation. |
| `pickup-backup.html` | Pickup page backup variant | 备份 | `script.js`, `styles.css`, `styles-pickup-backup.css` | No active API detected in scan | Filename indicates backup; `pickup.html` reuses backup CSS/classes. |
| `pickup-original-backup.html` | Older pickup backup variant | 备份 | `script.js`, `transport-shared.js`, `transport-api.js`, `transport-public.js`, `styles.css` | Public transport APIs through transport scripts | Backup status needs confirmation. |
| `index-homepage-backup.html` | Homepage backup variant | 备份 | `site-auth.js`, `script-homepage-backup.js`, `styles-homepage-backup.css` | Storage submit endpoint exists inside associated backup script | Backup status needs confirmation. |
| `index-homepage-brand.html` | Homepage brand variant | 备份/不确定 | `site-auth.js`, `script-homepage-brand.js`, `styles-homepage-brand.css` | Storage submit endpoint exists inside associated brand script | Whether this is still in use needs confirmation. |
| `index-homepage-brand-v2.html` | Homepage brand v2 variant | 备份/不确定 | `site-auth.js`, `script-homepage-brand-v2.js`, `styles-homepage-brand-v2.css` | Storage submit endpoint exists inside associated brand script | Whether this is still in use needs confirmation. |

## Backup / Brand / Archive-Like Files

| Path | Classification | Evidence | Current Risk/Action |
| --- | --- | --- | --- |
| `_inspect_src_zip_2/` | 历史/检查目录 | Name and work-log references indicate imported/inspection content | 需要确认是否 should stay in repo/deploy output. |
| `.tmp-*` files/directories | 临时输出 | Many `.tmp-*.log` and deployment output folders present | 需要确认 cleanup policy; not touched. |
| `work-log/` | Historical artifacts | AGENTS says not canonical handoff | Keep as history unless user decides otherwise. |
| `index-homepage-backup.html`, `script-homepage-backup.js`, `styles-homepage-backup.css` | 备份 | Filename says backup | 需要确认 whether deployable/static access should remain. |
| `index-homepage-brand.html`, `index-homepage-brand-v2.html`, related scripts/styles | 备份/不确定 | Brand variants are standalone pages; not primary `index.html` | 需要确认 active vs historical. |
| `pickup-backup.html`, `pickup-original-backup.html` | 备份 | Filename says backup | `pickup.html` uses `styles-pickup-backup.css`, so CSS may still be active. |
| `transport-public.previous-good.js` | 备份/风险 | File extension `.js` but content appears to be Vercel auth HTML capture, not valid app JS | 需要确认 retention; do not load from production pages. |
| `pickup-admin.html` | 不确定 | Local-only text; `script.js` contains `pickup-admin` code | 需要确认 whether it is a supported admin page or historical prototype. |

## API Route Inventory

| Route Path | File/Handler | Methods | Purpose | Login Required | Admin Required | Related Tables |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/public/auth-config` | `api/public/[...action].js` -> `public-api-handlers/auth-config.js` | GET | Exposes safe auth config | No | No | None |
| `/community-post/:id` | `vercel.json` rewrite -> `api/community-post-page.js` | GET | SEO/server-rendered community post detail HTML with escaped public fields, canonical metadata, and no contact/user fields | No | No | `community_posts` |
| `/api/public/community-posts` | public aggregate -> `community-posts.js` | GET, POST | Community noticeboard list/detail and logged-in user post creation; public responses exclude contact fields | POST yes; GET no | No | `community_posts`, `community_post_fields`, `community_rate_limits`, `site_users` |
| `/api/public/community-comments` | public aggregate -> `community-comments.js` | GET, POST | GET returns public-safe published comments for a visible published/unexpired post; POST lets a logged-in user create one-level community comments after content checks and per-user limits | POST yes; GET no | No | `community_comments`, `community_posts`, `community_rate_limits`, `site_users` |
| `/api/public/community-image-upload` | public aggregate -> `community-image-upload.js` | POST | Logged-in owner requests a signed Supabase Storage upload URL for an eligible community post image | Yes | No | `community_posts`, `community_post_images`, Supabase Storage `community-images`, `site_users` |
| `/api/public/community-image-finalize` | public aggregate -> `community-image-finalize.js` | POST | Logged-in owner finalizes an uploaded community image after server-side object, size, MIME, extension, and file-header checks | Yes | No | `community_posts`, `community_post_images`, Supabase Storage `community-images`, `site_users` |
| `/api/public/community-post-reports` | public aggregate -> `community-post-reports.js` | POST | Logged-in user reports a visible community post; duplicate reports are blocked and 2 distinct reports auto-hide the post | Yes | No | `community_post_reports`, `community_posts`, `community_rate_limits`, `site_users` |
| `/api/public/community-comment-reports` | public aggregate -> `community-comment-reports.js` | POST | Logged-in user reports a visible community comment; duplicate reports are blocked and 2 distinct reports auto-hide the comment | Yes | No | `community_comment_reports`, `community_comments`, `community_rate_limits`, `site_users` |
| `/api/public/membership/me` | public aggregate -> `membership-me.js` | GET | Current user's membership entitlement/claim status for current cycle | Yes | No | `membership_entitlements`, `membership_benefit_claims` |
| `/api/public/membership/benefit-selection` | public aggregate -> `membership-benefit-selection.js` | POST | Select one website-supported membership benefit (`storage`, `pickup`, `moving`, or `welcome_pack`) for the current cycle | Yes | No | `membership_entitlements`, `membership_benefit_claims` |
| `/api/public/membership/redeem-code` | public aggregate -> `membership-redeem-code.js` | POST | Redeem a one-time membership activation code for the current logged-in user and save birthday month/day in fixed `MM-DD` format for later service reminders | Yes | No | `membership_activation_codes`, `membership_entitlements`, `membership_audit_logs` |
| `/api/public/storage-order-submit` | public aggregate -> `storage-order-submit.js` | POST | Submit storage order | Yes, via user session | No | `storage_orders`, `site_users`, `order_number_counters`, possibly `orders` via DB trigger |
| `/api/public/my-storage-orders` | public aggregate -> `my-storage-orders.js` | GET | Current user's storage orders | Yes | No | `storage_orders` |
| `/api/public/transport-request-submit` | public aggregate -> `transport-request-submit.js` | POST | Submit pickup/dropoff/transport request | Yes | No | `transport_requests`, `site_users`, `order_number_counters`, possibly `orders` via DB trigger |
| `/api/public/my-transport-requests` | public aggregate -> `my-transport-requests.js` | GET | Current user's transport requests | Yes | No | `transport_requests`, `transport_groups`, `transport_group_members` |
| `/api/public/transport-board` | public aggregate -> `transport-board.js` | GET | Public transport board data; full groups are filtered out of public list responses and `source = admin_manual` P4a supplement orders are excluded from the public board | No | No | `transport_requests`, `transport_groups`, `transport_group_members` |
| `/api/public/transport-groups` | public aggregate -> `transport-groups.js` | GET | Public/public-safe transport group listing; full groups are filtered out of public list responses and internal `dispatch_status` is stripped before response | No | No | `transport_groups_public_view`, `transport_group_members`, `transport_requests` |
| `/api/public/transport-join-preview` | public aggregate -> `transport-join-preview.js` | POST | Preview joining a pickup/carpool request | Yes | No | `transport_requests`, `transport_groups`, `transport_group_members` |
| `/api/public/transport-join-submit` | public aggregate -> `transport-join-submit.js` | POST | Submit join request and create/add transport request | Yes | No | `transport_requests`, `transport_groups`, `transport_group_members` |
| `/api/auth/session` | `api/auth/[action].js` | GET | User session lookup | Cookie optional | No | `site_users` |
| `/api/auth/logout` | `api/auth/[action].js` | POST | Clear user session | Cookie optional | No | None |
| `/api/auth/profile` | `api/auth/[action].js` | GET, POST | Read/update current user profile | Yes | No | `site_users` |
| `/api/auth/login` | `api/auth/[action].js` | POST | Password login with email/IP risk checks, `needCaptcha`, and `temporarilyBlocked` responses | No | No | `site_users`, `user_login_events`, `auth_risk_events` |
| `/api/auth/request-signup-code` | `api/auth/[action].js` | POST | Request signup code email with `cooldown`, `needCaptcha`, and `temporarilyBlocked` risk responses | No | No | `site_users`, `email_login_codes`, `auth_risk_events` |
| `/api/auth/verify-signup-code` | `api/auth/[action].js` | POST | Verify signup code | No | No | `site_users`, `email_login_codes` |
| `/api/auth/register` | `api/auth/[action].js` | POST | Create user account and session | No, uses signup ticket | No | `site_users`, `email_login_codes`, `user_login_events` |
| `/api/auth/request-password-reset` | `api/auth/[action].js` | POST | Request reset email | No | No | `site_users`, `password_reset_tokens` |
| `/api/auth/reset-password` | `api/auth/[action].js` | POST | Reset password and log in | No, uses reset token | No | `site_users`, `password_reset_tokens`, `user_login_events` |
| `/api/admin/login` | `api/admin/[...action].js` | POST | Admin login | No | No, but checks admin credentials | `admin_users` |
| `/api/admin/logout` | `api/admin/[...action].js` | POST | Clear admin session | Cookie optional | No | None |
| `/api/admin/session` | `api/admin/[...action].js` | GET | Admin session lookup | Cookie optional | No | `admin_users` |
| `/api/admin/me/change-password` | `api/admin/[...action].js` | POST | Current admin password change | Yes | Yes | `admin_users` |
| `/api/admin/dashboard` | `api/admin/[...action].js` | GET | Vue admin dashboard aggregate with KPI counts, unregistered order totals, today's sync-inspection run count and anomaly total, 7-day order trend, registration-state distribution, today/overdue tasks, clickable risk alerts, and recent operation logs; risk counts use the same derived source-table query as `/api/admin/orders?risk=...` | Yes | Yes | `admin_users`, `users`, `transport_requests`, `storage_orders`, `orders`, `admin_operation_logs`, `transport_sync_audit_logs`, `storage_sync_audit_logs` |
| `/api/admin/users` | `api/admin/[...action].js` | GET | Admin user/customer listing | Yes | Yes | `users` |
| `/api/admin/users/:id` | `api/admin/[...action].js` | GET | Admin user/customer detail | Yes | Yes | `users` |
| `/api/admin/memberships` | `api/admin/[...action].js` | GET, POST | List memberships with claims, audit logs, latest operation summary, activation-code source, advisor/user display fields, and manually grant membership entitlements | Yes | Yes | `membership_entitlements`, `membership_benefit_claims`, `site_users`, `admin_users`, `membership_activation_codes`, `membership_audit_logs` |
| `/api/admin/memberships/:id` | `api/admin/[...action].js` | GET, DELETE | Fetch one membership detail through the same admin aggregate or delete a membership entitlement and its linked benefit claim records for the current admin workflow | Yes | Yes | `membership_entitlements`, `membership_benefit_claims`, `site_users`, `admin_users`, `membership_activation_codes`, `membership_audit_logs` |
| `/api/admin/memberships/users` | `api/admin/[...action].js` | GET | Search `site_users` by public id, name, email, phone, or WeChat before manually granting membership | Yes | Yes | `site_users` |
| `/api/admin/membership-claims` | `api/admin/[...action].js` | POST | Manually record an offline/non-website membership benefit claim such as moving, welcome pack, or cashback | Yes | Yes | `membership_benefit_claims`, `membership_audit_logs` |
| `/api/admin/membership-claims/:id/mark-used` | `api/admin/[...action].js` | POST | Mark selected/reserved membership claim as used | Yes | Yes | `membership_benefit_claims`, `membership_audit_logs` |
| `/api/admin/membership-claims/:id/cancel` | `api/admin/[...action].js` | POST | Cancel a membership claim | Yes | Yes | `membership_benefit_claims`, `membership_audit_logs` |
| `/api/admin/membership-claims/:id/reset` | `api/admin/[...action].js` | POST | Reset a membership claim by cancelling the old claim | Yes | Yes | `membership_benefit_claims`, `membership_audit_logs` |
| `/api/admin/membership-birthdays` | `api/admin/[...action].js` | GET | List recently passed birthdays for active members in the selected cycle for customer-service follow-up | Yes | Yes | `membership_entitlements`, `membership_benefit_claims`, `membership_birthday_reminders`, `site_users`, `admin_users` |
| `/api/admin/membership-codes` | `api/admin/[...action].js` | GET, POST | List one-time membership activation codes, generate a single code, or batch-generate up to 200 codes shown once in the admin response | Yes | Yes | `membership_activation_codes`, `membership_audit_logs` |
| `/api/admin/membership-codes/:id` | `api/admin/[...action].js` | DELETE | Delete an unredeemed one-time membership activation code | Yes | Yes | `membership_activation_codes`, `membership_audit_logs` |
| `/api/admin/community-posts` | `api/admin/[...action].js` -> `admin-community.js` helper | GET, PATCH | List/detail community posts with contact fields, images, comments, reports, user risk info; hide/delete/restore/pin/unpin/update expiry | Yes | Yes | `community_posts`, `community_post_images`, `community_comments`, `community_post_reports`, `site_users` |
| `/api/admin/community-comments` | `api/admin/[...action].js` -> `admin-community.js` helper | GET, PATCH | List community comments, including reported comments; hide/delete/restore comments | Yes | Yes | `community_comments`, `community_comment_reports`, `site_users` |
| `/api/admin/community-images` | `api/admin/[...action].js` -> `admin-community.js` helper | DELETE | Delete a community image by marking metadata deleted and removing the private Storage object where possible | Yes | Yes | `community_post_images`, Supabase Storage `community-images` |
| `/api/admin/community-users` | `api/admin/[...action].js` -> `admin-community.js` helper | PATCH | Update community posting permission fields such as ban status, ban reason, and banned-until time | Yes | Yes | `site_users` |
| `/api/admin/storage-orders` | `api/admin/[...action].js` | GET, PATCH, DELETE | Storage order list/detail/update/delete via query `id`; `order_type=all` returns the Vue storage control list expanded across ST-B/ST-P/ST-S and supports offline-recorded filters; bulk PATCH only sets/cancels `offline_recorded` for selected ids | Yes | Yes | `storage_orders`, `site_users`, `admin_operation_logs` |
| `/api/admin/storage-orders-export` | `api/admin/[...action].js` | GET | Export the current storage-order filter result; `order_type=all` uses the operator execution-view columns: sequence, service date/time, name, service content, apartment/address, phone, price, payment/fee note, and customer-service remark | Yes | Yes | `storage_orders`, `site_users` |
| `/api/admin/orders` | `api/admin/[...action].js` | GET, PATCH | General order list; supports dashboard risk filters `risk=overdue_unprocessed`, `risk=no_operator`, `risk=offline_unrecorded`, and `risk=missing_fields`, registration filters `offline_recorded=true/false`, optional source narrowing such as `source_table=transport_requests` or `source_table=storage_orders`, and selected-order PATCH `action=set_offline_recorded` for one-click offline registration from the Vue order center | Yes | Yes | `orders`, `transport_requests`, `storage_orders`, `admin_operation_logs` |
| `/api/admin/orders/:id` | `api/admin/[...action].js` and `api/admin/orders/[id].js` | GET, PATCH | General order detail/update | Yes | Yes | `orders`, `order_status_logs`, `order_notes`, `order_attachments`, `admin_operation_logs`, source tables |
| `/api/admin/orders/:id/notes` | admin aggregate | POST | Add order note | Yes | Yes | `order_notes`, `admin_operation_logs` |
| `/api/admin/orders/:id/archive` | admin aggregate | POST | Archive order | Yes | Yes | `orders`, `admin_operation_logs` |
| `/api/admin/orders/:id/unarchive` | admin aggregate | POST | Unarchive order | Yes | Yes | `orders`, `admin_operation_logs` |
| `/api/admin/orders/archive/run` | admin aggregate | POST | Bulk archive old orders | Yes | Yes | `orders`, `admin_operation_logs` |
| `/api/admin/managers` | admin aggregate | GET, POST | List/create admin users | Yes | Super admin | `admin_users` |
| `/api/admin/managers?id=...` | admin aggregate | PATCH, DELETE | Update/delete admin user through one-segment production-safe route; PATCH can optionally set a new password when `password` is supplied; Wkevin root manager can update usernames and delete other super-admin accounts while self-delete/last-active-super-admin safeguards remain | Yes | Super admin; username changes and super-admin deletion limited to Wkevin root manager | `admin_users` |
| `/api/admin/managers?id=...&manager_action=reset-password` | admin aggregate | POST | Reset admin password through one-segment production-safe route | Yes | Super admin | `admin_users` |
| `/api/transport-requests` | `api/transport-requests/index.js` | GET, POST, PATCH | Admin list/create transport requests; GET supports keyword search across order number/name/phone/WeChat/flight number, service date filters using `preferred_time_start` with `flight_datetime` fallback, contact/payment/offline-recorded/import/source/dynamic last-operator filters, and Vue customer-service workbench fields; paginated GET includes last-operator filter options on page 1 and preserves the client-side options while paging; PATCH supports selected-row offline-recorded updates and writes operation logs | Yes | Yes | `transport_requests`, `site_users`, `transport_group_members`, `admin_operation_logs` |
| `/api/transport-requests/:id` | `api/transport-requests/[id].js` | GET, PATCH, DELETE | Admin read/update/delete request; GET is read-only, includes transport request operation logs, and supports `action=time_adjust_candidate_groups` as the P2a candidate lookup fallback for environments where the nested candidate route is stale; PATCH supports `action=update_safe_fields` for list workbench edits limited to student/contact/payment-note fields and records changed fields plus payment-email trigger metadata in `admin_operation_logs`; `action=adjust_flight_time` remains the guarded flight/pickup time adjustment flow; grouped time adjustments can keep the current group, remove the request from the old group and create a replacement single-member group, or transfer to an existing eligible group through `handling_method=transfer_existing_group` with server-side target validation and dual group sync; the legacy detail update path records `last_operated_by`, `last_operated_at`, changed fields, and structured manual payment fields in `admin_operation_logs`; DELETE removes the request from any transport group and syncs affected group state before deleting the request | Yes | Yes | `transport_requests`, `transport_group_members`, `site_users`, `transport_groups`, `admin_operation_logs` |
| `/api/transport-requests/:id/time-adjust-candidate-groups` | `api/transport-requests/[id]/time-adjust-candidate-groups.js` | GET | Admin-only candidate group list for P2a time adjustment transfer; filters by new time-derived service date, service type, airport, status, remaining seats, current group exclusion, non-empty groups, and 3-hour time window; cross-terminal groups are allowed as candidates with a surcharge/price-confirmation warning, and PATCH revalidates the selected target group | Yes | Yes | `transport_requests`, `transport_groups_public_view`, `transport_groups`, `transport_group_members` |
| `/api/transport-requests/:id/change-preview` | `api/transport-requests/[id]/change-preview.js` | POST | Admin-only P5A/P5B order-change preview; compares a draft change against the current request, computes field changes, repricing, paid/balance/refund impact, original-group retention, candidate groups including cross-terminal candidates with surcharge warnings, optional target-group number search with Chinese non-joinable reasons, risk codes, `source_snapshot_hash`, signed `preview_token`, and `preview_expires_at` without writing database rows | Yes | Yes | `transport_requests`, `transport_group_members`, `transport_groups_public_view`, `transport_groups` |
| `/api/transport-requests/:id/change-confirm` | `api/transport-requests/[id]/change-confirm.js` | POST | Admin-only P5B order-change confirmation; requires a non-expired signed `change-preview` token plus matching source snapshot hash, updates the original request, applies the selected group action, allows route-breaking multi-member edits to either create a replacement single-member group or transfer into a preview/searched compatible group, writes `order_change_logs` and `admin_operation_logs`, syncs affected groups, and rejects stale, duplicate, expired, or arbitrary-transfer previews | Yes | Yes | `transport_requests`, `transport_group_members`, `transport_groups`, `transport_groups_public_view`, `order_change_logs`, `admin_operation_logs` |
| `/api/transport-requests/:id/group` | `api/transport-requests/[id]/group.js` | GET, POST | Admin-only P6B-B4 request membership operations; GET lists compatible candidate groups, POST joins, changes, removes, or creates a group from the current request; writes `admin_operation_logs` and relies on lifecycle helpers for group status/count sync and immediate empty-group deletion | Yes | Yes | `transport_requests`, `transport_group_members`, `transport_groups`, `admin_operation_logs` |
| `/api/transport-manual-import/preview` | `api/transport-manual-import/preview.js` | POST | Admin-only manual/bulk import preview; maps legacy sheet fields including the current `拼车组标识（可选）` template header and related group-id aliases, normalizes airport/terminal/service/date fields including UK-style `DD/MM/YYYY`, checks duplicate transport requests, and previews required carpool handling for each row: blank group identifier creates a single-member group, existing `GRP-...` joins that group after existence validation, and repeated temporary identifiers create one shared new group; non-existent `GRP-...` values are red errors, while basic compatibility/capacity concerns are yellow warnings | Yes | Yes | `transport_requests`, `transport_groups`, `transport_group_members` |
| `/api/transport-manual-import/commit` | `api/transport-manual-import/commit.js` | POST | Admin-only P4b bulk manual supplement commit; reruns server-side mapping/cleaning/validation, creates `transport_requests` with `source = admin_manual`, `offline_recorded = true`, P3 workbench fields and `import_batch_id`, then always creates or joins a `transport_group` and writes `transport_group_members`; repeated temporary group identifiers within the same batch share one newly created group and no imported request is intentionally left without a group | Yes | Yes | `transport_requests`, `transport_groups`, `transport_group_members`, `admin_operation_logs` |
| `/api/transport-manual-import/manual` | `api/transport-manual-import/manual.js` | POST | Admin-only P4a single manual supplement; reuses server-side import normalization, writes P3 workbench fields, defaults `source = admin_manual`, `shareable = false`, and `offline_recorded = true`; default `group_action=create_single` creates a single-member `transport_group` and membership, and `group_action=join_existing` validates the supplied group code/id by service type, airport, service date, capacity, and non-closed/non-cancelled status before creating and joining the request; `group_action=none` is rejected for the manual single-order endpoint; no hidden queue/order state is created; group actions write `admin_operation_logs` | Yes | Yes | `transport_requests`, `transport_groups`, `transport_group_members`, `admin_operation_logs` |
| `/api/transport-requests/:id/recreate` | `api/transport-requests/[id]/recreate.js` | POST | Recreate/regroup transport request | Yes | Yes | `transport_requests`, `transport_groups`, `transport_group_members` |
| `/api/transport-requests/export` | `api/transport-requests/export.js` | GET | Admin request export with current workbench columns including phone, terminal, service datetime, contact status, payment collection status, deposit amount, offline-recorded state, admin note, last operation, and group id; `ids` exports selected rows without applying current filters, otherwise export reuses the current transport request filters including keyword/contact/payment/offline/service-date filters | Yes | Yes | `transport_requests`, `site_users` |
| `/api/transport-groups` | `api/transport-groups.js` -> `api/transport-groups/index.js` | GET, POST | Admin list/create groups; GET is read-only, supports `paginate`, `page`, `page_size`, `validity`, `sort`, group/date/status/visibility filters, and keyword matching across group id plus member request fields before enriching P6A dispatch workbench rows with member summaries, luggage totals, payment/offline-recorded summaries, public visibility, readonly risk flags, and internal P6B-B2 `dispatch_status` merged from the base `transport_groups` table; top-level shim keeps Vercel from serving `api/transport-groups/index.js` as static source on the extensionless route | Yes | Yes | `transport_groups`, `transport_groups_public_view`, `transport_requests`, `transport_group_members` |
| `/api/transport-groups/:id` | `api/transport-groups/[id].js` | GET, PATCH, DELETE | Admin group detail/update/delete; GET is read-only and includes P6A dispatch/member details, readonly risk flags, internal `dispatch_status`, driver name/phone/note fields where available, and existing group/member `admin_operation_logs`; PATCH can update `dispatch_status` separately from lifecycle `status` and writes `dispatch_status_update`; P6 Recovery removed the driver email notification POST action | Yes | Yes | `transport_groups`, `transport_group_members`, `transport_requests`, `admin_operation_logs` |
| `/api/transport-groups/:id/members` | `api/transport-groups/[id]/members.js` | POST | Replace/add group members; records affected transport request group changes in `admin_operation_logs` | Yes | Yes | `transport_groups`, `transport_group_members`, `transport_requests`, `admin_operation_logs` |
| `/api/transport-group-members/:id` | `api/transport-group-members/[id].js` | DELETE | Remove group member | Yes | Yes | `transport_group_members`, related lifecycle tables |
| `/api/transport-maintenance` | `api/transport-maintenance.js` | POST | Explicit admin-only maintenance entrypoint for transport lifecycle jobs: `backfill_missing_pickup_groups`, `close_expired_requests`, `cleanup_empty_groups`, or `run_all`; replaces page/list/detail GET-triggered maintenance side effects | Yes | Yes | `transport_requests`, `transport_groups`, `transport_group_members` |
| `/api/transport-sync-audit-logs` | `api/transport-sync-audit-logs.js` | GET | Admin sync audit log list | Yes | Yes | `transport_sync_audit_logs` |
| `/api/storage-sync-audit-logs` | `api/storage-sync-audit-logs.js` | GET | Admin storage sync audit log list | Yes | Yes | `storage_sync_audit_logs` |
| `/api/run-storage-sync-audit` | `api/run-storage-sync-audit.js` | POST | Manually run read-only storage sync audit and write a log row when the table exists | Yes | Yes | `storage_orders`, `orders`, `site_users`, `storage_sync_audit_logs` |
| `/api/cron/close-expired-transport-requests` | `api/cron/close-expired-transport-requests.js` | POST | Close expired transport requests | Secret | No admin session; requires `CRON_SECRET` | `transport_requests` |
| `/api/cron/send-transport-sync-digest` | `api/cron/send-transport-sync-digest.js` | GET | Send daily sync digest | Secret | No admin session; requires `CRON_SECRET` | `transport_sync_audit_logs` |
| `/api/cron/run-storage-sync-audit` | `api/cron/run-storage-sync-audit.js` | GET | Run passive storage sync audit and daily summary email | Secret | No admin session; requires `CRON_SECRET` | `storage_sync_audit_logs` |
| `/api/cron/send-membership-birthday-reminders` | `api/cron/send-membership-birthday-reminders.js` | GET | Send one grouped daily birthday reminder email per advisor for active members whose birthday matches the current UK date | Secret | No admin session; requires `CRON_SECRET` | `membership_entitlements`, `membership_birthday_reminders`, `membership_benefit_claims`, `membership_activation_codes`, `site_users`, `admin_users` |
| `/api/cron/run-transport-daily-flow-test` | `api/cron/run-transport-daily-flow-test.js` | GET | Run scheduled transport QA flow | Secret | No admin session; requires `CRON_SECRET` | `admin_users`, `site_users`, `transport_requests`, `transport_groups`, `transport_group_members`, `transport_sync_audit_logs` |

## Supabase Files

| File | Purpose | Notes |
| --- | --- | --- |
| `supabase/admin_management.sql` | Creates `admin_users` | Admin auth and roles. |
| `supabase/order_numbering.sql` | Creates counters and order numbering helpers | Touches transport/storage order numbers. |
| `supabase/order_system_optimization.sql` | Creates general order system and sync triggers/functions | Includes `users`, `orders`, logs/notes/attachments. |
| `supabase/storage_orders.sql` | Creates `storage_orders` | Storage status and notification status constraints. |
| `supabase/transport_dispatch.sql` | Creates transport request/group tables and public view | Core transport schema. |
| `supabase/transport_group_backfill.sql` | Transport group data backfill | Need confirmation before re-running. |
| `supabase/transport_request_status_unification.sql` | Transport status unification | Normalizes request statuses to `published/matched/closed`. |
| `supabase/transport_requests_email_column.sql` | Adds/adjusts transport email column | Used by request export/email flows. |
| `supabase/20260519_transport_request_offline_tracking.sql` | Adds transport request offline-recorded and last-operation tracking fields | Required before using the Vue transport list offline-recorded filters/buttons in Supabase. |
| `supabase/20260523_transport_request_workbench_fields.sql` | Adds transport request customer-service workbench fields | Adds `student_pinyin`, `contact_status`, `payment_collection_status`, and `deposit_amount_gbp` for safe inline edits on the Vue transport request list. |
| `supabase/20260519_storage_order_offline_tracking.sql` | Adds storage order offline-recorded and last-operation tracking fields | Required before using the Vue storage all-orders offline-recorded filters/buttons in Supabase; historical rows default to not recorded. |
| `supabase/20260415_public_schema_hardening.sql` | Enables/forces RLS on public tables | Security hardening. |
| `supabase/20260415_function_search_path_hardening.sql` | Function search path hardening | Security hardening. |
| `supabase/20260415_transport_group_listing_optimization.sql` | Group listing optimization | Performance/index/view related. |
| `supabase/20260416_admin_transport_requests_indexes.sql` | Admin transport request indexes | Performance. |
| `supabase/20260416_admin_transport_groups_indexes.sql` | Admin transport group indexes | Performance. |
| `supabase/20260416_public_transport_groups_indexes.sql` | Public transport group indexes | Performance. |
| `supabase/20260416_transport_sync_audit_logs.sql` | Creates transport sync audit logs | Used by cron/admin log page. |
| `supabase/20260520_storage_sync_audit_logs.sql` | Creates storage sync audit logs | Independent RLS-protected service-role table for storage sync audits. |
| `supabase/20260520_storage_sync_audit_logs_cutover_notification.sql` | Adds storage audit cutover/notification fields | Additive metadata for scheduled storage audit logs. |
| `supabase/20260513_auth_risk_events.sql` | Creates auth risk log and login failure counter table | Required for login/signup-code conditional captcha counting and audit logs. |
| `supabase/20260513_auth_risk_events_device_id.sql` | Adds `device_id` to auth risk events | Supports session/device-based signup-code risk checks. |
| `supabase/20260513_membership_entitlements.sql` | Creates NGN membership entitlement tables and order discount linkage fields | Adds membership entitlements, benefit claims, audit logs, updated_at triggers, claim identity trigger, RLS/revoke, and order price fields. |
| `supabase/20260514_membership_activation_codes.sql` | Creates one-time NGN membership activation codes | Adds hashed activation-code storage, prefix/status/binding/redemption/expiry fields, updated_at trigger, RLS/force RLS, and direct grant revokes. |
| `supabase/20260515_membership_entitlement_grant_source_activation_code.sql` | Allows activation-code membership grants | Updates the `membership_entitlements.grant_source` check constraint so public code redemption can insert `activation_code` entitlements. Run once in Supabase SQL Editor on databases that already applied the original membership migration. |
| `supabase/20260515_membership_activation_code_birthday.sql` | Adds member birthday month/day to activation-code redemption records | Stores birthday month/day entered during frontend membership-code redemption in fixed `MM-DD` format for later service reminders. |
| `supabase/20260520_membership_birthday_reminders.sql` | Adds lightweight membership birthday reminder support | Adds birthday month/day, reminder preference, advisor/creator admin references, and the service-role-only `membership_birthday_reminders` table used to prevent duplicate daily advisor emails. |
| `supabase/20260517_community_noticeboard.sql` | Creates Community Noticeboard v1 schema | Adds community posts/fields/images/comments/reports/rate-limit tables, site user posting risk fields, private `community-images` bucket, updated_at triggers, RLS/force RLS, and direct grant revokes. |
| `supabase/20260521_transport_manual_import.sql` | Adds transport manual import tracking fields | Adds admin/source/import-batch/raw-payload/manual-price/manual-payment fields to `transport_requests` plus indexes; public APIs must not expose raw/admin import fields. |
| `supabase/20260524_transport_order_change_logs.sql` | Adds transport order change log table | Creates service-role-only `order_change_logs` with RLS forced and direct public/anon/authenticated access revoked; intended for later P5 confirmation/audit records, not used by the P5A read-only preview endpoint. |
| `supabase/20260525_transport_group_dispatch_status.sql` | Adds formal transport group dispatch status | Adds `transport_groups.dispatch_status` with conservative `pending_dispatch` backfill, check constraint, index, and view support for admin APIs; public handler strips the internal field from public responses. |
| `supabase/20260525_transport_group_dispatch_status_public_view_safety.sql` | Keeps transport group public view public-safe | Rebuilds `transport_groups_public_view` without `dispatch_status`; admin APIs read the internal field from the base table instead of the shared public view. |
| `supabase/20260525_transport_group_empty_cleanup.sql` | P6 Recovery no-op note | Do not apply for the current release; empty groups are now deleted immediately by server code after a fresh zero-member check, with no `last_empty_at` schema requirement. |
| `supabase/20260525_transport_driver_notification.sql` | P6 Recovery no-op note | Do not apply for the current release; driver email notification and `transport_notification_logs` are no longer P6 requirements. |
| `supabase/20260416_transport_sync_audit_logs_perf.sql` | Audit log performance changes | Performance. |
| `supabase/20260503_storage_service_order_types.sql` | Adds/adjusts storage service order types | Storage collection/return flow. |
| `supabase/migrations/20260506140108_user_public_id_storage_link.sql` | User public ID and storage linkage | User/storage identity linkage. |
| `supabase/migrations/20260506164358_storage_order_type_constraints.sql` | Storage order type constraints | Storage validation. |
| `supabase/migrations/20260506165709_bind_legacy_storage_orders_to_site_users.sql` | Bind legacy storage orders | Migration/backfill; rerun needs caution. |
| `supabase/migrations/20260508000100_users_source_table_source_user_id_unique.sql` | Users source uniqueness | General users/order linkage. |
| `supabase/migrations/20260512120000_storage_box_delivery_suborders.sql` | Adds storage buy-box suborder/date fields | Supports `parent_order_no`, `box_order_no`, `storage_pickup_order_no`, box delivery date/method, purchased boxes, and intake/end dates. |
| `supabase/migrations/20260512180000_enable_transport_sync_audit_logs_rls.sql` | Enables RLS on transport sync audit logs | Security hardening; keeps anon/authenticated table access revoked and relies on service-role cron/admin routes. |

## Database Table Inventory

| Table/View | Purpose | APIs/Helpers Using It | User Privacy | Notes |
| --- | --- | --- | --- | --- |
| `site_users` | User auth/profile identity | `/api/auth/*`, public "my" APIs, storage/transport submit, admin storage search, community posting checks, cron QA | Yes | Public ID linkage exists; do not expose private fields. Community migration adds `posting_permission_status`, `trust_score`, `banned_until`, and `ban_reason` for posting risk controls. |
| `users` | General user/order listing table | `/api/admin/users`, dashboard, order system SQL | Yes | Relationship to `site_users` needs confirmation before changes. |
| `email_login_codes` | Signup verification codes | `/api/auth/request-signup-code`, `/api/auth/verify-signup-code`, `/api/auth/register` | Yes | Contains code hashes and IP metadata. |
| `user_login_events` | User login audit | `/api/auth/login`, registration/reset finalization, dashboard | Yes | Contains IP/user-agent. |
| `auth_risk_events` | Auth risk log and failure counter | `/api/auth/login`, `/api/auth/request-signup-code` | Yes | Additive table from `supabase/20260513_auth_risk_events.sql`; stores email, IP, user-agent, device ID, action, success, captcha state, error code, and cleared login failures. |
| `password_reset_tokens` | Password reset tokens | `/api/auth/request-password-reset`, `/api/auth/reset-password` | Yes | Contains token hashes and IP metadata. |
| `admin_users` | Admin accounts/roles/status | `/api/admin/*`, admin session helpers, cron QA | Yes | `super_admin` protections apply. |
| `admin_operation_logs` | Admin audit log | order/storage/transport admin mutation helpers | Yes/Operational | Keeps accountability logs; transport request details query by `target_type='transport_request'` and `target_id`. |
| `orders` | General unified order records | `/api/admin/orders*`, dashboard, sync SQL | Yes | Mirrors source order tables via SQL triggers/functions. |
| `order_status_logs` | General order status history | order detail helper | Yes/Operational | Populated by order sync/status changes. |
| `order_notes` | Admin notes | `/api/admin/orders/:id/notes` | Yes | Internal/admin-only. |
| `order_attachments` | Order attachments metadata | order detail helper | Yes | Storage/privacy model needs confirmation. |
| `order_number_counters` | Sequential business order number counters | storage/transport submit helpers | No/low | Avoid manual edits. |
| `membership_entitlements` | Per-user membership qualification for a membership cycle | `/api/public/membership/me`, `/api/admin/memberships`, membership helper, membership birthday reminder cron | Yes | Independent from login identity; current cycle format is `YYYY-YY`, e.g. `2026-27`; service-role API only. Birthday reminder fields store `birthday_month`, `birthday_day`, opt-out state, advisor admin, and creator admin for advisor-only reminders. |
| `membership_benefit_claims` | One selected/reserved/used/manual/cancelled benefit claim per member cycle | `/api/public/membership/benefit-selection`, storage/transport submit, `/api/admin/membership-claims*`, membership helper | Yes | Public selection supports `storage`, `pickup`, `moving`, and `welcome_pack`; moving/welcome_pack are offline customer-service benefits with no online order table. Cashback remains admin/manual only. Live unique index prevents more than one selected/reserved/used/manual claim per user/cycle; claim user/cycle are derived from entitlement trigger. |
| `membership_audit_logs` | Membership admin operation audit log | `/api/admin/memberships`, `/api/admin/membership-claims/*`, membership helper | Yes/Operational | Records grants, manual claim records, mark-used, cancel, reset, delete, activation-code redemption, and activation-code generation operations; admin membership list/detail uses these logs for the latest-operation summary. |
| `membership_activation_codes` | One-time codes that can grant a membership entitlement | `/api/public/membership/redeem-code`, `/api/admin/membership-codes*`, membership helper | Yes/Operational | Stores only `code_hash` and display prefix; generated plaintext uses grouped format like `NGN-2026-XXXX-XXXX` and is returned only once. Admin UI lists the creating admin, member birthday month/day submitted at redemption in `MM-DD` format, can delete unredeemed codes, and can batch-generate code lists; optional bound email is enforced at redemption. |
| `membership_birthday_reminders` | Daily membership birthday advisor reminder log | `/api/cron/send-membership-birthday-reminders`, membership birthday reminder helper, `/api/admin/memberships` detail aggregate | Yes/Operational | Records one reminder result per membership/date with advisor, recipient email, Resend message id, status, and error message. Unique `(membership_id, reminder_date)` prevents repeat sends for the same UK date. |
| `community_posts` | Student community noticeboard posts | `/api/public/community-posts`, `/api/public/community-post-reports`, `/api/admin/community-posts`, `/community-post/:id`, community helper | Yes | Public API and SEO HTML return only public-safe fields and never return contact fields. Admin API can view contact fields and moderate post status/pinning/expiry. Logged-in users can create non-official posts after validation and rate limits; 2 distinct reports auto-hide a post with `auto_hidden_reason='reported_threshold'`. SEO HTML is indexable only for `published` and unexpired posts; hidden/deleted/expired/missing posts return noindex 404 HTML. |
| `community_post_fields` | Optional structured fields for community posts | `/api/public/community-posts`, community helper | Some | Public-safe key/value fields only. |
| `community_post_images` | Community post image metadata | `/api/public/community-image-upload`, `/api/public/community-image-finalize`, `/api/public/community-posts`, `/api/admin/community-images`, community helper | Yes | Images are allowed only on `second_hand` and `sublet`, up to 3 active images per post. Storage bucket is private; public detail responses return short-lived signed URLs only and do not expose storage paths or original filenames. Admin can delete single images. |
| `community_comments` | Community post comments | `/api/public/community-comments`, `/api/public/community-comment-reports`, community helper | Yes | One-level comments only. Public comment lists return only `id`, `content`, `created_at`, and safe `author_label` for `published` comments under visible posts; creation blocks URLs, contacts, HTML/script/iframe, sensitive terms, and comments over 300 characters; 2 distinct reports auto-hide a comment. |
| `community_post_reports` | Community post report records | `/api/public/community-post-reports`, community helper | Yes/Operational | Unique `(post_id, reporter_user_id)` prevents duplicate reports; reporting requires login, non-banned user, account age at least 10 minutes, and IP short-window report limit. |
| `community_comment_reports` | Community comment report records | `/api/public/community-comment-reports`, community helper | Yes/Operational | Unique `(comment_id, reporter_user_id)` prevents duplicate reports; same reporting eligibility and IP limits as post reports. |
| `community_rate_limits` | Community anti-abuse action log | `/api/public/community-posts`, `/api/public/community-comments`, community report APIs | Yes/Operational | Used for user/IP posting limits, lightweight view-count throttling, comment action logs, and short-window IP report throttling. |
| `storage_orders` | Storage bookings and admin fields | public submit/my orders, admin storage APIs, dashboard, order sync SQL, membership helper | Yes | Active statuses: `pending_confirmation`, `confirmed`; terminal/cancel: `cancelled`. Buy-box collection orders can store `parent_order_no`, `box_order_no`, `storage_pickup_order_no`, `box_delivery_date`, `purchased_boxes`, `storage_intake_date`, separate storage start/end dates, and membership discount fields. Admin-only operational fields include `offline_recorded`, `last_operated_by`, and `last_operated_at`; these are separate from general order status. |
| `storage_sync_audit_logs` | Storage sync audit run summaries | `/api/storage-sync-audit-logs`, `/api/run-storage-sync-audit`, `/api/cron/run-storage-sync-audit` | Operational | Independent service-role-only log table for sampled storage/order-center/personal-center consistency checks. Cron writes only this table and does not modify storage/order/user business tables. |
| `transport_requests` | Pickup/dropoff/carpool requests | public submit/my/board/join, admin transport APIs, manual import APIs, cron, order sync SQL, membership helper | Yes | Public board and ordinary user pages must expose safe subsets only. Membership pickup benefit only applies to `service_type=pickup`, not dropoff. Admin-only operational/import fields include `offline_recorded`, `last_operated_by`, `last_operated_at`, `source`, `created_by_admin_*`, `import_batch_id`, `raw_import_payload`, `manual_price_gbp`, and `manual_payment_status`. |
| `order_change_logs` | Transport order change audit records | Planned P5 change confirmation flow; created by `supabase/20260524_transport_order_change_logs.sql` | Yes/Operational | RLS enabled and forced, direct public/anon/authenticated grants revoked. P5A `change-preview` does not write this table; P5B/P5C should use it to persist old/new values, pricing snapshots, paid/balance/refund amounts, and group actions. |
| `transport_groups` | Transport/carpool group entities | public board/groups/join, admin group APIs, lifecycle helpers, cron | Some/Operational | Lifecycle-sensitive. P6B-B2 adds internal `dispatch_status` for admin dispatch workflow only; it is separate from lifecycle/capacity `status`. P6 Recovery changed empty groups to immediate server-side deletion after a fresh zero-member check; no delayed `last_empty_at` field is required. |
| `transport_group_members` | Request-to-group membership | public board/groups/join, admin group/member APIs, lifecycle helpers, cron | Some/Operational | Lifecycle-sensitive. |
| `transport_groups_public_view` | Public/admin group listing view | public groups, admin groups, stats helpers | Public-safe intended | P6B-B2 keeps `dispatch_status` out of this shared view; admin group APIs merge the internal field from `transport_groups` directly. |
| `transport_sync_audit_logs` | Sync/daily-flow audit records | `/api/transport-sync-audit-logs`, cron digest/test | Operational | Admin-only display. |

## Order And Status Flows

### Storage Orders

| Status | Meaning | Visibility/Owner | Typical Transition | Notes |
| --- | --- | --- | --- | --- |
| `pending_confirmation` | Submitted and awaiting confirmation | User/admin | `confirmed`, `cancelled` | Default in `storage_orders.sql`; dashboard counts this as pending. |
| `confirmed` | Confirmed/active | User/admin | `cancelled` or completion via general order rules, 需要确认 | Active storage status. |
| `cancelled` | Cancelled | Admin/user display, 需要确认 | Terminal | SQL marks completed_at for sync. |

Notification sub-statuses:

| Field | Values | Notes |
| --- | --- | --- |
| `notification_status` | `pending`, `sent`, `failed` | Admin notification status. |
| `student_email_status` | `pending`, `sent`, `failed`, `skipped` | Student confirmation email status. |

### General Orders

| Source Table | Allowed Statuses In Helper | Terminal Statuses | Notes |
| --- | --- | --- | --- |
| `storage_orders` | `pending_confirmation`, `confirmed`, `cancelled` | `confirmed`, `cancelled` | `api/_lib/orders.js` maps source statuses. |
| `transport_requests` | `draft`, `open`, `closed`, `cancelled` | `closed`, `cancelled` | Potential legacy mismatch with current transport request statuses; needs confirmation. |

### Transport Requests

| Status | Meaning | Public Board | Typical Transition | Notes |
| --- | --- | --- | --- | --- |
| `published` | Active and visible/matchable | Visible | `matched`, `closed` | Default/current status. |
| `matched` | Request has matched/grouped state | Visible | `closed` | Used when multiple active members/grouped. |
| `closed` | Closed/expired/completed | Hidden from active public board | Terminal unless explicitly reopened | Cron can close expired requests. |
| `draft` / `open` | Legacy/general-order statuses | 需要确认 | Normalized or mapped in places | Dashboard/order helper references these; needs cleanup/confirmation before changing. |
| `cancelled` | General-order helper status | 需要确认 | Terminal | Not in current `REQUEST_STATUSES`; referenced in general order mapping. |

### Transport Groups

| Status | Meaning | Typical Transition | Notes |
| --- | --- | --- | --- |
| `single_member` | One active member | `active`, `full`, `closed`, `cancelled` | Current normalized status. |
| `active` | Active group | `full`, `closed`, `cancelled` | Public/admin active grouping state. |
| `full` | Capacity reached | `closed`, `cancelled` | Capacity-sensitive. |
| `closed` | Closed/completed | Terminal | Closing group may close member requests. |
| `cancelled` | Cancelled | Terminal | Cancelling group may close member requests. |
| `open` / `draft` | Legacy group statuses | Normalized to current statuses | Some lifecycle/admin code still maps to/from `open`; needs caution. |

## User Roles And Permissions

| Role/Actor | Meaning | Can Do | Must Not Do | Notes |
| --- | --- | --- | --- | --- |
| `guest` | Public visitor | View public pages, auth config, public-safe transport board/groups | See private order/user/admin data | No login. |
| `logged-in user` | Site user with signed user session | Submit storage/transport requests; view own profile/orders/requests; join/preview transport requests | Access other users' data or admin APIs | Enforced by `getAuthenticatedUser`. |
| `admin` | Generic admin actor | 需要确认; likely `super_admin` or `operations_admin` only | 需要确认 | No separate `admin` role constant found. |
| `operations_admin` | Admin role | Manage business operations | Manage admin managers | From `api/_lib/admin-auth.js`. |
| `super_admin` | Admin role | Manage business operations and admin managers | Delete/demote last active super admin; change admin usernames or delete other super admins unless the actor is Wkevin root manager | Protected by `admin-managers` helper. |
| Cron secret caller | Vercel cron or authorized caller | Run cron maintenance/digest/QA routes with `CRON_SECRET` | Access user/admin APIs without normal auth | Not an admin session. |
| Unknown/legacy roles | 需要确认 | 需要确认 | 需要确认 | No other active role constants found in scan. |

## Auth / Session Related Files

| File | Purpose | Notes |
| --- | --- | --- |
| `site-auth.js` | Frontend user session/nav/profile hydration | Uses `/api/auth/session`; caches in browser/session context. |
| `login.js`, `register.js`, `reset-password.js`, `profile.js` | User auth UI flows | Use `/api/auth/*` and `/api/public/auth-config`. |
| `auth-i18n.js` | Auth page translations | UI only. |
| `google-auth.js` | Google/auth helper | Active provider status needs confirmation. |
| `auth-callback.html` | Callback page | Provider flow needs confirmation. |
| `api/auth/[action].js` | User auth API aggregate | Custom HMAC/session cookie, Turnstile, email codes. |
| `api/_lib/user-auth.js` | User session cookie helpers | Uses `USER_SESSION_SECRET`. |
| `api/_lib/user-profile.js` | Profile completion state | Used before submit/join flows. |
| `api/_lib/auth-email.js` | Auth code/password reset email | Resend. |
| `api/_lib/membership-birthday-reminders.js` | Membership birthday reminder grouping, advisor lookup, Resend email, and duplicate-send guard. |
| `api/_lib/admin-auth.js` | Admin auth/session/permissions | Defines `super_admin`, `operations_admin`. |
| `api/_lib/admin-security.js` | Admin cookie/password hashing | Uses `ADMIN_SESSION_SECRET` or `USER_SESSION_SECRET`. |
| `api/_lib/admin-managers.js` | Admin manager validation and protections | Super admin mutation rules. |

## Business Area File Map

### Storage

| File/Area | Purpose |
| --- | --- |
| `storage.html` | Public storage service page/calculator. |
| `storage-booking.html` | User booking form. |
| `admin-storage.html`, `admin-storage-detail.html` | Admin storage order operations. |
| `script.js` | Storage calculator/booking frontend logic. |
| `admin-pages.js` | Storage admin UI logic. |
| `api/_lib/storage-orders.js` | Storage mapping/filter/status helpers. |
| `api/_lib/storage-order-notifier.js` | Storage admin/student emails via SMTP/Resend. |
| `api/_lib/storage-order-webhook.js` | Optional storage webhook. |
| `public-api-handlers/storage-order-submit.js` | Public storage submission handler. |
| `public-api-handlers/my-storage-orders.js` | User storage order lookup. |
| `supabase/storage_orders.sql`, storage migrations | Storage schema/constraints. |

### Transport / Pickup / Carpool

| File/Area | Purpose |
| --- | --- |
| `pickup.html`, `pickup-form.html`, `transport-board.html` | Public/user transport pages. |
| `transport-admin-*.html` | Admin request/group/sync-log screens. |
| `pickup-form.js`, `transport-public.js`, `transport-admin.js`, `transport-api.js`, `transport-shared.js` | Transport frontend and client API logic. |
| `api/_lib/transport.js` | Core request/group status and mapping helpers. |
| `api/_lib/transport-join.js` | Join/matching evaluation logic. |
| `api/_lib/transport-group-lifecycle.js` | Group/member lifecycle operations. |
| `api/_lib/transport-group-stats.js` | Public/admin group stats and pricing helpers. |
| `api/_lib/transport-order-submission-email.js` | Transport request/join confirmation email via Resend. |
| `api/_lib/transport-sync-audit-email.js` | Transport sync/daily-flow emails via Resend or SMTP. |
| `public-api-handlers/transport-*.js`, `api/transport-*` | Public and admin transport APIs. |
| `supabase/transport_dispatch.sql`, transport migrations/index files | Transport schema, views, indexes, status unification. |

## External Services

| Service | Purpose | Integration Points | Required/Related Env | Notes |
| --- | --- | --- | --- | --- |
| Supabase | Database and auth data | `api/_lib/supabase.js`, SQL in `supabase/` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Service role must stay server-only. |
| Vercel | Hosting, serverless APIs, cron | `vercel.json`, `api/`, deploy scripts | Vercel project env vars, `VERCEL_URL` optional in email URL building | Cron configured for transport daily flow test, transport sync digest, storage sync audit, and membership birthday advisor reminders. |
| Resend | Transactional email | `auth-email.js`, `transport-order-submission-email.js`, `storage-order-notifier.js`, `transport-sync-audit-email.js`, `storage-sync-audit-email.js`, `membership-birthday-reminders.js` | `RESEND_API_KEY`, sender env vars | Some flows require Resend; production sender needs confirmation. P6 Recovery removed driver email notification from the current release scope. |
| SMTP/nodemailer | Email fallback/admin notifications | `storage-order-notifier.js`, `transport-sync-audit-email.js`, `storage-sync-audit-email.js` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | Some email flows can fallback to SMTP. |
| Cloudflare Turnstile | Bot protection | conditional login/register challenges, reset UI, `api/_lib/turnstile.js`, `auth-config.js` | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Site key is public; secret is server-only. Login and registration code sending only require Turnstile after backend risk thresholds return `needCaptcha=true`; cooldown and temporary-block responses do not show Turnstile. |
| Google Fonts | Fonts | HTML `<link>` tags | None | External dependency; previous QA noted font request failures. |
| Google/Auth provider | Possible OAuth callback | `google-auth.js`, `auth-callback.html` | Supabase/provider config, 需要确认 | Active use needs confirmation. |
| Optional storage webhook | External webhook receiver | `api/_lib/storage-order-webhook.js` | `STORAGE_ORDER_WEBHOOK_URL`, `STORAGE_ORDER_WEBHOOK_SECRET` | Optional; production use needs confirmation. |

## Environment Variables

| Variable | Purpose | Frontend Visible? | Sensitive? | Confirm In Vercel Production? | Notes |
| --- | --- | --- | --- | --- | --- |
| `SUPABASE_URL` | Supabase project URL | Yes via auth config | No/low | Yes | Public URL, still environment-specific. |
| `SUPABASE_ANON_KEY` | Public Supabase anon key | Yes via auth config | No/medium | Yes | Must not be service role. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase admin client | No | Yes | Yes | Server-only secret. |
| `USER_SESSION_SECRET` | User session HMAC | No | Yes | Yes | Required for user session security. |
| `ADMIN_SESSION_SECRET` | Admin session HMAC | No | Yes | Yes | Falls back to user secret if absent; production should prefer distinct value. |
| `ADMIN_BOOTSTRAP_USERNAME` | Bootstrap/smoke admin username | No | Yes/operational | Yes | Used by admin bootstrap and QA scripts. |
| `ADMIN_BOOTSTRAP_PASSWORD` | Bootstrap/smoke admin password | No | Yes | Yes | Strong secret. |
| `ADMIN_BOOTSTRAP_NAME` | Bootstrap admin display name | No | No/low | Yes | Operational metadata. |
| `ADMIN_BOOTSTRAP_EMAIL` | Bootstrap admin email | No | Yes/PII | Yes | Operational metadata. |
| `APP_BASE_URL` | Email links/base URL | No | No/low | Yes | Used by reset/transport/audit emails. |
| `PUBLIC_SITE_URL` | Public site URL for storage email links/assets | May appear in emails | No/low | Yes if storage emails active | Optional. |
| `SITE_URL` | Site URL fallback for storage emails | May appear in emails | No/low | Yes if storage emails active | Optional. |
| `VERCEL_URL` | Vercel deployment URL fallback | May appear in emails | No/low | Usually automatic | Used as fallback by storage notifier. |
| `CRON_SECRET` | Cron route authorization | No | Yes | Yes | Required for cron endpoints. |
| `RESEND_API_KEY` | Resend email API key | No | Yes | Yes if Resend active | Required by auth and transport submission emails. |
| `AUTH_EMAIL_FROM` | Sender for auth and fallback emails | May appear in emails | No/medium | Yes | Used by auth, storage, transport email flows. |
| `MEMBERSHIP_BIRTHDAY_EMAIL_FROM` | Sender for membership birthday advisor reminders | May appear in emails | No/medium | Yes if birthday reminders active | Optional override; falls back to auth/SMTP sender and then a safe default. |
| `MEMBERSHIP_BIRTHDAY_REMINDER_DEFAULT_EMAIL` | Default recipient when no advisor email can be resolved | No | Yes/PII | Yes if birthday reminders active | Used by the membership birthday reminder cron as the primary operations fallback. |
| `MEMBERSHIP_BIRTHDAY_NOTIFY_EMAIL` | Alternate fallback recipient for membership birthday reminders | No | Yes/PII | Yes if birthday reminders active | Secondary fallback before the storage audit notify email. |
| `TRANSPORT_EMAIL_FROM` | Sender for transport order submission email | May appear in emails | No/medium | Yes if transport emails active | Optional override. |
| `TRANSPORT_QR_CODE_URL` | QR code image URL for transport emails | May appear in emails | No/low | Yes if used | Optional. |
| `TRANSPORT_SYNC_AUDIT_NOTIFY_EMAIL` | Audit/digest recipient | No | Yes/PII | Yes if digest active | Defaults exist in code, but production recipient should be confirmed. |
| `TRANSPORT_SYNC_AUDIT_EMAIL_FROM` | Sender for transport sync emails | May appear in emails | No/medium | Yes if digest active | Optional override. |
| `STORAGE_SYNC_AUDIT_SITE_USER_CUTOVER_AT` | Cutover timestamp for storage audit `site_user_id` checks | No | No/low | Yes if storage audit active | Defaults to `2026-05-07T00:00:00Z`; logs record the effective value. |
| `STORAGE_SYNC_AUDIT_NOTIFY_EMAIL` | Storage audit daily summary recipient | No | Yes/PII | Yes if storage audit digest active | If missing, cron records `notification.skipped=true` and audit still succeeds. |
| `STORAGE_SYNC_AUDIT_EMAIL_FROM` | Sender for storage audit summary emails | May appear in emails | No/medium | Yes if storage audit digest active | Optional override; falls back to auth/SMTP sender. |
| `TRANSPORT_FLOW_TEST_PASSWORD` | QA user password for daily flow test | No | Yes | Yes if cron QA active | Defaults in code if absent; production behavior needs confirmation. |
| `SMTP_HOST` | SMTP host | No | No/medium | Yes if SMTP active | Required for SMTP path. |
| `SMTP_PORT` | SMTP port | No | No/low | Yes if SMTP active | Commonly `587` or provider value. |
| `SMTP_SECURE` | SMTP TLS mode | No | No/low | Yes if SMTP active | Boolean-like. |
| `SMTP_USER` | SMTP username | No | Yes | Yes if SMTP active | Credential. |
| `SMTP_PASS` | SMTP password | No | Yes | Yes if SMTP active | Credential. |
| `SMTP_FROM` | SMTP sender | May appear in emails | No/medium | Yes if SMTP active | Also fallback sender for some Resend emails. |
| `STORAGE_ORDER_NOTIFY_EMAIL` | Storage admin notification recipient | No | Yes/PII | Yes if storage notifications active | SMTP admin notification. |
| `STORAGE_ORDER_ADMIN_URL` | Storage admin link in email | May appear in emails | No/low | Yes if storage notifications active | Should be production admin URL in prod. |
| `STORAGE_ORDER_WEBHOOK_URL` | Optional storage webhook URL | No | Yes/operational | Yes if webhook active | Required by webhook helper when used. |
| `STORAGE_ORDER_WEBHOOK_SECRET` | Optional webhook secret | No | Yes | Yes if webhook active | Shared secret. |
| `STORAGE_STUDENT_EMAIL_FROM` | Student storage confirmation sender | May appear in emails | No/medium | Yes if student emails active | Optional override. |
| `STORAGE_EMAIL_FROM` | Storage email sender fallback | May appear in emails | No/medium | Yes if storage emails active | Optional override. |
| `STORAGE_SERVICE_QR_URL` | Storage service QR image URL | May appear in emails | No/low | Yes if used | Defaults to `/img/storage-service-qr.jpg`. |
| `STORAGE_CUSTOMER_SERVICE_WECHAT` | Storage customer service WeChat ID | May appear in emails | No/medium | Yes if storage emails active | Defaults to `Nottsngn`. |
| `STORAGE_SERVICE_CONTACT` | Storage contact text | May appear in emails | No/low | Yes if storage emails active | Optional. |
| `TURNSTILE_SITE_KEY` | Turnstile widget site key | Yes via auth config | No/low | Yes if Turnstile active | Public key. |
| `TURNSTILE_SECRET_KEY` | Turnstile server verification secret | No | Yes | Yes if Turnstile active | Server-only secret. |
| `NODE_ENV` | Runtime mode | No | No | Yes | Controls secure cookies/perf logging. |
| `PORT` | Local dev server port | No | No | No | Local `dev-server.js`. |
| `PLAYWRIGHT_BASE_URL` | QA target URL | No | No | No/QA only | Scripts only. |
| `PLAYWRIGHT_HEADED` | QA browser mode | No | No | No/QA only | Scripts only. |
| `PLAYWRIGHT_QA_PASSWORD` | QA password | No | Yes | No/QA only | Scripts only. |
| `QA300_BASE_URL` | QA300 target URL | No | No | No/QA only | Script only. |
| `QA300_TURNSTILE_TOKEN` | QA Turnstile token | No | Yes | No/QA only | Script only. |
| `PLAYWRIGHT_TURNSTILE_TOKEN` | QA Turnstile token | No | Yes | No/QA only | Script only. |
| `TURNSTILE_TEST_TOKEN` | QA Turnstile token | No | Yes | No/QA only | Script only. |

## Unclear Items To Confirm

| Item | Why It Is Unclear |
| --- | --- |
| Active status of `index-homepage-brand*.html` and backup homepage scripts/styles | Standalone static files exist but `index.html` appears primary. |
| Active status of `pickup-admin.html` | Page says local-only admin; script still contains logic. |
| Whether `_inspect_src_zip_2/`, `.tmp-*`, deployment output, and JSON payload files should remain in deployable workspace | They look like generated/inspection artifacts. |
| Exact production email provider mix | Code supports Resend and SMTP in different flows. |
| Exact Google/OAuth provider status | `google-auth.js` and `auth-callback.html` exist, but active provider config is not visible in repo. |
| General order transport statuses | `orders.js` maps transport source statuses as `draft/open/closed/cancelled` while current transport requests use `published/matched/closed`. |
| Public view `transport_groups_public_view` field contract | It is intended public-safe, but any expansion needs SQL/view review. |

## Risks Found During Scan

| Risk | Evidence | Action This Round |
| --- | --- | --- |
| Missing module for transport payment email | `api/transport-requests/[id].js` requires `../_lib/transport-payment-email`, but no `api/_lib/transport-payment-email.js` file exists. | Recorded only; not fixed. |
| Possible invalid backup JS file | `transport-public.previous-good.js` appears to contain Vercel auth HTML rather than app JS. | Recorded only; not fixed. |
| Legacy status mismatch | General order helper references `draft/open/cancelled` for transport while current request statuses are `published/matched/closed`. | Recorded only; not fixed. |
| Public/static backup files may be deployable | Backup/brand/archive-like files live at project root. | Recorded only; not removed. |
| Known storage admin frontend issue | Current status says `admin-storage.html` has `storageTypeLabels is not defined`. | Recorded only; not fixed. |
| External/media dependencies can fail | Prior QA noted pickup video, Turnstile, Google Fonts failures. | Recorded only; not fixed. |

## Maintenance Rule

When a task adds or changes a page, endpoint, table, role, status, external service, or environment variable, update the relevant table in this document during the same task.
