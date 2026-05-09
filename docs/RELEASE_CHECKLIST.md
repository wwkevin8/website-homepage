# Release Checklist

Use this checklist before preview or production releases. Keep notes concise and update the rollback/incident sections when needed.

## Release Summary

| Field | Value |
| --- | --- |
| Release date | |
| Release owner | |
| Branch/commit | |
| Preview URL | |
| Production URL | |
| Main change summary | |
| Database migration required? | Yes / No |
| Environment variable change required? | Yes / No |
| Email behavior changed? | Yes / No |
| Public pages changed? | Yes / No |
| Admin pages changed? | Yes / No |

## Local Test Checklist

| Check | Result | Notes |
| --- | --- | --- |
| `npm install` completed when dependencies changed | Not needed / Pass / Fail | |
| `npm audit` run after dependency changes | Not needed / Pass / Fail | |
| `npm run dev` starts local helper server | Pass / Fail | |
| `npm run dev:vercel` starts Vercel local emulation when API behavior changed | Not needed / Pass / Fail | |
| `npm run qa:playwright:smoke` | Not run / Pass / Fail | |
| `npm run qa:playwright:transport-flow` for transport changes | Not run / Pass / Fail | |
| Affected pages load without console-blocking errors | Pass / Fail | |
| No unrelated HTML/CSS/JS/API/SQL/config files changed | Pass / Fail | |

## Mobile Test Checklist

| Area | Check | Result | Notes |
| --- | --- | --- | --- |
| Public navigation | Header/menu usable on narrow screens | Not needed / Pass / Fail | |
| Service center | Main service links usable | Not needed / Pass / Fail | |
| Pickup/transport form | Inputs, date/time, passenger/luggage fields usable | Not needed / Pass / Fail | |
| Storage booking | Form sections and submission controls usable | Not needed / Pass / Fail | |
| Transport board | Cards/table/list fit without private data leakage | Not needed / Pass / Fail | |
| Login/profile | Auth flow usable on mobile | Not needed / Pass / Fail | |
| Admin pages | Critical admin action still possible on supported viewport | Not needed / Pass / Fail | |

## API Test Checklist

| API Area | Check | Result | Notes |
| --- | --- | --- | --- |
| Public API | Public responses expose only safe fields | Not needed / Pass / Fail | |
| User auth API | Login/session/logout behavior verified | Not needed / Pass / Fail | |
| Admin API | Unauthenticated requests rejected | Not needed / Pass / Fail | |
| Admin API | Authorized role can access expected action | Not needed / Pass / Fail | |
| Admin API | Unauthorized role is blocked from restricted action | Not needed / Pass / Fail | |
| Transport requests | Create/list/update/export behavior verified when changed | Not needed / Pass / Fail | |
| Transport groups | Member/group lifecycle verified when changed | Not needed / Pass / Fail | |
| Storage orders | Submit/list/detail/update behavior verified when changed | Not needed / Pass / Fail | |
| Cron routes | Require `CRON_SECRET` and run expected task | Not needed / Pass / Fail | |
| Email/webhook | Notification path tested or explicitly deferred | Not needed / Pass / Fail | |

## Admin Backend Test Checklist

| Admin Area | Check | Result | Notes |
| --- | --- | --- | --- |
| Admin login | Login succeeds with valid admin | Not needed / Pass / Fail | |
| Admin session | Same-tab page switches keep session | Not needed / Pass / Fail | |
| Dashboard | Counts/cards load | Not needed / Pass / Fail | |
| Orders | List/detail/update path works | Not needed / Pass / Fail | |
| Storage | List/detail/update path works | Not needed / Pass / Fail | |
| Users | User list/profile admin actions work | Not needed / Pass / Fail | |
| Managers | Super-admin-only manager actions protected | Not needed / Pass / Fail | |
| Transport requests | List/create/edit/export works | Not needed / Pass / Fail | |
| Transport groups | List/create/edit/member management works | Not needed / Pass / Fail | |
| Sync logs | Audit log page loads | Not needed / Pass / Fail | |

## Production Smoke Test Checklist

Run after deployment to production.

| Check | Result | Notes |
| --- | --- | --- |
| Production homepage loads | Pass / Fail | |
| Public service pages load | Pass / Fail | |
| Public transport board loads and hides private data | Pass / Fail | |
| User login/session check works | Not needed / Pass / Fail | |
| One controlled user form submission works, if release touches forms | Not needed / Pass / Fail | |
| Admin login works | Not needed / Pass / Fail | |
| Admin dashboard loads | Not needed / Pass / Fail | |
| Affected admin workflow works | Not needed / Pass / Fail | |
| Affected API returns expected status/body | Not needed / Pass / Fail | |
| Email/webhook behavior checked if changed | Not needed / Pass / Fail | |
| Vercel Function Logs checked for new errors | Pass / Fail | |
| Rollback plan confirmed before closing release | Pass / Fail | |

## Deployment Rules

- Push the latest intended code to GitHub before Vercel deployment unless the user explicitly overrides this rule.
- Confirm required environment variables exist in the target Vercel environment before deploy.
- For database changes, confirm SQL/migrations have been applied to the intended Supabase project before relying on new schema.
- Do not deploy from a local-only state when production behavior depends on unpushed code.

## Rollback Record

| Field | Value |
| --- | --- |
| Rollback needed? | Yes / No |
| Rollback decision time | |
| Trigger | |
| Target previous deployment/commit | |
| Database rollback needed? | Yes / No |
| Environment rollback needed? | Yes / No |
| Person confirming rollback | |
| Rollback completed time | |
| Post-rollback verification | |

## Incident Record Template

| Field | Value |
| --- | --- |
| Incident date/time | |
| Detected by | |
| Affected users/pages/APIs | |
| Severity | Low / Medium / High / Critical |
| Symptoms | |
| Suspected cause | |
| Immediate mitigation | |
| Final fix | |
| Data exposure risk? | Yes / No / Unknown |
| Customer communication needed? | Yes / No |
| Follow-up tasks | |
| Owner | |

## Release Close-Out

| Check | Result | Notes |
| --- | --- | --- |
| `docs/current-status.md` updated | Pass / Fail | |
| `docs/PROJECT_MAP.md` updated if inventory changed | Not needed / Pass / Fail | |
| Open risks documented | Pass / Fail | |
| Recommended next step documented | Pass / Fail | |
