# SHESHA — Eswatini Open-Road Racing

Angular 21 + three.js open-world racer set on Eswatini's MR3 corridor.

- Run: `npm install --legacy-peer-deps && npm run dev`
- Real assets (CC0, Poly Haven): `public/assets/tex` (asphalt, grass), `public/assets/hdri/sky.hdr`. See `public/assets/CREDITS.txt`.
- Procedural: road markings, signage, shop banners, vehicles (`src/app/game/graphics`).
- `scripts/` holds the OSM/Blender world-prep pipeline and game plan.
- `legacy-archive.zip` holds the previous repo contents.

## Offline / install / deploy
- **Vercel:** import repo; `vercel.json` handles build + static output. Open the site once online → browser offers *Install*; after that it runs fully offline (service worker precaches all 165 files, ~110 MB).
- **Arch Linux native app (offline):** `npm install --legacy-peer-deps && npm run dist:linux` → `release/` has an AppImage, `.pacman` (`sudo pacman -U release/*.pacman`) and `.tar.gz`. Quick run without packaging: `npm run build && npm run desktop`. F11 = fullscreen.
- **Downloads:** push a tag (`git tag v0.1.0 && git push origin v0.1.0`) or run the *Release* workflow manually; it builds and attaches the AppImage / pacman / tar.gz to the GitHub Releases page.
- **Windows:** `npm install --legacy-peer-deps && npm run dist:win` → `release/` has an installer (`Shesha Setup *.exe`) and a portable `.exe`. The Release workflow builds both on a Windows runner and attaches them to the release.
- **Look:** the chunky low-poly look is now optional: the default is a clean full-resolution render; press **Y** to toggle the retro look (reloads the page).
