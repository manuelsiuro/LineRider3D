import * as THREE from 'three';
import { STEPS_PER_SECOND } from '../physics/Simulation';
import { EVENT, INPUT, P } from '../physics/Rider';
import { terrainHeight } from '../world/terrain';
import { GhostRun, type GhostRecord } from '../game/Ghost';
import { bumpWipeouts, loadCounters } from '../game/achievements';
import type { CameraMode } from '../render/CameraRig';
import type { VehicleDef } from '../physics/vehicles';
import type { Core } from './core';

const STEP = 1 / STEPS_PER_SECOND;
/** Ten minutes of simulation at most. */
export const MAX_FRAME = STEPS_PER_SECOND * 60 * 10 - 2;
/** Seconds of wipeout (real time) before coming back to the last checkpoint. */
const RESPAWN_DELAY = 1.2;

export interface RunHooks {
  /** Riding a track (not the title's demo loop). */
  inGame(): boolean;
  /** Arrow keys steer Bosh (rider mode, levels, challenges). */
  riderOn(): boolean;
  /** Live input bits. */
  input(): number;
  vehicle(): VehicleDef;
  /** The ghost to race (the player's best, or a friend's from a link). */
  ghostRecord(): GhostRecord | null;
  /** Centers the camera on the rider (a fresh start). */
  focus(): void;
  /** Every 10 steps while riding (mid-run achievements). */
  tick(): void;
  /** The run ended (crash settled, finish, stopped, or out of time). */
  ended(wasReplay: boolean): void;
}

/**
 * One run on the current track: the clock, playback, slow motion, the ghost,
 * ride events (popups, sounds, particles) and detecting the end of the run.
 * The simulation itself stays exact; only playback speed changes.
 */
export class Run {
  playing = false;
  /** The ¼-speed toggle (player bar). */
  slowMo = false;
  frame = 0;
  /** Watching a recorded run: inputs are played back, not taken live. */
  replaying = false;
  summaryShown = false;
  /** Best run replayed alongside the player. */
  ghost: GhostRun | null = null;
  /** Playback speed (1 = real time), eased toward the slow-motion target. */
  timeScale = 1;
  /** Hit flash and vignette after a wipeout (fades). */
  impact = 0;
  /** White screen flash (fades). */
  flash = 0;
  /** Live time gap to the ghost (s, negative: ahead), null when there is none. */
  gap: number | null = null;
  /** Tricks landed this run (for achievements). */
  readonly tricks: string[] = [];
  wipeouts = loadCounters().wipeouts;

  private acc = 0;
  private slowTarget = 1;
  private slowTimer = 0;
  private crashClock = 0;
  private finishClock = 0;
  /** Stars already sparkled this run (so scrubbing doesn't repeat them). */
  private sparkled = new Set<number>();
  private modeBeforeReplay: CameraMode | null = null;
  private side = new THREE.Vector3();
  private tail = new THREE.Vector3();

  constructor(private c: Core, private h: RunHooks) {}

  /** Back to frame 0 with a clean slate (effects, stats, summary). */
  reset() {
    const { effects, trail, groundMarks, runStats, ui } = this.c;
    this.slowTimer = 0;
    this.impact = 0;
    this.frame = 0;
    this.acc = 0;
    this.summaryShown = false;
    this.crashClock = 0;
    this.finishClock = 0;
    this.sparkled.clear();
    this.tricks.length = 0;
    effects.reset();
    trail.reset();
    groundMarks.reset();
    runStats.reset();
    ui.hideSummary();
  }

  /** Restarts the clock only (the title's demo loop on a new ground). */
  rewind() {
    this.frame = 0;
    this.acc = 0;
    this.c.groundMarks.reset();
  }

  play() {
    const { sim, ghostView, rig, ui, track, riderCenter } = this.c;
    if (this.summaryShown) this.reset();
    // A fresh attempt (or a classic run) starts with no recorded input.
    if (this.frame === 0 && !this.replaying) sim.clearInputs();
    if (this.frame === 0) {
      const record = this.h.inGame() ? this.h.ghostRecord() : null;
      this.ghost = record ? new GhostRun(track, record, this.h.vehicle(), sim.rider.groundDrag, sim.rider.gravityScale) : null;
      ghostView.setVehicle(this.h.vehicle());
      this.h.focus();
    } else rig.snapTo(sim.rider.center(riderCenter));
    this.playing = true;
    ui.setPlaying(true);
  }

  pause() {
    this.playing = false;
    this.c.ui.setPlaying(false);
  }

  stop() {
    this.pause();
    this.setReplay(false);
    this.reset();
  }

  /** Timeline scrub. */
  seek(f: number) {
    this.frame = f;
    this.acc = 0;
    this.summaryShown = false;
    this.c.ui.hideSummary();
  }

