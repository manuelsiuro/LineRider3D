import type { Track } from '../track/Track';
import type { LineType } from '../track/types';
import type { Stats } from '../game/RunStats';
import { BIOMES, type BiomeId, type WorldConfig } from '../world/worlds';
import { WORLD_CONTENT } from './worlds';

export { line } from './builders';

/**
 * What the player does in a puzzle (side view, classic run: no rider controls):
 * - draw: draw what's missing with a little ink;
 * - oneline: the same, in a single stroke;
 * - trick: draw so Bosh lands a trick on the way to the finish;
 * - rings: no drawing, place a few boost rings;
 * - erase: the track is overbuilt: erase lines (the given ground stays).
 */
export type PuzzleKind = 'draw' | 'oneline' | 'trick' | 'rings' | 'erase';

/**
 * "Fix the track" puzzles. One star for finishing (with the trick, for trick puzzles),
 * two with every star, three within par.
 */
export interface PuzzleDef {
  id: string;
  name: string;
  tip: string;
  /** 'draw' when not set. */
  kind?: PuzzleKind;
  /**
   * The budget: ink (world units of track) to draw with, rings to place, or lines that
   * may be erased.
   */
  ink: number;
  /** The budget spent for the third star (at most). */
  par: number;
  /** Line types the player may draw. */
  types: LineType[];
  /** Trick puzzles: the trick to land, a jump of a second or more in the air, or a flip. */
  trick?: 'air' | 'flip';
  world?: Partial<WorldConfig>;
  /**
   * Builds the puzzle. Drawing puzzles lock everything it builds; in erase puzzles only
   * the strokes it marks `locked` stay (the rest may be erased).
   */
  build(track: Track): void;
  /** A known solution (player strokes, rings, or erasing), used by the tests. */
  solution(track: Track): void;
}

export const puzzleKind = (p: PuzzleDef): PuzzleKind => p.kind ?? 'draw';
export const puzzleWorld = (p: PuzzleDef): BiomeId => (p.world?.biome as BiomeId | undefined) ?? 'alpine';
/** Puzzles whose budget is ink. */
export const usesInk = (p: PuzzleDef) => ['draw', 'oneline', 'trick'].includes(puzzleKind(p));

/** What the puzzle built, to tell the player's own rings and erased lines apart. */
export interface PuzzleBase {
  rings: Set<number>;
  erasable: Set<number>;
}

/** Notes what the puzzle built (call right after building it). */
export function puzzleBase(track: Track): PuzzleBase {
  return {
    rings: new Set(track.rings.keys()),
    erasable: new Set([...track.strokes.values()].filter((s) => !s.locked).map((s) => s.id)),
  };
}

/** The budget spent so far: ink drawn, rings placed, or lines erased. */
export function puzzleSpent(p: PuzzleDef, track: Track, base: PuzzleBase): number {
  switch (puzzleKind(p)) {
    case 'rings':
      return [...track.rings.keys()].filter((id) => !base.rings.has(id)).length;
    case 'erase':
      return [...base.erasable].filter((id) => !track.strokes.has(id)).length;
    default:
      return track.inkUsed();
  }
}

const METERS = 0.6;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** A budget amount for people: "12.0 m of ink", "2 rings", "3 lines". */
export function budgetText(p: PuzzleDef, amount: number, short = false): string {
  switch (puzzleKind(p)) {
    case 'rings':
      return plural(Math.round(amount), 'ring');
    case 'erase':
      return plural(Math.round(amount), 'line');
    default:
      return `${(amount * METERS).toFixed(1)} m${short ? '' : ' of ink'}`;
  }
}

/** The third star's goal. */
export function parGoal(p: PuzzleDef): string {
  switch (puzzleKind(p)) {
    case 'rings':
      return `Place ${budgetText(p, p.par)} or fewer`;
    case 'erase':
      return `Erase ${budgetText(p, p.par)} or fewer`;
    default:
      return `Use ${budgetText(p, p.par)} or less`;
  }
}

/** The first star's goal. */
export function finishGoal(p: PuzzleDef): string {
  if (puzzleKind(p) !== 'trick') return 'Reach the finish';
  return p.trick === 'flip' ? 'Land a flip, then reach the finish' : 'Land a big air (1 s), then reach the finish';
}

/** The trick a trick puzzle asks for was landed this run. */
export function trickDone(p: PuzzleDef, s: Stats): boolean {
  if (puzzleKind(p) !== 'trick') return true;
  return p.trick === 'flip' ? /flip/i.test(s.bestTrick) : s.tricks > 0;
}

/** Length of the player's strokes (everything not locked). */
export const inkUsed = (track: Track) => track.inkUsed();

/** All puzzles, world by world. */
export const PUZZLES: PuzzleDef[] = BIOMES.flatMap((b) => WORLD_CONTENT[b.id].puzzles);
