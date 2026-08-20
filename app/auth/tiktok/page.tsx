import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerAuthSession } from "@/lib/auth/server-session";

export default async function TikTokAuthorizationPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string }>;
}) {
  const session = await getServerAuthSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/overall");
  const connected = (await searchParams).connected === "1";

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-slate-500">Administrator only</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">TikTok Business connection</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Authorize read-only reporting access. Tokens and the authorized advertiser inventory are stored server-side in Doppler and never returned to the dashboard.
        </p>
        {connected ? (
          <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">TikTok Business authorization was stored successfully.</p>
        ) : null}
        <Link href="/api/auth/tiktok" className="mt-6 inline-flex rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
          Connect TikTok Business
        </Link>
      </section>
    </main>
  );
}
