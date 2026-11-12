import { PAGE_SIZES, paginationPages } from '../../utils/pagination';
import Button from './Button';

type PaginationProps = {
  label: string;
  itemLabel: string;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  start: number;
  end: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export default function Pagination({
  label, itemLabel, total, page, pageCount, pageSize, start, end, onPageChange, onPageSizeChange,
}: PaginationProps) {
  if (total === 0) return null;
  return (
    <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-slate-600/30 pt-3">
      <div className="space-y-2 text-xs text-slate-400">
        <p role="status" aria-live="polite">Showing {start}–{end} of {total} loaded {itemLabel}</p>
        <label className="flex flex-wrap items-center gap-2">
          Rows per page
          <select aria-label={`${label}: rows per page`} value={pageSize}
            onChange={event => onPageSizeChange(Number(event.target.value))}
            className="min-h-11 rounded-lg border border-slate-600/50 bg-slate-900/45 px-2 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-teal-300">
            {PAGE_SIZES.map(size => <option key={size} value={size} className="bg-slate-900">{size}</option>)}
          </select>
        </label>
      </div>
      <nav aria-label={`${label} pagination`} className="flex min-w-0 flex-wrap items-center gap-1">
        <Button type="button" variant="secondary" size="sm" className="min-h-11 focus-visible:outline-2 focus-visible:outline-teal-300" disabled={page <= 1}
          aria-label={`${label}: previous page`} onClick={() => onPageChange(page - 1)}>Previous</Button>
        {paginationPages(page, pageCount).map(item => typeof item === 'number' ? (
          <Button key={item} type="button" size="sm" variant={item === page ? 'primary' : 'ghost'}
            className="min-h-11 min-w-11 focus-visible:outline-2 focus-visible:outline-teal-300"
            aria-label={`${label}: page ${item}`} aria-current={item === page ? 'page' : undefined}
            onClick={() => onPageChange(item)}>{item}</Button>
        ) : <span key={item} className="px-1 text-slate-500" aria-hidden="true">…</span>)}
        <Button type="button" variant="secondary" size="sm" className="min-h-11 focus-visible:outline-2 focus-visible:outline-teal-300" disabled={page >= pageCount}
          aria-label={`${label}: next page`} onClick={() => onPageChange(page + 1)}>Next</Button>
        <span className="w-full text-right text-xs text-slate-400">Page {page} of {pageCount}</span>
      </nav>
    </div>
  );
}
