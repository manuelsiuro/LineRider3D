import type { CameraMode } from '../render/CameraRig';

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
}

const KEY = 'lr3d.settings';

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  sfxVolume: 0.9,
  musicVolume: 0.6,
  camera: 'cinematic',
  cameraDistance: 1,
  reducedMotion: matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
};

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

/** Wipes stars, bests, ghosts and unlocks (keeps settings and the editor track). */
export function resetProgress() {
  try {
    for (const k of ['lr3d.progress', 'lr3d.best', 'lr3d.ghosts', 'lr3d.outfit', 'lr3d.achievements', 'lr3d.paint']) localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
}
