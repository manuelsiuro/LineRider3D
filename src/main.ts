import * as THREE from 'three';
import './styles/index.css';
import { TrackFormatError, validateTrack, type SerializedTrack } from './track/Track';
import { CAMERA_LABELS, type CameraMode } from './render/CameraRig';
import { STEPS_PER_SECOND } from './physics/Simulation';
import { P } from './physics/Rider';
import { vehicleById, type VehicleDef } from './physics/vehicles';
import { DEFAULT_WORLD, normalizeWorld, surfaceOf, type WorldConfig } from './world/worlds';
import { UI, type SettingsView } from './ui/UI';
import { resetProgress, saveSettings, type Quality as QualitySetting } from './game/settings';
import { buildDemoTrack } from './demoTrack';
import { readSharedLink, shareLink } from './game/share';
import { rateRun } from './game/rating';
import { beats, encodeInputs, loadGhost, saveGhost } from './game/Ghost';
import { LEVELS, chapterOf } from './levels/levels';
import { OUTFITS, champions, isUnlocked, outfitUnlocked, loadProgress, saveLevelResult, selectOutfit, selectedOutfit, totalStars } from './game/progress';
import { ACHIEVEMENTS, evaluate, loadCounters, noteWorld, selectPaint, unlockedAchievements, type RunContext } from './game/achievements';
import { KEYS, migrateStorage, readFlag, readJSON, readText, writeFlag, writeJSON, writeText } from './game/storage';
import { createStage, fitToWindow } from './app/stage';
import { createCore, type Core } from './app/core';
import { EDIT, TITLE, challengeOf, freeEdit, inGame, levelOf, type Session } from './app/session';
import { Input } from './app/Input';
import { Run } from './app/Run';
import { WorldDirector } from './app/WorldDirector';
import { CameraMoves } from './app/CameraMoves';
import { Rides } from './app/Rides';
import { Quality } from './app/Quality';
import { recordBest, runKey } from './app/records';

// Upgrade saves from older builds before anything reads them.
migrateStorage();

// ------------------------------------------------------------------ setup
const stage = createStage(document.getElementById('app')!);
const core = createCore(stage) as Core;
const { track, sim, rig, camera, controls, env, editor, sound, runStats, riderCenter } = core;

/** What the player is doing (title, editing, a level). */
let session: Session = TITLE;
const levelIndex = () => levelOf(session);
const challenge = () => challengeOf(session);
const playingGame = () => inGame(session);
/** Rider controls: always on in levels and challenges, a toggle in the editor. */
let riderMode = readFlag(KEYS.riderMode);
const riderOn = () => levelIndex() !== null || challenge() > 0 || riderMode;

const moves = new CameraMoves(camera, controls);
const input = new Input(playingGame, () => freeEdit(session), cycleVehicle);

const run = new Run(core, {
  inGame: playingGame,
  riderOn,
  input: () => input.mask,
  vehicle: () => rides.current,
  ghostKey,
  focus: focusRider,
  tick: () => checkAchievements(false),
  ended: showSummary,
});

const worlds = new WorldDirector(core, {
  applied() {
    // The title's demo run restarts on the new ground (no mid-run re-simulation).
    if (session.kind === 'title') run.rewind();
    run.ghost = null;
  },
  shown: (w) => core.ui?.setWorldBadge(w),
});

const rides = new Rides(core, {
  lockReason: () => (rides.locked ? (challenge() > 0 ? "the challenger's ride" : "this level's ride") : null),
  changed() {
    run.ghost = null;
    run.reset();
  },
});

/** Ghosts and bests are per track, ride and ground. */
function ghostKey() {
  return runKey(track, rides.current.id, surfaceOf(env.config));
}

function focusRider() {
  sim.seek(run.frame);
  sim.rider.center(riderCenter);
  moves.focus(riderCenter);
  rig.snapTo(riderCenter);
}

function cycleVehicle() {
  if (rides.locked) return;
  run.stop();
  const next = rides.cycle();
  if (next) core.ui.flash(`Ride: ${next.name}`);
}

// ------------------------------------------------------------------ saving

