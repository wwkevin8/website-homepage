# Current Status

## Document Rules

- This file is the cross-session handoff for the latest useful project state.
- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Rewrite sections in place when the truth changes; do not stack raw session history.

## Last Updated Task

- Date: 2026-04-22
- Scope: performed browser-based business acceptance and bug diagnosis for `transport-board.html`, `pickup.html`, and `admin-login.html` without changing business files or deploying

## Completed In This Task

- Re-read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before continuing.
- Did not modify any business files.
- Did not deploy anything.
- Ran browser-based checks against:
  - `transport-board.html`
  - `pickup.html`
  - `admin-login.html`
- Captured page load behavior, data rendering, button and submit behavior, API response statuses, console warnings and errors, and admin login API/session results.
- Ran direct local API verification for admin login:
  - empty credentials
  - bootstrap credentials from local `.env`
  - session check after attempted normal login

## Current Project Status

- The next fourteen explicitly restored missing files are now back in the current project:
  - `api/admin/[...action].js`
  - `api/_lib/email-login.js`
  - `api/_lib/rate-limit.js`
  - `api/transport-groups/[id]/members.js`
  - `api/_lib/auth-email.js`
  - `api/_lib/storage-orders.js`
  - `api/_lib/admin-managers.js`
  - `api/_lib/turnstile.js`
  - `api/_lib/storage-order-notifier.js`
  - `api/_lib/orders.js`
  - `api/_lib/storage-order-webhook.js`
  - `api/_lib/user-profile.js`
  - `api/_lib/transport-join.js`
  - `api/_lib/transport-order-submission-email.js`
- Current business-level validation shows:
  - `transport-board.html` loads successfully, calls `/api/auth/session` and `/api/public/transport-groups`, and renders board cards with data
  - `pickup.html` loads successfully, calls `/api/auth/session` and `/api/public/transport-groups`, and renders preview cards with data
  - `admin-login.html` loads successfully and calls `/api/admin/session`
  - direct API checks confirm `/api/admin/login` returns structured JSON for both empty and normal credential submissions
- Public API is currently healthy at the endpoint level, but some UI/business issues remain in the page layer and admin login flow.

## Open Issues Or Risks

- Browser and API diagnosis findings:
  - `transport-board.html`
    - page status: 200
    - API responses: `/api/auth/session` 200, `/api/public/transport-groups` 200
    - render: 2 board cards rendered in local validation
    - filter submit: works and re-requests `/api/public/transport-groups` with 200
    - issue: the visible `加入拼车` button is not stably clickable in real browser automation; normal click times out because the element never becomes stable
    - issue: `查看详情` interaction surfaces a detail overlay, but the behavior is modal-like while the page URL stays unchanged, so the action semantics should be confirmed during bug fixing
  - `pickup.html`
    - page status: 200
    - API responses: `/api/auth/session` 200, `/api/public/transport-groups?sort=upcoming&limit=3&page=1` 200
    - render: 2 preview cards rendered in local validation
    - pricing toggle: after dismissing the intro modal, the price switch changed from `£80` to `£85`
    - issue: an intro modal (`#pickupIntroModal`) is visible on load and blocks interaction with underlying controls until manually closed
    - console warning: `<link rel=preload> uses an unsupported as value`
  - `admin-login.html`
    - page status: 200
    - API responses: `/api/admin/session` 200, empty submit `/api/admin/login` 400, normal submit `/api/admin/login` 401
    - empty credentials:
      - direct API: 400 with normal JSON
      - browser form: shows the same error, but the returned Chinese text is mojibake (`璇疯緭鍏ヨ处鍙峰拰瀵嗙爜`) instead of a readable prompt
    - normal credentials from local `.env`:
      - direct API: 401 with normal JSON `{ data: null, error: { message: "账号或密码错误" } }`
      - browser flow: stays on `admin-login.html`, no auth cookie is set, subsequent `/api/admin/session` still reports `authenticated: false`
    - console errors: expected 400 and 401 resource failures are emitted in browser console during login attempts
- The restore work established a runnable local API baseline, but admin business authentication still fails and at least two page-level interaction bugs remain.

## Recommended Next Steps

1. Review `git status` and create a checkpoint commit before any bug fixing work.
2. Prioritize admin authentication diagnosis first, because valid local bootstrap credentials currently return 401 and no session can be established.
3. After admin auth is understood, fix the two page-level interaction issues:
   - `pickup.html` intro modal blocking page controls on first load
   - `transport-board.html` join button instability during normal click interaction
