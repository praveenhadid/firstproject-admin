import { videoFolderSize } from "@/lib/env";
import { getSourceManifest, hasVideoId } from "@/lib/manifest";
import { getSource, getSources, type SourceConfig } from "@/lib/sources";

/** A video as configured on the server. */
export type VideoSource = {
  id: string;
  sourceId: string;
  title: string;
  url: string;
};

/** The shape sent to the browser. */
export type Video = {
  id: string;
  sourceId: string;
  title: string;
  /** The file on the source server. Cards link straight here. */
  sourceUrl: string;
  /** Same file, proxied through this app so the canvas can read frames. */
  streamUrl: string;
};

/** A link on the dashboard: one source, holding folders of videos. */
export type SourceSummary = {
  id: string;
  label: string;
  count: number;
  folders: number;
};

/** A group of videos inside a link. */
export type Folder = {
  id: string;
  sourceId: string;
  label: string;
  count: number;
};

function videoFor(source: SourceConfig, id: string): VideoSource {
  return {
    id,
    sourceId: source.id,
    title: id,
    url: `${source.base}/${id}${source.extension}`,
  };
}

/**
 * Chunks one source's found ids into fixed-size folders.
 *
 * The manifest holds only ids confirmed to exist, so every card in every
 * folder points at a real file. Chunking the list of found files — rather than
 * the id space — is what keeps each folder exactly `VIDEO_FOLDER_SIZE` videos
 * even though the numbering itself is full of gaps.
 */
function chunk(ids: number[], size: number): number[][] {
  const chunks: number[][] = [];
  for (let start = 0; start < ids.length; start += size) {
    chunks.push(ids.slice(start, start + size));
  }
  return chunks;
}

function folderId(slice: number[]): string {
  return `${slice[0]}-${slice[slice.length - 1]}`;
}

// Rebuilt whenever the scanner finds more files; the revision says when.
type Cached = { revision: number; chunks: number[][] };
const cache = new Map<string, Cached>();

function chunksFor(sourceId: string): number[][] {
  const { ids, revision } = getSourceManifest(sourceId);
  const hit = cache.get(sourceId);
  if (hit && hit.revision === revision) return hit.chunks;

  const chunks = chunk(ids, videoFolderSize());
  cache.set(sourceId, { revision, chunks });
  return chunks;
}

/** Every configured link, with how much has been found under it so far. */
export function getSourceSummaries(): SourceSummary[] {
  return getSources().map((source) => {
    const chunks = chunksFor(source.id);
    return {
      id: source.id,
      label: source.label,
      count: chunks.reduce((sum, slice) => sum + slice.length, 0),
      folders: chunks.length,
    };
  });
}

export function getSourceSummary(sourceId: string): SourceSummary | undefined {
  return getSourceSummaries().find((source) => source.id === sourceId);
}

/** The folders inside one link. */
export function getFolders(sourceId: string): Folder[] {
  const source = getSource(sourceId);
  if (!source) return [];

  return chunksFor(sourceId).map((slice) => ({
    id: folderId(slice),
    sourceId,
    label: `${slice[0]}–${slice[slice.length - 1]}`,
    count: slice.length,
  }));
}

function findChunk(sourceId: string, id: string): number[] | undefined {
  return chunksFor(sourceId).find((slice) => folderId(slice) === id);
}

export function getFolder(sourceId: string, id: string): Folder | undefined {
  const slice = findChunk(sourceId, id);
  if (!slice) return undefined;
  return {
    id,
    sourceId,
    label: `${slice[0]}–${slice[slice.length - 1]}`,
    count: slice.length,
  };
}

export function toPublicVideo(video: VideoSource): Video {
  const path = `${encodeURIComponent(video.sourceId)}/${encodeURIComponent(video.id)}`;
  return {
    id: video.id,
    sourceId: video.sourceId,
    title: video.title,
    sourceUrl: video.url,
    streamUrl: `/api/videos/${path}/stream`,
  };
}

/** One page of one folder, as the browser sees it. */
export function getVideoPage(
  sourceId: string,
  folder: string,
  offset: number,
  limit: number,
): Video[] {
  const source = getSource(sourceId);
  const slice = findChunk(sourceId, folder);
  if (!source || !slice) return [];

  return slice
    .slice(offset, offset + limit)
    .map((id) => toPublicVideo(videoFor(source, String(id))));
}

/** The first video of a folder, used as its cover. */
export function getFolderCover(
  sourceId: string,
  folder: string,
): Video | undefined {
  const [first] = getVideoPage(sourceId, folder, 0, 1);
  return first;
}

/** The first video of a whole link, used as its cover on the dashboard. */
export function getSourceCover(sourceId: string): Video | undefined {
  const [firstChunk] = chunksFor(sourceId);
  if (!firstChunk?.length) return undefined;
  return getFolderCover(sourceId, folderId(firstChunk));
}

/** One video by source and id. Server use only. */
export function getVideoSource(
  sourceId: string,
  id: string,
): VideoSource | undefined {
  const source = getSource(sourceId);
  if (!source) return undefined;

  // Reject anything that isn't a plain number we have actually seen, so an id
  // can never be used to point the proxy at another path.
  if (!/^\d+$/.test(id)) return undefined;
  if (!hasVideoId(sourceId, Number.parseInt(id, 10))) return undefined;

  return videoFor(source, id);
}
