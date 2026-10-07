# Line Rider 3D

A 3D take on the classic Line Rider, built with Three.js + TypeScript + Vite.
Draw tracks in a snowy landscape and watch Bosh sled down them. Works on desktop and mobile.

```bash
npm install
npm run dev            # http://localhost:5173 (also exposed on your LAN for phones)
npm run build          # type-check + production build in dist/
npm run test:physics   # headless physics runs (demo track + banked turn)
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

## Rider mode

Toggle the 🎮 button in the player bar to control Bosh:

- **→ / ↑** push (on a track, up to ~50 km/h) · **← / ↓** brake
- In the air the same keys **flip** Bosh forward / backward. Land clean to score:
  Frontflip / Backflip 1000, Double 4000, Triple 9000 (+ airtime), Big Air, rings +250.
- Touch screens get on-screen Push / Brake buttons.
- Inputs are recorded per frame, so runs stay deterministic: **Replay** shows exactly what you did,
  and rewinding the timeline then playing lets you retry from that moment.
- Best score is kept per track.

## Presentation

- Title screen with a live demo run and cinematic camera behind it
- Bloom, sky reflections, color grading, speed trail, snow particles, camera shake
- Procedural WebAudio sound (wind, runners, snow, crash, rings, bounces) and ambient music
- Live speed gauge, airtime, callouts and an end-of-run summary

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
| `src/game/` | Run statistics derived from the recorded simulation |

Tracks autosave to `localStorage`; use the ☰ menu to export/import JSON.
