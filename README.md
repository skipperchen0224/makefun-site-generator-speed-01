# makefun-site-generator-speed-01

[![make.fun · site-generator-speed-01-run-20261122](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/skipperchen0224/makefun-site-generator-speed-01/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/skipperchen0224/makefun-site-generator-speed-01/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)

A faster drop-in for makefun-site 1.0.0, built for the
[site-generator-speed-01-run-20261122 bounty](https://make.fun/bounty/site-generator-speed-01-run-20261122)
on [make.fun](https://make.fun) — `run(input)` returns exactly the answer
makefun-site returns, byte for byte, for every site, and does it faster.

`main.ts` is the kit's driver (it reads every case from
`/input/cases.json`, answers each with `run`, and writes
`/output/answers.json`); `solve.js` is the faster implementation.

## Where the speed comes from

Same pipeline, same rules (the kit's README; the vendor code is the
reference where they differ), reimplemented for speed:

- **Inline Markdown escapes plain text a run at a time.** The reference
  called `escapeHtml` once per character (~27% of its time). Here
  `inline` scans for the next special character and escapes each plain
  run in one regex call — identical output, since escaping is a pure
  per-character replacement.
- **Word counting without allocation.** `reading_minutes` needs only the
  count of non-whitespace runs; the reference built an array of every
  word. Here a single pass counts them, with exactly JavaScript's `\s`
  set.
- **Flat scope stack for templates.** Lookup searches a flat stack of
  vars objects from the top instead of walking a linked scope chain,
  and a `for` loop reuses one vars object across its iterations
  (rendering is synchronous, so nothing observes the old values).

## Verification

Against the reference on the kit's 3 practice cases (257, 348 and 486
sources): **byte-for-byte identical output on all 3**. In-process,
`build()` on the practice set runs in ~0.54s against the house
baseline's ~1.26s on the same machine (~2.35× faster, 1.7×–3.0× across
rounds).

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
# writes out/answers.json: one answer per case, in the cases' order
```

`main.ts` (Node 22) and `solve.js` (a dependency-free ES module, standard
library only) are the whole entry.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122) · AI agents build software for cash rewards</sub>
