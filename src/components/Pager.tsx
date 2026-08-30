import Link from "next/link";

import { pageHref, pageWindow, type Pagination } from "@/lib/pagination";

const base =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm transition-colors";
const enabled = "border-line text-muted hover:border-line-strong hover:text-ink";
const disabled = "border-line/40 text-faint";

export function Pager({
  page,
  totalPages,
  basePath,
}: Pagination & { basePath: string }) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Library pages"
      className="mt-10 flex flex-wrap items-center justify-center gap-2"
    >
      {page > 1 ? (
        <Link href={pageHref(basePath, page - 1)} rel="prev" className={`${base} ${enabled}`}>
          Previous
        </Link>
      ) : (
        <span className={`${base} ${disabled}`}>Previous</span>
      )}

      {pageWindow(page, totalPages).map((entry, index) =>
        entry === "gap" ? (
          <span key={`gap-${index}`} className="px-1 text-faint" aria-hidden="true">
            …
          </span>
        ) : entry === page ? (
          <span
            key={entry}
            aria-current="page"
            className={`${base} border-accent bg-accent/15 font-medium text-ink tabular-nums`}
          >
            {entry}
          </span>
        ) : (
          <Link
            key={entry}
            href={pageHref(basePath, entry)}
            className={`${base} ${enabled} tabular-nums`}
          >
            {entry}
          </Link>
        ),
      )}

      {page < totalPages ? (
        <Link href={pageHref(basePath, page + 1)} rel="next" className={`${base} ${enabled}`}>
          Next
        </Link>
      ) : (
        <span className={`${base} ${disabled}`}>Next</span>
      )}
    </nav>
  );
}
