import { checkpoint, cosine, finish, forest, hazard, home, landing, profile, star, start } from '../builders';
import type { LevelDef } from '../levels';
import type { PuzzleDef } from '../puzzles';

/** Volcano: its levels (in play order) and puzzles. */
export const levels: LevelDef[] = [
  {
    id: 'ember-run',
    name: 'Ember Run',
    difficulty: 3,
    world: { biome: 'volcano', time: 'sunset', weather: 'clear' },
    tip: 'Black rock and rivers of fire. The cracked bridge only holds for a moment, so keep your speed!',
    build(t) {
      t.clear();
      home(t, { biome: 'volcano' });
      const h = cosine(30, 14, -2, 44);
      profile(t, h, -2, 44);
      profile(t, () => 14, 44, 52);
      // A crumbling bridge over a lava pit: lava geysers below it.
      profile(t, () => 14, 52, 70, 'crumble');
      hazard(t, 'lava', 57, 0, 0);
      hazard(t, 'lava', 65, 0, 0);
      profile(t, () => 14, 70, 78);
      profile(t, (x) => 14 + 0.08 * (x - 78) ** 2, 78, 82);
      start(t, 0, h(0));
      for (const x of [18, 32]) star(t, x, h(x) + 1.3);
      star(t, 61, 15.3);
      const l = landing(t, 82, 15.28, 3, 6);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 30);
      finish(t, l.end + 22, l.flat);
      t.targetScore = 6000;
      forest(t, -6, l.end + 36, 71, ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'], 5, 8);
    },
  },
  {
    id: 'ash-chute',
    name: 'Ash Chute',
    difficulty: 3,
    world: { biome: 'volcano', time: 'night', weather: 'ash' },
    tip: 'A long run down the ash slopes, with a checkpoint halfway. Fly over the geysers in the pits.',
    build(t) {
      t.clear();
      home(t, { biome: 'volcano' });
      const h = cosine(40, 24, -2, 40);
      profile(t, h, -2, 40);
      profile(t, (x) => 24 + 0.08 * (x - 40) ** 2, 40, 44);
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      // First jump: geysers burn in the pit under the flight.
      const l1 = landing(t, 44, 25.28, 4, 16);
      hazard(t, 'lava', 50, 0);
      star(t, l1.top, l1.arc(l1.top) + 0.3);
      profile(t, () => l1.flat, l1.end, l1.end + 10);
      checkpoint(t, l1.end + 6, l1.flat);
      // A crumbling run, then the second jump.
      const c0 = l1.end + 10;
      profile(t, () => l1.flat, c0, c0 + 16, 'crumble');
      const k = c0 + 16;
      profile(t, () => l1.flat, k, k + 4);
      profile(t, (x) => l1.flat + 0.08 * (x - k - 4) ** 2, k + 4, k + 8);
      star(t, c0 + 8, l1.flat + 1.3);
      const l2 = landing(t, k + 8, l1.flat + 1.28, 3, 6);
      hazard(t, 'lava', k + 14, 0);
      star(t, l2.top, l2.arc(l2.top) + 0.3);
      profile(t, () => l2.flat, l2.end, l2.end + 30);
      finish(t, l2.end + 22, l2.flat);
      t.targetScore = 8000;
      forest(t, -6, l2.end + 36, 72, ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'], 5, 8);
    },
  },
];

export const puzzles: PuzzleDef[] = [];
