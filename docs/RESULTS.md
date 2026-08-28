# NZB streaming benchmark

**Run** `2026-08-28T17-17-43-886Z` · started 2026-08-28T17:17:43.886Z · finished 2026-08-28T20:14:46.336Z

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

> **The link is the largest source of error here, and it is not controlled.** These
> runs are made over consumer Wi-Fi to a commercial provider, and both vary on their
> own. Repeating a pass with nothing changed but the clock has moved the whole-run
> median by 14% and individual entries by 55%, and one measured evening had a single
> post served at 9 MB/s by `raw` while others on the same connection ran at 45 MB/s.
> Provider variance is per post, not per session: which entries are slow changes from
> run to run, so a low number for one entry is not a property of the application.
> Treat differences under roughly 20% between applications, or under 50% on a single
> entry, as unresolved by one pass. Only repeated runs can separate the two.

### Applications measured

| App | Runtime | Language | Version | Serving | Startup |
|---|---|---|---|---|---:|
| **AIOStreams** | source | TypeScript | `7a4fdda` | http-range | 9.95 s |
| **nzbdavex** | source | C# (.NET 10) | `312d3bc` | webdav | 4.01 s |
| **nzbdav** | source | C# (.NET 10) | `794948b` | webdav | 3.09 s |
| **StremThru (newz)** | source | Go | `227c508` | http-range | 1.74 s |
| **Decypharr** | docker | Go | `v2.5` (`0dd1cbb`) | webdav | 2.81 s |
| **raw NNTP baseline** | source | JavaScript (this harness) | `harness-builtin` | http-range | 2 ms |
| **StreamNZB** | source | Go | `9b577f7` | http-range | 1.45 s |
| **AltMount** | source | Go | `3ed4c47` | webdav | 306 ms |
| **InfiniDysk** | source | C# (.NET 10) | `aa83ef3` | webdav | 6.76 s |

### Run settings

| Setting | Value |
|---|---|
| Sequential read | 244 MiB cap / 30s cap |
| Seek points | 1%, 25%, 50%, 75%, 95% + backward |
| Seek read | 8 MiB |
| Playback sim | 30s @ 25 Mbps |
| Integrity samples | 3 |
| Item timeout | 600s |

## Summary

Every median below is taken over **the same 17 entries for every**
**application**: the perf-tier entries (`smoke`, `core`, `stress`) that at least
8 of the 9 applications served. Median post size across that set is
25.3 GiB.

> **Why a quorum and not the entries all of them served.** That strict intersection
> is 10 entries here, and it is defined by the weakest application in the field:
> one broken engine collapses the population for everybody, and the set moves between
> runs as the field changes. A quorum keeps it wide and stable. Where an application
> missed one of the 17, its `n` column says so.

Entries: `plain-small`, `rar-named-small`, `plain-medium`, `plain-season-pack`, `rar-stored-movie`, `rar4-inner-obfuscated`, `rar-identity-grouped`, `rar4-obfuscated-volumes`, `7z-plain-header`, `7z-plain-large`, `7z-split-compressed-header`, `7z-header-encrypted`, `7z-obfuscated-hotd`, `rar-nested-iso`, `rar-inner-tree`, `rar-season-pack`, `huge-direct-pack`.

### Verdict

*Correct* is not *served*. Six corpus entries are built to be unservable: three
`negative` (compressed archives, no password) and three `failure` (dead post,
severe damage, missing volumes). Refusing those is the right answer, and serving
one means emitting bytes that cannot be the media, which is a worse result than
refusing, not a better one.

| App | Served | Capability gaps | Correctly refused | **Wrongly served** |
|---|---:|---:|---:|---:|
| **AIOStreams** | 25/25 | 0 | 5/6 | **1** |
| **nzbdavex** | 23/25 | 2 | 5/6 | **1** |
| **nzbdav** | 22/25 | 3 | 5/6 | **1** |
| **StremThru (newz)** | 21/25 | 4 | 6/6 | 0 |
| **Decypharr** | 18/25 | 7 | 5/6 | **1** |
| **raw NNTP baseline** | 25/25 | 0 | 1/6 | **5** |
| **StreamNZB** | 20/25 | 5 | 5/6 | **1** |
| **AltMount** | 18/25 | 7 | 5/6 | **1** |
| **InfiniDysk** | 22/25 | 3 | 6/6 | 0 |

A *capability gap* is the number that ranks engines: entries that should stream
and did not. `raw` is not an application and its row is not a verdict: it serves
outer volume bytes without opening an archive, so it "wrongly serves" entries no
player could open. That is the point of the baseline, not a defect in it.

### Time to picture

| App | n | Click&rarr;byte | Import | Cold TTFB | Warm TTFB |
|---|---:|---:|---:|---:|---:|
| **AIOStreams** | 17/17 | **1.12 s** | 913 ms | 97 ms | 1 ms |
| **nzbdavex** | 17/17 | **2.76 s** | 2.68 s | 144 ms | 122 ms |
| **nzbdav** | 17/17 | **3.05 s** | 3.01 s | 57 ms | 198 ms |
| **StremThru (newz)** | 17/17 | **2.62 s** | 2.39 s | 233 ms | 198 ms |
| **Decypharr** | 14/17 | **4.68 s** | 4.49 s | 257 ms | 2 ms |
| **raw NNTP baseline** | 17/17 | **488 ms** | 173 ms | 255 ms | 405 ms |
| **StreamNZB** | 16/17 | **2.66 s** | 94 ms | 1.82 s | 5 ms |
| **AltMount** | 14/17 | **3.91 s** | 3.75 s | 234 ms | 328 ms |
| **InfiniDysk** | 17/17 | **3.03 s** | 2.99 s | 18 ms | 2 ms |

*Click&rarr;byte* is import + cold open: what a viewer waits through after pressing
play, and the only one of these three that is comparable. Every application here but
one inspects the post at import and then answers the first byte quickly, so import is
over 80% of the wait. StreamNZB is the exception: it returns a session in
milliseconds and does the same work on first byte, which is why its import reads as
free and its cold TTFB does not. Serving mode does not predict this, since AIOStreams
answers byte ranges like StreamNZB and still front-loads like the mount-style
applications. *Warm TTFB* is the same open repeated, so it measures what the engine
cached rather than what it can do cold.

### Streaming and seeks

