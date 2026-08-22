# NZB streaming benchmark

**Run** `2026-08-22T13-02-13-756Z` · started 2026-08-22T13:02:13.756Z · finished 2026-08-22T15:51:58.966Z

> **Merged run.** **altmount**: all 31 entries came from a separate pass
> (`2026-08-22T15-54-06-755Z`, 2026-08-22T15:54:06.755Z) and were merged in. Those rows saw the provider at a
> different time from the rest, so compare them with that in mind.

> **Merged run.** **infinidysk**: all 31 entries came from a separate pass
> (`2026-08-22T19-42-35-221Z`, 2026-08-22T19:42:35.221Z) and were merged in. Those rows saw the provider at a
> different time from the rest, so compare them with that in mind.

> **Merged run.** **streamnzb**: all 31 entries came from a separate pass
> (`2026-08-22T20-12-49-073Z`, 2026-08-22T20:12:49.073Z) and were merged in. Those rows saw the provider at a
> different time from the rest, so compare them with that in mind.

## Environment

Microsoft Windows 11 Pro · AMD Ryzen 7 7800X3D 8-Core Processor (16 threads) · 32 GB RAM

| | |
|---|---|
| OS | Microsoft Windows 11 Pro |
| CPU | AMD Ryzen 7 7800X3D 8-Core Processor, 8C/16T |
| RAM | 32.00 GiB @ 6000 MHz |
| Disk | KLEVV CRAS C925G M.2 NVMe SSD 2TB (SSD) |
| Harness | Node v24.16.0 |

### NNTP providers

| Provider | Port | TLS | Max conns | Role |
|---|---:|:---:|---:|---|
| `news.newshosting.com` | 563 | yes | 20 | primary |

> Throughput is bounded by the provider and the link, not only by the application.
> The `raw` row is this harness fetching the same articles with no application in
> the middle, so read every other number relative to it.

### Applications measured

| App | Runtime | Language | Version | Serving | Startup |
|---|---|---|---|---|---:|
| **AltMount** | source | Go | `4b42c67` | webdav | 323 ms |
| **nzbdavex** | source | C# (.NET 10) | `312d3bc` | webdav | 4.15 s |
| **StreamNZB** | source | Go | `v5.9.0` | http-range | 1.31 s |
| **StremThru (newz)** | source | Go | `0.103.2` | http-range | 2.04 s |
| **InfiniDysk** | source | C# (.NET 10) | `ed0dd0a` | webdav | 6.53 s |
| **nzbdav** | source | C# (.NET 10) | `794948b` | webdav | 3.30 s |
| **Decypharr** | docker | Go | `v2.5` (`0dd1cbb`) | webdav | 2.75 s |
| **raw NNTP baseline** | source | JavaScript (this harness) | `harness-builtin` | http-range | 2 ms |
| **AIOStreams** | source | TypeScript | `9e59c4a` | http-range | 24.30 s |

### Run settings

| Setting | Value |
|---|---|
| Sequential read | 244 MiB cap / 30s cap |
| Seek points | 1%, 25%, 50%, 75%, 95% + backward |
| Seek read | 8 MiB |
| Playback sim | 30s @ 25 Mbps |
| Integrity samples | 3 |
| Item timeout | 900s |

## Summary

Every median below is taken over **the same 12 entries for every**
**application**: the perf-tier entries (`smoke`, `core`, `stress`) that at least
8 of the 9 applications served. Median post size across that set is
12.5 GiB.

> **Why a quorum and not the entries all of them served.** That strict intersection
> is 10 entries here, and it is defined by the weakest application in the field:
> one broken engine collapses the population for everybody, and the set moves between
> runs as the field changes. A quorum keeps it wide and stable. Where an application
> missed one of the 12, its `n` column says so.

Entries: `plain-small`, `rar-named-small`, `plain-medium`, `plain-season-pack`, `rar-stored-movie`, `rar4-inner-obfuscated`, `rar-identity-grouped`, `rar4-obfuscated-volumes`, `7z-plain-header`, `7z-plain-large`, `7z-split-compressed-header`, `rar-season-pack`.

### Verdict

*Correct* is not *served*. Six corpus entries are built to be unservable: three
`negative` (compressed archives, no password) and three `failure` (dead post,
severe damage, missing volumes). Refusing those is the right answer, and serving
one means emitting bytes that cannot be the media, which is a worse result than
refusing, not a better one.

| App | Served | Capability gaps | Correctly refused | **Wrongly served** |
|---|---:|---:|---:|---:|
| **AltMount** | 16/25 | 9 | 6/6 | 0 |
| **nzbdavex** | 23/25 | 2 | 5/6 | **1** |
| **StreamNZB** | 16/25 | 9 | 5/6 | **1** |
| **StremThru (newz)** | 21/25 | 4 | 6/6 | 0 |
| **InfiniDysk** | 21/25 | 4 | 6/6 | 0 |
| **nzbdav** | 22/25 | 3 | 5/6 | **1** |
| **Decypharr** | 18/25 | 7 | 5/6 | **1** |
| **raw NNTP baseline** | 25/25 | 0 | 1/6 | **5** |
| **AIOStreams** | 25/25 | 0 | 5/6 | **1** |

A *capability gap* is the number that ranks engines: entries that should stream
and did not. `raw` is not an application and its row is not a verdict: it serves
outer volume bytes without opening an archive, so it "wrongly serves" entries no
player could open. That is the point of the baseline, not a defect in it.

### Time to picture

| App | n | Click&rarr;byte | Import | Cold TTFB | Warm TTFB |
|---|---:|---:|---:|---:|---:|
| **AltMount** | 11/12 | **7.19 s** | 6.81 s | 328 ms | 396 ms |
| **nzbdavex** | 12/12 | **1.97 s** | 1.73 s | 143 ms | 123 ms |
| **StreamNZB** | 12/12 | **1.91 s** | 53 ms | 1.69 s | 5 ms |
| **StremThru (newz)** | 12/12 | **2.03 s** | 1.90 s | 155 ms | 146 ms |
| **InfiniDysk** | 12/12 | **2.57 s** | 2.51 s | 9 ms | 2 ms |
| **nzbdav** | 12/12 | **1.56 s** | 1.42 s | 65 ms | 202 ms |
| **Decypharr** | 11/12 | **10.06 s** | 9.79 s | 266 ms | 2 ms |
| **raw NNTP baseline** | 12/12 | **512 ms** | 173 ms | 316 ms | 360 ms |
| **AIOStreams** | 12/12 | **962 ms** | 656 ms | 203 ms | 2 ms |

*Click&rarr;byte* is import + cold open: what a viewer waits through after pressing
play, and the only one of these three that is comparable. Mount-style apps
(altmount, the nzbdav family) do their inspection at import, while addon-style apps
(StreamNZB, AIOStreams) return a session in milliseconds and do the same work on
first byte. *Warm TTFB* is the same open repeated, so it measures what the engine
cached rather than what it can do cold.

### Streaming and seeks

| App | Seq MB/s | p05 MB/s | Full seek | Seek TTFB | Worst seek |
|---|---:|---:|---:|---:|---:|
| **AltMount** | 39.5 | **30.1** | **871 ms** | 358 ms | 589 ms |
| **nzbdavex** | 40.7 | **23.1** | **734 ms** | 234 ms | 326 ms |
| **StreamNZB** | 37.6 | **19.6** | **777 ms** | 307 ms | 593 ms |
| **StremThru (newz)** | 31.9 | **20.7** | **819 ms** | 390 ms | 479 ms |
| **InfiniDysk** | 21.5 | **3.4** | **1.57 s** | 3 ms | 6 ms |
| **nzbdav** | 41.0 | **25.6** | **703 ms** | 344 ms | 532 ms |
| **Decypharr** | 40.6 | **26.3** | **653 ms** | 287 ms | 395 ms |
| **raw NNTP baseline** | 36.4 | **26.7** | **534 ms** | 344 ms | 423 ms |
| **AIOStreams** | 45.5 | **24.3** | **715 ms** | 518 ms | 723 ms |

*p05 MB/s* is the 5th-percentile one-second windowed rate, which is what a player
actually feels: a mean rate hides a stall that a p05 does not.

*Full seek* is the median time to complete a whole seek read, acknowledgement plus
transfer, rather than the moment the first byte appears. An engine that answers a
Range immediately and then feeds the body slowly wins *Seek TTFB* and loses this
column, and this column is the one a player waits through. Where the two disagree,
believe this one.

### CPU

| App | CPU s/GiB | Cores (p95) | Cores (max) | Steady |
|---|---:|---:|---:|---:|
| **AltMount** | **4.0** | 0.2 | 0.3 | 33% |
| **nzbdavex** | **29.4** | 1.4 | 1.6 | 68% |
| **StreamNZB** | **5.4** | 0.3 | 0.4 | 36% |
| **StremThru (newz)** | **16.1** | 1.4 | 2.2 | 14% |
| **InfiniDysk** | **9.3** | 0.4 | 0.5 | 47% |
| **nzbdav** | **13.6** | 0.6 | 1.0 | 60% |
| **Decypharr** | **25.8** | 0.9 | 1.0 | 57% |
| **raw NNTP baseline** | **23.9** | 0.7 | 0.7 | 86% |
| **AIOStreams** | **5.6** | 0.4 | 0.5 | 36% |

*CPU s/GiB* is CPU-seconds consumed per GiB delivered, the fair efficiency
comparison, since a raw percentage is meaningless at different throughputs.

