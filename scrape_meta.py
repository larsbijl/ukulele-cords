#!/usr/bin/env python3
"""
Patch existing chord JSON files with difficulty (1-10) and importance string
scraped from ukulele-chords.com.
Runs fast — one request per chord, same URLs as main scraper.
"""

import requests
import json
import time
import re
import sys

SESSION = requests.Session()
SESSION.headers.update({'User-Agent': 'Mozilla/5.0 (compatible; chord-meta/1.0)'})


def fetch_meta(url):
    try:
        resp = SESSION.get(url, timeout=10)
        if resp.status_code != 200:
            return None
        text = resp.text

        diff_m = re.search(r'progress-meter-text">(\d+)/10', text)
        difficulty = int(diff_m.group(1)) if diff_m else None

        imp_m = re.search(r'Importance.*?progress-meter-text">(.*?)</span>', text, re.DOTALL)
        importance = imp_m.group(1).strip() if imp_m else None

        return {'difficulty': difficulty, 'importance': importance}
    except Exception as e:
        print(f'  Error {url}: {e}', file=sys.stderr)
        return None


def patch(json_file, url_prefix):
    print(f'\n=== Patching {json_file} ===')
    chords = json.load(open(json_file))
    total = len(chords)

    for i, chord in enumerate(chords):
        name = chord['name']
        url = url_prefix + name
        meta = fetch_meta(url)

        if meta:
            chord['difficulty'] = meta['difficulty']
            chord['importance'] = meta['importance']
            print(f'  {name}: diff={meta["difficulty"]} importance={meta["importance"]}')
        else:
            chord['difficulty'] = None
            chord['importance'] = None
            print(f'  {name}: FAILED', file=sys.stderr)

        if (i + 1) % 50 == 0:
            print(f'  --- {i+1}/{total} ---', file=sys.stderr)

        time.sleep(0.3)

    with open(json_file, 'w') as f:
        json.dump(chords, f, indent=2)
    print(f'Saved {json_file}')


if __name__ == '__main__':
    patch('chords.json', 'https://ukulele-chords.com/baritone/')
    patch('chords_standard.json', 'https://ukulele-chords.com/')
    print('\nDone.')
