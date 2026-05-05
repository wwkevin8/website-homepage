# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-05
- Scope: deployed cache-busting/storage updates to Vercel production

## Completed In This Task

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before analysis.
- Re-read the project rules/status and used the Vercel deployment workflow for this production deploy.
- Confirmed the deployment rule that GitHub must be updated before Vercel production deploy.
- Added `.vercelignore` so temporary/local output is not uploaded with deployments.
- Ran a production Vercel build successfully.
- Committed and pushed the intended deployable changes to `origin/codex/full-sync` at commit `5e98c3c`.
- Deployed the prebuilt production output to Vercel. Deployment `dpl_FmhoqBAGf1oWwSMwm2uBBtKaWxRH` is `READY`.
- Confirmed Vercel aliased the deployment to `https://ngn.best` and `https://www.ngn.best`.
- Verified `https://ngn.best/storage.html` returns 200, includes the `20260505-cache-bust-1` asset version, and returns conservative cache headers.
- Verified `https://ngn.best/api/public/transport-board` returns 200 with `Cache-Control: no-store`.

## Current Project Status

- Project rules explicitly forbid paid, proprietary, subscription-only, or unclear-license fonts; future visual work should use only free commercial-use fonts or safe system font stacks.
- The storage implementation work remains the main tracked product change in the workspace: storage pages, booking flow, admin storage, helper APIs, and the storage SQL migration are still modified.
- The storage estimate page now uses warmer booking-entry buttons and a light rainbow total-price card while preserving existing destinations and calculator behavior.
- Static pages now point at a fresh shared asset version string to force browsers to request updated CSS/JS after deployment.
- Vercel cache headers are configured for conservative freshness on HTML and API responses.
- Production is live on Vercel at `https://ngn.best`; latest deployment URL is `https://webside-awveerjas-wwkevin8s-projects.vercel.app`.
- The workspace is still noisy because `.tmp-dpl-3ReB2SCYt-output/` contains many generated edits and several work-log files are untracked.
- Running the Vercel build pulled local `.vercel` project settings and preview environment files; `.vercel` is already ignored by Git.

## Open Issues Or Risks

- Users who already have an old HTML document open may need to reload once after the new deployment lands.
- Production log scan found Node `[DEP0169] url.parse()` deprecation warnings marked as error-level logs, but the expanded log entries were warnings rather than business endpoint crashes.
- The generated `.tmp-dpl-3ReB2SCYt-output/` tree remains in the working copy and continues to obscure meaningful repo changes.
- The broader storage changes still need browser and backend verification against the running app.
- The storage SQL migration still needs to be applied in the target database environment.
- The earlier transport schema/status-drift risks remain open separately: duplicate prevention is mostly application-side, group/request/member status can drift, and live `create_site_transport_request` differs from repository SQL.

## Recommended Next Steps

1. Apply `supabase/20260503_storage_service_order_types.sql` in the target Supabase environment if it has not already been applied.
2. Run a broader browser verification pass for the production storage booking and admin flows.
3. Replace remaining `url.parse()` usage or dependency paths causing Node `[DEP0169]` warnings so Vercel error-level logs stay clean.
4. Clean up or isolate `.tmp-dpl-3ReB2SCYt-output/` so the real source diff is easier to review.
