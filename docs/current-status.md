# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-13
- Scope: implement NGN membership admin and user-center UI locally

## Latest Completed Work

- Read `E:\webside\AGENTS.md`, `E:\webside\docs\current-status.md`, and the Supabase skill before expanding the public membership benefit selection.
- Checked the Supabase changelog before the API helper change; no relevant breaking change was found for this server-side claim-selection adjustment.
- Expanded the user-center membership selection from two choices to four choices:
  - `storage`;
  - `pickup`;
  - `moving`;
  - `welcome_pack`.
- Updated `/api/public/membership/benefit-selection` behavior through `api/_lib/membership.js` so public users can create selected claims for `moving` and `welcome_pack`; these remain unbound to orders and are handled offline by customer service.
- Updated `profile.js` so moving/welcome_pack selected states show contact-service instructions and used states show completed usage; users still cannot cancel or change the selected benefit from the frontend.
- Updated `admin-memberships.html` filter options to include `moving` and `welcome_pack`; existing backend claim actions still support mark-used, cancel, and reset for these selected claims.
- Updated `docs/PROJECT_MAP.md` to reflect four public membership choices and the offline handling model for moving/welcome_pack.
- No moving order page, welcome-pack claim table, inventory flow, price calculator, delivery system, deployment, or push was added.

- Read `E:\webside\AGENTS.md`, `E:\webside\docs\current-status.md`, and the browser skill before continuing the local membership frontend work.
- Refined first-stage membership frontend locally, without deployment and without pushing `main`:
  - `admin-memberships.html` / `admin-memberships.js` now expose a客服用会员管理 page in the existing admin shell;
  - admin user search covers name, email, phone, WeChat, and public user id, and displays user id, name, email, phone, WeChat, and created time;
  - admin membership list displays user name/email/phone, membership cycle, entitlement status, benefit type, claim status, linked order number, membership discount amount, extra charge amount, final price, created time, and updated time;
  - claim operation buttons are status-aware for mark-used, cancel, and reset, with audit log details still visible per record;
  - `profile.html` / `profile.js` now render the requested NGN membership states for non-member, unclaimed member, selected storage/pickup, reserved, used, and cancelled claim responses;
  - user benefit selection now uses a confirmation dialog and posts only `{ "benefit_type": "storage" }` or `{ "benefit_type": "pickup" }`;
  - `storage.html`, `storage-booking.html`, and `pickup-form.html` show read-only membership hints when the logged-in user has a matching selected/reserved claim, without frontend price calculation or free-order copy;
  - `/api/admin/memberships/users` search now includes `site_users.wechat_id` and returns `created_at` when available.
- Updated `docs/PROJECT_MAP.md` for the membership admin page, profile module, and storage/pickup membership hints.
- No Vercel deployment was run and no branch was pushed.

- Read `E:\webside\AGENTS.md`, `E:\webside\docs\current-status.md`, and the Supabase skill before database/API verification.
- Applied and verified `supabase/20260513_membership_entitlements.sql` on Supabase project `ngn-transport` (`brmsymzkmdnxzhrcaghw`).
- Confirmed the migration is safe to run from Supabase SQL Editor:
  - created `membership_entitlements`, `membership_benefit_claims`, and `membership_audit_logs`;
  - added membership linkage and pricing fields to `storage_orders` and `transport_requests`;
  - kept membership tables service-role-only by enabling and forcing RLS and revoking direct `public`, `anon`, and `authenticated` grants;
  - kept `site_user_id` and `membership_cycle` on claims derived from `entitlement_id` via database trigger;
  - updated `set_updated_at()` to use fixed `search_path = public`;
  - added covering indexes for membership foreign keys reported by Supabase performance advisor.
