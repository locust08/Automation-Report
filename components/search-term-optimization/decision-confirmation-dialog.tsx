"use client";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { OptimizationResult } from "@/lib/search-term-optimization/types";

type ReviewDecision="approved"|"rejected";

export function DecisionConfirmationDialog({ pending, accountName, saving, onClose, onConfirm }: { pending:{rows:OptimizationResult[];decision:ReviewDecision}|null; accountName?:string; saving:boolean; onClose:()=>void; onConfirm:()=>void }) {
  const approved=pending?.decision==="approved";
  return <AlertDialog open={Boolean(pending)} onOpenChange={(open)=>{if(!open&&!saving)onClose();}}>
    <AlertDialogContent className="w-[calc(100%-2rem)] sm:max-w-xl">
      <AlertDialogHeader><AlertDialogTitle>{approved?"Add as keywords?":"Add as negative keywords?"}</AlertDialogTitle><AlertDialogDescription>This will immediately modify Google Ads for {accountName??"the selected account"}.</AlertDialogDescription></AlertDialogHeader>
      <div className={`rounded-xl border p-4 ${approved?"border-emerald-200 bg-emerald-50":"border-red-200 bg-red-50"}`}>
        <p className="text-sm font-semibold text-neutral-900">{pending?.rows.length??0} search term{pending?.rows.length===1?"":"s"}</p>
        <p className="mt-1 text-sm text-neutral-600">{approved?"Creates enabled exact-match keywords.":"Creates enabled exact-match negative keywords."}</p>
        <div className="mt-3 space-y-1 text-xs text-neutral-600">{pending?.rows.slice(0,3).map(row=><p key={row.id} className="truncate">• {row.searchTerm} <span className="text-neutral-400">· {row.adGroup}</span></p>)}{(pending?.rows.length??0)>3?<p className="font-medium">+{(pending?.rows.length??0)-3} more</p>:null}</div>
      </div>
      <AlertDialogFooter className="sm:grid sm:grid-cols-2"><AlertDialogCancel className="w-full" disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction className={`w-full ${approved?"bg-emerald-600 text-white hover:bg-emerald-700":"bg-red-600 text-white hover:bg-red-700"}`} disabled={saving} onClick={onConfirm}>{approved?"Add keywords":"Add negative keywords"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
