type DashboardFetchOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
};

const TRANSIENT_STATUS = 503;
const MAX_ATTEMPTS = 2;

export async function fetchDashboardWithRetry(url: string, options: DashboardFetchOptions = {}): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (options.signal?.aborted) throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
    const timeoutController = new AbortController();
    const abortFromCaller = () => timeoutController.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => timeoutController.abort(new DOMException("Timed out", "AbortError")), timeoutMs);

    try {
      const response = await fetchImpl(url, { cache: "no-store", signal: timeoutController.signal });
      if (response.status !== TRANSIENT_STATUS || attempt + 1 === MAX_ATTEMPTS) return response;
    } catch (error) {
      if (options.signal?.aborted || attempt + 1 === MAX_ATTEMPTS || !isTransientFetchError(error)) throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  throw new Error("Dashboard request exhausted its retry attempts.");
}

function isTransientFetchError(error: unknown) {
  return error instanceof TypeError
    || error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
}
