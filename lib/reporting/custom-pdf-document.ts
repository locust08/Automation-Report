import { toPng } from "html-to-image";

export const isAdPerformanceRow = (summaryMarker?: string) => summaryMarker !== "true";

export const performanceColumnIndexes = (headers: string[]) => headers.flatMap((header,index) => /^(creative|actions)$/i.test(header.trim()) ? [] : [index]);

type ChartRow = { label: string; value: string; width: string };
type Section = { title: string; headers: string[]; rows: string[][]; charts: ChartRow[]; notes: string[] };
type Creative = { label: string; source: string; alt: string };
type Ad = { label: string; headers: string[]; values: string[]; creatives: Creative[] };

const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g," ").trim() ?? "";
function cleanText(element: Element) {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('[data-report-export-exclude], img, table').forEach(node => node.remove());
  return text(clone);
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, value?: string) {
  const node = document.createElement(tag);
  if (value) node.textContent = value;
  return node;
}

/** Read the prepared, complete report into content blocks, never page pixels. */
export function readCustomPdfContent(root: HTMLElement) {
  const report = root.querySelector<HTMLElement>('[data-standalone-report]');
  if (!report) throw new Error("No standalone report is available.");
  const demand = report.dataset.standaloneReport === "demand-gen";
  const sections: Section[] = [];
  const ads: Ad[] = [];
  const tables = Array.from(report.querySelectorAll<HTMLTableElement>("table"));
  for (const table of tables) {
    const headerRow = table.tHead?.rows[0];
    if (!headerRow) continue;
    const headers = Array.from(headerRow.cells).map(cell => text(cell).replace(/[↑↓]/g,"").trim());
    const indexes = performanceColumnIndexes(headers);
    const card = table.closest('[data-slot="card"]');
    let title = text(card?.querySelector("h3"));
    if (!title) {
      const labels: string[] = [];
      let ancestor: Element | null = table.parentElement;
      while (ancestor && ancestor !== report) {
        const heading = Array.from(ancestor.children).find(child => child.matches("h3,h4,h5"));
        if (heading) labels.unshift(text(heading));
        ancestor = ancestor.parentElement;
      }
      title = labels.join(" / ") || "Performance";
      let nested: HTMLTableElement | null = table;
      const context: string[] = [];
      while (nested?.closest("td")) {
        const containerRow: Element | null = nested.closest("td")?.parentElement ?? null;
        const preceding = containerRow?.previousElementSibling as HTMLTableRowElement | null;
        if (preceding?.cells[0]) context.unshift(cleanText(preceding.cells[0]));
        nested = containerRow?.closest("table") ?? null;
      }
      if (context.length) title += ` · ${context.join(" / ")}`;
    }
    const rows = Array.from(table.tBodies).flatMap(body => Array.from(body.rows))
      .filter(row => !Array.from(row.cells).some(cell => cell.querySelector("table")));
    const adTable = headers.some(header => /^creative$/i.test(header));
    const summaryRows: HTMLTableRowElement[] = [];
    for (const row of rows) {
      const label = `${title} · ${cleanText(row.cells[0])}${demand && row.cells[1] ? ` · ${cleanText(row.cells[1])}` : ""}`;
      if (adTable && isAdPerformanceRow(row.dataset.pdfSummaryRow)) {
        ads.push({label,headers:indexes.map(index => headers[index]),values:indexes.map(index => cleanText(row.cells[index])),
          creatives:Array.from(row.querySelectorAll<HTMLElement>("img, [data-pdf-creative-source]")).map(image => ({label,source:image.dataset.pdfCreativeSource || (image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src,alt:image.dataset.pdfCreativeAlt || (image as HTMLImageElement).alt}))});
      } else summaryRows.push(row);
    }
    if (adTable && !summaryRows.length && rows.length) continue;
    sections.push({title,headers:indexes.map(index => headers[index]),rows:summaryRows.map(row => indexes.map(index => cleanText(row.cells[index]))),
      notes: card ? Array.from(card.querySelectorAll("p")).map(text).filter(Boolean) : [],
      charts: card ? Array.from(card.querySelectorAll<HTMLElement>('[data-demand-chart-label-row]')).map(label => ({label:text(label.children[0]),value:text(label.children[1]),width:(label.nextElementSibling?.firstElementChild as HTMLElement | null)?.style.width || "0%"})) : []});
  }
  if (demand) {
    // Account summary and analysis precede the compact Ads table and gallery.
    sections.sort((a,b) => Number(a.title === "Ads")-Number(b.title === "Ads"));
    for (const title of ["In-market","Affinity"]) {
      if (!sections.some(section => section.title === title)) sections.splice(title === "In-market" ? 0 : 1,0,{title,headers:[],rows:[],charts:[],notes:[`No measured ${title} interest observations available.`]});
    }
  }
  const summary = report.querySelector('[data-slot="card"]');
  return { title:text(root.querySelector('[data-report-export-title]')) || text(root.querySelector("h1")),
    accountId:["googleAccountId","metaAccountId","tiktokAccountId","accountId"].map(key => new URLSearchParams(window.location.search).get(key)).find(Boolean) ?? "",
    dates:text(root.querySelector('[data-report-export-date-label]')),
    reportTitle:demand ? "Demand Gen Analysis" : "Campaign Breakdown",
    scope:demand && summary ? Array.from(summary.querySelectorAll("p:not([role='alert'])")).map(text).filter(Boolean) : Array.from(report.querySelectorAll("p")).filter(node => !node.closest('[role="alert"]')).map(text).filter(Boolean),
    warnings:Array.from(report.querySelectorAll('[role="alert"]')).map(text).filter(Boolean),sections,ads };
}

const css = `
.custom-report-pdf, .custom-report-pdf * { box-sizing:border-box; }
.custom-report-pdf { position:fixed; left:-20000px; top:0; font-family:Arial,sans-serif; color:#171717; font-size:14px; line-height:1.35; }
.custom-report-pdf .pdf-page { width:792px; height:1120px; padding:38px; background:white; display:block; }
.custom-report-pdf .pdf-header { flex:none; border-bottom:2px solid #b60019; padding-bottom:10px; margin-bottom:12px; }
.custom-report-pdf h1 { font-size:23px; overflow-wrap:anywhere; line-height:1.2; margin:0 0 6px; }
.custom-report-pdf .pdf-subtitle { font-size:12px; color:#555; }
.custom-report-pdf .pdf-body { flex:1; min-height:0; overflow:hidden; }
.custom-report-pdf h2 { font-size:19px; margin:0 0 8px; overflow-wrap:anywhere; }
.custom-report-pdf p { font-size:12px; margin:0 0 8px; color:#555; }
.custom-report-pdf .pdf-section { margin-bottom:14px; }
.custom-report-pdf .pdf-columns { display:grid; grid-template-columns:minmax(0,1fr); gap:20px; align-items:start; }
.custom-report-pdf table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:11px; }
.custom-report-pdf th, .custom-report-pdf td { padding:7px 8px; border-bottom:1px solid #ddd; overflow-wrap:anywhere; vertical-align:top; text-align:right; }
.custom-report-pdf th:first-child, .custom-report-pdf td:first-child { text-align:left; width:28%; }
.custom-report-pdf th { background:#fff0f2; color:#970019; font-weight:600; }
.custom-report-pdf .pdf-chart-row { margin-bottom:8px; font-size:12px; }
.custom-report-pdf .pdf-chart-label { display:flex; justify-content:space-between; gap:8px; }
.custom-report-pdf .pdf-track { height:7px; margin-top:4px; background:#eee; }
.custom-report-pdf .pdf-bar { height:7px; background:#dc0018; }
.custom-report-pdf .pdf-gallery-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin-bottom:16px; }
.custom-report-pdf figure { margin:0; padding:8px; border:1px solid #ddd; }
.custom-report-pdf figure img { display:block; width:100%; height:220px; object-fit:contain; background:#fafafa; }
.custom-report-pdf figcaption { font-size:12px; margin-top:6px; overflow-wrap:anywhere; }
.custom-report-pdf .pdf-footer { flex:none; padding-top:10px; font-size:10px; color:#777; text-align:right; }
`;

/** Compose real pages first; each capture is exactly one complete PDF page. */
export async function createCustomReportPdf(root: HTMLElement, onPage?: (image:string) => void) {
  const content = readCustomPdfContent(root);
  const host = el("div"); host.className = "custom-report-pdf";
  const style = el("style",css);
  document.head.appendChild(style); document.body.appendChild(host);
  let body: HTMLDivElement;
  const pages: HTMLDivElement[] = [];
  const newPage = () => {
    const page = el("div"); page.className = "pdf-page"; page.dataset.customPdfPage = String(pages.length+1);
    const header = el("header"); header.className = "pdf-header";
    header.append(el("h1",content.title));
    if (content.accountId && !content.title.includes(content.accountId)) header.append(el("div",`Account ID: ${content.accountId}`));
    const subtitle = el("div",`${content.reportTitle} · ${content.dates}`); subtitle.className = "pdf-subtitle"; header.append(subtitle);
    body = el("div"); body.className = "pdf-body";
    const footer = el("footer"); footer.className = "pdf-footer";
    page.append(header,body,footer); host.append(page); pages.push(page);
    body.style.height = `${1120 - 76 - header.offsetHeight - 12 - 24}px`;
  };
  const fits = () => body.scrollHeight <= body.clientHeight + 1;
  const appendBlock = (block: HTMLElement) => {
    body.append(block);
    if (!fits()) { block.remove(); newPage(); body.append(block); }
    if (!fits()) throw new Error("A report block is too large for one page. Shorten its label and retry.");
  };
  try {
    newPage();
    const intro = el("section"); intro.className = "pdf-section"; intro.append(el("h2",content.reportTitle));
    [...content.scope,...content.warnings].forEach(note => intro.append(el("p",note)));
    appendBlock(intro);
    for (const section of content.sections) {
      let block: HTMLElement, tbody: HTMLTableSectionElement, chart: HTMLElement;
      let count = 0;
      const startTable = (continued=false) => {
        block = el("section"); block.className = "pdf-section";
        block.append(el("h2",`${section.title}${continued ? " (continued)" : ""}`));
        section.notes.forEach(note => block.append(el("p",note)));
        const columns = el("div"); if (section.charts.length) columns.className = "pdf-columns";
        const table = el("table"), thead = el("thead"), header = el("tr");
        section.headers.forEach(label => header.append(el("th",label))); thead.append(header);
        tbody = el("tbody"); table.append(thead,tbody); chart = el("div");
        columns.append(table); if (section.charts.length) columns.append(chart); block.append(columns); body.append(block); count=0;
      };
      startTable();
      const length = Math.max(section.rows.length,section.charts.length);
      for (let index=0; index<length; index++) {
        const row = el("tr"); section.rows[index]?.forEach(value => row.append(el("td",value)));
        const observation = section.charts[index], barRow = el("div"); barRow.className = "pdf-chart-row";
        if (observation) {
          const label = el("div"); label.className = "pdf-chart-label"; label.append(el("span",observation.label),el("span",observation.value));
          const track = el("div"), bar = el("div"); track.className = "pdf-track"; bar.className = "pdf-bar"; bar.style.width=observation.width; track.append(bar); barRow.append(label,track);
        }
        if (section.rows[index]) tbody!.append(row); if (observation) chart!.append(barRow);
        if (!fits()) {
          row.remove(); barRow.remove(); if (!count) block!.remove(); newPage(); startTable(true);
          if (section.rows[index]) tbody!.append(row); if (observation) chart!.append(barRow);
          if (!fits()) throw new Error("A performance row is too tall for one PDF page.");
        }
        count++;
      }
      if (!length && !fits()) { block!.remove(); appendBlock(block!); }
    }
    for (const ad of content.ads) {
      newPage();
      body!.dataset.adLabel = ad.label;
      const adHeader = (continued = false) => {
        body!.append(el("h2",`${ad.label}${continued ? " (continued)" : ""}`));
        const table = el("table"), head = el("thead"), header = el("tr"), rows = el("tbody"), row = el("tr");
        ad.headers.forEach(value => header.append(el("th",value)));
        ad.values.forEach(value => row.append(el("td",value)));
        head.append(header); rows.append(row); table.append(head,rows); body!.append(table);
        body!.append(el("h2",continued ? "Creatives (continued)" : "Creatives"));
      };
      adHeader();
      if (!ad.creatives.length) body!.append(el("p","No creative images available for this ad."));
      for (let index=0; index<ad.creatives.length; index+=2) {
        const row=el("div"); row.className="pdf-gallery-row";
        for(const [creativeIndex,creative] of ad.creatives.slice(index,index+2).entries()) {
          const card=el("figure"),image=el("img"); image.crossOrigin="anonymous"; image.src=creative.source; image.alt=creative.alt;
          card.append(image,el("figcaption",`Creative ${index+creativeIndex+1} of ${ad.creatives.length}`)); row.append(card);
        }
        body!.append(row);
        if(!fits()) {
          row.remove(); newPage(); body!.dataset.adLabel=ad.label; adHeader(true); body!.append(row);
        }
        if(!fits()) throw new Error("An ad block is too tall for one PDF page.");
      }
      if(!fits()) throw new Error("An ad's metrics are too tall for one PDF page.");
    }
    const images=Array.from(host.querySelectorAll("img"));
    await Promise.all(images.map(image => new Promise<void>(resolve => {
      const finish=() => { image.onload=null; image.onerror=null; clearTimeout(timer); resolve(); };
      const timer=setTimeout(finish,15000);
      image.onload=finish; image.onerror=finish;
      if(image.complete) finish();
    })));
    // Replace failures explicitly, retaining every creative's caption/reference.
    images.filter(image => !image.naturalWidth).forEach(image => {
      const placeholder=el("div","Creative image unavailable");
      placeholder.style.height="220px"; placeholder.style.background="#fafafa"; placeholder.style.display="grid"; placeholder.style.placeItems="center"; image.replaceWith(placeholder);
    });
    const { jsPDF } = await import("jspdf");
    const pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:true});
    for(const [index,page] of pages.entries()) {
      page.querySelector("footer")!.textContent=`Page ${index+1} of ${pages.length}`;
      const image=await toPng(page,{width:792,height:1120,pixelRatio:2,cacheBust:false,backgroundColor:"#ffffff"});
      if(index) pdf.addPage("a4","portrait");
      pdf.addImage(image,"PNG",0,0,210,297,`custom-page-${index}`,"FAST"); onPage?.(image);
    }
    return pdf.output("blob");
  } finally { host.remove(); style.remove(); }
}
