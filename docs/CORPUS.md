# NZB corpus

32 NZBs selected from a pool of 96, chosen for **characteristic
coverage** rather than title. Every classification below was verified against live NNTP by
`src/corpus/probe.mjs` (archive headers actually fetched and parsed), not inferred from
filenames, which are frequently obfuscated and carry stale inline comments.

The NZBs themselves are gitignored. Regenerate with:

```
node src/corpus/analyze.mjs     # static structure     -> corpus/analysis.json
node src/corpus/probe.mjs       # live archive probing -> corpus/probe.json
node src/corpus/select.mjs      # curate + manifest    -> corpus/corpus.json + this file
```

## Coverage

| Axis | Entries |
|---|---|
| `rar5` | 15 |
| `stored` | 11 |
| `password-in-nzb` | 8 |
| `7z` | 7 |
| `extensionless` | 7 |
| `direct-video` | 5 |
| `encrypted-headers` | 5 |
| `rar4` | 5 |
| `obfuscated-names` | 3 |
| `season-pack` | 3 |
| `compressed` | 2 |
| `file-selection` | 2 |
| `missing-articles` | 2 |
| `named-volumes` | 2 |
| `no-archive` | 2 |
| `plain-header` | 2 |
| `random-stems` | 2 |
| `aes` | 1 |
| `all-articles-missing` | 1 |
| `compressed-header` | 1 |
| `dead-post` | 1 |
| `derived` | 1 |
| `header-encrypted` | 1 |
| `hex-names` | 1 |
| `identical-subjects` | 1 |
| `inner-directory-tree` | 1 |
| `iso` | 1 |
| `many-volumes` | 1 |
| `missing-volumes` | 1 |
| `mixed-store-and-compressed` | 1 |
| `nested-archive` | 1 |
| `no-password-available` | 1 |
| `no-volume-numbers-in-names` | 1 |
| `not-streamable-without-decompression` | 1 |
| `numeric-extensions` | 1 |
| `obfuscated-inner-name` | 1 |
| `partNN` | 1 |
| `pathological-nzb` | 1 |
| `per-file-unique-stems` | 1 |
| `rar+rNN` | 1 |
| `seek-into-hole` | 1 |
| `segment-per-file` | 1 |
| `severe-damage` | 1 |
| `single-hole` | 1 |
| `split-7z.NNN` | 1 |
| `very-large` | 1 |

## smoke

Small and healthy. A full pass is cheap, so use these while iterating.

### `plain-small`

Control. A bare MKV posted directly, small and healthy, so fixed per-request overhead is visible without archive work confusing the number.

- **Axes**: `direct-video`, `no-archive`
- **Verified**: matroska
- **Size**: 1.7 GiB posted · 22 files · 2,520 segments · NZB 0.2 MB
- **Health**: 16/16 sampled articles present
- **Obfuscation**: `extensionless-names`
- **Source**: `Summers.Last.Resort.2026.720p.WEB.H264-OUTPOST31-x.nzb`
- **sha256**: `2a00fcd731baabc6…`

### `rar-named-small`

Control for archive handling: conventionally named RAR5 stored set, small enough to run every iteration.

- **Axes**: `rar5`, `stored`, `named-volumes`, `partNN`
- **Verified**: rar5 · stored · password in NZB
- **Size**: 1.7 GiB posted · 48 files · 2,549 segments · NZB 0.2 MB
- **Health**: 16/16 sampled articles present
- **Source**: `Gilmore.Girls.2000.S01E17.1080p.NF.WEB-DL.H264.SDR.DDP.2.0.English-HONE.nzb`
- **sha256**: `39a7a96fa4ac8ca5…`

### `rar-hdrenc-small`

Cheapest header-encrypted RAR5 in the pool. Requires reading the NZB password meta before the volume list can be parsed at all.

- **Axes**: `rar5`, `encrypted-headers`, `password-in-nzb`
- **Verified**: rar5 · encrypted headers · password in NZB
- **Size**: 0.5 GiB posted · 18 files · 717 segments · NZB 0.1 MB
- **Health**: 16/16 sampled articles present
- **Source**: `My.Little.Pony.n.Friends.S01E01.The.End.of.Flutter.Valley.1.WEBDL.1080p.h264.english-S1PH3R.nzb`
- **sha256**: `8daf4ef005139408…`