- Verified the API minimum loop against Supabase using direct handler invocation and cleaned all QA rows afterward:
  - admin manual membership grant;
  - `/api/public/membership/me`;
  - storage benefit selection;
  - duplicate pickup selection rejection;
  - non-member storage submission unaffected;
  - member storage submission binds `membership_benefit_claim_id`;
  - claim moves to `reserved`;
  - admin mark-used moves claim to `used`;
  - pickup `service_type=pickup` member logic;
  - dropoff rejected from member pickup benefit;
  - Heathrow/Gatwick September free core scenario;
  - other pickup fallback discount of GBP 100.
- Created local feature branch `codex/membership-v1` and committed the verified backend foundation locally:
  - commit `bbf3494` (`Add membership entitlement backend foundation`);
  - no push was performed and no Vercel deployment was run.
- Added first-stage admin membership management:
  - new `admin-memberships.html` and `admin-memberships.js`;
  - added `会员权益` to the existing admin shell navigation;
  - admin page supports searching `site_users`, manual 2026-27 membership grant, entitlement list, claim view, `benefit_type`, claim status, `linked_order_no`, mark-used, cancel, reset, and audit log display;
  - no invite code, auto membership grant, binding application, coupon, furniture, referral, cashback, moving order, welcome pack flow, or package-claim flow was added.
- Added user-center membership module to `profile.html` / `profile.js`:
  - non-members see contact-service copy;
  - members without a claim see only storage and pickup benefit choices;
  - selected members see benefit type, status, and linked order number;
  - users cannot cancel or change selected benefits from the frontend.
- Added read-only membership discount fields to storage and transport request admin detail pages:
  - `membership_benefit_claim_id`;
  - `membership_discount_amount`;
  - `extra_charge_amount`;
  - `final_price`;
  - `membership_discount_breakdown_json`.
- Added local dev-server routing for `/api/admin/memberships*` and `/api/admin/membership-claims*` so the new admin page can be tested locally.
- Committed the membership admin/user-center/detail-page work locally:
  - commit message `Add membership admin and profile UI`;
  - no push was performed and no Vercel deployment was run.

## Previous Completed Work

- Read `E:\webside\AGENTS.md`, `E:\webside\docs\current-status.md`, and the Supabase skill before implementation.
- Updated account-system risk controls:
  - registration code requests now return `cooldown=true` for same-email 60-second repeats without showing Turnstile;
  - registration code requests now return `needCaptcha=true` only for configured medium-risk email/IP/device thresholds;
  - registration code requests now return `temporarilyBlocked=true` for high-risk email/IP daily thresholds;
  - login now returns `needCaptcha=true` for medium-risk email/IP/distinct-email thresholds;
  - login now returns `temporarilyBlocked=true` for 6 failed passwords in 30 minutes, IP hourly abuse, or 10 distinct emails in 10 minutes;
  - login success still clears email failure counts.
- Updated `login.js` and `register.js` so Turnstile is only displayed for `needCaptcha=true`, cooldown shows a countdown, temporary block disables submission, and empty captcha tokens do not block default login/register requests.
- Added anonymous browser `deviceId` submission from login/register pages for session/device signup-code risk counting.
- Added and applied Supabase migration `auth_risk_events_device_id`:
  - migration history entry: `20260513142332 auth_risk_events_device_id`;
  - `public.auth_risk_events.device_id` exists;
  - `idx_auth_risk_events_device_action_created_at` exists.
- Updated `docs/PROJECT_MAP.md` for the new auth risk response contract and device risk metadata.
- GitHub was updated before Vercel deployment as required:
  - branch: `codex/auth-risk-release`;
  - commit: `5fbfc92` (`Split auth risk response states`).
- Production deployment completed:
  - deployment id: `dpl_2JMGLd5pPML1Z8a8i8MqgETVVgfg`;
  - deployment URL: `https://webside-dloin0vi7-wwkevin8s-projects.vercel.app`;
  - production aliases include `https://ngn.best` and `https://www.ngn.best`.

