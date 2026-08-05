import { jwtVerify, SignJWT, type JWTPayload } from "jose";

export const AUTH_COOKIE_NAME = "ads_reporting_session";
export const REMEMBER_ME_SECONDS = 60 * 60 * 24 * 30;
const SESSION_SECONDS = 60 * 60 * 12;

export type AuthSession = JWTPayload & {
  sub: string;
  email: string;
  role: string;
  fullName: string | null;
};

function getJwtSecret() {
  const secret = process.env.ADS_REPORTING_JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("ADS_REPORTING_JWT_SECRET must contain at least 32 characters.");
  }

  return new TextEncoder().encode(secret);
}

export async function createAuthToken(
  user: { id: string; email: string; role: string; fullName: string | null },
  rememberMe: boolean,
) {
  const expiresIn = rememberMe ? REMEMBER_ME_SECONDS : SESSION_SECONDS;

  return new SignJWT({ email: user.email, role: user.role, fullName: user.fullName })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer("ads-reporting")
    .setAudience("ads-reporting-web")
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(getJwtSecret());
}

export async function verifyAuthToken(token: string): Promise<AuthSession | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: "ads-reporting",
      audience: "ads-reporting-web",
    });

    if (
      !payload.sub ||
      typeof payload.email !== "string" ||
      typeof payload.role !== "string" ||
      (payload.fullName !== null && typeof payload.fullName !== "string")
    ) {
      return null;
    }

    return payload as AuthSession;
  } catch {
    return null;
  }
}
