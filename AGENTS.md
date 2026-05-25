# AGENTS.md

This file is the long-lived working contract for Codex in the `webside-transport-dispatch` project.

## Required Start Of Every Task

Before any analysis, implementation, or review, Codex must read:

1. `E:\webside\AGENTS.md`
2. `E:\webside\docs\current-status.md`

Before making any change, Codex must explicitly report which rule files and status files were read for the current task.

## Project Overview

- Project name: `webside-transport-dispatch`
- Runtime model: static multi-page website plus Vercel Serverless API routes
- Frontend stack: plain HTML, CSS, and browser JavaScript
- Backend stack: Vercel Serverless Functions under `api/`
- Database and authentication: Supabase
- Email: Resend where configured; SMTP/nodemailer where configured
- Deployment target: Vercel
- Node requirement: `24.x`
- Main business areas:
  - storage/luggage orders
  - airport pickup/dropoff
  - carpool/transport requests
  - public transport board
  - admin operations

## How Codex Should Work In This Project

1. Keep the task scope narrow and aligned with the user's request.
2. Read the surrounding files before changing behavior.
3. Prefer incremental edits over broad rewrites.
4. Preserve existing business flows unless the user explicitly asks to change them.
5. Separate public-facing user flows from admin/operator flows.
6. Treat public API exposure, payment/email behavior, and transport grouping as high-risk areas.
7. Do not store temporary chat notes, one-off conclusions, or session logs in this file.
8. Use `docs/current-status.md` as the cross-session handoff snapshot.

## Fixed Release Order

- GitHub must be updated before any Vercel deployment.
- For production or preview releases, commit and push the intended changes to GitHub first, then run the relevant Vercel build/deploy command.
- Do not deploy uncommitted local changes to Vercel unless the user explicitly overrides this rule for that single task.
- After deployment, record both the GitHub commit and the Vercel deployment in `docs/current-status.md`.

## Modification Scope Control

- Do not edit unrelated HTML, CSS, JS, API, SQL, or config files.
- Do not rename files unless the user explicitly asks.
- Do not refactor core modules just to make a small change.
- Do not modify `package.json` or dependency files unless the task is about dependencies, scripts, or runtime configuration.
- Do not change deployment behavior without checking `vercel.json` and the relevant Vercel command path.
- When a change touches multiple flows, describe the expected blast radius before editing.

## Safety Rules

- Public pages and public APIs must not expose private user data.
- Admin-only behavior must be enforced on the server, not only in frontend navigation.
- Never rely on browser `sessionStorage` as an authorization boundary.
- Keep service-role Supabase access on server-side code only.
- Do not commit secrets, tokens, private customer data, or production exports.
- Be careful with generated files in `output/` and historical artifacts in `work-log/`; they are not the canonical source of truth.
- Do not use paid, proprietary, subscription-only, or unclear-license fonts. Use free commercial-use fonts or safe system font stacks only.

## Static Asset And Build Output Safety

- Treat `.vercel/output/` as disposable generated output, never as a canonical source for images, videos, or other static assets.
- Do not edit, optimize, sync, partially copy, or recover assets from `.vercel/output/static/img/` unless explicitly verifying a build artifact.
- Be aware that Vercel build output may hardlink `.vercel/output/static/img/...` entries to source files under `img/...`; truncating or modifying the output entry can corrupt the source asset.
- Before Vercel builds, asset recovery, or static-output inspection, prefer deleting `.vercel/output/` first so stale hardlinks cannot affect source assets.
- When restoring images or videos, restore from Git, a known backup, or the real `img/` source path, not from `.vercel/output/`.
- If image thumbnails show gray/black blocks again, first check for exact chunk-sized files such as `65,536` or `131,072` bytes and verify hardlinks with `fsutil hardlink list`.

## Database Modification Rules

- Database changes belong in `supabase/` as SQL or migration files.
- Prefer additive, reversible schema changes.
- Do not casually rename or drop columns/tables.
- Consider Row Level Security and server-side service-role usage for every table touched.
- For existing tables, check current SQL files and migrations before proposing a new shape.
- Any status enum or workflow change must update docs and tests because it affects admin operations and public display.
- After dependency changes, run `npm audit`; after SQL changes, record what must be applied in Supabase and how to verify it.

