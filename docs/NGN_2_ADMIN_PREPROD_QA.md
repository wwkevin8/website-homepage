# 2.0 NGN Admin Local Pre-Production QA

Use this checklist before deploying the 2.0 NGN admin changes to Vercel Production. The goal is to catch Vercel runtime, environment, Supabase schema, admin workflow, and public form issues while still on local or Preview-equivalent infrastructure.

## Scope

- Admin surface: `/admin/`, especially `/admin/transport/requests` and transport groups.
- APIs: `api/transport-manual-import/*`, `api/_lib/transport-manual-import.js`, transport request/group APIs used by manual import.
- Public regression check: pickup form submission.
- Environments: local helper server, Vercel CLI preview pull/build/dev, Supabase project `ngn-transport`.

## Required Setup

Run from `E:\webside`.

1. Confirm Git state and do not mix unrelated release work:
   ```powershell
   git status --short
   ```

2. Link and pull Vercel Preview settings:
   ```powershell
   npx --yes vercel@53.1.0 link --yes
   npx --yes vercel@53.1.0 pull --environment=preview --yes
   ```

3. Compare environment variable presence without printing secret values:
   ```powershell
   $files = @(".env", ".vercel\.env.preview.local")
   foreach ($file in $files) {
     "[$file]"
     Get-Content -LiteralPath $file |
       Where-Object { $_ -match "^\s*[^#=]+=" } |
       ForEach-Object { ($_ -split "=", 2)[0].Trim() } |
       Sort-Object -Unique
   }
   ```

4. Before every Vercel build, remove disposable output:
   ```powershell
   $target = Resolve-Path -LiteralPath ".vercel\output" -ErrorAction SilentlyContinue
   if ($target) { Remove-Item -LiteralPath $target.Path -Recurse -Force }
   ```

## Automated Checks

| Check | Command | Expected result |
| --- | --- | --- |
| Admin Vue build | `npm run build:admin-vue` | Build completes and regenerates `admin/` assets |
| Production-safe local build | `npm run build:prod` | `status: ok`, target `production` |
| Vercel Preview build | `npx --yes vercel@53.1.0 build` | `status: ok`, target `preview` |
| Preview API syntax | `node --check api/transport-manual-import/preview.js` | No output, exit 0 |
| Commit API syntax | `node --check api/transport-manual-import/commit.js` | No output, exit 0 |
| Manual API syntax | `node --check api/transport-manual-import/manual.js` | No output, exit 0 |
| Manual import helper syntax | `node --check api/_lib/transport-manual-import.js` | No output, exit 0 |
| Local helper server | `npm run dev` | Starts on port 3000, or existing port 3000 service returns admin page 200 |
| Vercel dev server | `npx --yes vercel@53.1.0 dev --listen 3109` | Starts and serves `/admin/transport/requests` with 200 |
| Admin API auth boundary | POST `/api/transport-manual-import/preview` without admin session | Returns 401 |

## Source Leak And Hardcoding Scan

Run:

```powershell
rg -n -i "localhost|127\.0\.0\.1|https?://|[A-Z]:\\|E:\\|C:\\|test@|example\.com|demo|ADMIN_BOOTSTRAP|PLAYWRIGHT_QA|TRANSPORT_FLOW_TEST" `
  api public-api-handlers apps/admin-vue/src scripts dev-server.js admin-api.js admin-pages.js site-auth.js transport-api.js transport-shared.js transport-admin.js pickup-form.js service-center.js script.js vercel.json package.json `
  -g "!admin/**" -g "!admin-vue/**" -g "!work-log/**" -g "!_inspect_src_zip_2/**" -g "!*.lock"
```

Review every hit. Expected/acceptable hits include local fallback URLs, QA-only generated `example.com` addresses, Resend/Turnstile official endpoints, and script-only QA credentials read from env. Risky hits include production business links hardcoded to a single domain, plaintext account data, Windows absolute paths in source, or test passwords used by production cron/API paths.

## Environment Variables To Confirm

Do not paste secret values into chat, docs, commits, screenshots, or reports. Confirm existence and intended target only.

| Variable area | Required keys | Release expectation |
| --- | --- | --- |
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | Present in local and Vercel Preview/Production; Preview points to the intended project |
| Email | `RESEND_API_KEY`, `AUTH_EMAIL_FROM` | Present where email is expected to send |
| Admin session | `ADMIN_SESSION_SECRET`, `USER_SESSION_SECRET` | Present and non-empty in every deployed environment |
| Site URL | `APP_BASE_URL` or equivalent configured URL | Prefer env-driven value for Preview and Production email links |
| Cron/API secrets | `CRON_SECRET`, Turnstile keys, storage webhook key/URL if active | Present in the environments that exercise those features |
| Bootstrap/smoke admin | `ADMIN_BOOTSTRAP_*`, `ADMIN_PASSWORD`, `ADMIN_ALLOWED_EMAILS` | Confirm intended policy; do not rely on bootstrap variables after real admin accounts exist |

## Supabase Migration Check

The current migration file is `supabase/20260521_transport_manual_import.sql`.

