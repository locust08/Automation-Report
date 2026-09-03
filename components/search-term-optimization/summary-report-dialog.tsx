"use client";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ReportDatePicker, type ReportDateSelection } from "@/components/search-term-optimization/report-date-picker";

export function SummaryReportDialog({ open, onOpenChange, selection, onSelectionChange }: { open:boolean; onOpenChange:(open:boolean)=>void; selection:ReportDateSelection; onSelectionChange:(selection:ReportDateSelection)=>void }) {
  return <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent className="w-[calc(100%-2rem)] sm:max-w-4xl">
      <AlertDialogHeader><AlertDialogTitle>Generate decision report</AlertDialogTitle><AlertDialogDescription>Choose one Malaysia calendar date or a date range for the approved and negative-keyword decisions in the PDF.</AlertDialogDescription></AlertDialogHeader>
      <ReportDatePicker value={selection} onChange={onSelectionChange} />
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={() => downloadSummaryReport(selection)}>Generate report</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

function downloadSummaryReport(selection:ReportDateSelection) {
  const params=new URLSearchParams();
  if(selection.mode==="single") params.set("date",selection.date);
  else { params.set("startDate",selection.startDate); params.set("endDate",selection.endDate); }
  const download=document.createElement("a");
  download.href=`/api/search-term-optimization/summary-report?${params.toString()}`;
  download.click();
}
