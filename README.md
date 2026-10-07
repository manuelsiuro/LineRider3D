# Line Rider 3D

A 3D take on the classic Line Rider, built with Three.js + TypeScript + Vite.
Draw tracks in a snowy landscape and watch Bosh sled down them. Works on desktop and mobile.

```bash
npm install
npm run dev            # http://localhost:5173 (also exposed on your LAN for phones)
npm run build          # type-check + production build in dist/
npm run test:physics   # headless checks: physics, controls, scoring, ghosts, every level
```

## How it plays

- **Profile mode**: draw on a vertical plane facing the camera, like classic Line Rider.
  Orbit the camera to turn the plane (snaps every 15°), or lock it.
- **Path mode**: draw on a horizontal plane; the ribbon descends with the chosen grade
  and turns are **auto-banked** inward like a bobsled run.
- Start a stroke on another track's endpoint (orange ring) to connect them.
- Tracks are one-sided: the colored face is solid (draw left → right for a floor).
- Line types: **Track** (blue), **Boost** (red, accelerates along drawing direction), **Ice** (no friction, no sideways grip),
  **Bouncy** (trampoline), **Scenery** (green, no collision).
- **Boost rings**: place a golden hoop on a track or in the air; riding through it launches Bosh.
- Tools: Pencil, Line, Eraser, Bank (drag to tilt a track), Decor (pines, snowmen, cabins…), Ring, Start flag, Camera.
- Timeline scrubbing is exact: the simulation is deterministic at 40 steps/s and every frame is recorded.

## Game modes

- **Play**: eight built-in levels (First Run → Grand Finale), each teaching a mechanic. Every level has
  three goals (reach the finish, collect all stars, reach the target score) worth one star each.
  A star on a level unlocks the next; total stars unlock outfits for Bosh in the **Wardrobe**.
- **Create**: the track editor. Add stars, boost rings and a finish gate with the **Items** tool and set
  the target score, then share it.
- **Share**: the ⤴ button (or ☰ › Share link) puts the whole track in a link. From a run summary,
  **Challenge** shares the track with your score to beat.

## Rider mode

Toggle the 🎮 button in the player bar to control Bosh:

- **→ / ↑** push (on a track, up to ~50 km/h) · **← / ↓** brake
- In the air the same keys **flip** Bosh forward / backward; release to stop spinning.
  Landing mid-spin is a wipeout. Frontflip / Backflip 1000, Double 4000, Triple 9000 (+ airtime),
  Big Air, rings +250.
- **Landing grades**: Perfect ×2 (flat on the slope, not spinning), Good ×1, Sketchy ×½.
- **Combos**: tricks, rings and stars chained within 3.5 s raise a multiplier up to ×5.
- **Ghost**: your best run on each track rides alongside you as a translucent Bosh.
- Touch screens get on-screen Push / Brake buttons.
- Inputs are recorded per frame, so runs stay deterministic: **Replay** shows exactly what you did,
  and rewinding the timeline then playing lets you retry from that moment.
- Best score is kept per track.

## Presentation

- Title screen with a live demo run and cinematic camera behind it
- Bloom, sky reflections, color grading, speed trail, snow particles, camera shake
- Procedural WebAudio sound (wind, runners, snow, crash, rings, bounces) and ambient music
- Live speed gauge, airtime, combo meter, callouts and an end-of-run summary with a 3-star rating
- Bullet time on big landings and slow-motion wipeouts

## Code map

| Path | Role |
| --- | --- |
| `src/track/` | Track data, stroke frames (banking), spatial hash, (de)serialization |
| `src/physics/` | Verlet ragdoll rider (`Rider.ts`) and recorded fixed-step `Simulation.ts` |
| `src/render/` | Ribbon meshes, track/decor sync, Bosh model, camera rig |
| `src/editor/` | Drawing plane, snapping, tools, undo/redo |
| `src/world/` | Sky, terrain, mountains, forest, snowfall, procedural decor models |
| `src/ui/` | HTML overlay: title, HUD, toolbar, dialogs, SVG icons |
| `src/audio/` | Procedural sound effects and music |
| `src/game/` | Run stats & scoring, rating, ghosts, progress/outfits, share links |
| `src/levels/` | Built-in levels and the builders that shape them from measured physics |

Tracks autosave to `localStorage`; use the ☰ menu to export/import JSON.
