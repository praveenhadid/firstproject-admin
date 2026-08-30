# Video Admin

A password-protected gallery for a library of videos that live on a remote
server. No database: the login credentials and the video catalog both come from
environment variables.

- Sign in with a single username/password pair held in the environment.
- Each link you configure is a folder on the dashboard.
- Inside a link are folders of 1,000 scraped videos each.
- A background scan runs while the site is live, working out which files
  actually exist and recording them in an editable JSON file.
- Clicking a video opens the file itself in a new tab.

## Getting started

```bash
cp .env.example .env.local   # then fill it in - see below
npm install
npm run dev
```

Open http://localhost:3000 and sign in. The scan starts on its own; folders
appear as it finds videos.

## How it is organised

```
/                                              the links
/source/<link>                                 folders inside a link
/source/<link>/folder/<folder>                 videos, page 1
/source/<link>/folder/<folder>/page/2          videos, page 2+
```

A link's id is derived from its URL, so `https://host2.example.com/files/id/`
becomes `host2-files-id`. A folder's id is the id span it covers.

## Configuration

Everything lives in `.env.local`.

### Login

| Variable | Required | Description |
| --- | --- | --- |
| `AUTH_PASSWORD` | yes | The password for the login form. |
| `AUTH_SECRET` | yes | Signs the session cookie. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `AUTH_USERNAME` | no | Defaults to `admin`. |
| `SESSION_MAX_AGE` | no | Session lifetime in seconds. Defaults to `43200` (12 hours). |

### Links

Each link is a base URL. The first is unsuffixed, the rest are numbered `_1`,
`_2`, `_3`; names are matched case-insensitively.

```dotenv
VIDEO_BASE_URL=https://host2.example.com/files/id/
VIDEO_BASE_URL_1=https://host3.example.com/files/id/
VIDEO_EXTENSION=.mp4
```

Every video is `<base>/<id><extension>`. Optional per-link overrides:

```dotenv
VIDEO_EXTENSION_1=.mkv
VIDEO_LABEL_1=Archive        # display name; defaults to the host and path
VIDEO_SOURCE_ID_1=archive    # url slug; defaults to something like host3-files-id
```

### The background scanner

Servers that host numbered files are usually sparse — whole blocks of ids are
missing — so listing a plain id range produces folders full of dead cards.

Instead the app finds out for itself. A background sweep starts with the server
and walks each link's id space with `HEAD` requests (headers only, never file
bodies), recording the ids that answer `200` into `data/videos-manifest.json`.
Folders are chunks of that list, so **every card points at a file known to
exist**.

- **Starts on boot** via `src/instrumentation.ts`, without blocking startup.
- **Checkpoints continuously**, so a restart resumes at the id it reached.
- **Works through links in order.** When one finishes, the next begins, so
  adding a second link is only an environment change.
- **Survives a pause.** Paused is the one state that doesn't auto-resume.
  Pausing one link moves the sweep on to the next; pausing from the dashboard
  header stops everything.
- **Grows the dashboard as it goes.** A folder appears for every
  `VIDEO_FOLDER_SIZE` working videos found.

| Variable | Description |
| --- | --- |
| `VIDEO_SCAN_ENABLED` | Set `false` to never start a sweep. Default on. |
| `VIDEO_SCAN_FROM` / `VIDEO_SCAN_TO` | Id window to sweep. Defaults to `1`-`100000`. |
| `VIDEO_SCAN_FROM_1` / `VIDEO_SCAN_TO_1` | Per-link override of that window. |
| `VIDEO_SCAN_CONCURRENCY` | Probes in flight. Default `6`, max `32`. |
| `VIDEO_FOLDER_SIZE` | Videos per folder. Default `1000`. |
| `VIDEO_PAGE_SIZE` | Videos per page. Default `10`, max `120`. |

Concurrency is deliberately low, with a pause between batches: the scanner
shares the server with people actually watching videos, and it has as long as
it needs. Narrowing a link's window is worth it when you know roughly where its
files are — sweeping 60000-75000 instead of 1-100000 is hours saved.

Changing a window in the environment takes effect on the next restart; a cursor
outside the new window is pulled back inside it.

### Editing the manifest by hand

`data/videos-manifest.json` is plain JSON and safe to edit while the server is
running — changes are picked up on the next request, no restart needed:

```json
{
  "version": 2,
  "sources": {
    "host2-files-id": {
      "scan": { "from": 1, "to": 100000, "cursor": 13979, "status": "running",
                "checked": 13978, "found": 6527, "errors": 0 },
      "ids": [249, 250, 251, 257]
    }
  }
}
```

Drop ids you don't want, or paste in ones you already know about. Moving
`cursor` back makes the scanner re-check a stretch. It holds no URLs — those
stay in the environment — so the file is safe to commit. Entries for links you
later remove from the environment are kept, so a scan that took hours isn't
thrown away by an edit.

