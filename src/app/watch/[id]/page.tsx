import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { WatchPlayer } from "@/components/WatchPlayer";
import { getSession } from "@/lib/auth";
import { getVideoSource, toPublicVideo } from "@/lib/videos";

export async function generateMetadata({
  params,
}: PageProps<"/watch/[id]">): Promise<Metadata> {
  const { id } = await params;
  const video = getVideoSource(id);
  return { title: video ? `${video.title} · Video Admin` : "Video Admin" };
}

export default async function WatchPage({ params }: PageProps<"/watch/[id]">) {
  // proxy.ts already turns anonymous traffic away; checked again here so the
  // page is safe even if the matcher ever stops covering this route.
  if (!(await getSession())) redirect("/login");

  const { id } = await params;
  const video = getVideoSource(id);
  if (!video) notFound();

  return <WatchPlayer video={toPublicVideo(video)} />;
}