/** A freshly loaded demo is not saved, so it never overwrites the player's own track. */
let pristine = true;
let loading = false;
let saveTimer = 0;

function loadInto(fn: () => void) {
  // A pending autosave belongs to the track being replaced.
  clearTimeout(saveTimer);
  loading = true;
  fn();
  loading = false;
}

track.on((e) => {
  if (loading || e.kind === 'cleared' || levelIndex() !== null) return;
  pristine = false;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => writeJSON(KEYS.track, track.serialize()), 400);
});

function savedTrack(): SerializedTrack | null {
  try {
    const data = validateTrack(readJSON<unknown>(KEYS.track, null));
    return data.strokes.length > 0 ? data : null;
  } catch {
    return null;
  }
}

loadInto(() => buildDemoTrack(track));
worlds.apply(env.config);
rides.dress();

// ------------------------------------------------------------------ UI
const cameraModes: CameraMode[] = ['cinematic', 'chase', 'side', 'follow'];

const ui = new UI(stage.app.appendChild(Object.assign(document.createElement('div'), { className: 'ui' })), editor, {
  play: () => run.play(),
  pause: () => run.pause(),
  stop: () => run.stop(),
  seek: (f) => run.seek(f),
  cycleCamera() {
    rig.mode = cameraModes[(cameraModes.indexOf(rig.mode) + 1) % cameraModes.length];
    return CAMERA_LABELS[rig.mode];
  },
  toggleSlowMo() {
    run.slowMo = !run.slowMo;
    return run.slowMo;
  },
  levels: () => backToLevels(),
  mainMenu() {
    run.stop();
    enterTitle();
  },
  async newTrack() {
    if (!(await confirmReplace('Start a new track?', 'Start fresh'))) return;
    startNewTrack();
  },
  async loadDemo() {
    if (!(await confirmReplace('Load the demo?', 'Load demo'))) return;
    openTrack(() => buildDemoTrack(track), DEFAULT_WORLD);
  },
  exportTrack() {
    const blob = new Blob([JSON.stringify(track.serialize())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `linerider3d-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  importTrack(file) {
    file.text().then((text) => {
      try {
        const data = validateTrack(JSON.parse(text));
        // An imported track is the player's own: it is saved like any edit.
        openTrack(() => track.load(data), null, false);
        writeJSON(KEYS.track, track.serialize());
        ui.flash('Track loaded');
      } catch (e) {
        ui.flash(e instanceof TrackFormatError ? e.message : 'Invalid track file', 4500);
      }
    });
  },
  focusRider,
  world: () => env.config,
  setWorld(w) {
    const cfg = normalizeWorld(w);
    // The ground changes the physics: the run starts over.
    run.stop();
    track.setWorld(cfg);
    worlds.applyNow(cfg);
    ui.flash(`${env.config.biome[0].toUpperCase()}${env.config.biome.slice(1)} · ${env.config.time} · ${env.config.weather}`);
    return env.config;
  },
  settings: () => openSettings(),
  escape() {
    if (playingGame() && run.playing) openPause();
    else run.stop();
  },
  photo: () => openPhoto(),
  async share(score = 0) {
    const url = await shareLink(track.serialize(), score, rides.current.id);
    const text = score > 0 ? `I scored ${score.toLocaleString()} on this Line Rider 3D track. Can you beat it?` : 'Ride my Line Rider 3D track!';
    // Phones: the native share sheet. Elsewhere: a dialog with a copy button.
    if (navigator.share && stage.isTouch) {
      try {
        await navigator.share({ title: 'Line Rider 3D', text, url });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    ui.showLink(url, score);
  },
  toggleSfx() {
    sound.setSfx(!sound.sfxOn);
    return sound.sfxOn;
  },
  toggleMusic() {
    sound.setMusic(!sound.musicOn);
    return sound.musicOn;
  },
  toggleRiderMode() {
    riderMode = !riderMode;
    writeFlag(KEYS.riderMode, riderMode);
    return riderMode;
  },
  touchInput(mask) {
    input.touch = mask;
  },
  cycleVehicle,
  click: () => sound.click(),
}, riderMode);
core.ui = ui;
ui.setSoundState(sound.sfxOn, sound.musicOn);
ui.setWorldBadge(env.config);
rides.apply(rides.current);

const quality = new Quality(core);
quality.apply(true);
fitToWindow(stage, () => core.effects.setViewportHeight(innerHeight * stage.renderer.getPixelRatio()));

// ------------------------------------------------------------------ sessions

/** Asks before replacing a track the player has worked on. */
async function confirmReplace(title: string, action: string) {
  if (pristine || track.strokes.size === 0) return true;
  return ui.confirm(title, 'Your current track will be replaced. Export it first if you want to keep it.', action);
}

/**
 * Switches session: editor on or off, the ride lock, rider controls.
 * Levels lock their own ride; a challenge locks the challenger's.
 */
function enter(next: Session, lockedRide: VehicleDef | null = null) {
  const wasTitle = session.kind === 'title';
  session = next;
  if (wasTitle && next.kind !== 'title') {
    run.playing = false;
    run.reset();
    ui.setPlaying(false);
  }
  const index = levelOf(next);
  const fixed = index !== null ? LEVELS[index].vehicle : undefined;
  rides.lock(fixed ? vehicleById(fixed) : lockedRide);
  editor.enabled = next.kind === 'edit';
  document.body.classList.toggle('level-mode', next.kind === 'level');
  ui.setRiderMode(next.kind === 'level' || challenge() > 0 ? true : riderMode);
}

/**
 * Opens a track in the editor and flies to its start. `world` null means the
 * track's own world; `fresh` tracks (demo, new, shared) aren't autosaved until edited.
 */
function openTrack(load: () => void, world: Partial<WorldConfig> | null, fresh = true) {
  enter(EDIT);
  loadInto(load);
  worlds.change(world ?? worlds.trackWorld());
  pristine = fresh;
  editor.history.clear();
  run.stop();
  moves.showStart(track);
}

function startNewTrack() {
  enter(EDIT);
  loadInto(() => {
    track.clear();
    track.setStart(new THREE.Vector3(0, 12, 0));
  });
  worlds.change(DEFAULT_WORLD);
  pristine = true;
  editor.history.clear();
  run.stop();
  moves.flyTo(new THREE.Vector3(0, 14, 30), new THREE.Vector3(0, 10, 0));
}

function enterTitle() {
  enter(TITLE);
  run.ghost = null;
  loadInto(() => buildDemoTrack(track));
  worlds.startTour();
  pristine = true;
  run.reset();
  sim.clearInputs();
  run.playing = true;
  titleFlow();
}

/** Garage and wardrobe: Bosh waits at the start for a close look. */
async function closeUp<T>(show: () => Promise<T>): Promise<T> {
  moves.closeUp = true;
  run.playing = false;
  run.reset();
  const result = await show();
  moves.closeUp = false;
  run.playing = true;
  return result;
}

async function titleFlow() {
  for (;;) {
    const progress = loadProgress();
    const choice = await ui.showTitle(savedTrack() !== null, totalStars(progress), LEVELS.length * 3);
    if (choice === 'wardrobe') {
      const stars = totalStars(progress);
      await closeUp(() =>
        ui.showWardrobe(
          OUTFITS.map((o) => ({ id: o.id, name: o.name, stars: o.stars, colors: [o.jacket, o.scarf, o.hat, o.sled], unlocked: outfitUnlocked(o, stars), world: o.hint })),
          stars,
          selectedOutfit().id,
          (id) => {
            selectOutfit(id);
            rides.dress();
          },
        ),
      );
      continue;
    }
    if (choice === 'settings') {
      await openSettings();
      continue;
    }
    if (choice === 'trophies') {
      const got = unlockedAchievements();
      await ui.showTrophies(
        ACHIEVEMENTS.map((a) => ({ id: a.id, title: a.title, desc: a.desc, ride: a.ride, rideName: a.ride ? vehicleById(a.ride).name : undefined, unlocked: !!got[a.id] })),
      );
      continue;
    }
    if (choice === 'garage') {
      await closeUp(() =>
        ui.showGarage(
          rides.garageCards(),
          rides.current.id,
          (id) => {
            rides.choose(id);
            run.playing = false;
          },
          (ride, paint) => {
            selectPaint(ride as VehicleDef['id'], paint);
            rides.dress();
            return rides.garageCards();
          },
        ),
      );
      continue;
    }
    if (choice === 'levels') {
      const idx = await pickLevel();
      if (idx === null) continue;
      startLevel(idx);
      return;
    }
    if (choice === 'create') {
      const data = savedTrack();
      enter(EDIT);
      if (data) {
        loadInto(() => track.load(data));
        pristine = false;
      }
      worlds.change(worlds.trackWorld());
      moves.showStart(track);
    } else {
      startNewTrack();
      const seen = readText(KEYS.helpSeen) !== null;
      writeText(KEYS.helpSeen, '1');
      if (!seen) setTimeout(() => ui.showHelp(), 900);
    }
    return;
  }
}

function pickLevel(): Promise<number | null> {
  const progress = loadProgress();
  return ui.showLevels(
    LEVELS.map((l, i) => ({
      name: l.name,
      tip: l.tip,
      stars: progress[l.id]?.stars ?? 0,
      score: progress[l.id]?.score ?? 0,
      unlocked: isUnlocked(i, progress),
      world: chapterOf(l),
      ride: l.vehicle,
    })),
    totalStars(progress),
  );
}

async function startLevel(index: number) {
  enter({ kind: 'level', index });
  const level = LEVELS[index];
  loadInto(() => level.build(track));
  worlds.change(worlds.levelWorld(index));
  pristine = true;
  editor.history.clear();
  run.stop();
  moves.showStart(track, 1.3);
  const best = loadProgress()[level.id]?.stars ?? 0;
  const goals = rateRun(track, runStats.stats).goals.map((g) => g.label);
  await ui.showLevelIntro(index + 1, level.name, level.tip, goals, best, rides.keys(), rides.picker(), worlds.picker(worlds.levelWorld(index)));
  run.play();
}

async function backToLevels() {
  run.stop();
  const idx = await pickLevel();
  if (idx === null) enterTitle();
  else startLevel(idx);
}

/** Opens a track from a share link, with an intro (and the challenge score). */
async function enterShared(data: SerializedTrack, score: number, vehicleId: string | null) {
  // A challenge is ridden on the challenger's ride.
  enter({ kind: 'edit', challenge: score }, score > 0 && vehicleId ? vehicleById(vehicleId) : null);
  loadInto(() => track.load(data));
  worlds.change(worlds.trackWorld());
  pristine = true;
  history.replaceState(null, '', location.pathname + location.search);
  moves.showStart(track, 1.3);
  // Outside levels a world pick belongs to the track (saved, shared, exported).
  const picker = score > 0 ? undefined : worlds.picker(worlds.trackWorld(), (w) => track.setWorld(w));
  await ui.showSharedIntro(score, rateRun(track, runStats.stats).goals.map((g) => g.label), rides.keys(), rides.picker(), picker);
  run.play();
}

// ------------------------------------------------------------------ end of a run, achievements

let worldsSeen = loadCounters();

/** Unlocks achievements for the current run state (mid-run or at the end). */
function checkAchievements(ended: boolean, rating = 0) {
  if (!playingGame() || run.replaying) return;
  const s = runStats.stats;
  const index = levelIndex();
  const levelDone = ended && s.finished && !s.crashed && index !== null;
  // Storage is only touched when something new happens.
  if (levelDone || !worldsSeen.rode.includes(env.config.biome)) worldsSeen = noteWorld(env.config.biome, levelDone);
  const ctx: RunContext = {
    stats: s,
    vehicle: rides.current.id,
    levelId: index !== null ? LEVELS[index].id : null,
    rating,
    tricks: run.tricks,
    ended,
    totalStars: totalStars(),
    wipeouts: run.wipeouts,
    beatChallenge: ended && challenge() > 0 && s.score >= challenge(),
    ownTrack: freeEdit(session) && !pristine,
    world: env.config,
    worldsRidden: worldsSeen.rode.length,
    worldsFinished: worldsSeen.finished.length,
    champion: ended ? champions() : {},
  };
  for (const a of evaluate(ctx)) {
    ui.toast(a.title, a.desc, a.ride);
    sound.success();
  }
}

/** Saves the result (stars, best, ghost) and shows the run summary. */
function showSummary(wasReplay: boolean) {
  const s = runStats.stats;
  const index = levelIndex();
  const rating = rateRun(track, s);
  if (index !== null && !wasReplay) saveLevelResult(LEVELS[index].id, rating.stars, s.score);
  const levelInfo =
    index !== null ? { number: index + 1, name: LEVELS[index].name, hasNext: index + 1 < LEVELS.length, nextUnlocked: isUnlocked(index + 1) } : undefined;
  // Save this run as the ghost to beat if it's the best so far.
  let ghostSaved = false;
  if (!wasReplay && riderOn()) {
    const key = ghostKey();
    if (beats(s.score, s.finishTime, loadGhost(key))) {
      saveGhost(key, { rle: encodeInputs(sim.inputsUpTo(run.frame)), frames: run.frame, score: s.score, finishTime: s.finishTime });
      ghostSaved = true;
    }
  }
  const best = wasReplay ? { best: recordBest(ghostKey(), 0, 0).best, newBest: false } : recordBest(ghostKey(), s.score, rating.stars);
  if (rating.stars === 3) setTimeout(() => sound.perfect(), 700);
  if (!wasReplay) checkAchievements(true, rating.stars);
  ui.showSummary(
    { ...s },
    {
      ...best,
      riderMode: riderOn(),
      goals: rating.goals,
      rating: rating.stars,
      starsTotal: track.stars.size,
      ghostSaved,
      level: levelInfo,
      challenge: challenge(),
      vehicle: rides.current.name,
    },
    () => {
      run.reset();
      run.play();
    },
    () => run.stop(),
    () => run.watchReplay(),
    () => backToLevels(),
    () => {
      if (index !== null) startLevel(index + 1);
    },
  );
}

// ------------------------------------------------------------------ photo mode, settings, pause
let photoOn = false;

/** Freezes the moment, hides the UI and lets the player frame a shot. */
async function openPhoto() {
  if (!playingGame() || photoOn || run.summaryShown) return;
  photoOn = true;
  const wasPlaying = run.playing;
  run.pause();
  const prevMode = rig.mode;
  rig.mode = 'follow';
  controls.target.copy(riderCenter);
  document.body.classList.add('photo');
  await ui.showPhotoMode(
    camera.fov,
    (fov) => {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    },
    () => {
      // Render and grab the frame in the same task (the buffer isn't preserved).
      stage.postfx.flash = 0;
      stage.postfx.render(0);
      stage.renderer.domElement.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `linerider3d-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, 'image/png');
      run.flash = 0.6;
      sound.click(true);
    },
  );
  document.body.classList.remove('photo');
  rig.mode = prevMode;
  photoOn = false;
  if (wasPlaying) run.play();
}

async function openSettings() {
  const settings = core.settings;
  const view: SettingsView = { ...settings, qualityNote: quality.note };
  await ui.showSettings(
    view,
    (v) => {
      const qualityChanged = v.quality !== settings.quality;
      Object.assign(settings, {
        quality: v.quality as QualitySetting,
        sfxVolume: v.sfxVolume,
        musicVolume: v.musicVolume,
        camera: v.camera as CameraMode,
        cameraDistance: v.cameraDistance,
        reducedMotion: v.reducedMotion,
      });
      saveSettings(settings);
      if (qualityChanged && settings.quality === 'auto') quality.restartAuto();
      quality.apply();
    },
    () => resetProgress(),
  );
}

/** Esc while riding: a pause menu instead of throwing the run away. */
async function openPause() {
  run.pause();
  const index = levelIndex();
  const title = index !== null ? LEVELS[index].name : challenge() > 0 ? 'Challenge' : 'Your track';
  for (;;) {
    const choice = await ui.showPause(title, true);
    if (choice === 'settings') {
      await openSettings();
      continue;
    }
    if (choice === 'resume') run.play();
    else if (choice === 'restart') {
      run.stop();
      run.play();
    } else if (choice === 'levels') backToLevels();
    else {
      run.stop();
      enterTitle();
    }
    return;
  }
}

// ------------------------------------------------------------------ loop
const timer = new THREE.Timer();
timer.connect(document);
let booted = false;

function loop(time: number) {
  timer.update(time);
  const rawDt = timer.getDelta();
  const dt = THREE.MathUtils.clamp(rawDt, 0, 0.1);
  const t = timer.getElapsed();

  run.update(dt);
  const rider = sim.rider;

  // Camera.
  if (session.kind === 'title') {
    // Loop the demo run behind the title.
    const s = runStats.stats;
    if (s.still > 1 || s.crashed || run.frame > 900) run.reset();
    // Tour the worlds only while the title menu itself is showing.
    worlds.tour(dt, !moves.devView && !moves.closeUp && !!document.querySelector('.title-screen') && !document.querySelector('.screen, .modal'));
    moves.attract(t, dt, riderCenter);
    rig.settle(dt);
  } else if (moves.flying) {
    moves.updateTween(dt);
    rig.settle(dt);
    controls.update();
  } else if (run.playing) {
    rig.update(dt, riderCenter, core.riderVel, STEPS_PER_SECOND, !rider.contact.some((c) => c) && !rider.crashed);
    if (rig.mode === 'follow') controls.update();
  } else {
    if (!photoOn) rig.settle(dt);
    controls.update();
  }
  rig.applyShake(dt);
  core.effects.update(dt);

  run.checkEnd(dt);
  run.updateFlash(dt);
  quality.govern(rawDt);

  const game = playingGame();
  editor.update(!run.playing && game && levelIndex() === null);
  core.trackView.update(t, riderCenter, rider.stars);
  env.update(dt, controls.target, t, camera.position);
  worlds.updateHeadlight(game);
  ui.setTime(run.frame, sim.recorded, STEPS_PER_SECOND);
  ui.setHud(game && (run.playing || run.frame > 0) && !run.summaryShown, runStats.stats, track.stars.size);
  ui.setTouchPad(stage.isTouch && riderOn() && game && run.playing && !run.replaying, rides.current.handling.yaw !== null);
  stage.postfx.render(dt);

  if (!booted) {
    booted = true;
    document.getElementById('boot')?.classList.add('gone');
    setTimeout(() => document.getElementById('boot')?.remove(), 700);
    // A share link opens its track directly; otherwise show the title.
    readSharedLink()
      .then((shared) => (shared ? enterShared(shared.data, shared.challenge, shared.vehicle) : enterTitle()))
      .catch((e) => {
        ui.flash(e instanceof TrackFormatError ? e.message : 'That share link looks broken', 4500);
        enterTitle();
      });
  }
}
stage.renderer.setAnimationLoop(loop);

// ------------------------------------------------------------------ dev hooks
let devClock = performance.now();
if (import.meta.env.DEV) {
  const devWorld = (biome: string, time?: string, weather?: string) => worlds.apply({ biome, time, weather } as Partial<WorldConfig>);
  Object.assign(window, {
    lr3d: {
      ...core,
      session: () => session,
      run,
      shot: (biome: string, time = 'day', weather = 'clear', p?: number[], t?: number[]) => {
        document.body.classList.add('dev-shot');
        devWorld(biome, time, weather);
        if (p && t) moves.devView = [new THREE.Vector3(...p), new THREE.Vector3(...t)];
        return env.config;
      },
      view: (p?: number[], t?: number[]) => (moves.devView = p && t ? [new THREE.Vector3(...p), new THREE.Vector3(...t)] : null),
      world: devWorld,
      keys: (m: number) => (input.devKeys = m),
      /** Advance the game loop by hand (hidden tabs get no animation frames). */
      tick: (n = 1, ms = 1000 / 60) => {
        timer.disconnect();
        for (let k = 0; k < n; k++) loop((devClock += ms));
      },
      chooseVehicle: (id: string) => rides.choose(id),
      fx: () => ({ timeScale: run.timeScale, impact: run.impact, fov: camera.fov }),
      ghostInfo: () => ({ visible: core.ghostView.root.visible, frame: run.ghost?.sim.frame, butt: run.ghost?.sim.rider.pos[P.butt].toArray(), me: sim.rider.pos[P.butt].toArray() }),
    },
  });
}
