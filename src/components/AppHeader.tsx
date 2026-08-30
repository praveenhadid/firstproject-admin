import Link from "next/link";

import { LogoutButton } from "@/components/LogoutButton";

export type Crumb = { label: string; href?: string };

export function AppHeader({
  username,
  crumbs = [],
}: {
  username: string;
  /** Trail from the dashboard down to the current page. */
  crumbs?: Crumb[];
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent transition-colors hover:bg-accent/25"
            title="Dashboard"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="size-5"
              aria-hidden="true"
            >
              <rect x="2" y="5" width="14" height="14" rx="3" />
              <path d="m16 10 6-3.5v11L16 14" strokeLinejoin="round" />
            </svg>
            <span className="sr-only">Dashboard</span>
          </Link>

          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              <Link href="/" className="hover:text-accent">
                Video Admin
              </Link>
              {crumbs.map((crumb) => (
                <span key={crumb.label} className="flex min-w-0 items-center gap-1.5">
                  <span className="text-faint" aria-hidden="true">
                    /
                  </span>
                  {crumb.href ? (
                    <Link href={crumb.href} className="truncate text-muted hover:text-accent">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="truncate text-muted">{crumb.label}</span>
                  )}
                </span>
              ))}
            </p>
            <p className="text-xs text-faint">Signed in as {username}</p>
          </div>
        </div>

        <LogoutButton />
      </div>
    </header>
  );
}
