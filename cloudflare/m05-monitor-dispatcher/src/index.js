import { malaysiaSlot } from "./slots.js";

const worker = {
  async fetch() { return new Response("Not found", { status: 404 }); },
  async scheduled(controller, env) {
    const slot = malaysiaSlot(controller.scheduledTime);
    if (!slot) return;
    if (env.M05_SCHEDULER_MODE !== "shadow" && env.M05_SCHEDULER_MODE !== "active") {
      throw new Error("M05 scheduler mode is unavailable.");
    }
    const origin = new URL(env.DASHBOARD_BASE_URL || "");
    if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash
      || origin.username || origin.password || !env.M05_CAPTURE_JOB_SECRET) {
      throw new Error("M05 dispatcher connection is unavailable.");
    }
    const timeout = AbortSignal.timeout(55_000);
    const response = await fetch(new URL("/api/internal/m05/dispatch", origin), {
      method: "POST", signal: timeout,
      headers: { Authorization: `Bearer ${env.M05_CAPTURE_JOB_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledAt: new Date(controller.scheduledTime).toISOString(),
        kind: slot.kind, platforms: slot.platforms, mode: env.M05_SCHEDULER_MODE }),
    });
    if (!response.ok) throw new Error(`M05 dispatch returned ${response.status}.`);
    const payload = await response.json();
    if (!payload || typeof payload !== "object" || typeof payload.failedAccounts !== "number" && slot.kind === "health") {
      throw new Error("M05 dispatch response is invalid.");
    }
    console.log(JSON.stringify({ event: "m05_dispatch", kind: slot.kind, date: slot.localDate,
      platforms: slot.platforms, mode: env.M05_SCHEDULER_MODE, status: response.status,
      failedAccounts: payload.failedAccounts ?? 0 }));
    if (payload.failedAccounts) throw new Error(`M05 dispatch had ${payload.failedAccounts} account failures.`);
  },
};

export default worker;
