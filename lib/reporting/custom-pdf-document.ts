import { toPng } from "html-to-image";

export const isAdPerformanceRow = (summaryMarker?: string) => summaryMarker !== "true";

export const performanceColumnIndexes = (headers: string[]) => headers.flatMap((header,index) => /^(creative|actions)$/i.test(header.trim()) ? [] : [index]);

export const adColumnIndexes = (headers: string[]) => performanceColumnIndexes(headers).filter(index => !/^campaign$/i.test(headers[index].trim()));
export function groupAdsByCampaign<T extends { campaign: string }>(ads: T[]): T[] {
  const groups = new Map<string,T[]>();
  for (const ad of ads) {
    const group = groups.get(ad.campaign) ?? [];
    group.push(ad); groups.set(ad.campaign,group);
  }
  return Array.from(groups.values()).flat();
}

export function metricColumnGroups(columnCount: number): number[][] {
  if (columnCount <= 7) return [Array.from({length:columnCount},(_,index)=>index)];
  const groups: number[][]=[];
  for(let offset=1;offset<columnCount;offset+=5) groups.push([0,...Array.from({length:Math.min(5,columnCount-offset)},(_,index)=>offset+index)]);
  return groups;
}

type ChartRow = { label: string; value: string; width: string };
type Section = { title: string; headers: string[]; rows: string[][]; charts: ChartRow[]; notes: string[] };
type Creative = { label: string; source: string; alt: string };
type Ad = { campaign: string; name: string; label: string; headers: string[]; values: string[]; creatives: Creative[] };

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
        const adIndexes=adColumnIndexes(headers);
        ads.push({label,campaign:demand ? cleanText(row.cells[1]) : title,name:cleanText(row.cells[0]),headers:adIndexes.map(index => headers[index]),values:adIndexes.map(index => cleanText(row.cells[index])),
          creatives:Array.from(row.querySelectorAll<HTMLElement>("img, [data-pdf-creative-source]")).slice(0,1).map(image => ({label,source:image.dataset.pdfCreativeSource || (image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src,alt:image.dataset.pdfCreativeAlt || (image as HTMLImageElement).alt}))});
      } else summaryRows.push(row);
    }
    if (adTable && !summaryRows.length && rows.length) continue;
    sections.push({title,headers:indexes.map(index => headers[index]),rows:summaryRows.map(row => indexes.map(index => cleanText(row.cells[index]))),
      notes: card ? Array.from(card.querySelectorAll("p")).map(text).filter(Boolean) : [],
      charts: card ? Array.from(card.querySelectorAll<HTMLElement>('[data-demand-chart-label-row]')).map(label => ({label:text(label.children[0]),value:text(label.children[1]),width:(label.nextElementSibling?.firstElementChild as HTMLElement | null)?.style.width || "0%"})) : []});
  }
  if (demand) {
    // Account summary and analysis precede the grouped Ads tables.
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
    scope:demand && summary ? Array.from(summary.querySelectorAll("p:not([role='alert'])")).map(text).filter(Boolean) : Array.from(report.querySelectorAll("p")).filter(node => !node.closest('table, [role="alert"], [data-pdf-creative-meta], [data-report-export-exclude]')).map(text).filter(Boolean),
    warnings:Array.from(report.querySelectorAll('[role="alert"]')).map(text).filter(Boolean),sections,ads };
}

