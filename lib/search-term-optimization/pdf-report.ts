import { jsPDF } from "jspdf";

import type { OptimizationDashboardPayload, OptimizationResult } from "./types";

type DecisionSection = {
  title: "Approved" | "Negative";
  rows: OptimizationResult[];
  color: [number, number, number];
};

export function createSearchTermDecisionPdf(data: OptimizationDashboardPayload): ArrayBuffer {
  const approved = data.results.filter((row) => row.reviewStatus === "approved_for_publishing");
  const negative = data.results.filter((row) => row.reviewStatus === "approver_rejected");
  const sections: DecisionSection[] = [
    { title: "Approved", rows: approved, color: [5, 150, 105] },
    { title: "Negative", rows: negative, color: [220, 38, 38] },
  ];
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 36;
  let y = margin;

  const addHeader = () => {
    pdf.setFillColor(185, 0, 25);
    pdf.rect(0, 0, pageWidth, 72, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.text("Search-Term Decision Report", margin, 34);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`${data.account.customerName} | CID ${data.account.customerId}`, margin, 53);
    pdf.text(`Reporting period: ${data.account.reportingPeriod.startDate} to ${data.account.reportingPeriod.endDate}`, pageWidth - margin, 53, { align: "right" });
    y = 96;
  };
  const addFooter = () => {
    pdf.setDrawColor(220, 220, 220);
    pdf.line(margin, pageHeight - 28, pageWidth - margin, pageHeight - 28);
    pdf.setTextColor(110, 110, 110);
    pdf.setFontSize(8);
    pdf.text(`Generated ${new Date().toLocaleString("en-MY")}`, margin, pageHeight - 15);
    pdf.text(`Page ${pdf.getNumberOfPages()}`, pageWidth - margin, pageHeight - 15, { align: "right" });
  };
  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - 42) return;
    addFooter();
    pdf.addPage();
    addHeader();
  };

  addHeader();
  pdf.setTextColor(20, 20, 20);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text("Outcome summary", margin, y);
  y += 15;
  const summaryWidth = (pageWidth - margin * 2 - 12) / 2;
  sections.forEach((section, index) => {
    const x = margin + index * (summaryWidth + 12);
    pdf.setFillColor(section.title === "Approved" ? 236 : 254, section.title === "Approved" ? 253 : 242, section.title === "Approved" ? 245 : 242);
    pdf.roundedRect(x, y, summaryWidth, 62, 6, 6, "F");
    pdf.setTextColor(...section.color);
    pdf.setFontSize(10);
    pdf.text(section.title.toUpperCase(), x + 12, y + 17);
    pdf.setFontSize(20);
    pdf.text(String(section.rows.length), x + 12, y + 42);
    pdf.setTextColor(70, 70, 70);
    pdf.setFontSize(9);
    pdf.text(`Spend RM ${sum(section.rows, "spend").toFixed(2)} | Clicks ${sum(section.rows, "clicks")} | Conversions ${sum(section.rows, "conversions").toFixed(2)}`, x + 60, y + 39);
  });
  y += 84;

  for (const section of sections) {
    ensureSpace(54);
    pdf.setTextColor(...section.color);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text(`${section.title} (${section.rows.length})`, margin, y);
    y += 14;
    drawTableHeader(pdf, margin, y, pageWidth - margin * 2);
    y += 22;
    if (section.rows.length === 0) {
      pdf.setTextColor(100, 100, 100);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text(`No terminal ${section.title.toLowerCase()} search terms.`, margin + 7, y + 12);
      y += 28;
      continue;
    }
    for (const row of section.rows) {
      ensureSpace(30);
      if (y === 96) {
        pdf.setTextColor(...section.color);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.text(`${section.title} (continued)`, margin, y);
        y += 14;
        drawTableHeader(pdf, margin, y, pageWidth - margin * 2);
        y += 22;
      }
      drawTableRow(pdf, row, margin, y, pageWidth - margin * 2);
      y += 26;
    }
    y += 12;
  }
  addFooter();
  return pdf.output("arraybuffer");
}

function sum(rows: OptimizationResult[], field: "spend" | "clicks" | "conversions") {
  return rows.reduce((total, row) => total + row[field], 0);
}

function drawTableHeader(pdf: jsPDF, x: number, y: number, width: number) {
  pdf.setFillColor(245, 245, 245);
  pdf.rect(x, y, width, 22, "F");
  pdf.setTextColor(80, 80, 80);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  const columns = [["Search term", 7], ["Campaign", 250], ["Clicks", 455], ["Spend", 510], ["Conv.", 575], ["Classification", 635]] as const;
  columns.forEach(([label, offset]) => pdf.text(label, x + offset, y + 14));
}

function drawTableRow(pdf: jsPDF, row: OptimizationResult, x: number, y: number, width: number) {
  pdf.setDrawColor(232, 232, 232);
  pdf.line(x, y + 25, x + width, y + 25);
  pdf.setTextColor(25, 25, 25);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(clip(row.searchTerm, 48), x + 7, y + 16);
  pdf.text(clip(row.campaign, 38), x + 250, y + 16);
  pdf.text(String(row.clicks), x + 455, y + 16);
  pdf.text(`RM ${row.spend.toFixed(2)}`, x + 510, y + 16);
  pdf.text(row.conversions.toFixed(2), x + 575, y + 16);
  pdf.text(clip(row.classification, 25), x + 635, y + 16);
}

function clip(value: string, length: number) {
  return value.length <= length ? value : `${value.slice(0, length - 3)}...`;
}
