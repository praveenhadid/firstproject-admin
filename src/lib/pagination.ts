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

/** Turns untrusted `?page=`/`?limit=` values into a usable slice of the library. */
export function resolvePagination(
  total: number,
  pageParam?: string | string[] | null,
  limitParam?: string | string[] | null,
): Pagination {
  const pageSize = clamp(toInt(limitParam) ?? videoPageSize(), 1, MAX_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = clamp(toInt(pageParam) ?? 1, 1, totalPages);

  return {
    page,
    pageSize,
    total,
    totalPages,
    offset: (page - 1) * pageSize,
  };
}

/**
 * A compact pager window: first and last page always present, a few around the
 * current one, and "…" where pages were skipped.
 */
export function pageWindow(
  page: number,
  totalPages: number,
  span = 1,
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