| App | Seq MB/s | p05 MB/s | Full seek | Seek TTFB | Worst seek |
|---|---:|---:|---:|---:|---:|
| **AIOStreams** | 48.0 | **23.0** | **567 ms** | 151 ms | 284 ms |
| **nzbdavex** | 40.9 | **20.8** | **741 ms** | 212 ms | 342 ms |
| **nzbdav** | 42.6 | **11.9** | **645 ms** | 286 ms | 444 ms |
| **StremThru (newz)** | 33.7 | **20.1** | **921 ms** | 417 ms | 727 ms |
| **Decypharr** | 35.7 | **13.6** | **716 ms** | 325 ms | 587 ms |
| **raw NNTP baseline** | 25.8 | **4.2** | **591 ms** | 314 ms | 403 ms |
| **StreamNZB** | 34.7 | **18.3** | **691 ms** | 262 ms | 643 ms |
| **AltMount** | 39.4 | **26.2** | **762 ms** | 384 ms | 676 ms |
| **InfiniDysk** | 23.8 | **1.8** | **1.34 s** | 17 ms | 28 ms |

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
| **AIOStreams** | **4.7** | 0.4 | 0.4 | 48% |
| **nzbdavex** | **30.8** | 1.8 | 2.6 | 35% |
| **nzbdav** | **16.7** | 0.9 | 1.3 | 31% |
| **StremThru (newz)** | **24.4** | 1.3 | 1.6 | 21% |
| **Decypharr** | **26.7** | 0.9 | 1.0 | 60% |
| **raw NNTP baseline** | **28.1** | 0.7 | 0.8 | 58% |
| **StreamNZB** | **6.2** | 0.4 | 0.5 | 40% |
| **AltMount** | **4.2** | 0.2 | 0.3 | 36% |
| **InfiniDysk** | **10.8** | 0.4 | 0.5 | 50% |

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
| **AIOStreams** | 499 MiB | **805 MiB** | 1108 MiB | 29 entries | +242 MiB | 1010 MiB |
| **nzbdavex** | 135 MiB | **504 MiB** | 1261 MiB | 31 entries | -20 MiB | 424 MiB |
| **nzbdav** | 118 MiB | **315 MiB** | 470 MiB | 29 entries | +49 MiB | 309 MiB |
| **StremThru (newz)** | 83 MiB | **896 MiB** | 2129 MiB | 31 entries | +580 MiB | 1070 MiB |
| **Decypharr** | 41 MiB | **435 MiB** | 1923 MiB | 31 entries | +1309 MiB | 1760 MiB |
| **raw NNTP baseline** | 511 MiB | **684 MiB** | 956 MiB | 29 entries | +180 MiB | 825 MiB |
| **StreamNZB** | 51 MiB | **542 MiB** | 732 MiB | 28 entries | +168 MiB | 706 MiB |
| **AltMount** | 34 MiB | **766 MiB** | 2026 MiB | 29 entries | +618 MiB | 891 MiB |
| **InfiniDysk** | 167 MiB | **943 MiB** | 1578 MiB | 30 entries | +393 MiB | 1180 MiB |

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

| Entry | Tier | AIOStreams | nzbdavex | nzbdav | StremThru (newz) | Decypharr | raw NNTP baseline | StreamNZB | AltMount | InfiniDysk |
|---|---|---|---|---|---|---|---|---|---|---|
| `plain-small` | smoke | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `rar-named-small` | smoke | pass | pass | pass | pass | pass | pass | pass | **FAIL** | pass |
| `rar-hdrenc-small` | smoke | pass | **FAIL** | **FAIL** | **FAIL** | **FAIL** | pass | pass | **FAIL** | **FAIL** |
| `7z-obfuscated-small` | smoke | pass | pass | pass | pass | **FAIL** | pass | **FAIL** | pass | pass |
| `plain-medium` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `plain-season-pack` | core | pass | pass | pass | pass | **FAIL** | pass | pass | pass | pass |
| `rar-stored-movie` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `rar4-stored` | core | pass | pass | **FAIL** | **FAIL** | pass | pass | pass | **FAIL** | **FAIL** |
| `rar4-inner-obfuscated` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `rar-identity-grouped` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `rar4-obfuscated-volumes` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `rar-numeric-extensions` | core | pass | pass | pass | pass | pass | pass | **FAIL** | **FAIL** | pass |
| `7z-plain-header` | core | pass | pass | pass | pass | pass | pass | **FAIL** | pass | pass |
| `7z-plain-large` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `7z-split-compressed-header` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `7z-header-encrypted` | core | pass | pass | pass | pass | **FAIL** | pass | pass | pass | pass |
| `rar-hdrenc-large` | core | pass | pass | pass | pass | **FAIL** | pass | pass | **FAIL** | pass |
| `rar-hdrenc-obfuscated` | core | pass | pass | pass | **FAIL** | **FAIL** | pass | **FAIL** | pass | pass |
| `7z-obfuscated-large` | core | pass | **FAIL** | **FAIL** | **FAIL** | pass | pass | **FAIL** | pass | **FAIL** |
| `7z-obfuscated-hotd` | core | pass | pass | pass | pass | **FAIL** | pass | pass | pass | pass |
| `rar-nested-iso` | core | pass | pass | pass | pass | pass | pass | pass | **FAIL** | pass |
| `rar-inner-tree` | core | pass | pass | pass | pass | pass | pass | pass | **FAIL** | pass |
| `rar-season-pack` | core | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `rar4-compressed` | negative | refused | refused | refused | refused | refused | **served** | refused | refused | refused |
| `rar5-mixed-compressed` | negative | refused | refused | refused | refused | refused | **served** | refused | refused | refused |
| `rar-encrypted-no-password` | negative | refused | refused | refused | refused | refused | **served** | refused | refused | refused |
| `huge-direct-pack` | stress | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `damaged-partial` | failure | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `damaged-severe` | failure | **served** | **served** | **served** | refused | **served** | **served** | **served** | **served** | refused |
| `dead-post` | failure | refused | refused | refused | refused | refused | refused | refused | refused | refused |
| `incomplete-archive-set` | failure | refused | refused | refused | refused | refused | **served** | refused | refused | refused |

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
| `7z-header-encrypted` | AIOStreams | 2 | **1** |
| `7z-header-encrypted` | nzbdavex | 2 | **1** |
| `rar-hdrenc-large` | StreamNZB | 0 | **1** |
| `rar-nested-iso` | Decypharr | 0 | **1** |
| `rar-inner-tree` | StreamNZB | 0 | **1** |
| `rar-season-pack` | StreamNZB | 0 | **1** |

160 of 172 app-entry pairs matched consensus exactly.

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
| AIOStreams | **zero-filled** | all zeros | 2,097,152 (61) | yes | 4.51× |
| AltMount | **zero-filled** | all zeros | 716,800 (61) | yes | 8.23× |
| Decypharr | **error-at-hole** | `stream aborted after 0 bytes: terminated` | — | yes | — |
| InfiniDysk | **zero-filled** | `HTTP 404: ` | 716,800 (61) | yes | 2.23× |
| nzbdav | **truncated-at-hole** | `HTTP 404: ` | — | yes | — |
| nzbdavex | **zero-filled** | all zeros | 712,492 (61) | yes | 4.26× |
| raw NNTP baseline | _not addressable_ | — | — | — | — |
| StreamNZB | **zero-filled** | all zeros | 716,800 (61) | yes | 1.61× |
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

### AIOStreams

`aiostreams` · TypeScript · version `7a4fdda` · serving: http-range · runtime: source · startup 9.95 s

