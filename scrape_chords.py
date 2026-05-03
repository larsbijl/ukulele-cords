#!/usr/bin/env python3
"""
Scrape ukulele-chords.com for baritone (DGBE) and soprano (GCEA) chord fingerings.
Baritone: https://ukulele-chords.com/baritone/{ChordName}
Soprano:  https://ukulele-chords.com/{ChordName}

Captures:
  frets   - fret positions per string (low to high), -1 = muted
  fingers - which finger (1=index,2=middle,3=ring,4=pinky,0=open/muted)
  barres  - inferred barre indicators for svguitar
"""

import requests
import json
import time
import re
import sys

ROOTS = ['A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab']

CHORD_SUFFIXES = [
    '',       # major
    'm',      # minor
    'aug',    # augmented
    'dim',    # diminished
    '5',      # power chord
    '7',      # dominant 7
    'm7',     # minor 7
    'maj7',   # major 7
    'aug7',   # augmented 7
    'dim7',   # diminished 7
    'mMaj7',  # minor major 7
    'm7b5',   # half-diminished
    'sus2',   # suspended 2
    'sus4',   # suspended 4
    '7sus2',  # 7 suspended 2
    '7sus4',  # 7 suspended 4
    '9',      # 9th
    'maj9',   # major 9th
    '11',     # 11th
    'm11',    # minor 11th
    '13',     # 13th
    'm13',    # minor 13th
    '6',      # 6th
    'm6',     # minor 6th
    'add9',   # add 9th
    'm9',     # minor 9th
]

SESSION = requests.Session()
SESSION.headers.update({'User-Agent': 'Mozilla/5.0 (compatible; chord-scraper/1.0)'})


def parse_frets(text):
    """Parse fret positions from ChordGenerator call or 'played' meta tag."""
    m = re.search(r'ChordGenerator\("([\d,x-]+)"', text)
    if not m:
        m = re.search(r"played '([\d,x]+)'", text)
    if not m:
        return None
    parts = m.group(1).split(',')
    if len(parts) != 4:
        return None
    frets = []
    for p in parts:
        p = p.strip().lower()
        if p in ('x', '-1'):
            frets.append(-1)
        else:
            frets.append(int(p))
    return frets


def parse_fingers(text, frets):
    """
    Parse finger assignments from finger_N class elements.
    finger_N elements appear in string order for fretted strings only.
    Open (0) and muted (-1) strings get finger=0.
    """
    raw = re.findall(r'class="finger_(\d)"', text)
    fingers = []
    fi = 0
    for fret in frets:
        if fret > 0 and fi < len(raw):
            fingers.append(int(raw[fi]))
            fi += 1
        else:
            fingers.append(0)
    return fingers


def infer_barres(frets):
    """
    Infer barre positions from fret array.
    svguitar string numbering: string 1 = high E (rightmost), string 4 = low D (leftmost).
    frets array is [D, G, B, E] = svguitar strings [4, 3, 2, 1].
    """
    non_zero = [f for f in frets if f > 0]
    if not non_zero:
        return []

    min_fret = min(non_zero)
    positions = [i for i, f in enumerate(frets) if f == min_fret]

    if len(positions) < 2:
        return []

    is_consecutive = all(positions[i+1] == positions[i]+1 for i in range(len(positions)-1))
    if not is_consecutive:
        return []

    svguitar_strings = [4, 3, 2, 1]
    from_str = svguitar_strings[positions[0]]
    to_str = svguitar_strings[positions[-1]]

    return [{"fret": min_fret, "fromString": to_str, "toString": from_str}]


def fetch_chord(url):
    """Fetch a chord page and return dict with frets, fingers, barres or None."""
    try:
        resp = SESSION.get(url, timeout=10)
        if resp.status_code != 200:
            return None

        text = resp.text
        frets = parse_frets(text)
        if frets is None:
            return None

        fingers = parse_fingers(text, frets)
        barres = infer_barres(frets)

        return {"frets": frets, "fingers": fingers, "barres": barres}

    except Exception as e:
        print(f"  Error {url}: {e}", file=sys.stderr)
        return None


def scrape_tuning(label, url_prefix, output_file):
    print(f"\n=== Scraping {label} ===")
    chords = []
    total = len(ROOTS) * len(CHORD_SUFFIXES)
    done = 0
    skipped = 0

    for root in ROOTS:
        for suffix in CHORD_SUFFIXES:
            name = root + suffix
            url = url_prefix + name
            result = fetch_chord(url)
            done += 1

            if result is None:
                skipped += 1
            else:
                chord = {"name": name, **result}
                chords.append(chord)
                print(f"  {name}: frets={result['frets']} fingers={result['fingers']}")

            if done % 50 == 0:
                print(f"  --- {done}/{total} done, {skipped} skipped ---", file=sys.stderr)

            time.sleep(0.3)

    print(f"\nFetched {len(chords)}, skipped {skipped}")
    with open(output_file, 'w') as f:
        json.dump(chords, f, indent=2)
    print(f"Saved to {output_file}")
    return chords


if __name__ == '__main__':
    scrape_tuning(
        'Baritone (DGBE)',
        'https://ukulele-chords.com/baritone/',
        '/tmp/chords_baritone_scraped.json'
    )
    scrape_tuning(
        'Soprano (GCEA)',
        'https://ukulele-chords.com/',
        '/tmp/chords_soprano_scraped.json'
    )
    print("\nDone.")