### `7z-obfuscated-small`

Tiny fully-obfuscated 7z: hex stems, no extensions. Exercises name-independent volume grouping for pennies.

- **Axes**: `7z`, `obfuscated-names`, `extensionless`, `password-in-nzb`
- **Verified**: 7z · password in NZB
- **Size**: 0.1 GiB posted · 17 files · 219 segments · NZB 0.0 MB
- **Health**: 16/16 sampled articles present
- **Obfuscation**: `extensionless-names`, `hex-names`, `random-stems`, `opaque-subjects`, `per-file-unique-stems`
- **Source**: `Yu-Gi-Oh.GX.S02E07.Dub.A.New.Breed.of.Hero.Part.2.480p.HULU.WEB-DL.AAC2.0.H.264-NINJACENTRAL.nzb`
- **sha256**: `00d167bd168de213…`


## core

The main capability and performance matrix.

### `plain-medium`

Direct MKV at a realistic movie size: the throughput ceiling case with no archive layer in the way.

- **Axes**: `direct-video`, `no-archive`
- **Verified**: matroska · password in NZB
- **Size**: 8.8 GiB posted · 9 files · 12,761 segments · NZB 1.1 MB
- **Health**: 16/16 sampled articles present
- **Source**: `Masters.of.the.Universe.2026.NORDiC.1080p.AMZN.WEB-DL.H.265-NORViNE.nzb`
- **sha256**: `38c0a355aa559477…`

### `plain-season-pack`

Twelve separate MKVs in one NZB. Tests episode selection when there is no archive to enumerate.

- **Axes**: `direct-video`, `season-pack`, `file-selection`
- **Verified**: matroska
- **Size**: 113 GiB posted · 22 files · 111,967 segments · NZB 10.9 MB
- **Health**: 16/16 sampled articles present
- **Obfuscation**: `unquoted-subjects`, `per-file-unique-stems`
- **Source**: `Dexter.2006.S02.PROPER.BluRay.1080p.TrueHD.5.1.AVC.REMUX-FraMeSToR.nzb`
- **sha256**: `f2023873935fa20b…`

### `rar-stored-movie`

The single most common real-world shape: a stored RAR5 set with normal part numbering, at movie scale.

- **Axes**: `rar5`, `stored`, `named-volumes`
- **Verified**: rar5 · stored
- **Size**: 25.3 GiB posted · 59 files · 37,997 segments · NZB 3.6 MB
- **Health**: 16/16 sampled articles present
- **Obfuscation**: `opaque-subjects`
- **Source**: `District.9.2009.2160p.MA.WEB-DL.TrueHD.Atmos.7.1.DV.HDR.H.265-FLUX.nzb`
- **sha256**: `ce9e254490b7fbfa…`

### `rar4-stored`

RAR4 coverage. RAR4 file headers carry no volume ordinal, so ordering must come from names or tail evidence.

- **Axes**: `rar4`, `stored`, `rar+rNN`
- **Verified**: rar4 · stored
- **Size**: 1.7 GiB posted · 118 files · 2,757 segments · NZB 0.3 MB
- **Health**: 16/16 sampled articles present
- **Source**: `Dont.Be.Afraid.of.the.Dark.2010.BRRip.XviD-F0RFUN (1).nzb`
- **sha256**: `1a242dfacb72f149…`

### `rar4-inner-obfuscated`

RAR4 whose *inner* filename is a hex blob while the volumes are named normally, the reverse of the usual obfuscation.

- **Axes**: `rar4`, `stored`, `obfuscated-inner-name`
- **Verified**: rar4 · stored · password in NZB
- **Size**: 1.4 GiB posted · 35 files · 1,921 segments · NZB 0.2 MB
- **Health**: 16/16 sampled articles present
- **Source**: `Lucky.2019.720p.AMZN.WEB-DL.DDP2.0.H.264-LAZY.nzb`
- **sha256**: `4eb1ebc97d02d55d…`

### `rar-identity-grouped`

Every volume posted under a different random stem with no extension, so volumes can only be grouped by their inner RAR header identity, not by name.

