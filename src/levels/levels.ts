import type { Track } from '../track/Track';
import type { VehicleId } from '../physics/vehicles';
import type { InputPlan } from './ride';
import { BIOMES, type BiomeId, type WorldConfig } from '../world/worlds';
import { WORLD_CONTENT } from './worlds';

export interface LevelDef {
  id: string;
  name: string;
  /** What the level teaches, shown on its card and intro. */
  tip: string;
  /** Levels made for one ride. */
  vehicle?: VehicleId;
  /** Home world (Alpine by day if not set); players may pick another. */
  world?: Partial<WorldConfig>;
  /** How hard it is, 1 (a gentle ride) to 5 (expert); never goes down within a world. */
  difficulty: 1 | 2 | 3 | 4 | 5;
  /**
   * Levels that need the player (push, brake, jump, flips) carry a winning input plan:
   * the tests check that riding untouched fails and the plan finishes with every star.
   */
  solution?: InputPlan;
  build(track: Track): void;
}

/** The chapter (world) a level belongs to. */
export const chapterOf = (l: LevelDef): BiomeId => l.world?.biome ?? 'alpine';

/** All levels, world by world in the order of the worlds (each world's levels together). */
export const LEVELS: LevelDef[] = BIOMES.flatMap((b) => WORLD_CONTENT[b.id].levels);