**Own set**: 24 entries, median post 26.3 GiB · click&rarr;byte 1.17 s (shared population: 1.12 s, 0.95×) · seq 48.0 MB/s · CPU 4.9 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 1.08 s | 96 ms | 47.9 | 159 ms | 26.7 | 1.57 s | 10.9 | 679 MiB | ok |
| `rar-named-small` | 807 ms | 58 ms | 65.9 | 123 ms | 21.4 | 2.11 s | 4.0 | 702 MiB | ok |
| `rar-hdrenc-small` | 536 ms | 3 ms | 50.1 | 6 ms | 28.7 | 289 ms | 4.6 | 758 MiB | ok |
| `7z-obfuscated-small` | 802 ms | 3 ms | 48.7 | 7 ms | — | 156 ms | 5.1 | 784 MiB | ok |
| `plain-medium` | 283 ms | 237 ms | 55.8 | 130 ms | 48.2 | 1.14 s | 4.0 | 805 MiB | ok |
| `plain-season-pack` | 913 ms | 546 ms | 62.3 | 123 ms | 22.7 | 1.96 s | 4.1 | 829 MiB | ok |
| `rar-stored-movie` | 595 ms | 132 ms | 42.6 | 118 ms | 13.4 | 1.70 s | 5.8 | 786 MiB | ok |
| `rar4-stored` | 2.36 s | 78 ms | 47.3 | 178 ms | 6.4 | 1.50 s | 5.4 | 777 MiB | ok |
| `rar4-inner-obfuscated` | 528 ms | 71 ms | 62.9 | 203 ms | 18.7 | 1.83 s | 5.7 | 741 MiB | ok |
| `rar-identity-grouped` | 1.33 s | 90 ms | 48.0 | 151 ms | 6.8 | 1.95 s | 4.8 | 742 MiB | ok |
| `rar4-obfuscated-volumes` | 1.07 s | 98 ms | 55.4 | 111 ms | 26.5 | 1.88 s | 4.4 | 742 MiB | ok |
| `rar-numeric-extensions` | 2.23 s | 179 ms | 50.9 | 156 ms | 15.8 | 1.37 s | 4.6 | 758 MiB | ok |
| `7z-plain-header` | 534 ms | 6 ms | 64.9 | 105 ms | 18.2 | 1.66 s | 3.8 | 788 MiB | ok |
| `7z-plain-large` | 614 ms | 58 ms | 64.8 | 110 ms | 27.1 | 1.79 s | 4.7 | 747 MiB | ok |
| `7z-split-compressed-header` | 687 ms | 97 ms | 45.1 | 226 ms | 22.5 | 2.14 s | 4.6 | 763 MiB | ok |
| `7z-header-encrypted` | 1.11 s | 10 ms | 48.0 | 211 ms | 17.6 | 2.31 s | 5.5 | 781 MiB | ok |
| `rar-hdrenc-large` | 5.70 s | 157 ms | 48.1 | 157 ms | 17.7 | 2.17 s | 5.9 | 825 MiB | ok |
| `rar-hdrenc-obfuscated` | 2.08 s | 258 ms | 47.9 | 184 ms | 26.3 | 1.81 s | 5.1 | 849 MiB | ok |
| `7z-obfuscated-large` | 11.17 s | 105 ms | 45.3 | 196 ms | 26.0 | 1.70 s | 5.4 | 825 MiB | ok |
| `7z-obfuscated-hotd` | 1.93 s | 30 ms | 38.3 | 169 ms | 29.1 | 1.65 s | 4.2 | 814 MiB | ok |
| `rar-nested-iso` | 388 ms | 156 ms | 43.3 | 222 ms | 25.0 | 1.68 s | 4.7 | 810 MiB | ok |
| `rar-inner-tree` | 3.25 s | 309 ms | 35.9 | 222 ms | 17.6 | 2.58 s | 6.4 | 866 MiB | ok |
| `rar-season-pack` | 1.91 s | 259 ms | 38.6 | 259 ms | 9.2 | 1.41 s | 5.4 | 894 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 898 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | — | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | — | **failed** |
| `huge-direct-pack` | 2.29 s | 886 ms | 31.3 | 99 ms | 16.3 | 1.78 s | 7.2 | 1108 MiB | ok |
| `damaged-partial` | 1.87 s | 195 ms | 40.9 | 169 ms | 16.1 | 2.08 s | 4.8 | 1072 MiB | ok |
| `damaged-severe` | 4.54 s | 134 ms | — | — | — | — | — | 1031 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 1019 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 1023 MiB | **failed** |

<details><summary>Failures (5)</summary>

- `rar4-compressed` (negative): import failed: Archive is compressed: not streamable [archive_compressed]
- `rar5-mixed-compressed` (negative): import failed: Archive is compressed: not streamable [archive_compressed]
- `rar-encrypted-no-password` (negative): import failed: Archive is encrypted: password required [archive_encrypted]
- `dead-post` (failure): import failed: Missing on all providers: incomplete or removed [missing_on_providers]
- `incomplete-archive-set` (failure): import failed: Archive incomplete: volumes missing from the post [incomplete_archive]

</details>

### nzbdavex

`nzbdavex` · C# (.NET 10) · version `312d3bc` · serving: webdav · runtime: source · startup 4.01 s

**Own set**: 22 entries, median post 26.3 GiB · click&rarr;byte 3.06 s (shared population: 2.76 s, 0.90×) · seq 39.6 MB/s · CPU 33.7 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 1.49 s | 277 ms | 50.9 | 195 ms | 2.8 | 1.04 s | 38.2 | 451 MiB | ok |
| `rar-named-small` | 1.34 s | 335 ms | 40.2 | 129 ms | 6.3 | 1.01 s | 27.7 | 446 MiB | ok |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 452 MiB | **failed** |
| `7z-obfuscated-small` | 1.16 s | 91 ms | 24.4 | 83 ms | 32.0 | 1.63 s | 41.2 | 454 MiB | ok |
| `plain-medium` | 633 ms | 166 ms | 38.4 | 166 ms | 2.3 | 1.16 s | 22.1 | 494 MiB | ok |
| `plain-season-pack` | 3.11 s | 534 ms | 51.4 | 284 ms | 3.8 | 1.45 s | 30.8 | 567 MiB | ok |
| `rar-stored-movie` | 3.53 s | 229 ms | 44.4 | 163 ms | 9.8 | 1.04 s | 22.5 | 663 MiB | ok |
| `rar4-stored` | 1.86 s | 192 ms | 21.3 | 72 ms | 12.8 | 2.25 s | 32.6 | 458 MiB | ok |
| `rar4-inner-obfuscated` | 1.13 s | 404 ms | 42.4 | 138 ms | 16.0 | 1.84 s | 36.4 | 428 MiB | ok |
| `rar-identity-grouped` | 1.38 s | 52 ms | 36.0 | 196 ms | 13.5 | 1.71 s | 30.6 | 476 MiB | ok |
| `rar4-obfuscated-volumes` | 1.60 s | 112 ms | 50.4 | 234 ms | 9.6 | 1.46 s | 30.6 | 531 MiB | ok |
| `rar-numeric-extensions` | 3.76 s | 501 ms | 28.8 | 1.41 s | 7.1 | 7.23 s | 39.1 | 1261 MiB | ok |
| `7z-plain-header` | 612 ms | 125 ms | 14.6 | 244 ms | 8.8 | 1.57 s | 28.8 | 693 MiB | ok |
| `7z-plain-large` | 3.33 s | 80 ms | 40.9 | 273 ms | 21.2 | 1.77 s | 29.1 | 597 MiB | ok |
| `7z-split-compressed-header` | 8.44 s | 58 ms | 46.0 | 196 ms | 14.6 | 1.19 s | 35.3 | 777 MiB | ok |
| `7z-header-encrypted` | 3.28 s | 82 ms | 15.6 | 214 ms | 1.6 | 3.19 s | 40.7 | 553 MiB | ok |
| `rar-hdrenc-large` | 14.97 s | 155 ms | 26.8 | 186 ms | 9.9 | 1.99 s | 52.3 | 659 MiB | ok |
| `rar-hdrenc-obfuscated` | 6.04 s | 3.01 s | 48.4 | 216 ms | 1.8 | 1.53 s | 27.0 | 905 MiB | ok |
| `7z-obfuscated-large` | — | — | — | — | — | — | — | 684 MiB | **failed** |
| `7z-obfuscated-hotd` | 2.68 s | 45 ms | 40.9 | 231 ms | 20.8 | 2.04 s | 29.9 | 738 MiB | ok |
| `rar-nested-iso` | 2.33 s | 430 ms | 22.9 | 215 ms | 4.5 | 1.39 s | 35.0 | 918 MiB | ok |
| `rar-inner-tree` | 9.20 s | 55 ms | 38.9 | 212 ms | 1.5 | 3.74 s | 48.5 | 575 MiB | ok |
| `rar-season-pack` | 22.29 s | 144 ms | 31.4 | 197 ms | 16.6 | 1.25 s | 39.7 | 504 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 391 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | 393 MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 418 MiB | **failed** |
| `huge-direct-pack` | 3.88 s | 247 ms | 40.9 | 215 ms | 4.7 | 1.26 s | 34.9 | 498 MiB | ok |
| `damaged-partial` | 4.87 s | 194 ms | 27.6 | 265 ms | 6.1 | 1.47 s | 33.1 | 522 MiB | ok |
| `damaged-severe` | 6.78 s | 3.40 s | — | — | — | — | — | 432 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 432 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 440 MiB | **failed** |

