import type { Metadata } from "next";

import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "Sign in · Video Admin",
};

/**
 * Keeps `?next=` pointing inside this app. Anything protocol-relative or
 * absolute would turn the login page into an open redirect.
 */
function safeNextPath(value: string | string[] | undefined): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="size-6"
              aria-hidden="true"
            >
              <rect x="2" y="5" width="14" height="14" rx="3" />
              <path d="m16 10 6-3.5v11L16 14" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Video Admin</h1>
          <p className="mt-2 text-sm text-muted">
            Sign in to browse the video library.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-2xl shadow-black/40">
          <LoginForm nextPath={nextPath} />
        </div>
      </div>
    </main>
  );
}
