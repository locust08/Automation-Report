"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CameraIcon,
  ChevronDownIcon,
  DownloadIcon,
  FileImageIcon,
  FileTextIcon,
  LoaderCircleIcon,
  Maximize2Icon,
  Minimize2Icon,
} from "lucide-react";
import { toPng } from "html-to-image";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useScreenshotMode } from "@/components/reporting/use-screenshot-mode";

type DownloadFormat = "png" | "pdf";

export function ScreenshotModeToggle() {
  const { screenshotMode, setScreenshotMode, toggleScreenshotMode } = useScreenshotMode();
  const [queuedFormat, setQueuedFormat] = useState<DownloadFormat | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<DownloadFormat | null>(null);

  const runDownload = useCallback(async (format: DownloadFormat) => {
    const root = document.querySelector<HTMLElement>("[data-report-capture-root='true']");
    if (!root) {
      return;
    }

    setDownloadingFormat(format);
    try {
      const dataUrl = await toPng(root, {
        cacheBust: true,
        backgroundColor: "#f0f0f0",
        pixelRatio: Math.max(2, window.devicePixelRatio || 1),
      });

      if (format === "pdf") {
        await downloadPdf(root, dataUrl);
        return;
      }

      downloadFile(dataUrl, buildFileName("png"));
    } finally {
      setDownloadingFormat(null);
    }
  }, []);

  useEffect(() => {
    if (!queuedFormat || !screenshotMode) {
      return;
    }

    const format = queuedFormat;
    const timer = window.setTimeout(() => {
      void runDownload(format).finally(() => setQueuedFormat(null));
    }, 220);

    return () => window.clearTimeout(timer);
  }, [queuedFormat, runDownload, screenshotMode]);

  async function handleDownload(format: DownloadFormat) {
    if (downloadingFormat || queuedFormat) {
      return;
    }

    if (!screenshotMode) {
      setQueuedFormat(format);
      setScreenshotMode(true);
      return;
    }

    await runDownload(format);
  }

  const currentFormat = downloadingFormat ?? queuedFormat;
  const isBusy = currentFormat !== null;

  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs md:text-sm">
        <CameraIcon className="mr-1 inline size-4 align-text-bottom" />
        Screenshot mode shows full table rows for one clear full-page capture.
      </p>
      <Button
        type="button"
        variant="outline"
        className="h-8 w-full border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white sm:w-auto"
        onClick={toggleScreenshotMode}
        disabled={isBusy}
      >
        {screenshotMode ? <Minimize2Icon data-icon="inline-start" /> : <Maximize2Icon data-icon="inline-start" />}
        {screenshotMode ? "Exit Screenshot Mode" : "Enable Screenshot Mode"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-8 w-full border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white sm:w-auto"
            disabled={isBusy}
          >
            {isBusy ? (
              <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
            ) : (
              <DownloadIcon data-icon="inline-start" />
            )}
            {currentFormat ? `Downloading ${currentFormat.toUpperCase()}` : "Download"}
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem onSelect={() => void handleDownload("png")}>
            <FileImageIcon />
            Download PNG
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void handleDownload("pdf")}>
            <FileTextIcon />
            Download PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

async function downloadPdf(root: HTMLElement, dataUrl: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const orientation = root.scrollWidth > root.scrollHeight ? "landscape" : "portrait";
  const measurementPdf = new jsPDF({ orientation, unit: "px", format: "a4" });
  const image = measurementPdf.getImageProperties(dataUrl);
  const pdf = new jsPDF({
    orientation,
    unit: "px",
    format: [image.width, image.height],
  });

  pdf.addImage(dataUrl, "PNG", 0, 0, image.width, image.height, undefined, "FAST");

  pdf.save(buildFileName("pdf"));
}

function downloadFile(dataUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.download = fileName;
  link.href = dataUrl;
  link.click();
}

function buildFileName(format: DownloadFormat): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(
    now.getMinutes()
  ).padStart(2, "0")}`;
  return `report_${stamp}.${format}`;
}
