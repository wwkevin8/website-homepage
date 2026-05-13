# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-13
- Scope: deploy conditional auth captcha fixes to production

## Latest Completed Work

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

## Current Project State

- Registration flow remains email -> backend rate check -> send code -> verify code -> profile/password -> automatic login.
- Login flow remains email/password -> backend risk check -> credential check -> signed user session cookie.
- Login and register pages visually hide the full Turnstile block by default and show it only after `needCaptcha=true`.
- Auth risk logging is designed not to block users: insert failures are logged with `console.warn`.
- Password-reset Turnstile behavior was intentionally left unchanged, except shared Turnstile server error messages are Chinese.
- Storage/admin state is unchanged from the prior storage handoff.

## Verification Performed

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

## Open Issues Or Risks

- `supabase/20260513_auth_risk_events.sql` still must be applied in Supabase for persistent login failure counts and auth risk logs to work fully. The code is defensive if the table is missing, but production risk counting is incomplete until the migration is applied.
- The "multiple different emails from one IP" login threshold is implemented as 5 distinct emails within 10 minutes because the requested abnormal threshold did not specify a number.
- `gh` is not installed on this machine, so GitHub PR creation still requires either installing `gh` or using the GitHub web UI.

## Recommended Next Steps

- Apply `supabase/20260513_auth_risk_events.sql` in Supabase.
- In WeChat and a normal browser, verify:
  - first login does not show Turnstile;
  - first registration code request does not show Turnstile;
  - no `supabase is not defined` or `logSignupCodeRequest is not defined` message appears.
- Monitor Vercel function logs after real user traffic for `auth_risk_event_insert_failed` or auth endpoint errors.