## Previous Planning Work

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before planning.
- Refined the NGN membership entitlement plan based on business boundaries:
  - use `membership_cycle` such as `2026-27` instead of calendar year;
  - first release is limited to admin manual grants, user status display, four-option benefit selection, server-side order eligibility, admin mark-used, admin cancel/reset, and audit logging;
  - no invite-code or order-auto membership grant in v1;
  - storage/pickup benefits are discounts against base service only, not whole-order free;
  - order records should carry `membership_discount_amount`, `extra_charge_amount`, and `final_price`;
  - central backend helper should live at `api/_lib/membership.js`;
  - claim `site_user_id` and `membership_cycle` must be derived server-side from entitlement data.
- No page, API, handler, SQL migration, deployment, or dependency implementation was made in this planning task.

## Previous Completed Release

- Read `E:\webside\AGENTS.md`, `E:\webside\docs\current-status.md`, the GitHub publish skill, and the Vercel deployment skill before release work.
- Implemented and deployed the auth captcha reliability changes:
  - normal registration code sending no longer requires Turnstile up front;
  - normal login no longer requires Turnstile up front;
  - login/register only show Turnstile after the backend returns `needCaptcha=true`;
  - `.auth-turnstile-block[hidden]` now truly hides the full verification block on first page load;
  - frontend logger fallbacks prevent `logSignupCodeRequest is not defined`;
  - `/api/auth/request-signup-code` now initializes the Supabase admin client before logging, duplicate email checks, and rate-limit checks.
- Added `supabase/20260513_auth_risk_events.sql` for persistent auth risk logs and login failure counting.
- GitHub was updated before Vercel deployment as required:
  - branch: `codex/full-sync`
  - commit: `4b21bc3` (`Fix conditional auth captcha flow`)
- Production deployment completed:
  - deployment id: `dpl_AbmJt5id4y4kQ5ZJbFtxRcfN34gz`
  - deployment URL: `https://webside-mg18f53zx-wwkevin8s-projects.vercel.app`
  - production aliases include `https://ngn.best` and `https://www.ngn.best`
- Applied `supabase/20260513_auth_risk_events.sql` to Supabase project `ngn-transport` (`brmsymzkmdnxzhrcaghw`):
  - migration history entry: `20260513140539 auth_risk_events`;
  - created `public.auth_risk_events` with auth risk logging columns;
  - created action/email/IP/time indexes and the login failure partial index;
  - enabled and forced RLS;
  - revoked public, anon, and authenticated table privileges.

## Current Project State

- The NGN membership entitlement system backend foundation is implemented locally and its database migration has been applied to Supabase project `ngn-transport` (`brmsymzkmdnxzhrcaghw`).
- Membership API handlers have been verified by direct local invocation against Supabase; membership backend, admin UI, user-center UI, and current frontend refinements are local to `codex/membership-v1` and have not been pushed or deployed.
- Membership remains independent from `site_users.is_member`; it is represented through separate entitlement tables, server-side helper logic, admin APIs, and user-safe public APIs.
- Current membership cycle is centralized in `api/_lib/membership.js` via `CURRENT_MEMBERSHIP_CYCLE`, defaulting to `2026-27`.
- Website-supported member choices now include storage, pickup, moving, and welcome_pack. Moving and welcome_pack are selected claims only and remain offline customer-service flows with no online order or inventory system.
- Pickup member benefit logic only applies to `service_type=pickup`; Heathrow/Gatwick in September is treated as the free core case, while other pickup cases get a service-side fallback discount/pending-admin-confirmation breakdown.
- User center, first-stage admin membership page, and storage/pickup membership hint UI are implemented locally but not deployed.
- Registration flow remains email -> backend rate check -> send code -> verify code -> profile/password -> automatic login.
- Login flow remains email/password -> backend risk check -> credential check -> signed user session cookie.
- Login and register pages visually hide the full Turnstile block by default and show it only after `needCaptcha=true`; cooldown and temporary-block states do not show Turnstile.
- Auth risk logging is now backed by `public.auth_risk_events` in Supabase, includes optional `device_id`, and is designed not to block users: insert failures are logged with `console.warn`.
- Password-reset Turnstile behavior was intentionally left unchanged, except shared Turnstile server error messages are Chinese.
- Storage/admin state is unchanged from the prior storage handoff.

