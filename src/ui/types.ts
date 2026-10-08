import type { WorldConfig } from '../world/worlds';
import type { BiomeId } from '../world/worlds';

export type TitleChoice = 'daily' | 'puzzles' | 'gallery' | 'levels' | 'create' | 'new' | 'wardrobe' | 'garage' | 'settings' | 'trophies' | 'phone' | 'season';
export type PauseChoice = 'resume' | 'restart' | 'settings' | 'levels' | 'menu';

export interface UIHandlers {
  play(): void;
  pause(): void;
  stop(): void;
  seek(frame: number): void;
  cycleCamera(): string;
  toggleSlowMo(): boolean;
  newTrack(): void;
  loadDemo(): void;
  exportTrack(): void;
  importTrack(file: File): void;
  focusRider(): void;
  levels(): void;
  mainMenu(): void;
  share(challenge?: number): void;
  toggleSfx(): boolean;
  toggleMusic(): boolean;
  toggleRiderMode(): boolean;
  /** Opens the settings screen. */
  settings(): void;
  /** Esc: pause menu while riding, otherwise stop. */
  escape(): void;
  /** Enters photo mode. */
  photo(): void;
  /** Opens the gallery of saved tracks. */
  gallery(): void;
  /** Rides from the point under the pointer (the start goes back on Stop). */
  testHere(): void;
  /** Next ride (editor quick switch). */
  cycleVehicle(): void;
  /** Touch pad input: bit mask from the on-screen buttons. */
  touchInput(mask: number): void;
  /** The world of the track being edited. */
  world(): WorldConfig;
  /** Changes it; returns the (validated) world now shown. */
  setWorld(w: Partial<WorldConfig>): WorldConfig;
  click(): void;
}

/** World choice shown on a level or shared-track intro. */
export interface WorldPicker {
  value: WorldConfig;
  /** The level's own world. */
  home: WorldConfig;
  onPick(w: Partial<WorldConfig>): WorldConfig;
}

export interface SummaryInfo {
  best: number;
  newBest: boolean;
  riderMode: boolean;
  goals: { label: string; done: boolean }[];
  rating: number;
  starsTotal: number;
  ghostSaved?: boolean;
  /** Set when playing a built-in level. */
  level?: { number: number; name: string; nextUnlocked: boolean; hasNext: boolean };
  /** Score to beat from a friend's challenge link. */
  challenge?: number;
  /** Finish-time medal (levels on their home world). */
  medal?: { medal: string | null; newMedal: boolean; time: number; best: number; newBest: boolean; next: { name: string; time: number } | null };
  /** Set when solving a puzzle (ink in meters). */
  puzzle?: { number: number; name: string; ink: number; par: number; hasNext: boolean };
  /** Set when playing the daily ride. */
  daily?: { number: number; name: string; streak: number };
  /** Name of the ride used. */
  vehicle?: string;
}

/** What the settings screen edits (mirrors game/settings Settings). */
export interface SettingsView {
  quality: string;
  /** Shown under Quality, e.g. "Auto: High". */
  qualityNote: string;
  sfxVolume: number;
  musicVolume: number;
  camera: string;
  cameraDistance: number;
  reducedMotion: boolean;
  seasonal: string;
}

export interface VehicleCard {
  id: string;
  name: string;
  blurb: string;
  stats: { speed: number; grip: number; air: number; toughness: number };
  /** Ride challenges done / total. */
  progress: { done: number; total: number };
  paints: { id: string; name: string; colors: number[]; unlocked: boolean; need: number }[];
  paint: string;
}

export interface TrophyCard {
  id: string;
  title: string;
  desc: string;
  /** Ride icon for ride challenges. */
  ride?: string;
  rideName?: string;
  unlocked: boolean;
}

/** Ride choice shown on a level intro. */
export interface RidePicker {
  options: { id: string; name: string }[];
  selected: string;
  /** Level made for one ride (or a challenge): no choice. */
  locked: boolean;
  /** Why, shown under the chip ("This level's ride"). */
  lockNote?: string;
  /** Picks a ride; returns its controls. */
  onPick(id: string): Controls;
  /** Medal times for a ride on this level (levels only). */
  medals?(id: string): MedalRow | null;
}

/** Medal targets on a level intro. */
export interface MedalRow {
  /** Bronze, silver, gold, dev (s). */
  times: number[];
  /** The player's best time with this ride (0: none). */
  best: number;
}

/** A ride's controls, drawn as key caps. */
export interface Controls {
  /** Touch device: name the on-screen buttons instead of keys. */
  touch: boolean;
  ground: { key: 'left' | 'right' | 'up'; label: string }[];
  air: { key: 'left' | 'right' | 'up'; label: string }[];
  note: string;
}

export interface LevelCard {
  name: string;
  tip: string;
  stars: number;
  score: number;
  unlocked: boolean;
  /** Chapter (home world). */
  world: BiomeId;
  /** Level made for one ride. */
  ride?: string;
  /** Best medal won on the level (any ride). */
  medal?: string | null;
}

export interface OutfitCard {
  id: string;
  name: string;
  stars: number;
  colors: number[];
  unlocked: boolean;
  /** World to master, for world outfits. */
  world?: string;
  /** How to unlock it, when that isn't stars or a world (e.g. an achievement). */
  lock?: string;
  /** Small label on the card, e.g. a seasonal costume. */
  tag?: string;
}

/** What every screen needs from the UI shell. */
export interface ScreenCtx {
  /** Button click sound. */
  click(): void;
  /** Short message at the bottom of the screen. */
  flash(text: string, ms?: number): void;
  /** Shares the current track (with a score to beat). */
  share(challenge?: number): void;
  /** The world on screen (title badge and caption). */
  readonly world: WorldConfig;
}

/** The daily ride's entry on the title. */
export interface DailyCard {
  number: number;
  name: string;
  /** Today's best (0: not played yet). */
  best: number;
  stars: number;
  streak: number;
}

/** A puzzle on the puzzle select screen. */
export interface PuzzleCard {
  name: string;
  tip: string;
  stars: number;
  /** Best ink used (m), 0 when unsolved. */
  ink: number;
  par: number;
}

/** A saved track in the gallery. */
export interface GalleryCard {
  id: string;
  name: string;
  savedAt: number;
  strokes: number;
  world: string;
  current: boolean;
}

/** Gallery actions that change the list (it is shown again after each). */
export interface GalleryActions {
  rename(id: string, name: string): GalleryCard[];
  duplicate(id: string): GalleryCard[];
  remove(id: string): GalleryCard[];
}
