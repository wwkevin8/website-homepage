# Regression Checklist

Use this checklist before every commit, Preview deployment, or Production deployment. This project is in a regression-stability phase: do not add features while this checklist is red.

## Required Command

- Run `node scripts/regression-check.js`.
- Save or paste the command result into the handoff/release note for the commit.

## Transport Requests

- Default view shows active/valid orders.
- Default sort is arrival/departure/service time from nearest to farthest.
- Order status filter exists.
- Itinerary address column exists.
- Offline-recorded state is visible.
- Offline-recorded button can mark recorded and switch back to unrecorded.
- Detail page layout is not broken.
- Detail page must not show an `操作区` section.
- Do not add an order-owner filter unless explicitly requested.

## Transport Groups

- Default view shows active/valid groups.
- Default sort is service time from nearest to farthest.
- Join-carpool preview and submit do not error.
- Full carpool detail/list view is not obviously slow.
- Empty groups and old test groups must not reappear on public or admin views.

## Storage Workbench

- Recorded/unrecorded button mode exists.
- Filters for unrecorded, unpaid, today, next 7 days, buy box, storage collection, storage return, and valid orders exist or are explicitly verified.
- Buy-box detail delivery fields remain editable.
- Buy-box detail box count remains editable.
- Buy-box fee summary shows how many boxes are included.
- Buy-box detail links to related storage orders where applicable.
- Internal notes and operation logs use Chinese operator-facing labels.
- Detail pages must not show an `操作区` section.

## Data And Release Safety

- Do not upload test data before deployment.
- Do not modify production data during regression checks.
- Do not deploy uncommitted local changes unless explicitly approved for that task.
- Do not include local-only seed or clear scripts in production commits.
- Confirm GitHub is updated before any Vercel deployment.
