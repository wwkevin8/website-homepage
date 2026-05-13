# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-13
- Scope: deploy split auth risk responses to production

## Latest Completed Work

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before release work.
- Implemented account-system risk response separation:
  - registration code requests return `cooldown=true` plus `retryAfter` for same-email 60-second repeats, without showing Turnstile;
  - registration code requests return `needCaptcha=true` only for configured medium-risk email/IP/device thresholds;
  - registration code requests return `temporarilyBlocked=true` for high-risk email/IP daily thresholds;
  - login returns `needCaptcha=true` for medium-risk email/IP/distinct-email thresholds;
  - login returns `temporarilyBlocked=true` for repeated password failures, IP hourly abuse, or 10 distinct emails in 10 minutes;
  - login success still clears the corresponding email failure count.
- Updated `login.js` and `register.js` so Turnstile is only displayed for `needCaptcha=true`; cooldown shows a countdown; temporary block disables submission; empty captcha tokens do not block default login/register requests.
- Added anonymous browser `deviceId` submission from login/register pages for session/device signup-code risk counting.
- Added and applied Supabase migration `auth_risk_events_device_id`:
  - migration history entry: `20260513142332 auth_risk_events_device_id`;
  - `public.auth_risk_events.device_id` exists;
  - `idx_auth_risk_events_device_action_created_at` exists.
- Updated `docs/PROJECT_MAP.md` for the new auth risk response contract and device risk metadata.

## Previous Completed Release

- Conditional auth captcha reliability changes were deployed earlier:
  - normal registration code sending no longer requires Turnstile up front;
  - normal login no longer requires Turnstile up front;
  - login/register only show Turnstile after the backend returns `needCaptcha=true`;
  - frontend logger fallbacks prevent `logSignupCodeRequest is not defined`;
  - `/api/auth/request-signup-code` initializes the Supabase admin client before logging, duplicate email checks, and rate-limit checks.
- Added and applied `supabase/20260513_auth_risk_events.sql`:
  - migration history entry: `20260513140539 auth_risk_events`;
  - `public.auth_risk_events` exists with RLS enabled and forced;
  - public, anon, and authenticated table privileges are revoked.
- Previous production deployment:
  - branch: `codex/full-sync`
  - commit: `4b21bc3` (`Fix conditional auth captcha flow`)
  - deployment id: `dpl_AbmJt5id4y4kQ5ZJbFtxRcfN34gz`
  - production aliases include `https://ngn.best` and `https://www.ngn.best`

## Current Project State

- Registration flow remains email -> backend rate check -> send code -> verify code -> profile/password -> automatic login.
- Login flow remains email/password -> backend risk check -> credential check -> signed user session cookie.
- Login and register pages visually hide the full Turnstile block by default and show it only after `needCaptcha=true`; cooldown and temporary-block states do not show Turnstile.
- Auth risk logging is backed by `public.auth_risk_events`, includes optional `device_id`, and is designed not to block users: insert failures are logged with `console.warn`.
- Password-reset Turnstile behavior is intentionally left unchanged, except shared Turnstile server error messages are Chinese.
- Storage/admin state is unchanged from the prior storage handoff.

## Verification Performed

- `node --check` passed for:
  - `api/auth/[action].js`
  - `login.js`
  - `register.js`
- `npm run build:prod` passed before release commit.
- Supabase verification confirmed:
  - `public.auth_risk_events.device_id` exists;
  - `idx_auth_risk_events_device_action_created_at` exists;
  - migration history includes `20260513142332 auth_risk_events_device_id`.

## Open Issues Or Risks

- The auth risk code changes are staged for release from the clean `codex/auth-risk-release` branch; production deployment should only run after this branch is pushed.
- Local helper server could not bind to ports 3000 or 3011 on this machine (`EACCES`), so browser verification was not run locally before release.
- `gh` is not installed on this machine, so GitHub PR creation still requires either installing `gh` or using the GitHub web UI.

## Recommended Next Steps

- Deploy the pushed `codex/auth-risk-release` branch to Vercel production.
- In WeChat and a normal browser, verify:
  - first login does not show Turnstile;
  - first registration code request does not show Turnstile;
  - same-email registration code repeat within 60 seconds shows cooldown only;
  - backend `needCaptcha=true` shows Turnstile;
  - backend `temporarilyBlocked=true` disables the submit button with Chinese copy;
  - no `supabase is not defined` or `logSignupCodeRequest is not defined` message appears.
- Monitor Vercel function logs after real user traffic for `auth_risk_event_insert_failed` or auth endpoint errors.
