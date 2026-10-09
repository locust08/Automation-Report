import { malaysiaSlot } from "./slots.js";

async function boundedJson(response, limit = 64 * 1024) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new Error("M05 dispatch response is too large.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("M05 dispatch response is empty.");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("M05 dispatch response is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

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
    const payload = await boundedJson(response);
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
export { boundedJson };
