"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRightIcon, LinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function HomePageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialId = useMemo(() => searchParams.get("accountId") ?? "", [searchParams]);
  const [accountId, setAccountId] = useState(initialId);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (accountId.trim()) {
      params.set("accountId", accountId.trim());
    }
    router.push(`/overall${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[url('/background.png'),url('/backround.png')] bg-cover bg-center bg-no-repeat px-4">
      <div className="w-full max-w-2xl rounded-3xl border border-white/25 bg-black/40 p-8 text-white backdrop-blur-sm">
        <h1 className="text-4xl font-semibold md:text-5xl">
          META &amp; GOOGLE ADS
          <br />
          Automation Reporting
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

          <Button type="submit" className="h-11 bg-red-600 px-5 hover:bg-red-700">
            Open Overall Performance
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </form>

        <a
          href="/overall"
          className="mt-5 inline-flex items-center gap-2 text-sm text-white/80 underline-offset-4 hover:underline"
        >
          <LinkIcon className="size-4" />
          Open report without prefilled ID
        </a>
      </div>
    </main>
  );
}
