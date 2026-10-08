import * as THREE from 'three';
import { fxStyle } from '../render/fxStyles';
import { LEVELS } from '../levels/levels';
import { SURFACES, normalizeWorld, sameWorld, surfaceOf, type WorldConfig } from '../world/worlds';
import type { WorldPicker } from '../ui/UI';
import type { Core } from './core';

/** The title screen tours the worlds. */
const TITLE_WORLDS: Partial<WorldConfig>[] = [
  { biome: 'alpine', time: 'day', weather: 'snow' },
  { biome: 'forest', time: 'sunset', weather: 'clear' },
  { biome: 'beach', time: 'day', weather: 'clear' },
  { biome: 'city', time: 'night', weather: 'clear' },
  { biome: 'desert', time: 'sunset', weather: 'clear' },
  { biome: 'forest', time: 'night', weather: 'clear' },
];

export interface WorldHooks {
  /** A world was rebuilt (the ground, and so the physics, may have changed). */
  applied(): void;
  /** Told about each world shown (the UI logo badge). */
  shown(w: WorldConfig): void;
}

/** Which world is on screen: landscape, sky, decor style, particles, sound and ground drag. */
export class WorldDirector {
  /** Bumped by every switch, so a deferred one never lands after a newer one. */
  private gen = 0;
  private titleIndex = 0;
  private titleClock = 0;
  /** The rider's lamp after dark: a soft spot ahead of the ride. */
  private headlight = new THREE.SpotLight(0xfff1d6, 0, 46, 0.55, 0.6, 1.2);
  private lampDir = new THREE.Vector3(1, -0.15, 0);

  constructor(private c: Core, private hooks: WorldHooks) {
    c.scene.add(this.headlight, this.headlight.target);
    c.postfx.setGrade(c.env.atm.grade);
    c.env.weather.onStrike = (d) => c.sound.thunder(d);
  }

  get config() {
    return this.c.env.config;
  }

  /** The world a track asks for (its author's pick, or the default). */
  trackWorld() {
    return normalizeWorld(this.c.track.world as Partial<WorldConfig> | null);
  }

  levelWorld(i: number) {
    return normalizeWorld(LEVELS[i].world);
  }

  /** Shows a world right away (returns false when it was already showing). */
  apply(w: Partial<WorldConfig>, force = false) {
    if (!this.look(w, force)) return false;
    const { env, sim } = this.c;
    sim.setGroundDrag(SURFACES[surfaceOf(env.config)].drag);
    this.hooks.applied();
    this.hooks.shown(env.config);
    return true;
  }

  /**
   * Photo mode: changes only how the world looks (sky, light, weather, sound),
   * never the ground under the rider, so the run on screen stays exactly as it is.
   */
  preview(w: Partial<WorldConfig>) {
    this.gen++;
    return this.look(w, false);
  }

  /** Landscape, sky, decor style, particles and sound (no physics). */
  private look(w: Partial<WorldConfig>, force: boolean) {
    const { env, track, postfx, trackView, effects, trail, groundMarks, sound } = this.c;
    const footprint: THREE.Vector3[] = [];
    for (const s of track.strokes.values()) for (let i = 0; i < s.points.length; i += 2) footprint.push(s.points[i]);
    footprint.push(track.start);
    if (!env.setWorld(w, footprint, force)) return false;
    postfx.setGrade(env.atm.grade);
    trackView.setWorld(env.config, env.atm.night, env.atm.wet);
    const ground = surfaceOf(env.config);
    const fx = fxStyle(env.config, env.atm.wet);
    effects.setStyle(fx, env.atm.night);
    trail.setColor(fx.trail);
    groundMarks.setSurface(ground, env.atm.wet, env.atm.night);
    sound.setWorld(env.config.biome, env.config.time, env.config.weather, ground);
    return true;
  }

  /** Switches world behind a quick fade so the rebuild never shows. */
  change(w: Partial<WorldConfig>) {
    // Any newer switch (deferred or not) cancels a pending one.
    const gen = ++this.gen;
    const fade = document.querySelector('.world-fade') ?? document.body.appendChild(Object.assign(document.createElement('div'), { className: 'world-fade' }));
    if (sameWorld(normalizeWorld(w), this.c.env.config)) {
      fade.classList.remove('on');
      return this.apply(w);
    }
    fade.classList.add('on');
    // Two frames so the fade is on screen before the (blocking) rebuild.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (gen !== this.gen) return;
        this.apply(w);
        fade.classList.remove('on');
      }),
    );
    return true;
  }

  /** Shows a world now, cancelling any pending faded switch. */
  applyNow(w: Partial<WorldConfig>) {
    this.gen++;
    return this.apply(w);
  }

  /** World chips on an intro card: pick any world, the home one is marked. */
  picker(home: WorldConfig, picked?: (w: WorldConfig) => void): WorldPicker {
    return {
      // The intro opens on the home world (switched to just before).
      value: home,
      home,
      onPick: (w) => {
        this.applyNow(w);
        picked?.(this.c.env.config);
        return this.c.env.config;
      },
    };
  }

  /** Back to the title: the tour resumes on its current world. */
  startTour() {
    this.titleClock = 0;
    this.change(TITLE_WORLDS[this.titleIndex]);
  }

  /** Next world on the title every 16 s, while `showing` (the menu itself is up). */
  tour(dt: number, showing: boolean) {
    if (!showing) return;
    this.titleClock += dt;
    if (this.titleClock < 16) return;
    this.titleClock = 0;
    this.titleIndex = (this.titleIndex + 1) % TITLE_WORLDS.length;
    this.change(TITLE_WORLDS[this.titleIndex]);
  }

  updateHeadlight(riding: boolean) {
    const { env, riderCenter, riderVel } = this.c;
    const light = this.headlight;
    // Stays "visible" (0 intensity by day): toggling a light recompiles every material.
    light.intensity = riding ? 60 * env.atm.night : 0;
    if (light.intensity === 0) return;
    if (riderVel.lengthSq() > 1e-4) this.lampDir.lerp(riderVel.clone().normalize(), 0.2).normalize();
    light.position.copy(riderCenter).add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(this.lampDir, 0.6);
    light.target.position.copy(riderCenter).addScaledVector(this.lampDir, 14).add(new THREE.Vector3(0, -2, 0));
  }
}
