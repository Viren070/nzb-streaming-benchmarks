# Applications under test

One adapter per application, in `src/adapters/`. Each one builds the application, starts
it, imports an NZB, and resolves that import to something the harness can issue HTTP
Range requests against. Everything after `resolve()` is shared code, so the applications
differ only in how they are configured and driven, never in how they are measured.

Every application is given the same NNTP providers and the same connection budget
(`--conns`). Apps are otherwise left at their shipped defaults.

Each one runs either **from source** (the default) or **in a container** built from its
own Dockerfile. See [running in a container](#running-in-a-container).

| Application | Language | Import | Stream | Platforms |
|---|---|---|---|---|
| [raw](#raw) | this harness | none | HTTP Range | all |
| [AltMount](#altmount) | Go | SABnzbd API | WebDAV | all |
| [nzbdav](#the-nzbdav-family) | C# | SABnzbd API | WebDAV | all |
| [nzbdavex](#the-nzbdav-family) | C# | SABnzbd API | WebDAV | all |
| [InfiniDysk](#the-nzbdav-family) | C# | SABnzbd API | WebDAV | all |
| [AIOStreams](#aiostreams) | TypeScript | dashboard API | HTTP Range | all |
| [StremThru (newz)](#stremthru-newz) | Go | store API | HTTP Range | all |
| [StreamNZB](#streamnzb) | Go | direct play API | HTTP Range | all |
| [Decypharr](#decypharr) | Go | SABnzbd API | WebDAV | container on Windows |
| [Comet (feat/usenet)](#comet-featusenet) | Python + Rust | addon API | HTTP Range | container only |

## raw

Not an application. The harness fetches the same articles over NNTP itself, decodes
yEnc, and serves the result over a local HTTP server, measured by identical code. It is
the transport ceiling for the day: absolute MB/s means nothing without it.

For archived posts `raw` serves the **outer volume stream**, not the inner file, because
unpacking is the work the applications are being compared on. That makes it a valid
byte-identity reference only for `direct-video` entries, and it is excluded from the
byte-identity comparison elsewhere. Corpus entries whose measurement addresses the
assembled inner file (the missing-article test) are skipped for `raw` entirely.

## AltMount

Go, WebDAV-backed NZB filesystem.

- **Config** written as `config.yaml` before start.
- **Import** `POST /sabnzbd/api?mode=addfile`, tracked by `nzo_id` through
  `mode=history`.
- **Stream** `GET /webdav/<path>`, located by a depth-1 PROPFIND walk from the
  mount-relative path the history entry reports.

Quirks:

- The API key must be exactly 32 characters; other lengths are rejected at parse time.
- The API sets `AllowCredentials`, so an explicit CORS origin is required or the server
  panics at startup against its own default wildcard.
- The SABnzbd API is disabled by default, and the target category must already exist or
  `addfile` answers HTTP 200 with `{"status":false}`.
- Failures are reported as HTTP 200 with a `status:false` body, so the adapter inspects
  the body rather than the status code.
- The CLI embeds a built frontend, so web assets must be built before `go build`.
- In the container the s6 service runs `altmount serve --config=/config/config.yaml`, a
  fixed path, so the config has to land there under that name. The image's Dockerfile is
  at `docker/Dockerfile`, not the repository root.

## The nzbdav family

`nzbdav` and its forks `nzbdavex` and `InfiniDysk` share one adapter base. All three are
.NET, backend only.

- **Config** `POST /api/update-config`, authenticated with a header key. Provider
  entries are PascalCase and the provider type is a number.
- **Onboarding** `GET /api/is-onboarding`, then `POST /api/create-account`.
- **Import** SABnzbd-compatible API, polled through `mode=history`.
- **Stream** WebDAV. The history entry reports a symlink path; the real media lives
  under `/content/<category>/<release>`.

Quirks:

- Config controllers read the request form directly, so a JSON body returns 500.
- The database must be migrated with `--db-migration` before the server will serve.
- PROPFIND returns absolute hrefs, unlike AltMount's relative ones.
- Requires the .NET SDK from source. A missing SDK fails the adapter with the install
  hint and a pointer to `--docker`, rather than quietly dropping a row.
- The image runs two processes: the backend on `8080` and a web frontend on `3000`,
  which is the port it EXPOSEs. Config, SABnzbd and WebDAV all live on the backend, so
  `8080` is the port the harness publishes.
- The container entrypoint runs `--db-migration` before serving. The source path has to
  do the same thing itself, which is why `nativeLaunch()` migrates before returning.
- `PORT` is the **web UI's** port, not the backend's, which comes from
  `ASPNETCORE_URLS`. Pointing both at one port makes whichever the entrypoint starts
  first take it and the other die on address-in-use. InfiniDysk starts its frontend
  first, so it fails this way where nzbdav appears to work.

## AIOStreams

TypeScript, in-process usenet engine, driven through its dashboard API.

- **Config** by environment: `USENET_PROVIDERS` as a JSON array,
  `USENET_PREFETCH_SEGMENTS`, and a per-provider `pipelineDepth`.
- **Auth** dashboard routes need an admin session, so the adapter signs in and carries
  the cookie.
- **Import** `POST /api/v1/dashboard/usenet/library/upload`, multipart.
- **Status** polled from the library entry's `status`, not its file list: a failed
  import simply has no files, so waiting for files turns an explicit failure into a
  timeout with no reason attached. `failReason` and `errorCode` are recorded.
- **Stream** `/play` mints a signed token and returns JSON pointing at the actual
  Range-capable byte route, so the adapter follows that rather than treating `/play` as
  the stream.

Quirks:

- The data folder is derived from `DATABASE_URI`, not from any `DATA_DIR` variable. With
  it unset the application writes to `./data` relative to its working directory, inside
  the clone, and that directory persists across runs. The adapter sets it explicitly.
- Only a plain relative `sqlite://./path` URI is safe: `..` segments are normalised away
  by the URL parser, and absolute URIs are percent-encoded, so any path containing a
  space resolves to a literal `%20` directory.
- The database is deliberately kept between runs, because a fresh one rebuilds an anime
  mapping dataset before the server answers, which is one-off in real use and unrelated
  to usenet. The segment cache and the imported library are cleared instead, so an open
  is not served from local disk.

## StremThru (newz)

Go, multi-store Stremio addon whose `stremthru` store is its own usenet engine. Two
APIs are involved, with different authentication.

- **Servers** `POST /dash/api/vault/usenet/servers`, session cookie, admin user.
- **Import** `POST /v0/store/newz`, store headers.
- **Poll** `GET /v0/store/newz/{id}` for `{status, files[]}`.
- **Resolve** `POST /v0/store/newz/link/generate` turns a file link into a byte URL.

Quirks:

- The built-in store ignores an uploaded file and requires a link, so the adapter serves
  the NZB over a throwaway local HTTP server and hands over that URL.
- Needs the `newz` and `vault` features plus a non-empty vault secret, or the
  usenet-server endpoints 404.
- Must be built with `sqlite_fts5`; a migration creates an fts5 virtual table and an
  untagged build starts, then dies on "no such module: fts5".
- Playback links are built from a configured base URL rather than the request Host.
- Unrelated background work (an IMDb dataset import, store crawling) is switched off,
  since it competes for CPU and disk with the measurement.
- The default NZB size cap is well below the largest corpus entries and is raised.
- The Dockerfile COPYs `apps/dash/.output/public/` into the Go build to embed the
  dashboard, and a clean checkout has no such directory. The adapter builds the dash
  frontend with pnpm before the image build.

## StreamNZB

Go, Stremio addon that streams on the fly rather than mounting.

- **Config** providers bootstrap from the environment, which also pins them: values set
  that way cannot be overridden through the UI.
- **Import and stream** `POST /api/play/nzb` accepts NZB bytes or a source URL and
  answers a session with a play URL, which serves the chosen inner file with Range
  support.

Quirks:

- Only stored archives are supported, by design, so the `negative` tier fails here
  without that being a defect.
- A failed play can be answered with a short status clip rather than an error. That is
  valid media over a Range-capable route, so the harness applies an absolute size floor
  to catch it.
- The bundled NNTP proxy is disabled, since it binds a privileged port and would contend
  for the connection budget being measured.
- `admin_token` is generated into `config.json` on first boot and accepted as a bearer
  token, which is more stable than driving the login flow.
- The server embeds a `static` directory the frontend build produces and the repository
  does not contain, so the frontend must be built first.
- The Dockerfile is a release artefact: it COPYs `dist/linux_<arch>/streamnzb` rather
  than compiling, because upstream's pipeline builds with goreleaser first. The adapter
  compiles that binary in a `golang:alpine` container, since streamnzb links rapidyenc
  through cgo and cross-compiling to Linux from Windows would need a Linux C toolchain.
- `admin_token` is generated into `config.json` on first boot, which under Docker is
  inside the container; the adapter reads it back through `readDataFile()` and so does
  not care which runtime it is on.

## Decypharr

Go media gateway that assembles the archive at import and exposes the inner media file
directly, so what is measured is the unpacked video rather than the outer volume stream.

- **Config** `config.json` in the directory passed to `--config`.
- **Import** `POST /sabnzbd/api?mode=addfile`, multipart.
- **Stream** `GET /webdav/__all__/<entry>/<file>`, located by a depth-1 PROPFIND.

Quirks:

- The SABnzbd API is mounted at `/sabnzbd`, not at `/api`; `/api/v2` is the qBittorrent
  API and answers a SAB-shaped request with something unrelated.
- The multipart file field is `name`. Anything else returns "No file uploaded".
- Two different middlewares read the category from two different parameters: the upload
  handler reads `category`, the Arr context reads `cat`. The adapter sets both.
- The default download action is `symlink`, which waits indefinitely for decypharr's
  FUSE mount. This benchmark measures the WebDAV path with the mount off, so that wait
  never ends and the entry never leaves the queue. Imports are submitted with
  `action=none`, which completes the entry instead. It changes bookkeeping only: the
  assembled file is addressable over WebDAV either way.
- History lists only errored entries and entries still sitting completed in the queue,
  so a successful `action=none` import never appears in it. Readiness is therefore the
  WebDAV listing; history is polled alongside it purely to get the reason for a failure.
- WebDAV groups are `__all__`, `__bad__`, `torrents` and `nzbs`. The SAB category does
  not appear in the WebDAV tree at all.
- Import runs an unconditional content gate: every media file's head is read through the
  real streaming stack and must match a known container signature. An NZB whose articles
  all exist but assemble wrongly is failed at import rather than served. That is a
  shipped default and is left on.
- Building natively on Windows requires the WinFsp kernel driver, because
  `register_cgo.go` links winfsp/cgofuse with no build tag even though this benchmark
  only uses the WebDAV path. Without it, `--docker=decypharr` measures it instead.

## Comet (feat/usenet)

Python supervisor with an out-of-process Rust usenet engine, on the `feat/usenet`
branch. The engine uses `UnixStream`, Landlock, seccomp-BPF and `prctl` throughout with
no `cfg(windows)` gating, so there is no Windows build. It is measured with
`--docker=comet`.

Comet is a Stremio addon, and unlike every other application here it has **no "import
this NZB" API**. It discovers releases from configured sources and mints a signed
playback capability for one. To drive it with a chosen corpus entry, the adapter stands
up a one-stream Stremio addon of its own and configures comet's `stremio_addon`
discovery source to point at it. Comet then does its own fetching, brokering, engine
inspection and playback; only the release it is offered is ours.

- **Config** carried base64 in the URL path (`schemaVersion: 2`), plus environment for
  the engine itself.
- **Discover** `GET /{b64config}/stream/movie/{imdb}.json` returns streams; the one with
  a `/playback/v2/pi2.…` URL is the playable candidate. This single request is comet's
  whole import: it fetches the NZB, brokers it and has the engine parse it.
- **Stream** following that URL redirects to a `pa2.` capability that serves bytes with
  Range support. The `pa2` capability is valid for six hours, so it is resolved once and
  reused for the whole entry.

Quirks:

- Every `configurationId` in the configuration must be a **UUID string**: the capability
  codec calls `uuid.UUID()` on it directly, and any other id is a 500 from the stream
  endpoint rather than a validation error.
- The engine requires Landlock ABI 3 or newer from the host kernel. Docker Desktop's
  WSL2 kernel reports ABI 7 and the default seccomp profile permits the syscalls, so it
  starts; a kernel without Landlock would not.
- Plain-HTTP private origins are refused outright, so the fixture addon's origin has to
  be named in `USENET_PRIVATE_UPSTREAM_ORIGINS` or discovery fails at the URL check.
- A discovery source that fails even once is recorded as unavailable and skipped for a
  cooldown, during which the stream endpoint answers in milliseconds with no candidates.
  The fixture addon is therefore started before the container, not alongside it.
- First boot ingests a ~70 MB anime-mapping dataset before the app serves anything,
  which takes around 95 seconds and is unrelated to usenet. It is one-off in real use,
  and it completes before readiness, so it does not overlap the measurement.
- **A failure is answered with a video, not an error.** When the engine cannot serve an
  entry, comet returns HTTP 200 with a ~420 KB `video/mp4` status clip explaining the
  problem. The distinguishing feature is `accept-ranges: none`; with a `Retry-After` it
  means "still preparing", and without one it is terminal. The adapter treats the latter
  as the capability failure it is rather than letting a 420 KB "success" into the table.
- Comet caps an NNTP server at 100 connections and rejects the whole configuration above
  it, which would otherwise surface as "no candidates". The adapter checks this up front.
- Each entry gets a fresh discovery-source id and its own addon URL, so comet cannot
  answer one entry from another entry's cached release.
- Comet builds natively on Linux and should be measured that way there. This harness has
  no source path for it yet (it needs uv, a Rust toolchain for `native/usenet-engine`, an
  npm frontend build and par2/libarchive from `deployment/`), so a Linux host also has to
  pass `--docker=comet` for now. That is a gap in this harness, not a property of the
  application, and the adapter says so rather than blaming the platform.

### Comet does not complete a full-corpus pass

Comet is the one application here whose row cannot be taken at face value, and the reason
is worth stating plainly.

Its engine materialises an archive rather than streaming it, and that work outlives the
harness's item boundary: the harness takes its measurements and moves on while the engine
is still materialising. The next entry then starts against a spent connection pool and
fails with `nntp_singleflight_capacity`, or collides with the still-held publication lock
and fails with `materialized artifact publication is busy`. Either way the failure is
recorded against a corpus entry that did nothing wrong.

The adapter drains between entries to prevent exactly that, and it cannot: comet's
`/admin/usenet/snapshot` reports `active: 0` and `preparations: 0` for as long as you care
to poll while the engine is demonstrably working, so there is no exposed signal for
"engine idle".

Underneath both is a harder problem. Under sustained load comet **deadlocks its own
SQLite database and does not recover**. With the harness stopped and nothing else running,
an idle instance still answered `POST /api/v1/auth/login` with a 500 after 30 seconds
(`OperationalError: database is locked`), its telemetry synchronisation kept failing the
same way, and its engine heartbeat stopped being written at all, which is what empties the
`runtimes` list the drain would otherwise read. Three separate runs reached this state.
`DATABASE_TYPE=sqlite` is comet's shipped default, and every application here is run at
its shipped defaults, so this is a result rather than a misconfiguration. Comet supports
PostgreSQL and requires it above one replica; a Postgres run would be a different
experiment and would need saying so.

## Cross-cutting notes

### Build toolchains

The Go applications link `rapidyenc` through cgo and need a C compiler; MSVC will not do
it, mingw-w64 will. The .NET applications need the .NET SDK, and AIOStreams needs pnpm
because it is a workspace using the `workspace:*` protocol. Toolchains are resolved
explicitly rather than trusted to be on PATH, since version managers frequently place
them outside a non-interactive child's environment.

Builds are reused when an application's checked-out commit has not changed. `--rebuild`
forces a rebuild; `--update-apps` fast-forwards each clone first, which invalidates the
cache for anything that actually moved. Container images are cached the same way, by a
tag carrying the commit.

None of this is needed for a run that passes `--docker`, which builds each application
inside its own image and requires only Docker.

### Running in a container

Every application can be run either from source or in a container built from its own
Dockerfile. `--docker` runs all of them that way; `--docker=altmount,nzbdav` runs only
those.

Source is the default. An application that cannot be built on this host fails with the
reason rather than quietly becoming a container row. Docker covers two cases: a host that
cannot build something (comet has no Windows build, decypharr needs the WinFsp kernel
driver to compile on Windows), and anyone who would rather not install Go, .NET, pnpm and
a C toolchain to run a benchmark.

Container rows are marked `runtime: docker` in `results.json` and the report, and the
report carries a note explaining what that changes.

#### What is and is not comparable

- **Latency and throughput** cross an extra NAT hop into the VM. Compare container rows
  with each other freely; against a source row, read them as indicative.
- **CPU and memory** are measured, not blanked. They come from the Docker daemon's cgroup
  counters for the container (`cpu_usage.total_usage`, and `memory.stat`'s
  `anon + file_mapped`), which are the same kind of monotonic counters the host sampler
  collects for a process. They are read from the daemon rather than from inside the
  container, because a `docker exec` once a second charges its own CPU to the cgroup
  being measured.
- Memory excludes page cache. The cgroup's total charge includes it, and an application
  that has streamed tens of GiB has tens of GiB of it, which measures kernel caching
  rather than the application.

Application state lives in a Docker volume, not a bind mount: a bind mount from a Windows
host reaches the container over a file-sharing bridge, and the application's disk I/O
would be measuring that bridge.

#### How an adapter supports both

An adapter never branches on the runtime. It declares what its application needs (a
build, config files, an environment, a command, a readiness check) and `Adapter` in
`src/adapters/base.mjs` is the only code that knows which runtime is in play. Three
accessors carry the difference:

| | source | docker |
|---|---|---|
| `dataDir` | the per-run state directory | the path the image expects |
| `servicePort` | the allocated host port | the container's internal port |
| `bindHost` | `127.0.0.1` | `0.0.0.0`, or the published port reaches nothing |

Config is written in terms of those, so the same config is correct under both.
`this.base` is always the URL the harness calls. Adding a container runtime to an
application is one static field:

```js
static docker = { containerPort: 8282, dataDir: '/app' };
```

`raw` has no descriptor: it is the in-harness NNTP baseline, not an application.

Applications that cannot use the defaults have three hooks.
`static freshStatePerRun = false` keeps a dataset between runs and
`get nativeStateDir()` pins a data location, both used by AIOStreams.
`readDataFile(rel)` reads a file the application generated, from disk or through
`docker exec`, so an adapter needing a generated token stays runtime-agnostic.

#### When an image needs a pre-build

Two of these Dockerfiles are release artefacts: they copy in a build product rather than
compiling it, because upstream's pipeline runs a frontend build or goreleaser first. A
clean checkout has no such product and the build fails on `COPY ... not found`. Those
adapters implement `beforeImageBuild()`:

- **StremThru** builds the dash frontend (`apps/dash/.output/public/`) with pnpm.
- **StreamNZB** builds its frontend, then compiles `dist/linux_<arch>/streamnzb` in a
  `golang:alpine` container. It links rapidyenc through cgo, so cross-compiling to Linux
  from Windows would need a Linux C toolchain; building in a container needs only Docker.

The hook runs only when an image is going to be built, so a reused image costs nothing.

#### What the harness fixes in its own clones

Two properties of a shallow Windows clone break image builds, and both depend on upstream
choices rather than on anything the harness controls. It corrects them before building,
and forces one rebuild when it does, since neither moves the commit the image tag carries.

- **Line endings.** Git on Windows defaults to `core.autocrlf=true`. A repository that
  ships a `.gitattributes` is protected; one that does not gets CRLF shell scripts, and
  an image built from it has an entrypoint the kernel cannot exec, reported as
  `exec /entrypoint.sh: no such file or directory`.
- **Submodules.** `git clone --depth 1` leaves them empty, and InfiniDysk's Dockerfile
  builds rapidyenc from one.

`scripts/clone-apps.sh` sets both correctly for new clones.

### NNTP pipelining

Defaults differ, which matters when reading throughput and TTFB together:

| Application | Pipelining |
|---|---|
| nzbdav | none |
| nzbdavex | STAT/BODY/ARTICLE, default off, depth 8 |
| InfiniDysk | streaming path on by default (width 4), queue pipelining off |
| AltMount | inflight requests, default 3 |
| AIOStreams | per-provider `pipelineDepth`, default 1 |
| Decypharr | none; parallel connections plus a 16 MB read-ahead, 15 conns/stream |
| Comet | per-server `pipeline`, default 16 |

Runs compare shipped defaults with only the connection budget normalised. A run that
matched pipeline depth across applications would be comparing engines rather than
configurations, and would be a different experiment.

### What the adapters deliberately do not do

Adapters never tune an application for throughput, never disable its correctness checks,
and never retry a failed import. A failure is a result.
