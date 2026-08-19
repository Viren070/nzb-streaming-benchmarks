# NZB streaming benchmark

**Run** `2026-08-21T17-46-48-437Z` · started 2026-08-21T17:46:48.437Z · finished 2026-08-21T20:21:55.190Z

> **Merged run.** **altmount**: all 31 entries came from a separate pass
> (`2026-08-21T20-24-41-903Z`, 2026-08-21T20:24:41.904Z) and were merged in. Those rows saw the provider at a
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

### Run settings

| Setting | Value |
|---|---|
| Sequential read | 244 MiB cap / 8s cap |
| Seek points | 1%, 25%, 50%, 75%, 95% + backward |
| Seek read | 4 MiB |
| Playback sim | 10s @ 25 Mbps |
| Integrity samples | 3 |
| Item timeout | 900s |

## Summary

Medians across the performance tiers (`smoke`, `core`, `stress`). Failure and
negative tiers are excluded here and reported separately below.

> **`n` and *med post* are part of the result, not footnotes.** Each row's medians
> are taken over the entries *that application served*, so they are medians over
> different populations. Import and click&rarr;byte scale with post size, so an
> application that fails the large entries is credited with the fast medians of the
> small ones it survived. Compare the like-for-like table below before ranking.

| App | Runtime | n | Med post | Seq MB/s | p05 MB/s | Click&rarr;byte | Import | Cold TTFB | Warm TTFB | Seek TTFB | Full seek | Worst seek | CPU s/GiB | Idle RSS | RSS/item | RSS drift | After idle | Correct |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **nzbdavex** | source | 22 | 26.3 GiB | 38.3 | 20.9 | 2.81 s | 2.60 s | 153 ms | 144 ms | 261 ms | 744 ms | 395 ms | 36.8 | 136 MiB | 514 MiB | +4 MiB | 412 MiB | 28/31 |
| **Decypharr** | docker | 17 | 25.3 GiB | 35.6 | 20.7 | 9.76 s | 9.25 s | 283 ms | 1 ms | 293 ms | 521 ms | 786 ms | 30.0 | 41 MiB | 435 MiB | +1168 MiB | 1562 MiB | 23/31 |
| **StremThru (newz)** | source | 20 | 26.3 GiB | 26.7 | 14.6 | 4.07 s | 3.89 s | 150 ms | 145 ms | 459 ms | 956 ms | 647 ms | 69.8 | 83 MiB | 876 MiB | +533 MiB | 997 MiB | 27/31 |
| **raw NNTP baseline** | source | 24 | 26.3 GiB | 35.1 | 25.5 | 497 ms | 208 ms | 287 ms | 388 ms | 340 ms | 450 ms | 411 ms | 22.0 | 517 MiB | 679 MiB | +48 MiB | 654 MiB | 26/31 |
| **StreamNZB** | source | 15 | 8.8 GiB | 38.8 | 23.3 | 1.60 s | 32 ms | 1.35 s | 3 ms | 218 ms | 636 ms | 536 ms | 6.5 | 50 MiB | 535 MiB | -5 MiB | 532 MiB | 21/31 |
| **nzbdav** | source | 21 | 27.3 GiB | 37.7 | 21.3 | 3.39 s | 3.21 s | 140 ms | 249 ms | 394 ms | 680 ms | 604 ms | 17.4 | 118 MiB | 308 MiB | +26 MiB | 298 MiB | 27/31 |
| **AltMount** | source | 17 | 25.3 GiB | 32.1 | 21.1 | 11.98 s | 11.35 s | 475 ms | 350 ms | 567 ms | 889 ms | 789 ms | 6.9 | 34 MiB | 745 MiB | +738 MiB | 968 MiB | 23/31 |
| **AIOStreams** | source | 24 | 26.3 GiB | 43.4 | 21.7 | 1.20 s | 839 ms | 261 ms | 2 ms | 509 ms | 622 ms | 676 ms | 8.5 | 225 MiB | 558 MiB | +399 MiB | 897 MiB | 30/31 |
| **Comet (feat/usenet)** | docker | 10 | 17.1 GiB | 18.7 | 5.9 | 3.86 s | 3.60 s | 210 ms | 94 ms | 487 ms | 1.38 s | 1.15 s | 55.0 | 268 MiB | 860 MiB | +747 MiB | — MiB | 16/31 |
| **InfiniDysk** | source | 21 | 27.3 GiB | 12.3 | 2.2 | 4.52 s | 4.03 s | 27 ms | 2 ms | 26 ms | 1.17 s | 32 ms | 26.5 | 164 MiB | 976 MiB | +625 MiB | 1522 MiB | 28/31 |

> **Comet (feat/usenet): this row is not a like-for-like result.** Comet does not complete a full-corpus pass: its engine keeps materialising after the harness has measured an entry, and under sustained load it deadlocks its own SQLite (shipped default) and does not recover. Entries after the first large materialisation failed for reasons belonging to earlier ones. Only the six status-clip failures that reproduced across independent runs are capability results.

> **`runtime: docker` rows were measured in a container, not on this host.**
> Decypharr, Comet (feat/usenet) are not buildable natively here, so they were run
> under Docker with `--docker`. The CPU and memory columns are real numbers, read
> from the daemon's cgroup counters rather than guessed, but they describe a process
> inside a Linux VM: the CPU is the VM's share of this machine, and every byte
> crosses an extra NAT hop on the way in.
>
> Compare container rows with each other freely. Against a native row, read them as
> indicative: a container row that is slower is not proof the application is.

### Like-for-like

The same 6 entries for every application, the ones all of them
served, so these medians are directly comparable. Median post size here is
17.1 GiB.

| App | Click&rarr;byte | Import | Cold TTFB | Seq MB/s | p05 MB/s | CPU s/GiB | vs its own-set click&rarr;byte |
|---|---:|---:|---:|---:|---:|---:|---:|
| nzbdavex | 2.16 s | 1.72 s | 153 ms | 39.9 | 17.3 | 32.5 | 0.77× |
| Decypharr | 6.59 s | 6.18 s | 335 ms | 32.7 | 9.6 | 29.6 | 0.68× |
| StremThru (newz) | 2.71 s | 2.55 s | 126 ms | 24.1 | 17.7 | 61.5 | 0.66× |
| raw NNTP baseline | 454 ms | 175 ms | 207 ms | 35.9 | 26.6 | 17.6 | 0.91× |
| StreamNZB | 1.47 s | 64 ms | 1.33 s | 41.6 | 27.4 | 6.9 | 0.91× |
| nzbdav | 1.83 s | 1.72 s | 147 ms | 38.9 | 23.5 | 16.6 | 0.54× |
| AltMount | 8.48 s | 7.94 s | 514 ms | 34.1 | 24.8 | 5.7 | 0.71× |
| AIOStreams | 911 ms | 600 ms | 229 ms | 42.5 | 12.8 | 7.0 | 0.76× |
| Comet (feat/usenet) | 3.59 s | 3.35 s | 210 ms | 19.3 | 6.9 | 51.7 | 0.93× |
| InfiniDysk | 4.17 s | 4.08 s | 27 ms | 14.4 | 2.8 | 27.1 | 0.92× |

The last column is the size of the distortion. A value near `1.00×` means the
application's own-set median was already effectively this population, which is
what you see from an application whose successes *are* the easy entries. Values
well below `1.00×` belong to applications whose own median was dragged up by
large entries the others never attempted.

Entries: `plain-medium`, `rar-stored-movie`, `rar4-inner-obfuscated`, `7z-plain-header`, `7z-plain-large`, `7z-split-compressed-header`.

This set is bounded by the *weakest* application, so it is small and skews toward
easier content. Neither table is the whole answer: the one above rewards breadth
and penalises nothing, this one compares fairly on a narrow slice. Read them with
the capability matrix.

### Correctness breakdown

*Correct* is not *served*. Six corpus entries are built to be unservable: three
`negative` (compressed archives, no password) and three `failure` (dead post,
severe damage, missing volumes). Refusing those is the right answer, and serving
one means emitting bytes that cannot be the media, which is a worse result than
refusing, not a better one.