<details><summary>Failures (7)</summary>

- `rar-hdrenc-small` (smoke): import failed: No importable videos found.
- `7z-obfuscated-large` (core): import failed: Article with message-id KrRwGaSzEcDhQpBgNuSyNlYu-1638723981550@nyuu not found.
- `rar4-compressed` (negative): import failed: Only rar files with compression method m0 are supported.
- `rar5-mixed-compressed` (negative): import failed: Only rar files with compression method m0 are supported.
- `rar-encrypted-no-password` (negative): import failed: Encrypted Rar archive has no password specified.
- `dead-post` (failure): import failed: Article with message-id 055b4332e46842d9ad776958bb6a93d4@ngPost not found.
- `incomplete-archive-set` (failure): import failed: Only rar files with compression method m0 are supported.

</details>

### nzbdav

`nzbdav` · C# (.NET 10) · version `794948b` · serving: webdav · runtime: source · startup 3.09 s

**Own set**: 21 entries, median post 27.3 GiB · click&rarr;byte 3.84 s (shared population: 3.05 s, 0.79×) · seq 35.6 MB/s · CPU 17.7 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 2.05 s | 134 ms | 30.5 | 286 ms | 0.2 | 2.69 s | 21.1 | 261 MiB | ok |
| `rar-named-small` | 1.64 s | 58 ms | 40.0 | 289 ms | 0.7 | 6.98 s | 16.7 | 275 MiB | ok |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 254 MiB | **failed** |
| `7z-obfuscated-small` | 3.80 s | 35 ms | 8.8 | 99 ms | 11.3 | 1.44 s | 25.3 | 261 MiB | ok |
| `plain-medium` | 907 ms | 26 ms | 19.5 | 217 ms | 0.9 | 3.03 s | 16.0 | 279 MiB | ok |
| `plain-season-pack` | 2.14 s | 57 ms | 42.6 | 422 ms | 0.3 | 1.07 s | 18.8 | 324 MiB | ok |
| `rar-stored-movie` | 3.01 s | 42 ms | 24.5 | 218 ms | 4.2 | 915 ms | 13.4 | 302 MiB | ok |
| `rar4-stored` | — | — | — | — | — | — | — | 253 MiB | **failed** |
| `rar4-inner-obfuscated` | 7.05 s | 65 ms | 18.9 | 178 ms | 0.3 | 4.60 s | 18.3 | 296 MiB | ok |
| `rar-identity-grouped` | 8.82 s | 62 ms | — | 384 ms | — | — | — | 290 MiB | ok |
| `rar4-obfuscated-volumes` | 1.47 s | 44 ms | 43.9 | 248 ms | 1.6 | 1.96 s | 10.2 | 292 MiB | ok |
| `rar-numeric-extensions` | 6.95 s | 107 ms | 32.4 | 357 ms | 18.5 | 1.32 s | 14.7 | 355 MiB | ok |
| `7z-plain-header` | 1.31 s | 50 ms | 35.6 | 244 ms | 6.7 | 1.41 s | 15.1 | 313 MiB | ok |
| `7z-plain-large` | 2.48 s | 41 ms | 51.2 | 349 ms | 8.7 | 4.21 s | 15.0 | 315 MiB | ok |
| `7z-split-compressed-header` | 10.50 s | 94 ms | 46.6 | 272 ms | 0.2 | 5.11 s | 22.6 | 361 MiB | ok |
| `7z-header-encrypted` | 4.36 s | 136 ms | — | 190 ms | — | — | — | 353 MiB | ok |
| `rar-hdrenc-large` | 19.09 s | 95 ms | 24.0 | 270 ms | 5.2 | 1.56 s | 41.4 | 368 MiB | ok |
| `rar-hdrenc-obfuscated` | 10.80 s | 52 ms | 31.6 | 381 ms | 0.7 | 1.13 s | 23.5 | 435 MiB | ok |
| `7z-obfuscated-large` | — | — | — | — | — | — | — | 352 MiB | **failed** |
| `7z-obfuscated-hotd` | 2.66 s | 45 ms | 44.9 | 294 ms | 2.3 | 4.72 s | 18.0 | 352 MiB | ok |
| `rar-nested-iso` | 4.06 s | 93 ms | 21.8 | 338 ms | 1.8 | 1.36 s | 17.7 | 376 MiB | ok |
| `rar-inner-tree` | 4.74 s | 56 ms | 44.6 | 265 ms | 5.9 | 1.44 s | 15.0 | 384 MiB | ok |
| `rar-season-pack` | 15.58 s | 131 ms | 42.9 | 331 ms | 16.0 | 829 ms | 22.6 | 325 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 263 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | — | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 295 MiB | **failed** |
| `huge-direct-pack` | 3.16 s | 40 ms | 46.1 | 327 ms | 36.1 | 1.10 s | 12.7 | 470 MiB | ok |
| `damaged-partial` | 2.20 s | 54 ms | 44.3 | 284 ms | 21.3 | 1.11 s | 12.3 | 324 MiB | ok |
| `damaged-severe` | 7.13 s | 109 ms | — | — | — | — | — | 315 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 313 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | — | **failed** |

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

### StremThru (newz)

`stremthru` · Go · version `227c508` · serving: http-range · runtime: source · startup 1.74 s

