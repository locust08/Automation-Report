"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRightIcon, EyeIcon, LinkIcon, SlidersHorizontalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COUNTRIES = [
  { value: "MY", label: "🇲🇾 MY" },
  { value: "SG", label: "🇸🇬 SG" },
  { value: "AU", label: "🇦🇺 AU" },
  { value: "US", label: "🇺🇸 US" },
];

export function HomePageClient() {
  const router = useRouter();

  const searchParams = useSearchParams();
  const initialCountry = useMemo(() => searchParams.get("country") ?? "MY", [searchParams]);
  const [accountId, setAccountId] = useState("");
  const [country, setCountry] = useState(initialCountry);

  const reportQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (accountId.trim()) {
      params.set("accountId", accountId.trim());
    }
    params.set("country", country);
    return params.toString();
  }, [accountId, country]);

  const overallHref = `/overall${reportQueryString ? `?${reportQueryString}` : ""}`;
  const previewHref = `/preview${reportQueryString ? `?${reportQueryString}` : ""}`;
  const advancedHref = `/advanced${reportQueryString ? `?${reportQueryString}` : ""}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(overallHref);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[url('/background.png')] bg-cover bg-center bg-no-repeat px-4 py-8">
      <div className="w-full max-w-2xl rounded-3xl border border-white/25 bg-black/40 p-6 text-white backdrop-blur-sm sm:p-8">
        <h1 className="text-3xl font-semibold sm:text-4xl md:text-5xl">
          Ads Reporting Dashboard
        </h1>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-white/80">Ad Account ID (required to load report data)</span>
            <Input
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              placeholder="e.g. 697-252-8848 or 283341217383189"
              className="h-11 border-white/30 bg-white/10 text-white placeholder:text-white/60"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-white/80">Country</span>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="h-11 w-full border-white/30 bg-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <Button
              type="submit"
              className="h-auto min-h-12 w-full whitespace-normal bg-red-600 px-4 py-3 text-center leading-snug hover:bg-red-700"
            >
              Open Overall Performance
              <ArrowRightIcon data-icon="inline-end" />
            </Button>

            <Button
              asChild
              variant="outline"
              className="h-auto min-h-12 w-full whitespace-normal border-white/30 bg-white/10 px-4 py-3 text-center leading-snug text-white shadow-none hover:bg-white/20 hover:text-white"
            >
              <a href={previewHref}>
                Open Preview Page
                <EyeIcon data-icon="inline-end" />
              </a>
            </Button>

            <Button
              asChild
              variant="outline"
              className="h-auto min-h-12 w-full whitespace-normal border-white/30 bg-transparent px-4 py-3 text-center leading-snug text-white shadow-none hover:bg-white/10 hover:text-white"
            >
              <a href={advancedHref}>
                Open Advanced Report
                <SlidersHorizontalIcon data-icon="inline-end" />
              </a>
            </Button>
          </div>
        </form>

        <a
          href={advancedHref}
          className="mt-5 inline-flex items-center gap-2 text-xs text-white/80 underline-offset-4 hover:underline"
        >
          <LinkIcon className="size-4" />
          Open advanced report without prefilled ID
        </a>
      </div>
    </main>
  );
}
