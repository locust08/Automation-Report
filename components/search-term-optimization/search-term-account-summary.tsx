"use client";

import { FileDownIcon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { resolveGoogleAccountName } from "@/lib/search-term-optimization/job-summary";
import type { OptimizationDashboardPayload } from "@/lib/search-term-optimization/types";

type AccountIdentity={accountName:string;adAccountId:string;accessPath?:string|null};

export function SearchTermAccountSummary({ account, dashboard, analysisLoading, loading, capacityReached, showActions, onStartAnalysis, onOpenReport }: { account:AccountIdentity|null|undefined; dashboard:OptimizationDashboardPayload|null; analysisLoading:boolean; loading:boolean; capacityReached:boolean; showActions:boolean; onStartAnalysis:()=>void; onOpenReport:()=>void }) {
  const accountId=dashboard?.account.customerId??account?.adAccountId??"";
  const accountName=accountId?resolveGoogleAccountName({directoryName:account?.accountName,dashboardName:dashboard?.account.customerName,accountId}):"Search-Term Optimization";
  return <div className="space-y-5">
    {showActions&&account?<div className="flex flex-wrap gap-2">
      <Button type="button" className="h-11 cursor-pointer bg-red-600 text-white hover:bg-red-700" disabled={analysisLoading||capacityReached} onClick={onStartAnalysis}><>{analysisLoading?<Spinner className="size-4"/>:<SearchIcon className="size-4"/>}{analysisLoading?"Analyzing...":capacityReached?"Max analysis reached today":"Start analysis"}</></Button>
      <Button type="button" variant="outline" className="h-11 cursor-pointer whitespace-nowrap hover:border-red-200 hover:bg-red-50 hover:text-red-700" disabled={!dashboard||loading||analysisLoading} onClick={onOpenReport}><FileDownIcon className="size-4"/>Summary report</Button>
    </div>:null}
    <div>
      <h1 className="text-3xl font-semibold sm:text-5xl">{accountName}</h1>
      {!analysisLoading&&dashboard?<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AccountDetail label="Google Ads account" value={`CID ${dashboard.account.customerId}`}/>
        <AccountDetail label="Analysis period" value={`${formatDate(dashboard.account.reportingPeriod.startDate)} – ${formatDate(dashboard.account.reportingPeriod.endDate)}`} emphasized/>
        <AccountDetail label="Analyzed on" value={formatDateTime(dashboard.account.lastAnalysisAt)}/>
        <AccountDetail label="Next scheduled run" value={dashboard.account.nextRunAt?formatDateTime(dashboard.account.nextRunAt):"Not scheduled"}/>
      </div>:accountId?<p className="mt-1 text-sm text-neutral-500">CID {accountId}</p>:null}
    </div>
  </div>;
}

function formatDateTime(value:string){return new Intl.DateTimeFormat("en-MY",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kuala_Lumpur"}).format(new Date(value));}
function formatDate(value:string){const date=new Date(`${value}T00:00:00+08:00`);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("en-MY",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Kuala_Lumpur"}).format(date);}
function AccountDetail({label,value,emphasized=false}:{label:string;value:string;emphasized?:boolean}){return <div className={`rounded-xl border px-3.5 py-3 ${emphasized?"border-red-200 bg-red-50":"border-neutral-200 bg-neutral-50"}`}><p className={`text-[11px] font-semibold uppercase tracking-wide ${emphasized?"text-red-700":"text-neutral-500"}`}>{label}</p><p className="mt-1 text-sm font-semibold text-neutral-900">{value}</p></div>;}