The other three are the shape of the draw rather than its size, which a total
cannot express: ten CPU-seconds is a steady half core for twenty seconds or one
core pinned for ten, and those cost a shared box differently. *Cores (p95)* is the
level it sustains, *Cores (max)* the worst single second, and *Steady* the share of
seconds spent at or above half the p95. A high *Steady* is an engine that hums; a
low one with a tall *max* burns the same CPU in bursts against an idle baseline,
which is what makes a box feel busy while the averages look calm.

All three are per entry and then taken as medians, so *Cores (max)* is the typical
worst second of an entry, not the worst second of the run. They are bounded below
by the 1s sample interval: a shorter spike is averaged away, so these
understate burstiness and never overstate it. Entries that finished in fewer than
four samples carry no shape and are excluded from these three columns only.

### Memory

| App | Idle RSS | RSS/item | Peak RSS | over | Drift | After idle |
|---|---:|---:|---:|---:|---:|---:|
| **AltMount** | 33 MiB | **708 MiB** | 2093 MiB | 31 entries | +495 MiB | 924 MiB |
| **nzbdavex** | 136 MiB | **498 MiB** | 834 MiB | 31 entries | -37 MiB | 427 MiB |
| **StreamNZB** | 48 MiB | **537 MiB** | 593 MiB | 27 entries | +1 MiB | 530 MiB |
| **StremThru (newz)** | 222 MiB | **825 MiB** | 2054 MiB | 29 entries | +604 MiB | 780 MiB |
| **InfiniDysk** | 164 MiB | **926 MiB** | 1321 MiB | 31 entries | +395 MiB | 864 MiB |
| **nzbdav** | 118 MiB | **312 MiB** | 448 MiB | 30 entries | +16 MiB | 282 MiB |
| **Decypharr** | 41 MiB | **463 MiB** | 1608 MiB | 31 entries | +1230 MiB | 1576 MiB |
| **raw NNTP baseline** | 764 MiB | **955 MiB** | 1138 MiB | 30 entries | +77 MiB | 1003 MiB |
| **AIOStreams** | 215 MiB | **620 MiB** | 1071 MiB | 30 entries | +343 MiB | 902 MiB |

*RSS/item* is the median of the per-entry peaks and is the comparable number.
*Peak RSS* is the highest single-entry peak in the run: **not representative of**
**real-world usage**, since it is a high-water mark reached once, but it is the
number that decides whether the application fits in the RAM you have. Read it with
the *over* column beside it, which says how many entries the peak was taken over:
a run-wide peak rewards failing early, and an application that survived 21 entries
had fewer chances to spike than one that survived 31.

*Drift* is the median per-entry peak over the last third of the run minus the
first third. Every application here holds more memory the longer it runs, and this
states how much rather than letting it inflate the headline. It is measured with no
idle gap between entries, which is the harshest case: applications that release on
idle never get the chance to. *After idle* is the median footprint once the work
stops but before the process is killed, which is where that memory goes back.

These are taken over every measured entry, including failed ones, since a failure
still occupies a position in the session, and over the whole session rather than
the shared population. Entries merged from another run are excluded, because their
footprint is another process's.

> **`runtime: docker` rows were measured in a container, not on this host.**
> Decypharr is not buildable natively here, so it was run
> under Docker with `--docker`. The CPU and memory columns are real numbers, read
> from the daemon's cgroup counters rather than guessed, but they describe a process
> inside a Linux VM: the CPU is the VM's share of this machine, and every byte
> crosses an extra NAT hop on the way in.
>
> Compare container rows with each other freely. Against a native row, read them as
> indicative: a container row that is slower is not proof the application is.

## Capability matrix

Every entry scored against what it is supposed to do, not against its status code.

| | |
|---|---|
| `pass` | should stream, and did |
| **`FAIL`** | should stream, and did not |
| `refused` | unservable, and was refused |
| **`served`** | unservable, and bytes came back anyway |

> **The `raw` column is not a capability claim.** It streams the outer volume
> bytes without opening the archive, so it "passes" encrypted and obfuscated
> entries that no application could actually play. Read it as "the articles are
> retrievable", which is exactly what makes it useful: a failure everywhere *except*
> raw is an application limitation, not a dead post.

| Entry | Tier | AltMount | nzbdavex | StreamNZB | StremThru (newz) | InfiniDysk | nzbdav | Decypharr | raw NNTP baseline | AIOStreams |
|---|---|---|---|---|---|---|---|---|---|---|
| `plain-small` | smoke | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `rar-named-small` | smoke | **FAIL** | pass | pass | pass | pass | pass | pass | pass | pass |
| `rar-hdrenc-small` | smoke | **FAIL** | **FAIL** | pass | **FAIL** | **FAIL** | **FAIL** | **FAIL** | pass | pass |
| `7z-obfuscated-small` | smoke | pass | pass | **FAIL** | pass | pass | pass | **FAIL** | pass | pass |
| `plain-medium` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `plain-season-pack` | core | pass | pass | pass | pass | pass | pass | **FAIL** | pass | pass |
| `rar-stored-movie` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `rar4-stored` | core | **FAIL** | pass | pass | **FAIL** | **FAIL** | **FAIL** | pass | pass | pass |
| `rar4-inner-obfuscated` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `rar-identity-grouped` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `rar4-obfuscated-volumes` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `rar-numeric-extensions` | core | **FAIL** | pass | **FAIL** | pass | pass | pass | pass | pass | pass |
| `7z-plain-header` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `7z-plain-large` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `7z-split-compressed-header` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `7z-header-encrypted` | core | pass | pass | **FAIL** | pass | pass | pass | **FAIL** | pass | pass |
| `rar-hdrenc-large` | core | **FAIL** | pass | pass | pass | pass | pass | **FAIL** | pass | pass |
| `rar-hdrenc-obfuscated` | core | **FAIL** | pass | **FAIL** | **FAIL** | pass | pass | **FAIL** | pass | pass |
| `7z-obfuscated-large` | core | **FAIL** | **FAIL** | **FAIL** | **FAIL** | **FAIL** | **FAIL** | pass | pass | pass |
| `7z-obfuscated-hotd` | core | pass | pass | **FAIL** | pass | pass | pass | **FAIL** | pass | pass |
| `rar-nested-iso` | core | **FAIL** | pass | **FAIL** | pass | pass | pass | pass | pass | pass |
| `rar-inner-tree` | core | **FAIL** | pass | **FAIL** | pass | pass | pass | pass | pass | pass |
| `rar-season-pack` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `rar4-compressed` | negative | refused | refused | refused | refused | refused | refused | refused | **served** | refused |
| `rar5-mixed-compressed` | negative | refused | refused | refused | refused | refused | refused | refused | **served** | refused |
| `rar-encrypted-no-password` | negative | refused | refused | refused | refused | refused | refused | refused | **served** | refused |
| `huge-direct-pack` | stress | pass | pass | **FAIL** | pass | **FAIL** | pass | pass | pass | pass |
| `damaged-partial` | failure | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `damaged-severe` | failure | refused | **served** | **served** | refused | refused | **served** | **served** | **served** | **served** |
| `dead-post` | failure | refused | refused | refused | refused | refused | refused | refused | refused | refused |
| `incomplete-archive-set` | failure | refused | refused | refused | refused | refused | refused | refused | **served** | refused |

## Byte-identity cross-check

The same byte ranges hashed by every application and compared **against each**
**other**, since a fast application serving the wrong bytes is not fast. The
consensus hash is the one at least two applications agree on; a row that differs
is the one to investigate.

`raw` participates only on `direct-video` entries: for archived posts it serves
the outer volume stream rather than the assembled inner file, so it is not a
valid reference there.

| Entry | App | Agree | **Differ** |
|---|---|---:|---:|
| `plain-medium` | nzbdavex | 1 | **2** |
| `rar4-obfuscated-volumes` | StreamNZB | 1 | **2** |
| `rar-numeric-extensions` | Decypharr | 1 | **2** |
| `plain-small` | raw NNTP baseline | 0 | **1** |
| `rar-named-small` | nzbdavex | 2 | **1** |
| `rar-named-small` | StreamNZB | 2 | **1** |
| `rar-named-small` | InfiniDysk | 2 | **1** |
| `rar-hdrenc-large` | StreamNZB | 0 | **1** |
| `rar-nested-iso` | Decypharr | 0 | **1** |
| `rar-season-pack` | StreamNZB | 0 | **1** |

155 of 165 app-entry pairs matched consensus exactly.

## Behaviour at a missing article

One entry in the corpus (`damaged-partial`) is an otherwise intact 10.2 GiB
release with **exactly one** article missing from both providers, 716,800 bytes
out of 15,572 articles. Its position in the assembled file is known exactly
(bytes 1,347,403,568–1,348,120,368, 12.27% in),
so a read can be aimed straight at it.

This is the only measurement that distinguishes behaviours a status code cannot:
an engine that pads the gap with zeros and one that reconstructs it both return
`206` with the right byte count. Each application streams a continuous band
spanning the hole plus a same-sized control band from intact video, and the two
are compared.

Two reads are reported. A **streaming read** starts 1 MB before the hole and runs
past it, which is what a player does; a **direct Range** asks only for bytes inside
the hole, which is what a seek does. Several engines answer these differently.

Alignment is verified, not assumed: the 256 KB either side of the hole are hashed
against the true bytes decoded from the articles that do exist, so an engine that
lays the file out differently cannot be mistaken for one that repaired the gap.

