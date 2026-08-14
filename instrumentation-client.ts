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

if (projectToken && host) {
  posthog.init(projectToken, {
    api_host: host,
    debug: process.env.NODE_ENV === "development",
    defaults: "2026-05-30",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    person_profiles: "identified_only",
    capture_exceptions: false,
    mask_all_text: true,
    mask_all_element_attributes: true,
  });

  void fetch("/api/auth/session", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return;

      const { user } = (await response.json()) as {
        user?: { id?: unknown; role?: unknown };
      };
      if (typeof user?.id !== "string" || !user.id) return;

      posthog.identify(user.id, {
        ...(typeof user.role === "string" ? { role: user.role } : {}),
      });
    })
    .catch(() => undefined);
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
