# Current Status

## Document Rules

- This file is the cross-session handoff for the latest useful project state.
- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Rewrite sections in place when the truth changes; do not stack raw session history.

## Last Updated Task

- Date: 2026-04-22
- Scope: executed the approved controlled restore for the three newly exposed direct dependencies and re-ran only the agreed minimal API verification set

## Completed In This Task

- Re-read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before continuing.
- Confirmed the restore source for these three files, with matching SHA256 across:
  - `E:\webside-overwrite-backup-20260422-112638`
  - `E:\webside-overwrite-backup-20260422-034927`
  - `E:\webside-overwrite-backup-20260422-111600`
  - `E:\webside-backup-runtime-check`
- Restored only these three files from `E:\webside-overwrite-backup-20260422-112638`:
  - `api/_lib/auth-email.js`
  - `api/_lib/storage-orders.js`
  - `api/_lib/admin-managers.js`
- Did not restore any other files.
- Did not deploy anything.
- Ran only the agreed minimal verification endpoints:
  - `/api/auth/session`
  - `/api/public/transport-groups`
  - `/api/public/transport-board`
  - `/api/admin/session`
  - `/api/admin/login`

## Current Project Status

- The first seven explicitly restored missing files are now back in the current project:
  - `api/admin/[...action].js`
  - `api/_lib/email-login.js`
  - `api/_lib/rate-limit.js`
  - `api/transport-groups/[id]/members.js`
  - `api/_lib/auth-email.js`
  - `api/_lib/storage-orders.js`
  - `api/_lib/admin-managers.js`
- Minimal verification shows the restore moved the failure point forward again, but the local runtime is still blocked by the next layer of direct missing dependencies:
  - `/api/auth/session` now fails because `api/auth/[action].js` cannot load missing `api/_lib/turnstile`
  - `/api/public/transport-groups` and `/api/public/transport-board` now fail because `public-api-handlers/storage-order-submit.js` cannot load missing `api/_lib/storage-order-notifier`
  - `/api/admin/session` and `/api/admin/login` now fail because `api/admin/[...action].js` cannot load missing `api/_lib/orders`

## Open Issues Or Risks

- Current endpoint verification after the three-file follow-up restore:
  - `/api/auth/session`
    - status: connection reset / no HTTP response
    - normal JSON: no
    - 404: no
    - server crash: yes
    - import error: `Cannot find module '../_lib/turnstile'`
  - `/api/public/transport-groups`
    - status: connection reset / no HTTP response
    - normal JSON: no
    - 404: no
    - server crash: yes
    - import error: `Cannot find module '../api/_lib/storage-order-notifier'`
  - `/api/public/transport-board`
    - status: connection reset / no HTTP response
    - normal JSON: no
    - 404: no
    - server crash: yes
    - import error: `Cannot find module '../api/_lib/storage-order-notifier'`
  - `/api/admin/session`
    - status: connection reset / no HTTP response
    - normal JSON: no
    - 404: no
    - server crash: yes
    - import error: `Cannot find module '../_lib/orders'`
  - `/api/admin/login`
    - status: connection reset / no HTTP response
    - normal JSON: no
    - 404: no
    - server crash: yes
    - import error: `Cannot find module '../_lib/orders'`
- Source evidence:
  - `api/_lib/storage-orders.js` and `api/_lib/admin-managers.js` both exist in Git history and were deleted by commit `8e6f9e2` (`chore: restore live static baseline and record api diagnosis`)
  - `api/_lib/auth-email.js` is present and byte-identical in all checked local backups, and it also appears inside the temporary deployment output tree recorded by commit `8e6f9e2`, but it does not currently show up as a normal tracked top-level path in Git history
- The requested controlled restore was successful, but the project still needs another tightly scoped dependency recovery pass before API runtime can proceed.

## Recommended Next Steps

1. Review `git status` immediately to confirm only the intended files were restored.
2. Create a commit for the controlled restore work completed so far before doing any further recovery work.
3. If approved, continue with another tightly scoped dependency restore pass for only the newly exposed direct missing files:
   - `api/_lib/turnstile`
   - `api/_lib/storage-order-notifier`
   - `api/_lib/orders`