| App | Served (of 25 servable) | Capability gaps | Correctly rejected | **Wrongly served** |
|---|---:|---:|---:|---:|
| nzbdavex | 23/25 | 2 | 5/6 | **1** |
| Decypharr | 18/25 | 7 | 5/6 | **1** |
| StremThru (newz) | 21/25 | 4 | 6/6 | 0 |
| raw NNTP baseline | 25/25 | 0 | 1/6 | **5** |
| StreamNZB | 16/25 | 9 | 5/6 | **1** |
| nzbdav | 22/25 | 3 | 5/6 | **1** |
| AltMount | 18/25 | 7 | 5/6 | **1** |
| AIOStreams | 25/25 | 0 | 5/6 | **1** |
| Comet (feat/usenet) | 10/25 | 15 | 6/6 | 0 |
| InfiniDysk | 22/25 | 3 | 6/6 | 0 |

`raw` is not an application and its row here is not a verdict: it serves outer
volume bytes without opening an archive, so it "wrongly serves" entries no player
could open. That is the point of the baseline, not a defect in it.

A *capability gap* is the number that ranks engines: entries that should stream
and did not.

*Click&rarr;byte* is import + cold open: what a viewer waits through after pressing
play. Compare **that**, not import alone: mount-style apps (altmount, the nzbdav
family) do their inspection at import, while addon-style apps (StreamNZB,
AIOStreams) return a session in milliseconds and do the same work on first byte.

*CPU s/GiB* is CPU-seconds consumed per GiB delivered, the fair efficiency
comparison, since raw CPU% is meaningless at different throughputs.

*RSS/item* is the median of the per-entry peaks, not a peak across the whole run.
A run-wide peak is a high-water mark over however many entries an application
survived, so it rewards failing early; the per-item median is comparable.

*RSS drift* is the median per-entry peak over the last third of the run minus the
first third. Every application here holds more memory the longer it runs, and this
states how much rather than letting it inflate the headline. It is measured with no
idle gap between entries, which is the harshest case: applications that release on
idle never get the chance to. *After idle* is the median footprint once the work
stops but before the process is killed, which is where that memory goes back.

Both are taken over every measured entry, including failed ones, since a failure
still occupies a position in the session. Entries merged from another run are
excluded from these two columns because their footprint is another process's.

*p05 MB/s* is the 5th-percentile one-second windowed rate. An engine can ack a
range in single-digit milliseconds and still stall behind it, so read TTFB and
p05 together.

*Full seek* is what that costs in practice: the median time to complete a whole
seek read, acknowledgement plus transfer, rather than the moment the first byte
appears. An engine that answers a Range immediately and then feeds the body slowly
wins *Seek TTFB* and loses this column, and this column is the one a player waits
through. Where the two disagree, believe this one.

## Capability matrix

Whether each application could serve each corpus entry at all. `negative` entries
are expected to fail; what matters there is that the failure is quick and explicit.

> **The `raw` column is not a capability claim.** It streams the outer volume
> bytes without opening the archive, so it "passes" encrypted and obfuscated
> entries that no application could actually play. Read it as "the articles are
> retrievable", which is exactly what makes it useful: a failure everywhere *except*
> raw is an application limitation, not a dead post.

| Entry | Tier | nzbdavex | Decypharr | StremThru (newz) | raw NNTP baseline | StreamNZB | nzbdav | AltMount | AIOStreams | Comet (feat/usenet) | InfiniDysk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `plain-small` | smoke | pass | pass | pass | pass | pass | pass | pass | pass | FAIL | pass |
| `rar-named-small` | smoke | pass | pass | pass | pass | pass | pass | FAIL | pass | pass | pass |
| `rar-hdrenc-small` | smoke | FAIL | FAIL | FAIL | pass | pass | FAIL | FAIL | pass | FAIL | FAIL |
| `7z-obfuscated-small` | smoke | pass | FAIL | pass | pass | FAIL | pass | pass | pass | FAIL | pass |
| `plain-medium` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `plain-season-pack` | core | pass | FAIL | pass | pass | pass | pass | pass | pass | pass | pass |
| `rar-stored-movie` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `rar4-stored` | core | pass | pass | FAIL | pass | pass | FAIL | FAIL | pass | FAIL | FAIL |
| `rar4-inner-obfuscated` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `rar-identity-grouped` | core | pass | pass | pass | pass | pass | pass | pass | pass | FAIL | pass |
| `rar4-obfuscated-volumes` | core | pass | pass | pass | pass | pass | pass | pass | pass | FAIL | pass |
| `rar-numeric-extensions` | core | pass | pass | pass | pass | FAIL | pass | FAIL | pass | pass | pass |
| `7z-plain-header` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `7z-plain-large` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `7z-split-compressed-header` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `7z-header-encrypted` | core | pass | FAIL | pass | pass | FAIL | pass | pass | pass | pass | pass |
| `rar-hdrenc-large` | core | pass | FAIL | pass | pass | pass | pass | FAIL | pass | FAIL | pass |
| `rar-hdrenc-obfuscated` | core | pass | FAIL | FAIL | pass | FAIL | pass | pass | pass | FAIL | pass |
| `7z-obfuscated-large` | core | FAIL | pass | FAIL | pass | FAIL | FAIL | pass | pass | FAIL | FAIL |
| `7z-obfuscated-hotd` | core | pass | FAIL | pass | pass | FAIL | pass | pass | pass | FAIL | pass |
| `rar-nested-iso` | core | pass | pass | pass | pass | FAIL | pass | FAIL | pass | FAIL | pass |
| `rar-inner-tree` | core | pass | pass | pass | pass | FAIL | pass | FAIL | pass | FAIL | pass |
| `rar-season-pack` | core | pass | pass | pass | pass | pass | pass | pass | pass | FAIL | pass |
| `rar4-compressed` | negative | FAIL | FAIL | FAIL | pass | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL |
| `rar5-mixed-compressed` | negative | FAIL | FAIL | FAIL | pass | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL |
| `rar-encrypted-no-password` | negative | FAIL | FAIL | FAIL | pass | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL |
| `huge-direct-pack` | stress | pass | pass | pass | pass | FAIL | pass | pass | pass | FAIL | pass |
| `damaged-partial` | failure | pass | pass | pass | pass | pass | pass | pass | pass | FAIL | pass |
| `damaged-severe` | failure | pass | pass | FAIL | pass | pass | pass | pass | pass | FAIL | FAIL |
| `dead-post` | failure | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL |
| `incomplete-archive-set` | failure | FAIL | FAIL | FAIL | pass | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL |

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
| `rar4-obfuscated-volumes` | StreamNZB | 1 | **2** |
| `rar-numeric-extensions` | Decypharr | 1 | **2** |
| `plain-small` | raw NNTP baseline | 0 | **1** |
| `rar-named-small` | nzbdavex | 2 | **1** |
| `rar-named-small` | StreamNZB | 2 | **1** |
| `rar-named-small` | InfiniDysk | 2 | **1** |
| `rar-hdrenc-large` | StreamNZB | 0 | **1** |
| `rar-nested-iso` | Decypharr | 0 | **1** |
| `rar-season-pack` | StreamNZB | 0 | **1** |

169 of 178 app-entry pairs matched consensus exactly.

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
| AIOStreams | **zero-filled** | all zeros | 2,097,152 (61) | yes | 4.21× |
| AltMount | **zero-filled** | all zeros | 716,800 (61) | yes | 1.51× |
| Decypharr | **error-at-hole** | `stream aborted after 0 bytes: terminated` | — | yes | — |
| InfiniDysk | **zero-filled** | `HTTP 404: ` | 716,800 (61) | yes | 2.4× |
| nzbdav | **truncated-at-hole** | `HTTP 404: ` | — | yes | — |
| nzbdavex | **zero-filled** | all zeros | 712,492 (61) | yes | 3.52× |
| raw NNTP baseline | _not addressable_ | — | — | — | — |
| StreamNZB | **zero-filled** | all zeros | 716,800 (61) | yes | 2.66× |
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

### nzbdavex

