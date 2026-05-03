# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-03
- Scope: saved the current valid storage-page working state to GitHub after standardizing image paths and repairing local tooling blockers

## Completed In This Task

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before touching the workspace.
- Added an `AGENTS.md` acceptance rule requiring `npm audit` after dependency changes, with unresolved issues fixed or recorded.
- Removed the static "temporarily unavailable" state from `storage.html` so users can enter the non-member storage booking flow.
- Updated `storage-booking.html` to use the existing text-based NGN brand lockup instead of the missing `img/logo.png`.
- Added dedicated storage booking page title/meta handling in `script.js`.
- Changed storage booking profile hydration to use `profileState.contactPreferenceLabel` instead of a hard-coded contact label.
- Fixed the estimate page booking summary refresh so `storage.html` updates the stored booking draft even though the actual booking form lives on `storage-booking.html`.
- Ran a local browser check at `http://localhost:3000/storage.html` and `http://localhost:3000/storage-booking.html`.
- Verified a sample estimate flow: 1 box, 20kg, `2026-06-01` to `2026-07-01` calculated `£24.00`, refreshed the booking summary, navigated to `storage-booking.html`, preserved the summary, and left the submit button available.
- Restored the project scripts listed in `AGENTS.md` in `package.json`, including local dev, Vercel emulation, Playwright QA, build, and deploy commands.
- Added `engines.node: 24.x` to `package.json`.
- Added `playwright` as a dev dependency so the existing QA runner can load.
- Upgraded `nodemailer` from `^6.10.1` to `^8.0.7` and verified the two email helper modules still load.
- Removed vulnerable spreadsheet/export dependencies from the project dependency tree.
- Changed `api/transport-requests/export.js` from XLSX generation to UTF-8 CSV generation with a BOM, CSV escaping, and `.csv` filenames.
- Verified the transport request export handler loads after the CSV change.
- Kept Vercel CLI out of project dependencies to avoid audit noise; the Vercel scripts now use pinned `npx --yes vercel@53.1.0 ...` commands.
- Reinstalled the local Playwright Chromium browser package after the cached headless shell failed to launch.
- Verified Chromium launches successfully after reinstall.
- Verified `node scripts/qa300-runner.js --list` now loads and lists all 300 QA cases.
- Verified `npx --yes vercel@53.1.0 --version` resolves a current Vercel CLI.
- Ran `npm audit --json`; it reports 0 vulnerabilities.
- Confirmed `package.json` and `package-lock.json` no longer declare `xlsx`, `exceljs`, or `vercel`.
- Renamed the storage service QR image from a Chinese filename to `img/storage-service-qr.jpg`.
- Moved the storage price and box-size images from Chinese directories under `img/寄存价格/` to English paths under `img/storage-pricing/`.
- Updated `storage.html` and `script.js` so the storage page and contact modal use the new English image paths.
- Verified the old storage image path references are no longer present in active HTML/JS/CSS files outside generated temp output.
- Verified all 7 `storage.html` image references resolve to existing files after the path update.
- Saved the current valid working state to GitHub branch `codex/full-sync`, excluding `.tmp-dpl-3ReB2SCYt-output/` generated mirror noise and unrelated `work-log/*.md` files.

## Current Project Status

- Storage booking is visibly open from the public storage page and the estimate-to-booking draft handoff works locally.
- The local dependency tree is intentionally small: `@supabase/supabase-js`, `nodemailer`, and dev-only `playwright`.
- `package.json` scripts now match the workflow expected by `AGENTS.md`.
- Playwright is installed and its Chromium browser can launch on this machine.
- The transport request admin export now downloads CSV instead of XLSX to avoid keeping a vulnerable spreadsheet package.
- Storage-page image assets now use English filenames and directories, reducing path-encoding risk in local tooling and deployment.
- The current valid storage/dependency/export/status changes are intended to be preserved on GitHub branch `codex/full-sync`.
- The active uncommitted storage/profile cleanup still includes earlier changes in `api/_lib/user-profile.js`, `profile.js`, `public-api-handlers/storage-order-submit.js`, `script.js`, `storage-booking.html`, and `storage.html`.
- The workspace remains noisy because `.tmp-dpl-3ReB2SCYt-output/`, generated Playwright snapshots, and historical work-log files are still present.
- The local helper server used for verification has been stopped.

## Open Issues Or Risks

- Browser verification covered page render and estimate-to-booking handoff only; authenticated final submission to the live storage API was not attempted.
- The full Playwright smoke script was not run end-to-end in this task because it requires a reachable app base URL and admin login environment values.
- The generated `.tmp-dpl-3ReB2SCYt-output/` tree remains in the working copy and continues to obscure meaningful repo changes.
- The earlier transport schema/status-drift risks remain open separately: duplicate prevention is mostly application-side, group/request/member status can drift, and live `create_site_transport_request` differs from repository SQL.

## Recommended Next Steps

1. Continue the real storage page build now that the entry flow and dependency/tooling blockers are cleared.
2. Test an authenticated storage booking submission through the local helper or Vercel preview environment before release.
3. Commit the storage booking cleanup plus dependency/security fix as focused change sets after excluding generated mirror/log noise.
4. Schedule a separate transport data repair/sync pass for the previously identified empty-group and one-member status drift.