- **Axes**: `rar5`, `stored`, `extensionless`, `per-file-unique-stems`
- **Verified**: rar5 · stored
- **Size**: 8.2 GiB posted · 44 files · 12,263 segments · NZB 1.2 MB
- **Health**: 16/16 sampled articles present
- **Obfuscation**: `extensionless-names`, `random-stems`, `unquoted-subjects`, `opaque-subjects`, `per-file-unique-stems`
- **Source**: `Teri.Meri.Kahaani.2012.1080p.AMZN.WEB.DL.H264.DDP.2.0.MSubs-DS.mkv.nzb`
- **sha256**: `9e5722ae214cef05…`

### `rar4-obfuscated-volumes`

RAR4 with obfuscated volume names: no ordinal in the header and no usable name scheme at once.

- **Axes**: `rar4`, `extensionless`, `random-stems`
- **Verified**: rar4 · stored
- **Size**: 16.2 GiB posted · 35 files · 24,309 segments · NZB 2.3 MB
- **Health**: 16/16 sampled articles present
- **Obfuscation**: `extensionless-names`, `random-stems`, `unquoted-subjects`, `opaque-subjects`, `per-file-unique-stems`
- **Source**: `23.000.Lives.2026.HDR.2160p.WEB.h265-EDITH.mkv.nzb`
- **sha256**: `2d49b91f001a1b4a…`

### `rar-numeric-extensions`

Volumes named <hex>.1 to <hex>.193, neither .partNN nor .rNN. Breaks classifiers that pattern-match extensions.

- **Axes**: `rar5`, `stored`, `numeric-extensions`, `hex-names`
- **Verified**: rar5 · stored
- **Size**: 78.6 GiB posted · 193 files · 106,699 segments · NZB 10.0 MB
- **Health**: 16/16 sampled articles present
- **Obfuscation**: `hex-names`, `random-stems`, `opaque-subjects`
- **Source**: `[rar nzb, takes 4s] Dune.Part.One.2021.2160p.UHD.B[luRay.Remux.HEVC.DoVi.TrueHD.Atmos.7.1-playBD.nzb`
- **sha256**: `db5b4c11bbd85269…`

### `7z-plain-header`

7z control: uncompressed metadata header, so inner names are readable without decoding anything.

- **Axes**: `7z`, `plain-header`, `stored`
- **Verified**: 7z
- **Size**: 2.7 GiB posted · 13 files · 4,112 segments · NZB 0.4 MB
- **Health**: 16/16 sampled articles present
- **Source**: `The.Big.Bang.Theory.S08E08.The.Prom.Equivalency.BluRay.1080p.AVC.DTS-HD.MA.5.1.REMUX-FraMeSToR.nzb`
- **sha256**: `a63344e46e6cad72…`

### `7z-plain-large`

Same shape as the 7z control but an order of magnitude larger, to separate per-request cost from per-byte cost.

- **Axes**: `7z`, `plain-header`
- **Verified**: 7z
- **Size**: 47.8 GiB posted · 105 files · 71,656 segments · NZB 6.2 MB
- **Health**: 16/16 sampled articles present
- **Source**: `Unbreakable.2000.UHD.BluRay.2160p.DTS-HD.MA.5.1.DV.HEVC.HYBRID.REMUX-FraMeSToR.nzb`
- **sha256**: `453052cee0eff791…`

### `7z-split-compressed-header`

Split .7z.NNN set whose metadata header is LZMA-packed at the tail of the last volume, so the header cannot be read from volume 1.

- **Axes**: `7z`, `split-7z.NNN`, `compressed-header`, `password-in-nzb`
- **Verified**: 7z · header: compressed · password in NZB
- **Size**: 78.4 GiB posted · 513 files · 114,050 segments · NZB 10.2 MB
- **Health**: 16/16 sampled articles present
- **Source**: `[takes very long 3] Dune.2021.UHD.BluRay.2160p.TrueHD.Atmos.7.1.DV.HEVC.REMUX-FraMeSToR.nzb`
- **sha256**: `cd7f460ea24f7971…`

### `7z-header-encrypted`

True -mhe=on 7z: the metadata header itself is AES encrypted. Nothing can be enumerated without applying the NZB password first.

- **Axes**: `7z`, `header-encrypted`, `aes`, `password-in-nzb`
- **Verified**: 7z · AES-encrypted header · header: encrypted · password in NZB
- **Size**: 6.7 GiB posted · 114 files · 10,150 segments · NZB 0.9 MB
- **Health**: 16/16 sampled articles present
- **Source**: `Dilwale.Dulhania.Le.Jayenge.1995.720p.AMZN.WEB-DL.DDP5.1.H.264-NINJACENTRAL.nzb`
- **sha256**: `aa683b601794c1c3…`

