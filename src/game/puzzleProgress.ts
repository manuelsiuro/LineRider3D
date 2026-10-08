import { KEYS, readJSON, writeJSON } from './storage';

/** Stars and the least ink (world units) per solved puzzle. */
export type PuzzleProgress = Record<string, { stars: number; ink: number }>;

export function loadPuzzles(): PuzzleProgress {
  return readJSON<PuzzleProgress>(KEYS.puzzles, {});
}

/** Records a clean finish; returns the progress after it. */
export function savePuzzle(id: string, stars: number, ink: number): PuzzleProgress {
  const all = loadPuzzles();
  const prev = all[id];
  all[id] = { stars: Math.max(prev?.stars ?? 0, stars), ink: prev?.ink ? Math.min(prev.ink, ink) : ink };
  writeJSON(KEYS.puzzles, all);
  return all;
}
