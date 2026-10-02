"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FileImageIcon,
  FileTextIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { toPng } from "html-to-image";
import NextImage from "next/image";

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
import { cn } from "@/lib/utils";
import { createCustomReportPdf } from "@/lib/reporting/custom-pdf-document";
import { isAdminRole } from "@/lib/auth/roles";

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
  [data-report-export-date-label="true"] { white-space: nowrap !important; overflow-wrap: normal !important; word-break: normal !important; font-size: 13px !important; }
  [data-compact-pdf="true"] { font-size: 13px !important; }
  [data-compact-pdf="true"] * { font-size: inherit !important; line-height: 1.4 !important; }
  [data-compact-pdf="true"] > div { width: 100% !important; max-width: none !important; padding: 8px !important; }
  [data-compact-pdf="true"] > div > section > div { padding-left: 0 !important; padding-right: 0 !important; }
  [data-compact-pdf="true"] > div > section:first-child > div { padding-left: 16px !important; padding-right: 16px !important; }
  [data-compact-pdf="true"] [data-standalone-report] > section,
  [data-compact-pdf="true"] [data-standalone-report] > div > section { padding: 8px !important; }
  [data-compact-pdf="true"] h1 { font-size: 24px !important; }
  [data-compact-pdf="true"] h2 { font-size: 20px !important; }
  [data-compact-pdf="true"] :is(h3, h4, h5) { font-size: 16px !important; }
  [data-compact-pdf="true"] [data-slot="card"] { padding: 14px !important; gap: 12px !important; }
  [data-compact-pdf="true"] [data-slot="card"] > * { margin: 0 !important; }
  [data-compact-pdf="true"] [data-standalone-report] :is(.size-10, .size-12) { width: 28px !important; height: 28px !important; }
  [data-compact-pdf="true"] [data-report-full-width-table] { min-width: 0 !important; width: 100% !important; overflow: visible !important; }
  [data-compact-pdf="true"] table { width: 100% !important; min-width: 0 !important; table-layout: fixed !important; border-collapse: collapse !important; }
  [data-compact-pdf="true"] col { width: auto !important; }
  [data-compact-pdf="true"] col:first-child { width: 18% !important; }
  [data-compact-pdf="true"] col:last-child { display: none !important; width: 0 !important; }
  [data-compact-pdf="true"] :is(th, td) { padding: 9px 8px !important; white-space: normal !important; overflow-wrap: anywhere !important; position: static !important; }
  [data-compact-pdf="true"] thead th { font-size: 12px !important; padding: 7px 5px !important; overflow-wrap: normal !important; word-break: normal !important; }
  [data-compact-pdf="true"] :is(th, td) img { width: 84px !important; height: 64px !important; max-width: 100% !important; object-fit: contain !important; }
  [data-compact-pdf="true"] button { min-height: 0 !important; height: auto !important; padding: 0 !important; }
  [data-compact-pdf="true"] [data-demand-pdf-columns="audience"] { display: grid !important; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; gap: 20px !important; }
  [data-compact-pdf="true"] [data-demand-pdf-columns="matrix"] { display: grid !important; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) !important; gap: 20px !important; }
  [data-compact-pdf="true"] [data-demand-pdf-columns] > * { min-width: 0 !important; }

  [data-standalone-report="demand-gen"] [data-slot="card"] {
    overflow: visible !important;
    height: auto !important;
  }

  [data-standalone-report="demand-gen"] [data-slot="card"] > * {
    flex-shrink: 0 !important;
  }

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
  compact?: boolean;
  disabled?: boolean;
}

