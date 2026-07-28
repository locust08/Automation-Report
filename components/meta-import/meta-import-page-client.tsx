"use client";

import { DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircleIcon,
  BarChart3Icon,
  CheckCircle2Icon,
  ClipboardListIcon,
  DownloadIcon,
  EyeIcon,
  FileSpreadsheetIcon,
  HistoryIcon,
  HouseIcon,
  SearchIcon,
  SparklesIcon,
  UploadCloudIcon,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { META_IMPORT_FIELD_DEFINITIONS } from "@/lib/meta-import/columns";
import {
  META_IMPORT_MAX_FILE_BYTES,
  type MetaImportColumnMapping,
  type MetaImportCommitResult,
  type MetaImportJob,
  type MetaImportPreview,
  type MetaImportPreviewRow,
  type MetaImportRowStatus,
} from "@/lib/meta-import/types";

const PAGE_SIZE = 20;

export function MetaImportPageClient({
  defaultAccountId,
}: {
  defaultAccountId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [allowMismatch, setAllowMismatch] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MetaImportPreview | null>(null);
  const [mapping, setMapping] = useState<MetaImportColumnMapping>({});
  const [history, setHistory] = useState<MetaImportJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MetaImportCommitResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | MetaImportRowStatus>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dragging, setDragging] = useState(false);

  const loadHistory = useCallback(async (targetAccountId: string) => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/meta-import/history?accountId=${encodeURIComponent(targetAccountId)}`, { cache: "no-store" });
      const payload = (await response.json()) as { jobs?: MetaImportJob[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load import history.");
      setHistory(payload.jobs ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load import history.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory(defaultAccountId);
  }, [defaultAccountId, loadHistory]);

  function acceptFile(nextFile: File | null) {
    setError(null);
    setPreview(null);
    setResult(null);
    if (!nextFile) return setFile(null);
    if (!nextFile.name.toLocaleLowerCase("en").endsWith(".csv")) {
      setFile(null);
      setError("Only .csv files are supported in this version.");
      return;
    }
    if (nextFile.size === 0 || nextFile.size > META_IMPORT_MAX_FILE_BYTES) {
      setFile(null);
      setError(`The file must be between 1 byte and ${formatBytes(META_IMPORT_MAX_FILE_BYTES)}.`);
      return;
    }
    setFile(nextFile);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files.item(0));
  }

  async function runPreview(mappingOverride?: MetaImportColumnMapping) {
    if (!file) return setError("Select a CSV file first.");
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = buildUploadForm(file, accountId, allowMismatch, mappingOverride ?? (preview ? mapping : null));
      const response = await fetch("/api/meta-import/preview", { method: "POST", body: formData });
      const payload = (await response.json()) as MetaImportPreview & { error?: string };
      if (!response.ok) throw new Error(payload.error || "CSV validation failed.");
      setPreview(payload);
      setMapping(payload.mapping);
      setPage(1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CSV validation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function commitImport() {
    if (!file || !preview) return;
    setConfirmOpen(false);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/meta-import/commit?confirm=1", {
        method: "POST",
        body: buildUploadForm(file, accountId, allowMismatch, mapping),
      });
      const payload = (await response.json()) as MetaImportCommitResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || payload.errors?.join(" ") || "CSV import failed.");
      setResult(payload);
      await loadHistory(accountId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CSV import failed.");
    } finally {
      setLoading(false);
    }
  }

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("en");
    return (preview?.rows ?? []).filter((row) => {
      if (statusFilter !== "all" && row.validationStatus !== statusFilter) return false;
      if (!needle) return true;
      return [row.campaignName, row.adSetName, row.adName, row.accountId, row.reportingStart]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase("en").includes(needle));
    });
  }, [preview?.rows, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFileErrors = preview?.fileIssues.some((issue) => issue.severity === "error") ?? true;

  return (
    <main className="min-h-screen bg-[#f0f0f0] text-[#111]">
      <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <header className="flex flex-col gap-4 rounded-[2rem] bg-[url('/headerbackground.png')] bg-cover bg-center p-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between lg:p-9">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/75">Reporting tools</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-5xl">Meta Ads CSV Import</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/80">Upload, validate, map and commit Meta Ads Manager reports without exposing Meta credentials.</p>
            <nav className="mt-4 flex flex-wrap items-center gap-2" aria-label="Reporting tools navigation">
              {[
                { href: "/", label: "Home", icon: HouseIcon },
                { href: "/overall", label: "Overall", icon: BarChart3Icon },
                { href: "/preview", label: "Preview", icon: EyeIcon },
                { href: "/advanced", label: "Advanced Report", icon: SparklesIcon },
                { href: "/dashboard/media-plan", label: "Media Plan", icon: ClipboardListIcon },
                { href: "/meta-import", label: "Meta CSV Import", icon: UploadCloudIcon, active: true },
              ].map(({ href, label, icon: Icon, active }) => (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  aria-label={`Open ${label} page`}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex size-10 items-center justify-center rounded-md border transition ${
                    active
                      ? "border-white/35 bg-white/25 shadow-sm"
                      : "border-transparent bg-white/10 hover:border-white/20 hover:bg-white/20"
                  }`}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </Link>
              ))}
            </nav>
          </div>
        </header>

        {error ? (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircleIcon className="mt-0.5 size-5 shrink-0" /><span>{error}</span>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle>1. Export from Meta Ads Manager</CardTitle>
              <CardDescription>Use the same reporting level and date range you want to view in this dashboard.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <ol className="list-decimal space-y-2 pl-5">
                <li>Open Ads Reporting for the correct Meta ad account.</li>
                <li>Select Campaign, Ad set, or Ad level and choose the reporting date range.</li>
                <li>Include IDs, reporting dates, Amount spent, Impressions, Clicks, Results and any optional metrics needed.</li>
                <li>Download as CSV. XLSX is not supported in this first version.</li>
              </ol>
              <Button asChild variant="outline"><a href="/samples/meta-ads-import-template.csv" download><DownloadIcon /> Download CSV template</a></Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Account and file</CardTitle>
              <CardDescription>The account is configurable. Rows from another account require explicit confirmation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor="meta-account-id">Meta Ad Account ID</Label>
                  <Input id="meta-account-id" inputMode="numeric" value={accountId} onChange={(event) => { setAccountId(event.target.value.replace(/\D/g, "")); setPreview(null); }} />
                </div>
                <label className="flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm">
                  <input type="checkbox" checked={allowMismatch} onChange={(event) => { setAllowMismatch(event.target.checked); setPreview(null); }} />
                  Confirm different account
                </label>
              </div>
              <div
                className={`flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ${dragging ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}
                onClick={() => inputRef.current?.click()}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={drop}
              >
                <UploadCloudIcon className="mb-3 size-9 text-muted-foreground" />
                <p className="font-medium">Drop a Meta CSV here or choose a file</p>
                <p className="mt-1 text-sm text-muted-foreground">CSV only · maximum {formatBytes(META_IMPORT_MAX_FILE_BYTES)}</p>
                <input ref={inputRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => acceptFile(event.target.files?.item(0) ?? null)} />
              </div>
              {file ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <span className="flex items-center gap-2"><FileSpreadsheetIcon className="size-5" />{file.name}</span>
                  <span className="text-muted-foreground">{formatBytes(file.size)}{preview ? ` · ${preview.file.rowCount.toLocaleString()} rows` : ""}</span>
                </div>
              ) : null}
              <Button onClick={() => runPreview()} disabled={!file || !accountId || loading}>{loading ? "Validating…" : "Validate and preview"}</Button>
            </CardContent>
          </Card>
        </div>

        {preview ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>3. Column mapping</CardTitle>
                <CardDescription>Detected automatically. Required fields are marked; unknown CSV columns remain in row metadata.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {META_IMPORT_FIELD_DEFINITIONS.map((definition) => (
                    <div className="space-y-1.5" key={definition.field}>
                      <Label htmlFor={`mapping-${definition.field}`}>{definition.label} {definition.required ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}</Label>
                      <select
                        id={`mapping-${definition.field}`}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={mapping[definition.field] ?? ""}
                        onChange={(event) => setMapping((current) => ({ ...current, [definition.field]: event.target.value || undefined }))}
                      >
                        <option value="">Not mapped</option>
                        {preview.headers.map((header) => <option value={header} key={header}>{header}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <Button className="mt-5" variant="outline" onClick={() => runPreview(mapping)} disabled={loading}>Apply mapping and revalidate</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>4. Validation summary</CardTitle>
                <CardDescription>Detected level: {preview.reportingLevel} · Date range: {preview.dateRange.startDate ?? "Unknown"} to {preview.dateRange.endDate ?? "Unknown"} · Delimiter: {preview.detectedDelimiter}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                  {summaryCards(preview).map((item) => (
                    <div className="rounded-lg border bg-background p-3" key={item.label}><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 text-xl font-semibold">{item.value}</p></div>
                  ))}
                </div>
                {preview.fileIssues.map((issue, index) => (
                  <p className={issue.severity === "error" ? "text-sm text-destructive" : "text-sm text-amber-700"} key={`${issue.code}-${index}`}>{issue.message}</p>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>5. Data preview</CardTitle>
                <CardDescription>Search and filter the normalized rows. Only {PAGE_SIZE} rows render per page.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1"><SearchIcon className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search campaigns, ad sets, ads or dates" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div>
                  <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setPage(1); }}>
                    <option value="all">All statuses</option><option value="valid">Valid</option><option value="warning">Warning</option><option value="invalid">Invalid</option><option value="duplicate">Duplicate</option>
                  </select>
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[1100px] text-left text-sm">
                    <thead className="bg-muted/60 text-xs uppercase text-muted-foreground"><tr>{["Row", "Level", "Campaign", "Ad set", "Ad", "Date", "Spend", "Impressions", "Clicks", "Results", "Status"].map((heading) => <th className="px-3 py-2.5" key={heading}>{heading}</th>)}</tr></thead>
                    <tbody>{visibleRows.map((row) => <PreviewRow row={row} key={`${row.uniqueKey}-${row.rowNumber}`} />)}</tbody>
                  </table>
                </div>
                {visibleRows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No preview rows match these filters.</p> : null}
                <div className="flex items-center justify-between text-sm"><span>{filteredRows.length.toLocaleString()} rows</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span>Page {page} of {pageCount}</span><Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>6. Confirm import</CardTitle><CardDescription>Valid and warning rows will be created or updated. Invalid and exact duplicate rows are not written.</CardDescription></CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <div className="text-sm text-muted-foreground">{preview.summary.createRows} create · {preview.summary.updateRows} update · {preview.summary.skipRows} skip · {preview.summary.invalidRows} invalid</div>
                <Button onClick={() => setConfirmOpen(true)} disabled={hasFileErrors || loading || preview.summary.createRows + preview.summary.updateRows === 0}>Review and import</Button>
              </CardContent>
            </Card>
          </>
        ) : null}

        {result ? (
          <Card className={result.success ? "border-green-200 bg-green-50/40" : "border-red-200 bg-red-50/40"}>
            <CardHeader><CardTitle className="flex items-center gap-2">{result.success ? <CheckCircle2Icon className="text-green-700" /> : <AlertCircleIcon className="text-destructive" />}{result.success ? "Import completed" : "Import failed"}</CardTitle><CardDescription>{result.rowsCreated} created · {result.rowsUpdated} updated · {result.rowsSkipped} skipped · {result.invalidRows} invalid</CardDescription></CardHeader>
            <CardContent><Button asChild><Link href={result.reportUrl}>View imported report</Link></Button></CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><HistoryIcon /> Import history</CardTitle><CardDescription>Recent imports for account {accountId || defaultAccountId}.</CardDescription></CardHeader>
          <CardContent>
            {historyLoading ? <p className="text-sm text-muted-foreground">Loading history…</p> : history.length === 0 ? <p className="text-sm text-muted-foreground">No imports have been committed for this account.</p> : (
              <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-muted/60 text-xs uppercase text-muted-foreground"><tr>{["File", "Account", "Imported by", "Uploaded", "Report dates", "Level", "Rows", "Created", "Updated", "Skipped", "Failed", "Status"].map((heading) => <th className="px-3 py-2.5" key={heading}>{heading}</th>)}</tr></thead><tbody>{history.map((job) => <tr className="border-t" key={job.id}><td className="px-3 py-2.5 font-medium">{job.originalFilename}</td><td className="px-3 py-2.5">{job.accountId}</td><td className="px-3 py-2.5">{job.importedBy}</td><td className="px-3 py-2.5">{formatDateTime(job.uploadedAt)}</td><td className="px-3 py-2.5">{job.reportingStart ?? "—"} – {job.reportingEnd ?? "—"}</td><td className="px-3 py-2.5">{job.reportingLevel}</td><td className="px-3 py-2.5">{job.totalRows}</td><td className="px-3 py-2.5">{job.createdRows}</td><td className="px-3 py-2.5">{job.updatedRows}</td><td className="px-3 py-2.5">{job.skippedRows}</td><td className="px-3 py-2.5">{job.failedRows}</td><td className="px-3 py-2.5"><Badge variant={job.status === "completed" ? "secondary" : job.status === "failed" ? "destructive" : "outline"}>{job.status}</Badge></td></tr>)}</tbody></table></div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Commit this Meta CSV import?</AlertDialogTitle><AlertDialogDescription>Account {accountId} · {file?.name} · {preview?.reportingLevel} · {preview?.dateRange.startDate ?? "Unknown"} to {preview?.dateRange.endDate ?? "Unknown"}. This will create {preview?.summary.createRows ?? 0}, update {preview?.summary.updateRows ?? 0}, skip {preview?.summary.skipRows ?? 0}, and leave {preview?.summary.invalidRows ?? 0} invalid rows unchanged.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Go back</AlertDialogCancel><AlertDialogAction onClick={commitImport}>Import data</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function PreviewRow({ row }: { row: MetaImportPreviewRow }) {
  const variant = row.validationStatus === "invalid" ? "destructive" : row.validationStatus === "valid" ? "secondary" : "outline";
  return <tr className="border-t align-top"><td className="px-3 py-2.5">{row.rowNumber}</td><td className="px-3 py-2.5">{row.reportingLevel}</td><td className="max-w-48 px-3 py-2.5">{row.campaignName ?? "—"}</td><td className="max-w-48 px-3 py-2.5">{row.adSetName ?? "—"}</td><td className="max-w-48 px-3 py-2.5">{row.adName ?? "—"}</td><td className="px-3 py-2.5">{row.reportingStart}{row.reportingEnd !== row.reportingStart ? ` – ${row.reportingEnd}` : ""}</td><td className="px-3 py-2.5">{row.amountSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td className="px-3 py-2.5">{row.impressions.toLocaleString()}</td><td className="px-3 py-2.5">{row.clicks.toLocaleString()}</td><td className="px-3 py-2.5">{row.results.toLocaleString()}</td><td className="px-3 py-2.5"><Badge variant={variant}>{row.validationStatus}</Badge>{row.issues.length > 0 ? <p className="mt-1 max-w-64 text-xs text-muted-foreground">{row.issues.map((issue) => issue.message).join(" ")}</p> : null}</td></tr>;
}

function buildUploadForm(file: File, accountId: string, allowMismatch: boolean, mapping: MetaImportColumnMapping | null): FormData {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("accountId", accountId);
  formData.append("allowAccountMismatch", String(allowMismatch));
  if (mapping) formData.append("mapping", JSON.stringify(mapping));
  return formData;
}

function summaryCards(preview: MetaImportPreview) {
  return [
    ["Total", preview.summary.totalRows], ["Valid", preview.summary.validRows], ["Warnings", preview.summary.warningRows], ["Invalid", preview.summary.invalidRows],
    ["Duplicates", preview.summary.duplicateRows], ["Create", preview.summary.createRows], ["Update", preview.summary.updateRows], ["Skip", preview.summary.skipRows],
  ].map(([label, value]) => ({ label: String(label), value: Number(value).toLocaleString() }));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
