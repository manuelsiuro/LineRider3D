import type { BiomeId } from '../../world/worlds';
import type { LevelDef } from '../levels';
import type { PuzzleDef } from '../puzzles';
import * as alpine from './alpine';
import * as forest from './forest';
import * as beach from './beach';
import * as desert from './desert';
import * as city from './city';
import * as halloween from './halloween';
import * as volcano from './volcano';
import * as moon from './moon';

/** Each world's levels and puzzles, one file per world. */
export const WORLD_CONTENT: Record<BiomeId, { levels: LevelDef[]; puzzles: PuzzleDef[] }> = { alpine, forest, beach, desert, city, halloween, volcano, moon };
