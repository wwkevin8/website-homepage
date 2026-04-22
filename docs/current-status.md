# Current Status

## Document Rules

- This file is the cross-session handoff for the latest useful project state.
- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Rewrite sections in place when the truth changes; do not stack raw session history.

## Last Updated Task

- Date: 2026-04-22
- Scope: stopped further static mirroring work and performed API plus admin-login diagnostics only, without deploying and without changing business files

## Completed In This Task

- Re-read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before continuing.
- Enumerated the main source entry points involved in:
  - public API routing
  - admin login
  - transport board data loading
  - pickup page data loading
- Confirmed the runtime request paths used by the two public pages:
  - `transport-board.html` requests `/api/auth/session` and `/api/public/transport-groups?sort=latest&limit=10&page=1`
  - `pickup.html` requests `/api/auth/session` and `/api/public/transport-groups?sort=upcoming&limit=3&page=1`
- Confirmed the admin login page request paths:
  - initial page load requests `/api/admin/session`
  - login submit posts to `/api/admin/login`
- Diagnosed the local helper-server failure chain:
  - `api/auth/[action].js` requires missing file `api/_lib/email-login.js`
  - first hit to `/api/auth/session` crashes the local helper server process
  - this produces `ERR_CONNECTION_REFUSED` in the browser and prevents later page/API requests from succeeding
- Diagnosed the public API failure chain separately:
  - `api/public/[...action].js` eagerly imports all public handlers
  - `public-api-handlers/storage-order-submit.js` requires missing file `api/_lib/rate-limit.js`
  - therefore even requests for unrelated actions like `/api/public/transport-groups` or `/api/public/transport-board` crash the helper server before a JSON response is sent
- Diagnosed the admin login failure chain separately:
  - local `dev-server.js` routes `/api/admin/login` and `/api/admin/session` to `E:\webside\api\admin\[...action].js`
  - that route file is currently missing locally
  - direct local requests to `/api/admin/session` and `/api/admin/login` return HTTP `404` with body `API route not found`
- Confirmed the local environment file contains the expected core admin and Supabase variables:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `USER_SESSION_SECRET`
  - `ADMIN_SESSION_SECRET`
  - `ADMIN_BOOTSTRAP_USERNAME`
  - `ADMIN_BOOTSTRAP_PASSWORD`
- No business/source files were changed in this task.

## Current Project Status

- Public static frontend files remain aligned with the current public site baseline from earlier work.
- The current blocker has shifted to the local API/runtime layer, not the static frontend.
- The two biggest local API/runtime breakages are missing source files:
  - `E:\webside\api\_lib\email-login.js`
  - `E:\webside\api\_lib\rate-limit.js`
- The current local admin route entry file is also missing:
  - `E:\webside\api\admin\[...action].js`
- Because of those missing files:
  - local page auth bootstrap via `site-auth.js` fails
  - public transport data APIs fail before returning JSON
  - local admin login cannot work at all

## Open Issues Or Risks

- `transport-board.html` and `pickup.html` currently both depend on `/api/auth/session` through `site-auth.js`; that request crashes the local helper server because `api/auth/[action].js` requires missing `api/_lib/email-login.js`.
- Public transport data routes are currently blocked by a second missing dependency:
  - `public-api-handlers/storage-order-submit.js` requires missing `api/_lib/rate-limit.js`
  - because `api/public/[...action].js` imports that handler eagerly, unrelated public endpoints fail too
- Local admin login failure is currently more basic than bad credentials:
  - the request reaches `/api/admin/login`
  - local route resolution points to missing `api/admin/[...action].js`
  - result is HTTP `404`, not a normal auth rejection
- The `.env` values exist locally, but the current runtime cannot reach the point where admin bootstrap auth is evaluated because the admin route entry file itself is missing.

## Recommended Next Steps

1. Restore the missing local source files before doing any deeper auth or data debugging:
   - `E:\webside\api\admin\[...action].js`
   - `E:\webside\api\_lib\email-login.js`
   - `E:\webside\api\_lib\rate-limit.js`
2. After those files are restored, re-run the same local diagnostics in this order:
   - `/api/auth/session`
   - `/api/public/transport-groups`
   - `/api/public/transport-board`
   - `/api/admin/session`
   - `/api/admin/login`
3. Only after the route and dependency files are back should admin credential or Supabase-auth logic be investigated further.
