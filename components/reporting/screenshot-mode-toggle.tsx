"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
const DOWNLOAD_READY_DELAY_MS = 650;
const PDF_CAPTURE_PIXEL_RATIO = 2;
const PNG_CAPTURE_PIXEL_RATIO = 2;
const MAX_CAPTURE_CANVAS_PIXELS = 32_000_000;
const EXPORT_READY_TIMEOUT_MS = 2500;
const EXPORT_LAYOUT_STABLE_TIMEOUT_MS = 900;

type ExportOverlayState =
  | { phase: "idle" }
  | { phase: "loading"; kind: "download"; format: DownloadFormat }
  | { phase: "success"; kind: "download"; format: DownloadFormat }
  | { phase: "error"; format: DownloadFormat; message: string };

const TRANSPARENT_IMAGE_PLACEHOLDER =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";
const REPORT_EXPORT_CAPTURE_STYLE = `
  [data-report-export-exclude='true'] {
    display: none !important;
  }

  [data-report-export-location-tab='true'][aria-pressed='false'] {
    display: none !important;
  }

  [data-report-audience-chart-scroller='true'] {
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
  }

  [data-report-audience-chart-scroller='true']::-webkit-scrollbar {
    display: none !important;
  }

  [data-report-export-header-panel='true'] {
    height: auto !important;
    min-height: 0 !important;
    background-size: cover !important;
    background-position: center !important;
    overflow: hidden !important;
    border-radius: 1.5rem !important;
  }

  [data-report-export-header-inner='true'] {
    padding: 1.25rem 1.5rem !important;
  }

  [data-report-export-header-grid='true'] {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) minmax(14rem, 24rem) !important;
    align-items: start !important;
    gap: 1.25rem !important;
  }

  [data-report-export-date-control='true'] {
    display: flex !important;
    justify-self: end !important;
    width: min(100%, 24rem) !important;
    max-width: 24rem !important;
  }

  [data-report-export-title='true'] {
    margin: 0 !important;
    max-width: 100% !important;
    font-size: clamp(2rem, 4vw, 3.25rem) !important;
    line-height: 1.04 !important;
    text-wrap: balance;
  }

  [data-report-export-date-control='true'] > * {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    height: 2.75rem !important;
    min-height: 0 !important;
    border-radius: 1rem !important;
  }

  [data-report-export-date-control='true'] button {
    min-height: 0 !important;
  }

  @media (max-width: 700px) {
    [data-report-export-header-inner='true'] {
      padding: 1rem !important;
    }

    [data-report-export-header-grid='true'] {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 0.875rem !important;
    }

    [data-report-export-date-control='true'] {
      justify-self: stretch !important;
      width: 100% !important;
      max-width: none !important;
    }

    [data-report-export-title='true'] {
      font-size: clamp(1.75rem, 8vw, 2.5rem) !important;
    }
  }
`;

interface ReportDownloadButtonProps {
  fileNamePrefix?: string;
}

export function ReportDownloadButton({ fileNamePrefix }: ReportDownloadButtonProps) {
  const { screenshotMode, setScreenshotMode } = useScreenshotMode();
  const [queuedFormat, setQueuedFormat] = useState<DownloadFormat | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<DownloadFormat | null>(null);
  const [restoreModeAfterDownload, setRestoreModeAfterDownload] = useState(false);
  const [overlayState, setOverlayState] = useState<ExportOverlayState>({ phase: "idle" });

  const runDownload = useCallback(async (format: DownloadFormat) => {
    const root = document.querySelector<HTMLElement>("[data-report-capture-root='true']");

    if (format === "pdf" && canUseServerPrintPdfDownload()) {
      setDownloadingFormat(format);
      setOverlayState({ phase: "loading", kind: "download", format });
      try {
        const preparedDownload = await prepareServerPrintPdfDownload(fileNamePrefix);
        setOverlayState({ phase: "success", kind: "download", format });
        await waitFor(DOWNLOAD_READY_DELAY_MS);
        preparedDownload();
        setOverlayState({ phase: "idle" });
      } catch (error) {
        if (!root) {
          setOverlayState({
            phase: "error",
            format,
            message:
              error instanceof Error
                ? error.message
                : "The export could not be completed. Please try again.",
          });
          return;
        }

        try {
          console.warn("[report-download] server PDF export failed; falling back to browser capture", error);
          const preparedDownload = await prepareStandardDownload(root, format, fileNamePrefix);
          setOverlayState({ phase: "success", kind: "download", format });
          await waitFor(DOWNLOAD_READY_DELAY_MS);
          preparedDownload();
          setOverlayState({ phase: "idle" });
        } catch (fallbackError) {
          setOverlayState({
            phase: "error",
            format,
            message:
              fallbackError instanceof Error
                ? fallbackError.message
                : "The export could not be completed. Please try again.",
          });
        }
      } finally {
        setDownloadingFormat(null);
      }
      return;
    }

    if (!root) {
      setOverlayState({
        phase: "error",
        format,
        message: "The report view could not be captured for export. Reload the page and try again.",
      });
      return;
    }

    setDownloadingFormat(format);
    setOverlayState({ phase: "loading", kind: "download", format });
    try {
      const preparedDownload =
        format === "pdf" && isAdvancedReportRoot(root)
          ? await prepareAdvancedPdfDownload(root, fileNamePrefix)
          : await prepareStandardDownload(root, format, fileNamePrefix);

      setOverlayState({ phase: "success", kind: "download", format });
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
  }, [fileNamePrefix]);

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

    setOverlayState({ phase: "loading", kind: "download", format });

    if (format === "pdf" && canUseServerPrintPdfDownload()) {
      await runDownload(format);
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
  const retryFormat = overlayState.phase === "error" ? overlayState.format : null;
  const overlay = <ReportExportOverlay state={overlayState} onRetry={handleRetryDownload} />;

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

      {overlayState.phase !== "idle" ? createPortal(overlay, document.body) : null}
    </>
  );
}

function ReportExportOverlay({
  state,
  onRetry,
}: {
  state: ExportOverlayState;
  onRetry: () => void;
}) {
  if (state.phase === "idle") {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90]" data-report-download-overlay="true">
      {state.phase === "loading" ? <ReportLoadingScreen kind={state.kind} fullPage /> : null}
      {state.phase === "success" ? <ReportSuccessScreen kind={state.kind} fullPage /> : null}
      {state.phase === "error" ? (
        <ReportErrorScreen
          kind="download"
          message={state.message}
          onRetry={onRetry}
          fullPage
        />
      ) : null}
    </div>
  );
}