| App | Streaming read | Direct Range into hole | Zero run (control) | Aligned | Slowdown |
|---|---|---|---|:-:|---:|
| AIOStreams | **zero-filled** | all zeros | 2,097,152 (61) | yes | 3.34× |
| AltMount | **zero-filled** | all zeros | 716,800 (61) | yes | 2.36× |
| Decypharr | **error-at-hole** | `stream aborted after 0 bytes: terminated` | — | yes | — |
| InfiniDysk | **zero-filled** | `HTTP 404: ` | 716,800 (61) | yes | 4.03× |
| nzbdav | **truncated-at-hole** | `HTTP 404: ` | — | yes | — |
| nzbdavex | **zero-filled** | all zeros | 712,492 (61) | yes | 3.76× |
| raw NNTP baseline | _not addressable_ | — | — | — | — |
| StreamNZB | **zero-filled** | all zeros | 716,800 (61) | yes | 1.06× |
| StremThru (newz) | **truncated-at-hole** | `stream aborted after 0 bytes: terminated` | — | yes | — |

`zero-filled` means the engine substituted zeros and carried on: the file stays
the right length and later offsets stay correct, but the player is fed silence or
corruption for the length of the gap. `truncated-at-hole` means the transfer was
accepted and then abandoned mid-body on reaching the gap, which a player sees as a
stall rather than an error, since the status line already said `206`.

`served-clean` would not automatically be a pass either: with alignment verified
it would mean the engine produced bytes for a range that is provably unavailable
upstream, and the only honest reading of that is reconstruction or substitution.

## Per-entry detail

### AltMount

`altmount` · Go · version `4b42c67` · serving: webdav · runtime: source · startup 323 ms

**Own set**: 15 entries, median post 16.2 GiB · click&rarr;byte 7.19 s (shared population: 7.19 s, 1.00×) · seq 39.0 MB/s · CPU 4.2 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 7.20 s | 197 ms | 39.4 | 399 ms | 31.7 | 1.77 s | 3.6 | 142 MiB | ok |
| `rar-named-small` | — | — | — | — | — | — | — | 146 MiB | **failed** |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 147 MiB | **failed** |
| `7z-obfuscated-small` | 5.97 s | 284 ms | 37.8 | 336 ms | 32.1 | 1.44 s | 8.7 | 201 MiB | ok |
| `plain-medium` | 2.43 s | 328 ms | 42.1 | 358 ms | 29.7 | 1.73 s | 3.0 | 227 MiB | ok |
| `plain-season-pack` | 20.47 s | 411 ms | 37.0 | 499 ms | 32.9 | 1.64 s | 4.6 | 330 MiB | ok |
| `rar-stored-movie` | 7.62 s | 310 ms | 42.3 | 456 ms | 24.0 | 1.77 s | 3.9 | 365 MiB | ok |
| `rar4-stored` | — | — | — | — | — | — | — | 385 MiB | **failed** |
| `rar4-inner-obfuscated` | 4.77 s | 276 ms | 41.3 | 334 ms | 29.2 | 1.84 s | 3.8 | 512 MiB | ok |
| `rar-identity-grouped` | 3.97 s | 328 ms | 37.1 | 572 ms | 24.3 | 1.42 s | 4.2 | 470 MiB | ok |
| `rar4-obfuscated-volumes` | 6.81 s | 387 ms | 39.8 | 355 ms | 24.3 | 1.67 s | 4.0 | 493 MiB | ok |
| `rar-numeric-extensions` | — | — | — | — | — | — | — | 653 MiB | **failed** |
| `7z-plain-header` | 4.25 s | 353 ms | 39.5 | 345 ms | 29.1 | 1.42 s | 3.2 | 755 MiB | ok |
| `7z-plain-large` | 5.63 s | 399 ms | 38.6 | 342 ms | 29.0 | 1.71 s | 4.3 | 656 MiB | ok |
| `7z-split-compressed-header` | 16.37 s | 525 ms | 28.5 | 599 ms | 23.3 | 1.54 s | 4.4 | 1524 MiB | ok |
| `7z-header-encrypted` | 4.37 s | 221 ms | — | — | — | — | — | 763 MiB | ok |
| `rar-hdrenc-large` | — | — | — | — | — | — | — | 1387 MiB | **failed** |
| `rar-hdrenc-obfuscated` | — | — | — | — | — | — | — | 1445 MiB | **failed** |
| `7z-obfuscated-large` | — | — | — | — | — | — | — | 1177 MiB | **failed** |
| `7z-obfuscated-hotd` | 12.32 s | 173 ms | 34.4 | 369 ms | — | — | 12.6 | 1529 MiB | ok |
| `rar-nested-iso` | — | — | — | — | — | — | — | 820 MiB | **failed** |
| `rar-inner-tree` | — | — | — | — | — | — | — | 975 MiB | **failed** |
| `rar-season-pack` | 24.27 s | 141 ms | 40.2 | 289 ms | 7.1 | 2.85 s | 6.5 | 2093 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 772 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | 732 MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 776 MiB | **failed** |
| `huge-direct-pack` | 125.18 s | 396 ms | 23.3 | 351 ms | 6.3 | 2.51 s | 10.0 | 1350 MiB | ok |
| `damaged-partial` | 15.69 s | 669 ms | 39.2 | 262 ms | 9.6 | 1.47 s | 3.4 | 1099 MiB | ok |
| `damaged-severe` | — | — | — | — | — | — | — | 707 MiB | **failed** |
| `dead-post` | — | — | — | — | — | — | — | 708 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 708 MiB | **failed** |

<details><summary>Failures (15)</summary>

- `rar-named-small` (smoke): import failed: failed to iterate RAR archive "Gilmore.Girls.2000.S01E17.1080p.NF.WEB-DL.H264.SDR.DDP.2.0.English-HONE.part01.rar": rardecode: bad volume number
- `rar-hdrenc-small` (smoke): import failed: archive contains no files with allowed extensions (found: [(no extension)], allowed: [.mkv .mp4 .avi .ts .m4v .mov .wmv .mpg .mpeg .xvid .rm .rmvb .asf .asx .wtv .mk3d .dvr-ms .mp3 .flac .m4a .epub .pdf .cbz])
- `rar4-stored` (core): import failed: failed to iterate RAR archive "Dont.Be.Afraid.of.the.Dark.2010.BRRip.XviD-F0RFUN.rar": All attempts fail: #1: nntp: yEnc CRC mismatch #2: nntp: yEnc CRC mismatch
- `rar-numeric-extensions` (core): import failed: no files were successfully processed (all files failed validation)
- `rar-hdrenc-large` (core): import failed: archive contains no files with allowed extensions (found: [.bdmv .clpi .m2ts .mpls .xml .jpg], allowed: [.mkv .mp4 .avi .ts .m4v .mov .wmv .mpg .mpeg .xvid .rm .rmvb .asf .asx .wtv .mk3d .dvr-ms .mp3 .flac .m4a .epub .pdf .cbz])
- `rar-hdrenc-obfuscated` (core): import failed: no files were successfully processed (all files failed validation)
- `7z-obfuscated-large` (core): import failed: no valid first 7zip part found in archive
- `rar-nested-iso` (core): import failed: no files with allowed extensions found (allowed: [.mkv .mp4 .avi .ts .m4v .mov .wmv .mpg .mpeg .xvid .rm .rmvb .asf .asx .wtv .mk3d .dvr-ms .mp3 .flac .m4a .epub .pdf .cbz])
- `rar-inner-tree` (core): import failed: fast-fail segment check failed: no regular files were successfully processed (all files failed validation)
- `rar4-compressed` (negative): import failed: no files were successfully processed (all files failed validation)
- `rar5-mixed-compressed` (negative): import failed: compressed files are not supported: Undercover.Lover.S01E04.DUTCH.1080p.WEB.h264-SOLEM/Undercover.Lover.S01E04.DUTCH.1080p.WEB.h264-SOLEM.mkv (uses rar5.0 compression)
- `rar-encrypted-no-password` (negative): import failed: fast-fail segment check failed: no regular files were successfully processed (all files failed validation)
- `damaged-severe` (failure): import failed: fast-fail segment check failed: no regular files were successfully processed (all files failed validation)
- `dead-post` (failure): import failed: fast-fail segment check failed: no regular files were successfully processed (all files failed validation)
- `incomplete-archive-set` (failure): import failed: compressed files are not supported: The Falcon And The Winter Soldier S01 2160p WEB-DL HDR 10bit x265 HEVC DDP5 1 Atmos-PHOCiS/The Falcon And The Winter Soldier S01E01 2160p WEB-DL HDR 10bit x265 HEVC DDP5 1 Atmos-PHOCiS.mkv (uses rar5.0 compression)

</details>

### nzbdavex

`nzbdavex` · C# (.NET 10) · version `312d3bc` · serving: webdav · runtime: source · startup 4.15 s