`nzbdavex` · C# (.NET 10) · version `312d3bc` · serving: webdav · runtime: source · startup 3.38 s

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 1.79 s | 427 ms | 43.2 | 223 ms | 17.0 | 1.85 s | 51.8 | 421 MiB | ok |
| `rar-named-small` | 2.36 s | 423 ms | 26.9 | 214 ms | 20.7 | 1.85 s | 34.6 | 437 MiB | ok |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 341 MiB | **failed** |
| `7z-obfuscated-small` | 1.28 s | 100 ms | 26.4 | 127 ms | 30.8 | 1.30 s | 36.3 | 347 MiB | ok |
| `plain-medium` | 775 ms | 155 ms | 41.1 | 246 ms | 23.7 | 1.87 s | 27.0 | 474 MiB | ok |
| `plain-season-pack` | 3.61 s | 303 ms | 43.0 | 242 ms | 21.2 | 1.77 s | 32.5 | 522 MiB | ok |
| `rar-stored-movie` | 1.74 s | 549 ms | 38.8 | 247 ms | 22.9 | 1.64 s | 29.7 | 547 MiB | ok |
| `rar4-stored` | 2.47 s | 345 ms | 14.2 | 317 ms | 11.8 | 2.41 s | 41.6 | 475 MiB | ok |
| `rar4-inner-obfuscated` | 1.70 s | 331 ms | 28.7 | 180 ms | 14.7 | 1.97 s | 36.3 | 446 MiB | ok |
| `rar-identity-grouped` | 1.71 s | 123 ms | 25.3 | 269 ms | 0.4 | 1.77 s | 37.5 | 495 MiB | ok |
| `rar4-obfuscated-volumes` | 1.52 s | 79 ms | 41.0 | 265 ms | 6.8 | 1.75 s | 32.7 | 562 MiB | ok |
| `rar-numeric-extensions` | 4.13 s | 503 ms | 35.5 | 1.85 s | 21.3 | 1.41 s | 44.5 | 776 MiB | ok |
| `7z-plain-header` | 583 ms | 99 ms | 41.0 | 260 ms | 23.6 | 1.50 s | 29.4 | 652 MiB | ok |
| `7z-plain-large` | 3.13 s | 152 ms | 43.0 | 261 ms | 24.6 | 1.59 s | 35.3 | 550 MiB | ok |
| `7z-split-compressed-header` | 9.30 s | 114 ms | 37.9 | 302 ms | 18.2 | 1.72 s | 39.6 | 657 MiB | ok |
| `7z-header-encrypted` | 4.07 s | 104 ms | 27.2 | 377 ms | 2.7 | 3.23 s | 37.8 | 584 MiB | ok |
| `rar-hdrenc-large` | 16.64 s | 93 ms | 38.7 | 257 ms | 14.1 | 1.94 s | 78.7 | 721 MiB | ok |
| `rar-hdrenc-obfuscated` | 2.83 s | 1.72 s | 39.0 | 238 ms | 14.5 | 1.22 s | 36.6 | 849 MiB | ok |
| `7z-obfuscated-large` | — | — | — | — | — | — | — | 633 MiB | **failed** |
| `7z-obfuscated-hotd` | 2.73 s | 83 ms | 39.3 | 172 ms | 14.4 | 1.54 s | 41.8 | 626 MiB | ok |
| `rar-nested-iso` | 2.29 s | 285 ms | 37.9 | 431 ms | 23.4 | 1.58 s | 33.3 | 803 MiB | ok |
| `rar-inner-tree` | 4.93 s | 92 ms | 36.9 | 287 ms | 12.5 | 1.85 s | 40.3 | 770 MiB | ok |
| `rar-season-pack` | 15.32 s | 130 ms | 35.7 | 283 ms | 18.1 | 1.88 s | 52.3 | 460 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 429 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | — MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 449 MiB | **failed** |
| `huge-direct-pack` | 4.12 s | 323 ms | 42.8 | 331 ms | 28.4 | 1.65 s | 37.0 | 525 MiB | ok |
| `damaged-partial` | 2.57 s | 589 ms | 26.0 | 434 ms | 17.5 | 1.63 s | 51.4 | 507 MiB | ok |
| `damaged-severe` | 7.29 s | 4.26 s | — | — | — | — | — | 469 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 421 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 420 MiB | **failed** |

<details><summary>Failures (7)</summary>

- `rar-hdrenc-small` (smoke): import failed: No importable videos found.
- `7z-obfuscated-large` (core): import failed: Article with message-id KrRwGaSzEcDhQpBgNuSyNlYu-1638723981550@nyuu not found.
- `rar4-compressed` (negative): import failed: Only rar files with compression method m0 are supported.
- `rar5-mixed-compressed` (negative): import failed: Only rar files with compression method m0 are supported.
- `rar-encrypted-no-password` (negative): import failed: Encrypted Rar archive has no password specified.
- `dead-post` (failure): import failed: Article with message-id 055b4332e46842d9ad776958bb6a93d4@ngPost not found.
- `incomplete-archive-set` (failure): import failed: Only rar files with compression method m0 are supported.

</details>

### Decypharr

`decypharr` · Go · version `v2.5` (`0dd1cbb`) · serving: webdav · runtime: docker · CPU/RSS from container cgroups · startup 2.31 s

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 2.70 s | 259 ms | 34.5 | 271 ms | 26.1 | 1.36 s | 25.7 | 55 MiB | ok |
| `rar-named-small` | 3.08 s | 794 ms | 38.7 | 260 ms | 24.6 | 1.75 s | 28.5 | 96 MiB | ok |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 66 MiB | **failed** |
| `7z-obfuscated-small` | — | — | — | — | — | — | — | 68 MiB | **failed** |
| `plain-medium` | 3.11 s | 273 ms | 29.9 | 467 ms | 6.9 | 1.99 s | 30.0 | 75 MiB | ok |
| `plain-season-pack` | — | — | — | — | — | — | — | 169 MiB | **failed** |
| `rar-stored-movie` | 9.25 s | 551 ms | 35.4 | 467 ms | 19.0 | 2.66 s | 29.9 | 192 MiB | ok |
| `rar4-stored` | 5.15 s | 283 ms | 0.2 | 260 ms | 0.5 | 1.65 s | 109.5 | 221 MiB | ok |
| `rar4-inner-obfuscated` | 3.09 s | 289 ms | 37.0 | 358 ms | 18.0 | 2.70 s | 26.9 | 196 MiB | ok |
| `rar-identity-grouped` | 4.27 s | 213 ms | — | 336 ms | — | — | — | 209 MiB | ok |
| `rar4-obfuscated-volumes` | 9.56 s | 195 ms | 40.1 | 204 ms | 3.6 | 2.18 s | 29.0 | 216 MiB | ok |
| `rar-numeric-extensions` | 24.54 s | 3.16 s | 42.1 | 322 ms | 0.0 | 1.40 s | 39.5 | 313 MiB | ok |
| `7z-plain-header` | 1.06 s | 128 ms | 35.6 | 273 ms | 3.0 | 2.06 s | 26.8 | 317 MiB | ok |
| `7z-plain-large` | 12.30 s | 690 ms | 6.6 | 307 ms | 0.7 | 4.37 s | 54.2 | 342 MiB | ok |
| `7z-split-compressed-header` | 21.48 s | 380 ms | 16.2 | 293 ms | 24.9 | 1.19 s | 29.3 | 435 MiB | ok |
| `7z-header-encrypted` | — | — | — | — | — | — | — | 435 MiB | **failed** |
| `rar-hdrenc-large` | — | — | — | — | — | — | — | 657 MiB | **failed** |
| `rar-hdrenc-obfuscated` | — | — | — | — | — | — | — | 672 MiB | **failed** |
| `7z-obfuscated-large` | 29.41 s | 254 ms | 21.5 | 384 ms | 0.8 | 3.88 s | 48.6 | 728 MiB | ok |
| `7z-obfuscated-hotd` | — | — | — | — | — | — | — | 730 MiB | **failed** |
| `rar-nested-iso` | 5.50 s | 278 ms | 27.3 | 2 ms | — | 250 ms | 19.5 | 815 MiB | ok |
| `rar-inner-tree` | 97.40 s | 327 ms | 37.2 | 423 ms | 27.0 | 1.40 s | 36.0 | 1059 MiB | ok |
| `rar-season-pack` | 34.56 s | 233 ms | 37.8 | 291 ms | 4.7 | 2.90 s | 57.3 | 1039 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 1042 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | 1046 MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 1088 MiB | **failed** |
| `huge-direct-pack` | 148.71 s | 351 ms | 36.6 | 274 ms | 10.8 | 2.08 s | 39.3 | 1514 MiB | ok |
| `damaged-partial` | 6.17 s | 322 ms | 44.5 | 259 ms | 22.0 | 1.48 s | 28.9 | 1540 MiB | ok |
| `damaged-severe` | 15.32 s | 281 ms | — | — | — | — | — | 1574 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 1562 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 1562 MiB | **failed** |

