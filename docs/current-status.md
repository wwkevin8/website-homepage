# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending raw session logs.

## Last Updated Task

- Date: 2026-05-26
- Scope: Corrective Production redeploy for the 2.0 NGN admin carpool group management / dispatch workbench filters. The previous live bundle did not include the group `validity` and `service_time` filter UI; `https://ngn.best/admin/transport/groups` now references a bundle that includes them. No database schema, production data, order rows, group rows, email behavior, payment behavior, import behavior, public page behavior, or deployment configuration was changed.

## Latest Completed Work

- Confirmed the reported online issue:
  - Before the corrective redeploy, `https://ngn.best/admin/transport/groups` referenced `/admin/assets/index-CDuY8suu.js`.
  - That live bundle did not contain `validity`, `service_time_asc`, or `service_time_desc`.

- Redeployed from `E:\webside-request-status-hotfix` / branch `codex/transport-request-status-hotfix`:
  - Source commit: `a88b1f1` (`Fix transport request active default`).
  - This branch already includes the earlier carpool group filter commits.
  - The Vercel project link was confirmed as project `webside`.

- Production deployment:
  - Vercel deployment: `dpl_9jFbW94ciQrBGkabySQ3um1LLuwk`
  - Production URL: `https://webside-icdlqywqy-wwkevin8s-projects.vercel.app`
  - Alias: `https://ngn.best`
  - Production state: `READY`

## Verification

- `node --check api/transport-groups/index.js` passed.
- `git diff --check` passed before deployment.
- `npm --prefix apps/admin-vue run build` passed with only the existing Vite chunk-size warning.
- Vercel Production build passed and output:
  - `/admin/assets/index-BZBBcT1l.js`
  - `/admin/assets/index-DfE4uMCS.css`
- Vercel inspect confirmed deployment `dpl_9jFbW94ciQrBGkabySQ3um1LLuwk` is Ready and aliased to:
  - `https://ngn.best`
  - `https://www.ngn.best`
- Production static verification confirmed:
  - `https://ngn.best/admin/transport/groups` returns 200.
  - The page now references `/admin/assets/index-BZBBcT1l.js`.
  - The production bundle contains `validity`, `service_time_asc`, `service_time_desc`, and default `validity:"active"` logic.

## Current Project State

- Admin Vue source is the canonical admin UI source; `npm --prefix apps/admin-vue run build` refreshes the served `admin/` bundle.
- The online carpool group management / dispatch workbench should now show:
  - `有效性筛选`: `有效单` / `无效单` / `全部`
  - `时间排序`: `从最近到最远` / `从最远到最近`
- The online carpool group list defaults to `validity=active` and `sort=service_time_asc`.
- No test data was uploaded and no production data was modified.

## Open Risks / Follow-Up

- If an operator still sees the old layout, force-refresh the admin tab because the prior page instance was loaded from the old `index-CDuY8suu.js` bundle.
- `/api/transport-groups` defaults omitted `validity` to active groups. Callers that need historical groups must send `validity=all` or `validity=invalid`.
