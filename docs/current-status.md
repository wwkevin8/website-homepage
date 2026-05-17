# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-17
- Scope: Vue admin read-only list checkpoint

## Latest Completed Work

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before the checkpoint.
- Completed full acceptance of the Vue admin read-only list version.
- Migrated Vue admin pages now covered by the checkpoint:
  - dashboard: `/admin-vue/`;
  - users: `/admin-vue/users`;
  - orders: `/admin-vue/orders`;
  - managers: `/admin-vue/managers`;
  - transport requests: `/admin-vue/transport/requests`;
  - transport groups: `/admin-vue/transport/groups`;
  - transport sync audit logs: `/admin-vue/transport/sync-logs`;
  - storage box orders: `/admin-vue/storage/box-orders`;
  - storage collections: `/admin-vue/storage/collections`;
  - storage returns: `/admin-vue/storage/returns`;
  - memberships readonly: `/admin-vue/memberships`;
  - community readonly: `/admin-vue/community`.
- All old admin pages remain available as rollback entries, including:
  - `admin-dashboard.html`;
  - `admin-orders.html`;
  - `admin-users.html`;
  - `admin-managers.html`;
  - `transport-admin-requests.html`;
  - `transport-admin-groups.html`;
  - `transport-admin-sync-logs.html`;
  - `admin-storage.html`;
  - `admin-memberships.html`;
  - `admin-community.html`.
- No real `DELETE`, `POST`, `PATCH`, export, moderation, payment confirmation, deletion, membership mutation, or other dangerous requests were found in the Vue read-only acceptance pass.
- Checkpoint pre-commit checks completed:
  - `git status` reviewed;
  - `npm run build:admin-vue` passed;
  - `npm run build:prod` passed;
  - intended Vue/admin build files were scanned for secret, token, and cookie patterns with no matches;
  - Vue source scan confirmed no `innerHTML`, `document.querySelector`, or `addEventListener`;
  - Vue source scan confirmed no references to old `admin-pages.js`, `transport-admin.js`, `admin-users.js`, or `admin-orders.js`.
- This checkpoint does not deploy, push, merge, create a PR, add new pages, change APIs, change database schema, change public frontend pages, or implement dangerous operations.

## Current Project State

- New Vue admin remains parallel-only and available through `/admin-vue/` after building.
- Old admin remains the rollback and official legacy operator entry.
- Detailed edit/detail workflows and dangerous operations remain on old admin until explicitly migrated.
- No old admin HTML/JS files were removed or replaced.
- No public frontend pages were intentionally modified.
- No API response structures, database schema, email behavior, or secrets/env files were modified.
- Frontend session state in Vue remains UI-only; backend APIs still enforce authorization server-side.
- The root `admin-vue/` folder is generated build output from `npm run build:admin-vue`.

## Open Issues And Risks

- P2 before opening the storage admin page publicly:
  - page: `admin-storage.html`;
  - issue: `storageTypeLabels is not defined`;
  - impact: storage admin page is not officially open, so this does not affect current live business;
  - requirement: fix before opening storage admin, without re-adding heavy list fields such as `customer_form_json`, `final_readable_message`, or `service_flags_json` to the list API.
- Membership Vue page is intentionally readonly in this phase. Real membership opening, code generation/deletion, benefit registration, operation logs, and entitlement deletion still belong to old admin until explicitly migrated.
- Community Vue page is intentionally readonly in this phase. Real moderation actions such as hide, restore, delete, pin, update expiry, image deletion, comment moderation, and user bans still belong to old admin until explicitly migrated.
- Existing unrelated dirty changes were present before this checkpoint and were not reverted:
  - `admin-api.js`;
  - `admin-managers.html`;
  - `admin-pages.js`;
  - `api/_lib/admin-managers.js`;
  - `api/admin/[...action].js`;
  - deleted `img/hero-consultation-generated.jpg`;
  - deleted `img/hero-consultation-horde.png`.

## Recommended Next Steps

- Next Vue phase should be read-only detail page migration.
- Do not implement real dangerous operations until the corresponding detail/read-only flow is accepted and server-side permission boundaries are reviewed.
- For deployment later, follow the fixed release order: commit and push the intended changes to GitHub first, then deploy to Vercel.