† transfer too short to measure sustained rate (the file fit in flight).

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

### StremThru (newz)

`stremthru` · Go · version `0.103.2` · serving: http-range · runtime: source · startup 567 ms

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 1.85 s | 72 ms | 26.7 | 374 ms | 18.9 | 2.07 s | 21.5 | 602 MiB | ok |
| `rar-named-small` | 2.91 s | 125 ms | 20.8 | 410 ms | 14.6 | 2.93 s | 37.2 | 733 MiB | ok |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 653 MiB | **failed** |
| `7z-obfuscated-small` | 1.30 s | 6 ms | 8.1 | 132 ms | 3.1 | 841 ms | 49.9 | 570 MiB | ok |
| `plain-medium` | 771 ms | 25 ms | 24.1 | 279 ms | 13.9 | 2.00 s | 6.2 | 572 MiB | ok |
| `plain-season-pack` | 2.38 s | 207 ms | 33.8 | 447 ms | 17.0 | 2.31 s | 10.9 | 645 MiB | ok |
| `rar-stored-movie` | 2.93 s | 209 ms | 27.9 | 551 ms | 8.5 | 2.12 s | 41.6 | 790 MiB | ok |
| `rar4-stored` | — | — | — | — | — | — | — | 761 MiB | **failed** |
| `rar4-inner-obfuscated` | 2.17 s | 106 ms | 28.7 | 325 ms | 17.6 | 2.07 s | 18.8 | 916 MiB | ok |
| `rar-identity-grouped` | 2.28 s | 128 ms | — | 385 ms | — | — | — | 776 MiB | ok |
| `rar4-obfuscated-volumes` | 1.95 s | 154 ms | 26.9 | 470 ms | 20.4 | 1.86 s | 30.7 | 745 MiB | ok |
| `rar-numeric-extensions` | 7.66 s | 734 ms | 29.4 | 939 ms | 13.6 | 2.83 s | 92.2 | 876 MiB | ok |
| `7z-plain-header` | 987 ms | 11 ms | 7.2 | 133 ms | 3.7 | 6.91 s | 81.3 | 733 MiB | ok |
| `7z-plain-large` | 4.86 s | 146 ms | 8.3 | 289 ms | 2.8 | 5.56 s | 130.5 | 628 MiB | ok |
| `7z-split-compressed-header` | 25.26 s | 308 ms | 3.8 | 649 ms | 2.3 | 9.04 s | 293.4 | 1243 MiB | ok |
| `7z-header-encrypted` | 7.37 s | 49 ms | 2.3 | 557 ms | 1.8 | 10.14 s | — | 785 MiB | ok |
| `rar-hdrenc-large` | 138.30 s | 2.35 s | 18.8 | 2.71 s | 13.6 | 4.70 s | 487.5 | 2037 MiB | ok |
| `rar-hdrenc-obfuscated` | — | — | — | — | — | — | — | 2027 MiB | **failed** |
| `7z-obfuscated-large` | — | — | — | — | — | — | — | 1638 MiB | **failed** |
| `7z-obfuscated-hotd` | 6.81 s | 88 ms | 5.8 | 246 ms | 2.1 | 7.30 s | 94.0 | 1372 MiB | ok |
| `rar-nested-iso` | 4.86 s | 580 ms | 27.2 | 911 ms | 12.8 | 2.61 s | 64.8 | 843 MiB | ok |
| `rar-inner-tree` | 13.36 s | 1.22 s | 24.3 | 1.53 s | 12.0 | 3.20 s | 159.3 | 1462 MiB | ok |
| `rar-season-pack` | 190.86 s | 1.93 s | 26.8 | 2.35 s | 15.2 | 4.40 s | 367.6 | 1800 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 1238 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | 1214 MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 1207 MiB | **failed** |
| `huge-direct-pack` | 5.85 s | 1.43 s | 29.8 | 1.78 s | 10.7 | 3.35 s | 74.8 | 1568 MiB | ok |
| `damaged-partial` | 4.00 s | 252 ms | 28.2 | 500 ms | 12.9 | 2.45 s | 72.3 | 1246 MiB | ok |
| `damaged-severe` | — | — | — | — | — | — | — | 827 MiB | **failed** |
| `dead-post` | — | — | — | — | — | — | — | 936 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 936 MiB | **failed** |

† transfer too short to measure sustained rate (the file fit in flight).

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

### raw NNTP baseline

`raw` · JavaScript (this harness) · version `harness-builtin` · serving: http-range · runtime: source · startup 3 ms

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 389 ms | 492 ms | 35.8 | 315 ms | 20.6 | 1.52 s | 202.4 | 648 MiB | ok |
| `rar-named-small` | 199 ms | 188 ms | 47.3 | 335 ms | 15.2 | — | 45.6 | 645 MiB | ok |
| `rar-hdrenc-small` | 131 ms | 353 ms | 35.3 | 341 ms | 24.0 | 1.52 s | 42.3 | 662 MiB | ok |
| `7z-obfuscated-small` | 192 ms | 188 ms | 45.3 | 174 ms | — | — | — | 643 MiB | ok |
| `plain-medium` | 354 ms | 140 ms | 33.0 | 255 ms | 23.0 | 1.43 s | 17.2 | 671 MiB | ok |
| `plain-season-pack` | 540 ms | 650 ms | 39.5 | 501 ms | 29.2 | 1.75 s | 27.4 | 717 MiB | ok |
| `rar-stored-movie` | 195 ms | 240 ms | 36.5 | 265 ms | 22.2 | 1.19 s | 16.0 | 697 MiB | ok |
| `rar4-stored` | 138 ms | 292 ms | 31.2 | 202 ms | — | — | — | 659 MiB | ok |
| `rar4-inner-obfuscated` | 129 ms | 345 ms | 39.8 | 392 ms | 37.4 | 1.21 s | 34.5 | 695 MiB | ok |
| `rar-identity-grouped` | 229 ms | 310 ms | 30.1 | 338 ms | 7.4 | 2.09 s | 20.4 | 678 MiB | ok |
| `rar4-obfuscated-volumes` | 132 ms | 214 ms | 37.4 | 408 ms | 25.1 | 1.21 s | 17.0 | 600 MiB | ok |
| `rar-numeric-extensions` | 273 ms | 370 ms | 32.8 | 351 ms | 26.6 | 1.67 s | 19.7 | 638 MiB | ok |
| `7z-plain-header` | 113 ms | 174 ms | 35.9 | 345 ms | 30.3 | 1.39 s | 18.1 | 629 MiB | ok |
| `7z-plain-large` | 207 ms | 332 ms | 32.2 | 338 ms | 29.6 | 1.37 s | 15.7 | 643 MiB | ok |
| `7z-split-compressed-header` | 156 ms | 115 ms | 36.5 | 359 ms | 32.6 | 1.60 s | 28.1 | 672 MiB | ok |
| `7z-header-encrypted` | 239 ms | 509 ms | 29.8 | 342 ms | 14.8 | 2.36 s | 26.7 | 661 MiB | ok |
| `rar-hdrenc-large` | 271 ms | 249 ms | 38.8 | 311 ms | 26.7 | 1.64 s | 18.3 | 680 MiB | ok |
| `rar-hdrenc-obfuscated` | 506 ms | 125 ms | 35.0 | 626 ms | 24.3 | 1.73 s | 18.0 | 688 MiB | ok |
| `7z-obfuscated-large` | 201 ms | 171 ms | 43.7 | 284 ms | 41.1 | 1.36 s | 24.0 | 687 MiB | ok |
| `7z-obfuscated-hotd` | 145 ms | 302 ms | 35.1 | 248 ms | 31.5 | 1.50 s | 15.9 | 695 MiB | ok |
| `rar-nested-iso` | 253 ms | 283 ms | 33.0 | 351 ms | 22.8 | 1.44 s | 23.5 | 710 MiB | ok |
| `rar-inner-tree` | 352 ms | 151 ms | 33.6 | 371 ms | 18.0 | 1.79 s | 16.3 | 691 MiB | ok |
| `rar-season-pack` | 210 ms | 291 ms | 34.6 | 281 ms | 31.2 | 1.53 s | 26.8 | 696 MiB | ok |
| `rar4-compressed` | 123 ms | 184 ms | — | — | — | — | — | — MiB | ok |
| `rar5-mixed-compressed` | 160 ms | 141 ms | — | — | — | — | — | 678 MiB | ok |
| `rar-encrypted-no-password` | 315 ms | 464 ms | — | — | — | — | — | 648 MiB | ok |
| `huge-direct-pack` | 903 ms | 648 ms | 35.9 | 359 ms | 28.5 | 1.39 s | 61.8 | 850 MiB | ok |
| `damaged-partial` | 127 ms | 335 ms | 33.4 | 389 ms | 43.0 | 1.39 s | 29.1 | 727 MiB | ok |
| `damaged-severe` | 193 ms | 331 ms | — | — | — | — | — | 722 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 723 MiB | **failed** |
| `incomplete-archive-set` | 179 ms | 188 ms | — | — | — | — | — | 719 MiB | ok |

