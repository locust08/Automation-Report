import { NextResponse } from "next/server";
import { compare } from "bcryptjs";

import {
  AUTH_COOKIE_NAME,
  createAuthToken,
  REMEMBER_ME_SECONDS,
} from "@/lib/auth/session";
import { isAuthRole } from "@/lib/auth/roles";
import { getAuthTableUrl, getSupabaseBaseUrl, getSupabasePublicKey, getSupabaseServerKey } from "@/lib/auth/config";
import { checkLoginRateLimit, clearLoginFailures, getLoginAttemptKey, recordLoginFailure } from "@/lib/auth/login-rate-limit";
import { isAllowedOrganizationEmail } from "@/lib/auth/allowed-email";

type LoginBody = {
  email?: unknown;
  password?: unknown;
  rememberMe?: unknown;
};

type AuthRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  is_active: boolean;
};

type LegacyAuthRow = {
  user_id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  role: string | null;
  is_active: boolean;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginBody;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const rememberMe = body.rememberMe === true;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    if (!isAllowedOrganizationEmail(email)) {
      return NextResponse.json({ error: "You are not in these organizations." }, { status: 403 });
    }

    const attemptKey = getLoginAttemptKey(email, request);
    const rateLimit = checkLoginRateLimit(attemptKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many failed attempts. Try again later.", attemptsRemaining: 0, retryAfterSeconds: rateLimit.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    const legacyAuthUrl = process.env.SUPABASE_ADS_REPORTING_AUTH_URL?.trim();
    if (legacyAuthUrl) {
      const { serviceRoleKey, secretKey } = getSupabaseServerKey();
      if (!secretKey) {
        return NextResponse.json({ error: "Login is not configured on the server." }, { status: 503 });
      }

      const query = new URL(legacyAuthUrl);
      query.searchParams.set("select", "user_id,email,password_hash,full_name,role,is_active");
      query.searchParams.set("email", `eq.${email}`);
      query.searchParams.set("limit", "1");
      const databaseResponse = await fetch(query, {
        headers: {
          apikey: secretKey,
          ...(secretKey === serviceRoleKey ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
        },
        cache: "no-store",
      });

      if (!databaseResponse.ok) {
        console.error("Legacy auth lookup failed:", await databaseResponse.text());
        return NextResponse.json({ error: "Login is temporarily unavailable." }, { status: 503 });
      }

      const [user] = (await databaseResponse.json()) as LegacyAuthRow[];
      const passwordMatches = user ? await compare(password, user.password_hash) : false;
      if (!user || !user.is_active || !passwordMatches) {
        const failure = recordLoginFailure(attemptKey);
        return NextResponse.json(
          {
            error: failure.retryAfterSeconds ? "Too many failed attempts. Try again later." : "Invalid email or password.",
            attemptsRemaining: failure.attemptsRemaining,
            retryAfterSeconds: failure.retryAfterSeconds,
          },
          { status: failure.retryAfterSeconds ? 429 : 401, ...(failure.retryAfterSeconds ? { headers: { "Retry-After": String(failure.retryAfterSeconds) } } : {}) },
        );
      }

      if (!isAuthRole(user.role)) {
        return NextResponse.json({ error: "Your account has not been assigned a valid role." }, { status: 403 });
      }

      const token = await createAuthToken(
        { id: user.user_id, email: user.email, role: user.role, fullName: user.full_name },
        rememberMe,
      );
      clearLoginFailures(attemptKey);
      const response = NextResponse.json({ ok: true });
      response.cookies.set(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        ...(rememberMe ? { maxAge: REMEMBER_ME_SECONDS } : {}),
      });
      return response;
    }

    const authUrl = getAuthTableUrl();
    const supabaseUrl = getSupabaseBaseUrl();
    const publicKey = getSupabasePublicKey();
    const { serviceRoleKey, secretKey } = getSupabaseServerKey();

    if (!authUrl || !supabaseUrl || !publicKey || !secretKey) {
      return NextResponse.json({ error: "Login is not configured on the server." }, { status: 503 });
    }

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publicKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    const authPayload = (await authResponse.json()) as { user?: { id?: string; email?: string }; error_description?: string; msg?: string };
    if (!authResponse.ok || !authPayload.user?.id) {
      const failure = recordLoginFailure(attemptKey);
      return NextResponse.json(
        {
          error: failure.retryAfterSeconds ? "Too many failed attempts. Try again later." : "Invalid email or password.",
          attemptsRemaining: failure.attemptsRemaining,
          retryAfterSeconds: failure.retryAfterSeconds,
        },
        { status: failure.retryAfterSeconds ? 429 : 401, ...(failure.retryAfterSeconds ? { headers: { "Retry-After": String(failure.retryAfterSeconds) } } : {}) },
      );
    }

    const query = new URL(authUrl);
    query.searchParams.set("select", "id,full_name,role,is_active");
    query.searchParams.set("id", `eq.${authPayload.user.id}`);
    query.searchParams.set("limit", "1");

    const headers: Record<string, string> = { apikey: secretKey };

    if (secretKey === serviceRoleKey) {
      headers.Authorization = `Bearer ${serviceRoleKey}`;
    }

    const databaseResponse = await fetch(query, {
      headers,
      cache: "no-store",
    });

    if (!databaseResponse.ok) {
      console.error("Auth lookup failed:", await databaseResponse.text());
      return NextResponse.json({ error: "Login is temporarily unavailable." }, { status: 503 });
    }

    const [user] = (await databaseResponse.json()) as AuthRow[];
    if (!user || !user.is_active) return NextResponse.json({ error: "Your account is inactive or has no application profile." }, { status: 403 });

    if (!isAuthRole(user.role)) {
      return NextResponse.json({ error: "Your account has not been assigned a valid role." }, { status: 403 });
    }

    const token = await createAuthToken(
      {
        id: user.id,
        email: authPayload.user.email || email,
        role: user.role,
        fullName: user.full_name,
      },
      rememberMe,
    );
    clearLoginFailures(attemptKey);
    const response = NextResponse.json({ ok: true });

    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(rememberMe ? { maxAge: REMEMBER_ME_SECONDS } : {}),
    });

    return response;
  } catch (error) {
    console.error("Login failed:", error);
    return NextResponse.json({ error: "Login is temporarily unavailable." }, { status: 500 });
  }
}
