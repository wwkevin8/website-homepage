# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-13
- Scope: fix signup-code backend `supabase is not defined` error

## Latest Completed Work

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before making changes.
- Searched the full project for `logSignupCodeRequest`, `logLoginRequest`, `logSignupAttempt`, `logCaptchaEvent`, `logVerificationRequest`, and `logAccountEvent`.
- Added safe no-op frontend logger fallbacks:
  - `register.js`: `logSignupCodeRequest`, `logSignupAttempt`, `logCaptchaEvent`, `logVerificationRequest`, `logAccountEvent`.
  - `login.js`: `logLoginRequest`, `logCaptchaEvent`, `logAccountEvent`.
- Logger fallbacks only call `console.warn` inside a guarded `try/catch`; they never throw and cannot block registration or login.
- Updated auth page script query strings so browsers stop using stale cached files:
  - `register.html` now loads `register.js?v=20260513-auth-log-fix`.
  - `login.html` now loads `login.js?v=20260513-auth-log-fix`.
- Fixed `.auth-turnstile-block[hidden]` CSS so the Turnstile block is truly hidden on first login/register load. The previous `.auth-turnstile-block { display: grid; }` rule overrode the browser default hidden behavior.
- Fixed `/api/auth/request-signup-code` by initializing the Supabase admin client before signup-code logging, duplicate-email checks, and rate-limit checks.
- Hardened `recordAuthRiskEvent` so logging is skipped with `console.warn` if the Supabase client is unavailable; auth risk logging must not block registration/login flows.

## Current Project State

- Registration code sending remains email -> backend rate check -> send code by default; Turnstile is only required after signup-code thresholds return `needCaptcha=true`.
- Login flow remains email/password -> backend risk check -> credential check -> signed user session cookie.
- Login and register pages now visually hide the full Turnstile block by default, show it only after `needCaptcha=true`, and keep primary buttons disabled only while submitting.
- Signup-code requests should no longer surface `supabase is not defined` to the registration page.
- `supabase/20260513_auth_risk_events.sql` exists for persistent auth risk logs and login failure counting.
- Password-reset Turnstile behavior was intentionally left unchanged, except shared Turnstile server error messages are Chinese.
- Storage/admin state is unchanged from the prior handoff.

## Open Issues Or Risks

- `supabase/20260513_auth_risk_events.sql` must be applied in Supabase for persistent login failure counts and auth risk logs to work fully. The application logs insert failures without blocking users if the table is missing.
- The "multiple different emails from one IP" login threshold is implemented as 5 distinct emails within 10 minutes because the user requested an abnormal threshold but did not specify a number.
- `gh` is not installed on this machine, so GitHub PR creation still requires either installing `gh` or using the GitHub web UI.

## Recommended Next Steps

- Deploy with the updated auth CSS/JS so affected browsers fetch the fixed auth pages.
- After deployment, hard-refresh or reopen the registration page in WeChat and confirm `logSignupCodeRequest is not defined` is gone.
- Apply `supabase/20260513_auth_risk_events.sql` in Supabase before or alongside deploying the full auth risk logging change.
