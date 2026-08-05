# Authentication Implementation Plan

## Objective

Add internal email-and-password authentication to the Ads Reporting Dashboard using Supabase Auth, while keeping the existing reporting data and unrelated Supabase objects unchanged.

## Strict Supabase Change Boundary

The only new database table permitted is:

```text
public.ad_automation_report_users
```

Do not alter, replace, or delete:

- Any existing application table, view, function, trigger, policy, or data.
- Any Supabase-managed schema, including `auth`, `storage`, `realtime`, `vault`, or `supabase_migrations`.
- The structure or contents of `auth.users` directly.

Supabase Auth remains responsible for email addresses, password hashes, sessions, and identity management. The custom table stores application-specific user information only.

## Proposed Table

```sql
create table public.ad_automation_report_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'viewer'
    check (
      role in (
        'admin',
        'paid_media_specialist',
        'approver',
        'project_manager',
        'viewer'
      )
    ),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Passwords must never be stored in this table.

## Implementation Sequence

1. Confirm the exact Supabase project reference with the user.
2. Connect through Supabase's authorized login flow or use Doppler-provided server credentials without printing their values.
3. Perform a read-only check for `public.ad_automation_report_users`.
4. Stop if a table with that name already exists and report its columns without changing it.
5. Present the final SQL to the user before execution.
6. After explicit approval, create only `public.ad_automation_report_users`.
7. Verify that the table exists and that no unrelated schema objects changed.
8. Enable email/password authentication through Supabase Auth without OAuth.
9. Connect the existing login form to Supabase sign-in.
10. On successful login, confirm that the authenticated user's ID has an active row in `public.ad_automation_report_users`.
11. Redirect authenticated users to `/dashboard`.
12. Redirect unauthenticated users to `/`.
13. Add logout and session-expiry handling.

## User Provisioning

For the first internal version:

- Disable public self-registration.
- Create or invite users through the Supabase dashboard.
- Add the matching profile row to `public.ad_automation_report_users` manually or through a server-only administrative action.
- Do not add a trigger to the managed `auth.users` table unless separately approved later.

## Application Environment Variables

Browser-safe variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Server-only variables:

```text
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
SUPABASE_SECRET
```

Server-only values must never be imported into client components or returned by an API response.

## Application Components

- Supabase browser client for sign-in and sign-out.
- Supabase server client for secure session validation.
- Login form submission and error states.
- Route protection for reporting pages.
- Active-user check against `public.ad_automation_report_users`.
- Logout control.
- Middleware or server-side guards to prevent protected-page rendering before session validation.

## Access Rules

- A valid Supabase Auth session alone is not sufficient.
- The corresponding application profile must exist.
- `is_active` must be `true`.
- Role values are used for future authorization but do not initially change report access unless separately specified.
- User roles and active status may only be changed through trusted server-side administration.

## Verification

- Valid active user can sign in and reach `/dashboard`.
- Invalid credentials show a safe error without revealing whether an email exists.
- Authenticated user without an application-profile row is denied access.
- Inactive user is denied access.
- Unauthenticated requests to protected pages return to the login page.
- Logout clears the session and returns to `/`.
- Refreshing a protected page preserves a valid session.
- No OAuth provider is shown or invoked.
- No unrelated Supabase table or managed schema is modified.
- Typecheck and lint pass.

## Explicitly Out of Scope

- Google or other OAuth providers.
- Public registration.
- Password storage outside Supabase Auth.
- Modification of any existing Supabase table.
- New database tables other than `public.ad_automation_report_users`.
- Changes to Supabase-managed schema definitions.