**Own set**: 20 entries, median post 26.3 GiB · click&rarr;byte 3.42 s (shared population: 2.62 s, 0.77×) · seq 33.5 MB/s · CPU 34.9 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 1.09 s | 58 ms | 30.3 | 351 ms | 22.9 | 1.49 s | 10.6 | 623 MiB | ok |
| `rar-named-small` | 1.82 s | 114 ms | 32.7 | 430 ms | 17.9 | 1.47 s | 15.8 | 706 MiB | ok |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 696 MiB | **failed** |
| `7z-obfuscated-small` | 1.20 s | 5 ms | 10.0 | 6 ms | 97.6 | 500 ms | 32.2 | 684 MiB | ok |
| `plain-medium` | 435 ms | 21 ms | 34.0 | 290 ms | 24.7 | 1.41 s | 7.8 | 585 MiB | ok |
| `plain-season-pack` | 2.25 s | 199 ms | 38.7 | 306 ms | 26.3 | 1.63 s | 6.4 | 777 MiB | ok |
| `rar-stored-movie` | 2.39 s | 233 ms | 35.0 | 598 ms | 19.3 | 2.02 s | 18.6 | 837 MiB | ok |
| `rar4-stored` | — | — | — | — | — | — | — | 786 MiB | **failed** |
| `rar4-inner-obfuscated` | 1.84 s | 125 ms | 31.8 | 397 ms | 18.4 | 1.59 s | 13.1 | 852 MiB | ok |
| `rar-identity-grouped` | 1.64 s | 144 ms | — | 417 ms | — | — | — | 811 MiB | ok |
| `rar4-obfuscated-volumes` | 1.73 s | 170 ms | 33.0 | 482 ms | 11.1 | 1.61 s | 18.4 | 867 MiB | ok |
| `rar-numeric-extensions` | 6.28 s | 718 ms | 29.3 | 1.01 s | 21.8 | 2.33 s | 40.2 | 896 MiB | ok |
| `7z-plain-header` | 658 ms | 11 ms | — | 121 ms | 7.3 | 3.28 s | 110.3 | 816 MiB | ok |
| `7z-plain-large` | 4.12 s | 257 ms | 8.4 | 262 ms | 6.6 | 4.19 s | 86.8 | 714 MiB | ok |
| `7z-split-compressed-header` | 18.59 s | 346 ms | — | 483 ms | 4.1 | 4.13 s | 148.2 | 1617 MiB | ok |
| `7z-header-encrypted` | 9.17 s | 1.04 s | — | 221 ms | — | — | — | 786 MiB | ok |
| `rar-hdrenc-large` | 86.59 s | 2.21 s | 33.6 | 2.65 s | 23.4 | 4.33 s | 126.1 | 2129 MiB | ok |
| `rar-hdrenc-obfuscated` | — | — | — | — | — | — | — | 2061 MiB | **failed** |
| `7z-obfuscated-large` | — | — | — | — | — | — | — | 2028 MiB | **failed** |
| `7z-obfuscated-hotd` | 11.31 s | 568 ms | — | 217 ms | 5.7 | 3.77 s | 58.7 | 1283 MiB | ok |
| `rar-nested-iso` | 3.66 s | 564 ms | 37.9 | 853 ms | 24.3 | 2.10 s | 37.6 | 911 MiB | ok |
| `rar-inner-tree` | 43.69 s | 1.33 s | 33.5 | 1.38 s | 23.6 | 2.56 s | 42.8 | 1492 MiB | ok |
| `rar-season-pack` | 260.26 s | 2.66 s | 35.2 | 2.39 s | 17.1 | 3.62 s | 98.3 | 1860 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 1336 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | 1306 MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 1377 MiB | **failed** |
| `huge-direct-pack` | 3.58 s | 1.44 s | 43.6 | 1.55 s | 28.0 | 3.15 s | 24.4 | 1645 MiB | ok |
| `damaged-partial` | 3.13 s | 300 ms | 36.8 | 698 ms | 10.3 | 1.89 s | 56.3 | 1226 MiB | ok |
| `damaged-severe` | — | — | — | — | — | — | — | 867 MiB | **failed** |
| `dead-post` | — | — | — | — | — | — | — | 1070 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 1070 MiB | **failed** |

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

### Decypharr

`decypharr` · Go · version `v2.5` (`0dd1cbb`) · serving: webdav · runtime: docker · CPU/RSS from container cgroups · startup 2.81 s

**Own set**: 17 entries, median post 25.3 GiB · click&rarr;byte 5.47 s (shared population: 4.68 s, 0.86×) · seq 38.1 MB/s · CPU 27.1 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 2.79 s | 302 ms | 30.7 | 350 ms | 4.8 | 1.40 s | 23.4 | 78 MiB | ok |
| `rar-named-small` | 2.04 s | 213 ms | 39.2 | 303 ms | 8.1 | 1.09 s | 24.5 | 71 MiB | ok |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 73 MiB | **failed** |
| `7z-obfuscated-small` | — | — | — | — | — | — | — | 74 MiB | **failed** |
| `plain-medium` | 1.07 s | 124 ms | 27.3 | 270 ms | 9.7 | 1.32 s | 23.3 | 98 MiB | ok |
| `plain-season-pack` | — | — | — | — | — | — | — | 165 MiB | **failed** |
| `rar-stored-movie` | 5.18 s | 292 ms | 30.9 | 305 ms | 6.0 | 1.54 s | 25.4 | 181 MiB | ok |
| `rar4-stored` | 5.16 s | 161 ms | — | 358 ms | — | — | — | 218 MiB | ok |
| `rar4-inner-obfuscated` | 2.05 s | 235 ms | 42.3 | 533 ms | 2.1 | 4.67 s | 27.8 | 196 MiB | ok |
| `rar-identity-grouped` | 5.59 s | 184 ms | — | 484 ms | — | — | — | 209 MiB | ok |
| `rar4-obfuscated-volumes` | 3.80 s | 99 ms | 35.7 | 481 ms | 1.5 | 1.36 s | 27.6 | 243 MiB | ok |
| `rar-numeric-extensions` | 13.94 s | 244 ms | 40.0 | 446 ms | 10.4 | 1.29 s | 27.4 | 301 MiB | ok |
| `7z-plain-header` | 2.09 s | 199 ms | 38.1 | 275 ms | 1.8 | 1.49 s | 25.8 | 300 MiB | ok |
| `7z-plain-large` | 6.25 s | 159 ms | 26.0 | 309 ms | 2.6 | 1.86 s | 26.7 | 380 MiB | ok |
| `7z-split-compressed-header` | 9.43 s | 554 ms | 41.9 | 599 ms | 3.1 | 1.67 s | 27.1 | 435 MiB | ok |
| `7z-header-encrypted` | — | — | — | — | — | — | — | 435 MiB | **failed** |
| `rar-hdrenc-large` | — | — | — | — | — | — | — | 629 MiB | **failed** |
| `rar-hdrenc-obfuscated` | — | — | — | — | — | — | — | 722 MiB | **failed** |
| `7z-obfuscated-large` | 14.69 s | 323 ms | 39.9 | 399 ms | 2.8 | 1.62 s | 34.9 | 721 MiB | ok |
| `7z-obfuscated-hotd` | — | — | — | — | — | — | — | 732 MiB | **failed** |
| `rar-nested-iso` | 3.36 s | 389 ms | 42.7 | 2 ms | — | 250 ms | 18.4 | 774 MiB | ok |
| `rar-inner-tree` | 33.11 s | 279 ms | 19.4 | 342 ms | 0.7 | 5.10 s | 35.6 | 952 MiB | ok |
| `rar-season-pack` | 24.40 s | 312 ms | 25.6 | 292 ms | 6.0 | 4.30 s | 38.2 | 1115 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 1102 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | 1072 MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 1121 MiB | **failed** |
| `huge-direct-pack` | 78.79 s | 392 ms | 39.1 | 410 ms | 6.6 | 1.45 s | 30.5 | 1899 MiB | ok |
| `damaged-partial` | 5.15 s | 169 ms | 29.7 | 262 ms | 16.3 | 1.17 s | 26.6 | 1923 MiB | ok |
| `damaged-severe` | 12.31 s | 308 ms | — | — | — | — | — | 1759 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 1760 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 1760 MiB | **failed** |

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

