# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-04-22
- Scope: pushed the current local admin transport fixes and deployment-rule updates to GitHub

## Completed In This Task

- Re-read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before continuing.
- Pushed branch `codex/full-sync` to GitHub remote `origin`.
- Current pushed commit on that branch is `d786eb4` (`Fix admin transport workflows and sync deployment rule`).
- The pushed branch includes the recent admin transport fixes, export alignment, join-text cleanup, group count fix, and the durable deployment rule in [AGENTS.md](E:\webside\AGENTS.md).

## Current Project Status

- Local admin login is working and establishes an admin session correctly.
- Public transport board and pickup public APIs are returning `200 JSON` again after the controlled dependency restoration.
- The project now has an explicit deployment workflow rule: GitHub push first, then Vercel deployment.
- The admin request list page currently shows these leading columns in order:
  - `提交时间`
  - `Order No`
  - `学生`
  - `微信号`
- The `行李数` column has been removed from both the admin request table and the Excel export.
- The local Excel export endpoint is reachable and returns a valid `.xlsx` file whose column order matches the current page table layout.
- The admin transport groups page count mismatch is now resolved at the API layer.
- The previously stale group `GRP-260413-022B` is no longer active and should no longer pollute active-group counts.

## Open Issues Or Risks

- Some public join-related handlers still contain garbled text on non-evaluation branches, especially in:
  - `E:\webside\public-api-handlers\transport-join-preview.js`
  - `E:\webside\public-api-handlers\transport-join-submit.js`
- Local checks have previously shown `EADDRINUSE` noise on port `3000`, which suggests another local server instance may sometimes already be running during verification.
- Admin-side business pages have been fixed incrementally; broad end-to-end admin regression testing is still incomplete.

## Recommended Next Steps

1. Before the next Vercel deployment, make sure the intended code is pushed to GitHub first.
2. If the next step is deployment, deploy from the GitHub-backed state that now includes commit `d786eb4`.
3. Run `git status` before the next task so the current working tree is explicit.
4. If more public-page mojibake is reported, continue with tight-scope text-only fixes in the affected join handlers instead of broad rewrites.
