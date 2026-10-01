// Only use for Notion reads (including read-only data-source queries).
export async function fetchNotionRead(endpoint: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(endpoint, init);
    if (![500, 502, 503, 504, 529].includes(response.status) || attempt >= 2) return response;
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
}
