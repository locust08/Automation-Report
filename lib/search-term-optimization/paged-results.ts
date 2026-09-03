type PageRequest = { limit: number; offset: number };

export async function collectPagedResults<T>(
  loadPage: (request: PageRequest) => Promise<T[]>,
  pageSize = 1_000,
  maxRows = 2_500,
): Promise<T[]> {
  const collected: T[] = [];
  while (collected.length < maxRows) {
    const limit = Math.min(pageSize, maxRows - collected.length);
    const page = await loadPage({ limit, offset: collected.length });
    collected.push(...page);
    if (page.length < limit) break;
  }
  return collected;
}
