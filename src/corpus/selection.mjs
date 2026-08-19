// The curated corpus.
//
// Entries are chosen from measured evidence (corpus/analysis.json for structure,
// corpus/probe.json for live archive headers and article availability), never from a
// filename. `match` is a substring resolved against corpus/pool and must be unique.
//
// Tiers control what a run includes:
//   smoke    small and healthy; cheap enough to run while iterating
//   core     the main capability and performance matrix
//   stress   pathological NZB structure or very large posts
//   negative expected to fail; what is measured is how it fails
//   failure  damaged or dead posts; robustness only, never performance
//
// `expect` ('serve' or 'reject') defaults from the tier in select.mjs.

export const SELECTION = [
  // ---------------------------------------------------------------- smoke
  {
    id: 'plain-small',
    match: 'Summers.Last.Resort.2026.720p.WEB.H264-OUTPOST31-x',
    tier: 'smoke',
    axes: ['direct-video', 'no-archive'],
    why: 'Control. A bare MKV posted directly, small and healthy, so fixed per-request overhead is visible without archive work confusing the number.',
  },
  {
    id: 'rar-named-small',
    match: 'Gilmore.Girls.2000.S01E17',
    tier: 'smoke',
    axes: ['rar5', 'stored', 'named-volumes', 'partNN'],
    why: 'Control for archive handling: conventionally named RAR5 stored set, small enough to run every iteration.',
  },
  {
    id: 'rar-hdrenc-small',
    match: 'My.Little.Pony.n.Friends.S01E01',
    tier: 'smoke',
    axes: ['rar5', 'encrypted-headers', 'password-in-nzb'],
    why: 'Cheapest header-encrypted RAR5 in the pool. Requires reading the NZB password meta before the volume list can be parsed at all.',
  },
  {
    id: '7z-obfuscated-small',
    match: 'Yu-Gi-Oh.GX.S02E07',
    tier: 'smoke',
    axes: ['7z', 'obfuscated-names', 'extensionless', 'password-in-nzb'],
    why: 'Tiny fully-obfuscated 7z: hex stems, no extensions. Exercises name-independent volume grouping for pennies.',
  },

  // ---------------------------------------------------------------- core
  {
    id: 'plain-medium',
    match: 'Masters.of.the.Universe.2026.NORDiC',
    tier: 'core',
    axes: ['direct-video', 'no-archive'],
    why: 'Direct MKV at a realistic movie size: the throughput ceiling case with no archive layer in the way.',
  },
  {
    id: 'plain-season-pack',
    match: 'Dexter.2006.S02.PROPER',
    tier: 'core',
    axes: ['direct-video', 'season-pack', 'file-selection'],
    why: 'Twelve separate MKVs in one NZB. Tests episode selection when there is no archive to enumerate.',
  },
  {
    id: 'rar-stored-movie',
    match: 'District.9.2009.2160p.MA.WEB-DL',
    tier: 'core',
    axes: ['rar5', 'stored', 'named-volumes'],
    why: 'The single most common real-world shape: a stored RAR5 set with normal part numbering, at movie scale.',
  },
  {
    id: 'rar4-stored',
    match: 'Dont.Be.Afraid.of.the.Dark.2010.BRRip',
    tier: 'core',
    axes: ['rar4', 'stored', 'rar+rNN'],
    why: 'RAR4 coverage. RAR4 file headers carry no volume ordinal, so ordering must come from names or tail evidence.',
  },
  {
    id: 'rar4-inner-obfuscated',
    match: 'Lucky.2019.720p.AMZN',
    tier: 'core',
    axes: ['rar4', 'stored', 'obfuscated-inner-name'],
    why: 'RAR4 whose *inner* filename is a hex blob while the volumes are named normally, the reverse of the usual obfuscation.',
  },
  {
    id: 'rar-identity-grouped',
    match: 'Teri.Meri.Kahaani.2012',
    tier: 'core',
    axes: ['rar5', 'stored', 'extensionless', 'per-file-unique-stems'],
    why: 'Every volume posted under a different random stem with no extension, so volumes can only be grouped by their inner RAR header identity, not by name.',
  },
  {
    id: 'rar4-obfuscated-volumes',
    match: '23.000.Lives.2026',
    tier: 'core',
    axes: ['rar4', 'extensionless', 'random-stems'],
    why: 'RAR4 with obfuscated volume names: no ordinal in the header and no usable name scheme at once.',
  },
  {
    id: 'rar-numeric-extensions',
    match: 'Dune.Part.One.2021.2160p.UHD.B[luRay.Remux.HEVC.DoVi',
    tier: 'core',
    axes: ['rar5', 'stored', 'numeric-extensions', 'hex-names'],
    why: 'Volumes named <hex>.1 to <hex>.193, neither .partNN nor .rNN. Breaks classifiers that pattern-match extensions.',
  },
  {
    id: '7z-plain-header',
    match: 'The.Big.Bang.Theory.S08E08',
    tier: 'core',
    axes: ['7z', 'plain-header', 'stored'],
    why: '7z control: uncompressed metadata header, so inner names are readable without decoding anything.',
  },
  {
    id: '7z-plain-large',
    match: 'Unbreakable.2000.UHD.BluRay',
    tier: 'core',
    axes: ['7z', 'plain-header'],
    why: 'Same shape as the 7z control but an order of magnitude larger, to separate per-request cost from per-byte cost.',
  },
  {
    id: '7z-split-compressed-header',
    match: 'Dune.2021.UHD.BluRay.2160p.TrueHD.Atmos.7.1.DV.HEVC.REMUX-FraMeSToR',
    tier: 'core',
    axes: ['7z', 'split-7z.NNN', 'compressed-header', 'password-in-nzb'],
    why: 'Split .7z.NNN set whose metadata header is LZMA-packed at the tail of the last volume, so the header cannot be read from volume 1.',
  },
  {
    id: '7z-header-encrypted',
    match: 'Dilwale.Dulhania.Le.Jayenge.1995',
    tier: 'core',
    axes: ['7z', 'header-encrypted', 'aes', 'password-in-nzb'],
    why: 'True -mhe=on 7z: the metadata header itself is AES encrypted. Nothing can be enumerated without applying the NZB password first.',
  },
  {
    id: 'rar-hdrenc-large',
    match: 'Parasite.2019.GBR.BFI',
    tier: 'core',
    axes: ['rar5', 'encrypted-headers', 'password-in-nzb'],
    why: 'Header-encrypted RAR5 at disc scale, for encrypted-header handling under a large volume count.',
  },
  {
    id: 'rar-hdrenc-obfuscated',
    match: 'The.Lord.of.the.Rings.The.Return.Of.The.King.2003.EXTENDED.2160p.UHD.DOLBY',
    tier: 'core',
    axes: ['rar5', 'encrypted-headers', 'extensionless', 'random-stems', 'password-in-nzb'],
    why: 'The hardest RAR case in the pool: encrypted headers AND obfuscated volume names, so neither names nor plaintext headers can order the set.',
  },
  {
    id: '7z-obfuscated-large',
    match: 'Dune.Part.One.2021.2160p.UHD.Blu-ray.Remux.HEVC.TrueHD.7.1.Atmos-SiCFoI',
    tier: 'core',
    axes: ['7z', 'obfuscated-names', 'extensionless', 'password-in-nzb'],
    why: 'Large fully-obfuscated split 7z. Historically a divergence point between engines, which makes it a good capability discriminator.',
  },
  {
    id: '7z-obfuscated-hotd',
    match: 'House.of.the.Dragon.S01E01.The.Heirs.of.the.Dragon.UHD.BluRay',
    tier: 'core',
    axes: ['7z', 'obfuscated-names', 'extensionless', 'password-in-nzb'],
    why: 'Second obfuscated-7z sample from a different poster, to tell a general capability apart from one release-specific quirk.',
  },
  {
    id: 'rar-nested-iso',
    match: 'Superman.2025.MULTi.COMPLETE.UHD.BLURAY-AKENATON',
    tier: 'core',
    axes: ['rar4', 'stored', 'nested-archive', 'iso'],
    why: 'A full UHD ISO stored inside a RAR4 set: streaming requires descending one container level and finding the playlist inside the ISO.',
  },
  {
    id: 'rar-inner-tree',
    match: 'The.Umbrella.Academy.S01-S04.COMPLETE',
    tier: 'core',
    axes: ['rar5', 'stored', 'inner-directory-tree', 'file-selection'],
    why: 'A whole multi-season directory tree inside one RAR set, for inner-file enumeration and selection, not just "the one big file".',
  },
  {
    id: 'rar-season-pack',
    match: 'The.Boys.S04.REPACK.2160p.AMZN.WEB-DL.DTS-HD.MA.5.1.HDR.H.265-Kitsune.nzb',
    tier: 'core',
    axes: ['rar5', 'stored', 'season-pack', 'many-volumes'],
    why: 'One RAR set per episode across a season: 600+ files, so import cost scales with set count rather than byte count.',
  },

  // ---------------------------------------------------------------- negative
  {
    id: 'rar4-compressed',
    match: 'Project.Hail.Mary.2026.1080p.WEB-DL.x264.6CH-Pahe',
    tier: 'negative',
    axes: ['rar4', 'compressed', 'not-streamable-without-decompression'],
    why: 'RAR4 with method m3 (genuinely compressed). Direct byte-range mapping is impossible; only an engine that decompresses can serve it. Most should fail; the question is whether they fail fast and say why.',
  },
  {
    id: 'rar5-mixed-compressed',
    match: 'Undercover_Lover_S01E04_2026',
    tier: 'negative',
    axes: ['rar5', 'mixed-store-and-compressed'],
    why: 'Mixed set: some members stored, the video compressed. Catches engines that check only the first member and then serve garbage.',
  },
  {
    id: 'rar-encrypted-no-password',
    // Derived: `rar-hdrenc-large` with the password meta deleted (see select.mjs).
    match: 'Parasite.2019.GBR.BFI.Curzon.Artificial.Eye',
    transform: 'strip-password',
    tier: 'negative',
    axes: ['rar5', 'encrypted-headers', 'no-password-available', 'derived'],
    why: 'The same post as `rar-hdrenc-large` with its password removed, a paired A/B where the only variable is the password. Seven of eight applications stream the source entry, so a refusal here is a real decision about a missing password rather than an application that could not open the archive anyway. Correct behaviour is a prompt, explicit "encrypted, no password"; accepting the import and stalling later is the failure this catches.',
  },

  // ---------------------------------------------------------------- stress
  {
    id: 'segment-per-file',
    match: '21 Blackjack (2008)',
    tier: 'stress',
    axes: ['direct-video', 'pathological-nzb', 'segment-per-file'],
    optional: true,
    why: '10,151 <file> elements each holding a single segment, all for one MKV. Breaks parsers that trust <file> boundaries as file boundaries, and is 10-13x slower than any other entry on every engine except AIOStreams. Opt-in: it costs ~20 minutes per full run to re-prove a known result.',
  },
  {
    id: 'huge-direct-pack',
    match: 'Breaking.Bad.S01-S05.REPACK',
    tier: 'stress',
    axes: ['direct-video', 'season-pack', 'extensionless', 'very-large'],
    why: 'Half a terabyte of directly-posted episodes with extensionless names. Import must stay cheap when the post is enormous but structurally simple.',
  },

  // ---------------------------------------------------------------- failure
  {
    id: 'damaged-partial',
    match: 'Invasion.2021.S02E01.2160p.ATVP.WEB-DL.Hybrid',
    tier: 'failure',
    // Overrides the tier default: 0.0064% of this release is missing, so refusing to
    // serve it is itself a failure, and an import that never happens measures nothing.
    expect: 'serve',
    axes: ['rar5', 'stored', 'missing-articles', 'single-hole', 'seek-into-hole'],
    why: 'A single verified missing article in an otherwise intact 10 GiB release. Everything else in the failure tier is damaged enough to be rejected outright; this one must actually be served, so it is the only entry that measures what an engine does when a read lands on a hole: zero-fill, container-aware fill, stall, or hard error.',
    knownHole: {
      volume: 'part013.rar',
      segmentNumber: 20,
      // Offset within the assembled inner file, which is the space every app serves.
      // Re-derive by summing PackSize over the preceding volumes' RAR5 file headers and
      // adding the hole's position inside its own volume, taken from the yEnc =ypart
      // lines of the articles either side of it, less that volume's header bytes.
      offsetBytes: 1347403568,
      missingBytes: 716800,
      uncertaintyBytes: 0,
      fractionOfFile: 0.122702,
      // Hashes of the true bytes either side of the gap, decoded from the articles that
      // do exist. measureHole compares against these so a wrong offset cannot be mistaken
      // for an engine that reconstructed the range.
      anchorBytes: 262144,
      preHoleSha256: '9b4afd9aefa2662f6e1fee87455951a90cb31ca1c5bbb8a88855e592c6efd5d8',
      postHoleSha256: 'af26eb1873eefb24732f8793b1dfb59513d5ee804f8edd7b8437a4a632a0621b',
    },
  },
  {
    id: 'damaged-severe',
    match: 'Coco.2017.2160p.UHD.Remux',
    tier: 'failure',
    axes: ['rar5', 'encrypted-headers', 'missing-articles', 'severe-damage'],
    why: 'Measured 1/16 present. Should be rejected at import; an engine that starts streaming it will stall later.',
  },
  {
    id: 'dead-post',
    match: 'Silo.S01E01.Freedom.Day',
    tier: 'failure',
    axes: ['rar5', 'dead-post', 'all-articles-missing'],
    why: 'Every sampled article 430s. The fastest possible correct answer is a quick, explicit failure, so this measures how long each app takes to give up.',
  },
  {
    id: 'incomplete-archive-set',
    match: 'The.Falcon.And.The.Winter.Soldier.S01E01',
    tier: 'failure',
    axes: ['rar5', 'compressed', 'missing-volumes', 'identical-subjects', 'no-volume-numbers-in-names'],
    why: 'Twenty-one RAR5 volumes whose last posted volume ends with an end-of-archive header carrying the continuation flag, so the archive states outright that it runs into a volume nobody posted. Every article resolves, which separates missing *volumes* from missing *articles*, and correct behaviour is to detect the shortfall at import. The set is also method 5 compressed, so an engine may reject it for either reason, and which one it reports says something about how far it got. Naming is the hardest in the corpus besides: all 21 files share one NZB subject, every name is a random 8-character stem with a plain `.rar`, and none carries a part number, so volume order exists only in the RAR5 volume-number headers.',
  },
];

// Checking whether an archive set is complete: walk the block chain of the highest
// numbered volume to its end-of-archive header and read the continuation flag. Size
// arithmetic does not answer this, because packed and unpacked sizes differ for anything
// compressed, and in RAR5 the compression method is bits 7-9 of CompressionInfo rather
// than the low bits.
