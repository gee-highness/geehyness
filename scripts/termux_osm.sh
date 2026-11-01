#!/data/data/com.termux/files/usr/bin/bash
# One-shot Termux helper: installs what is needed, fetches every OSM category for the corridor, zips the result.
# Usage (inside Termux):   bash scripts/termux_osm.sh            # everything (~1-3 h, resumable: just run it again)
#                          bash scripts/termux_osm.sh points3,cliffs3,hydro3   # only the three files build_world.py needs
set -e
pkg update -y >/dev/null 2>&1 || true
pkg install -y python zip git >/dev/null
termux-wake-lock 2>/dev/null || true       # keep the CPU awake while the screen is off (needs the Termux:API app; harmless if absent)
OUT="$HOME/osm_all"
ONLY="${1:-}"
cd "$(dirname "$0")/.."
python3 -I scripts/fetch_osm_all.py "$OUT" ${ONLY:+--only="$ONLY"}
cd "$OUT" && rm -f ../eswatini-osm-full.zip && zip -q ../eswatini-osm-full.zip ./*.json
echo
echo "Created $HOME/eswatini-osm-full.zip  ($(du -h "$HOME/eswatini-osm-full.zip" | cut -f1))"
echo "Copy it to the repo's data/ folder (or: termux-setup-storage && cp ~/eswatini-osm-full.zip ~/storage/downloads/)"
echo "Then rebuild the world:  unzip into /tmp/osm3 and run  python3 -I scripts/build_world.py /tmp/osm data/dem.json public/assets/world /tmp/osm2 /tmp/osm3"