  /** Replays use the TV director camera and a letterboxed look. */
  setReplay(on: boolean) {
    const rig = this.c.rig;
    this.replaying = on;
    document.body.classList.toggle('replaying', on);
    if (on && this.modeBeforeReplay === null) {
      this.modeBeforeReplay = rig.mode;
      rig.mode = 'director';
      rig.startDirector();
    } else if (!on && this.modeBeforeReplay !== null) {
      rig.mode = this.modeBeforeReplay;
      this.modeBeforeReplay = null;
    }
  }

  /** Watch the run just recorded, with the player's inputs played back. */
  watchReplay() {
    this.setReplay(true);
    this.reset();
    this.play();
  }

  /** Bullet time for `seconds` of real time. */
  slowmo(scale: number, seconds: number) {
    this.slowTarget = scale;
    this.slowTimer = seconds;
    this.c.sound.slowmoHit();
  }

  /** Advances playback by dt and updates the rider, ghost, effects and ride sounds. */
  update(dt: number) {
    const { sim, riderView, ghostView, runStats, effects, trail, groundMarks, sound, postfx, settings, riderCenter, riderVel } = this.c;
    const inGame = this.h.inGame();

    // Ease the time scale toward the current slow-motion target.
    this.slowTimer = Math.max(0, this.slowTimer - dt);
    const scaleTarget = this.slowTimer > 0 && inGame ? this.slowTarget : 1;
    this.timeScale += (scaleTarget - this.timeScale) * (1 - Math.exp(-dt * (scaleTarget < this.timeScale ? 18 : 5)));
    sound.slowmo(this.timeScale);
    this.impact = Math.max(0, this.impact - dt * 0.8);
    postfx.impact = settings.reducedMotion ? 0 : this.impact;

    const startFrame = this.frame;
    if (this.playing) {
      this.acc += dt * this.timeScale * (this.slowMo && inGame ? 0.25 : 1);
      while (this.acc >= STEP) {
        this.acc -= STEP;
        this.frame++;
      }
      if (this.frame >= MAX_FRAME) this.frame = MAX_FRAME;
    }
    const riderOn = this.h.riderOn();
    // Rider mode: record the live input for every step we are about to simulate
    // (including the look-ahead step used for interpolation).
    if (this.playing && inGame && riderOn && !this.replaying) {
      const mask = this.h.input();
      for (let f = startFrame; f <= this.frame; f++) sim.setInput(f, mask);
    }

    // Always make sure the next frame exists so we can interpolate.
    const frame = this.frame;
    sim.seek(frame + 1);
    sim.seek(frame);
    const alpha = this.playing ? this.acc / STEP : 0;
    sim.interpolated(alpha, riderView.pts);
    const rider = sim.rider;
    riderView.update(dt, rider.crashed, !rider.contact.some((c) => c));

    // Ghost of the best run, in lockstep with the player.
    const ghost = this.ghost;
    const showGhost = !!ghost && inGame && !this.replaying && frame > 0 && frame <= ghost.record.frames + 40;
    ghostView.visible = showGhost;
    if (showGhost && ghost) {
      ghost.sim.seek(frame + 1);
      ghost.sim.seek(frame);
      ghost.sim.interpolated(alpha, ghostView.pts);
      ghostView.update(dt, ghost.sim.rider.crashed, !ghost.sim.rider.contact.some((c) => c));
    }
    riderCenter.copy(riderView.pts[P.butt]);
    rider.velocity(riderVel);

    const events = runStats.advance(sim, frame, STEPS_PER_SECOND);
    // Race the ghost: how far ahead or behind, from the distance covered.
    this.gap = showGhost && ghost && this.playing && frame > STEPS_PER_SECOND && !runStats.stats.crashed ? ghost.gap(frame, runStats.stats.distance, STEPS_PER_SECOND) : null;
    if (this.playing) {
      const justCrashed = effects.fromRider(frame, rider.pos, rider.contact, rider.crashed, riderVel, STEPS_PER_SECOND);
      this.side.subVectors(riderView.pts[P.tailR], riderView.pts[P.tailL]).normalize();
      this.tail.addVectors(riderView.pts[P.tailL], riderView.pts[P.tailR]).multiplyScalar(0.5);
      trail.push(this.tail, this.side, runStats.stats.speed);
      groundMarks.update(frame, rider.pos, rider.contact, rider.crashed);
      if (inGame) this.rideEvents(events, justCrashed);
      if (frame % 10 === 0) this.h.tick();
    }

    // Ride sounds.
    let onTrack = false;
    let onSnow = false;
    for (const i of [P.tailL, P.tailR, P.noseL, P.noseR, P.butt]) {
      if (!rider.contact[i]) continue;
      const p = rider.pos[i];
      if (p.y - terrainHeight(p.x, p.z) < 0.05) onSnow = true;
      else onTrack = true;
    }
    const throttle = ((this.replaying ? sim.inputAt(frame) : this.h.input()) & INPUT.push) !== 0 && riderOn && !rider.crashed;
    sound.ride(this.playing && inGame, runStats.stats.speed, onTrack, onSnow, throttle, !rider.contact.some((c) => c));
  }

