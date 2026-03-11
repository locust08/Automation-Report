"use client";

import { PlatformInsightsSection } from "@/lib/reporting/types";

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-MY", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function InsightsTable({
  section,
  active,
  onSelect,
}: {
  section: PlatformInsightsSection;
  active: boolean;
  onSelect: (platform: PlatformInsightsSection["platform"]) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(section.platform)}
      className={[
        "rounded-full px-5 py-2 text-sm font-semibold transition",
        active ? "bg-red-600 text-white shadow-sm" : "bg-white text-[#555] hover:bg-[#f6d8ce]",
      ].join(" ")}
    >
      {section.title}
      <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">{formatCount(section.rows.length)}</span>
    </button>
  );
}

export function InsightsDataTable({ section }: { section: PlatformInsightsSection }) {
  if (section.rows.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[2rem] bg-[#e7e7e7] p-4 shadow-sm sm:p-6">
      <h2 className="mb-2 text-2xl font-semibold text-[#555] sm:text-3xl">{section.title}</h2>
      <p className="mb-4 text-sm text-[#666]">
        Each row is one experiment only, ranked from highest priority to lowest priority.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-[#d1d1d1] bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-left text-xs sm:text-sm">
          <thead>
            <tr className="bg-[#f1bba9] text-[#444]">
              <th className="px-3 py-3 font-semibold">Priority</th>
              <th className="px-3 py-3 font-semibold">What to change (one thing only)</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => (
              <tr key={row.id} className="border-b border-border/40 align-top hover:bg-muted/20">
                <td className="px-3 py-3 font-semibold text-[#b5391f]">{row.priority}</td>
                <td className="px-3 py-3 font-medium text-[#333]">{row.whatToChange}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
