# Current Status

## Document Rules

- This file is the cross-session handoff for the latest useful project state.
- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Rewrite sections in place when the truth changes; do not stack raw session history.

## Last Updated Task

- Date: 2026-04-22
- Scope: tightened the pickup homepage mobile hero metrics so the three mini cards stay on one row instead of wrapping

## Completed In This Task

- Re-read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before making changes.
- Kept the edit scope narrow to the pickup homepage hero metrics only.
- Updated `styles-pickup-backup.css` so the mobile `pickup-hero-metrics` block uses a fixed three-column grid.
- Reduced the mobile metric-card padding, radius, and text sizes so `7+`, `1小时`, and `双模式` can stay on one row on small phones.
- Ran `npm run build:prod` successfully.
- Deployed the update to production with `npm run deploy:prod`.
- Verified the production deployment was aliased to `https://ngn.best`.

## Current Project Status

- Production `ngn.best` includes recent public transport-board mobile polish:
  - tighter mobile header
  - smaller page-specific mobile typography
  - clear swipe-right hint with red arrow and animation
  - tighter mobile table width and column sizing so more columns show before horizontal scrolling
  - ultra-small-screen abbreviated table headers so more columns show before horizontal scrolling
- Production public transport-board list rendering is restored after the earlier broken script regression.
- Production public transport-board action buttons remain on one row with `查看详情` on the left and `加入拼车` on the right.
- Production public transport-board action column is wider again, and the buttons now use proportional shrinking instead of fixed-width behavior.
- Production `加入拼车` now uses a light pastel rainbow CTA instead of another deep-blue button, and the animation is softer than the earlier bounce-heavy version.
- Production `ngn.best` pickup page uses smaller mobile-only typography so the hero and content sections expose more information on first view.
- Production `ngn.best` pickup homepage now uses a tighter mobile process-section layout:
  - no oversized stacked hero cards
  - compact two-column step grid for steps 1-4
  - full-width final card for step 5
  - reduced icon, badge, heading, and paragraph sizing on small screens
- Production `ngn.best` pickup homepage hero metrics now stay on one row on mobile for the three mini cards below the contact pills.
- Production public transport-board filtering excludes zero-member stale groups.
- Production transport board group-id search uses the corrected final-result filtering.
- Production default group capacity for new logic paths is `5`, while some older persisted groups may still carry `max_passengers = 6`.
- Production cross-terminal surcharge logic is using the updated rule of `+GBP15 per passenger`.
- Admin production updates already live include:
  - user detail drawer
  - request sorting and Excel export
  - group payment summary and one-click pay-all
  - manager delete flow instead of disable
  - super-admin delete protection
  - self-service admin password change

## Open Issues Or Risks

- The three pickup hero metric cards now stay on one row on mobile, but a quick real-device check is still useful to confirm the smaller labels remain readable on very narrow phones.
- The pickup homepage and pickup process modal now look more aligned on mobile, but another visual pass may still be useful if more hero compaction is requested.
- Existing production groups created before the default-capacity change can still retain persisted `max_passengers = 6` until updated separately.
- The student personal-center page still has wording drift around closed vs expired states because it does not fully reuse the shared status label path.
- The personal-center API still only returns the most recent `10` requests, so older expired orders still fall out of view.
- The admin reset-password flow for other manager accounts still returns a temporary password directly in the UI and does not force a password change on next login.
- The manager create/edit flow still keeps a hidden status value for backend compatibility even though status is no longer exposed in the UI.
- The Excel export remains capped to `5000` matched rows to keep the response bounded.
- The workspace remains broad and has unrelated in-progress changes outside this narrow UI task.

## Recommended Next Steps

1. Hard refresh the public pickup homepage on a real phone and confirm the three mini metric cards now stay on one row comfortably.
2. If the one-row metric cards still feel cramped on very narrow devices, trim only spacing or labels before touching the rest of the hero.
3. Check the public transport board on a very small phone and confirm the current `加入拼车` CTA styling still feels clean enough after the recent visual changes.
4. Decide whether older persisted `6`-seat groups should be migrated to `5` seats in production data.