## Verification Performed

- `node --check` passed for:
  - `api/_lib/membership.js`
  - `api/public/[...action].js`
  - `api/admin/[...action].js`
  - `public-api-handlers/membership-me.js`
  - `public-api-handlers/membership-benefit-selection.js`
  - `public-api-handlers/storage-order-submit.js`
  - `public-api-handlers/transport-request-submit.js`
- `npm run build:prod` passed.
- Supabase schema verification confirmed:
  - `membership_entitlements`, `membership_benefit_claims`, and `membership_audit_logs` exist;
  - `storage_orders` and `transport_requests` still exist and include `membership_benefit_claim_id`, `membership_discount_amount`, `extra_charge_amount`, `final_price`, and `membership_discount_breakdown_json`;
  - membership tables have RLS enabled and forced;
  - direct grants to `public`, `anon`, and `authenticated` on membership tables are zero;
  - `set_updated_at()` has `search_path=public`.
- API verification run `QA-MEM-mp46jcs3` passed:
  - admin grant, membership/me, storage selection, duplicate pickup rejection, non-member storage unaffected, member storage claim binding, claim reserved, admin mark-used, pickup LHR September core scenario, pickup fallback GBP 100, and dropoff no membership use.
- QA cleanup verification confirmed zero leftover QA users, admins, entitlements, claims, audit logs, storage orders, transport requests, or transport groups; totals returned to 5 `storage_orders` and 9 `transport_requests`.
- Supabase security advisor no longer reports `set_updated_at()` search-path warning. Remaining membership-related security INFO entries are expected `RLS Enabled No Policy` notices for service-role-only membership tables with direct grants revoked.
- Supabase performance advisor no longer reports unindexed membership foreign keys. It still reports expected new unused membership indexes immediately after creation plus unrelated pre-existing duplicate/unused index notices on non-membership tables.
- `node --check` passed for:
  - `admin-memberships.js`
  - `admin-api.js`
  - `admin-shell.js`
  - `api/admin/[...action].js`
  - `profile.js`
  - `transport-admin.js`
  - `admin-pages.js`
  - `dev-server.js`
- Admin membership API smoke test passed using direct handler invocation:
  - search membership users;
  - manual grant;
  - list membership with claim;
  - mark-used;
  - reset;
  - audit log returned expected actions.
- Browser verification against local dev server `http://localhost:5175` passed for `admin-memberships.html`:
  - admin shell loaded;
  - `会员权益` navigation highlighted;
  - user search empty state and membership list empty state rendered;
  - no bad responses or console/page errors.
- Browser verification against local dev server `http://localhost:5175` passed for `profile.html` membership module:
  - non-member state rendered;
  - member storage/pickup choices rendered;
  - storage selection succeeded;
  - duplicate pickup selection was rejected by the API;
  - QA rows were cleaned afterward.
- `npm run build:prod` passed after the admin/user-center/detail-page changes.
- Current-turn membership frontend verification passed:
  - `node --check` passed for `admin-memberships.js`, `profile.js`, `pickup-form.js`, `script.js`, and `api/admin/[...action].js`;
  - local pages returned HTTP 200 on `http://localhost:5173` for `admin-memberships.html`, `profile.html`, `storage.html`, `storage-booking.html`, and `pickup-form.html`;
  - browser test with mocked logged-in API responses verified non-member profile state, member storage/pickup choices, confirmation-based storage selection payload, reserved claim discount fields, used claim display, admin member list fields, and user search with WeChat;
  - browser test with mocked membership responses verified storage hints on `storage.html` and `storage-booking.html`, and pickup hint on `pickup-form.html`.
- Four-choice membership verification passed:
  - `node --check` passed for `profile.js`, `api/_lib/membership.js`, `public-api-handlers/membership-benefit-selection.js`, and `admin-memberships.js`;
  - direct helper test confirmed `storage`, `pickup`, `moving`, and `welcome_pack` can create `selected` claims, while `cashback` remains rejected from public selection;
  - browser test with mocked logged-in API responses confirmed the profile page renders four benefit cards, posts `{ benefit_type: "moving" }`, hides all other choices after selection, shows moving customer-service copy, shows welcome_pack customer-service copy, and shows moving used/completed state.

