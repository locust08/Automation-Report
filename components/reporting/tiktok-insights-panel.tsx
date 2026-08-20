"use client";

import { useMemo, useState } from "react";
import { ImageOffIcon, SmartphoneIcon, TrendingUpIcon } from "lucide-react";

import type { TikTokInsightsPayload } from "@/lib/reporting/tiktok-insights";
import { rankTikTokTopAdsForDisplay, type TikTokTopAdMetric } from "@/lib/reporting/tiktok-insights-client";

const METRICS: Array<{ key: TikTokTopAdMetric; label: string }> = [
  { key: "impressions", label: "Impressions" },
  { key: "spend", label: "Spend" },
  { key: "reach", label: "Reach" },
];

export function TikTokInsightsPanel({
  payload,
  expanded = false,
}: {
  payload: TikTokInsightsPayload;
  expanded?: boolean;
}) {
  const [metric, setMetric] = useState<TikTokTopAdMetric>("impressions");
  const topAds = useMemo(() => rankTikTokTopAdsForDisplay(payload.topAds, metric), [metric, payload.topAds]);

  return (
    <section className="rounded-[1.75rem] bg-[#e7e7e7] p-4 shadow-sm sm:p-5" aria-labelledby="tiktok-insights-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#fe2c55]">TikTok Ads</p>
          <h2 id="tiktok-insights-title" className="mt-1 text-3xl font-semibold text-[#333]">Insights</h2>
        </div>
        <p className="text-sm text-[#666]">{payload.account.advertiserName} · {payload.account.currency}</p>
      </div>

      {payload.warnings.length ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {payload.warnings.join(" ")}
        </div>
      ) : null}

      <div className={`mt-4 grid gap-4 ${expanded ? "xl:grid-cols-[1.35fr_0.65fr]" : "lg:grid-cols-[1.2fr_0.8fr]"}`}>
        <article className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#222]">Top Ads</h3>
              <p className="mt-1 text-sm text-[#666]">Your strongest creatives for the selected period.</p>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-[#444]">
              Rank by
              <select
                value={metric}
                onChange={(event) => setMetric(event.target.value as TikTokTopAdMetric)}
                className="h-10 rounded-lg border border-[#d4d4d4] bg-white px-3 font-semibold outline-none focus:border-[#25a7a1]"
                aria-label="Rank Top Ads by"
              >
                {METRICS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
          </div>

          {topAds.length ? (
            <div className={`mt-4 grid gap-3 ${expanded ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-3"}`}>
              {topAds.map((ad, index) => (
                <div key={ad.adId} className="overflow-hidden rounded-xl border border-[#e6e6e6] bg-[#f7f7f7]">
                  <div className="relative aspect-[9/12] overflow-hidden bg-[#17171b]">
                    {ad.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ad.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-2 px-3 text-center text-sm text-white/75">
                        <ImageOffIcon className="size-7" aria-hidden="true" />
                        Media unavailable
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold text-white">#{index + 1}</span>
                  </div>
                  <div className="p-3">
                    <p className="truncate font-semibold text-[#222]" title={ad.adName}>{ad.adName}</p>
                    <p className="mt-1 flex items-center gap-1 text-sm text-[#168f83]">
                      <TrendingUpIcon className="size-4" aria-hidden="true" />
                      {formatAdMetric(ad[metric], metric, payload.account.currency)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl bg-[#f7f7f7] px-4 py-12 text-center text-sm text-[#666]">No TikTok ads delivered in this period.</div>
          )}
        </article>

        <article className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#d8f6f3] text-[#087f77]"><SmartphoneIcon className="size-5" aria-hidden="true" /></span>
            <div>
              <h3 className="text-xl font-semibold text-[#222]">Device OS</h3>
              <p className="mt-1 text-sm text-[#666]">Share of delivered impressions.</p>
            </div>
          </div>
          {payload.deviceOs.length ? (
            <div className="mt-5 space-y-4">
              {payload.deviceOs.map((row) => (
                <div key={row.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-[#333]">{row.label}</span>
                    <span className="text-2xl font-semibold tabular-nums text-[#111]">{row.share.toFixed(row.share % 1 ? 1 : 0)}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eeeeee]">
                    <div className="h-full rounded-full bg-[#25a7a1]" style={{ width: `${Math.min(100, Math.max(0, row.share))}%` }} />
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-[#777]">{row.impressions.toLocaleString("en-US")} impressions</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl bg-[#f7f7f7] px-4 py-12 text-center text-sm text-[#666]">Device OS data is unavailable for this period.</div>
          )}
        </article>
      </div>
    </section>
  );
}

function formatAdMetric(value: number, metric: TikTokTopAdMetric, currency: string): string {
  if (metric === "spend") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}