**Own set**: 22 entries, median post 26.3 GiB · click&rarr;byte 3.02 s (shared population: 1.97 s, 0.65×) · seq 40.4 MB/s · CPU 30.1 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 2.43 s | 301 ms | 43.1 | 273 ms | 19.0 | 1.36 s | 31.9 | 439 MiB | ok |
| `rar-named-small` | 1.24 s | 506 ms | 35.9 | 164 ms | 20.5 | 1.63 s | 29.0 | 471 MiB | ok |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 469 MiB | **failed** |
| `7z-obfuscated-small` | 581 ms | 78 ms | 32.6 | 82 ms | 31.8 | 1.29 s | 38.7 | 474 MiB | ok |
| `plain-medium` | 709 ms | 128 ms | 44.5 | 188 ms | 29.2 | 1.86 s | 26.3 | 428 MiB | ok |
| `plain-season-pack` | 3.36 s | 265 ms | 43.8 | 344 ms | 23.4 | 2.31 s | 30.3 | 515 MiB | ok |
| `rar-stored-movie` | 1.65 s | 372 ms | 37.8 | 241 ms | 25.8 | 1.61 s | 27.3 | 596 MiB | ok |
| `rar4-stored` | 2.59 s | 282 ms | 18.7 | 138 ms | 10.0 | 1.72 s | 32.2 | 433 MiB | ok |
| `rar4-inner-obfuscated` | 1.01 s | 324 ms | 35.1 | 138 ms | 14.7 | 1.76 s | 28.9 | 473 MiB | ok |
| `rar-identity-grouped` | 1.81 s | 106 ms | 31.7 | 227 ms | 15.3 | 1.35 s | 30.0 | 498 MiB | ok |
| `rar4-obfuscated-volumes` | 1.59 s | 83 ms | 41.0 | 267 ms | 26.1 | 1.28 s | 24.9 | 520 MiB | ok |
| `rar-numeric-extensions` | 3.97 s | 441 ms | 33.2 | 408 ms | 15.9 | 2.39 s | 28.9 | 785 MiB | ok |
| `7z-plain-header` | 809 ms | 159 ms | 44.9 | 275 ms | 22.8 | 1.33 s | 24.7 | 531 MiB | ok |
| `7z-plain-large` | 3.12 s | 120 ms | 39.6 | 215 ms | 29.5 | 1.93 s | 29.8 | 546 MiB | ok |
| `7z-split-compressed-header` | 8.90 s | 107 ms | 42.4 | 252 ms | 28.5 | 1.36 s | 36.6 | 634 MiB | ok |
| `7z-header-encrypted` | 3.26 s | 109 ms | 30.3 | 209 ms | 4.7 | 3.37 s | 36.3 | 512 MiB | ok |
| `rar-hdrenc-large` | 15.01 s | 141 ms | 40.4 | 218 ms | 28.7 | 1.47 s | 49.4 | 669 MiB | ok |
| `rar-hdrenc-obfuscated` | 2.52 s | 1.69 s | 40.0 | 342 ms | 31.7 | 1.65 s | 34.1 | 834 MiB | ok |
| `7z-obfuscated-large` | — | — | — | — | — | — | — | 473 MiB | **failed** |
| `7z-obfuscated-hotd` | 3.02 s | 136 ms | 42.6 | 265 ms | 27.5 | 1.48 s | 30.2 | 557 MiB | ok |
| `rar-nested-iso` | 2.27 s | 316 ms | 42.5 | 382 ms | 35.6 | 1.24 s | 28.4 | 796 MiB | ok |
| `rar-inner-tree` | 4.91 s | 83 ms | 43.1 | 190 ms | 29.6 | 1.60 s | 27.1 | 537 MiB | ok |
| `rar-season-pack` | 14.23 s | 106 ms | 40.3 | 200 ms | 26.6 | 1.41 s | 35.2 | 486 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 405 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | 414 MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 437 MiB | **failed** |
| `huge-direct-pack` | 3.61 s | 173 ms | 46.5 | 227 ms | 33.8 | 1.77 s | 32.4 | 512 MiB | ok |
| `damaged-partial` | 1.94 s | 708 ms | 33.9 | 249 ms | 25.0 | 1.78 s | 29.6 | 556 MiB | ok |
| `damaged-severe` | 6.57 s | 3.59 s | — | — | — | — | — | 433 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 427 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 427 MiB | **failed** |

<details><summary>Failures (7)</summary>

- `rar-hdrenc-small` (smoke): import failed: No importable videos found.
- `7z-obfuscated-large` (core): import failed: Article with message-id KrRwGaSzEcDhQpBgNuSyNlYu-1638723981550@nyuu not found.
- `rar4-compressed` (negative): import failed: Only rar files with compression method m0 are supported.
- `rar5-mixed-compressed` (negative): import failed: Only rar files with compression method m0 are supported.
- `rar-encrypted-no-password` (negative): import failed: Encrypted Rar archive has no password specified.
- `dead-post` (failure): import failed: Article with message-id 055b4332e46842d9ad776958bb6a93d4@ngPost not found.
- `incomplete-archive-set` (failure): import failed: Only rar files with compression method m0 are supported.

</details>

### StreamNZB

`streamnzb` · Go · version `v5.9.0` · serving: http-range · runtime: source · startup 1.31 s

**Own set**: 15 entries, median post 8.8 GiB · click&rarr;byte 1.88 s (shared population: 1.91 s, 1.02×) · seq 37.5 MB/s · CPU 5.6 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 14 ms | 3.01 s | 15.7 | 929 ms | 15.3 | 1.95 s | 4.4 | 532 MiB | ok |
| `rar-named-small` | 15 ms | 1.43 s | 21.6 | 185 ms | 15.4 | 1.47 s | 3.3 | 536 MiB | ok |
| `rar-hdrenc-small` | 8 ms | 782 ms | 31.1 | 7 ms | 26.0 | 250 ms | 9.3 | 540 MiB | ok |
| `7z-obfuscated-small` | 6 ms | 1.13 s | — | — | — | — | — | 516 MiB | **failed** |
| `plain-medium` | 30 ms | 796 ms | 34.1 | 190 ms | 22.0 | 1.74 s | 4.0 | 534 MiB | ok |
| `plain-season-pack` | 238 ms | 1.11 s | 41.8 | 252 ms | 29.4 | 2.07 s | 5.4 | 541 MiB | ok |
| `rar-stored-movie` | 89 ms | 3.04 s | 38.8 | 197 ms | 24.6 | 1.60 s | 5.7 | 592 MiB | ok |
| `rar4-stored` | 21 ms | 1.06 s | — | 202 ms | — | — | — | 537 MiB | ok |
| `rar4-inner-obfuscated` | 10 ms | 1.17 s | 37.6 | 166 ms | 22.8 | 1.71 s | 4.7 | 537 MiB | ok |
| `rar-identity-grouped` | 38 ms | 2.83 s | 29.6 | 567 ms | 20.0 | 1.70 s | 4.5 | 535 MiB | ok |
| `rar4-obfuscated-volumes` | 68 ms | 1.87 s | 37.6 | 356 ms | 19.9 | 1.65 s | 5.8 | 534 MiB | ok |
| `rar-numeric-extensions` | 235 ms | 5.01 s | — | — | — | — | — | 526 MiB | **failed** |
| `7z-plain-header` | 10 ms | 1.45 s | 37.4 | 313 ms | 25.1 | 1.52 s | 5.4 | 533 MiB | ok |
| `7z-plain-large` | 188 ms | 2.58 s | 46.1 | 314 ms | 27.4 | 1.74 s | 7.7 | 593 MiB | ok |
| `7z-split-compressed-header` | 373 ms | 1.51 s | 43.1 | 409 ms | 17.9 | 2.57 s | 8.3 | 572 MiB | ok |
| `7z-header-encrypted` | 31 ms | 1.30 s | — | — | — | — | — | 517 MiB | **failed** |
| `rar-hdrenc-large` | 335 ms | 4.09 s | 35.6 | 7 ms | 17.4 | 251 ms | 23.6 | 568 MiB | ok |
| `rar-hdrenc-obfuscated` | — | — | — | — | — | — | — | — | **failed** |
| `7z-obfuscated-large` | 320 ms | 5.02 s | — | — | — | — | — | 530 MiB | **failed** |
| `7z-obfuscated-hotd` | 84 ms | 5.03 s | — | — | — | — | — | 561 MiB | **failed** |
| `rar-nested-iso` | 447 ms | 1.32 s | — | — | — | — | — | 543 MiB | **failed** |
| `rar-inner-tree` | — | — | — | — | — | — | — | — | **failed** |
| `rar-season-pack` | 249 ms | 1.87 s | 38.4 | 300 ms | 20.1 | 2.59 s | 45.4 | 556 MiB | ok |
| `rar4-compressed` | 27 ms | 583 ms | — | — | — | — | — | 525 MiB | **failed** |
| `rar5-mixed-compressed` | 15 ms | 547 ms | — | — | — | — | — | — | **failed** |
| `rar-encrypted-no-password` | 1.01 s | 681 ms | — | — | — | — | — | 537 MiB | **failed** |
| `huge-direct-pack` | — | — | — | — | — | — | — | — | **failed** |
| `damaged-partial` | 59 ms | 1.10 s | 37.0 | 292 ms | 21.6 | 1.45 s | 63.7 | 543 MiB | ok |
| `damaged-severe` | 220 ms | 1.05 s | — | — | — | — | — | 528 MiB | ok |
| `dead-post` | 49 ms | 1.25 s | — | — | — | — | — | 538 MiB | **failed** |
| `incomplete-archive-set` | 7 ms | 1.55 s | — | — | — | — | — | 534 MiB | **failed** |

<details><summary>Failures (14)</summary>

