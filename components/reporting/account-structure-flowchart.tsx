"use client";

import type { ReactNode } from "react";
import {
  ArrowRightIcon,
  ImageIcon,
  Layers3Icon,
  MegaphoneIcon,
  RefreshCwIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PreviewPlatformSection } from "@/lib/reporting/types";

const VISIBLE_LIMIT = 5;

interface AccountStructureFlowchartProps {
  sections: PreviewPlatformSection[];
  requestedPlatform: "meta" | "google" | "tiktok" | null;
  loading: boolean;
  error: string | null;
  accountIds: {
    metaAccountId: string | null;
    googleAccountId: string | null;
    tiktokAccountId?: string | null;
  };
  onRetry: () => void;
}

interface NormalizedStructure {
  platform: "meta" | "google" | "tiktok";
  accountId: string | null;
  accountName: string | null;
  fetchedAt: string;
  campaigns: NormalizedCampaign[];
}

interface NormalizedCampaign {
  id: string;
  name: string;
  type?: string | null;
  objective?: string | null;
  status: string;
  children: NormalizedChild[];
}

interface NormalizedChild {
  id: string;
  name: string;
  level: "Ad Group" | "Asset Group" | "Ad Set";
  status: string;
  ads: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}

export function AccountStructureFlowchart({
  sections,
  requestedPlatform,
  loading,
  error,
  accountIds,
  onRetry,
}: AccountStructureFlowchartProps) {
  const requestedSection =
    requestedPlatform ? sections.find((section) => section.platform === requestedPlatform) : null;
  const section =
    requestedSection ??
    sections.find((item) => item.campaigns.length > 0) ??
    sections.find((item) => item.platform === "google") ??
    sections.find((item) => item.platform === "meta") ??
    null;

  if (loading) {
    return <AccountStructureFlowchartSkeleton />;
  }

  if (error) {
    return (
      <Card className="rounded-[18px] border-[#fecaca] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
        <CardHeader className="gap-3">
          <Badge className="h-8 rounded-full border border-[#fecaca] bg-[#fff1f2] px-3 text-[#be123c]">
            Fetch failed
          </Badge>
          <CardTitle className="text-[24px] font-semibold text-[#0f172a]">
            Account Structure Preview
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={onRetry} className="gap-2">
            <RefreshCwIcon className="size-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!section) {
    return (
      <Card className="rounded-[18px] border-[#e2e8f0] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
        <CardHeader>
          <CardTitle className="text-[24px] font-semibold text-[#0f172a]">
            Account Structure Preview
          </CardTitle>
          <CardDescription>
            Select an account to auto-generate the campaign hierarchy.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const normalized = normalizeStructure(section, accountIds);

  if (normalized.campaigns.length === 0) {
    return (
      <Card className="rounded-[18px] border-[#e2e8f0] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
        <CardHeader className="gap-3">
          <Badge className="h-8 rounded-full border border-[#dbeafe] bg-[#eff6ff] px-3 text-[#1d4ed8]">
            Fetch complete
          </Badge>
          <CardTitle className="text-[24px] font-semibold text-[#0f172a]">
            {getPlatformTitle(normalized.platform)}
          </CardTitle>
          <CardDescription>
            No campaigns, {getChildColumnLabel(normalized.platform).toLowerCase()}, or ads were returned for this account.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const visibleCampaigns = normalized.campaigns.slice(0, VISIBLE_LIMIT);

  return (
    <Card className="gap-0 rounded-[18px] border-[#d8e0eb] bg-white py-0 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
      <CardHeader className="gap-0 px-5 pt-6 pb-0 sm:px-7 sm:pt-7">
        <CardTitle className="text-[25px] font-semibold leading-tight text-[#0b1437] sm:text-[32px]">
          {getPlatformTitle(normalized.platform)}
        </CardTitle>

        <FlowLegend platform={normalized.platform} />
      </CardHeader>

      <CardContent className="space-y-5 px-5 pb-6 pt-6 sm:px-7 sm:pb-7">
        <div className="grid gap-3 border-b border-[#d9e1ec] pb-4 text-[15px] font-semibold text-[#0b1437] lg:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)_48px_minmax(0,1fr)] lg:items-center">
          <ColumnHeading icon={<MegaphoneIcon className="size-4" />} label="Campaigns" />
          <span className="hidden lg:block" />
          <ColumnHeading icon={<Layers3Icon className="size-4" />} label={getChildColumnLabel(normalized.platform)} />
          <span className="hidden lg:block" />
          <ColumnHeading icon={<ImageIcon className="size-4" />} label="Ads" />
        </div>

        <div className="space-y-4">
          {visibleCampaigns.map((campaign) => (
            <FlowCampaignRow
              key={campaign.id}
              campaign={campaign}
              platform={normalized.platform}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AccountStructureFlowchartSkeleton() {
  return (
    <Card className="rounded-[18px] border-[#e2e8f0] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
      <CardHeader>
        <Skeleton className="h-9 w-40 rounded-full" />
        <Skeleton className="mt-4 h-9 w-80 max-w-full" />
        <Skeleton className="h-5 w-64 max-w-full" />
      </CardHeader>
      <CardContent className="space-y-4">
        {[0, 1, 2].map((row) => (
          <div key={row} className="grid gap-3 lg:grid-cols-3">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FlowCampaignRow({
  campaign,
  platform,
}: {
  campaign: NormalizedCampaign;
  platform: "meta" | "google" | "tiktok";
}) {
  const visibleChildren = campaign.children.slice(0, VISIBLE_LIMIT);
  const hiddenChildCount = Math.max(campaign.children.length - VISIBLE_LIMIT, 0);
  const firstAds = visibleChildren.flatMap((child) => child.ads.slice(0, VISIBLE_LIMIT));
  const visibleAds = firstAds.slice(0, VISIBLE_LIMIT);
  const totalAds = campaign.children.reduce((count, child) => count + child.ads.length, 0);
  const hiddenAdCount = Math.max(totalAds - visibleAds.length, 0);
  const tone = getCampaignTone(platform, campaign.type ?? campaign.objective ?? "");
  const category = campaign.type ?? campaign.objective ?? "Other";

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)_48px_minmax(0,1fr)] lg:items-center">
      <StructureNode
        label={campaign.name}
        status={campaign.status}
        meta={category}
        tone={tone}
        icon={getCampaignIcon(platform, category)}
        strong
      />
      <Connector />
      <NodeStack
        emptyLabel={`No ${getChildColumnLabel(platform).toLowerCase()} returned.`}
        empty={visibleChildren.length === 0 && hiddenChildCount === 0}
      >
        {visibleChildren.map((child) => (
          <StructureNode
            key={child.id}
            label={child.name}
            status={child.status}
            meta={child.level}
            tone={tone}
            icon={getChildIcon(platform, category)}
          />
        ))}
      </NodeStack>
      <Connector />
      <NodeStack emptyLabel="No ads returned." empty={visibleAds.length === 0 && hiddenAdCount === 0}>
        {visibleAds.map((ad) => (
          <StructureNode
            key={ad.id}
            label={ad.name}
            status={ad.status}
            meta="Ad"
            tone={tone}
            icon={getAdIcon(platform, category)}
          />
        ))}
      </NodeStack>
    </div>
  );
}

function StructureNode({
  label,
  status,
  meta,
  tone,
  icon,
  strong = false,
}: {
  label: string;
  status: string;
  meta: string;
  tone: "blue" | "purple" | "orange" | "green" | "pink" | "neutral";
  icon: ReactNode;
  strong?: boolean;
}) {
  const toneClassName =
    tone === "blue"
      ? "border-[#8db6ff] bg-[linear-gradient(90deg,#eff6ff_0%,#ffffff_100%)] text-[#1457d9]"
      : tone === "purple"
        ? "border-[#c7b5ff] bg-[linear-gradient(90deg,#f6f1ff_0%,#ffffff_100%)] text-[#6d3df4]"
        : tone === "orange"
          ? "border-[#ffc879] bg-[linear-gradient(90deg,#fff7e8_0%,#ffffff_100%)] text-[#d97706]"
          : tone === "green"
            ? "border-[#9ee2c5] bg-[linear-gradient(90deg,#effcf7_0%,#ffffff_100%)] text-[#0f9f6e]"
            : tone === "pink"
              ? "border-[#ffb1cf] bg-[linear-gradient(90deg,#fff1f7_0%,#ffffff_100%)] text-[#e64980]"
              : "border-[#dbe3ef] bg-[linear-gradient(90deg,#f8fafc_0%,#ffffff_100%)] text-[#64748b]";

  return (
    <div
      className={cn(
        "min-w-0 rounded-[10px] border px-3.5 py-3 shadow-[0_7px_18px_rgba(15,23,42,0.03)]",
        toneClassName
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/75 shadow-sm [&_svg]:size-4">
          {icon}
        </span>
        <div className="min-w-0">
          <p className={cn("whitespace-normal break-words text-[14px] leading-5 text-[#07133a]", strong ? "font-semibold" : "font-medium")}>
            {label}
          </p>
          <p className="sr-only">
            {meta} - {status || "Unknown"}
          </p>
        </div>
      </div>
    </div>
  );
}

function NodeStack({
  children,
  emptyLabel,
  empty,
}: {
  children: ReactNode;
  emptyLabel: string;
  empty: boolean;
}) {
  return (
    <div className="min-w-0 space-y-2">
      {empty ? (
        <div className="rounded-2xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-3 text-sm text-[#64748b]">
          {emptyLabel}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function Connector() {
  return (
    <div className="hidden items-center justify-center text-[#9aa6b8] lg:flex">
      <span className="h-px flex-1 bg-[#aeb8c8]" />
      <ArrowRightIcon className="size-5 shrink-0 stroke-[1.7]" />
    </div>
  );
}

function ColumnHeading({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[#5b47ff]">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function FlowLegend({ platform }: { platform: "meta" | "google" | "tiktok" }) {
  const items =
    platform === "google"
      ? [
          ["Search", "bg-[#60a5fa]"],
          ["Performance Max", "bg-[#7c5cff]"],
          ["Display", "bg-[#ffb84d]"],
          ["Video", "bg-[#53c78a]"],
        ]
      : [
          ["Awareness", "bg-[#4e8cff]"],
          ["Traffic", "bg-[#63c7a5]"],
          ["Leads", "bg-[#9b7df5]"],
          ["Engagement", "bg-[#f280bf]"],
          ["Sales", "bg-[#ff5e5e]"],
        ];

  return (
    <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-[#3d4962]">
      {items.map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", color)} />
          {label}
        </span>
      ))}
    </div>
  );
}

function normalizeStructure(
  section: PreviewPlatformSection,
  accountIds: AccountStructureFlowchartProps["accountIds"]
): NormalizedStructure {
  return {
    platform: section.platform,
    accountId:
      section.accountId ??
      (section.platform === "google"
        ? accountIds.googleAccountId
        : section.platform === "tiktok"
          ? accountIds.tiktokAccountId ?? null
          : accountIds.metaAccountId),
    accountName: section.accountName ?? null,
    fetchedAt: section.fetchedAt ?? new Date().toISOString(),
    campaigns: section.campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      type: section.platform === "google" ? campaign.type ?? getDetailValue(campaign, "Channel") ?? "Other" : undefined,
      objective:
        section.platform === "meta" ? campaign.objective ?? getDetailValue(campaign, "Objective") ?? "Other" : undefined,
      status: campaign.status,
      children: campaign.children.map((child) => ({
        id: child.id,
        name: child.name,
        level: resolveChildLevel(section.platform, campaign, child),
        status: child.status,
        ads: child.ads.map((ad) => ({
          id: ad.id,
          name: ad.name,
          status: ad.status,
        })),
      })),
    })),
  };
}

function resolveChildLevel(
  platform: "meta" | "google" | "tiktok",
  campaign: PreviewPlatformSection["campaigns"][number],
  child: PreviewPlatformSection["campaigns"][number]["children"][number]
): NormalizedChild["level"] {
  if (platform === "meta") {
    return "Ad Set";
  }

  const campaignType = `${campaign.type ?? getDetailValue(campaign, "Channel") ?? ""}`.toLowerCase();
  const childType = getDetailValue(child, "Type")?.toLowerCase() ?? "";
  return campaignType.includes("performance max") || childType.includes("asset") ? "Asset Group" : "Ad Group";
}

function getDetailValue(
  node: { details?: Array<{ label: string; value: string }> },
  label: string
): string | null {
  return node.details?.find((field) => field.label === label)?.value ?? null;
}

function getPlatformTitle(platform: "meta" | "google" | "tiktok"): string {
  return platform === "google"
    ? "Google Ads Structure Preview"
    : platform === "tiktok"
      ? "TikTok Ads Structure Preview"
      : "Meta Ads Structure Preview";
}

function getChildColumnLabel(platform: "meta" | "google" | "tiktok"): string {
  return platform === "google" ? "Ad Groups" : "Ad Sets";
}

function getCampaignTone(
  platform: "meta" | "google" | "tiktok",
  value: string
): "blue" | "purple" | "orange" | "green" | "pink" | "neutral" {
  const normalized = value.toLowerCase();
  if (platform === "google") {
    if (normalized.includes("search")) return "blue";
    if (normalized.includes("performance max")) return "purple";
    if (normalized.includes("display")) return "orange";
    if (normalized.includes("video")) return "green";
    return "neutral";
  }

  if (normalized.includes("awareness")) return "blue";
  if (normalized.includes("traffic")) return "green";
  if (normalized.includes("lead")) return "purple";
  if (normalized.includes("engagement")) return "orange";
  if (normalized.includes("sales") || normalized.includes("conversion")) return "pink";
  return "neutral";
}

function getCampaignIcon(platform: "meta" | "google" | "tiktok", value: string): ReactNode {
  const normalized = value.toLowerCase();
  if (platform === "google" && normalized.includes("search")) {
    return <SearchIcon className="size-5" />;
  }
  if (normalized.includes("performance max") || normalized.includes("lead")) {
    return <SparklesIcon className="size-5" />;
  }
  if (normalized.includes("traffic")) {
    return <ArrowRightIcon className="size-5" />;
  }
  if (normalized.includes("awareness") || normalized.includes("video")) {
    return <MegaphoneIcon className="size-5" />;
  }
  if (normalized.includes("engagement")) {
    return <UsersIcon className="size-5" />;
  }
  return <MegaphoneIcon className="size-5" />;
}

function getChildIcon(platform: "meta" | "google" | "tiktok", value: string): ReactNode {
  if (platform === "meta") {
    return <UsersIcon className="size-5" />;
  }

  return value.toLowerCase().includes("search") ? (
    <SearchIcon className="size-5" />
  ) : (
    <Layers3Icon className="size-5" />
  );
}

function getAdIcon(platform: "meta" | "google" | "tiktok", value: string): ReactNode {
  const normalized = value.toLowerCase();
  if (platform === "meta" && normalized.includes("traffic")) {
    return <ArrowRightIcon className="size-5" />;
  }

  return <ImageIcon className="size-5" />;
}
