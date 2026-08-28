import Link from "next/link";

import { pageWindow, type Pagination } from "@/lib/pagination";

function href(page: number): string {
  return page === 1 ? "/" : `/?page=${page}`;
}

const baseStyles =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm transition-colors";

export function Pager({ page, totalPages }: Pagination) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Video library pages"
      className="mt-10 flex flex-wrap items-center justify-center gap-2"
    >
      {page > 1 ? (
        <Link
          href={href(page - 1)}
          rel="prev"
          className={`${baseStyles} border-line text-muted hover:border-line-strong hover:text-ink`}
        >
          Previous
        </Link>
      ) : (
        <span className={`${baseStyles} border-line/50 text-faint`}>Previous</span>
      )}

      {pageWindow(page, totalPages).map((entry, index) =>
        entry === "gap" ? (
          <span
            key={`gap-${index}`}
            className="px-1 text-faint"
            aria-hidden="true"
          >
            …
          </span>
        ) : entry === page ? (
          <span
            key={entry}
            aria-current="page"
            className={`${baseStyles} border-accent bg-accent/15 font-medium text-ink`}
          >
            {entry}
          </span>
        ) : (
          <Link
            key={entry}
            href={href(entry)}
            className={`${baseStyles} border-line text-muted hover:border-line-strong hover:text-ink`}
          >
            {entry}
          </Link>
        ),
      )}

      {page < totalPages ? (
        <Link
          href={href(page + 1)}
          rel="next"
          className={`${baseStyles} border-line text-muted hover:border-line-strong hover:text-ink`}
        >
          Next
        </Link>
      ) : (
        <span className={`${baseStyles} border-line/50 text-faint`}>Next</span>
      )}
    </nav>
  );
}