**Own set**: 24 entries, median post 26.3 GiB · click&rarr;byte 491 ms (shared population: 488 ms, 0.99×) · seq 26.8 MB/s · CPU 27.1 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 847 ms | 112 ms | 3.3 | 313 ms | 8.1 | 4.34 s | 394.8 | 607 MiB | ok |
| `rar-named-small` | 134 ms | 107 ms | 26.2† | 424 ms | 26.3 | — | 56.2 | 623 MiB | ok |
| `rar-hdrenc-small` | 88 ms | 331 ms | 8.8 | 265 ms | 23.9 | 1.57 s | 50.9 | 606 MiB | ok |
| `7z-obfuscated-small` | 163 ms | 299 ms | 899.2† | 240 ms | — | — | — | 599 MiB | ok |
| `plain-medium` | 168 ms | 345 ms | 20.4 | 377 ms | 4.3 | 3.25 s | 22.6 | 627 MiB | ok |
| `plain-season-pack` | 258 ms | 64 ms | 41.0 | 543 ms | 1.9 | 1.72 s | 30.2 | 715 MiB | ok |
| `rar-stored-movie` | 138 ms | 126 ms | 24.8 | 279 ms | 1.4 | 1.39 s | 24.4 | 660 MiB | ok |
| `rar4-stored` | 110 ms | 493 ms | 79.1† | 177 ms | — | — | — | 638 MiB | ok |
| `rar4-inner-obfuscated` | 173 ms | 402 ms | 28.5† | 264 ms | 33.3 | 1.15 s | 57.2 | 660 MiB | ok |
| `rar-identity-grouped` | 119 ms | 255 ms | 15.3 | 328 ms | 6.3 | 2.13 s | 24.1 | 666 MiB | ok |
| `rar4-obfuscated-volumes` | 163 ms | 271 ms | 13.1 | 307 ms | 2.9 | 1.32 s | 23.9 | 661 MiB | ok |
| `rar-numeric-extensions` | 304 ms | 230 ms | 36.1 | 398 ms | 7.7 | 1.31 s | 21.0 | 694 MiB | ok |
| `7z-plain-header` | 144 ms | 273 ms | 22.9 | 310 ms | 4.2 | 1.27 s | 18.7 | 669 MiB | ok |
| `7z-plain-large` | 173 ms | 321 ms | 15.5 | 353 ms | 1.4 | 2.12 s | 22.5 | 673 MiB | ok |
| `7z-split-compressed-header` | 214 ms | 173 ms | 27.1 | 314 ms | 23.7 | 1.16 s | 26.1 | 684 MiB | ok |
| `7z-header-encrypted` | 136 ms | 402 ms | 34.6† | 255 ms | 11.9 | 2.29 s | 49.1 | 671 MiB | ok |
| `rar-hdrenc-large` | 234 ms | 327 ms | 27.7 | 285 ms | 15.9 | 2.15 s | 24.2 | 679 MiB | ok |
| `rar-hdrenc-obfuscated` | 314 ms | 292 ms | 28.1 | 322 ms | 12.0 | 1.17 s | 16.6 | 704 MiB | ok |
| `7z-obfuscated-large` | 182 ms | 297 ms | 14.2 | 379 ms | 18.5 | 1.57 s | 32.6 | 704 MiB | ok |
| `7z-obfuscated-hotd` | 144 ms | 273 ms | 26.8 | 352 ms | 16.8 | 1.72 s | 28.1 | 712 MiB | ok |
| `rar-nested-iso` | 268 ms | 243 ms | 27.1 | 275 ms | 42.6 | 1.19 s | 32.2 | 729 MiB | ok |
| `rar-inner-tree` | 430 ms | 103 ms | 34.1 | 384 ms | 16.4 | 1.38 s | 19.1 | 758 MiB | ok |
| `rar-season-pack` | 200 ms | 288 ms | 29.4 | 248 ms | 26.7 | 1.60 s | 37.0 | 753 MiB | ok |
| `rar4-compressed` | 99 ms | 121 ms | — | — | — | — | — | — | ok |
| `rar5-mixed-compressed` | 107 ms | 163 ms | — | — | — | — | — | 749 MiB | ok |
| `rar-encrypted-no-password` | 274 ms | 285 ms | — | — | — | — | — | — | ok |
| `huge-direct-pack` | 777 ms | 173 ms | 33.1 | 409 ms | 24.6 | 2.51 s | 55.5 | 956 MiB | ok |
| `damaged-partial` | 129 ms | 210 ms | 25.2 | 329 ms | 34.6 | 1.20 s | 38.3 | 828 MiB | ok |
| `damaged-severe` | 194 ms | 379 ms | — | — | — | — | — | 807 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 819 MiB | **failed** |
| `incomplete-archive-set` | 255 ms | 69 ms | — | — | — | — | — | 824 MiB | ok |

† transfer too short to measure sustained rate (the file fit in flight).

<details><summary>Failures (1)</summary>

- `dead-post` (failure): first article missing

</details>

### StreamNZB

`streamnzb` · Go · version `9b577f7` · serving: http-range · runtime: source · startup 1.45 s

**Own set**: 19 entries, median post 25.3 GiB · click&rarr;byte 2.25 s (shared population: 2.66 s, 1.19×) · seq 34.7 MB/s · CPU 6.8 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 9 ms | 4.44 s | 39.2 | 613 ms | 21.1 | 1.32 s | 5.0 | 542 MiB | ok |
| `rar-named-small` | 12 ms | 591 ms | 34.7 | 191 ms | 20.2 | 1.54 s | 4.4 | 538 MiB | ok |
| `rar-hdrenc-small` | 7 ms | 451 ms | 34.9 | 10 ms | 10.1 | 250 ms | 7.8 | 532 MiB | ok |
| `7z-obfuscated-small` | 4 ms | — | — | — | — | — | — | — | **failed** |
| `plain-medium` | 30 ms | 572 ms | 31.0 | 184 ms | 20.9 | 1.70 s | 5.0 | 540 MiB | ok |
| `plain-season-pack` | 250 ms | 875 ms | 31.8 | 206 ms | 19.1 | 1.89 s | 5.7 | 543 MiB | ok |
| `rar-stored-movie` | 103 ms | 1.64 s | 38.4 | 233 ms | 13.9 | 1.88 s | 5.4 | 573 MiB | ok |
| `rar4-stored` | 14 ms | 527 ms | — | 167 ms | — | — | — | 528 MiB | ok |
| `rar4-inner-obfuscated` | 7 ms | 557 ms | 31.6 | 114 ms | 22.1 | 1.62 s | 4.8 | 538 MiB | ok |
| `rar-identity-grouped` | 31 ms | 3.56 s | 29.2 | 577 ms | 15.4 | 1.89 s | 6.3 | 534 MiB | ok |
| `rar4-obfuscated-volumes` | 59 ms | 3.60 s | 22.2 | 309 ms | 11.6 | 2.01 s | 5.2 | 546 MiB | ok |
| `rar-numeric-extensions` | 236 ms | — | — | — | — | — | — | 531 MiB | **failed** |
| `7z-plain-header` | 12 ms | — | — | — | — | — | — | — | **failed** |
| `7z-plain-large` | 151 ms | 1.04 s | 29.8 | 243 ms | 21.0 | 1.66 s | 6.1 | 540 MiB | ok |
| `7z-split-compressed-header` | 246 ms | 2.00 s | 36.8 | 281 ms | 12.8 | 1.47 s | 7.3 | 538 MiB | ok |
| `7z-header-encrypted` | 28 ms | 562 ms | 34.7 | 343 ms | 10.9 | 2.52 s | 8.7 | 554 MiB | ok |
| `rar-hdrenc-large` | 347 ms | 2.93 s | 25.2 | 12 ms | 38.4 | 251 ms | 21.9 | 539 MiB | ok |
| `rar-hdrenc-obfuscated` | 1.26 s | — | — | — | — | — | — | 540 MiB | **failed** |
| `7z-obfuscated-large` | 644 ms | — | — | — | — | — | — | 539 MiB | **failed** |
| `7z-obfuscated-hotd` | 86 ms | 4.79 s | 37.4 | 185 ms | 14.0 | 1.39 s | 23.9 | 535 MiB | ok |
| `rar-nested-iso` | 469 ms | 2.65 s | 41.9 | 427 ms | 25.3 | 1.48 s | 197.4 | 569 MiB | ok |
| `rar-inner-tree` | 2.84 s | 1.13 s | 34.3 | 379 ms | 18.1 | 1.69 s | 244.9 | 588 MiB | ok |
| `rar-season-pack` | 832 ms | 2.25 s | 40.4 | 310 ms | 23.0 | 2.10 s | 243.1 | 624 MiB | ok |
| `rar4-compressed` | 89 ms | — | — | — | — | — | — | — | **failed** |
| `rar5-mixed-compressed` | 48 ms | — | — | — | — | — | — | 589 MiB | **failed** |
| `rar-encrypted-no-password` | 1.30 s | — | — | — | — | — | — | 613 MiB | **failed** |
| `huge-direct-pack` | 6.48 s | 1.99 s | 39.6 | 231 ms | 20.9 | 1.71 s | 319.3 | 732 MiB | ok |
| `damaged-partial` | 144 ms | 656 ms | 33.0 | 231 ms | 26.1 | 1.94 s | 282.4 | 710 MiB | ok |
| `damaged-severe` | 590 ms | 2.09 s | — | — | — | — | — | 706 MiB | ok |
| `dead-post` | 53 ms | — | — | — | — | — | — | 709 MiB | **failed** |
| `incomplete-archive-set` | 19 ms | — | — | — | — | — | — | 707 MiB | **failed** |

