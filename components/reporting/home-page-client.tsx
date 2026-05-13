"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRightIcon, LinkIcon } from "lucide-react";

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (accountId.trim()) {
      params.set("accountId", accountId.trim());
    }
    params.set("country", country);
    router.push(`/overall${params.toString() ? `?${params.toString()}` : ""}`);
  }

  const advancedHref = `/advanced?${new URLSearchParams({
    ...(accountId.trim() ? { accountId: accountId.trim() } : {}),
    country,
  }).toString()}`;

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

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Button type="submit" className="h-11 w-full bg-red-600 px-5 hover:bg-red-700 sm:w-auto">
              Open Overall Performance
              <ArrowRightIcon data-icon="inline-end" />
            </Button>

            <a
              href={advancedHref}
              className="inline-flex h-11 w-full items-center justify-center rounded-md border border-white/30 px-5 text-sm font-medium text-white transition hover:bg-white/10 sm:w-auto"
            >
              Open Advanced Report
            </a>
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
