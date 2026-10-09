import { cosine, finish, forest, hazard, home, landing, profile, star, start } from '../builders';
import type { LevelDef } from '../levels';
import type { PuzzleDef } from '../puzzles';

/** Moon: its levels (in play order) and puzzles. */
export const levels: LevelDef[] = [
  {
    id: 'moonwalk',
    name: 'Moonwalk',
    difficulty: 3,
    world: { biome: 'moon', time: 'night', weather: 'clear' },
    tip: 'Less than half the gravity: every jump floats. Enjoy the view of the Earth on the way down.',
    build(t) {
      t.clear();
      home(t, { biome: 'moon' });
      const h = cosine(26, 10, -2, 40);
      profile(t, h, -2, 40);
      profile(t, (x) => 10 + 0.08 * (x - 40) ** 2, 40, 44);
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      const l = landing(t, 44, 11.28, 3, 4);
      // Stars along the long, slow arc.
      for (const k of [0.3, 0.55]) {
        const x = 44 + (l.top - 44) * k * 2;
        star(t, x, l.arc(x) + 0.3);
      }
      profile(t, () => l.flat, l.end, l.end + 32);
      finish(t, l.end + 24, l.flat);
      t.targetScore = 4000;
      forest(t, -6, l.end + 40, 81, ['crater', 'crystal', 'rock', 'crater', 'moonflag'], 5, 9);
    },
  },
  {
    id: 'crater-hop',
    name: 'Crater Hop',
    difficulty: 3,
    world: { biome: 'moon', time: 'day', weather: 'clear' },
    tip: 'Crystal shards on the track! Hold Jump to charge it and let go to float over them.',
    // Three full-charge jumps, one before each crystal.
    solution: [[202, 8], [226, 0], [271, 8], [295, 0], [327, 8], [351, 0]],
    build(t) {
      t.clear();
      home(t, { biome: 'moon' });
      const h = cosine(40, 28, -2, 40);
      profile(t, h, -2, 40);
      const run = (x: number) => 28 - (x - 40) * 0.16;
      profile(t, run, 40, 180);
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      for (const x of [64, 100, 136]) hazard(t, 'crystal', x, run(x));
      // A star floats over each crystal: only a jump gets it.
      for (const x of [64, 100, 136]) star(t, x, run(x) + 3.4);
      finish(t, 168, run(168));
      t.targetScore = 3000;
      forest(t, -6, 186, 82, ['crater', 'crystal', 'rock', 'lander', 'dish'], 5, 9);
    },
  },
];

export const puzzles: PuzzleDef[] = [];
