import { compare } from "bcryptjs";
import { NextResponse } from "next/server";

import {
  AUTH_COOKIE_NAME,
  createAuthToken,
  REMEMBER_ME_SECONDS,
} from "@/lib/auth/session";

type LoginBody = {
  email?: unknown;
  password?: unknown;
  rememberMe?: unknown;
};

type AuthRow = {
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

    const configuredAuthUrl = process.env.SUPABASE_ADS_REPORTING_AUTH_URL?.trim();
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const secretKey =
      process.env.SUPABASE_SECRET_KEY || serviceRoleKey || process.env.SUPABASE_SECRET;
    const authUrl =
      configuredAuthUrl ||
      (supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/rest/v1/ads_reporting_auth` : "");

    if (!authUrl || !secretKey || !process.env.ADS_REPORTING_JWT_SECRET) {
      return NextResponse.json({ error: "Login is not configured on the server." }, { status: 503 });
    }

    const query = new URL(authUrl);
    query.searchParams.set("select", "user_id,email,password_hash,full_name,role,is_active");
    query.searchParams.set("email", `eq.${email}`);
    query.searchParams.set("limit", "1");

    const headers: Record<string, string> = { apikey: secretKey };
    if (secretKey.startsWith("eyJ")) {
      headers.Authorization = `Bearer ${secretKey}`;
    }

    const databaseResponse = await fetch(query, {
      headers,
      cache: "no-store",
    });

    if (!databaseResponse.ok) {
      console.error("Auth lookup failed with status", databaseResponse.status);
      return NextResponse.json({ error: "Login is temporarily unavailable." }, { status: 503 });
    }

    const [user] = (await databaseResponse.json()) as AuthRow[];
    const passwordMatches = user ? await compare(password, user.password_hash) : false;

    if (!user || !user.is_active || !passwordMatches) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const token = await createAuthToken(
      {
        id: user.user_id,
        email: user.email,
        role: user.role ?? "viewer",
        fullName: user.full_name,
      },
      rememberMe,
    );
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
