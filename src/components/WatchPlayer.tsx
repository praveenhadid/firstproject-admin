"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Video } from "@/lib/videos";

/** iOS Safari only allows fullscreen on the <video> element itself. */
type IosVideoElement = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
};

/** How long the title bar lingers after the pointer stops moving. */
const CHROME_HIDE_MS = 2600;

export function WatchPlayer({ video }: { video: Video }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<number | null>(null);

  /** Autoplay was refused, so the viewer has to press play themselves. */
  const [blockedPlay, setBlockedPlay] = useState(false);
  /** Playing, but fullscreen was refused; the next interaction will retry. */
  const [pendingFullscreen, setPendingFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [chromeVisible, setChromeVisible] = useState(true);

  const enterFullscreen = useCallback(async (): Promise<boolean> => {
    const root = rootRef.current;
    if (root?.requestFullscreen) {
      try {
        await root.requestFullscreen({ navigationUI: "hide" });
        return true;
      } catch {
        // Refused; try the iOS path before giving up.
      }
    }
    const ios = videoRef.current as IosVideoElement | null;
    if (ios?.webkitEnterFullscreen) {
      ios.webkitEnterFullscreen();
      return true;
    }
    return false;
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void enterFullscreen();
  }, [enterFullscreen]);

  /*
   * A tab opened from a link starts with no user activation, so browsers
   * generally refuse both fullscreen and unmuted autoplay here. Try anyway —
   * it succeeds often enough — and fall back to asking for one click, which
   * then carries the activation both calls need.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const wentFullscreen = await enterFullscreen();

      let played = true;
      try {
        await videoRef.current?.play();
      } catch {
        played = false;
      }

      if (cancelled) return;
      if (!played) setBlockedPlay(true);
      else if (!wentFullscreen) setPendingFullscreen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [enterFullscreen]);

  // Playing but not fullscreen: piggyback on whatever the viewer does next.
  useEffect(() => {
    if (!pendingFullscreen) return;

    const go = () => {
      setPendingFullscreen(false);
      void enterFullscreen();
    };
    document.addEventListener("pointerdown", go, { once: true });
    document.addEventListener("keydown", go, { once: true });

    return () => {
      document.removeEventListener("pointerdown", go);
      document.removeEventListener("keydown", go);
    };
  }, [pendingFullscreen, enterFullscreen]);

  /** The one click that starts playback also carries us into fullscreen. */
  const startFromGesture = useCallback(async () => {
    setBlockedPlay(false);
    await enterFullscreen();
    try {
      await videoRef.current?.play();
    } catch {
      setBlockedPlay(true);
    }
  }, [enterFullscreen]);

  const revealChrome = useCallback(() => {
    setChromeVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(
      () => setChromeVisible(false),
      CHROME_HIDE_MS,
    );
  }, []);

  // Fade the title bar out shortly after arrival if nothing happens.
  useEffect(() => {
    hideTimer.current = window.setTimeout(
      () => setChromeVisible(false),
      CHROME_HIDE_MS,
    );
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const element = videoRef.current;
      if (!element) return;

      switch (event.key) {
        case " ":
        case "k":
          event.preventDefault();
          if (element.paused) void element.play();
          else element.pause();
          break;
        case "ArrowLeft":
          element.currentTime = Math.max(0, element.currentTime - 5);
          break;
        case "ArrowRight":
          element.currentTime = Math.min(
            element.duration || Infinity,
            element.currentTime + 5,
          );
          break;
        case "f":
          toggleFullscreen();
          break;
        case "m":
          element.muted = !element.muted;
          break;
        default:
          return;
      }
      revealChrome();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleFullscreen, revealChrome]);

  // While paused there's nothing to watch, so leave the controls up.
  const showChrome = chromeVisible || isPaused;

  return (
    <div
      ref={rootRef}
      onMouseMove={revealChrome}
      className="relative flex h-dvh w-full items-center justify-center bg-black"
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 bg-gradient-to-b from-black/80 to-transparent p-4 transition-opacity duration-300 sm:p-6 ${
          showChrome ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="pointer-events-auto flex min-w-0 items-center gap-3">
          <Link
            href="/"
            title="Back to the library"
            className="rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
              aria-hidden="true"
            >
              <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
            </svg>
            <span className="sr-only">Back to the library</span>
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-white sm:text-lg">
              {video.title}
            </h1>
            {video.description ? (
              <p className="truncate text-sm text-white/60">
                {video.description}
              </p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title="Fullscreen (f)"
          className="pointer-events-auto shrink-0 rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5"
            aria-hidden="true"
          >
            {isFullscreen ? (
              <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
            ) : (
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            )}
          </svg>
        </button>
      </div>

      <video
        ref={videoRef}
        src={video.streamUrl}
        poster={video.posterUrl}
        controls
        autoPlay
        playsInline
        onPlay={() => setIsPaused(false)}
        onPause={() => setIsPaused(true)}
        className="h-full w-full object-contain"
      />

      {blockedPlay ? (
        <button
          type="button"
          onClick={startFromGesture}
          aria-label={`Play ${video.title} fullscreen`}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/50 text-white transition-colors hover:bg-black/40"
        >
          <span className="flex size-20 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur-sm">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="ml-1 size-9"
              aria-hidden="true"
            >
              <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
            </svg>
          </span>
          <span className="text-sm text-white/70">
            Click to play fullscreen
          </span>
        </button>
      ) : null}
    </div>
  );
}