† transfer too short to measure sustained rate (the file fit in flight).

<details><summary>Failures (1)</summary>

- `dead-post` (failure): first article missing

</details>

### StreamNZB

`streamnzb` · Go · version `3e79529` · serving: http-range · runtime: source · startup 1.55 s

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 10 ms | 1.83 s | 37.3 | 469 ms | 24.1 | 1.78 s | 5.9 | 535 MiB | ok |
| `rar-named-small` | 12 ms | 1.05 s | 30.4 | 204 ms | 27.3 | 1.19 s | 6.1 | 535 MiB | ok |
| `rar-hdrenc-small` | 6 ms | 932 ms | 37.7 | 5 ms | 3.7 | 534 ms | 6.8 | 539 MiB | ok |
| `7z-obfuscated-small` | 3 ms | 635 ms | — | — | — | — | — | 516 MiB | **failed** |
| `plain-medium` | 28 ms | 470 ms | 40.7 | 107 ms | 19.9 | 1.24 s | 4.7 | 537 MiB | ok |
| `plain-season-pack` | 274 ms | 701 ms | 40.1 | 284 ms | 30.2 | 1.44 s | 7.4 | 540 MiB | ok |
| `rar-stored-movie` | 99 ms | 3.26 s | 47.3 | 203 ms | 18.4 | 1.25 s | 8.2 | 557 MiB | ok |
| `rar4-stored` | 15 ms | 1.32 s | — | 171 ms | — | — | — | 539 MiB | ok |
| `rar4-inner-obfuscated` | 9 ms | 1.32 s | 34.4 | 199 ms | 26.7 | 1.62 s | 5.8 | 534 MiB | ok |
| `rar-identity-grouped` | 32 ms | 2.58 s | 31.4 | 441 ms | 18.2 | 2.01 s | 6.2 | 532 MiB | ok |
| `rar4-obfuscated-volumes` | 57 ms | 2.33 s | 34.2 | 510 ms | 28.5 | 1.86 s | 6.2 | 537 MiB | ok |
| `rar-numeric-extensions` | 226 ms | 5.01 s | — | — | — | — | — | 532 MiB | **failed** |
| `7z-plain-header` | 14 ms | 1.28 s | 42.5 | 379 ms | 23.4 | 1.80 s | 4.6 | 532 MiB | ok |
| `7z-plain-large` | 173 ms | 3.42 s | 42.5 | 232 ms | 29.2 | 1.40 s | 7.9 | 604 MiB | ok |
| `7z-split-compressed-header` | 254 ms | 1.35 s | 29.5 | 502 ms | 15.0 | 2.85 s | 9.2 | 532 MiB | ok |
| `7z-header-encrypted` | 26 ms | 1.29 s | — | — | — | — | — | 530 MiB | **failed** |
| `rar-hdrenc-large` | 333 ms | 3.36 s | 41.8 | 12 ms | 37.3 | 250 ms | 22.3 | 611 MiB | ok |
| `rar-hdrenc-obfuscated` | — | — | — | — | — | — | — | — MiB | **failed** |
| `7z-obfuscated-large` | 248 ms | 5.03 s | — | — | — | — | — | 530 MiB | **failed** |
| `7z-obfuscated-hotd` | 79 ms | 5.03 s | — | — | — | — | — | 534 MiB | **failed** |
| `rar-nested-iso` | 541 ms | 1.09 s | — | — | — | — | — | 530 MiB | **failed** |
| `rar-inner-tree` | — | — | — | — | — | — | — | — MiB | **failed** |
| `rar-season-pack` | 337 ms | 2.02 s | 39.9 | 218 ms | 24.6 | 1.85 s | 68.3 | 537 MiB | ok |
| `rar4-compressed` | 29 ms | 1.19 s | — | — | — | — | — | 528 MiB | **failed** |
| `rar5-mixed-compressed` | 18 ms | 960 ms | — | — | — | — | — | 524 MiB | **failed** |
| `rar-encrypted-no-password` | 1.10 s | 791 ms | — | — | — | — | — | 541 MiB | **failed** |
| `huge-direct-pack` | — | — | — | — | — | — | — | — MiB | **failed** |
| `damaged-partial` | 59 ms | 1.38 s | 35.2 | 285 ms | 13.4 | 2.85 s | 98.2 | 543 MiB | ok |
| `damaged-severe` | 204 ms | 1.41 s | — | — | — | — | — | 542 MiB | ok |
| `dead-post` | 28 ms | 1.24 s | — | — | — | — | — | 532 MiB | **failed** |
| `incomplete-archive-set` | 8 ms | 1.09 s | — | — | — | — | — | 531 MiB | **failed** |

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

### nzbdav

`nzbdav` · C# (.NET 10) · version `794948b` · serving: webdav · runtime: source · startup 3.33 s

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 2.20 s | 170 ms | 39.1 | 509 ms | 20.4 | 1.53 s | 26.9 | 265 MiB | ok |
| `rar-named-small` | 1.55 s | 79 ms | 33.3 | 285 ms | 20.7 | 1.15 s | 17.6 | 270 MiB | ok |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 262 MiB | **failed** |
| `7z-obfuscated-small` | 559 ms | 90 ms | 23.8 | 227 ms | 32.5 | 1.05 s | 16.8 | 268 MiB | ok |
| `plain-medium` | 928 ms | 40 ms | 38.6 | 298 ms | 19.7 | 1.30 s | 13.4 | 288 MiB | ok |
| `plain-season-pack` | 2.57 s | 65 ms | 31.7 | 400 ms | 17.4 | 1.84 s | 15.8 | 310 MiB | ok |
| `rar-stored-movie` | 2.24 s | 130 ms | 34.0 | 364 ms | 4.1 | 2.12 s | 17.4 | 299 MiB | ok |
| `rar4-stored` | — | — | — | — | — | — | — | 278 MiB | **failed** |
| `rar4-inner-obfuscated` | 1.20 s | 95 ms | 39.3 | 309 ms | 18.1 | 1.94 s | 15.7 | 286 MiB | ok |
| `rar-identity-grouped` | 1.35 s | 231 ms | — | 506 ms | — | — | — | 292 MiB | ok |
| `rar4-obfuscated-volumes` | 1.57 s | 75 ms | 34.1 | 557 ms | 18.5 | 1.77 s | 16.8 | 305 MiB | ok |
| `rar-numeric-extensions` | 5.16 s | 216 ms | 37.7 | 318 ms | 28.7 | 1.59 s | 20.9 | 344 MiB | ok |
| `7z-plain-header` | 690 ms | 167 ms | 41.8 | 251 ms | 21.1 | 1.54 s | 13.1 | 322 MiB | ok |
| `7z-plain-large` | 3.71 s | 188 ms | 39.2 | 541 ms | 29.1 | 1.24 s | 18.5 | 322 MiB | ok |
| `7z-split-compressed-header` | 8.95 s | 164 ms | 20.9 | 315 ms | 19.2 | 1.84 s | 32.7 | 351 MiB | ok |
| `7z-header-encrypted` | 3.93 s | 195 ms | — | 396 ms | — | — | — | 346 MiB | ok |
| `rar-hdrenc-large` | 19.02 s | 140 ms | 33.3 | 354 ms | 24.5 | 1.70 s | 60.7 | 372 MiB | ok |
| `rar-hdrenc-obfuscated` | 4.13 s | 108 ms | 41.0 | 636 ms | 17.1 | 1.36 s | 25.5 | 421 MiB | ok |
| `7z-obfuscated-large` | — | — | — | — | — | — | — | 383 MiB | **failed** |
| `7z-obfuscated-hotd` | 3.21 s | 445 ms | 40.0 | 394 ms | 13.0 | 1.56 s | 16.1 | 385 MiB | ok |
| `rar-nested-iso` | 3.28 s | 188 ms | 29.3 | 442 ms | 19.8 | 1.83 s | 17.0 | 366 MiB | ok |
| `rar-inner-tree` | 5.58 s | 106 ms | 37.7 | 269 ms | 20.4 | 1.65 s | 20.1 | 374 MiB | ok |
| `rar-season-pack` | 18.80 s | 372 ms | 37.6 | 434 ms | 16.3 | 1.45 s | 35.3 | 323 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 271 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | 266 MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 280 MiB | **failed** |
| `huge-direct-pack` | 3.35 s | 38 ms | 43.0 | 523 ms | 17.1 | 1.39 s | 16.4 | 449 MiB | ok |
| `damaged-partial` | 2.44 s | 72 ms | 35.3 | 343 ms | 24.5 | 1.35 s | 16.7 | 312 MiB | ok |
| `damaged-severe` | 7.27 s | 113 ms | — | — | — | — | — | 299 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 308 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 308 MiB | **failed** |

