"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileImageIcon,
  FileTextIcon,
  LoaderCircleIcon,
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
const PDF_CAPTURE_SCALE = 1.25;

export function ReportDownloadButton() {
  const { screenshotMode, setScreenshotMode } = useScreenshotMode();
  const [queuedFormat, setQueuedFormat] = useState<DownloadFormat | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<DownloadFormat | null>(null);
  const [restoreModeAfterDownload, setRestoreModeAfterDownload] = useState(false);

  const runDownload = useCallback(async (format: DownloadFormat) => {
    const root = document.querySelector<HTMLElement>("[data-report-capture-root='true']");
    if (!root) {
      return;
    }

    setDownloadingFormat(format);
    try {
      const captureScale = format === "pdf" ? PDF_CAPTURE_SCALE : 1;
      const dataUrl = await captureReportPng(root, captureScale);

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
      void runDownload(format).finally(() => {
        setQueuedFormat(null);
        if (restoreModeAfterDownload) {
          setRestoreModeAfterDownload(false);
          setScreenshotMode(false);
        }
      });
    }, 220);

    return () => window.clearTimeout(timer);
  }, [queuedFormat, restoreModeAfterDownload, runDownload, screenshotMode, setScreenshotMode]);

  async function handleDownload(format: DownloadFormat) {
    if (downloadingFormat || queuedFormat) {
      return;
    }

    if (!screenshotMode) {
      setRestoreModeAfterDownload(true);
      setQueuedFormat(format);
      setScreenshotMode(true);
      return;
    }

    await runDownload(format);
  }

  const currentFormat = downloadingFormat ?? queuedFormat;
  const isBusy = currentFormat !== null;

  return (
    <div className="w-full">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full items-center justify-start gap-2 border-border/60 bg-background px-3 text-sm font-medium leading-none text-foreground shadow-sm hover:bg-muted sm:w-[132px]"
            disabled={isBusy}
          >
            {isBusy ? (
              <LoaderCircleIcon
                data-icon="inline-start"
                className="animate-spin shrink-0 text-muted-foreground"
              />
            ) : (
              <FileTextIcon data-icon="inline-start" className="shrink-0 text-muted-foreground" />
            )}
            <span className="leading-none">Report</span>
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
  const image = new jsPDF({ orientation, unit: "px", format: "a4" }).getImageProperties(dataUrl);
  const pdf = new jsPDF({
    orientation,
    unit: "px",
    format: [image.width, image.height],
  });

  pdf.addImage(dataUrl, "PNG", 0, 0, image.width, image.height, undefined, "FAST");

  pdf.save(buildFileName("pdf"));
}

async function captureReportPng(root: HTMLElement, scale: number): Promise<string> {
  await document.fonts.ready;

  return toPng(root, {
    cacheBust: true,
    backgroundColor: "#f0f0f0",
    pixelRatio: Math.max(2, window.devicePixelRatio || 1) * scale,
    width: root.scrollWidth,
    height: root.scrollHeight,
  });
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