const css = `
.custom-report-pdf, .custom-report-pdf * { box-sizing:border-box; }
.custom-report-pdf { position:fixed; left:-20000px; top:0; font-family:Arial,sans-serif; color:#171717; font-size:14px; line-height:1.35; }
.custom-report-pdf .pdf-page { width:792px; height:1120px; padding:38px; background:#f0f0f0; display:block; }
.custom-report-pdf .pdf-header { flex:none; border-radius:24px; background:#9f0019 url('/headerbackground.png') center/cover no-repeat; color:white; padding:20px; margin-bottom:16px; }
.custom-report-pdf h1 { font-size:23px; overflow-wrap:anywhere; line-height:1.2; margin:0 0 6px; }
.custom-report-pdf .pdf-subtitle { display:inline-block; font-size:12px; color:#5f5f5f; background:#efefef; border-radius:12px; padding:8px 12px; margin-top:6px; }
.custom-report-pdf .pdf-body { flex:1; min-height:0; overflow:hidden; }
.custom-report-pdf h2 { font-size:20px; font-weight:600; line-height:1.45; margin:0 0 16px; overflow-wrap:anywhere; }
.custom-report-pdf .pdf-section > h2::before { content:''; display:inline-block; vertical-align:middle; width:20px; height:20px; border-radius:6px; background:#e10600; margin-right:10px; }
.custom-report-pdf p { font-size:12px; margin:0 0 8px; color:#555; }
.custom-report-pdf .pdf-section { margin-bottom:16px; padding:18px; border:1px solid #dedede; border-radius:24px; background:white; display:flow-root; }
.custom-report-pdf .pdf-columns { display:grid; grid-template-columns:minmax(0,1fr); gap:20px; align-items:start; }
.custom-report-pdf table { width:100%; border-collapse:collapse; table-layout:auto; font-size:12px; line-height:1.5; margin-bottom:12px; }
.custom-report-pdf th, .custom-report-pdf td { padding:9px 8px; border-bottom:1px solid #ddd; overflow-wrap:normal; vertical-align:top; text-align:right; }
.custom-report-pdf th:first-child, .custom-report-pdf td:first-child { text-align:left; width:26%; overflow-wrap:anywhere; }
.custom-report-pdf td:not(:first-child) { white-space:nowrap; }
.custom-report-pdf th { background:#fff0f2; color:#970019; font-weight:600; }
.custom-report-pdf .pdf-chart-row { margin-bottom:8px; font-size:12px; }
.custom-report-pdf .pdf-chart-label { display:flex; justify-content:space-between; gap:8px; }
.custom-report-pdf .pdf-track { height:10px; margin-top:6px; border-radius:8px; background:#eee; }
.custom-report-pdf .pdf-bar { height:10px; border-radius:8px; background:#e10600; }
.custom-report-pdf .pdf-ad-table { table-layout:fixed; font-size:11px; }
.custom-report-pdf .pdf-ad-table th, .custom-report-pdf .pdf-ad-table td { padding:8px 6px; }
.custom-report-pdf .pdf-ad-table th { overflow-wrap:anywhere; }
.custom-report-pdf .pdf-ad-table th:first-child, .custom-report-pdf .pdf-ad-table td:first-child { width:auto; }
.custom-report-pdf .pdf-ad-table .pdf-creative-cell { text-align:left; white-space:normal; }
.custom-report-pdf figure { width:112px; margin:0; }
.custom-report-pdf figure img { display:block; width:112px; height:84px; object-fit:contain; background:#fafafa; border-radius:8px; }
.custom-report-pdf .pdf-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; border-top:3px solid #e10600; padding-top:8px; font-size:10px; color:#777; }
.custom-report-pdf .pdf-footer img { width:132px; height:24px; object-fit:contain; }
`;

