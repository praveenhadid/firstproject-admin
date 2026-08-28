"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Video } from "@/lib/videos";

/**
 * The catalog only gives us video URLs, so a thumbnail has to be made rather
 * than fetched: load just the metadata, seek a little way in, and paint that
 * frame onto a canvas. This works because the video is served through our own
 * /api/videos/[id]/stream route, which keeps it same-origin (an unproxied
 * cross-origin video would taint the canvas) and answers Range requests (so
 * seeking costs a few KB instead of the whole file).
 *
 * A configured `poster` short-circuits all of this.
 */

type Phase =
  /** Off-screen, or waiting for a load slot. */
  | "waiting"
  /** Metadata loading and seeking. */
  | "loading"
  /** A still was captured; the <video> is gone. */
  | "captured"
  /** Capture failed, so the seeked <video> frame is the thumbnail. */
  | "frame"
  | "error";

const CACHE_PREFIX = "video-thumbnail:";
const MAX_THUMBNAIL_WIDTH = 640;
/** How far into the video to look for a representative, non-black frame. */
const SEEK_FRACTION = 0.2;
const MAX_SEEK_SECONDS = 3;
const LOAD_TIMEOUT_MS = 20_000;

/*
 * Browsers cap connections per host at around six. Letting every on-screen
 * card open its own video stream starves the queue and makes the whole grid
 * crawl, so loads are metered: a few at a time, in the order cards appeared.
 */
const MAX_CONCURRENT_LOADS = 4;

type LoadSlot = { start: () => void; running: boolean; released: boolean };

const slotQueue: LoadSlot[] = [];
let activeLoads = 0;

function pumpSlots(): void {
  while (activeLoads < MAX_CONCURRENT_LOADS) {
    const slot = slotQueue.shift();
    if (!slot) return;
    if (slot.released) continue;
    slot.running = true;
    activeLoads += 1;
    slot.start();
  }
}

/** Calls `start` once a load slot frees up. Returns the release function. */
function requestLoadSlot(start: () => void): () => void {
  const slot: LoadSlot = { start, running: false, released: false };
  slotQueue.push(slot);
  pumpSlots();

  return () => {
    if (slot.released) return;
    slot.released = true;
    if (slot.running) {
      activeLoads -= 1;
      pumpSlots();
    }
  };
}

function readCache(id: string): string | null {
  try {
    return sessionStorage.getItem(CACHE_PREFIX + id);
  } catch {
    return null;
  }
}

function writeCache(id: string, value: string): void {
  try {
    sessionStorage.setItem(CACHE_PREFIX + id, value);
  } catch {
    // Private browsing or a full quota: the thumbnail just won't be reused.
  }
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${minutes}:${pad(secs)}`;
}

export function VideoThumbnail({ video }: { video: Video }) {
  // A configured poster short-circuits everything: no capture, no <video>.
  const posterUrl = video.posterUrl;

  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasSeeked = useRef(false);
  const releaseSlot = useRef<(() => void) | null>(null);

  const [phase, setPhase] = useState<Phase>(posterUrl ? "captured" : "waiting");
  const [captured, setCaptured] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  const thumbnail = posterUrl ?? captured;

  /** Hands the load slot back so the next queued card can start. */
  const finishLoad = useCallback(() => {
    releaseSlot.current?.();
    releaseSlot.current = null;
  }, []);

  // Nothing is requested until the card is near the viewport. A still captured
  // earlier this session is reused, so paging back and forth stays instant.
  useEffect(() => {
    if (posterUrl || phase !== "waiting") return;
    const element = rootRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();

        const cached = readCache(video.id);
        if (cached) {
          setCaptured(cached);
          setPhase("captured");
          return;
        }
        releaseSlot.current = requestLoadSlot(() => setPhase("loading"));
      },
      { rootMargin: "300px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [posterUrl, phase, video.id]);

  // Never hold a slot past unmount — paging away must not stall the next page.
  useEffect(() => finishLoad, [finishLoad]);

  // Don't leave a card shimmering forever on an unreachable or missing file.
  useEffect(() => {
    if (phase !== "loading") return;
    const timer = window.setTimeout(() => {
      finishLoad();
      setPhase("error");
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [phase, finishLoad]);

  const capture = useCallback(() => {
    // The frame is on screen now, so the stream is no longer needed either way.
    finishLoad();

    const element = videoRef.current;
    if (!element || !element.videoWidth || !element.videoHeight) {
      setPhase("frame");
      return;
    }

    const scale = Math.min(1, MAX_THUMBNAIL_WIDTH / element.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(element.videoWidth * scale);
    canvas.height = Math.round(element.videoHeight * scale);

    const context = canvas.getContext("2d");
    if (!context) {
      setPhase("frame");
      return;
    }
    context.drawImage(element, 0, 0, canvas.width, canvas.height);

    try {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
      writeCache(video.id, dataUrl);
      setCaptured(dataUrl);
      // Swapping to an <img> lets the <video> unmount and release its socket.
      setPhase("captured");
    } catch {
      // A tainted canvas would land here. The seeked frame is already on
      // screen and looks the same, so just keep showing it.
      setPhase("frame");
    }
  }, [video.id, finishLoad]);

  const handleLoadedMetadata = useCallback(() => {
    const element = videoRef.current;
    if (!element || hasSeeked.current) return;
    hasSeeked.current = true;

    setDuration(element.duration);

    const target = Number.isFinite(element.duration)
      ? Math.min(MAX_SEEK_SECONDS, element.duration * SEEK_FRACTION)
      : 0.1;

    // Seeking to 0 never fires `seeked`, so capture straight away instead.
    if (target <= 0) {
      capture();
      return;
    }
    element.currentTime = target;
  }, [capture]);

  const handleError = useCallback(() => {
    finishLoad();
    setPhase("error");
  }, [finishLoad]);

  const showSkeleton = phase === "waiting" || phase === "loading";

  return (
    <div
      ref={rootRef}
      className="relative aspect-video w-full overflow-hidden bg-black"
    >
      {phase === "captured" && thumbnail ? (
        // Data URLs and auth-gated proxy routes, so plain <img> over next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnail}
          alt=""
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : null}

      {phase === "loading" || phase === "frame" ? (
        <video
          ref={videoRef}
          src={video.streamUrl}
          preload="metadata"
          muted
          playsInline
          aria-hidden="true"
          onLoadedMetadata={handleLoadedMetadata}
          onSeeked={capture}
          onError={handleError}
          className={`size-full object-cover transition-opacity duration-300 ${
            phase === "frame" ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}

      {showSkeleton ? (
        <div className="skeleton absolute inset-0 overflow-hidden bg-surface-hover" />
      ) : null}

      {phase === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-hover text-faint">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="size-7"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
          </svg>
          <span className="text-xs">Preview unavailable</span>
        </div>
      ) : null}

      {duration ? (
        <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-white/90">
          {formatDuration(duration)}
        </span>
      ) : null}
    </div>
  );
}
