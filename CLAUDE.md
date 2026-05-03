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

**CDN globals used:**
- `svguitar.SVGuitarChord` — chord diagram renderer (svguitar v2, UMD from unpkg)

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