<details><summary>Failures (8)</summary>

- `rar-hdrenc-small` (smoke): import failed: No importable videos found.
- `rar4-stored` (core): import failed: Unknown Rar Header: 15
- `7z-obfuscated-large` (core): import failed: Article with message-id KrRwGaSzEcDhQpBgNuSyNlYu-1638723981550@nyuu not found.
- `rar4-compressed` (negative): import failed: Only rar files with compression method m0 are supported.
- `rar5-mixed-compressed` (negative): import failed: Only rar files with compression method m0 are supported.
- `rar-encrypted-no-password` (negative): import failed: Encrypted Rar archive has no password specified.
- `dead-post` (failure): import failed: Article with message-id 29e3f45a729949fc84873e8c78e5e7f6@ngPost not found.
- `incomplete-archive-set` (failure): import failed: Only rar files with compression method m0 are supported.

</details>

### AltMount

`altmount` · Go · version `4b42c67` · serving: webdav · runtime: source · startup 554 ms

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 6.56 s | 298 ms | 40.2 | 471 ms | 28.5 | 1.99 s | 5.0 | 141 MiB | ok |
| `rar-named-small` | — | — | — | — | — | — | — | 148 MiB | **failed** |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 171 MiB | **failed** |
| `7z-obfuscated-small` | 5.93 s | 390 ms | 41.9 | 342 ms | 32.7 | 1.75 s | 8.1 | 180 MiB | ok |
| `plain-medium` | 2.55 s | 324 ms | 42.1 | 319 ms | 27.2 | 1.53 s | 5.1 | 218 MiB | ok |
| `plain-season-pack` | 16.41 s | 721 ms | 40.4 | 585 ms | 26.2 | 1.68 s | 6.8 | 345 MiB | ok |
| `rar-stored-movie` | 7.76 s | 561 ms | 37.9 | 425 ms | 9.7 | 1.64 s | 5.5 | 362 MiB | ok |
| `rar4-stored` | — | — | — | — | — | — | — | 393 MiB | **failed** |
| `rar4-inner-obfuscated` | 8.12 s | 509 ms | 31.0 | 677 ms | 27.0 | 1.78 s | 5.2 | 488 MiB | ok |
| `rar-identity-grouped` | 11.50 s | 477 ms | 22.9 | 851 ms | 4.3 | 2.88 s | 7.0 | 437 MiB | ok |
| `rar4-obfuscated-volumes` | 7.86 s | 298 ms | 18.3 | 721 ms | 0.6 | 2.74 s | 6.9 | 534 MiB | ok |
| `rar-numeric-extensions` | — | — | — | — | — | — | — | 638 MiB | **failed** |
| `7z-plain-header` | 2.81 s | 747 ms | 20.9 | 728 ms | 7.7 | 2.77 s | 6.0 | 735 MiB | ok |
| `7z-plain-large` | 8.68 s | 518 ms | 17.7 | 698 ms | 8.1 | 2.75 s | 9.5 | 704 MiB | ok |
| `7z-split-compressed-header` | 30.77 s | 347 ms | 37.2 | 446 ms | 0.4 | 3.74 s | 11.2 | 1402 MiB | ok |
| `7z-header-encrypted` | 13.02 s | 339 ms | — | — | — | — | — | 731 MiB | ok |
| `rar-hdrenc-large` | — | — | — | — | — | — | — | 1480 MiB | **failed** |
| `rar-hdrenc-obfuscated` | 31.35 s | 256 ms | 32.3 | 1.14 s | 13.0 | 3.01 s | 12.5 | 1491 MiB | ok |
| `7z-obfuscated-large` | 23.90 s | 543 ms | 22.7 | 829 ms | 17.3 | 2.08 s | 11.9 | 1494 MiB | ok |
| `7z-obfuscated-hotd` | 11.35 s | 676 ms | 23.2 | 505 ms | 12.2 | 1.69 s | 5.6 | 772 MiB | ok |
| `rar-nested-iso` | — | — | — | — | — | — | — | 888 MiB | **failed** |
| `rar-inner-tree` | — | — | — | — | — | — | — | 1085 MiB | **failed** |
| `rar-season-pack` | 25.91 s | 380 ms | 31.9 | 412 ms | 23.1 | 1.67 s | 8.7 | 1949 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 1073 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | 745 MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 1161 MiB | **failed** |
| `huge-direct-pack` | 34.61 s | 475 ms | 40.0 | 549 ms | 30.8 | 1.48 s | 12.3 | 1612 MiB | ok |
| `damaged-partial` | 3.85 s | 267 ms | 22.2 | 917 ms | 13.9 | 3.35 s | 5.4 | 947 MiB | ok |
| `damaged-severe` | 22.95 s | 612 ms | — | — | — | — | — | 878 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 916 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 965 MiB | **failed** |

<details><summary>Failures (12)</summary>

- `rar-named-small` (smoke): import failed: failed to iterate RAR archive "Gilmore.Girls.2000.S01E17.1080p.NF.WEB-DL.H264.SDR.DDP.2.0.English-HONE.part01.rar": rardecode: bad volume number
- `rar-hdrenc-small` (smoke): import failed: archive contains no files with allowed extensions (found: [(no extension)], allowed: [.mkv .mp4 .avi .ts .m4v .mov .wmv .mpg .mpeg .xvid .rm .rmvb .asf .asx .wtv .mk3d .dvr-ms .mp3 .flac .m4a .epub .pdf .cbz])
- `rar4-stored` (core): import failed: failed to iterate RAR archive "Dont.Be.Afraid.of.the.Dark.2010.BRRip.XviD-F0RFUN.rar": All attempts fail: #1: nntp: yEnc CRC mismatch #2: nntp: yEnc CRC mismatch
- `rar-numeric-extensions` (core): import failed: no files were successfully processed (all files failed validation)
- `rar-hdrenc-large` (core): import failed: archive contains no files with allowed extensions (found: [.bdmv .clpi .m2ts .mpls .xml .jpg], allowed: [.mkv .mp4 .avi .ts .m4v .mov .wmv .mpg .mpeg .xvid .rm .rmvb .asf .asx .wtv .mk3d .dvr-ms .mp3 .flac .m4a .epub .pdf .cbz])
- `rar-nested-iso` (core): import failed: archive contains no files with allowed extensions (found: [.m2ts], allowed: [.mkv .mp4 .avi .ts .m4v .mov .wmv .mpg .mpeg .xvid .rm .rmvb .asf .asx .wtv .mk3d .dvr-ms .mp3 .flac .m4a .epub .pdf .cbz])
- `rar-inner-tree` (core): no video found under /bench/rar-inner-tree
- `rar4-compressed` (negative): import failed: no files were successfully processed (all files failed validation)
- `rar5-mixed-compressed` (negative): import failed: compressed files are not supported: Undercover.Lover.S01E04.DUTCH.1080p.WEB.h264-SOLEM/Undercover.Lover.S01E04.DUTCH.1080p.WEB.h264-SOLEM.mkv (uses rar5.0 compression)
- `rar-encrypted-no-password` (negative): import failed: failed to iterate RAR archive "pB2nvBcqwqGbAiF87F6oE.part001.rar": rardecode: archive encrypted, password required
- `dead-post` (failure): import failed: fast-fail segment check failed: no regular files were successfully processed (all files failed validation)
- `incomplete-archive-set` (failure): import failed: compressed files are not supported: The Falcon And The Winter Soldier S01 2160p WEB-DL HDR 10bit x265 HEVC DDP5 1 Atmos-PHOCiS/The Falcon And The Winter Soldier S01E01 2160p WEB-DL HDR 10bit x265 HEVC DDP5 1 Atmos-PHOCiS.mkv (uses rar5.0 compression)