### `rar-hdrenc-large`

Header-encrypted RAR5 at disc scale, for encrypted-header handling under a large volume count.

- **Axes**: `rar5`, `encrypted-headers`, `password-in-nzb`
- **Verified**: rar5 · encrypted headers · password in NZB
- **Size**: 102 GiB posted · 341 files · 152,301 segments · NZB 13.6 MB
- **Health**: 16/16 sampled articles present
- **Obfuscation**: `opaque-subjects`
- **Source**: `Parasite.2019.GBR.BFI.Curzon.Artificial.Eye.aka.Gisaengchung.2160p.UHD.Blu.ray.HEVC.Atmos.TrueHD.7.1.TAiPAK-BD25.nzb`
- **sha256**: `f154bb6ea1155b81…`

### `rar-hdrenc-obfuscated`

The hardest RAR case in the pool: encrypted headers AND obfuscated volume names, so neither names nor plaintext headers can order the set.

- **Axes**: `rar5`, `encrypted-headers`, `extensionless`, `random-stems`, `password-in-nzb`
- **Verified**: rar5 · encrypted headers · password in NZB
- **Size**: 150 GiB posted · 112 files · 217,307 segments · NZB 19.4 MB
- **Health**: 16/16 sampled articles present
- **Obfuscation**: `extensionless-names`, `random-stems`, `opaque-subjects`, `per-file-unique-stems`
- **Source**: `The.Lord.of.the.Rings.The.Return.Of.The.King.2003.EXTENDED.2160p.UHD.DOLBY.VISION.REMUX.HDR.HEVC.MULTi.VFi.DTS-HDMA.x265-EXTREME.nzb`
- **sha256**: `4f6bc2ce319e2d2a…`

### `7z-obfuscated-large`

Large fully-obfuscated split 7z. Historically a divergence point between engines, which makes it a good capability discriminator.

- **Axes**: `7z`, `obfuscated-names`, `extensionless`, `password-in-nzb`
- **Verified**: 7z · password in NZB
- **Size**: 71.2 GiB posted · 471 files · 103,612 segments · NZB 9.3 MB
- **Health**: 16/16 sampled articles present
- **Obfuscation**: `extensionless-names`, `hex-names`, `random-stems`, `opaque-subjects`, `per-file-unique-stems`
- **Source**: `[fails but succeeds on nzbdav] Dune.Part.One.2021.2160p.UHD.Blu-ray.Remux.HEVC.TrueHD.7.1.Atmos-SiCFoI.nzb`
- **sha256**: `3d2ec96d3c6be887…`

### `7z-obfuscated-hotd`

Second obfuscated-7z sample from a different poster, to tell a general capability apart from one release-specific quirk.

- **Axes**: `7z`, `obfuscated-names`, `extensionless`, `password-in-nzb`
- **Verified**: 7z · password in NZB
- **Size**: 27.3 GiB posted · 140 files · 37,064 segments · NZB 2.5 MB
- **Health**: 16/16 sampled articles present
- **Obfuscation**: `extensionless-names`, `hex-names`, `random-stems`, `opaque-subjects`, `per-file-unique-stems`
- **Source**: `[fail with no streamable files, work in nzbdavex] House.of.the.Dragon.S01E01.The.Heirs.of.the.Dragon.UHD.BluRay.2160p.TrueHD.Atmos.7.1.DV.HEVC.REMUX-FraMeSToR.nzb`
- **sha256**: `7ac44f6d757a548e…`

### `rar-nested-iso`

A full UHD ISO stored inside a RAR4 set: streaming requires descending one container level and finding the playlist inside the ISO.

- **Axes**: `rar4`, `stored`, `nested-archive`, `iso`
- **Verified**: rar4 · stored · nested: Superman.2025.MULTi.COMPLETE.UHD.BLURAY-AKENATON.iso
- **Size**: 94.7 GiB posted · 106 files · 137,681 segments · NZB 12.3 MB
- **Health**: 16/16 sampled articles present
- **Source**: `[only sample streamable, iso file not in list - why] Superman.2025.MULTi.COMPLETE.UHD.BLURAY-AKENATON-FTP.nzb`
- **sha256**: `555001c9c0dd4dc8…`

