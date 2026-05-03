default: serve

# Start the dev server at http://localhost:8765
serve:
    python3 -m http.server 8765

# Start the dev server and open the browser
dev:
    open http://localhost:8765 &
    python3 -m http.server 8765

# Re-scrape all chords from ukulele-chords.com (baritone + soprano, ~10 min)
scrape:
    python3 scrape_chords.py

# Patch chord files with difficulty + importance metadata (faster than full scrape)
scrape-meta:
    python3 scrape_meta.py

# Open the app in the browser (server must already be running)
open:
    open http://localhost:8765
