const DEFAULT_AUTH_UPSTREAM_TIMEOUT_MS = 8_000;

export class AuthUpstreamTimeoutError extends Error {
  constructor() {
    super("Authentication service timed out.");
    this.name = "AuthUpstreamTimeoutError";
  }
}

export async function fetchAuthUpstream(input: string | URL | Request, init: RequestInit = {}) {
  const timeoutMs = authUpstreamTimeoutMs();

  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) throw new AuthUpstreamTimeoutError();
    throw error;
  }
}

export function isAuthUpstreamTimeoutError(error: unknown): error is AuthUpstreamTimeoutError {
  return error instanceof AuthUpstreamTimeoutError;
}

function authUpstreamTimeoutMs() {
  const configured = Number(process.env.AUTH_UPSTREAM_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_AUTH_UPSTREAM_TIMEOUT_MS;
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && (
    error.name === "TimeoutError"
    || error.name === "AbortError"
    || "code" in error && error.code === "UND_ERR_HEADERS_TIMEOUT"
  );
}
