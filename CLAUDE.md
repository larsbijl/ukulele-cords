# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the tool

No build step, no npm install. Pure browser app served as static files.

```bash
just          # start server at http://localhost:8765
just dev      # start server and open browser
just open     # open browser (server already running)
just scrape   # re-scrape all chords from ukulele-chords.com (~10 min, ~624 requests)
```

Or without just:

```bash
python3 -m http.server 8765
# open http://localhost:8765
```

## Architecture

Single-page tool: paste/extract text with bracketed chords → render ukulele fingering diagrams.

**Files:**
- `index.html` — markup
- `app.js` — all logic as plain globals (no modules)
- `chords_baritone.json` — baritone fingering dictionary, ~323 entries
- `chords_standard.json` — standard ukulele fingering dictionary
- `styles.css` — grid layout + `@media print`

**Vendored libraries:**
- `vendor/svguitar.umd.js` — chord diagram renderer (svguitar v2)
- `vendor/Sortable.min.js` — drag-and-drop reordering

## Chord extraction

Text uses inline bracket notation like `[Am] Today is [C] gonna be...`. Two extraction methods run on every input:

1. **Bracket scan** — regex `/\[([^\]]{1,12})\]/g`. First whitespace/slash token from each match is tested against `CHORD_REGEX`.
2. **Standalone lines** — lines grouped by Y coordinate, space-joined. Lines of 1–4 tokens that all match `CHORD_REGEX` and are ≤6 chars are treated as chord lines.

`CHORD_REGEX` handles compound qualities: `madd` (e.g. `Amadd9`), `m+` (e.g. `Am+7`), standard qualities, slash chords.

## chords_baritone.json schema

```json
{"name": "G", "frets": [0, 0, 0, 3], "barres": []}
```

- `frets`: 4 values for strings **D, G, B, E** (low to high). `0` = open.
- `barres`: array of `{"fret": N, "fromString": M, "toString": P}` where string 1 = high E (rightmost), string 4 = low D (leftmost). This is the **opposite** of `frets` array order — svguitar numbers strings right-to-left.
- **CRITICAL — barre fromString/toString order:** `fromString` must be the **leftmost** covered string (higher number, closer to D), and `toString` must be the **rightmost** (lower number, closer to E). svguitar positions the barre rect starting from `fromString`'s x-coordinate. Swapping them causes the barre to not span all intended strings. Example: to barre strings 2-4 (B, G, D), use `fromString:4, toString:2`.
- Finger mapping in `app.js`: `frets.map((f, i) => [4 - i, f])` converts frets array to svguitar's `[stringNumber, fret]` pairs.

## iOS WebKit SVG rendering quirk

**Symptom:** Chord diagrams render on desktop but show only the chord name label on iPhone (Chrome or Safari). No JS errors in console. Scripts load fine.

**Root cause:** svguitar checks the SVG element's pixel width internally at draw time. Inside a CSS grid, iOS WebKit has not resolved the column width to concrete pixels at that point — even after `appendChild` and even though `getBoundingClientRect()` returns the correct value immediately after. svguitar sees width=0 and silently skips rendering entirely. viewBox is never set on the SVG element.

Desktop Chrome forces synchronous layout on `appendChild`, so it never hits this. iOS WebKit defers it.

**Fix:** Set concrete `width` and `height` attributes directly on the SVG element before calling `.draw()`. Then reset to responsive sizing after:

```js
svg.setAttribute('width', '200')
svg.setAttribute('height', String(preH))   // preH = proportional estimate
// ...svguitar configure/chord/draw...
svg.style.width = '100%'
const w = svg.getBoundingClientRect().width
if (w) svg.style.height = Math.round(w * preH / 200) + 'px'
```

`preH` in this codebase is `Math.round(200 * (0.6 + actualFrets * 0.2))`.

**What does not work:**
- `height: auto` in CSS — iOS collapses SVG to 0px tall when no explicit height attribute
- `aspect-ratio` CSS — overridden by the missing height attribute
- `requestAnimationFrame` height fix — rAF runs after layout but draw already failed before it
- Reading `viewBox` after draw to compute ratio — viewBox is never set when draw fails

## iPhone Shortcuts automation

An iOS Shortcut turns a photo of a chord sheet into a live chord diagram page without any manual copy-paste.

**Steps in the Shortcut:**

1. Take photo (or receive one via Share Sheet).
2. Extract text from photo — using the built-in "Extract Text from Image" action (Live Text / Vision framework). This gives raw plain text including bracketed chords like `[Am]`, `[C]`, `[G7]`.
3. URL-encode the text — using "URL Encode" action.
4. Prepend base URL — using a Text block:
   ```
   https://larsbijl.github.io/ukulele-cords/?text=
   ```
   then append the encoded text.
5. Open URL — passes the assembled URL to Safari.

The app reads the `text` query param on load, extracts chords from it using the same two-method pipeline, and renders the diagrams.

**Why this works:** OCR preserves bracketed chord notation (`[Am]`) well enough for the bracket-scan extractor to find them. The `text` param is always last in the URL and the app reads everything after `text=` raw (not just `URLSearchParams`) to tolerate unencoded `&` characters that can appear inside embedded URLs in song sheets.

## Adding a missing chord

Edit `chords_baritone.json`. DGBE tuning is the same as the top 4 strings of a standard guitar, so guitar chord shapes translate directly. Unknown chords render as a yellow `?` card. The dictionary is fetched with a cache-buster (`?v=Date.now()`) on every page load.

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (90-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk vitest run          # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%)
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->