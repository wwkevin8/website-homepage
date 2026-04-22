# First Batch Admin Rollout Checklist

## 1. Database Migration
Apply the database changes from [`supabase/transport_dispatch.sql`](/E:/webside/supabase/transport_dispatch.sql).

Recommended execution steps:

1. Open your Supabase project and enter `SQL Editor`.
2. Confirm you are in the correct environment first.
3. Export or back up the current schema before running changes.
4. Open [`supabase/transport_dispatch.sql`](/E:/webside/supabase/transport_dispatch.sql).
5. Copy the SQL needed for this rollout into Supabase SQL Editor.
6. Run the SQL.
7. Verify in Table Editor or SQL:
   - `site_users` now has `first_login_at`, `last_login_at`, `last_login_provider`, `login_count`
   - `user_login_events` exists
   - indexes for `user_login_events` and `site_users.last_login_at` exist
8. Run one real login and verify:
   - `site_users.first_login_at` is populated on first login
   - `site_users.last_login_at` updates on later login
   - `site_users.last_login_provider` is `google`
   - `site_users.login_count` increases
   - one row is inserted into `user_login_events`
   - `user_login_events.ip` and `user_login_events.user_agent` are populated when available

Suggested rollout order:

1. Apply in local/test Supabase first.
2. Validate with one admin account and one non-admin account.
3. Apply the same SQL in production.

## 2. Environment Variables
Set `ADMIN_ALLOWED_EMAILS` in both local and production.

Format rules:

- Supports multiple emails
- Use a comma `,` as the separator
- Spaces are allowed because the code trims before comparing
- Email comparison is lowercased before matching

Example:

```env
ADMIN_ALLOWED_EMAILS=admin@example.com,ops@example.com, owner@example.com
```

Local:

1. Add `ADMIN_ALLOWED_EMAILS` to your local environment config.
2. Include the email of the account you will use for admin testing.
3. Restart the local app so the new variable is picked up.

Production:

1. Add `ADMIN_ALLOWED_EMAILS` in your hosting platform environment variables.
2. Use the same comma-separated format.
3. Redeploy or refresh the environment after saving.

For this rollout, production should no longer depend on:

- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

## 3. Manual Acceptance by Page
### `/admin-login.html`
- Access prerequisite: none
- Expected result: separate admin entry page, visually distinct from the frontend site pages
- Key checks:
  - unauthenticated user sees admin-specific entry copy
  - login button goes to `login.html`
  - signed-in admin is routed to dashboard
  - signed-in non-admin sees no-access message

### `/admin-dashboard.html`
- Access prerequisite: signed-in admin
- Expected result: dashboard loads inside the shared admin shell
- Key checks:
  - sidebar and header render correctly
  - current admin email is visible
  - summary cards load without errors
  - logout returns to `/admin-login.html`

### `/admin-users.html`
- Access prerequisite: signed-in admin
- Expected result: users table loads in the shared admin shell
- Key checks:
  - search by email or nickname works
  - provider filter works
  - reset returns to default list state
  - empty state renders cleanly if there are no rows
  - first/last login fields render safely for historical users

### `/transport-admin-requests.html`
- Access prerequisite: signed-in admin
- Expected result: requests page loads inside the new admin shell
- Key checks:
  - filters still work
  - list still loads
  - edit links still open request edit pages
  - backend shell does not break request form flow

### `/transport-admin-groups.html`
- Access prerequisite: signed-in admin
- Expected result: groups page loads inside the new admin shell
- Key checks:
  - filters still work
  - list still loads
  - edit links still open group edit pages
  - backend shell does not break member management flow

### `/admin-storage.html`
- Access prerequisite: signed-in admin
- Expected result: placeholder page loads inside the new admin shell
- Key checks:
  - layout is correct
  - navigation highlight is correct
  - page is protected by the same admin guard

## 4. Required Edge Cases
Validate each of these explicitly:

1. Unauthenticated access to any admin page redirects to `login.html` with `return_to`.
2. Logged-in non-admin users cannot enter any admin page.
3. Manually typing an admin URL as a non-admin still does not expose admin content.
4. After admin logout, revisiting an admin page is blocked again.
5. `transport_requests`, `transport_groups`, and `transport_group_members` APIs still work for admins under the new auth model.
6. Non-admin requests to those APIs return `401` or `403`, not business data.
7. Allowlisted admin emails still match when casing differs or whitespace exists around the configured value.
8. Successful sign-in inserts `user_login_events` with `provider`, `login_at`, `ip`, and `user_agent`.
9. Dashboard and users page do not crash for historical users missing the new summary fields.
