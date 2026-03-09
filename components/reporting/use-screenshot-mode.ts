"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useScreenshotMode(): {
  screenshotMode: boolean;
  setScreenshotMode: (enabled: boolean) => void;
  toggleScreenshotMode: () => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const screenshotMode = useMemo(() => {
    const value = searchParams.get("screenshot");
    return value === "1" || value === "true";
  }, [searchParams]);

  const setScreenshotMode = useCallback(
    (enabled: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (enabled) {
        params.set("screenshot", "1");
      } else {
        params.delete("screenshot");
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const toggleScreenshotMode = useCallback(() => {
    setScreenshotMode(!screenshotMode);
  }, [screenshotMode, setScreenshotMode]);

  return {
    screenshotMode,
    setScreenshotMode,
    toggleScreenshotMode,
  };
}
