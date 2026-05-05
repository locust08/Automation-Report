"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileImageIcon,
  FileTextIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { toPng } from "html-to-image";

import {
  ReportErrorScreen,
  ReportLoadingScreen,
  ReportSuccessScreen,
} from "@/components/reporting/report-loading-screen";
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
const DOWNLOAD_READY_DELAY_MS = 950;

type DownloadOverlayState =
  | { phase: "idle" }
  | { phase: "loading"; format: DownloadFormat }
  | { phase: "success"; format: DownloadFormat }
  | { phase: "error"; format: DownloadFormat; message: string };

const TRANSPARENT_IMAGE_PLACEHOLDER =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";
const REPORT_EXPORT_CAPTURE_STYLE = `
  [data-report-export-exclude='true'] {
    display: none !important;
  }

  [data-report-export-header-panel='true'] {
    min-height: 0 !important;
  }

  [data-report-export-header-inner='true'] {
    padding-top: 1.25rem !important;
    padding-bottom: 1.25rem !important;
  }

  [data-report-export-title='true'] {
    text-wrap: balance;
  }
`;

export function ReportDownloadButton() {
  const { screenshotMode, setScreenshotMode } = useScreenshotMode();
  const [queuedFormat, setQueuedFormat] = useState<DownloadFormat | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<DownloadFormat | null>(null);
  const [restoreModeAfterDownload, setRestoreModeAfterDownload] = useState(false);
  const [overlayState, setOverlayState] = useState<DownloadOverlayState>({ phase: "idle" });

  const runDownload = useCallback(async (format: DownloadFormat) => {
    const root = document.querySelector<HTMLElement>("[data-report-capture-root='true']");
    if (!root) {
      setOverlayState({
        phase: "error",
        format,
        message: "The report view could not be captured for export. Reload the page and try again.",
      });
      return;
    }

    setDownloadingFormat(format);
    setOverlayState({ phase: "loading", format });
    try {
      const captureScale = format === "pdf" ? PDF_CAPTURE_SCALE : 1;
      const dataUrl = await captureReportPng(root, captureScale);
      const preparedDownload =
        format === "pdf"
          ? await preparePdfDownload(root, dataUrl)
          : preparePngDownload(dataUrl);

      setOverlayState({ phase: "success", format });
      await waitFor(DOWNLOAD_READY_DELAY_MS);
      preparedDownload();
      setOverlayState({ phase: "idle" });
    } catch (error) {
      setOverlayState({
        phase: "error",
        format,
        message:
          error instanceof Error
            ? error.message
            : "The export could not be completed. Please try again.",
      });
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

    setOverlayState({ phase: "loading", format });

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
  const retryFormat = overlayState.phase === "error" ? overlayState.format : null;

  function handleRetryDownload() {
    if (!retryFormat) {
      return;
    }

    setOverlayState({ phase: "idle" });
    void handleDownload(retryFormat);
  }

  return (
    <>
      <div className="w-full">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full items-center justify-center gap-2 border-border/60 bg-background px-4 text-center text-sm font-medium leading-none text-foreground shadow-sm hover:bg-muted sm:min-w-[148px] sm:w-auto"
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

      {overlayState.phase !== "idle" ? (
        <div className="fixed inset-0 z-[90]" data-report-download-overlay="true">
          {overlayState.phase === "loading" ? <ReportLoadingScreen kind="download" fullPage /> : null}
          {overlayState.phase === "success" ? <ReportSuccessScreen kind="download" fullPage /> : null}
          {overlayState.phase === "error" ? (
            <ReportErrorScreen
              kind="download"
              message={overlayState.message}
              onRetry={handleRetryDownload}
              fullPage
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

async function preparePdfDownload(root: HTMLElement, dataUrl: string): Promise<() => void> {
  const { jsPDF } = await import("jspdf");
  const orientation = root.scrollWidth > root.scrollHeight ? "landscape" : "portrait";
  const image = new jsPDF({ orientation, unit: "px", format: "a4" }).getImageProperties(dataUrl);
  const pdf = new jsPDF({
    orientation,
    unit: "px",
    format: [image.width, image.height],
  });

  pdf.addImage(dataUrl, "PNG", 0, 0, image.width, image.height, undefined, "FAST");
  const pdfBlob = pdf.output("blob");

  return () => {
    downloadBlob(pdfBlob, buildFileName("pdf"));
  };
}

function preparePngDownload(dataUrl: string): () => void {
  return () => {
    downloadFile(dataUrl, buildFileName("png"));
  };
}

async function captureReportPng(root: HTMLElement, scale: number): Promise<string> {
  const exportStyle = installReportExportCaptureStyle();

  try {
    await waitForAnimationFrame();
    await waitForAnimationFrame();
    await document.fonts.ready;

    return toPng(root, {
      cacheBust: true,
      backgroundColor: "#f0f0f0",
      imagePlaceholder: TRANSPARENT_IMAGE_PLACEHOLDER,
      pixelRatio: Math.max(2, window.devicePixelRatio || 1) * scale,
      width: root.scrollWidth,
      height: root.scrollHeight,
      filter: (node) => {
        if (!(node instanceof HTMLElement)) {
          return true;
        }

        return (
          node.dataset.reportDownloadOverlay !== "true" &&
          node.dataset.reportExportExclude !== "true"
        );
      },
    });
  } finally {
    exportStyle.remove();
  }
}

function downloadFile(dataUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.download = fileName;
  link.href = dataUrl;
  link.click();
}

function downloadBlob(blob: Blob, fileName: string) {
  const link = document.createElement("a");
  const blobUrl = URL.createObjectURL(blob);
  link.download = fileName;
  link.href = blobUrl;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function waitFor(durationMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function installReportExportCaptureStyle(): HTMLStyleElement {
  const style = document.createElement("style");
  style.dataset.reportExportCaptureStyle = "true";
  style.textContent = REPORT_EXPORT_CAPTURE_STYLE;
  document.head.appendChild(style);
  return style;
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
