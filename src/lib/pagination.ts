import { videoPageSize } from "@/lib/env";

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  offset: number;
};

const MAX_PAGE_SIZE = 120;

function firstValue(value: string | string[] | undefined | null): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toInt(value: string | string[] | undefined | null): number | null {
  const raw = firstValue(value);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Works out the slice of the library a given page covers. */
export function paginate(
  total: number,
  page: number,
  pageSize = videoPageSize(),
): Pagination {
  const size = clamp(pageSize, 1, MAX_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = clamp(page, 1, totalPages);

  return {
    page: current,
    pageSize: size,
    total,
    totalPages,
    offset: (current - 1) * size,
  };
}

/** Same thing for the API, where page and limit arrive as untrusted strings. */
export function resolvePagination(
  total: number,
  pageParam?: string | string[] | null,
  limitParam?: string | string[] | null,
): Pagination {
  return paginate(
    total,
    toInt(pageParam) ?? 1,
    toInt(limitParam) ?? videoPageSize(),
  );
}

/** Page 1 is the folder itself; the rest are numbered segments under it. */
export function pageHref(basePath: string, page: number): string {
  return page <= 1 ? basePath : `${basePath}/page/${page}`;
}

/**
 * A compact pager window: first and last page always present, a few around the
 * current one, and "…" where pages were skipped.
 */
export function pageWindow(
  page: number,
  totalPages: number,
  span = 2,
): (number | "gap")[] {
  const pages = new Set<number>([1, totalPages]);
  for (let offset = -span; offset <= span; offset += 1) {
    const candidate = page + offset;
    if (candidate >= 1 && candidate <= totalPages) pages.add(candidate);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | "gap")[] = [];

  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) result.push("gap");
    result.push(value);
  });

  return result;
}
