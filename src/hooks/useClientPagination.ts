import { useState } from 'react';
import { PAGE_SIZES, paginationWindow } from '../utils/pagination';

/** Client-side slicing only; never fetches, sorts or mutates the source records. */
export function useClientPagination<T>(items: readonly T[], scope: string, defaultPageSize = 10) {
  const [selection, setSelection] = useState(() => ({ scope, page: 1, pageSize: defaultPageSize }));
  const requestedPage = selection.scope === scope ? selection.page : 1;
  const window = paginationWindow(items.length, requestedPage, selection.pageSize);
  // React's guarded prop-adjustment pattern prevents a stale page being committed
  // after switching aquarium/filter, and clamps shrinking live snapshots.
  if (selection.scope !== scope || selection.page !== window.page) {
    setSelection({ scope, page: window.page, pageSize: window.pageSize });
  }
  return {
    ...window,
    items: items.slice(window.startIndex, window.end),
    onPageChange: (page: number) => setSelection({
      scope, page: paginationWindow(items.length, page, window.pageSize).page, pageSize: window.pageSize,
    }),
    onPageSizeChange: (pageSize: number) => {
      if (PAGE_SIZES.some(size => size === pageSize)) setSelection({ scope, page: 1, pageSize });
    },
  };
}