### `rar-inner-tree`

A whole multi-season directory tree inside one RAR set, for inner-file enumeration and selection, not just "the one big file".

- **Axes**: `rar5`, `stored`, `inner-directory-tree`, `file-selection`
- **Verified**: rar5 · stored
- **Size**: 244 GiB posted · 112 files · 354,351 segments · NZB 30.3 MB
- **Health**: 16/16 sampled articles present
- **Source**: `The.Umbrella.Academy.S01-S04.COMPLETE.VFF.4k.MULTI.Serpico.nzb`
- **sha256**: `62dcfe5c0a5e587f…`

### `rar-season-pack`

One RAR set per episode across a season: 600+ files, so import cost scales with set count rather than byte count.

- **Axes**: `rar5`, `stored`, `season-pack`, `many-volumes`
- **Verified**: rar5 · stored
- **Size**: 61.0 GiB posted · 612 files · 83,202 segments · NZB 7.6 MB
- **Health**: 16/16 sampled articles present
- **Source**: `The.Boys.S04.REPACK.2160p.AMZN.WEB-DL.DTS-HD.MA.5.1.HDR.H.265-Kitsune.nzb`
- **sha256**: `e7a063cc953efe01…`


## negative

Expected to fail on most applications. What is measured is *how* they fail.

### `rar4-compressed`

RAR4 with method m3 (genuinely compressed). Direct byte-range mapping is impossible; only an engine that decompresses can serve it. Most should fail; the question is whether they fail fast and say why.

- **Axes**: `rar4`, `compressed`, `not-streamable-without-decompression`
- **Verified**: rar4 · **compress-m3**
- **Size**: 3.1 GiB posted · 32 files · 8,728 segments · NZB 0.9 MB
- **Health**: 16/16 sampled articles present
- **Source**: `Project.Hail.Mary.2026.1080p.WEB-DL.x264.6CH-Pahe.in.mkv.nzb`
- **sha256**: `21f31a6b47f69f6f…`

### `rar5-mixed-compressed`

Mixed set: some members stored, the video compressed. Catches engines that check only the first member and then serve garbage.

- **Axes**: `rar5`, `mixed-store-and-compressed`
- **Verified**: rar5 · **store/compress-m3**
- **Size**: 1.9 GiB posted · 20 files · 5,368 segments · NZB 0.6 MB
- **Health**: 16/16 sampled articles present
- **Source**: `Undercover_Lover_S01E04_2026.nzb`
- **sha256**: `20e9ed151cd502d1…`

### `rar-encrypted-no-password`

The same post as `rar-hdrenc-large` with its password removed, a paired A/B where the only variable is the password. Seven of eight applications stream the source entry, so a refusal here is a real decision about a missing password rather than an application that could not open the archive anyway. Correct behaviour is a prompt, explicit "encrypted, no password"; accepting the import and stalling later is the failure this catches.

- **Axes**: `rar5`, `encrypted-headers`, `no-password-available`, `derived`
- **Verified**: rar5 · encrypted headers
- **Size**: 102 GiB posted · 341 files · 152,301 segments · NZB 13.6 MB
- **Health**: 16/16 sampled articles present
- **Obfuscation**: `opaque-subjects`
- **Source**: `Parasite.2019.GBR.BFI.Curzon.Artificial.Eye.aka.Gisaengchung.2160p.UHD.Blu.ray.HEVC.Atmos.TrueHD.7.1.TAiPAK-BD25.nzb`
- **sha256**: `80be0c5fb5075700…`


## stress

Pathological NZB structure or very large posts.

### `segment-per-file`

10,151 <file> elements each holding a single segment, all for one MKV. Breaks parsers that trust <file> boundaries as file boundaries, and is 10-13x slower than any other entry on every engine except AIOStreams. Opt-in: it costs ~20 minutes per full run to re-prove a known result.

- **Axes**: `direct-video`, `pathological-nzb`, `segment-per-file`
- **Verified**: matroska
- **Size**: 14.6 GiB posted · 10151 files · 10,151 segments · NZB 3.9 MB
- **Health**: 2/2 sampled articles present
- **Obfuscation**: `opaque-subjects`
- **Source**: `21 Blackjack (2008) [tmdb-8065] [1080p BDrip] [x264] [AC3 5 1 DUAL] [Subs- Spa, Eng] [16,5 Mbps].nzb`
- **sha256**: `e7ba483b33a0c039…`

