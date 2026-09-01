export const META_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export type MetaPageSize = (typeof META_PAGE_SIZE_OPTIONS)[number];

export function paginateRows<T>(rows: readonly T[], requestedPage: number, pageSize: MetaPageSize) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const offset = (page - 1) * pageSize;

  return {
    items: rows.slice(offset, offset + pageSize),
    page,
    pageSize,
    total,
    totalPages,
    start: total === 0 ? 0 : offset + 1,
    end: Math.min(offset + pageSize, total),
  };
}