> **Needs a long-running server.** The scanner writes to disk and lives in the
> server process, so it works under `next start`, a container, or a VM. On
> serverless platforms the filesystem is read-only and processes are recycled
> between requests: set `VIDEO_SCAN_ENABLED=false` there and commit a manifest
> generated on a machine that can run it.

## How it works

### Two URLs per video

Each video is exposed two ways:

- `sourceUrl` — the file on the source server. Cards link straight to it, and
  the browser opens it in its own player.
- `streamUrl` — the same file proxied by `/api/videos/<link>/<id>/stream`,
  which forwards `Range` and returns `206 Partial Content` unchanged.

The proxy exists for the thumbnails. Reading pixels out of a `<video>` requires
it to be same-origin; a cross-origin file taints the canvas and frame capture
becomes impossible. Source servers that send no `Access-Control-Allow-Origin`
header — most of them — can only be thumbnailed this way.

Note that linking cards to `sourceUrl` puts those URLs in the page markup. If
the source server has no access control of its own, a link copied from here
will play for anyone, signed in or not. Point cards at `streamUrl` instead if
that matters.

### Thumbnails are captured, not fetched

The catalog is only ids, so there are no thumbnail images to load. Each card
loads the video's metadata, seeks about a quarter of the way in, and paints
that frame to a canvas. Opening seconds are usually a title card or a fade from
black, so if the frame comes back too dark the card tries two more points and
keeps the brightest. The still is cached in `sessionStorage` under a key that
includes the link — two links can both hold an id `1234` — and the `<video>`
element is then discarded to free the connection.

Cards only start loading once they are near the viewport, and no more than four
load at a time — browsers cap connections per host, and letting ten cards race
made the whole grid slower.

### Playback

A card is a plain `<a href={sourceUrl} target="_blank" rel="noopener noreferrer">`,
so clicking opens the file in a new tab and the browser's built-in player takes
it from there, fullscreen included. `noreferrer` keeps this app's URLs out of
the request the source server sees.

### Authentication

Sign-in compares the submitted credentials against the environment and sets an
HMAC-SHA256 signed cookie holding the username and an expiry. There is no
session store — the signature is the proof — so nothing needs to be persisted.

`src/proxy.ts` (Next.js 16 renamed Middleware to Proxy) gates every route,
redirecting anonymous browsers to `/login` and answering the API with `401`.
Because a matcher can drift out of step with the routes it is meant to cover,
every protected page and route handler verifies the session again on its own.

## API

All of these require the session cookie and answer `401` without it.

| Route | Purpose |
| --- | --- |
| `POST /api/auth/login` | `{ username, password }` → sets the session cookie. |
| `POST /api/auth/logout` | Clears the cookie. |
| `GET /api/auth/session` | Current session, if any. |
| `GET /api/sources` | Every link, with its video and folder counts. |
| `GET /api/scan` | Scan progress per link, plus an overall total. |
| `POST /api/scan` | `{ action, source? }` — `start`, `pause`, `resume`, `reset`. Without `source`, applies to every link. |
| `GET /api/videos?source=&folder=&page=&limit=` | One page of a folder. Defaults to the first link and folder. |
| `GET /api/videos/[source]/[id]` | A single video. |
| `GET /api/videos/[source]/[id]/stream` | The video itself, with `Range` support. |

## Layout

```
src/
  proxy.ts                     auth gate for every route
  instrumentation.ts           starts the scanner when the server boots
  app/
    page.tsx                   dashboard: the links
    source/[source]/page.tsx   folders inside one link
    source/[source]/folder/[folder]/page.tsx          videos, page 1
    source/[source]/folder/[folder]/page/[page]/page.tsx   videos, pages 2+
    login/page.tsx
    api/…
  components/
    AppHeader.tsx              header and breadcrumb
    SourceGrid.tsx             the link cards
    FolderGrid.tsx             the folder cards
    LibraryView.tsx            grid and pager for one page of one folder
    ScanPanel.tsx              live scan progress and controls
    VideoGrid.tsx              the video cards
    VideoThumbnail.tsx         frame capture, lazy loading, load metering
    Pager.tsx, LoginForm.tsx, LogoutButton.tsx
  lib/
    env.ts                     credentials and sizing
    sources.ts                 the configured links
    manifest.ts                the editable JSON, read and written at runtime
    scanner.ts                 the background sweep
    auth.ts, session.ts        credential check and cookie signing
    videos.ts                  links, folders and videos
    upstream.ts                the streaming proxy
    pagination.ts
data/
  videos-manifest.json         the working videos (editable, safe to commit)
```

## Scripts

```bash
npm run dev     # development server
npm run build   # production build
npm start       # serve the production build
npm run lint
```
