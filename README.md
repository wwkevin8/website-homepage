# webside-transport-dispatch

Static multi-page website with Vercel Serverless API routes for NGN transport, storage, membership, and admin operations.

## Prerequisites

- Node.js 24.x
- Docker Desktop
- Supabase CLI through the project dependency: `npx supabase ...`
- Vercel CLI is pinned by npm scripts and is downloaded through `npx`

## Environment

1. Copy `.env.example` to `.env`.
2. Start local Supabase:

```powershell
npx supabase start
```

3. Copy the local API URL, anon key, and service-role key from `npx supabase status` into:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
LOCAL_SUPABASE_URL
LOCAL_SUPABASE_ANON_KEY
LOCAL_SUPABASE_SERVICE_ROLE_KEY
DOCKER_SUPABASE_URL
```

Use `SUPABASE_URL=http://127.0.0.1:54321` for local runs on the host. `npm run preview` prefers `LOCAL_SUPABASE_*` when present, so it can override any pulled Vercel environment values with the local Supabase stack. Use `DOCKER_SUPABASE_URL=http://host.docker.internal:54321` for Docker compose so the container reaches Supabase running on the host.

Do not put production Supabase keys in the local Docker aliases.

## Local Development

Install dependencies:

```powershell
npm install
npm --prefix apps/admin-vue install
```

Run the lightweight helper server:

```powershell
npm run dev
```

Open `http://localhost:3000`.

## Production-Like Local Preview

Build the generated admin app and run a Vercel build check:

```powershell
npm run build
```

Run the project with Vercel local routing/API emulation:

```powershell
npm run preview
```

Open `http://localhost:3000`.

This preview is closer to the deployed site than `npm run dev` because it performs the production frontend build first, then serves the built admin app together with the static pages and local API routes. Use `npm run build:prod` when you specifically need the Vercel output build check. Local preview is still served over HTTP, so production-only HTTPS cookie behavior and Vercel-managed cron execution are not identical.

## Docker Local Run

Start Supabase first on the host:

```powershell
npx supabase start
npx supabase status
```

Make sure `.env` contains the `LOCAL_SUPABASE_*` values from the local Supabase status output, then start the website/backend container:

```powershell
docker compose up --build web
```

Open `http://localhost:3000`.

The compose file intentionally runs the website/admin/API project and points it at the Supabase CLI stack already managed by Docker Desktop. This keeps Supabase under its own CLI-managed configuration instead of duplicating the entire Supabase service graph by hand.

## Verification Commands

```powershell
npm run build
npm run preview
npm run qa:playwright:smoke
npm run qa:playwright:transport-flow
```

For QA against a running preview, set:

```powershell
$env:PLAYWRIGHT_BASE_URL = "http://localhost:3000"
```

## Local vs Vercel Differences To Watch

- Vercel production runs on HTTPS; local preview usually runs on HTTP.
- Vercel cron jobs are configured in `vercel.json`; they are not automatically scheduled by local preview.
- Hosted Supabase Auth redirect URLs must match the deployed domain; local Supabase uses `supabase/config.toml`.
- Email sending depends on `RESEND_API_KEY` or SMTP variables. Local Supabase auth emails are captured by Inbucket, but application emails still use the configured provider.
- `APP_BASE_URL`, `PUBLIC_SITE_URL`, `SITE_URL`, and storage/admin URLs must be set per environment so email links do not point to `localhost` or the wrong domain.
