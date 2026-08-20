import { jsPDF } from "jspdf";

export type TrafficQualityReportSnapshot = {
  accountId: unknown;
  accountName: unknown;
  verifiedAt: unknown;
  items: Array<{
    campaign?: unknown;
    optimizationType?: unknown;
    excludedItem?: unknown;
    reason?: unknown;
    outcome?: unknown;
    attempts?: unknown;
    error?: unknown;
  }>;
};

export function createTrafficQualityReportPdf(snapshot: TrafficQualityReportSnapshot): Uint8Array {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 36;
  let y = 98;
  const header = () => {
    pdf.setFillColor(185, 0, 25);
    pdf.rect(0, 0, width, 76, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(20);
    pdf.text("Traffic Quality — Verified Changes", margin, 34);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`${textValue(snapshot.accountName)} | CID ${textValue(snapshot.accountId)}`, margin, 54);
    pdf.text(`Verified ${formatDate(snapshot.verifiedAt)}`, width - margin, 54, { align: "right" });
  };
  const footer = () => {
    pdf.setDrawColor(220, 220, 220);
    pdf.line(margin, height - 28, width - margin, height - 28);
    pdf.setTextColor(100, 100, 100);
    pdf.setFontSize(8);
    pdf.text(`Page ${pdf.getNumberOfPages()}`, width - margin, height - 14, { align: "right" });
  };
  const tableHeader = () => {
    pdf.setFillColor(245, 245, 245);
    pdf.rect(margin, y, width - margin * 2, 22, "F");
    pdf.setTextColor(70, 70, 70);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    [["Campaign", 8], ["Change", 175], ["Excluded item", 315], ["Outcome", 560], ["Attempts", 650], ["Reason / error", 710]].forEach(([label, offset]) => pdf.text(String(label), margin + Number(offset), y + 14));
    y += 22;
  };
  const nextPage = () => {
    footer();
    pdf.addPage();
    header();
    y = 98;
    tableHeader();
  };

  header();
  pdf.setTextColor(25, 25, 25);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text(`${snapshot.items.length} M03 result${snapshot.items.length === 1 ? "" : "s"}`, margin, y);
  y += 20;
  tableHeader();
  for (const item of snapshot.items) {
    if (y + 38 > height - 35) nextPage();
    const excluded = typeof item.excludedItem === "string" ? item.excludedItem : JSON.stringify(item.excludedItem ?? null);
    const reason = [textValue(item.reason), textValue(item.error)].filter((value) => value && value !== "—").join("; ");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(25, 25, 25);
    pdf.text(clip(textValue(item.campaign), 27), margin + 8, y + 15);
    pdf.text(clip(textValue(item.optimizationType), 23), margin + 175, y + 15);
    pdf.text(clip(excluded, 38), margin + 315, y + 15);
    pdf.text(clip(textValue(item.outcome), 14), margin + 560, y + 15);
    pdf.text(textValue(item.attempts), margin + 650, y + 15);
    pdf.setFontSize(7);
    pdf.text(clip(reason || "—", 24), margin + 710, y + 15);
    pdf.setDrawColor(232, 232, 232);
    pdf.line(margin, y + 34, width - margin, y + 34);
    y += 35;
  }
  footer();
  return new Uint8Array(pdf.output("arraybuffer"));
}

function textValue(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function clip(value: string, length: number) {
  return value.length <= length ? value : `${value.slice(0, length - 3)}...`;
}

function formatDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? textValue(value) : new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
