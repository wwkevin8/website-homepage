# Current Status

## Document Rules

- This file is the cross-session handoff for the latest useful project state.
- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Rewrite sections in place when the truth changes; do not stack raw session history.

## Last Updated Task

- Date: 2026-04-22
- Scope: executed the approved single-file controlled restore for `api/_lib/user-profile.js` and re-ran only the agreed public API verification set

## Completed In This Task

- Re-read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before continuing.
- Confirmed the restore source for `api/_lib/user-profile.js`, with matching SHA256 across:
  - `E:\webside-overwrite-backup-20260422-112638`
  - `E:\webside-overwrite-backup-20260422-034927`
  - `E:\webside-overwrite-backup-20260422-111600`
  - `E:\webside-backup-runtime-check`
- Confirmed evidence for `api/_lib/user-profile.js`:
  - it is byte-identical across all checked local backups
  - the current branch does not show a normal direct top-level Git history for this path
  - it does appear inside the temporary deployment output tree recorded by `8e6f9e2` (`chore: restore live static baseline and record api diagnosis`)
- Restored only this file from `E:\webside-overwrite-backup-20260422-112638`:
  - `api/_lib/user-profile.js`
- Did not restore any other files.
- Did not deploy anything.
- Ran only the agreed minimal verification endpoints:
  - `/api/public/transport-groups`
  - `/api/public/transport-board`

## Current Project Status

- The next twelve explicitly restored missing files are now back in the current project:
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
- Minimal verification shows the public API restore moved the failure point forward again:
  - `/api/auth/session` remains healthy and returns normal JSON
  - `/api/admin/session` remains healthy and returns normal JSON
  - `/api/admin/login` remains a normal JSON error response with HTTP 400 instead of crashing
  - `/api/public/transport-groups` and `/api/public/transport-board` are still blocked by the next direct missing dependency required through `public-api-handlers/storage-order-submit.js`

## Open Issues Or Risks

- Current public endpoint verification after the single-file restore:
  - `/api/public/transport-groups`
    - status: connection reset / no HTTP response
    - normal JSON: no
    - 404: no
    - server crash: yes
    - import error: `Cannot find module '../api/_lib/transport-join'`
  - `/api/public/transport-board`
    - status: connection reset / no HTTP response
    - normal JSON: no
    - 404: no
    - server crash: yes
    - import error: `Cannot find module '../api/_lib/transport-join'`
- Source evidence:
  - `api/_lib/user-profile.js` is byte-identical across all checked local backups and appears in the temporary deployment output tree recorded by `8e6f9e2`
- The requested single-file controlled restore was successful, but the public API runtime still needs another tightly scoped dependency recovery pass before it can proceed.

## Recommended Next Steps

1. Review `git status` immediately to confirm only the intended files were restored.
2. Create a commit for the controlled restore work completed so far before doing any further recovery work.
3. If approved, continue with another tightly scoped dependency restore pass for only the newly exposed direct missing file that now blocks the public API path:
   - `api/_lib/transport-join.js`
