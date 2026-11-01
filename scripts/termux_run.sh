#!/data/data/com.termux/files/usr/bin/bash
# Termux bootstrap. Put fetch_osm_all.py in your phone's Downloads folder, then run THIS file once:
#   bash ~/storage/downloads/termux_run.sh                      # everything (resumable)
#   bash ~/storage/downloads/termux_run.sh points3,cliffs3,hydro3   # only what the game uses
# It copies the script from Downloads, fetches the data, and copies the zip back to Downloads.
set -e
termux-setup-storage 2>/dev/null || true
for i in 1 2 3 4 5; do [ -d "$HOME/storage/downloads" ] && break; sleep 2; done   # wait for the storage permission
DL="$HOME/storage/downloads"
[ -d "$DL" ] || { echo "Allow storage access for Termux, then run this again."; exit 1; }
pkg install -y python zip >/dev/null 2>&1 || true
termux-wake-lock 2>/dev/null || true
mkdir -p "$HOME/osm" "$HOME/osm_all"
cp -f "$DL/fetch_osm_all.py" "$HOME/osm/fetch_osm_all.py" || { echo "fetch_osm_all.py not found in Downloads"; exit 1; }
ONLY="${1:-}"
python3 -I "$HOME/osm/fetch_osm_all.py" "$HOME/osm_all" ${ONLY:+--only="$ONLY"}
cd "$HOME/osm_all" && rm -f "$HOME/eswatini-osm-full.zip" && zip -q "$HOME/eswatini-osm-full.zip" ./*.json
cp -f "$HOME/eswatini-osm-full.zip" "$DL/eswatini-osm-full.zip"
echo "Done: $DL/eswatini-osm-full.zip ($(du -h "$DL/eswatini-osm-full.zip" | cut -f1))"
