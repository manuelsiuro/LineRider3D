import type { CameraMode } from '../render/CameraRig';
import type { SeasonPref } from './season';
import { KEYS, PROGRESS_KEYS, readJSON, removeKey, writeJSON } from './storage';

export type Quality = 'auto' | 'low' | 'medium' | 'high';

/** Player preferences, saved on this device. */
export interface Settings {
  quality: Quality;
  /** 0..1 */
  sfxVolume: number;
  /** 0..1 */
  musicVolume: number;
  camera: CameraMode;
  /** Chase distance multiplier (0.7 close .. 1.4 far). */
  cameraDistance: number;
  /** No camera shake, zoom punches or screen flashes. */
  reducedMotion: boolean;
  /** Seasonal events (Halloween look on the title, etc.). */
  seasonal: SeasonPref;
  /** All sound off (the title's toggle), volumes kept for when it comes back. */
  muted: boolean;
}


export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  sfxVolume: 0.9,
  musicVolume: 0.6,
  camera: 'side',
  cameraDistance: 1,
  reducedMotion: matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  seasonal: 'auto',
  muted: false,
};

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...readJSON<Partial<Settings>>(KEYS.settings, {}) };
}

export function saveSettings(s: Settings) {
  writeJSON(KEYS.settings, s);
}

/** Wipes stars, bests, ghosts and unlocks (keeps settings and the editor track). */
export function resetProgress() {
  for (const k of PROGRESS_KEYS) removeKey(k);
}