- `7z-obfuscated-small` (smoke): served only 2.4 MB from a 155 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `rar-numeric-extensions` (core): served only 2.4 MB from a 84436 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `7z-header-encrypted` (core): served only 2.4 MB from a 7241 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `rar-hdrenc-obfuscated` (core): play/nzb -> 400: invalid multipart form payload
- `7z-obfuscated-large` (core): served only 2.4 MB from a 76434 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `7z-obfuscated-hotd` (core): served only 2.4 MB from a 29272 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `rar-nested-iso` (core): served only 2.4 MB from a 101683 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `rar-inner-tree` (core): play/nzb -> 400: invalid multipart form payload
- `rar4-compressed` (negative): served only 2.4 MB from a 3340 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `rar5-mixed-compressed` (negative): served only 2.4 MB from a 2055 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `rar-encrypted-no-password` (negative): served only 2.4 MB from a 109131 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `huge-direct-pack` (stress): play/nzb -> 400: invalid multipart form payload
- `dead-post` (failure): served only 2.4 MB from a 4879 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `incomplete-archive-set` (failure): served only 2.4 MB from a 1050 MB post. That is a placeholder, a sample, or the wrong file, not the media.

</details>

### StremThru (newz)

`stremthru` · Go · version `0.103.2` · serving: http-range · runtime: source · startup 2.04 s

**Own set**: 20 entries, median post 26.3 GiB · click&rarr;byte 3.56 s (shared population: 2.03 s, 0.57×) · seq 31.9 MB/s · CPU 46.3 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 1.53 s | 71 ms | 29.5 | 258 ms | 22.7 | 1.83 s | 12.4 | 615 MiB | ok |
| `rar-named-small` | 1.84 s | 120 ms | 31.3 | 402 ms | 23.1 | 1.31 s | 12.2 | 673 MiB | ok |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 646 MiB | **failed** |
| `7z-obfuscated-small` | 648 ms | 6 ms | — | 83 ms | 6.4 | 2.42 s | 74.2 | 603 MiB | ok |
| `plain-medium` | 544 ms | 21 ms | 36.3 | 197 ms | 25.1 | 1.69 s | 4.3 | 551 MiB | ok |
| `plain-season-pack` | 2.17 s | 245 ms | 42.7 | 371 ms | 21.5 | 1.46 s | 7.6 | 658 MiB | ok |
| `rar-stored-movie` | 2.39 s | 238 ms | 34.2 | 486 ms | 23.4 | 1.64 s | 18.4 | 768 MiB | ok |
| `rar4-stored` | — | — | — | — | — | — | — | 749 MiB | **failed** |
| `rar4-inner-obfuscated` | 1.50 s | 107 ms | 32.1 | 387 ms | 25.4 | 1.58 s | 14.5 | 801 MiB | ok |
| `rar-identity-grouped` | 1.95 s | 151 ms | — | 393 ms | — | — | — | 699 MiB | ok |
| `rar4-obfuscated-volumes` | 1.72 s | 161 ms | 34.4 | 430 ms | 24.0 | 2.17 s | 16.1 | 747 MiB | ok |
| `rar-numeric-extensions` | 6.82 s | 705 ms | 32.0 | 1.03 s | 19.8 | 2.29 s | 42.2 | 904 MiB | ok |
| `7z-plain-header` | 769 ms | 16 ms | 8.1 | 108 ms | — | — | 91.1 | 825 MiB | ok |
| `7z-plain-large` | 4.44 s | 159 ms | 8.1 | 295 ms | 4.7 | 5.44 s | 83.0 | 653 MiB | ok |
| `7z-split-compressed-header` | 51.40 s | 388 ms | 9.5 | 467 ms | 5.3 | 4.55 s | 101.0 | 1476 MiB | ok |
| `7z-header-encrypted` | 4.44 s | 53 ms | — | 174 ms | — | — | — | 757 MiB | ok |
| `rar-hdrenc-large` | 126.36 s | 2.29 s | 16.5 | 2.80 s | 2.1 | 5.31 s | 168.1 | 2054 MiB | ok |
| `rar-hdrenc-obfuscated` | — | — | — | — | — | — | — | 2018 MiB | **failed** |
| `7z-obfuscated-large` | — | — | — | — | — | — | — | 1944 MiB | **failed** |
| `7z-obfuscated-hotd` | 17.02 s | 697 ms | 7.3 | 355 ms | 2.2 | 4.70 s | 54.0 | 1280 MiB | ok |
| `rar-nested-iso` | 4.24 s | 537 ms | 32.8 | 865 ms | 3.6 | 3.60 s | 53.8 | 912 MiB | ok |
| `rar-inner-tree` | 44.18 s | 1.24 s | 28.3 | 1.36 s | 4.3 | 2.81 s | 50.5 | 1425 MiB | ok |
| `rar-season-pack` | 296.56 s | 58.69 s | 31.9 | 2.50 s | 21.8 | 3.98 s | 128.8 | 1816 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 1261 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | — | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 1271 MiB | **failed** |
| `huge-direct-pack` | 4.79 s | 1.36 s | 35.2 | 1.56 s | 28.6 | 2.82 s | 25.8 | 1432 MiB | ok |
| `damaged-partial` | 3.48 s | 264 ms | 37.4 | 700 ms | 22.8 | 2.14 s | 62.7 | 1192 MiB | ok |
| `damaged-severe` | — | — | — | — | — | — | — | 786 MiB | **failed** |
| `dead-post` | — | — | — | — | — | — | — | 1047 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | — | **failed** |

<details><summary>Failures (10)</summary>

- `rar-hdrenc-small` (smoke): newz status failed
- `rar4-stored` (core): newz status failed
- `rar-hdrenc-obfuscated` (core): newz status failed
- `7z-obfuscated-large` (core): newz status failed
- `rar4-compressed` (negative): newz status failed
- `rar5-mixed-compressed` (negative): newz status failed
- `rar-encrypted-no-password` (negative): newz status failed
- `damaged-severe` (failure): newz status failed
- `dead-post` (failure): newz status failed
- `incomplete-archive-set` (failure): newz status failed

</details>

### InfiniDysk

`infinidysk` · C# (.NET 10) · version `ed0dd0a` · serving: webdav · runtime: source · startup 6.53 s

**Own set**: 20 entries, median post 26.3 GiB · click&rarr;byte 3.46 s (shared population: 2.57 s, 0.74×) · seq 21.1 MB/s · CPU 9.8 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 2.55 s | 123 ms | 22.3 | 110 ms | 1.9 | 2.53 s | 16.4 | 550 MiB | ok |
| `rar-named-small` | 2.43 s | 17 ms | 24.3 | 4 ms | 2.3 | 2.70 s | 9.0 | 546 MiB | ok |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 514 MiB | **failed** |
| `7z-obfuscated-small` | 1.98 s | 5 ms | 11.1 | 1.98 s | 9.9 | 3.72 s | 16.1 | 540 MiB | ok |
| `plain-medium` | 1.45 s | 16 ms | 24.4 | 4 ms | 19.4 | 2.96 s | 7.7 | 667 MiB | ok |
| `plain-season-pack` | 3.29 s | 8 ms | 17.6 | 3 ms | 4.8 | 4.15 s | 12.5 | 783 MiB | ok |
| `rar-stored-movie` | 2.15 s | 10 ms | 19.6 | 2 ms | 4.4 | 3.26 s | 9.3 | 927 MiB | ok |
| `rar4-stored` | — | — | — | — | — | — | — | 927 MiB | **failed** |
| `rar4-inner-obfuscated` | 1.86 s | 6 ms | 21.2 | 3 ms | 1.6 | 3.66 s | 6.9 | 932 MiB | ok |
| `rar-identity-grouped` | 2.46 s | 5 ms | 19.4 | 2 ms | 2.2 | 3.23 s | 8.5 | 869 MiB | ok |
| `rar4-obfuscated-volumes` | 2.12 s | 9 ms | 23.0 | 2 ms | 2.7 | 2.85 s | 7.4 | 754 MiB | ok |
| `rar-numeric-extensions` | 4.64 s | 34 ms | 17.2 | 3.64 s | 3.7 | 3.33 s | 14.6 | 922 MiB | ok |
| `7z-plain-header` | 3.60 s | 2 ms | 21.8 | 2 ms | 3.8 | 4.07 s | 9.4 | 926 MiB | ok |
| `7z-plain-large` | 17.23 s | 8 ms | 23.1 | 10 ms | 5.0 | 3.05 s | 10.3 | 851 MiB | ok |
| `7z-split-compressed-header` | 56.04 s | 17 ms | 21.0 | 14 ms | 1.3 | 4.87 s | 12.8 | 914 MiB | ok |
| `7z-header-encrypted` | 13.73 s | 3 ms | 22.4 | 296 ms | 1.8 | 2.20 s | 9.3 | 804 MiB | ok |
| `rar-hdrenc-large` | 16.81 s | 13 ms | 23.4 | 14 ms | 4.3 | 3.19 s | 12.2 | 995 MiB | ok |
| `rar-hdrenc-obfuscated` | 4.81 s | 1.61 s | 22.3 | 40 ms | 4.9 | 1.73 s | 9.1 | 1030 MiB | ok |
| `7z-obfuscated-large` | — | — | — | — | — | — | — | 1090 MiB | **failed** |
| `7z-obfuscated-hotd` | 13.42 s | 4 ms | 19.7 | 3 ms | 1.8 | 2.70 s | 9.4 | 1056 MiB | ok |
| `rar-nested-iso` | 3.30 s | 14 ms | 18.6 | 14 ms | 8.7 | 3.29 s | 10.7 | 1057 MiB | ok |
| `rar-inner-tree` | 6.42 s | 4 ms | 18.8 | 3 ms | 3.2 | 2.50 s | 11.3 | 1316 MiB | ok |
| `rar-season-pack` | 22.28 s | 4 ms | 15.9 | 3 ms | 0.6 | 4.00 s | 19.2 | 1321 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 1075 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | 1083 MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 1162 MiB | **failed** |
| `huge-direct-pack` | — | — | — | — | — | — | — | 1156 MiB | **failed** |
| `damaged-partial` | 5.48 s | 4 ms | 16.7 | 3 ms | 1.1 | 4.25 s | 14.6 | 1162 MiB | ok |
| `damaged-severe` | — | — | — | — | — | — | — | 864 MiB | **failed** |
| `dead-post` | — | — | — | — | — | — | — | 872 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 873 MiB | **failed** |

