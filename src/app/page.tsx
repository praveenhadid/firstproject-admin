import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { ScanPanel } from "@/components/ScanPanel";
import { SourceGrid, type SourceCard } from "@/components/SourceGrid";
import { getSession } from "@/lib/auth";
import { scanInfo } from "@/lib/scan-info";
import { getSourceCover, getSourceSummaries } from "@/lib/videos";

export default async function DashboardPage() {
  // proxy.ts already turns anonymous traffic away; checking again here means
  // the page is safe even if the matcher ever stops covering this route.
  const session = await getSession();
  if (!session) redirect("/login");

  const sources: SourceCard[] = getSourceSummaries().map((source) => ({
    ...source,
    cover: getSourceCover(source.id),
  }));

  const total = sources.reduce((sum, source) => sum + source.count, 0);

  return (
    <>
      <AppHeader username={session.sub} />

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Links</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="tabular-nums text-ink">{sources.length}</span>{" "}
            {sources.length === 1 ? "link" : "links"},{" "}
            <span className="tabular-nums text-ink">
              {total.toLocaleString()}
            </span>{" "}
            videos scraped so far
          </p>
        </div>

        <ScanPanel initial={scanInfo()} />
        <SourceGrid sources={sources} />
      </main>
    </>
  );
}