### `huge-direct-pack`

Half a terabyte of directly-posted episodes with extensionless names. Import must stay cheap when the post is enormous but structurally simple.

- **Axes**: `direct-video`, `season-pack`, `extensionless`, `very-large`
- **Verified**: matroska
- **Size**: 513 GiB posted · 62 files · 744,439 segments · NZB 68.9 MB
- **Health**: 16/16 sampled articles present
- **Obfuscation**: `extensionless-names`
- **Source**: `Breaking.Bad.S01-S05.REPACK.COMPLETE.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-FraMeSToR.nzb`
- **sha256**: `1bc39aa594483cb9…`


## failure

Damaged or dead posts. Robustness only, never performance.

### `damaged-partial`

A single verified missing article in an otherwise intact 10 GiB release. Everything else in the failure tier is damaged enough to be rejected outright; this one must actually be served, so it is the only entry that measures what an engine does when a read lands on a hole: zero-fill, container-aware fill, stall, or hard error.

- **Axes**: `rar5`, `stored`, `missing-articles`, `single-hole`, `seek-into-hole`
- **Verified**: rar5 · stored · password in NZB
- **Size**: 10.3 GiB posted · 105 files · 15,572 segments · NZB 1.4 MB
- **Health**: 16/16 sampled articles present
- **Source**: `Invasion.2021.S02E01.2160p.ATVP.WEB-DL.Hybrid.H265.DV.HDR10_.DDP.Atmos.5.1.English-HONE.nzb`
- **sha256**: `18306f4d8424ed77…`

### `damaged-severe`

Measured 1/16 present. Should be rejected at import; an engine that starts streaming it will stall later.

- **Axes**: `rar5`, `encrypted-headers`, `missing-articles`, `severe-damage`
- **Verified**: rar5 · encrypted headers · password in NZB
- **Size**: 43.6 GiB posted · 225 files · 59,186 segments · NZB 5.8 MB
- **Health**: 1/16 sampled articles present
- **Source**: `Coco.2017.2160p.UHD.Remux.DV.HEVC.TrueHD.Atmos.7.1-playBD.nzb`
- **sha256**: `36db68fd763020ab…`

### `dead-post`

Every sampled article 430s. The fastest possible correct answer is a quick, explicit failure, so this measures how long each app takes to give up.

- **Axes**: `rar5`, `dead-post`, `all-articles-missing`
- **Verified**: n/a
- **Size**: 4.5 GiB posted · 10 files · 6,813 segments · NZB 0.6 MB
- **Health**: availability not sampled
- **Source**: `Silo.S01E01.Freedom.Day.1080p.ATVP.WEBRip.DDP5.1.x264-NTb.nzb`
- **sha256**: `42590ade47dc12f3…`

### `incomplete-archive-set`

Twenty-one RAR5 volumes whose last posted volume ends with an end-of-archive header carrying the continuation flag, so the archive states outright that it runs into a volume nobody posted. Every article resolves, which separates missing *volumes* from missing *articles*, and correct behaviour is to detect the shortfall at import. The set is also method 5 compressed, so an engine may reject it for either reason, and which one it reports says something about how far it got. Naming is the hardest in the corpus besides: all 21 files share one NZB subject, every name is a random 8-character stem with a plain `.rar`, and none carries a part number, so volume order exists only in the RAR5 volume-number headers.

- **Axes**: `rar5`, `compressed`, `missing-volumes`, `identical-subjects`, `no-volume-numbers-in-names`
- **Verified**: rar5 · **compress-m5**
- **Size**: 1.0 GiB posted · 21 files · 1,386 segments · NZB 0.1 MB
- **Health**: 16/16 sampled articles present
- **Obfuscation**: `extensionless-names`, `random-stems`, `unquoted-subjects`
- **Source**: `The.Falcon.And.The.Winter.Soldier.S01E01.2160p.WEB-DL.HDR.10bit.x265.HEVC.DDP5.1.Atmos-PHOCiS.mkv.nzb`
- **sha256**: `577c16628e1823d1…`

