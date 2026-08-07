import { jsPDF } from "jspdf";

import type { SearchTermPmReport } from "./types";

export function createSearchTermPmReportPdf(report: SearchTermPmReport): Uint8Array {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 36;
  let y = 0;
  const header = () => {
    pdf.setFillColor(185, 0, 25); pdf.rect(0, 0, width, 76, "F");
    pdf.setTextColor(255,255,255); pdf.setFont("helvetica","bold"); pdf.setFontSize(21); pdf.text("Post-Optimization Report", margin, 34);
    pdf.setFont("helvetica","normal"); pdf.setFontSize(10); pdf.text(`${report.customerName} | CID ${report.googleCustomerId}`, margin, 54);
    pdf.text(`Published ${formatDate(report.publishedAt)} | Verified ${formatDate(report.verifiedAt)}`, width-margin, 54, { align: "right" }); y=98;
  };
  const footer = () => { pdf.setDrawColor("#dcdcdc"); pdf.line(margin,height-28,width-margin,height-28); pdf.setTextColor("#6e6e6e"); pdf.setFontSize(8); pdf.text(`Generated ${formatDate(report.generatedAt)}`,margin,height-14); pdf.text(`Page ${pdf.getNumberOfPages()}`,width-margin,height-14,{align:"right"}); };
  const page = (needed:number) => { if(y+needed<height-42)return; footer(); pdf.addPage(); header(); };
  header();
  pdf.setTextColor("#1e1e1e"); pdf.setFont("helvetica","bold"); pdf.setFontSize(13); pdf.text("Verified changes",margin,y); y+=15;
  pdf.setFont("helvetica","normal"); pdf.setFontSize(8); pdf.setTextColor("#646464");
  pdf.text(`Reporting period: ${report.reportingStartDate || "Unknown"} to ${report.reportingEndDate || "Unknown"} | Verification result: Verified`, margin, y); y+=18;
  const cards: Array<[string, string]> = [["Published exclusions",String(report.itemCount)],["Affected campaigns",String(report.affectedCampaignCount)],["Spend reviewed",`RM ${report.totalSpend.toFixed(2)}`],["Clicks / conversions",`${report.totalClicks} / ${report.totalConversions.toFixed(2)}`]];
  const cardWidth=(width-margin*2-24)/4; cards.forEach(([label,value],index)=>{const x=margin+index*(cardWidth+8);pdf.setFillColor("#f8f8f8");pdf.roundedRect(x,y,cardWidth,52,6,6,"F");pdf.setTextColor("#646464");pdf.setFontSize(8);pdf.text(label.toUpperCase(),x+10,y+16);pdf.setTextColor("#191919");pdf.setFontSize(15);pdf.text(value,x+10,y+38);}); y+=72;
  drawHeader(pdf,margin,y,width-margin*2); y+=24;
  for(const item of report.items){page(40); if(y===98){drawHeader(pdf,margin,y,width-margin*2);y+=24;} pdf.setDrawColor("#e8e8e8");pdf.line(margin,y+35,width-margin,y+35);pdf.setTextColor("#191919");pdf.setFont("helvetica","normal");pdf.setFontSize(8);pdf.text(clip(item.searchTerm,35),margin+7,y+15);pdf.text(clip(item.campaignName,30),margin+190,y+15);pdf.text(clip(item.adGroupName,22),margin+360,y+15);pdf.text(item.negativeMatchType,margin+485,y+15);pdf.text(clip(item.classification,20),margin+575,y+12);pdf.setFontSize(7);pdf.setTextColor("#646464");pdf.text(clip(item.reason,31),margin+575,y+24);pdf.setTextColor("#191919");pdf.setFontSize(8);pdf.text(`RM ${item.spend.toFixed(2)}`,margin+690,y+15);y+=36;}
  footer(); return new Uint8Array(pdf.output("arraybuffer"));
}

function drawHeader(pdf:jsPDF,x:number,y:number,width:number){pdf.setFillColor("#f5f5f5");pdf.rect(x,y,width,22,"F");pdf.setTextColor("#505050");pdf.setFont("helvetica","bold");pdf.setFontSize(8);const columns:Array<[string,number]>=[["Excluded search term",7],["Campaign",190],["Ad group",360],["Match type",485],["Classification",575],["Spend",690]];columns.forEach(([label,offset])=>pdf.text(label,x+offset,y+14));}
function clip(value:string,length:number){return value.length<=length?value:`${value.slice(0,length-3)}...`;}
function formatDate(value:string){const date=new Date(value.includes("T")?value:`${value.replace(" ","T")}Z`);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("en-MY",{dateStyle:"medium",timeStyle:"short"}).format(date);}
