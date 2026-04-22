# AGENTS.md

## Usage Rules For Every New Task

1. Before any analysis, implementation, or review, read the current `E:\webside\AGENTS.md`.
2. Before any analysis, implementation, or review, also read `E:\webside\docs\current-status.md`; this is mandatory, not optional.
3. Before making any change, explicitly tell the user which rule files and status files were read for this task.
4. Treat this file as the project's cross-session working contract.
5. Do not store temporary chat notes, one-off conclusions, or short-term progress logs in this file.

## What Belongs In This File

Only keep long-lived project information here:

- Stable project rules and constraints
- Important directory and module responsibilities
- Local run and verification commands
- Acceptance criteria that remain valid across tasks

## Status Tracking Rule

1. At the end of every task, update `E:\webside\docs\current-status.md`.
2. If `docs/current-status.md` does not exist, create it first.
3. Keep `current-status.md` structured and deduplicated.
4. Summarize the latest completed work, current status, open issues, and recommended next steps there instead of adding session history to `AGENTS.md`.
5. Rewrite outdated or repeated status content in place instead of stacking more history below it.

## Project Overview

- Project name: `webside-transport-dispatch`
- Type: static multi-page website plus Vercel serverless APIs
- Main domain context: transport dispatch, public transport board, service pages, admin operations
- Deployment model: Vercel
- Node requirement: `24.x`

## Key Directories And Files

- `api/`: Vercel serverless API handlers
- `api/_lib/`: shared server-side transport logic and email-related helpers
- `api/transport-requests/`: transport request CRUD endpoints
- `api/transport-groups/`: transport group CRUD and member-management endpoints
- `api/public/[...action].js`: public API aggregation entry, should not be casually split apart
- `public-api-handlers/`: shared public-facing API dispatch logic
- `public-api-handlers/transport-board.js`: public transport board data shaping and exposure boundary
- `scripts/`: QA and utility scripts
- `supabase/`: Supabase-related assets or SQL/workflow material
- `img/`: image assets
- `output/`: generated outputs and captures
- `work-log/`: historical work artifacts, not the canonical cross-session handoff
- `transport-admin.js`: main admin-side transport interaction logic
- `transport-api.js`: client-side transport API integration layer
- `transport-shared.js`: shared transport constants and helper behavior
- `transport-board.html`: public board page
- `pickup.html`: public-facing transport service page
- `pickup-form.html` / `pickup-form.js`: pickup form UI and submission logic
- `service-center.html` / `service-center.js`: service center entry pages
- `script.js` / `styles.css`: main site-wide frontend assets
- `dev-server.js`: local helper server
- `vercel.json`: deployment and cron configuration
- `package.json`: source of truth for local scripts and Node version

## Critical Modules Requiring Extra Caution

- Public transport display flow:
  - `transport-board.html`
  - `transport-public.js`
  - `api/public/[...action].js`
  - `public-api-handlers/transport-board.js`
- Transport admin flow:
  - `transport-admin-requests.html`
  - `transport-admin-request-edit.html`
  - `transport-admin-groups.html`
  - `transport-admin-group-edit.html`
  - `transport-admin.js`
- Transport data and server behavior:
  - `api/_lib/transport.js`
  - `api/transport-requests/`
  - `api/transport-groups/`
  - `api/transport-group-members/`
- User-facing pickup flow:
  - `pickup.html`
  - `pickup-form.html`
  - `pickup-form.js`

These modules should not be changed casually. For work touching them:

1. Keep the requested scope tight.
2. Avoid rewriting flows that operators or users already depend on unless explicitly required.
3. Preserve privacy boundaries on public pages and public APIs.
4. Prefer incremental edits over broad refactors.

## Stable Project Constraints

### Business Constraints

- Public-facing pages must avoid exposing private user data.
- Admin workflows should favor operational efficiency and avoid breaking existing operator habits without a clear task requirement.
- Changes related to transport orders, groups, and public board behavior should preserve the current business flow unless the task explicitly requires a process change.
- Do not lightly change transport order grouping logic, public board field exposure, payment-email behavior, or admin request/group workflows.
- Do not casually repurpose `transport-admin.js`, `transport-api.js`, `transport-shared.js`, or `api/_lib/transport.js`; they are core integration points.

### Deployment Constraints

- Assume deployment remains on Vercel.
- Be cautious with serverless function count, route sprawl, and cron weight.
- Any deployment-affecting change should consider `vercel.json`, Vercel local emulation, and existing public API dispatch structure.
- Before any Vercel deployment, push the latest intended code to GitHub first; do not deploy to Vercel from an unpushed local-only state unless the user explicitly overrides this rule.

### Documentation Constraints

- `AGENTS.md` is for durable rules only.
- `docs/current-status.md` is the canonical per-task handoff and status file.
- Avoid duplicating the same status details in multiple documents unless there is a durable reason.
- At the start of each new task, both files must be read together: `AGENTS.md` for durable rules, `docs/current-status.md` for the current handoff snapshot.
- Only update `AGENTS.md` when the current task produces a new long-term rule, constraint, workflow, directory note, run method, or acceptance standard that should persist across future sessions.

## Local Run Commands

- Install deps: `npm install`
- Local helper server: `npm run dev`
- Vercel local emulation: `npm run dev:vercel`
- Smoke QA: `npm run qa:playwright:smoke`
- Transport flow QA: `npm run qa:playwright:transport-flow`
- Preview build: `npm run build:preview`
- Production build: `npm run build:prod`
- Preview deploy: `npm run deploy:preview`
- Production deploy: `npm run deploy:prod`

## Task Close-Out Requirement

Every completed task must update `E:\webside\docs\current-status.md` explicitly:

1. Replace or refresh the relevant sections to reflect the newest truth.
2. Record what was completed in the current task.
3. Record the current project state after the change.
4. Record unresolved issues, risks, or follow-up items.
5. Record the recommended next step for the next session.
6. Do not append raw chronological logs if a section can be rewritten more cleanly.
7. If any note is outdated, superseded, or duplicated, rewrite or remove the old note instead of adding another layer of history.

## Acceptance Baseline

Before considering a task complete, verify as applicable:

1. The requested change is implemented without unrelated business-code churn.
2. Relevant local commands still match the repo's expected workflow.
3. If behavior changed, run the narrowest meaningful verification available.
4. Update `docs/current-status.md` with:
   - completed work
   - current project status
   - open issues or risks
   - recommended next steps
5. Keep documentation concise, readable, and non-repetitive.