export function ReportDownloadButton({ fileNamePrefix, compact = false, disabled = false }: ReportDownloadButtonProps) {
  const { screenshotMode, setScreenshotMode } = useScreenshotMode();
  const [queuedFormat, setQueuedFormat] = useState<DownloadFormat | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<DownloadFormat | null>(null);
  const [restoreModeAfterDownload, setRestoreModeAfterDownload] = useState(false);
  const [overlayState, setOverlayState] = useState<ExportOverlayState>({ phase: "idle" });
  const [adminPreview, setAdminPreview] = useState(false);
  const [preview, setPreview] = useState<{ pages: string[]; blob: Blob } | null>(null);
  const previewRequested = useRef(false);
  const retryPreview = useRef(false);
  const previewDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (!document.querySelector('[data-standalone-report]')) return;
    void fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(payload => setAdminPreview(isAdminRole(payload?.user?.role)))
      .catch(() => setAdminPreview(false));
    return () => controller.abort();
  }, []);
  useEffect(() => { if (preview && !previewDialog.current?.open) previewDialog.current?.showModal(); }, [preview]);

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
      if (previewRequested.current && format === "pdf" && root.querySelector('[data-standalone-report]')) {
        const pages: string[] = [];
        const blob = await createStandalonePdfBlob(root, image => pages.push(image));
        setPreview({ blob, pages });
        setOverlayState({ phase: "idle" });
        return;
      }
      const preparedDownload =
        format === "pdf" && isAdvancedReportRoot(root)
          ? await prepareAdvancedPdfDownload(root, fileNamePrefix)
          : await prepareStandardDownload(root, format, fileNamePrefix);

      setOverlayState({ phase: "success", kind: "download", format });
      await waitFor(DOWNLOAD_READY_DELAY_MS);
      preparedDownload();
      setOverlayState({ phase: "idle" });
    } catch (error) {
      retryPreview.current = previewRequested.current;
      setOverlayState({
        phase: "error",
        format,
        message:
          error instanceof Error
            ? error.message
            : "The export could not be completed. Please try again.",
      });
    } finally {
      previewRequested.current = false;
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
    previewRequested.current = retryPreview.current;
    void handleDownload(retryFormat);
  }

  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-2", compact ? "w-auto" : "w-full")}>
        {adminPreview ? <Button variant="outline" disabled={isBusy || disabled} onClick={() => { previewRequested.current = true; void handleDownload("pdf"); }}>Preview PDF</Button> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "items-center justify-center gap-2 border-border/60 bg-background text-center font-medium leading-none text-foreground hover:bg-muted",
                compact
                  ? "h-8 w-auto px-2 text-[11px] shadow-none"
                  : "h-10 w-full px-4 text-sm shadow-sm sm:min-w-[148px] sm:w-auto"
              )}
              disabled={isBusy || disabled}
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
      {preview ? createPortal(<dialog ref={previewDialog} aria-labelledby="report-pdf-preview-title" onCancel={() => setPreview(null)} className="fixed inset-0 m-auto h-[90vh] w-[95vw] max-w-none rounded-xl bg-white p-4 backdrop:bg-black/50">
        <div className="flex h-full flex-col gap-3"><div className="flex flex-wrap items-center justify-between gap-4"><h2 id="report-pdf-preview-title" className="text-lg font-semibold">PDF preview</h2><div className="flex gap-2"><Button onClick={() => downloadBlob(preview.blob, buildFileName("pdf", fileNamePrefix))}>Download PDF</Button><Button variant="outline" onClick={() => setPreview(null)}>Close preview</Button></div></div>
          <div className="min-h-0 flex-1 space-y-4 overflow-auto rounded bg-neutral-200 p-3">{preview.pages.map((image,index) => <figure key={index}><NextImage unoptimized src={image} width={792} height={1120} alt={`PDF preview page ${index+1}`} className="mx-auto h-auto w-full max-w-[792px] border bg-white shadow"/><figcaption className="mt-1 text-center text-sm">Page {index+1} of {preview.pages.length}</figcaption></figure>)}</div>
        </div>
      </dialog>, document.body) : null}
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
  dataUrl: string,
  fileNamePrefix: string | undefined
): Promise<() => void> {
  const pdfBlob = await createPdfBlob(dataUrl);

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
  if (typeof window === "undefined" || window.location.pathname !== "/overall") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("serverPdf") === "1";
}

