import { CAMERA_LABELS } from '../render/CameraRig';
import type { Quality as QualitySetting } from '../game/settings';
import type { Core } from './core';

type Level = Exclude<QualitySetting, 'auto'>;

/** Applies the settings, and Auto quality: picks a level and steps down when frames are slow. */
export class Quality {
  /** Quality in use (Auto picks one). */
  active: Level;
  private window = { time: 0, frames: 0, cooldown: 3 };

  constructor(private c: Core) {
    this.active = c.lowPower ? 'medium' : 'high';
  }

  /** "Auto: High" while Auto is on, else empty. */
  get note() {
    return this.c.settings.quality === 'auto' ? `Auto: ${this.active[0].toUpperCase()}${this.active.slice(1)}` : '';
  }

  private set(q: Level) {
    const { renderer, postfx, env, effects, ui } = this.c;
    this.active = q;
    const ratio = { low: 1, medium: 1.5, high: 2 }[q];
    renderer.setPixelRatio(Math.min(devicePixelRatio, ratio));
    postfx.setSize(innerWidth, innerHeight);
    postfx.bloomEnabled = q !== 'low';
    env.setShadows({ low: 0, medium: 1024, high: 2048 }[q]);
    // Landscape density and weather particles follow the quality too.
    env.setDetail(q);
    effects.setViewportHeight(innerHeight * renderer.getPixelRatio());
    ui.setQualityNote(this.note);
  }

  /** Pushes the settings to sound, camera and renderer. */
  apply(first = false) {
    const { settings, sound, rig, ui } = this.c;
    sound.setVolumes(settings.sfxVolume, settings.musicVolume);
    rig.distanceScale = settings.cameraDistance;
    rig.reducedMotion = settings.reducedMotion;
    if (first || rig.mode !== settings.camera) {
      rig.mode = settings.camera;
      ui.setCameraLabel(CAMERA_LABELS[rig.mode]);
    }
    const wanted = settings.quality === 'auto' ? this.active : settings.quality;
    if (first || wanted !== this.active) this.set(wanted);
  }

  /** Auto was just switched on: start again from the device default. */
  restartAuto() {
    this.window.cooldown = 3;
    this.set(this.c.lowPower ? 'medium' : 'high');
  }

  /** Watches real frame times; steps down after a slow 2.5 s window. */
  govern(rawDt: number) {
    const w = this.window;
    if (this.c.settings.quality !== 'auto' || document.hidden || rawDt <= 0 || rawDt > 0.5) return;
    w.cooldown -= rawDt;
    w.time += rawDt;
    w.frames++;
    if (w.time < 2.5) return;
    const fps = w.frames / w.time;
    w.time = 0;
    w.frames = 0;
    if (w.cooldown > 0 || fps >= 42) return;
    const next = this.active === 'high' ? 'medium' : this.active === 'medium' ? 'low' : null;
    if (!next) return;
    this.set(next);
    w.cooldown = 4;
  }
}
