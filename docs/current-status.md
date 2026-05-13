# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-13
- Scope: lock GitHub-before-Vercel release rule and sync latest production changes

## Latest Completed Work

- Read `E:\webside\AGENTS.md`, `E:\webside\docs\current-status.md`, and the GitHub publish skill before making changes.
- Added a fixed release-order rule to `E:\webside\AGENTS.md`: GitHub must be updated before any Vercel deployment unless the user explicitly overrides it for a single task.
- Current production deployment remains `dpl_7S4wWFxKU1PRSxJbNYSwmF7MU95r`, aliased to `https://ngn.best`.
- The latest storage/admin changes are being synced back to GitHub so the repository catches up with the already-deployed production state.

## Current Project State

- Storage collection orders display publicly/admin-side as `取寄存订单`; storage return orders display as `送寄存订单`. Underlying `order_type` values remain unchanged.
- Admin storage sidebar currently shows `买箱订单`, `取寄存订单`, and `送寄存订单`; the old `全部寄存订单` entry is intentionally hidden.
- General admin storage lists are compact:
  - `订单编号` remains the main visible order number.
  - `是否买箱` replaces separate buy-box number/date columns; hover shows buy-box number and box delivery date.
  - `取件/自送日期` replaces duplicate intake/start-date columns; hover shows storage end date when available.
  - `预期价格` is shown from stored estimate data when the order has it.
- Buy-box order list still has its dedicated operational columns for delivery tasks.
- Booking form separates `买箱 / 送箱信息` from `寄存 / 入仓信息`, with separate delivery time slot and intake time slot.

## Open Issues Or Risks

- Older storage orders created before estimate totals were saved may still show `--` for `预期价格`; that is expected unless historical data is backfilled.
- No post-login browser check was performed in this deployment task, so the admin table should be visually spot-checked in the logged-in backend.

## Recommended Next Steps

- Refresh the live admin storage list and confirm the `预期价格` column appears for orders with saved estimate totals.
- If operators need prices for old rows that never saved estimate totals, do a separate historical backfill review rather than guessing totals in the list UI.
