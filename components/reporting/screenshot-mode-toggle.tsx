"use client";

import { useCallback, useEffect, useState } from "react";
import { CameraIcon, DownloadIcon, LoaderCircleIcon, Maximize2Icon, Minimize2Icon } from "lucide-react";
import { toPng } from "html-to-image";

import { Button } from "@/components/ui/button";
import { useScreenshotMode } from "@/components/reporting/use-screenshot-mode";

export function ScreenshotModeToggle() {
  const { screenshotMode, setScreenshotMode, toggleScreenshotMode } = useScreenshotMode();
  const [downloadPending, setDownloadPending] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const runDownload = useCallback(async () => {
    const root = document.querySelector<HTMLElement>("[data-report-capture-root='true']");
    if (!root) {
      return;
    }

    setDownloading(true);
    try {
      const dataUrl = await toPng(root, {
        cacheBust: true,
        backgroundColor: "#f0f0f0",
        pixelRatio: Math.max(2, window.devicePixelRatio || 1),
      });

      const link = document.createElement("a");
      link.download = buildPngFileName();
      link.href = dataUrl;
      link.click();
    } finally {
      setDownloading(false);
    }
  }, []);

  useEffect(() => {
    if (!downloadPending || !screenshotMode) {
      return;
    }

    const timer = window.setTimeout(() => {
      void runDownload().finally(() => setDownloadPending(false));
    }, 220);

    return () => window.clearTimeout(timer);
  }, [downloadPending, runDownload, screenshotMode]);

  async function handleDownloadPng() {
    if (downloading || downloadPending) {
      return;
    }

    if (!screenshotMode) {
      setDownloadPending(true);
      setScreenshotMode(true);
      return;
    }

    await runDownload();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white">
      <p className="text-xs md:text-sm">
        <CameraIcon className="mr-1 inline size-4 align-text-bottom" />
        Screenshot mode shows full table rows for one clear full-page capture.
      </p>
      <Button
        type="button"
        variant="outline"
        className="h-8 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
        onClick={toggleScreenshotMode}
        disabled={downloading || downloadPending}
      >
        {screenshotMode ? <Minimize2Icon data-icon="inline-start" /> : <Maximize2Icon data-icon="inline-start" />}
        {screenshotMode ? "Exit Screenshot Mode" : "Enable Screenshot Mode"}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-8 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
        onClick={() => void handleDownloadPng()}
        disabled={downloading || downloadPending}
      >
        {downloading || downloadPending ? (
          <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
        ) : (
          <DownloadIcon data-icon="inline-start" />
        )}
        Download PNG
      </Button>
    </div>
  );
}

function buildPngFileName(): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(
    now.getMinutes()
  ).padStart(2, "0")}`;
  return `report_${stamp}.png`;
}
