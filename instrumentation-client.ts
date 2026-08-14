import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    tracesSampleRate: 0.05,
    enableLogs: false,
    sendDefaultPii: false,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
  });
}

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (!projectToken || !host) {
  if (process.env.NODE_ENV === "development") {
    const missingVariable = !projectToken
      ? "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN"
      : "NEXT_PUBLIC_POSTHOG_HOST";

    throw new Error(
      `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
    );
  }
} else {
  posthog.init(projectToken, {
    api_host: host,
    defaults: "2026-01-30",
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  });

  void fetch("/api/auth/session", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return;

      const { user } = (await response.json()) as {
        user?: { id?: unknown; email?: unknown; fullName?: unknown; role?: unknown };
      };
      if (typeof user?.id !== "string" || !user.id) return;

      posthog.identify(user.id, {
        ...(typeof user.role === "string" ? { role: user.role } : {}),
      });
    })
    .catch(() => undefined);
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