## Previous Verification

- `node --check` passed for:
  - `api/auth/[action].js`
  - `login.js`
  - `register.js`
- `npm run build:prod` passed.
- `npm run deploy:prod` completed with Vercel status `READY`.
- `vercel inspect webside-dloin0vi7-wwkevin8s-projects.vercel.app` confirmed production target and aliases for `ngn.best` and `www.ngn.best`.
- `https://ngn.best/login.html` returned HTTP 200.
- `https://ngn.best/register.html` returned HTTP 200.
- Supabase verification confirmed:
  - `public.auth_risk_events.device_id` exists;
  - `idx_auth_risk_events_device_action_created_at` exists;
  - migration history includes `20260513142332 auth_risk_events_device_id`.

## Previous Release Verification

- `node --check` passed for:
  - `api/auth/[action].js`
  - `api/_lib/http.js`
  - `api/_lib/turnstile.js`
  - `login.js`
  - `register.js`
- `npm run build:prod` passed.
- Vercel production deploy completed with status `Ready`.
- `https://ngn.best/register.html` returned HTTP 200.
- `https://ngn.best/login.html` returned HTTP 200.
- `vercel inspect` confirmed the deployment is production and aliased to `ngn.best`.
- `vercel logs` did not return a usable error summary before the local command timeout because the CLI entered a live log stream.
- Supabase verification confirmed:
  - `public.auth_risk_events` exists;
  - RLS is enabled and forced;
  - required indexes exist;
  - `public`, `anon`, and `authenticated` have no direct table grants;
  - migration history includes `20260513140539 auth_risk_events`.

## Open Issues Or Risks

- Membership cycle format is `YYYY-YY`, for example `2026-27`; current-cycle resolution now lives in `api/_lib/membership.js`.
- Storage/pickup discount calculation is centralized in `api/_lib/membership.js`, but production pricing should still be validated against the actual calculator fields before release.
- The PDF text layer did not expose searchable Heathrow/Gatwick/September lines in local extraction; current pickup rules are based on the explicit business rules supplied in the user request.
- Supabase JS cannot wrap existing multi-step storage/pickup order creation plus claim binding in a single cross-table transaction. The implementation uses conditional claim binding (`status in selected/reserved` and `linked_order_id is null`) plus cleanup on bind conflict; a future RPC could make the full order-create/bind path fully atomic.
- Membership code is not pushed or deployed yet; GitHub must be updated before any Vercel deployment.
- Working tree still contains unrelated pre-existing auth risk files/changes (`api/auth/[action].js`, `login.js`, `register.js`, and `supabase/20260513_auth_risk_events_device_id.sql`) that were not part of the membership UI work and should be handled separately.
- `gh` is not installed on this machine, so GitHub PR creation still requires either installing `gh` or using the GitHub web UI.

## Recommended Next Steps

- Run one final end-to-end QA pass before any push or deployment.
- Push the feature branch only when ready; do not push `main` or deploy production until the complete membership product flow is accepted.
- Confirm exact pricing inputs for storage base-box allowance, buy-box fees, overweight fees, stairs fees, out-of-city return fees, pickup base fare, extra passengers/luggage, waiting fees, and special service fees before production release.
- In WeChat and a normal browser, verify:
  - first login does not show Turnstile;
  - first registration code request does not show Turnstile;
  - same-email registration code repeat within 60 seconds shows cooldown only;
  - backend `needCaptcha=true` shows Turnstile;
  - backend `temporarilyBlocked=true` disables the submit button with Chinese copy;
  - no `supabase is not defined` or `logSignupCodeRequest is not defined` message appears.
- Monitor Vercel function logs after real user traffic for `auth_risk_event_insert_failed` or auth endpoint errors.