/** Compose real pages first; each capture is exactly one complete PDF page. */
export async function createCustomReportPdf(root: HTMLElement, onPage?: (image:string) => void) {
  const content = readCustomPdfContent(root);
  const host = el("div"); host.className = "custom-report-pdf";
  host.style.fontFamily = getComputedStyle(root).fontFamily;
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
    const logo = el("img"); logo.src = "/locus-t-logo-25.png"; logo.alt = "LOCUS-T logo";
    const pageNumber = el("span"); pageNumber.dataset.pdfPageNumber = "true";
    footer.append(logo,el("span","LOCUS-T SDN BHD"),pageNumber);
    page.append(header,body,footer); host.append(page); pages.push(page);
    body.style.height = `${1120 - 76 - header.offsetHeight - 16 - 40}px`;
  };
  const fits = () => body.scrollHeight <= body.clientHeight + 1;
  const appendBlock = (block: HTMLElement) => {
    body.append(block);
    if (!fits()) { block.remove(); newPage(); body.append(block); }
    if (!fits()) throw new Error("A report block is too large for one page. Shorten its label and retry.");
  };
  try {
    await document.fonts.ready;
    newPage();
    const intro = el("section"); intro.className = "pdf-section"; intro.append(el("h2",content.reportTitle));
    [...content.scope,...content.warnings].forEach(note => intro.append(el("p",note)));
    appendBlock(intro);
    for (const section of content.sections.flatMap(section => metricColumnGroups(section.headers.length).map((indexes,groupIndex,groups) => ({...section,
      title:groups.length>1 ? `${section.title} · Metrics ${groupIndex+1} of ${groups.length}` : section.title,
      headers:indexes.map(index=>section.headers[index]), rows:section.rows.map(row=>indexes.map(index=>row[index]))})))) {
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
    const campaigns = new Map<string, Ad[]>();
    for (const ad of groupAdsByCampaign(content.ads)) {
      const ads = campaigns.get(ad.campaign) ?? [];
      ads.push(ad); campaigns.set(ad.campaign, ads);
    }
    for (const [campaign, ads] of campaigns) {
      const groups = metricColumnGroups(ads[0].headers.length);
      for (const [groupIndex, indexes] of groups.entries()) {
        let block: HTMLElement, tbody: HTMLTableSectionElement;
        let count = 0;
        const startTable = (continued = false) => {
          block = el("section"); block.className = "pdf-section";
          const metrics = groups.length > 1 ? ` · Metrics ${groupIndex + 1} of ${groups.length}` : "";
          block.append(el("h2", `${campaign}${metrics}${continued ? " (continued)" : ""}`));
          const table = el("table"); table.className = "pdf-ad-table";
          const columns = el("colgroup"), name = el("col"), creative = el("col");
          name.style.width = "22%"; creative.style.width = "124px";
          columns.append(name, creative);
          indexes.slice(1).forEach(() => columns.append(el("col")));
          const head = el("thead"), header = el("tr");
          const creativeHeader = el("th", "Creative"); creativeHeader.className = "pdf-creative-cell";
          header.append(el("th", ads[0].headers[indexes[0]]), creativeHeader);
          indexes.slice(1).forEach(index => header.append(el("th", ads[0].headers[index])));
          head.append(header); tbody = el("tbody");
          table.append(columns, head, tbody); block.append(table); body!.append(block); count = 0;
        };
        startTable();
        for (const ad of ads) {
          const row = el("tr"); row.dataset.pdfAdLabel = ad.label;
          row.append(el("td", ad.values[indexes[0]]));
          const cell = el("td"); cell.className = "pdf-creative-cell";
          const creative = ad.creatives[0];
          if (creative) {
            const card = el("figure"), image = el("img");
            image.crossOrigin = "anonymous"; image.src = creative.source; image.alt = creative.alt;
            card.append(image);
            cell.append(card);
          } else cell.append(el("p", "No creative images available for this ad."));
          row.append(cell);
          indexes.slice(1).forEach(index => row.append(el("td", ad.values[index])));
          tbody!.append(row);
          if (!fits()) {
            row.remove();
            if (!count) block!.remove();
            newPage(); startTable(count > 0); tbody!.append(row);
            if (!fits()) throw new Error("An ad row is too tall for one PDF page.");
          }
          count++;
        }
      }
    }
    const images=Array.from(host.querySelectorAll("img"));
    await Promise.all(images.map(image => new Promise<void>(resolve => {
      const finish=() => { image.onload=null; image.onerror=null; clearTimeout(timer); resolve(); };
      const timer=setTimeout(finish,15000);
      image.onload=finish; image.onerror=finish;
      if(image.complete) finish();
    })));
    // Embed already-loaded CORS-safe pixels once. Re-fetching provider URLs during
    // serialization can fail (expired/transient thumbnails) and reject the whole page.
    for (const image of images) {
      try {
        if (!image.naturalWidth) throw new Error("Image unavailable");
        const canvas=document.createElement("canvas");
        const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
        canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
        canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        const context=canvas.getContext("2d");
        if (!context) throw new Error("Image canvas unavailable");
        context.drawImage(image,0,0,canvas.width,canvas.height);
        image.src=canvas.toDataURL("image/png");
        await image.decode();
      } catch {
        const footerImage = Boolean(image.closest(".pdf-footer"));
        const placeholder=el("div",footerImage ? "LOCUS-T" : "Creative image unavailable");
        placeholder.style.height=footerImage ? "24px" : "84px";
        if (!footerImage) placeholder.style.width="112px";
        if (footerImage) placeholder.style.width="132px";
        placeholder.style.background="#fafafa"; placeholder.style.display="grid"; placeholder.style.placeItems="center"; image.replaceWith(placeholder);
      }
    }
    const { jsPDF } = await import("jspdf");
    const pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:true});
    for(const [index,page] of pages.entries()) {
      page.querySelector('[data-pdf-page-number]')!.textContent=`Page ${index+1} of ${pages.length}`;
      let image: string;
      try {
        image=await toPng(page,{width:792,height:1120,pixelRatio:2,cacheBust:false,backgroundColor:"#ffffff"});
      } catch (error) {
        throw new Error(`Could not render PDF page ${index+1}. ${error instanceof Error ? error.message : "An image could not be embedded."}`);
      }
      if(index) pdf.addPage("a4","portrait");
      pdf.addImage(image,"PNG",0,0,210,297,`custom-page-${index}`,"FAST"); onPage?.(image);
    }
    return pdf.output("blob");
  } finally { host.remove(); style.remove(); }
}
