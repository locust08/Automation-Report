"use client";

import { ClipboardListIcon, FilePenLineIcon, Layers3Icon, LightbulbIcon, MegaphoneIcon } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MANAGEMENT_VIEWS, type AdsManagementView } from "@/lib/ads-management/unified-management";

const DETAILS = {
  campaigns: { label: "Campaigns", icon: MegaphoneIcon },
  ad_groups: { label: "Ad groups", icon: Layers3Icon },
  ads: { label: "Ads", icon: FilePenLineIcon },
  recommendations: { label: "Recommendations", icon: LightbulbIcon },
  change_requests: { label: "Change requests", icon: ClipboardListIcon },
} as const;

export function ManagementSectionNavigation({
  value,
  onChange,
}: {
  value: AdsManagementView;
  onChange: (view: AdsManagementView) => void;
}) {
  return (
    <>
      <div className="lg:hidden">
        <Select value={value} onValueChange={(next) => onChange(next as AdsManagementView)}>
          <SelectTrigger className="w-full bg-white" aria-label="Ads Management section">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MANAGEMENT_VIEWS.map((view) => <SelectItem key={view} value={view}>{DETAILS[view].label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <aside className="sticky top-4 hidden rounded-xl border bg-white p-2 shadow-sm lg:block" aria-label="Ads Management navigation">
        <nav className="space-y-1">
          {MANAGEMENT_VIEWS.map((view, index) => {
            const { label, icon: Icon } = DETAILS[view];
            return (
              <div key={view} className={view === "change_requests" ? "border-t pt-2" : index === 0 ? "" : undefined}>
                <button
                  type="button"
                  onClick={() => onChange(view)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${value === view ? "bg-red-50 font-medium text-red-700 ring-1 ring-red-200" : "text-slate-700 hover:bg-slate-50"}`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{label}</span>
                </button>
              </div>
            );
          })}
          <div className="mt-2 border-t px-2 pt-3 text-xs text-slate-500">Provider execution remains locked.</div>
        </nav>
      </aside>
    </>
  );
}