## API Modification Rules

- Vercel API routes live under `api/`.
- Shared backend helpers live under `api/_lib/`.
- Public API aggregation is routed through `api/public/[...action].js` and shared handlers in `public-api-handlers/`; do not split it casually.
- Admin API aggregation is routed through `api/admin/[...action].js`; preserve server-side auth checks.
- Keep request validation, status normalization, and response privacy boundaries close to the server.
- When adding or changing an endpoint, update `docs/PROJECT_MAP.md` and run the narrowest meaningful API verification.
- Avoid route sprawl; prefer existing dispatch patterns unless there is a clear reason.

## Frontend Modification Rules

- User-facing pages and admin pages must be managed separately.
- Keep shared frontend behavior in the existing shared files when appropriate:
  - `script.js`
  - `site-auth.js`
  - `transport-api.js`
  - `transport-shared.js`
  - `transport-admin.js`
- Do not casually repurpose core integration files.
- Public pages must show only public-safe fields.
- Admin pages should optimize for operator efficiency and preserve existing working habits.
- Mobile layout must be checked for public-facing forms and service pages.
- Any visible text, status label, or workflow copy change should be checked in both desktop and mobile contexts when relevant.

## Critical Modules Requiring Extra Caution

Public transport display flow:

- `transport-board.html`
- `transport-public.js`
- `api/public/[...action].js`
- `public-api-handlers/transport-board.js`

Transport admin flow:

- `transport-admin-requests.html`
- `transport-admin-request-edit.html`
- `transport-admin-groups.html`
- `transport-admin-group-edit.html`
- `transport-admin.js`

Transport data and server behavior:

- `api/_lib/transport.js`
- `api/transport-requests/`
- `api/transport-groups/`
- `api/transport-group-members/`

User-facing pickup and transport request flow:

- `pickup.html`
- `pickup-form.html`
- `pickup-form.js`
- `service-center.html`
- `service-center.js`

Storage order flow:

- `storage.html`
- `storage-booking.html`
- `admin-storage.html`
- `admin-storage-detail.html`
- `api/_lib/storage-orders.js`
- `public-api-handlers/storage-order-submit.js`

## Local Run And Verification Commands

- Install dependencies: `npm install`
- Local helper server: `npm run dev`
- Vercel local emulation: `npm run dev:vercel`
- Smoke QA: `npm run qa:playwright:smoke`
- Transport flow QA: `npm run qa:playwright:transport-flow`
- Preview build: `npm run build:preview`
- Production build: `npm run build:prod`
- Preview deploy: `npm run deploy:preview`
- Production deploy: `npm run deploy:prod`

## Testing Requirements

- For documentation-only changes, verify the intended files exist and no functional files were edited.
- After any functional code change, restart the relevant local server before verification so API/frontend changes are not tested against a stale running process.
- For frontend changes, run or manually verify the affected page in desktop and mobile widths.
- For API changes, run syntax checks and at least one focused endpoint test where practical.
- For transport/public-board changes, verify public privacy boundaries and status filtering.
- For admin changes, verify login/session behavior and role restrictions when relevant.
- For dependency changes, run `npm audit` after installation and either fix issues or document why they remain.

## Required Report Before Changes

Before editing, Codex must report:

- the rule/status files read for the task;
- the files expected to be changed;
- whether the change touches public pages, admin pages, APIs, database, email, deployment, or docs only;
- any known risk or ambiguity.

## Required Report After Changes

After finishing, Codex must report:

- files created or edited;
- purpose of each file or change;
- verification performed;
- functional files intentionally left untouched;
- unresolved risks or information the user should confirm.

## Status Tracking Rule

At the end of every completed task, update `E:\webside\docs\current-status.md`.

The status file should stay structured and deduplicated. It should summarize:

- latest completed work;
- current project state;
- open issues or risks;
- recommended next steps.

Rewrite outdated or repeated status content in place instead of stacking raw chronological logs.

## Related Project Control Documents

- `docs/PROJECT_MAP.md`: editable project inventory for pages, APIs, database tables, status flows, roles, services, and environment variables.
- `docs/RELEASE_CHECKLIST.md`: repeatable release, smoke-test, rollback, and incident checklist.
- `docs/current-status.md`: latest handoff snapshot for cross-session continuity.
