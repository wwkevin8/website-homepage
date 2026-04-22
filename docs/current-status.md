# Current Status

## Document Rules

- This file is the cross-session handoff for the latest useful project state.
- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Rewrite sections in place when the truth changes; do not stack raw session history.

## Last Updated Task

- Date: 2026-04-22
- Scope: executed the approved single-file controlled restore for `api/_lib/transport-order-submission-email.js` and re-ran only the agreed public API verification set

## Completed In This Task

- Re-read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before continuing.
- Confirmed the restore source for `api/_lib/transport-order-submission-email.js`, with matching SHA256 across:
  - `E:\webside-overwrite-backup-20260422-112638`
  - `E:\webside-overwrite-backup-20260422-034927`
  - `E:\webside-overwrite-backup-20260422-111600`
  - `E:\webside-backup-runtime-check`
- Confirmed evidence for `api/_lib/transport-order-submission-email.js`:
  - it is byte-identical across all checked local backups
  - the current branch does not show a normal direct top-level Git history for this path
  - it does appear inside the temporary deployment output tree recorded by `8e6f9e2` (`chore: restore live static baseline and record api diagnosis`)
- Restored only this file from `E:\webside-overwrite-backup-20260422-112638`:
  - `api/_lib/transport-order-submission-email.js`
- Did not restore any other files.
- Did not deploy anything.
- Ran only the agreed minimal verification endpoints:
  - `/api/public/transport-groups`
  - `/api/public/transport-board`

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
- Minimal verification shows the public API restore is now healthy again:
  - `/api/auth/session` remains healthy and returns normal JSON
  - `/api/admin/session` remains healthy and returns normal JSON
  - `/api/admin/login` remains a normal JSON error response with HTTP 400 instead of crashing
  - `/api/public/transport-groups` now returns HTTP 200 with normal JSON
  - `/api/public/transport-board` now returns HTTP 200 with normal JSON

## Open Issues Or Risks

- Current public endpoint verification after the single-file restore:
  - `/api/public/transport-groups`
    - status: 200
    - normal JSON: yes
    - 404: no
    - server crash: no
    - import error: none
  - `/api/public/transport-board`
    - status: 200
    - normal JSON: yes
    - 404: no
    - server crash: no
    - import error: none
- Source evidence:
  - `api/_lib/transport-order-submission-email.js` is byte-identical across all checked local backups and appears in the temporary deployment output tree recorded by `8e6f9e2`
- The requested single-file controlled restore was successful and the current minimal public API verification set is now passing.

## Recommended Next Steps

1. Review `git status` immediately to confirm only the intended files were restored.
2. Create a commit for the controlled restore work completed so far before doing any further recovery work.
3. After committing, decide whether to stop here with the recovered API baseline or move on to focused behavior checks for the public pages and admin login flow without broad code changes.