async function preparePdfDownload(
  root: HTMLElement,
  dataUrl: string,
  fileNamePrefix: string | undefined
): Promise<() => void> {
  const pdfBlob = await createPdfBlob(root, dataUrl);

  return () => {
    downloadBlob(pdfBlob, buildFileName("pdf", fileNamePrefix));
  };
}

async function prepareServerPrintPdfDownload(
  fileNamePrefix: string | undefined
): Promise<() => void> {
  const endpoint = buildServerPrintPdfEndpoint(fileNamePrefix);
  const response = await fetch(endpoint, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    const errorMessage = await readPdfErrorMessage(response);
    throw new Error(errorMessage || `The PDF export failed with status ${response.status}.`);
  }

  const pdfBlob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition");
  const filename = parseContentDispositionFilename(contentDisposition) ?? buildFileName("pdf", fileNamePrefix);

  return () => {
    downloadBlob(pdfBlob, filename);
  };
}

function canUseServerPrintPdfDownload(): boolean {
  return typeof window !== "undefined" && window.location.pathname === "/overall";
}

function buildServerPrintPdfEndpoint(fileNamePrefix: string | undefined): string {
  const params = new URLSearchParams(window.location.search);
  params.delete("screenshot");
  if (fileNamePrefix?.trim()) {
    params.set("clientName", fileNamePrefix.trim());
  }

  return `/api/report-pdf/monthly?${params.toString()}`;
}

async function readPdfErrorMessage(response: Response): Promise<string | null> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? null;
  } catch {
    return null;
  }
}

function parseContentDispositionFilename(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = /filename="([^"]+)"/i.exec(value);
  return match?.[1] ?? null;
}

async function prepareStandardDownload(
  root: HTMLElement,
  format: DownloadFormat,
  fileNamePrefix: string | undefined
): Promise<() => void> {
  const dataUrl = await captureReportPng(root, format);
  return format === "pdf"
    ? preparePdfDownload(root, dataUrl, fileNamePrefix)
    : preparePngDownload(dataUrl, fileNamePrefix);
}

async function prepareAdvancedPdfDownload(
  root: HTMLElement,
  fileNamePrefix: string | undefined
): Promise<() => void> {
  const pdfBlob = await createAdvancedPdfBlob(root);

  return () => {
    downloadBlob(pdfBlob, buildFileName("pdf", fileNamePrefix));
  };
}

async function createPdfBlob(root: HTMLElement, dataUrl: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const orientation = root.scrollWidth > root.scrollHeight ? "landscape" : "portrait";
  const image = new jsPDF({ orientation, unit: "px", format: "a4" }).getImageProperties(dataUrl);
  const pdf = new jsPDF({
    orientation,
    unit: "px",
    format: [image.width, image.height],
    compress: true,
  });

  pdf.addImage(dataUrl, "PNG", 0, 0, image.width, image.height, "report-capture", "FAST");
  return pdf.output("blob");
}

