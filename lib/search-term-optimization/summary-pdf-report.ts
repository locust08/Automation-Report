import { jsPDF } from "jspdf";

import type { SearchTermDecisionSummaryRow } from "./supabase-repository";

export function createAllAccountsDecisionSummaryPdf(rows: SearchTermDecisionSummaryRow[], decisionDate?:string): ArrayBuffer {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const accounts = groupAccounts(rows);
  let y = 0;

  const header = () => {
    pdf.setFillColor(185, 0, 25);
    pdf.rect(0, 0, width, 72, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(21);
    pdf.text("All-Account Search-Term Summary", margin, 33);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(decisionDate ? `Completed decisions for ${formatDate(decisionDate)}` : "Completed Approved and Negative decisions", margin, 52);
    pdf.text(`Generated ${new Date().toLocaleString("en-MY")}`, width - margin, 52, { align: "right" });
    y = 94;
  };
  const footer = () => {
    pdf.setDrawColor(220, 220, 220);
    pdf.line(margin, height - 27, width - margin, height - 27);
    pdf.setTextColor(110, 110, 110);
    pdf.setFontSize(8);
    pdf.text(`Page ${pdf.getNumberOfPages()}`, width - margin, height - 14, { align: "right" });
  };
  const ensure = (space: number) => {
    if (y + space < height - 38) return;
    footer();
    pdf.addPage();
    header();
  };

  header();
  const approved = rows.filter((row) => row.outcome === "approved");
  const negative = rows.filter((row) => row.outcome === "negative");
  drawSummaryCard(pdf, margin, y, 220, "ACCOUNTS COMPLETED", accounts.length, [35, 35, 35]);
  drawSummaryCard(pdf, margin + 232, y, 220, "APPROVED", approved.length, [5, 150, 105]);
  drawSummaryCard(pdf, margin + 464, y, 220, "NEGATIVE", negative.length, [220, 38, 38]);
  y += 84;

  if (accounts.length === 0) {
    pdf.setTextColor(80, 80, 80);
    pdf.setFontSize(11);
    pdf.text("No accounts currently have completed Approved or Negative decisions.", margin, y + 20);
  }

  for (const [accountIndex, account] of accounts.entries()) {
    if (accountIndex > 0) y += 20;
    ensure(95);
    pdf.setTextColor(20, 20, 20);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(`${clip(account.name, 58)} | CID ${account.id}`, margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(80, 80, 80);
    pdf.text(`Approved ${account.approved}  |  Negative ${account.negative}  |  Spend RM ${account.spend.toFixed(2)}  |  Clicks ${account.clicks}  |  Conversions ${account.conversions.toFixed(2)}`, margin, y + 15);
    y += 29;
    drawHeader(pdf, margin, y, width - margin * 2);
    y += 22;
    for (const row of account.rows) {
      ensure(28);
      drawRow(pdf, row, margin, y, width - margin * 2);
      y += 25;
    }
    y += 18;
  }

  footer();
  return pdf.output("arraybuffer");
}

function formatDate(value:string){return new Intl.DateTimeFormat("en-MY",{timeZone:"Asia/Kuala_Lumpur",day:"numeric",month:"short",year:"numeric"}).format(new Date(`${value}T00:00:00+08:00`));}

function groupAccounts(rows: SearchTermDecisionSummaryRow[]) {
  const grouped = new Map<string, SearchTermDecisionSummaryRow[]>();
  for (const row of rows) grouped.set(row.customerId, [...(grouped.get(row.customerId) ?? []), row]);
  return [...grouped.entries()].map(([id, accountRows]) => ({
    id,
    name: accountRows[0]?.customerName ?? "Google Ads account",
    rows: accountRows,
    approved: accountRows.filter((row) => row.outcome === "approved").length,
    negative: accountRows.filter((row) => row.outcome === "negative").length,
    spend: accountRows.reduce((sum, row) => sum + row.spend, 0),
    clicks: accountRows.reduce((sum, row) => sum + row.clicks, 0),
    conversions: accountRows.reduce((sum, row) => sum + row.conversions, 0),
  }));
}

function drawSummaryCard(pdf: jsPDF, x: number, y: number, width: number, label: string, value: number, color: [number, number, number]) {
  pdf.setFillColor(247, 247, 247);
  pdf.roundedRect(x, y, width, 56, 6, 6, "F");
  pdf.setTextColor(...color);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text(label, x + 12, y + 17);
  pdf.setFontSize(20);
  pdf.text(String(value), x + 12, y + 42);
}

function drawHeader(pdf: jsPDF, x: number, y: number, width: number) {
  pdf.setFillColor(245, 245, 245);
  pdf.rect(x, y, width, 22, "F");
  pdf.setTextColor(75, 75, 75);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  [["Outcome", 7], ["Search term", 75], ["Campaign", 285], ["Clicks", 495], ["Spend", 548], ["Conv.", 615], ["Classification", 670]].forEach(([label, offset]) => pdf.text(String(label), x + Number(offset), y + 14));
}

function drawRow(pdf: jsPDF, row: SearchTermDecisionSummaryRow, x: number, y: number, width: number) {
  pdf.setDrawColor(232, 232, 232);
  pdf.line(x, y + 24, x + width, y + 24);
  pdf.setTextColor(row.outcome === "approved" ? 5 : 220, row.outcome === "approved" ? 150 : 38, row.outcome === "approved" ? 105 : 38);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text(row.outcome === "approved" ? "Approved" : "Negative", x + 7, y + 15);
  pdf.setTextColor(25, 25, 25);
  pdf.setFont("helvetica", "normal");
  pdf.text(clip(row.searchTerm, 38), x + 75, y + 15);
  pdf.text(clip(row.campaign, 37), x + 285, y + 15);
  pdf.text(String(row.clicks), x + 495, y + 15);
  pdf.text(`RM ${row.spend.toFixed(2)}`, x + 548, y + 15);
  pdf.text(row.conversions.toFixed(2), x + 615, y + 15);
  pdf.text(clip(row.classification, 23), x + 670, y + 15);
}

function clip(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
