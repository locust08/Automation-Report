# Authentication Setup

Source reviewed 2026-11-12 against `lib/auth`, the auth route handlers and `proxy.ts`. This describes the source contract; production credentials, profile schema and end-to-end sign-in were not checked by this documentation review.

## Overview

The application uses Supabase Auth for normal email/password and Google sign-in, then issues its own signed JWT session cookie. Requests evaluated by `getCurrentAuthSession()` recheck the application profile so inactive users or invalid roles lose access even if their cookie has not expired. The broad proxy invokes that helper, but it does not require a session on every route.

A legacy table-backed password flow remains available when `SUPABASE_ADS_REPORTING_AUTH_URL` is configured.

## Profile storage modes

| Mode | Configuration and schema expected by source |
| --- | --- |
| Normal email/password | `SUPABASE_URL` supplies `/rest/v1/ad_automation_report_users`; profile fields are `id`, `full_name`, `role`, `is_active`. The ID matches the Supabase Auth user. |
| Legacy email/password | Explicit `SUPABASE_ADS_REPORTING_AUTH_URL`; fields include `user_id`, `email`, `password_hash`, `full_name`, `role`, `is_active`. Passwords use bcrypt. |
| Google callback | Uses `getAuthTableUrl()` but always reads/writes the legacy-shaped `user_id`, `email`, `password_hash` profile. New organization users receive role `user`. |

The Google callback and normal password flow expect different profile column shapes. Pointing Google login at an `id`-only normal profile table is not established as compatible by this source review. Confirm the configured mode/schema before enabling Google login; adding OAuth credentials alone does not prove that provisioning and subsequent session validation work. The original [authentication plan](auth-implementation-plan.md) describes the normal profile table only.

## Sign-in flows

### Email and password

`POST /api/auth/login`:

1. Validates the email, password, organization allowlist, and login rate limit.
2. Authenticates through Supabase Auth (`/auth/v1/token?grant_type=password`).
3. Loads the matching application profile and checks `is_active` and `role`.
4. Creates an HS256 JWT and stores it in the `ads_reporting_session` cookie.

The legacy mode instead reads a bcrypt password hash from the configured reporting-user table.

### Google OAuth

`/api/auth/google` starts OAuth and creates a short-lived state cookie. `/api/auth/google/callback` validates the state, exchanges the authorization code, verifies the Google identity through Supabase, provisions or loads the reporting profile, and issues the same application session cookie.

Only email addresses accepted by `lib/auth/allowed-email.ts` may sign in: `locus-t.com.my` and `digitalbee.ai`. Google also requires a verified email and matching Supabase identity. Configure the Google login redirect URI as `<AUTH_APP_BASE_URL>/api/auth/google/callback` and the Supabase Google provider for the intended environment. OAuth state expires after ten minutes; successful Google login issues the 30-day application cookie.

## Session cookie

Session logic lives in `lib/auth/session.ts`.

- Cookie name: `ads_reporting_session`
- Format: signed HS256 JWT
- Normal lifetime: 12 hours
- Remember-me lifetime: 30 days
- Cookie flags: `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production
- JWT issuer: `ads-reporting`
- JWT audience: `ads-reporting-web`

The signing secret comes from `ADS_REPORTING_JWT_SECRET`, with `JWT_SECRET` supported as a fallback. It must contain at least 32 characters.

## Current-session validation

`lib/auth/current-session.ts` performs the complete validation:

1. Verify the JWT signature, issuer, audience, expiry, subject, email, and role.
2. Fetch the current application profile from Supabase.
3. Reject missing or inactive profiles.
4. Reject unknown roles.
5. Replace the JWT's name and role with the latest database values.

Server Components and route handlers normally call `getServerAuthSession()` from `lib/auth/server-session.ts`.

## Roles

Roles are defined in `lib/auth/roles.ts`:

| Role | Label |
| --- | --- |
| `user` | User |
| `pms` | Paid Media Specialist |
| `co` | Campaign Optimizer |
| `specialist` | Specialist |
| `approver` | Approver |
| `tl` | Team Lead |
| `pm` | Project Manager |
| `admin` | Administrator |

Feature-specific capabilities are enforced separately, including in `lib/auth/permissions.ts`, `lib/change-control/permissions.ts`, and `lib/ads-edit/permissions.ts`.

## Route protection

`proxy.ts` provides broad request-level protection:

- Unauthenticated visitors are redirected from the `/dashboard`, `/billing`, `/search-term-optimization`, `/user-management`, `/manage`, `/campaigns` and `/api/campaign-planning` prefixes.
- Authenticated users are redirected from the login page to `/dashboard`.
- `/user-management` is restricted to administrators.
- The basic `user` role is restricted to the allowlist in `lib/auth/access.ts`.
- A signed-in basic `user` role receives HTTP `403` for API requests outside its allowlist. This is not a universal unauthenticated API rule: for example, the unauthenticated `/api/campaign-planning` prefix redirects to `/`.

Other pages and API routes may perform their own authorization with `getServerAuthSession()`, normally returning `401` or `403` in guarded APIs. Reporting and Meta CSV endpoints include handlers without their own session guard. Inspect the actual route before assuming login is required; the proxy's presence alone does not establish blanket protection.

## User management

Administrators manage accounts through `/user-management`. In normal mode, `lib/auth/users.ts` creates Supabase Auth users and stores application profile fields. In legacy mode it creates table-backed users with bcrypt hashes. Both modes support role/active-status updates and password resets through their respective paths. Normal-mode user management requires `SUPABASE_SERVICE_ROLE_KEY` specifically.

Application profile data includes:

- User ID
- Full name
- Role
- Active/inactive status

## Development bypass

Local development can set `DEV_AUTH_BYPASS=true`. Outside production this returns a synthetic administrator session without reading a cookie. Some database-backed workflows also require `DEV_AUTH_BYPASS_ACTOR_ID` to point to a real active administrator record.

Never enable the bypass in production.

## Environment variables

Core configuration:

```env
ADS_REPORTING_JWT_SECRET=
AUTH_APP_BASE_URL=
AUTH_UPSTREAM_TIMEOUT_MS=

SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GOOGLE_LOGIN_CLIENT_ID=
GOOGLE_LOGIN_CLIENT_SECRET=

DEV_AUTH_BYPASS=false
DEV_AUTH_BYPASS_ACTOR_ID=
```

Supported aliases include `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, and `JWT_SECRET`. The normal profile-table URL builder reads `SUPABASE_URL` specifically, so `NEXT_PUBLIC_SUPABASE_URL` alone is insufficient for that mode. `AUTH_UPSTREAM_TIMEOUT_MS` defaults to 8000 ms for the bounded auth-upstream helper; the Google callback has separate fetch calls.

Legacy authentication additionally uses:

```env
SUPABASE_ADS_REPORTING_AUTH_URL=
```

## Key files

- `app/api/auth/login/route.ts` — email/password login
- `app/api/auth/google/route.ts` — OAuth start
- `app/api/auth/google/callback/route.ts` — OAuth callback
- `app/api/auth/logout/route.ts` — logout and cookie clearing
- `app/api/auth/session/route.ts` — current browser session
- `lib/auth/config.ts` — Supabase configuration and aliases
- `lib/auth/session.ts` — JWT and cookie contract
- `lib/auth/current-session.ts` — live profile validation
- `lib/auth/server-session.ts` — server-side session reader
- `lib/auth/roles.ts` — role definitions
- `lib/auth/users.ts` — administrator user management
- `proxy.ts` — broad route protection