<details><summary>Failures (10)</summary>

- `rar-hdrenc-small` (smoke): import failed: No importable media files found.
- `rar4-stored` (core): import failed: The decoded yEnc CRC32 was 2ebc210a, but the trailer expected 39ab5444.
- `7z-obfuscated-large` (core): import failed: Article with message-id KrRwGaSzEcDhQpBgNuSyNlYu-1638723981550@nyuu not found. Server responded: 430 No Such Article
- `rar4-compressed` (negative): import failed: Only rar files with compression method m0 are supported.
- `rar5-mixed-compressed` (negative): import failed: Only rar files with compression method m0 are supported.
- `rar-encrypted-no-password` (negative): import failed: Encrypted Rar archive has no password specified.
- `huge-direct-pack` (stress): POST <app>/api?mode=addfile&output=json&apikey=benchmark-internal-key&cat=bench -> 400: {"status":false,"error":"The NZB document exceeds the maximum allowed size.","problem":{"type":"https://www.infinidysk.com/problems/validation","title":"One or more validation errors occurred.","status":400,"detail":"The NZB document exceeds the maximum allowed size.","traceId":"8d0d8e33582ce6b0c9d456a57980980a
- `damaged-severe` (failure): import failed: Article with message-id xcecGBQnwBIYE.8fjOSbt$yhomo1x1@4Zkt8fJ.3J168q not found. Server responded: 430 No Such Article
- `dead-post` (failure): import failed: Missing articles: 1 important file(s) have missing segments across all providers (e.g. OB7ucO5ujqhRQOnlY.part03.rar). NZB is likely DMCA'd or expired.
- `incomplete-archive-set` (failure): import failed: Only rar files with compression method m0 are supported.

</details>

### nzbdav

`nzbdav` · C# (.NET 10) · version `794948b` · serving: webdav · runtime: source · startup 3.30 s

**Own set**: 21 entries, median post 27.3 GiB · click&rarr;byte 2.69 s (shared population: 1.56 s, 0.58×) · seq 41.5 MB/s · CPU 14.4 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 1.41 s | 103 ms | 44.1 | 423 ms | 28.6 | 1.09 s | 20.9 | 261 MiB | ok |
| `rar-named-small` | 1.44 s | 164 ms | 39.4 | 356 ms | 24.4 | 1.52 s | 13.9 | 277 MiB | ok |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 251 MiB | **failed** |
| `7z-obfuscated-small` | 562 ms | 82 ms | 26.3 | 171 ms | 21.9 | 1.10 s | 26.6 | 263 MiB | ok |
| `plain-medium` | 1.01 s | 34 ms | 26.5 | 316 ms | 28.3 | 1.40 s | 9.4 | 282 MiB | ok |
| `plain-season-pack` | 2.25 s | 74 ms | 36.4 | 540 ms | 8.8 | 1.82 s | 14.4 | 316 MiB | ok |
| `rar-stored-movie` | 2.12 s | 107 ms | 41.0 | 283 ms | 27.9 | 1.63 s | 12.1 | 314 MiB | ok |
| `rar4-stored` | — | — | — | — | — | — | — | 278 MiB | **failed** |
| `rar4-inner-obfuscated` | 1.32 s | 48 ms | 38.0 | 380 ms | 18.3 | 1.58 s | 13.6 | 301 MiB | ok |
| `rar-identity-grouped` | 1.24 s | 47 ms | — | 580 ms | — | — | — | 298 MiB | ok |
| `rar4-obfuscated-volumes` | 1.36 s | 56 ms | 42.2 | 365 ms | 31.3 | 1.38 s | 10.8 | 312 MiB | ok |
| `rar-numeric-extensions` | 4.42 s | 101 ms | 42.3 | 284 ms | 26.7 | 1.31 s | 15.5 | 353 MiB | ok |
| `7z-plain-header` | 680 ms | 48 ms | 41.1 | 315 ms | 9.5 | 1.58 s | 12.5 | 318 MiB | ok |
| `7z-plain-large` | 2.95 s | 60 ms | 41.6 | 332 ms | 32.7 | 1.26 s | 13.3 | 324 MiB | ok |
| `7z-split-compressed-header` | 8.55 s | 70 ms | 38.4 | 297 ms | 23.9 | 1.84 s | 19.2 | 349 MiB | ok |
| `7z-header-encrypted` | 3.38 s | 112 ms | — | 360 ms | — | — | — | 312 MiB | ok |
| `rar-hdrenc-large` | 15.44 s | 117 ms | 44.6 | 328 ms | 32.4 | 1.20 s | 33.3 | 378 MiB | ok |
| `rar-hdrenc-obfuscated` | 3.50 s | 122 ms | 43.9 | 503 ms | 31.3 | 1.25 s | 17.9 | 448 MiB | ok |
| `7z-obfuscated-large` | — | — | — | — | — | — | — | 354 MiB | **failed** |
| `7z-obfuscated-hotd` | 2.78 s | 47 ms | 41.5 | 284 ms | 33.5 | 827 ms | 16.1 | 364 MiB | ok |
| `rar-nested-iso` | 2.63 s | 59 ms | 46.3 | 367 ms | 27.9 | 1.27 s | 16.7 | 361 MiB | ok |
| `rar-inner-tree` | 5.27 s | 120 ms | 41.1 | 318 ms | 34.7 | 1.36 s | 13.5 | 387 MiB | ok |
| `rar-season-pack` | 13.72 s | 245 ms | 42.3 | 264 ms | 28.3 | 1.08 s | 23.5 | 331 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | — | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | 279 MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 274 MiB | **failed** |
| `huge-direct-pack` | 3.86 s | 39 ms | 43.4 | 350 ms | 33.0 | 1.21 s | 14.3 | 436 MiB | ok |
| `damaged-partial` | 2.53 s | 45 ms | 36.2 | 213 ms | 30.1 | 1.17 s | 12.9 | 301 MiB | ok |
| `damaged-severe` | 7.18 s | 96 ms | — | — | — | — | — | 284 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 291 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 287 MiB | **failed** |

<details><summary>Failures (8)</summary>

- `rar-hdrenc-small` (smoke): import failed: No importable videos found.
- `rar4-stored` (core): import failed: Unknown Rar Header: 15
- `7z-obfuscated-large` (core): import failed: Article with message-id KrRwGaSzEcDhQpBgNuSyNlYu-1638723981550@nyuu not found.
- `rar4-compressed` (negative): import failed: Only rar files with compression method m0 are supported.
- `rar5-mixed-compressed` (negative): import failed: Only rar files with compression method m0 are supported.
- `rar-encrypted-no-password` (negative): import failed: Encrypted Rar archive has no password specified.
- `dead-post` (failure): import failed: Article with message-id 06c57c2829234b71b697a501f941337b@ngPost not found.
- `incomplete-archive-set` (failure): import failed: Only rar files with compression method m0 are supported.

</details>

### Decypharr

`decypharr` · Go · version `v2.5` (`0dd1cbb`) · serving: webdav · runtime: docker · CPU/RSS from container cgroups · startup 2.75 s

**Own set**: 17 entries, median post 25.3 GiB · click&rarr;byte 10.54 s (shared population: 10.06 s, 0.95×) · seq 41.6 MB/s · CPU 26.8 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 4.72 s | 247 ms | 25.1 | 284 ms | 3.1 | 1.08 s | 25.0 | 87 MiB | ok |
| `rar-named-small` | 5.09 s | 225 ms | 17.0 | 267 ms | 1.5 | 1.04 s | 26.2 | 70 MiB | ok |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 72 MiB | **failed** |
| `7z-obfuscated-small` | — | — | — | — | — | — | — | 73 MiB | **failed** |
| `plain-medium` | 4.12 s | 256 ms | 20.4 | 311 ms | 19.6 | 1.15 s | 23.3 | 95 MiB | ok |
| `plain-season-pack` | — | — | — | — | — | — | — | 167 MiB | **failed** |
| `rar-stored-movie` | 10.26 s | 277 ms | 41.6 | 259 ms | 1.5 | 1.11 s | 27.6 | 177 MiB | ok |
| `rar4-stored` | 5.18 s | 248 ms | — | 469 ms | — | — | — | 230 MiB | ok |
| `rar4-inner-obfuscated` | 6.09 s | 183 ms | 39.5 | 313 ms | 0.8 | 1.50 s | 27.7 | 201 MiB | ok |
| `rar-identity-grouped` | 10.34 s | 320 ms | — | 257 ms | — | — | — | 206 MiB | ok |
| `rar4-obfuscated-volumes` | 9.79 s | 274 ms | 42.6 | 197 ms | 3.5 | 1.33 s | 26.8 | 234 MiB | ok |
| `rar-numeric-extensions` | 20.89 s | 277 ms | 23.2 | 363 ms | 2.8 | 1.56 s | 31.0 | 292 MiB | ok |
| `7z-plain-header` | 2.08 s | 266 ms | 27.8 | 307 ms | 2.9 | 1.92 s | 25.4 | 311 MiB | ok |
| `7z-plain-large` | 15.34 s | 331 ms | 43.8 | 303 ms | 6.9 | 2.12 s | 24.7 | 361 MiB | ok |
| `7z-split-compressed-header` | 16.52 s | 357 ms | 45.6 | 287 ms | 14.7 | 1.22 s | 24.7 | 463 MiB | ok |
| `7z-header-encrypted` | — | — | — | — | — | — | — | 442 MiB | **failed** |
| `rar-hdrenc-large` | — | — | — | — | — | — | — | 612 MiB | **failed** |
| `rar-hdrenc-obfuscated` | — | — | — | — | — | — | — | 687 MiB | **failed** |
| `7z-obfuscated-large` | 19.57 s | 354 ms | 46.8 | 347 ms | 34.7 | 1.44 s | 28.5 | 743 MiB | ok |
| `7z-obfuscated-hotd` | — | — | — | — | — | — | — | 730 MiB | **failed** |
| `rar-nested-iso` | 3.42 s | 524 ms | 44.7 | 3 ms | — | 250 ms | 19.8 | 781 MiB | ok |
| `rar-inner-tree` | 52.58 s | 449 ms | 45.1 | 258 ms | 26.0 | 1.54 s | 29.5 | 1078 MiB | ok |
| `rar-season-pack` | 26.44 s | 231 ms | 47.2 | 317 ms | 8.9 | 2.20 s | 33.7 | 1097 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 1062 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | 1090 MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 1145 MiB | **failed** |
| `huge-direct-pack` | 112.79 s | 471 ms | 40.9 | 262 ms | 29.5 | 2.18 s | 29.0 | 1608 MiB | ok |
| `damaged-partial` | 5.13 s | 281 ms | 41.4 | 208 ms | 23.4 | 1.51 s | 25.9 | 1586 MiB | ok |
| `damaged-severe` | 14.32 s | 265 ms | — | — | — | — | — | 1587 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 1576 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 1576 MiB | **failed** |

<details><summary>Failures (12)</summary>

- `rar-hdrenc-small` (smoke): import failed: failed to process nzb: failed to process NZB archives: all files were skipped due to size or extension restrictions(error file extension not allowed)
- `7z-obfuscated-small` (smoke): import failed: failed to process nzb: content verification failed: head of "7z-obfuscated-small.mkv" matches no media container signature: usenet file content is corrupt
- `plain-season-pack` (core): import failed: failed to process nzb: availability check failed: file "Dexter.2006.S02E12.The.British.Invasion.PROPER.BluRay.1080p.TrueHD.5.1.AVC.REMUX-FraMeSToR.mkv" unavailable: usenet segment is missing
- `7z-header-encrypted` (core): import failed: failed to process nzb: content verification failed: head of "7z-header-encrypted.mkv" matches no media container signature: usenet file content is corrupt
- `rar-hdrenc-large` (core): import failed: failed to process nzb: content verification failed: head of "00000.m2ts" matches no media container signature: usenet file content is corrupt
- `rar-hdrenc-obfuscated` (core): import failed: failed to process nzb: availability check failed: file "rar-hdrenc-obfuscated.mkv" unavailable: usenet segment is missing
- `7z-obfuscated-hotd` (core): import failed: failed to process nzb: content verification failed: head of "7z-obfuscated-hotd.mkv" matches no media container signature: usenet file content is corrupt
- `rar4-compressed` (negative): import failed: failed to process nzb: failed to process NZB archives: no valid files found in NZB
- `rar5-mixed-compressed` (negative): import failed: failed to process nzb: failed to process NZB archives: all files were skipped due to size or extension restrictions(error file extension not allowed)
- `rar-encrypted-no-password` (negative): import failed: failed to process nzb: failed to process NZB archives: no valid files found in NZB
- `dead-post` (failure): POST <app>/sabnzbd/api?mode=addfile&output=json&category=bench&cat=bench&action=none -> 500: { "status": false, "error": "Failed to add dead-post.nzb: usenet parse failed: failed to stat segment OB7ucO5ujqhRQOnlY.part01.rar \u003cc1e5f474c7344dcb8d2c2cd5d34a7483@ngPost\u003e: all providers failed: NNTP ARTICLE_NOT_FOUND (code 430): No Such Article" }
- `incomplete-archive-set` (failure): import failed: failed to process nzb: failed to process NZB archives: no valid files found in NZB

</details>

### raw NNTP baseline

`raw` · JavaScript (this harness) · version `harness-builtin` · serving: http-range · runtime: source · startup 2 ms

**Own set**: 24 entries, median post 26.3 GiB · click&rarr;byte 536 ms (shared population: 512 ms, 0.95×) · seq 35.0 MB/s · CPU 24.7 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 426 ms | 106 ms | 35.9 | 327 ms | 21.6 | 1.44 s | 337.6 | 862 MiB | ok |
| `rar-named-small` | 154 ms | 219 ms | 54.9† | 296 ms | 32.4 | — | 50.4 | 854 MiB | ok |
| `rar-hdrenc-small` | 132 ms | 313 ms | 38.4† | 249 ms | 30.3 | 1.17 s | 44.3 | 846 MiB | ok |
| `7z-obfuscated-small` | 122 ms | 337 ms | 702.1† | 213 ms | — | — | — | 845 MiB | ok |
| `plain-medium` | 128 ms | 276 ms | 37.8 | 362 ms | 26.3 | 1.36 s | 20.1 | 907 MiB | ok |
| `plain-season-pack` | 273 ms | 551 ms | 42.9 | 393 ms | 28.3 | 1.84 s | 20.3 | 988 MiB | ok |
| `rar-stored-movie` | 169 ms | 288 ms | 32.4 | 359 ms | 27.2 | 1.28 s | 18.3 | 943 MiB | ok |
| `rar4-stored` | 105 ms | 197 ms | 86.5† | 194 ms | — | — | — | 945 MiB | ok |
| `rar4-inner-obfuscated` | 141 ms | 351 ms | 55.8† | 348 ms | 38.6 | 988 ms | 49.7 | 950 MiB | ok |
| `rar-identity-grouped` | 132 ms | 218 ms | 29.3 | 341 ms | 6.2 | 2.21 s | 27.5 | 956 MiB | ok |
| `rar4-obfuscated-volumes` | 177 ms | 363 ms | 35.9 | 330 ms | 25.2 | 917 ms | 17.4 | 944 MiB | ok |
| `rar-numeric-extensions` | 223 ms | 377 ms | 38.6 | 379 ms | 35.7 | 1.32 s | 21.6 | 992 MiB | ok |
| `7z-plain-header` | 119 ms | 317 ms | 38.8 | 329 ms | 28.8 | 1.67 s | 20.0 | 989 MiB | ok |
| `7z-plain-large` | 420 ms | 339 ms | 36.8 | 402 ms | 30.0 | 1.22 s | 21.5 | 925 MiB | ok |
| `7z-split-compressed-header` | 238 ms | 316 ms | 38.0 | 317 ms | 29.4 | 1.30 s | 26.2 | 947 MiB | ok |
| `7z-header-encrypted` | 156 ms | 259 ms | 32.8 | 271 ms | 11.8 | 2.25 s | 38.9 | 949 MiB | ok |
| `rar-hdrenc-large` | 271 ms | 295 ms | 33.1 | 305 ms | 28.9 | 1.42 s | 21.0 | 954 MiB | ok |
| `rar-hdrenc-obfuscated` | 288 ms | 318 ms | 35.2 | 390 ms | 30.0 | 1.29 s | 17.4 | 968 MiB | ok |
| `7z-obfuscated-large` | 247 ms | 304 ms | 32.7 | 272 ms | 28.3 | 1.40 s | 27.3 | 965 MiB | ok |
| `7z-obfuscated-hotd` | 395 ms | 324 ms | 33.7 | 335 ms | 32.4 | 1.32 s | 24.5 | 963 MiB | ok |
| `rar-nested-iso` | 248 ms | 268 ms | 33.3 | 266 ms | 27.6 | 1.21 s | 24.8 | 970 MiB | ok |
| `rar-inner-tree` | 1.55 s | 457 ms | 35.0 | 329 ms | 18.7 | 1.43 s | 17.5 | 1042 MiB | ok |
| `rar-season-pack` | 350 ms | 614 ms | 31.9 | 376 ms | 24.5 | 1.42 s | 34.5 | 987 MiB | ok |
| `rar4-compressed` | 123 ms | 135 ms | — | — | — | — | — | — | ok |
| `rar5-mixed-compressed` | 97 ms | 198 ms | — | — | — | — | — | 900 MiB | ok |
| `rar-encrypted-no-password` | 247 ms | 450 ms | — | — | — | — | — | 921 MiB | ok |
| `huge-direct-pack` | 913 ms | 319 ms | 33.6 | 260 ms | 5.7 | 1.50 s | 65.0 | 1138 MiB | ok |
| `damaged-partial` | 194 ms | 278 ms | 15.3 | 378 ms | 41.8 | 1.36 s | 39.6 | 1018 MiB | ok |
| `damaged-severe` | 671 ms | 277 ms | — | — | — | — | — | 1017 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 1019 MiB | **failed** |
| `incomplete-archive-set` | 285 ms | 185 ms | — | — | — | — | — | 968 MiB | ok |

† transfer too short to measure sustained rate (the file fit in flight).

<details><summary>Failures (1)</summary>

- `dead-post` (failure): first article missing

</details>

### AIOStreams

`aiostreams` · TypeScript · version `9e59c4a` · serving: http-range · runtime: source · startup 24.30 s

**Own set**: 24 entries, median post 26.3 GiB · click&rarr;byte 1.51 s (shared population: 962 ms, 0.64×) · seq 46.4 MB/s · CPU 6.7 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 1.33 s | 168 ms | 40.5 | 806 ms | 9.7 | 2.78 s | 7.6 | 420 MiB | ok |
| `rar-named-small` | 1.06 s | 152 ms | 46.3 | 189 ms | 22.4 | 1.69 s | 5.3 | 428 MiB | ok |
| `rar-hdrenc-small` | 1.32 s | 190 ms | 50.7 | 36 ms | 36.9 | 297 ms | 10.7 | 533 MiB | ok |
| `7z-obfuscated-small` | 1.33 s | 249 ms | 54.4 | 24 ms | — | 231 ms | 9.4 | 488 MiB | ok |
| `plain-medium` | 285 ms | 84 ms | 48.5 | 150 ms | 25.7 | 1.94 s | 5.0 | 586 MiB | ok |
| `plain-season-pack` | 656 ms | 173 ms | 48.3 | 266 ms | 25.1 | 2.76 s | 12.3 | 542 MiB | ok |
| `rar-stored-movie` | 588 ms | 198 ms | 41.3 | 651 ms | 21.9 | 2.82 s | 5.4 | 559 MiB | ok |
| `rar4-stored` | 277 ms | 181 ms | 41.5 | 406 ms | 23.1 | 1.51 s | 5.6 | 513 MiB | ok |
| `rar4-inner-obfuscated` | 534 ms | 210 ms | 49.4 | 569 ms | 22.0 | 1.30 s | 6.4 | 518 MiB | ok |
| `rar-identity-grouped` | 1.61 s | 239 ms | 44.2 | 595 ms | 28.8 | 1.45 s | 5.2 | 504 MiB | ok |
| `rar4-obfuscated-volumes` | 1.33 s | 208 ms | 47.4 | 390 ms | 28.3 | 1.63 s | 5.7 | 540 MiB | ok |
| `rar-numeric-extensions` | 3.29 s | 352 ms | 48.7 | 517 ms | 29.3 | 1.81 s | 5.7 | 519 MiB | ok |
| `7z-plain-header` | 522 ms | 282 ms | 45.0 | 512 ms | 20.1 | 1.56 s | 5.8 | 537 MiB | ok |
| `7z-plain-large` | 622 ms | 318 ms | 46.0 | 523 ms | 25.1 | 1.87 s | 5.6 | 536 MiB | ok |
| `7z-split-compressed-header` | 657 ms | 327 ms | 45.0 | 494 ms | 22.0 | 1.49 s | 5.4 | 555 MiB | ok |
| `7z-header-encrypted` | 560 ms | 176 ms | 43.9 | 491 ms | 12.6 | 1.48 s | 12.5 | 655 MiB | ok |
| `rar-hdrenc-large` | 5.97 s | 305 ms | 46.4 | 582 ms | 28.0 | 1.70 s | 13.1 | 708 MiB | ok |
| `rar-hdrenc-obfuscated` | 3.96 s | 386 ms | 47.7 | 622 ms | 14.3 | 1.50 s | 12.8 | 767 MiB | ok |
| `7z-obfuscated-large` | 13.32 s | 458 ms | 51.4 | 495 ms | 32.1 | 1.77 s | 7.2 | 728 MiB | ok |
| `7z-obfuscated-hotd` | 1.70 s | 409 ms | 47.9 | 305 ms | 31.9 | 1.42 s | 12.8 | 804 MiB | ok |
| `rar-nested-iso` | 457 ms | 369 ms | 48.6 | 666 ms | 35.6 | 1.54 s | 7.0 | 765 MiB | ok |
| `rar-inner-tree` | 3.11 s | 985 ms | 45.9 | 475 ms | 27.8 | 1.87 s | 7.3 | 795 MiB | ok |
| `rar-season-pack` | 2.73 s | 98 ms | 39.6 | 668 ms | 17.9 | 1.66 s | 6.0 | 815 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 719 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | 727 MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | — | **failed** |
| `huge-direct-pack` | 2.39 s | 1.08 s | 45.8 | 219 ms | 24.7 | 1.42 s | 7.6 | 1071 MiB | ok |
| `damaged-partial` | 1.85 s | 122 ms | 48.5 | 481 ms | 33.5 | 1.29 s | 6.0 | 991 MiB | ok |
| `damaged-severe` | 4.00 s | 317 ms | — | — | — | — | — | 903 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 908 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 910 MiB | **failed** |

<details><summary>Failures (5)</summary>

- `rar4-compressed` (negative): import failed: Archive is compressed: not streamable [archive_compressed]
- `rar5-mixed-compressed` (negative): import failed: Archive is compressed: not streamable [archive_compressed]
- `rar-encrypted-no-password` (negative): import failed: Archive is encrypted: password required [archive_encrypted]
- `dead-post` (failure): import failed: Missing on all providers: incomplete or removed [missing_on_providers]
- `incomplete-archive-set` (failure): import failed: Archive incomplete: volumes missing from the post [incomplete_archive]

</details>

## Corpus used

See `docs/CORPUS.md` for why each entry is in the set.

| Entry | Tier | Posted | Axes |
|---|---|---:|---|
| `plain-small` | smoke | 1.73 GiB | `direct-video`, `no-archive` |
| `rar-named-small` | smoke | 1.68 GiB | `rar5`, `stored`, `named-volumes`, `partNN` |
| `rar-hdrenc-small` | smoke | 0.47 GiB | `rar5`, `encrypted-headers`, `password-in-nzb` |
| `7z-obfuscated-small` | smoke | 0.14 GiB | `7z`, `obfuscated-names`, `extensionless`, `password-in-nzb` |
| `plain-medium` | core | 8.79 GiB | `direct-video`, `no-archive` |
| `plain-season-pack` | core | 112.79 GiB | `direct-video`, `season-pack`, `file-selection` |
| `rar-stored-movie` | core | 25.34 GiB | `rar5`, `stored`, `named-volumes` |
| `rar4-stored` | core | 1.67 GiB | `rar4`, `stored`, `rar+rNN` |
| `rar4-inner-obfuscated` | core | 1.37 GiB | `rar4`, `stored`, `obfuscated-inner-name` |
| `rar-identity-grouped` | core | 8.16 GiB | `rar5`, `stored`, `extensionless`, `per-file-unique-stems` |
| `rar4-obfuscated-volumes` | core | 16.22 GiB | `rar4`, `extensionless`, `random-stems` |
| `rar-numeric-extensions` | core | 78.64 GiB | `rar5`, `stored`, `numeric-extensions`, `hex-names` |
| `7z-plain-header` | core | 2.74 GiB | `7z`, `plain-header`, `stored` |
| `7z-plain-large` | core | 47.8 GiB | `7z`, `plain-header` |
| `7z-split-compressed-header` | core | 78.36 GiB | `7z`, `split-7z.NNN`, `compressed-header`, `password-in-nzb` |
| `7z-header-encrypted` | core | 6.74 GiB | `7z`, `header-encrypted`, `aes`, `password-in-nzb` |
| `rar-hdrenc-large` | core | 101.64 GiB | `rar5`, `encrypted-headers`, `password-in-nzb` |
| `rar-hdrenc-obfuscated` | core | 149.68 GiB | `rar5`, `encrypted-headers`, `extensionless`, `random-stems`, `password-in-nzb` |
| `7z-obfuscated-large` | core | 71.18 GiB | `7z`, `obfuscated-names`, `extensionless`, `password-in-nzb` |
| `7z-obfuscated-hotd` | core | 27.26 GiB | `7z`, `obfuscated-names`, `extensionless`, `password-in-nzb` |
| `rar-nested-iso` | core | 94.7 GiB | `rar4`, `stored`, `nested-archive`, `iso` |
| `rar-inner-tree` | core | 244.23 GiB | `rar5`, `stored`, `inner-directory-tree`, `file-selection` |
| `rar-season-pack` | core | 61.05 GiB | `rar5`, `stored`, `season-pack`, `many-volumes` |
| `rar4-compressed` | negative | 3.11 GiB | `rar4`, `compressed`, `not-streamable-without-decompression` |
| `rar5-mixed-compressed` | negative | 1.91 GiB | `rar5`, `mixed-store-and-compressed` |
| `rar-encrypted-no-password` | negative | 101.64 GiB | `rar5`, `encrypted-headers`, `no-password-available`, `derived` |
| `huge-direct-pack` | stress | 512.63 GiB | `direct-video`, `season-pack`, `extensionless`, `very-large` |
| `damaged-partial` | failure | 10.33 GiB | `rar5`, `stored`, `missing-articles`, `single-hole`, `seek-into-hole` |
| `damaged-severe` | failure | 43.6 GiB | `rar5`, `encrypted-headers`, `missing-articles`, `severe-damage` |
| `dead-post` | failure | 4.54 GiB | `rar5`, `dead-post`, `all-articles-missing` |
| `incomplete-archive-set` | failure | 0.98 GiB | `rar5`, `compressed`, `missing-volumes`, `identical-subjects`, `no-volume-numbers-in-names` |

---

Generated from `results.json` by `src/report/markdown.mjs`. Regenerate with
`node src/cli.mjs report <run-dir>`.