  /** Popups, sounds, sparkles and bullet time for what just happened on the ride. */
  private rideEvents(events: number, justCrashed: boolean) {
    const { sound, ui, track, sim, effects, rig, runStats } = this.c;
    if (events & EVENT.ring) {
      sound.ring();
      ui.popup('BOOST!', 'boost', true);
      this.flash = 0.35;
    }
    if (events & EVENT.checkpoint) {
      sound.ring();
      ui.popup('CHECKPOINT', 'boost', true);
    }
    if (events & EVENT.respawn) {
      // Back at the last checkpoint: no streak across the screen, no lingering wipeout.
      this.c.trail.reset();
      this.impact = 0;
      this.slowTimer = 0;
      rig.snapTo(sim.rider.center(this.c.riderCenter));
      ui.popup('BACK TO CHECKPOINT', 'boost', true);
    }
    if (events & EVENT.bounce) {
      sound.bounce();
      if (Math.random() < 0.5) ui.popup('BOING!', 'bounce', true);
    }
    if (events & EVENT.star) {
      sound.star();
      // Sparkle where the collected star was.
      const mask = sim.rider.stars;
      track.starList().forEach((st, k) => {
        if (Math.floor(mask / 2 ** k) % 2 === 1 && !this.sparkled.has(st.id)) {
          this.sparkled.add(st.id);
          effects.sparkle(st.position);
        }
      });
    }
    if (events & EVENT.finish) {
      sound.finish();
      ui.popup('FINISH!', 'finish');
      this.flash = 0.25;
      const best = this.ghost?.record.finishTime ?? 0;
      if (best > 0 && !this.replaying) {
        const delta = runStats.stats.finishTime - best;
        setTimeout(() => ui.popup(`${delta <= 0 ? '−' : '+'}${Math.abs(delta).toFixed(2)}s vs best`, delta <= 0 ? 'boost' : 'crash'), 700);
      }
    }
    if (justCrashed) {
      if (!this.replaying) this.wipeouts = bumpWipeouts();
      sound.crash();
      // Haunted Hollow: bats burst out of the wipeout.
      const spooky = this.c.env.config.biome === 'halloween';
      ui.popup(spooky ? 'SPOOKED!' : 'WIPEOUT!', 'crash');
      if (spooky) effects.batBurst(sim.rider.pos[P.butt]);
      rig.shake(0.6);
      rig.punch(12);
      this.slowmo(0.22, 1.1);
      this.impact = 1;
    }
    // Big touchdowns get a moment of bullet time.
    for (const td of runStats.takeTouchdowns()) {
      if (Math.abs(td.rotation) > 5.2 || td.air > 1.3) {
        this.slowmo(0.3, 0.5);
        rig.punch(8);
        this.flash = Math.max(this.flash, 0.15);
      }
    }
    for (const c of runStats.takeCombos()) {
      const label = `x${c.combo % 1 ? c.combo.toFixed(1) : c.combo}`;
      if (c.lost) ui.popup(`COMBO ${label} LOST`, 'crash', true);
      else {
        ui.popup(`COMBO ${label} · ${c.points.toLocaleString()} PTS`, 'finish');
        sound.success();
      }
    }
    for (const trick of runStats.takeTricks()) {
      ui.trick(trick);
      if (trick.bailed) continue;
      this.tricks.push(trick.name);
      if (trick.grade === 'perfect') sound.perfect();
      else if (trick.points >= 1000) sound.success();
      else sound.click(true);
    }
  }

  /** Watches for the end of a run (crash settled, finish, standing still, out of time). */
  checkEnd(dt: number) {
    if (this.summaryShown || !this.h.inGame()) return;
    // Paused or scrubbing: the run hasn't ended, the player is looking around.
    if (!this.playing) {
      this.crashClock = this.finishClock = 0;
      return;
    }
    const s = this.c.runStats.stats;
    this.crashClock = s.crashed ? this.crashClock + dt : 0;
    // Past a checkpoint, a wipeout only costs time: the rider comes back to it (with the
    // player steering: an untouched run would only crash the same way again).
    if (this.crashClock > RESPAWN_DELAY && !this.replaying && this.h.riderOn() && this.c.sim.respawn(this.frame)) {
      this.crashClock = 0;
      return;
    }
    this.finishClock = s.finished ? this.finishClock + dt : 0;
    const ended = this.crashClock > 2.4 || this.finishClock > 1.6 || (s.still > 1.2 && s.time > 1.5) || this.frame >= MAX_FRAME;
    if (!ended) return;
    this.summaryShown = true;
    this.pause();
    if (!s.crashed && s.tricks === 0) this.c.sound.success();
    const wasReplay = this.replaying;
    this.setReplay(false);
    this.h.ended(wasReplay);
  }

  /** Fades the screen flash; lightning adds its own (barely, with reduced motion). */
  updateFlash(dt: number) {
    const { postfx, env, settings } = this.c;
    this.flash = Math.max(0, this.flash - dt * 1.5);
    postfx.flash = Math.max(settings.reducedMotion ? 0 : this.flash, env.weather.flash * (settings.reducedMotion ? 0.04 : 0.22));
  }
}
