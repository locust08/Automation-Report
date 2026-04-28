"use client";

import { useEffect, useState } from "react";

const DEFAULT_READY_DURATION_MS = 950;

export function useReportReadyTransition({
  ready,
  transitionKey,
  durationMs = DEFAULT_READY_DURATION_MS,
}: {
  ready: boolean;
  transitionKey: string | null;
  durationMs?: number;
}) {
  const [completedKey, setCompletedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !transitionKey || completedKey === transitionKey) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCompletedKey(transitionKey);
    }, durationMs);

    return () => window.clearTimeout(timer);
  }, [completedKey, durationMs, ready, transitionKey]);

  return {
    showReadyState: Boolean(ready && transitionKey && completedKey !== transitionKey),
    readyDelayComplete: Boolean(ready && transitionKey && completedKey === transitionKey),
  };
}
