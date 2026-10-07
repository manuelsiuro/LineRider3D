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
- Line types: **Track** (blue), **Boost** (red, accelerates along drawing direction), **Scenery** (green, no collision).
- Tools: Pencil, Line, Eraser, Bank (drag to tilt a track), Decor (pines, snowmen, cabins…), Start flag, Camera.
- Timeline scrubbing is exact: the simulation is deterministic at 40 steps/s and every frame is recorded.

## Code map

| Path | Role |
| --- | --- |
| `src/track/` | Track data, stroke frames (banking), spatial hash, (de)serialization |
| `src/physics/` | Verlet ragdoll rider (`Rider.ts`) and recorded fixed-step `Simulation.ts` |
| `src/render/` | Ribbon meshes, track/decor sync, Bosh model, camera rig |
| `src/editor/` | Drawing plane, snapping, tools, undo/redo |
| `src/world/` | Sky, terrain, mountains, forest, snowfall, procedural decor models |
| `src/ui/` | HTML overlay (toolbar, player, menus) |

Tracks autosave to `localStorage`; use the ☰ menu to export/import JSON.
