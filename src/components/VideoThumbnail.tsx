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
const LOAD_TIMEOUT_MS = 30_000;

/*
 * Where to look for a frame worth showing, as a fraction of the running time.
 * Opening seconds are usually a title card or a fade from black, so start a
 * quarter of the way in and keep a couple of alternates for the times that
 * lands on a dark shot. Seeking is cheap here because the stream route serves
 * byte ranges, so an alternate costs a few KB rather than a fresh download.
 */
const SEEK_FRACTIONS = [0.25, 0.55, 0.1];

/** Mean luma (0-255) below which a frame is treated as too dark to be useful. */
const MIN_USEFUL_LUMA = 26;

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

/** Clamps the chosen sample point inside the file. */
function seekTarget(duration: number, attempt: number): number {
  const fraction = SEEK_FRACTIONS[attempt] ?? SEEK_FRACTIONS[0];
  return Math.max(0.5, Math.min(duration * fraction, duration - 0.25));
}

/** Two links can both contain id 1234, so the key carries the source. */
function cacheKey(video: Video): string {
  return `${CACHE_PREFIX}${video.sourceId}:${video.id}`;
}

function readCache(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeCache(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
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
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasSeeked = useRef(false);
  const releaseSlot = useRef<(() => void) | null>(null);
  const attempt = useRef(0);
  const bestFrame = useRef<string | null>(null);
  const bestLuma = useRef(-1);

  const [phase, setPhase] = useState<Phase>("waiting");
  const [thumbnail, setCaptured] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  /** Hands the load slot back so the next queued card can start. */
  const finishLoad = useCallback(() => {
    releaseSlot.current?.();
    releaseSlot.current = null;
  }, []);

  // Nothing is requested until the card is near the viewport. A still captured
  // earlier this session is reused, so paging back and forth stays instant.
  useEffect(() => {
    if (phase !== "waiting") return;
    const element = rootRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();

        const cached = readCache(cacheKey(video));
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
  }, [phase, video]);

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

  /** Mean luma of the drawn frame, sampled sparsely because it only guides a choice. */
  const meanLuma = useCallback((context: CanvasRenderingContext2D, width: number, height: number) => {
    const { data } = context.getImageData(0, 0, width, height);
    let total = 0;
    let samples = 0;
    // Every 16th pixel is plenty to tell a black frame from a lit one.
    for (let i = 0; i < data.length; i += 4 * 16) {
      total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      samples += 1;
    }
    return samples ? total / samples : 0;
  }, []);

  /** Commits a still and lets the <video> unmount. */
  const commit = useCallback(
    (dataUrl: string) => {
      writeCache(cacheKey(video), dataUrl);
      setCaptured(dataUrl);
      setPhase("captured");
    },
    [video],
  );

  const capture = useCallback(() => {
    const element = videoRef.current;
    if (!element || !element.videoWidth || !element.videoHeight) {
      finishLoad();
      setPhase("frame");
      return;
    }

    const scale = Math.min(1, MAX_THUMBNAIL_WIDTH / element.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(element.videoWidth * scale);
    canvas.height = Math.round(element.videoHeight * scale);

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      finishLoad();
      setPhase("frame");
      return;
    }
    context.drawImage(element, 0, 0, canvas.width, canvas.height);

    let dataUrl: string;
    let luma: number;
    try {
      dataUrl = canvas.toDataURL("image/jpeg", 0.72);
      luma = meanLuma(context, canvas.width, canvas.height);
    } catch {
      // A tainted canvas would land here. The seeked frame is already on
      // screen and looks the same, so just keep showing it.
      finishLoad();
      setPhase("frame");
      return;
    }

    // Hold on to the brightest frame seen so far as the fallback.
    if (luma > bestLuma.current) {
      bestLuma.current = luma;
      bestFrame.current = dataUrl;
    }

    const nextAttempt = attempt.current + 1;
    if (luma >= MIN_USEFUL_LUMA || nextAttempt >= SEEK_FRACTIONS.length) {
      finishLoad();
      commit(luma >= MIN_USEFUL_LUMA ? dataUrl : (bestFrame.current ?? dataUrl));
      return;
    }

    // Too dark to be useful: try another point in the running time.
    attempt.current = nextAttempt;
    const duration = element.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      finishLoad();
      commit(bestFrame.current ?? dataUrl);
      return;
    }
    element.currentTime = seekTarget(duration, nextAttempt);
  }, [finishLoad, commit, meanLuma]);

  const handleLoadedMetadata = useCallback(() => {
    const element = videoRef.current;
    if (!element || hasSeeked.current) return;
    hasSeeked.current = true;

    setDuration(element.duration);

    const duration = element.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      // Unknown length (a live or malformed file): take whatever is decoded.
      capture();
      return;
    }
    element.currentTime = seekTarget(duration, 0);
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