<details><summary>Failures (10)</summary>

- `7z-obfuscated-small` (smoke): served only 2.4 MB from a 155 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `rar-numeric-extensions` (core): served only 2.4 MB from a 84436 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `7z-plain-header` (core): served only 2.4 MB from a 2942 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `rar-hdrenc-obfuscated` (core): served only 2.4 MB from a 160713 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `7z-obfuscated-large` (core): served only 2.4 MB from a 76434 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `rar4-compressed` (negative): served only 2.4 MB from a 3340 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `rar5-mixed-compressed` (negative): served only 2.4 MB from a 2055 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `rar-encrypted-no-password` (negative): served only 2.4 MB from a 109131 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `dead-post` (failure): served only 2.4 MB from a 4879 MB post. That is a placeholder, a sample, or the wrong file, not the media.
- `incomplete-archive-set` (failure): served only 2.4 MB from a 1050 MB post. That is a placeholder, a sample, or the wrong file, not the media.

</details>

### AltMount

`altmount` · Go · version `3ed4c47` · serving: webdav · runtime: source · startup 306 ms

**Own set**: 17 entries, median post 25.3 GiB · click&rarr;byte 4.03 s (shared population: 3.91 s, 0.97×) · seq 38.9 MB/s · CPU 4.7 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 63.47 s | 329 ms | 39.4 | 381 ms | 12.1 | 1.37 s | 5.3 | 142 MiB | ok |
| `rar-named-small` | — | — | — | — | — | — | — | 150 MiB | **failed** |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | — | **failed** |
| `7z-obfuscated-small` | 1.86 s | 463 ms | 37.2 | 306 ms | 33.3 | 1.50 s | 5.1 | 232 MiB | ok |
| `plain-medium` | 824 ms | 380 ms | 38.8 | 382 ms | 10.8 | 1.56 s | 2.8 | 218 MiB | ok |
| `plain-season-pack` | 6.56 s | 442 ms | 49.6 | 479 ms | 31.3 | 1.50 s | 4.5 | 310 MiB | ok |
| `rar-stored-movie` | 2.93 s | 147 ms | 39.7 | 449 ms | 14.3 | 1.68 s | 3.7 | 411 MiB | ok |
| `rar4-stored` | — | — | — | — | — | — | — | 413 MiB | **failed** |
| `rar4-inner-obfuscated` | 1.74 s | 150 ms | 44.6 | 656 ms | 28.8 | 1.65 s | 4.0 | 514 MiB | ok |
| `rar-identity-grouped` | 3.62 s | 174 ms | 33.2 | 384 ms | 20.5 | 1.48 s | 3.5 | 427 MiB | ok |
| `rar4-obfuscated-volumes` | 2.80 s | 397 ms | 34.5 | 390 ms | 10.1 | 1.76 s | 4.2 | 482 MiB | ok |
| `rar-numeric-extensions` | — | — | — | — | — | — | — | 617 MiB | **failed** |
| `7z-plain-header` | 678 ms | 383 ms | 33.7 | 349 ms | 4.7 | 1.44 s | 3.6 | 686 MiB | ok |
| `7z-plain-large` | 3.89 s | 333 ms | 38.9 | 314 ms | 18.2 | 1.57 s | 3.8 | 665 MiB | ok |
| `7z-split-compressed-header` | 12.39 s | 234 ms | 27.0 | 356 ms | — | — | 22.9 | 1071 MiB | ok |
| `7z-header-encrypted` | 2.74 s | 72 ms | — | — | — | — | — | 691 MiB | ok |
| `rar-hdrenc-large` | — | — | — | — | — | — | — | 1471 MiB | **failed** |
| `rar-hdrenc-obfuscated` | 9.67 s | 201 ms | 34.0 | 359 ms | 24.0 | 1.50 s | 7.7 | 1472 MiB | ok |
| `7z-obfuscated-large` | 10.50 s | 166 ms | 30.7 | 297 ms | 18.4 | 1.50 s | 5.0 | 1279 MiB | ok |
| `7z-obfuscated-hotd` | 3.89 s | 137 ms | 40.6 | 499 ms | 30.1 | 1.62 s | 4.8 | 766 MiB | ok |
| `rar-nested-iso` | — | — | — | — | — | — | — | 992 MiB | **failed** |
| `rar-inner-tree` | — | — | — | — | — | — | — | 1057 MiB | **failed** |
| `rar-season-pack` | 16.61 s | 99 ms | 41.4 | 544 ms | 15.8 | 1.09 s | 5.0 | 2026 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | 782 MiB | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | — | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 1000 MiB | **failed** |
| `huge-direct-pack` | 20.88 s | 234 ms | 39.9 | 355 ms | 14.2 | 1.27 s | 8.7 | 1499 MiB | ok |
| `damaged-partial` | 4.83 s | 133 ms | — | 353 ms | 16.9 | 1.41 s | 3.7 | 928 MiB | ok |
| `damaged-severe` | 10.68 s | 177 ms | — | — | — | — | — | 891 MiB | ok |
| `dead-post` | — | — | — | — | — | — | — | 891 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 891 MiB | **failed** |

<details><summary>Failures (12)</summary>

- `rar-named-small` (smoke): import failed: failed to iterate RAR archive "Gilmore.Girls.2000.S01E17.1080p.NF.WEB-DL.H264.SDR.DDP.2.0.English-HONE.part01.rar": rardecode: bad volume number
- `rar-hdrenc-small` (smoke): import failed: archive contains no files with allowed extensions (found: [(no extension)], allowed: [.mkv .mp4 .avi .ts .m4v .mov .wmv .mpg .mpeg .xvid .rm .rmvb .asf .asx .wtv .mk3d .dvr-ms .mp3 .flac .m4a .epub .pdf .cbz])
- `rar4-stored` (core): import failed: failed to iterate RAR archive "Dont.Be.Afraid.of.the.Dark.2010.BRRip.XviD-F0RFUN.rar": All attempts fail: #1: nntp: yEnc CRC mismatch #2: nntp: yEnc CRC mismatch
- `rar-numeric-extensions` (core): import failed: no files were successfully processed (all files failed validation)
- `rar-hdrenc-large` (core): import failed: archive contains no files with allowed extensions (found: [.xml .jpg .bdmv .clpi .m2ts .mpls], allowed: [.mkv .mp4 .avi .ts .m4v .mov .wmv .mpg .mpeg .xvid .rm .rmvb .asf .asx .wtv .mk3d .dvr-ms .mp3 .flac .m4a .epub .pdf .cbz])
- `rar-nested-iso` (core): import failed: archive contains no files with allowed extensions (found: [.m2ts], allowed: [.mkv .mp4 .avi .ts .m4v .mov .wmv .mpg .mpeg .xvid .rm .rmvb .asf .asx .wtv .mk3d .dvr-ms .mp3 .flac .m4a .epub .pdf .cbz])
- `rar-inner-tree` (core): no video found under /bench/rar-inner-tree
- `rar4-compressed` (negative): import failed: no files were successfully processed (all files failed validation)
- `rar5-mixed-compressed` (negative): import failed: compressed media files are not supported: Undercover.Lover.S01E04.DUTCH.1080p.WEB.h264-SOLEM/Undercover.Lover.S01E04.DUTCH.1080p.WEB.h264-SOLEM.mkv (uses rar5.0 compression)
- `rar-encrypted-no-password` (negative): import failed: failed to iterate RAR archive "pB2nvBcqwqGbAiF87F6oE.part001.rar": rardecode: archive encrypted, password required
- `dead-post` (failure): import failed: fast-fail segment check failed: no regular files were successfully processed (all files failed validation)
- `incomplete-archive-set` (failure): import failed: compressed media files are not supported: The Falcon And The Winter Soldier S01 2160p WEB-DL HDR 10bit x265 HEVC DDP5 1 Atmos-PHOCiS/The Falcon And The Winter Soldier S01E01 2160p WEB-DL HDR 10bit x265 HEVC DDP5 1 Atmos-PHOCiS.mkv (uses rar5.0 compression)