function buildServerPrintPdfEndpoint(fileNamePrefix: string | undefined): string {
  const params = new URLSearchParams(window.location.search);
  params.delete("screenshot");
  params.delete("serverPdf");
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
  if (format === "pdf" && root.querySelector("[data-standalone-report]")) {
    const blob = await createStandalonePdfBlob(root);
    return () => downloadBlob(blob, buildFileName("pdf", fileNamePrefix));
  }
  const dataUrl = await captureReportPng(root, format);
  return format === "pdf"
    ? preparePdfDownload(dataUrl, fileNamePrefix)
    : preparePngDownload(dataUrl, fileNamePrefix);
}

async function prepareAdvancedPdfDownload(
  root: HTMLElement,
  fileNamePrefix: string | undefined
): Promise<() => void> {
  if (!isAdvancedReportRoot(root)) {
    throw new Error("Advanced PDF export requires an Advanced Report view.");
  }

  const pdfBlob = await createAdvancedPdfBlob(root);

  return () => {
    downloadBlob(pdfBlob, buildFileName("pdf", fileNamePrefix));
  };
}

// Build complete custom pages from the prepared report's content.
async function createStandalonePdfBlob(root: HTMLElement, onPage?: (image: string) => void): Promise<Blob> {
  await waitForReportCaptureReady(root);
  return createCustomReportPdf(root, onPage);
}
async function createPdfBlob(dataUrl: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const image = new jsPDF().getImageProperties(dataUrl);
  // Capture can expand scrolling tables beyond the restored mobile layout.
  const orientation = image.width > image.height ? "landscape" : "portrait";
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
  const advancedExportOnlyStyle = installAdvancedPdfOnlyStyle();

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
    advancedExportOnlyStyle.remove();
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

    const standalone = root.querySelector("[data-standalone-report]");
    const tables = standalone ? Array.from(root.querySelectorAll<HTMLElement>("[data-report-full-width-table]")) : [];
    const styles = [...tables, ...(standalone ? [root, root.firstElementChild as HTMLElement] : [])].filter(Boolean).map((element) => ({ element, value: element.getAttribute("style") }));
    try {
      if (standalone && tables.length) {
        root.style.width = `${Math.max(root.scrollWidth, ...tables.map((element) => element.scrollWidth + 180))}px`;
        root.style.maxWidth = "none"; root.style.overflow = "visible";
        const shell = root.firstElementChild as HTMLElement; shell.style.maxWidth = "none"; shell.style.width = "100%";
      }
      tables.forEach((element) => { element.style.overflow = "visible"; element.style.minWidth = `${element.scrollWidth}px`; element.style.width = "100%"; });
      return await captureElementPng(root, format);
    } finally { styles.forEach(({ element, value }) => value == null ? element.removeAttribute("style") : element.setAttribute("style", value)); }
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
  const content = root.querySelector<HTMLElement>("[data-advanced-report-content='true']");
  return Boolean(
    content &&
      content.dataset.reportMode === "advanced" &&
      content.dataset.reportType === "advanced"
  );
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
  if (root.querySelector("[data-standalone-report]")) {
    const deadline = Date.now() + 120000;
    while (root.dataset.reportReady !== "true") {
      const error = root.querySelector<HTMLElement>("[data-export-error]")?.dataset.exportError;
      if (error) throw new Error(error);
      if (Date.now() > deadline) throw new Error("Report preparation is incomplete. Retry the missing data before downloading.");
      await waitFor(100);
    }
  }
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

function installAdvancedPdfOnlyStyle(): HTMLStyleElement {
  const style = document.createElement("style");
  style.dataset.advancedPdfOnlyStyle = "true";
  style.textContent = `
    [data-advanced-export-only='true'] {
      display: block !important;
    }
  `;
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