</details>

### AIOStreams

`aiostreams` · TypeScript · version `9e59c4a` · serving: http-range · runtime: source · startup 7.78 s

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 1.08 s | 199 ms | 47.2 | 517 ms | 29.4 | 1.44 s | 8.8 | 386 MiB | ok |
| `rar-named-small` | 807 ms | 168 ms | 46.0 | 326 ms | 31.2 | 1.33 s | 5.4 | 406 MiB | ok |
| `rar-hdrenc-small` | 794 ms | 338 ms | 46.8 | 38 ms | 41.7 | 262 ms | 9.8 | 470 MiB | ok |
| `7z-obfuscated-small` | 871 ms | 184 ms | 53.6 | 23 ms | — | 185 ms | 8.9 | 502 MiB | ok |
| `plain-medium` | 301 ms | 118 ms | 45.8 | 137 ms | 23.5 | 1.36 s | 9.3 | 538 MiB | ok |
| `plain-season-pack` | 707 ms | 199 ms | 45.5 | 222 ms | 19.4 | 2.07 s | 16.6 | 504 MiB | ok |
| `rar-stored-movie` | 580 ms | 408 ms | 41.7 | 650 ms | 15.2 | 2.40 s | 8.7 | 558 MiB | ok |
| `rar4-stored` | 281 ms | 172 ms | 42.7 | 516 ms | 40.0 | 1.42 s | 7.8 | 551 MiB | ok |
| `rar4-inner-obfuscated` | 798 ms | 232 ms | 41.6 | 555 ms | 26.2 | 1.48 s | 6.1 | 529 MiB | ok |
| `rar-identity-grouped` | 1.59 s | 1.12 s | 47.5 | 549 ms | 26.7 | 1.37 s | 7.6 | 555 MiB | ok |
| `rar4-obfuscated-volumes` | 1.36 s | 203 ms | 28.7 | 404 ms | 23.1 | 1.86 s | 7.5 | 521 MiB | ok |
| `rar-numeric-extensions` | 3.57 s | 326 ms | 43.1 | 567 ms | 33.4 | 1.60 s | 7.8 | 516 MiB | ok |
| `7z-plain-header` | 540 ms | 207 ms | 43.2 | 551 ms | 2.2 | 1.93 s | 6.7 | 519 MiB | ok |
| `7z-plain-large` | 620 ms | 225 ms | 43.6 | 559 ms | 9.8 | 1.75 s | 6.8 | 532 MiB | ok |
| `7z-split-compressed-header` | 654 ms | 325 ms | 38.1 | 503 ms | 30.5 | 1.70 s | 7.2 | 557 MiB | ok |
| `7z-header-encrypted` | 563 ms | 209 ms | 41.5 | 465 ms | 20.6 | 1.99 s | 13.2 | 621 MiB | ok |
| `rar-hdrenc-large` | 5.69 s | 397 ms | 44.4 | 519 ms | 30.2 | 1.31 s | 13.9 | 664 MiB | ok |
| `rar-hdrenc-obfuscated` | 2.04 s | 448 ms | 42.2 | 813 ms | 25.2 | 1.49 s | 13.1 | 708 MiB | ok |
| `7z-obfuscated-large` | 12.46 s | 303 ms | 46.6 | 572 ms | 32.7 | 1.42 s | 9.9 | 717 MiB | ok |
| `7z-obfuscated-hotd` | 1.90 s | 291 ms | 47.1 | 305 ms | 17.4 | 1.81 s | 12.6 | 785 MiB | ok |
| `rar-nested-iso` | 695 ms | 605 ms | 34.1 | 568 ms | 26.9 | 1.50 s | 8.3 | 786 MiB | ok |
| `rar-inner-tree` | 2.99 s | 778 ms | 49.9 | 285 ms | 23.6 | 2.06 s | 8.1 | 834 MiB | ok |
| `rar-season-pack` | 2.45 s | 72 ms | 42.2 | 339 ms | 31.0 | 1.86 s | 7.8 | 803 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | — MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | 800 MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | — MiB | **failed** |
| `huge-direct-pack` | 2.30 s | 981 ms | 38.8 | 161 ms | 32.4 | 1.45 s | 10.8 | 1090 MiB | ok |
| `damaged-partial` | 1.86 s | 157 ms | 45.0 | 525 ms | 33.5 | 1.77 s | 6.6 | 982 MiB | ok |
| `damaged-severe` | 4.01 s | 389 ms | — | — | — | — | — | 910 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 903 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 905 MiB | **failed** |

<details><summary>Failures (5)</summary>

- `rar4-compressed` (negative): import failed: Archive is compressed: not streamable [archive_compressed]
- `rar5-mixed-compressed` (negative): import failed: Archive is compressed: not streamable [archive_compressed]
- `rar-encrypted-no-password` (negative): import failed: Archive is encrypted: password required [archive_encrypted]
- `dead-post` (failure): import failed: Missing on providers: 8/8 sampled segments unavailable (incomplete or removed) [missing_on_providers]
- `incomplete-archive-set` (failure): import failed: Archive incomplete: volumes missing from the post [incomplete_archive]

</details>

### Comet (feat/usenet)

`comet` · Python + Rust · version `ed1ede7` (`ed1ede7`) · serving: http-range · runtime: docker · CPU/RSS from container cgroups · startup 99.64 s

> **Not a like-for-like result.** Comet does not complete a full-corpus pass: its engine keeps materialising after the harness has measured an entry, and under sustained load it deadlocks its own SQLite (shipped default) and does not recover. Entries after the first large materialisation failed for reasons belonging to earlier ones. Only the six status-clip failures that reproduced across independent runs are capability results.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | — | — | — | — | — | — | — | 340 MiB | **failed** |
| `rar-named-small` | 2.67 s | 199 ms | 8.3 | 393 ms | 1.2 | 2.79 s | 62.4 | 740 MiB | ok |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 730 MiB | **failed** |
| `7z-obfuscated-small` | — | — | — | — | — | — | — | 682 MiB | **failed** |
| `plain-medium` | 6.05 s | 92 ms | 16.5 | 365 ms | 1.2 | 3.93 s | 52.4 | 797 MiB | ok |
| `plain-season-pack` | 4.25 s | 52 ms | 18.7 | 799 ms | 1.2 | 6.68 s | 55.0 | 800 MiB | ok |
| `rar-stored-movie` | 2.94 s | 201 ms | 22.2 | 435 ms | 1.3 | 5.82 s | 55.2 | 800 MiB | ok |
| `rar4-stored` | — | — | — | — | — | — | — | 727 MiB | **failed** |
| `rar4-inner-obfuscated` | 1.63 s | 186 ms | 13.9 | 524 ms | 2.0 | 2.19 s | 51.0 | 798 MiB | ok |
| `rar-identity-grouped` | — | — | — | — | — | — | — | — MiB | **failed** |
| `rar4-obfuscated-volumes` | — | — | — | — | — | — | — | 706 MiB | **failed** |
| `rar-numeric-extensions` | 6.36 s | 1.98 s | 26.4 | 544 ms | 1.0 | 3.74 s | 67.6 | 860 MiB | ok |
| `7z-plain-header` | 1.35 s | 219 ms | 28.5 | 450 ms | 1.0 | 2.41 s | 41.9 | 872 MiB | ok |
| `7z-plain-large` | 3.76 s | 265 ms | 22.1 | 434 ms | 1.2 | 3.13 s | 47.7 | 891 MiB | ok |
| `7z-split-compressed-header` | 10.35 s | 882 ms | 14.8 | 527 ms | 0.7 | 5.83 s | 75.0 | 881 MiB | ok |
| `7z-header-encrypted` | 3.43 s | 254 ms | — | 527 ms | — | — | — | 875 MiB | ok |
| `rar-hdrenc-large` | — | — | — | — | — | — | — | 1613 MiB | **failed** |
| `rar-hdrenc-obfuscated` | — | — | — | — | — | — | — | 1455 MiB | **failed** |
| `7z-obfuscated-large` | — | — | — | — | — | — | — | 1356 MiB | **failed** |
| `7z-obfuscated-hotd` | — | — | — | — | — | — | — | — MiB | **failed** |
| `rar-nested-iso` | — | — | — | — | — | — | — | 1486 MiB | **failed** |
| `rar-inner-tree` | — | — | — | — | — | — | — | 3458 MiB | **failed** |
| `rar-season-pack` | — | — | — | — | — | — | — | 1567 MiB | **failed** |
| `rar4-compressed` | — | — | — | — | — | — | — | — MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | — MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | — MiB | **failed** |
| `huge-direct-pack` | — | — | — | — | — | — | — | — MiB | **failed** |
| `damaged-partial` | — | — | — | — | — | — | — | — MiB | **failed** |
| `damaged-severe` | — | — | — | — | — | — | — | — MiB | **failed** |
| `dead-post` | — | — | — | — | — | — | — | — MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | — MiB | **failed** |