</details>

### InfiniDysk

`infinidysk` · C# (.NET 10) · version `aa83ef3` · serving: webdav · runtime: source · startup 6.76 s

**Own set**: 21 entries, median post 27.3 GiB · click&rarr;byte 3.51 s (shared population: 3.03 s, 0.86×) · seq 22.7 MB/s · CPU 11.0 s/GiB

Medians over the entries *this application served*, so they are not comparable
across rows. Import and click&rarr;byte scale with post size, so an application
that fails the large entries is credited with the fast medians of the small ones
it survived; the multiplier is the size of that distortion.

| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `plain-small` | 2.53 s | 201 ms | 23.8 | 105 ms | 1.6 | 2.50 s | 14.2 | 594 MiB | ok |
| `rar-named-small` | 3.50 s | 12 ms | 29.2 | 14 ms | 25.7 | 1.34 s | 10.3 | 572 MiB | ok |
| `rar-hdrenc-small` | — | — | — | — | — | — | — | 572 MiB | **failed** |
| `7z-obfuscated-small` | 1.54 s | 27 ms | 18.9 | 755 ms | 21.9 | 2.10 s | 11.8 | 584 MiB | ok |
| `plain-medium` | 1.11 s | 26 ms | 33.8 | 14 ms | 3.5 | 3.67 s | 8.3 | 721 MiB | ok |
| `plain-season-pack` | 2.35 s | 18 ms | 19.2 | 24 ms | 2.7 | 4.01 s | 12.1 | 846 MiB | ok |
| `rar-stored-movie` | 2.99 s | 48 ms | 19.7 | 16 ms | 2.1 | 3.27 s | 8.9 | 959 MiB | ok |
| `rar4-stored` | — | — | — | — | — | — | — | 898 MiB | **failed** |
| `rar4-inner-obfuscated` | 2.41 s | 182 ms | 30.4 | 16 ms | 6.3 | 2.41 s | 7.8 | 914 MiB | ok |
| `rar-identity-grouped` | 1.89 s | 15 ms | 21.6 | 23 ms | 1.3 | 2.31 s | 10.8 | 871 MiB | ok |
| `rar4-obfuscated-volumes` | 1.67 s | 16 ms | 25.9 | 16 ms | 1.4 | 2.76 s | 7.6 | 787 MiB | ok |
| `rar-numeric-extensions` | 4.76 s | 35 ms | 19.5 | 3.15 s | 2.4 | 4.15 s | 13.8 | 982 MiB | ok |
| `7z-plain-header` | 1.10 s | 15 ms | 24.6 | 17 ms | 2.1 | 3.13 s | 8.9 | 929 MiB | ok |
| `7z-plain-large` | 8.47 s | 17 ms | 23.8 | 30 ms | 3.5 | 2.74 s | 9.8 | 866 MiB | ok |
| `7z-split-compressed-header` | 43.18 s | 25 ms | 22.7 | 26 ms | 1.7 | 3.05 s | 12.2 | 957 MiB | ok |
| `7z-header-encrypted` | 11.40 s | 20 ms | 25.8 | 29 ms | 2.0 | 2.43 s | 11.0 | 844 MiB | ok |
| `rar-hdrenc-large` | 20.26 s | 23 ms | 19.8 | 32 ms | 4.5 | 3.76 s | 16.1 | 1054 MiB | ok |
| `rar-hdrenc-obfuscated` | 7.69 s | 3.68 s | 21.4 | 40 ms | 3.1 | 1.70 s | 11.0 | 1203 MiB | ok |
| `7z-obfuscated-large` | — | — | — | — | — | — | — | 1099 MiB | **failed** |
| `7z-obfuscated-hotd` | 11.84 s | 21 ms | 13.8 | 16 ms | 3.8 | 2.19 s | 11.5 | 1133 MiB | ok |
| `rar-nested-iso` | 2.35 s | 46 ms | 20.9 | 31 ms | 1.4 | 3.10 s | 13.0 | 1140 MiB | ok |
| `rar-inner-tree` | 5.60 s | 10 ms | 19.4 | 16 ms | 1.3 | 10.37 s | 11.5 | 1164 MiB | ok |
| `rar-season-pack` | 23.62 s | 3 ms | 30.8 | 16 ms | 3.0 | 1.04 s | 12.5 | 1098 MiB | ok |
| `rar4-compressed` | — | — | — | — | — | — | — | — | **failed** |
| `rar5-mixed-compressed` | — | — | — | — | — | — | — | 929 MiB | **failed** |
| `rar-encrypted-no-password` | — | — | — | — | — | — | — | 881 MiB | **failed** |
| `huge-direct-pack` | 4.81 s | 11 ms | 24.8 | 17 ms | 5.7 | 2.33 s | 10.5 | 1578 MiB | ok |
| `damaged-partial` | 11.72 s | 28 ms | 19.4 | 963 ms | 2.1 | 1.38 s | 10.8 | 1520 MiB | ok |
| `damaged-severe` | — | — | — | — | — | — | — | 1268 MiB | **failed** |
| `dead-post` | — | — | — | — | — | — | — | 1213 MiB | **failed** |
| `incomplete-archive-set` | — | — | — | — | — | — | — | 1190 MiB | **failed** |

<details><summary>Failures (9)</summary>

- `rar-hdrenc-small` (smoke): import failed: No importable media files found.
- `rar4-stored` (core): import failed: The decoded yEnc CRC32 was 2ebc210a, but the trailer expected 39ab5444.
- `7z-obfuscated-large` (core): import failed: Article with message-id KrRwGaSzEcDhQpBgNuSyNlYu-1638723981550@nyuu not found. Server responded: 430 No Such Article
- `rar4-compressed` (negative): import failed: Only rar files with compression method m0 are supported.
- `rar5-mixed-compressed` (negative): import failed: Only rar files with compression method m0 are supported.
- `rar-encrypted-no-password` (negative): import failed: Encrypted Rar archive has no password specified.
- `damaged-severe` (failure): import failed: Article with message-id xcecGBQnwBIYE.8fjOSbt$yhomo1x1@4Zkt8fJ.3J168q not found. Server responded: 430 No Such Article
- `dead-post` (failure): import failed: Missing articles: 1 important file(s) have missing segments across all providers (e.g. OB7ucO5ujqhRQOnlY.part04.rar). NZB is likely DMCA'd or expired.
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