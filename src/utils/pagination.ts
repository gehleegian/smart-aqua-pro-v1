export const PAGE_SIZES = [5, 10, 20, 50] as const;

/** Presentation only: totals refer to the supplied, already-loaded records. */
export function paginationWindow(total: number, requestedPage: number, pageSize: number) {
  const count = Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0;
  const size = Number.isFinite(pageSize) && pageSize > 0 ? Math.max(1, Math.trunc(pageSize)) : 10;
  const pageCount = Math.max(1, Math.ceil(count / size));
  const requested = Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1;
  const page = Math.max(1, Math.min(requested, pageCount));
  const startIndex = (page - 1) * size;
  return {
    total: count, page, pageSize: size, pageCount, startIndex,
    start: count === 0 ? 0 : startIndex + 1,
    end: Math.min(startIndex + size, count),
  };
}

/** At most seven controls, even for a large loaded history. */
export function paginationPages(page: number, pageCount: number): (number | 'gap-before' | 'gap-after')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const start = Math.max(2, Math.min(page - 1, pageCount - 4));
  const end = Math.min(pageCount - 1, Math.max(page + 1, 5));
  return [
    1,
    ...(start > 2 ? ['gap-before' as const] : []),
    ...Array.from({ length: end - start + 1 }, (_, index) => start + index),
    ...(end < pageCount - 1 ? ['gap-after' as const] : []),
    pageCount,
  ];
}