<details><summary>Failures (21)</summary>

- `plain-small` (smoke): comet answered with a status clip (421667 bytes of video/mp4), meaning it could not serve this entry
- `rar-hdrenc-small` (smoke): comet answered with a status clip (421667 bytes of video/mp4), meaning it could not serve this entry
- `7z-obfuscated-small` (smoke): comet answered with a status clip (421667 bytes of video/mp4), meaning it could not serve this entry
- `rar4-stored` (core): comet answered with a status clip (421667 bytes of video/mp4), meaning it could not serve this entry
- `rar-identity-grouped` (core): comet answered with a status clip (421667 bytes of video/mp4), meaning it could not serve this entry
- `rar4-obfuscated-volumes` (core): comet answered with a status clip (421667 bytes of video/mp4), meaning it could not serve this entry
- `rar-hdrenc-large` (core): fetch failed
- `rar-hdrenc-obfuscated` (core): comet never produced a byte range for rar-hdrenc-obfuscated: last response 500 ct=text/plain; charset=utf-8
- `7z-obfuscated-large` (core): comet answered with a status clip (421667 bytes of video/mp4), meaning it could not serve this entry
- `7z-obfuscated-hotd` (core): comet answered with a status clip (421667 bytes of video/mp4), meaning it could not serve this entry
- `rar-nested-iso` (core): fetch failed
- `rar-inner-tree` (core): fetch failed
- `rar-season-pack` (core): fetch failed
- `rar4-compressed` (negative): fetch failed
- `rar5-mixed-compressed` (negative): fetch failed
- `rar-encrypted-no-password` (negative): fetch failed
- `huge-direct-pack` (stress): fetch failed
- `damaged-partial` (failure): fetch failed
- `damaged-severe` (failure): fetch failed
- `dead-post` (failure): fetch failed
- `incomplete-archive-set` (failure): fetch failed

</details>

### InfiniDysk

`infinidysk` · C# (.NET 10) · version `1f9f45b` · serving: webdav · runtime: source · startup 7.60 s

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 3.32 s | 206 ms | 10.0 | 26 ms | 2.0 | 2.68 s | 46.7 | 509 MiB | ok |
| `rar-named-small` | 1.78 s | 182 ms | 12.6 | 14 ms | 0.2 | 3.20 s | 22.8 | 527 MiB | ok |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 536 MiB | **failed** |
| `7z-obfuscated-small` | 1.66 s | 27 ms | 16.4 | 844 ms | 20.7 | 2.37 s | 15.7 | 544 MiB | ok |
| `plain-medium` | 1.04 s | 26 ms | 22.7 | 17 ms | 2.1 | 3.11 s | 18.8 | 745 MiB | ok |
| `plain-season-pack` | 4.03 s | 20 ms | 7.3 | 29 ms | 1.6 | 3.99 s | 34.3 | 865 MiB | ok |
| `rar-stored-movie` | 1.86 s | 45 ms | 7.9 | 19 ms | 1.1 | 7.01 s | 34.6 | 885 MiB | ok |
| `rar4-stored` | — | — | — | — | — | — | — | 802 MiB | **failed** |
| `rar4-inner-obfuscated` | 6.30 s | 121 ms | 18.0 | 19 ms | 4.9 | 2.30 s | 14.0 | 802 MiB | ok |
| `rar-identity-grouped` | 3.64 s | 17 ms | 7.8 | 26 ms | 0.5 | 2.69 s | 26.5 | 868 MiB | ok |
| `rar4-obfuscated-volumes` | 2.90 s | 21 ms | 12.3 | 20 ms | 1.6 | 4.43 s | 23.6 | 876 MiB | ok |
| `rar-numeric-extensions` | 4.74 s | 32 ms | 7.8 | 4.54 s | 1.8 | 7.47 s | 80.3 | 943 MiB | ok |
| `7z-plain-header` | 1.12 s | 13 ms | 14.5 | 18 ms | 2.7 | 2.99 s | 20.8 | 841 MiB | ok |
| `7z-plain-large` | 13.96 s | 20 ms | 14.3 | 32 ms | 0.4 | 3.15 s | 35.4 | 879 MiB | ok |
| `7z-split-compressed-header` | 41.05 s | 29 ms | 10.3 | 36 ms | 1.3 | 3.97 s | 33.5 | 976 MiB | ok |
| `7z-header-encrypted` | 11.50 s | 26 ms | 16.9 | 27 ms | 1.4 | 2.60 s | 25.5 | 881 MiB | ok |
| `rar-hdrenc-large` | 18.60 s | 28 ms | 11.9 | 33 ms | 2.6 | 3.03 s | 37.0 | 1147 MiB | ok |
| `rar-hdrenc-obfuscated` | 3.00 s | 1.52 s | 12.2 | 53 ms | 1.1 | 1.69 s | 24.1 | 1108 MiB | ok |
| `7z-obfuscated-large` | — | — | — | — | — | — | — | 1149 MiB | **failed** |
| `7z-obfuscated-hotd` | 11.51 s | 27 ms | 11.3 | 21 ms | 2.0 | 2.79 s | 23.6 | 1237 MiB | ok |
| `rar-nested-iso` | 3.41 s | 111 ms | 9.0 | 2.54 s | 8.8 | 3.02 s | 28.8 | 1190 MiB | ok |
| `rar-inner-tree` | 5.31 s | 4 ms | 14.7 | 20 ms | 4.2 | 3.59 s | 32.3 | 1269 MiB | ok |
| `rar-season-pack` | 21.75 s | 4 ms | 28.3 | 19 ms | 1.6 | 1.52 s | 24.1 | 1274 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 1178 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | 1178 MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 1197 MiB | **failed** |
| `huge-direct-pack` | 5.66 s | 16 ms | 20.2 | 24 ms | 4.1 | 3.31 s | 31.4 | 1569 MiB | ok |
| `damaged-partial` | 2.68 s | 39 ms | 7.0 | 1.49 s | 1.2 | 1.89 s | 27.5 | 1555 MiB | ok |
| `damaged-severe` | — | — | — | — | — | — | — | 1522 MiB | **failed** |
| `dead-post` | — | — | — | — | — | — | — | 1524 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 1532 MiB | **failed** |

<details><summary>Failures (9)</summary>

- `rar-hdrenc-small` (smoke): import failed: No importable media files found.
- `rar4-stored` (core): import failed: The decoded yEnc CRC32 was 2ebc210a, but the trailer expected 39ab5444.
- `7z-obfuscated-large` (core): import failed: Article with message-id KrRwGaSzEcDhQpBgNuSyNlYu-1638723981550@nyuu not found. Server responded: 430 No Such Article
- `rar4-compressed` (negative): import failed: Only rar files with compression method m0 are supported.
- `rar5-mixed-compressed` (negative): import failed: Only rar files with compression method m0 are supported.
- `rar-encrypted-no-password` (negative): import failed: Encrypted Rar archive has no password specified.
- `damaged-severe` (failure): import failed: Article with message-id xcecGBQnwBIYE.8fjOSbt$yhomo1x1@4Zkt8fJ.3J168q not found. Server responded: 430 No Such Article
- `dead-post` (failure): import failed: Missing articles: 1 important file(s) have missing segments across all providers (e.g. OB7ucO5ujqhRQOnlY.part08.rar). NZB is likely DMCA'd or expired.
- `incomplete-archive-set` (failure): import failed: Only rar files with compression method m0 are supported.

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