async function createAdvancedPdfBlob(root: HTMLElement): Promise<Blob> {
  const exportStyle = installReportExportCaptureStyle();

  try {
    await waitForReportCaptureReady(root);
    const elements = getAdvancedExportElements(root);
    if (elements.length === 0) {
      throw new Error("The advanced report did not expose export sections for PDF capture.");
    }

    const captures = [];
    for (const element of elements) {
      const width = Math.ceil(element.scrollWidth);
      const height = Math.ceil(element.scrollHeight);
      const dataUrl = await captureElementPng(element, "pdf");
      captures.push({ dataUrl, width, height });
    }

    const { jsPDF } = await import("jspdf");
    const first = captures[0];
    const firstOrientation = first.width > first.height ? "landscape" : "portrait";
    const pdf = new jsPDF({
      orientation: firstOrientation,
      unit: "px",
      format: [first.width, first.height],
      compress: true,
    });

    captures.forEach((capture, index) => {
      const orientation = capture.width > capture.height ? "landscape" : "portrait";
      if (index > 0) {
        pdf.addPage([capture.width, capture.height], orientation);
      }
      pdf.addImage(
        capture.dataUrl,
        "PNG",
        0,
        0,
        capture.width,
        capture.height,
        `advanced-report-section-${index}`,
        "FAST"
      );
    });

    return pdf.output("blob");
  } finally {
    exportStyle.remove();
  }
}

function preparePngDownload(dataUrl: string, fileNamePrefix: string | undefined): () => void {
  return () => {
    downloadFile(dataUrl, buildFileName("png", fileNamePrefix));
  };
}

async function captureReportPng(root: HTMLElement, format: DownloadFormat): Promise<string> {
  const exportStyle = installReportExportCaptureStyle();

  try {
    await waitForReportCaptureReady(root);

    return captureElementPng(root, format);
  } finally {
    exportStyle.remove();
  }
}

async function captureElementPng(element: HTMLElement, format: DownloadFormat): Promise<string> {
  const width = Math.ceil(element.scrollWidth);
  const height = Math.ceil(element.scrollHeight);

  return toPng(element, {
    cacheBust: false,
    backgroundColor: "#f0f0f0",
    imagePlaceholder: TRANSPARENT_IMAGE_PLACEHOLDER,
    pixelRatio: resolveCapturePixelRatio(width, height, format),
    width,
    height,
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
}

function isAdvancedReportRoot(root: HTMLElement): boolean {
  return Boolean(root.querySelector("[data-advanced-report-content='true']"));
}

function getAdvancedExportElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      [
        "[data-report-export-header-section='true']",
        "[data-advanced-report-section='true']",
        "[data-report-export-footer='true']",
      ].join(",")
    )
  ).filter((element) => element.offsetWidth > 0 && element.offsetHeight > 0);
}

async function waitForReportCaptureReady(root: HTMLElement): Promise<void> {
  await waitForAnimationFrame();
  await waitForAnimationFrame();
  await Promise.race([document.fonts.ready, waitFor(EXPORT_READY_TIMEOUT_MS)]);
  await waitForImages(root);
  await waitForStableLayout(root);
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  if (images.length === 0) {
    return;
  }

  await Promise.race([
    Promise.all(images.map((image) => waitForImage(image))),
    waitFor(EXPORT_READY_TIMEOUT_MS),
  ]);
}

function waitForImage(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve();
  }

  if (typeof image.decode === "function") {
    return image.decode().catch(() => undefined);
  }

  return new Promise((resolve) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  });
}

function waitForStableLayout(root: HTMLElement): Promise<void> {
  const startedAt = performance.now();
  let stableFrames = 0;
  let previousSignature = readLayoutSignature(root);

  return new Promise((resolve) => {
    function check() {
      const nextSignature = readLayoutSignature(root);
      if (nextSignature === previousSignature) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
        previousSignature = nextSignature;
      }

      if (stableFrames >= 2 || performance.now() - startedAt >= EXPORT_LAYOUT_STABLE_TIMEOUT_MS) {
        resolve();
        return;
      }

      window.requestAnimationFrame(check);
    }

    window.requestAnimationFrame(check);
  });
}

function readLayoutSignature(root: HTMLElement): string {
  const bounds = root.getBoundingClientRect();
  return [
    Math.ceil(root.scrollWidth),
    Math.ceil(root.scrollHeight),
    Math.ceil(bounds.width),
    Math.ceil(bounds.height),
  ].join("x");
}

function resolveCapturePixelRatio(width: number, height: number, format: DownloadFormat): number {
  const preferredRatio =
    format === "pdf"
      ? PDF_CAPTURE_PIXEL_RATIO
      : Math.min(PNG_CAPTURE_PIXEL_RATIO, Math.max(1, window.devicePixelRatio || 1));
  const cssPixels = Math.max(1, width * height);
  const safeRatio = Math.sqrt(MAX_CAPTURE_CANVAS_PIXELS / cssPixels);

  return Math.max(1, Math.min(preferredRatio, safeRatio));
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

function buildFileName(format: DownloadFormat, rawPrefix: string | undefined): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(
    now.getMinutes()
  ).padStart(2, "0")}`;
  return `${sanitizeFileNamePrefix(rawPrefix)}_${stamp}.${format}`;
}

function sanitizeFileNamePrefix(rawPrefix: string | undefined): string {
  const normalized = rawPrefix
    ?.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .toLowerCase()
    .slice(0, 80);

  return normalized || "report";
}