Run a read-only SQL check in Supabase:

```sql
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'transport_requests'
  and column_name in (
    'source',
    'created_by_admin_id',
    'created_by_admin_name',
    'import_batch_id',
    'raw_import_payload',
    'manual_price_gbp',
    'manual_payment_status'
  )
order by column_name;

select conname
from pg_constraint
where conrelid = 'public.transport_requests'::regclass
  and conname in (
    'transport_requests_source_check',
    'transport_requests_manual_payment_status_check'
  )
order by conname;

select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'transport_requests'
  and indexname in (
    'idx_transport_requests_import_batch_id',
    'idx_transport_requests_source_created_at'
  )
order by indexname;
```

Important naming note: the implemented fields are `created_by_admin_id` and `created_by_admin_name`, not a literal `created_by` column.

## Vercel Dev Manual Workflow Tests

Start the Vercel emulator:

```powershell
npx --yes vercel@53.1.0 dev --listen 3109
```

Open `http://localhost:3109/admin/transport/requests` and test with an admin account against approved QA data.

| Workflow | Expected result | Data safety note |
| --- | --- | --- |
| Admin login | Valid admin reaches `/admin/` and session survives page refresh | Use an approved admin/QA account only |
| Pickup order list loads | `/admin/transport/requests` loads rows and filters without console errors | Confirm public-safe fields remain separate from admin-only fields |
| Single manual import without Group ID | Creates a request and auto-creates/assigns a group | Record created order/group IDs for cleanup if using live data |
| Single manual import with existing Group ID | Joins the existing group after backend preview validation | Use a test group, not an active customer group |
| Bulk paste preview | Valid rows show importable/yellow/red states correctly | Do not commit until preview is reviewed |
| CSV/XLSX upload preview | Uploaded file maps headers and parsed fields correctly | Include pickup and dropoff samples |
| Commit importable rows | Red rows are excluded; yellow rows require confirmation; import batch ID is returned | Save the import batch ID for filtering and cleanup |
| Group passenger sync | Group passenger count reflects imported members | Compare group detail and list values |
| Payment status sync | Request and group payment summaries reflect manual payment status | Test paid/unpaid/pending where safe |
| Import batch filter | Filtering by `import_batch_id` returns only the imported batch | Confirm no cross-batch leakage |
| Public pickup form submit | Frontend form can still submit through public API | Use a clearly marked QA user/order |

## Current Run Report

Date: 2026-05-21

| Item | Result | Notes |
| --- | --- | --- |
| `vercel link --yes` | Pass | Linked to `wwkevin8s-projects/webside` |
| `vercel pull --environment=preview --yes` | Pass | Preview env pulled to `.vercel/.env.preview.local`; Vercel reported removed local bootstrap variables from Preview pull |
| API syntax checks | Pass | All four requested files passed `node --check` |
| `npm run build:admin-vue` | Pass | Vite build completed |
| `npm run build:prod` | Pass | Safe production build returned `status: ok` |
| `vercel build` | Pass | Safe Preview build returned `status: ok` |
| `npm run dev` | Blocked by port | Port 3000 was already in use; existing service returned 200 for `/admin/transport/requests` |
| `vercel dev --listen 3109` | Pass | Served `/admin/transport/requests` with 200 |
| Unauthenticated manual preview API | Pass | Returned 401 in Vercel dev |
| Supabase migration fields | Pass | `source`, admin creator fields, import batch, raw payload, manual price, and manual payment status exist |
| Supabase constraints/indexes | Pass | Expected source/payment constraints and import/source indexes exist |
| Source leak scan | Review needed | No Windows absolute source path found; local fallback URLs and QA data are expected; hardcoded `https://ngn.best` email fallbacks should be confirmed before Production |
| Manual mutation workflows | Not run | Requires approved admin credentials and QA data because it creates/imports orders and groups |
| Public pickup form submit | Not run | Requires approved QA submission data |

## High-Risk Points

- Manual import commit mutates `transport_requests`, `transport_groups`, and `transport_group_members`; use dedicated QA records and record cleanup IDs.
- Preview env currently lacks local `ADMIN_BOOTSTRAP_*` and `STORAGE_ORDER_WEBHOOK_URL` keys. Confirm whether this is intentional before Preview/Production release.
- Site URL behavior is partly fallback-based in email helpers. Confirm whether Preview should use a Preview URL and Production should use `https://ngn.best`.
- `api/cron/run-transport-daily-flow-test.js` has a default QA password fallback. Confirm this cron route is protected by `CRON_SECRET` and the default is acceptable, or set `TRANSPORT_FLOW_TEST_PASSWORD`.
- Production deployment should wait until the manual Vercel dev workflows above pass with an approved admin account and QA records.

## Deployment Recommendation

- Preview deployment: recommended after committing/pushing the intended changes, because automated local, Vercel build, auth-boundary, and migration checks passed.
- Production deployment: not recommended yet. First complete the manual Vercel dev workflow tests that create/join groups, import batches, sync payments/passenger counts, and submit the public pickup form.
