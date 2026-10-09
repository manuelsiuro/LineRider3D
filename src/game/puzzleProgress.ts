import { PUZZLES, puzzleWorld } from '../levels/puzzles';
import type { BiomeId } from '../world/worlds';
import { KEYS, readJSON, writeJSON } from './storage';

/** Stars and the least budget spent (ink in world units, rings or erasures) per solved puzzle. */
export type PuzzleProgress = Record<string, { stars: number; ink: number }>;

export function loadPuzzles(): PuzzleProgress {
  return readJSON<PuzzleProgress>(KEYS.puzzles, {});
}

/** Records a clean finish; returns the progress after it. */
export function savePuzzle(id: string, stars: number, ink: number): PuzzleProgress {
  const all = loadPuzzles();
  const prev = all[id];
  all[id] = { stars: Math.max(prev?.stars ?? 0, stars), ink: prev ? Math.min(prev.ink, ink) : ink };
  writeJSON(KEYS.puzzles, all);
  return all;
}

/** Puzzle stars needed to open a world's puzzles: a little over half of those before it. */
export function puzzleGate(biome: BiomeId): number {
  const first = PUZZLES.findIndex((p) => puzzleWorld(p) === biome);
  return first <= 0 ? 0 : Math.round(0.55 * 3 * first);
}

/** A world's puzzles open with enough puzzle stars (or once one of them is solved). */
export function puzzleWorldOpen(biome: BiomeId, done = loadPuzzles()): boolean {
  const stars = Object.values(done).reduce((n, p) => n + p.stars, 0);
  return stars >= puzzleGate(biome) || PUZZLES.some((p) => puzzleWorld(p) === biome && (done[p.id]?.stars ?? 0) > 0);
}
