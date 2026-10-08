import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';
import { Track, type SerializedTrack } from './track/Track';
import { TrackView } from './render/TrackView';
import { RiderView } from './render/RiderView';
import { CameraRig, CAMERA_LABELS, type CameraMode } from './render/CameraRig';
import { Simulation, STEPS_PER_SECOND } from './physics/Simulation';
import { EVENT, INPUT, P } from './physics/Rider';
import { VEHICLES, vehicleById, type VehicleDef } from './physics/vehicles';
import { Environment } from './world/Environment';
import { terrainHeight } from './world/terrain';
import { DEFAULT_WORLD, SURFACES, normalizeWorld, sameWorld, surfaceOf, type WorldConfig } from './world/worlds';
import { Editor } from './editor/Editor';
import { UI, overlayOpen, type SettingsView } from './ui/UI';
import { loadSettings, resetProgress, saveSettings, type Quality, type Settings } from './game/settings';
import { Effects } from './render/Effects';
import { Trail } from './render/Trail';
import { SurfaceTracks } from './render/SurfaceTracks';
import { PostFX } from './render/PostFX';
import { Sound } from './audio/Sound';
import { RunStats } from './game/RunStats';
import { buildDemoTrack } from './demoTrack';
import { readSharedLink, shareLink } from './game/share';
import { rateRun } from './game/rating';
import { GhostRun, beats, encodeInputs, loadGhost, saveGhost } from './game/Ghost';
import { LEVELS, chapterOf } from './levels/levels';
import { OUTFITS, champions, isUnlocked, outfitUnlocked, loadProgress, saveLevelResult, selectOutfit, selectVehicle, selectedOutfit, selectedVehicleId, totalStars } from './game/progress';
import { applyOutfit, applyPaint } from './render/RiderView';
import { ACHIEVEMENTS, PAINTS, bumpWipeouts, evaluate, loadCounters, noteWorld, paintFor, rideProgress, selectPaint, unlockedAchievements, type RunContext } from './game/achievements';

const STORAGE_KEY = 'lr3d.track';
const lowPower = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4;

// ------------------------------------------------------------------ renderer
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.domElement.className = 'game';
app.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(30, 22, 40);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(10, 15, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.maxDistance = 250;
controls.minDistance = 2;
controls.update();

const env = new Environment(scene, renderer, lowPower);
const postfx = new PostFX(renderer, scene, camera, lowPower);
postfx.setSize(innerWidth, innerHeight);

// ------------------------------------------------------------------ game objects
const track = new Track();
const trackView = new TrackView(scene, track);
const riderView = new RiderView(scene);
const ghostView = new RiderView(scene, true);
ghostView.visible = false;
/** Best run replayed alongside the player. */
let ghost: GhostRun | null = null;
const sim = new Simulation(track);
const rig = new CameraRig(camera, controls);
const effects = new Effects(scene);
effects.setViewportHeight(innerHeight * renderer.getPixelRatio());
const trail = new Trail(scene);
const groundMarks = new SurfaceTracks(scene);
const sound = new Sound();
const runStats = new RunStats();
const ground = env.ground;
const editor = new Editor(renderer.domElement, camera, scene, controls, track, trackView, ground);

let mode: 'title' | 'game' = 'title';
let playing = false;
let slowMo = false;
let frame = 0;
let acc = 0;
let summaryShown = false;
let crashClock = 0;
let finishClock = 0;

// ------------------------------------------------------------------ slow motion moments
/** Playback speed (1 = real time). Only playback: the simulation stays exact. */
let timeScale = 1;
let slowTarget = 1;
let slowTimer = 0;
let impact = 0;

/** Bullet time for `seconds` of real time. */
function slowmo(scale: number, seconds: number) {
  slowTarget = scale;
  slowTimer = seconds;
  sound.slowmoHit();
}
/** Tricks landed this run (for achievements). */
const runTricks: string[] = [];
/** Stars already sparkled this run (so scrubbing doesn't repeat them). */
const sparkled = new Set<number>();
let flash = 0;

// ------------------------------------------------------------------ rider mode input
let riderMode = false;
try {
  riderMode = localStorage.getItem('lr3d.riderMode') === '1';
} catch {
  /* storage unavailable */
}
/** Watching a recorded run: inputs are played back, not taken live. */
let replaying = false;
let keyMask = 0;
let touchMask = 0;
const isTouch = matchMedia('(pointer: coarse)').matches;

const KEY_BITS: Record<string, number> = {
  ArrowRight: INPUT.push,
  ArrowUp: INPUT.spin,
  ArrowLeft: INPUT.brake,
  ArrowDown: INPUT.brake,
};
addEventListener('keydown', (e) => {
  const bit = KEY_BITS[e.key];
  if (!bit || mode !== 'game') return;
  e.preventDefault();
  keyMask |= bit;
});
addEventListener('keyup', (e) => {
  const bit = KEY_BITS[e.key];
  if (bit) keyMask &= ~bit;
});
addEventListener('blur', () => (keyMask = 0));
addEventListener('keydown', (e) => {
  // V: next ride while editing (levels and challenges pick theirs on the intro).
  if ((e.key === 'v' || e.key === 'V') && mode === 'game' && currentLevel === null && challengeScore === 0 && !overlayOpen() && !(e.target instanceof HTMLInputElement)) {
    cycleVehicle();
  }
});

// ------------------------------------------------------------------ worlds
/** Shows a world: landscape, sky, decor style, grade. */
function applyWorld(w: Partial<WorldConfig>, force = false) {
  const footprint: THREE.Vector3[] = [];
  for (const s of track.strokes.values()) for (let i = 0; i < s.points.length; i += 2) footprint.push(s.points[i]);
  footprint.push(track.start);
  if (!env.setWorld(w, footprint, force)) return false;
  postfx.setGrade(env.atm.grade);
  trackView.setWorld(env.config, env.atm.night, env.atm.wet);
  const ground = surfaceOf(env.config);
  effects.setSurface(ground, env.atm.night);
  groundMarks.setSurface(ground, env.atm.wet, env.atm.night);
  sim.setGroundDrag(SURFACES[ground].drag);
  sound.setWorld(env.config.biome, env.config.time, env.config.weather, ground);
  ghost = null;
  return true;
}
postfx.setGrade(env.atm.grade);

env.weather.onStrike = (d) => sound.thunder(d);

/** The world a track asks for (its author's pick, or the default). */
const trackWorld = () => normalizeWorld(track.world as Partial<WorldConfig> | null);
const levelWorld = (i: number) => normalizeWorld(LEVELS[i].world);

/** Switches world behind a quick fade so the rebuild never shows. */
function changeWorld(w: Partial<WorldConfig>) {
  if (sameWorld(normalizeWorld(w), env.config)) return applyWorld(w);
  const fade = document.querySelector('.world-fade') ?? document.body.appendChild(Object.assign(document.createElement('div'), { className: 'world-fade' }));
  fade.classList.add('on');
  // Two frames so the fade is on screen before the (blocking) rebuild.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      applyWorld(w);
      fade.classList.remove('on');
    }),
  );
  return true;
}

/** World chips on an intro card: pick any world, the home one is marked. */
function worldPicker(home: WorldConfig) {
  return {
    // The intro opens on the home world (switched to just before).
    value: home,
    home,
    onPick: (w: Partial<WorldConfig>) => {
      applyWorld(w);
      return env.config;
    },
  };
}

/** The rider's lamp after dark: a soft spot ahead of the ride. */
const headlight = new THREE.SpotLight(0xfff1d6, 0, 46, 0.55, 0.6, 1.2);
scene.add(headlight, headlight.target);
const lampDir = new THREE.Vector3(1, -0.15, 0);
function updateHeadlight() {
  const n = env.atm.night;
  headlight.visible = n > 0.05 && mode === 'game';
  if (!headlight.visible) return;
  if (riderVel.lengthSq() > 1e-4) lampDir.lerp(riderVel.clone().normalize(), 0.2).normalize();
  headlight.intensity = 60 * n;
  headlight.position.copy(riderCenter).add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(lampDir, 0.6);
  headlight.target.position.copy(riderCenter).addScaledVector(lampDir, 14).add(new THREE.Vector3(0, -2, 0));
}

// ------------------------------------------------------------------ rides
/** The ride in use (the player's choice, or the one a level or challenge sets). */
let vehicle: VehicleDef = vehicleById(selectedVehicleId());
/** Set when the current level or challenge decides the ride. */
let lockedVehicle: VehicleDef | null = null;

function applyVehicle(def: VehicleDef) {
  vehicle = def;
  sim.setVehicle(def);
  riderView.setVehicle(def);
  sound.setRide(def.sound);
  dressRider();
  groundMarks.width = { sled: 0.07, skis: 0.07, snowboard: 0.18, bike: 0.08, moto: 0.12, buggy: 0.17 }[def.id];
  ui.setVehicle(def.id, def.name, lockReason());
  ghost = null;
  resetRun();
}

/** Why the ride can't be switched right now (null: it can). */
function lockReason() {
  if (!lockedVehicle) return null;
  return challengeScore > 0 ? "the challenger's ride" : "this level's ride";
}

/** Outfit colors, then the ride's paint job on top. */
function dressRider() {
  applyOutfit(selectedOutfit());
  const p = paintFor(vehicle.id);
  if (p.colors) applyPaint(p.colors[0], p.colors[1]);
}

/** Garage cards with challenge progress and paint jobs. */
function garageCards() {
  const got = unlockedAchievements();
  return VEHICLES.map((v) => {
    const prog = rideProgress(v.id, got);
    return {
      id: v.id,
      name: v.name,
      blurb: v.blurb,
      stats: v.stats,
      progress: prog,
      paint: paintFor(v.id).id,
      paints: PAINTS[v.id].map((p) => ({ id: p.id, name: p.name, colors: p.colors ?? [], unlocked: prog.done >= p.need, need: p.need })),
    };
  });
}

/** Picks a ride as the player's choice (persisted). */
function chooseVehicle(id: string) {
  selectVehicle(id);
  applyVehicle(vehicleById(id));
}

function cycleVehicle() {
  if (lockedVehicle) return;
  const next = VEHICLES[(VEHICLES.indexOf(vehicle) + 1) % VEHICLES.length];
  stop();
  chooseVehicle(next.id);
  ui.flash(`Ride: ${next.name}`);
}

/** Control hints for a ride. */
function keysFor(def: VehicleDef) {
  const flips = def.handling.flipSign > 0 ? '←/→ flip' : '→ backflip · ← frontflip';
  const push = { sled: 'push', skis: 'skate', snowboard: 'push', bike: 'pedal', moto: 'throttle', buggy: 'gas' }[def.id];
  return `→ ${push} · ← brake · in the air: ${flips}${def.handling.yaw ? ' · ↑ spin' : ''}, release to land`;
}

/** Intro ride picker: free choice, or the level's own ride. */
function ridePicker() {
  return {
    options: VEHICLES.map((v) => ({ id: v.id, name: v.name })),
    selected: vehicle.id,
    locked: lockedVehicle !== null,
    onPick: (id: string) => {
      chooseVehicle(id);
      return keysFor(vehicle);
    },
  };
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
  if (loading || e.kind === 'cleared' || currentLevel !== null) return;
  pristine = false;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(track.serialize()));
    } catch {
      /* storage full or unavailable */
    }
  }, 400);
});

function savedTrack(): SerializedTrack | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? (JSON.parse(raw) as SerializedTrack) : null;
    return data && data.strokes.length > 0 ? data : null;
  } catch {
    return null;
  }
}

loadInto(() => buildDemoTrack(track));
applyWorld(env.config);
dressRider();

// ------------------------------------------------------------------ camera moves
const riderCenter = new THREE.Vector3();
const riderVel = new THREE.Vector3();

interface Tween {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  t: number;
  duration: number;
  done?: () => void;
}
let tween: Tween | null = null;

function flyTo(pos: THREE.Vector3, target: THREE.Vector3, duration = 1.4, done?: () => void) {
  tween = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos: pos, toTarget: target, t: 0, duration, done };
}

function updateTween(dt: number) {
  if (!tween) return;
  tween.t = Math.min(1, tween.t + dt / tween.duration);
  const k = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
  camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
  controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
  if (tween.t >= 1) {
    const done = tween.done;
    tween = null;
    done?.();
  }
}

/** A pleasant 3/4 view of the start flag. */
function startView() {
  const target = track.start.clone().add(new THREE.Vector3(8, -4, 0));
  const pos = target.clone().add(new THREE.Vector3(-8, 8, 28));
  if (innerWidth < innerHeight) pos.add(new THREE.Vector3(-6, 6, 18));
  return { pos, target };
}

function focusRider() {
  sim.seek(frame);
  sim.rider.center(riderCenter);
  const offset = camera.position.clone().sub(controls.target);
  offset.setLength(THREE.MathUtils.clamp(offset.length(), 8, 30));
  controls.target.copy(riderCenter);
  camera.position.copy(riderCenter).add(offset);
  rig.snapTo(riderCenter);
}

// ------------------------------------------------------------------ run control
function resetRun() {
  slowTimer = 0;
  impact = 0;
  frame = 0;
  acc = 0;
  summaryShown = false;
  crashClock = 0;
  finishClock = 0;
  sparkled.clear();
  runTricks.length = 0;
  effects.reset();
  trail.reset();
  groundMarks.reset();
  runStats.reset();
  ui.hideSummary();
}

function play() {
  if (summaryShown) resetRun();
  // A fresh attempt (or a classic run) starts with no recorded input.
  if (frame === 0 && !replaying) sim.clearInputs();
  if (frame === 0) {
    const record = mode === 'game' ? loadGhost(ghostKey()) : null;
    ghost = record ? new GhostRun(track, record, vehicle, sim.rider.groundDrag) : null;
    ghostView.setVehicle(vehicle);
  }
  if (frame === 0) focusRider();
  else rig.snapTo(sim.rider.center(riderCenter));
  playing = true;
  ui.setPlaying(true);
}

function pause() {
  playing = false;
  ui.setPlaying(false);
}

function stop() {
  pause();
  setReplay(false);
  resetRun();
}

/** Replays use the TV director camera and a letterboxed look. */
let modeBeforeReplay: CameraMode | null = null;
function setReplay(on: boolean) {
  replaying = on;
  document.body.classList.toggle('replaying', on);
  if (on && modeBeforeReplay === null) {
    modeBeforeReplay = rig.mode;
    rig.mode = 'director';
    rig.startDirector();
  } else if (!on && modeBeforeReplay !== null) {
    rig.mode = modeBeforeReplay;
    modeBeforeReplay = null;
  }
}

/** Best score per track, keyed by a hash of its content. */
function trackKey() {
  const json = JSON.stringify({ s: track.serialize().strokes, r: track.serialize().rings, t: track.start.toArray() });
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

/** Ghosts are per ride and ground (the sled on snow keeps the original keys). */
function ghostKey() {
  const ground = surfaceOf(env.config);
  const base = vehicle.id === 'sled' ? trackKey() : `${trackKey()}:${vehicle.id}`;
  return ground === 'snow' ? base : `${base}:${ground}`;
}

interface BestRecord {
  score: number;
  stars: number;
}

function loadBests(): Record<string, BestRecord> {
  try {
    const raw = JSON.parse(localStorage.getItem('lr3d.best') ?? '{}') as Record<string, BestRecord | number>;
    const out: Record<string, BestRecord> = {};
    for (const [k, v] of Object.entries(raw)) out[k] = typeof v === 'number' ? { score: v, stars: 0 } : v;
    return out;
  } catch {
    return {};
  }
}

/** Keeps the best score and star rating of the current track. */
function recordBest(score: number, stars: number): { best: number; newBest: boolean } {
  const all = loadBests();
  const key = ghostKey();
  const prev = all[key] ?? { score: 0, stars: 0 };
  const newBest = score > prev.score && score > 0;
  all[key] = { score: Math.max(prev.score, score), stars: Math.max(prev.stars, stars) };
  try {
    localStorage.setItem('lr3d.best', JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
  return { best: all[key].score, newBest };
}

const cameraModes: CameraMode[] = ['cinematic', 'chase', 'side', 'follow'];


const ui = new UI(app.appendChild(Object.assign(document.createElement('div'), { className: 'ui' })), editor, {
  play,
  pause,
  stop,
  seek(f) {
    frame = f;
    acc = 0;
    summaryShown = false;
    ui.hideSummary();
  },
  cycleCamera() {
    rig.mode = cameraModes[(cameraModes.indexOf(rig.mode) + 1) % cameraModes.length];
    return CAMERA_LABELS[rig.mode];
  },
  toggleSlowMo() {
    slowMo = !slowMo;
    return slowMo;
  },
  levels() {
    backToLevels();
  },
  mainMenu() {
    stop();
    enterTitle();
  },
  async newTrack() {
    if (!pristine && track.strokes.size > 0) {
      const ok = await ui.confirm('Start a new track?', 'Your current track will be replaced. Export it first if you want to keep it.', 'Start fresh');
      if (!ok) return;
    }
    setLevel(null);
    startNewTrack();
  },
  async loadDemo() {
    if (!pristine && track.strokes.size > 0) {
      const ok = await ui.confirm('Load the demo?', 'Your current track will be replaced. Export it first if you want to keep it.', 'Load demo');
      if (!ok) return;
    }
    challengeScore = 0;
    setLevel(null);
    loadInto(() => buildDemoTrack(track));
    changeWorld(DEFAULT_WORLD);
    pristine = true;
    editor.history.clear();
    stop();
    const v = startView();
    flyTo(v.pos, v.target);
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
        challengeScore = 0;
        setLevel(null);
        track.load(JSON.parse(text) as SerializedTrack);
        changeWorld(trackWorld());
        editor.history.clear();
        stop();
        const v = startView();
        flyTo(v.pos, v.target);
        ui.flash('Track loaded');
      } catch {
        ui.flash('Invalid track file');
      }
    });
  },
  focusRider,
  world: () => env.config,
  setWorld(w) {
    const cfg = normalizeWorld(w);
    track.setWorld(cfg);
    applyWorld(cfg);
    ui.flash(`${env.config.biome[0].toUpperCase()}${env.config.biome.slice(1)} · ${env.config.time} · ${env.config.weather}`);
    return env.config;
  },
  settings: () => openSettings(),
  escape() {
    if (mode === 'game' && playing) openPause();
    else stop();
  },
  photo: () => openPhoto(),
  async share(score = 0) {
    const url = await shareLink(track.serialize(), score, vehicle.id);
    const text = score > 0 ? `I scored ${score.toLocaleString()} on this Line Rider 3D track. Can you beat it?` : 'Ride my Line Rider 3D track!';
    // Phones: the native share sheet. Elsewhere: a dialog with a copy button.
    if (navigator.share && isTouch) {
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
    try {
      localStorage.setItem('lr3d.riderMode', riderMode ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
    return riderMode;
  },
  touchInput(mask) {
    touchMask = mask;
  },
  cycleVehicle,
  click: () => sound.click(),
}, riderMode);
ui.setSoundState(sound.sfxOn, sound.musicOn);
applyVehicle(vehicle);

function startNewTrack() {
  challengeScore = 0;
  loadInto(() => {
    track.clear();
    track.setStart(new THREE.Vector3(0, 12, 0));
  });
  changeWorld(DEFAULT_WORLD);
  pristine = true;
  editor.history.clear();
  stop();
  flyTo(new THREE.Vector3(0, 14, 30), new THREE.Vector3(0, 10, 0));
}

// ------------------------------------------------------------------ title, levels, wardrobe
/** Index of the built-in level being played, or null in the editor. */
let currentLevel: number | null = null;
/** Score to beat when the track came from a friend's challenge link. */
let challengeScore = 0;

function enterTitle() {
  mode = 'title';
  challengeScore = 0;
  ghost = null;
  setLevel(null);
  loadInto(() => buildDemoTrack(track));
  titleClock = 0;
  changeWorld(TITLE_WORLDS[titleWorld]);
  pristine = true;
  resetRun();
  sim.clearInputs();
  playing = true;
  titleFlow();
}

async function titleFlow() {
  for (;;) {
    const progress = loadProgress();
    const choice = await ui.showTitle(savedTrack() !== null, totalStars(progress), LEVELS.length * 3);
    if (choice === 'wardrobe') {
      const stars = totalStars(progress);
      // Freeze Bosh at the start for a close look at his outfit.
      closeUp = true;
      playing = false;
      resetRun();
      await ui.showWardrobe(
        OUTFITS.map((o) => ({ id: o.id, name: o.name, stars: o.stars, colors: [o.jacket, o.scarf, o.hat, o.sled], unlocked: outfitUnlocked(o, stars), world: o.hint })),
        stars,
        selectedOutfit().id,
        (id) => {
          selectOutfit(id);
          dressRider();
        },
      );
      closeUp = false;
      playing = true;
      continue;
    }
    if (choice === 'settings') {
      await openSettings();
      continue;
    }
    if (choice === 'trophies') {
      const got = unlockedAchievements();
      await ui.showTrophies(
        ACHIEVEMENTS.map((a) => ({
          id: a.id,
          title: a.title,
          desc: a.desc,
          ride: a.ride,
          rideName: a.ride ? vehicleById(a.ride).name : undefined,
          unlocked: !!got[a.id],
        })),
      );
      continue;
    }
    if (choice === 'garage') {
      // Bosh waits at the start on his ride for a close look.
      closeUp = true;
      playing = false;
      resetRun();
      await ui.showGarage(
        garageCards(),
        vehicle.id,
        (id) => {
          chooseVehicle(id);
          playing = false;
        },
        (ride, paint) => {
          selectPaint(ride as VehicleDef['id'], paint);
          dressRider();
          return garageCards();
        },
      );
      closeUp = false;
      playing = true;
      continue;
    }
    if (choice === 'levels') {
      const idx = await pickLevel();
      if (idx === null) continue;
      startLevel(idx);
      return;
    }
    leaveTitle();
    if (choice === 'create') {
      const data = savedTrack();
      if (data) {
        loadInto(() => track.load(data));
        pristine = false;
      }
      changeWorld(trackWorld());
      const v = startView();
      flyTo(v.pos, v.target);
    } else {
      startNewTrack();
      let seen = false;
      try {
        seen = !!localStorage.getItem('lr3d.helpSeen');
        localStorage.setItem('lr3d.helpSeen', '1');
      } catch {
        /* storage unavailable */
      }
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

function leaveTitle() {
  mode = 'game';
  playing = false;
  resetRun();
  ui.setPlaying(false);
}

/** Level mode: no editing, rider controls on, nothing is autosaved. */
function setLevel(index: number | null) {
  currentLevel = index;
  // Levels made for one ride use it; elsewhere the player's choice applies.
  const fixed = index !== null ? LEVELS[index].vehicle : undefined;
  lockedVehicle = fixed ? vehicleById(fixed) : null;
  const want = lockedVehicle ?? vehicleById(selectedVehicleId());
  if (want !== vehicle) applyVehicle(want);
  else ui.setVehicle(vehicle.id, vehicle.name, lockReason());
  editor.enabled = index === null;
  document.body.classList.toggle('level-mode', index !== null);
  ui.setRiderMode(index !== null ? true : riderMode);
}

/** Effective rider mode: always on in levels. */
const riderOn = () => currentLevel !== null || challengeScore > 0 || riderMode;

async function startLevel(index: number) {
  leaveTitle();
  challengeScore = 0;
  setLevel(index);
  const level = LEVELS[index];
  loadInto(() => level.build(track));
  changeWorld(levelWorld(index));
  pristine = true;
  editor.history.clear();
  stop();
  const v = startView();
  flyTo(v.pos, v.target, 1.3);
  const best = loadProgress()[level.id]?.stars ?? 0;
  const goals = rateRun(track, runStats.stats).goals.map((g) => g.label);
  await ui.showLevelIntro(index + 1, level.name, level.tip, goals, best, keysFor(vehicle), ridePicker(), worldPicker(levelWorld(index)));
  play();
}

async function backToLevels() {
  stop();
  const idx = await pickLevel();
  if (idx === null) enterTitle();
  else startLevel(idx);
}

/** The title screen tours the worlds. */
const TITLE_WORLDS: Partial<WorldConfig>[] = [
  { biome: 'alpine', time: 'day', weather: 'snow' },
  { biome: 'forest', time: 'sunset', weather: 'clear' },
  { biome: 'beach', time: 'day', weather: 'clear' },
  { biome: 'city', time: 'night', weather: 'clear' },
  { biome: 'desert', time: 'sunset', weather: 'clear' },
  { biome: 'forest', time: 'night', weather: 'clear' },
];
let titleWorld = 0;
let titleClock = 0;

/** Next world on the title, only while the title menu itself is showing. */
function tourWorlds(dt: number) {
  if (devView || closeUp || !document.querySelector('.title-screen') || document.querySelector('.screen, .modal')) return;
  titleClock += dt;
  if (titleClock < 16) return;
  titleClock = 0;
  titleWorld = (titleWorld + 1) % TITLE_WORLDS.length;
  changeWorld(TITLE_WORLDS[titleWorld]);
}

/** Dev screenshots: a fixed title camera [position, target]. */
let devView: [THREE.Vector3, THREE.Vector3] | null = null;

/** Wardrobe preview: the title camera moves in close on Bosh. */
let closeUp = false;

/** Slow cinematic orbit around the rider behind the title screen. */
function attractCamera(time: number, dt: number) {
  const k = 1 - Math.exp(-dt * (closeUp ? 3 : 2));
  const focus = closeUp ? riderCenter.clone().add(new THREE.Vector3(0, -0.7, 0)) : riderCenter;
  controls.target.lerp(focus, k);
  const a = time * 0.12;
  const dist = closeUp ? 5.8 : 16;
  const desired = riderCenter.clone().add(new THREE.Vector3(Math.sin(a) * dist, (closeUp ? 0.6 : 5) + Math.sin(time * 0.3) * (closeUp ? 0.2 : 2), Math.cos(a) * dist));
  camera.position.lerp(desired, k);
  camera.lookAt(controls.target);
}

// ------------------------------------------------------------------ photo mode
let photoOn = false;

/** Freezes the moment, hides the UI and lets the player frame a shot. */
async function openPhoto() {
  if (mode !== 'game' || photoOn || summaryShown) return;
  photoOn = true;
  const wasPlaying = playing;
  pause();
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
      postfx.flash = 0;
      postfx.render(0);
      renderer.domElement.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `linerider3d-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, 'image/png');
      flash = 0.6;
      sound.click(true);
    },
  );
  document.body.classList.remove('photo');
  rig.mode = prevMode;
  photoOn = false;
  if (wasPlaying) play();
}

// ------------------------------------------------------------------ settings, quality, pause
const settings: Settings = loadSettings();
/** Quality in use (Auto picks one and steps down when frames are slow). */
let activeQuality: Exclude<Quality, 'auto'> = lowPower ? 'medium' : 'high';

function applyQuality(q: Exclude<Quality, 'auto'>) {
  activeQuality = q;
  const ratio = { low: 1, medium: 1.5, high: 2 }[q];
  renderer.setPixelRatio(Math.min(devicePixelRatio, ratio));
  postfx.setSize(innerWidth, innerHeight);
  postfx.bloomEnabled = q !== 'low';
  env.setShadows({ low: 0, medium: 1024, high: 2048 }[q]);
  // Landscape density and weather particles follow the quality too.
  env.setDetail(q);
  effects.setViewportHeight(innerHeight * renderer.getPixelRatio());
  ui.setQualityNote(settings.quality === 'auto' ? `Auto: ${q[0].toUpperCase()}${q.slice(1)}` : '');
}

function applySettings(first = false) {
  sound.setVolumes(settings.sfxVolume, settings.musicVolume);
  rig.distanceScale = settings.cameraDistance;
  rig.reducedMotion = settings.reducedMotion;
  if (first || rig.mode !== settings.camera) {
    rig.mode = settings.camera;
    ui.setCameraLabel(CAMERA_LABELS[rig.mode]);
  }
  const wanted = settings.quality === 'auto' ? activeQuality : settings.quality;
  if (first || wanted !== activeQuality) applyQuality(wanted);
}

/** Auto quality: watches real frame times and steps down when they're slow. */
const fpsWindow = { time: 0, frames: 0, cooldown: 3 };
function governQuality(rawDt: number) {
  if (settings.quality !== 'auto' || document.hidden || rawDt <= 0 || rawDt > 0.5) return;
  fpsWindow.cooldown -= rawDt;
  fpsWindow.time += rawDt;
  fpsWindow.frames++;
  if (fpsWindow.time < 2.5) return;
  const fps = fpsWindow.frames / fpsWindow.time;
  fpsWindow.time = 0;
  fpsWindow.frames = 0;
  if (fpsWindow.cooldown > 0 || fps >= 42) return;
  const next = activeQuality === 'high' ? 'medium' : activeQuality === 'medium' ? 'low' : null;
  if (!next) return;
  applyQuality(next);
  fpsWindow.cooldown = 4;
}

async function openSettings() {
  const view: SettingsView = {
    ...settings,
    qualityNote: settings.quality === 'auto' ? `Auto: ${activeQuality[0].toUpperCase()}${activeQuality.slice(1)}` : '',
  };
  await ui.showSettings(
    view,
    (v) => {
      const qualityChanged = v.quality !== settings.quality;
      Object.assign(settings, {
        quality: v.quality as Quality,
        sfxVolume: v.sfxVolume,
        musicVolume: v.musicVolume,
        camera: v.camera as CameraMode,
        cameraDistance: v.cameraDistance,
        reducedMotion: v.reducedMotion,
      });
      saveSettings(settings);
      if (qualityChanged && settings.quality === 'auto') {
        // Auto starts again from the device default.
        fpsWindow.cooldown = 3;
        applyQuality(lowPower ? 'medium' : 'high');
      }
      applySettings();
    },
    () => resetProgress(),
  );
}

/** Esc while riding: a pause menu instead of throwing the run away. */
async function openPause() {
  pause();
  const title = currentLevel !== null ? LEVELS[currentLevel].name : challengeScore > 0 ? 'Challenge' : 'Your track';
  for (;;) {
    const choice = await ui.showPause(title, true);
    if (choice === 'settings') {
      await openSettings();
      continue;
    }
    if (choice === 'resume') play();
    else if (choice === 'restart') {
      stop();
      play();
    } else if (choice === 'levels') backToLevels();
    else {
      stop();
      enterTitle();
    }
    return;
  }
}

applySettings(true);

// ------------------------------------------------------------------ loop
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  postfx.setSize(innerWidth, innerHeight);
  effects.setViewportHeight(innerHeight * renderer.getPixelRatio());
});

const timer = new THREE.Timer();
timer.connect(document);
const STEP = 1 / STEPS_PER_SECOND;
const MAX_FRAME = STEPS_PER_SECOND * 60 * 10 - 2;
const side = new THREE.Vector3();
const tail = new THREE.Vector3();
let booted = false;

function handleRideEvents(events: number, justCrashed: boolean) {
  if (events & EVENT.ring) {
    sound.ring();
    ui.popup('BOOST!', 'boost');
    flash = 0.35;
  }
  if (events & EVENT.bounce) {
    sound.bounce();
    if (Math.random() < 0.5) ui.popup('BOING!', 'bounce');
  }
  if (events & EVENT.star) {
    sound.star();
    // Sparkle where the collected star was.
    const list = track.starList();
    const mask = sim.rider.stars;
    list.forEach((st, k) => {
      if (Math.floor(mask / 2 ** k) % 2 === 1 && !sparkled.has(st.id)) {
        sparkled.add(st.id);
        effects.sparkle(st.position);
      }
    });
  }
  if (events & EVENT.finish) {
    sound.finish();
    ui.popup('FINISH!', 'finish');
    flash = 0.25;
    const best = ghost?.record.finishTime ?? 0;
    if (best > 0 && !replaying) {
      const delta = runStats.stats.finishTime - best;
      setTimeout(() => ui.popup(`${delta <= 0 ? '−' : '+'}${Math.abs(delta).toFixed(2)}s vs best`, delta <= 0 ? 'boost' : 'crash'), 700);
    }
  }
  if (justCrashed) {
    if (!replaying) wipeouts = bumpWipeouts();
    sound.crash();
    ui.popup('WIPEOUT!', 'crash');
    rig.shake(0.6);
    rig.punch(12);
    slowmo(0.22, 1.1);
    impact = 1;
  }
  // Big touchdowns get a moment of bullet time.
  for (const td of runStats.takeTouchdowns()) {
    if (Math.abs(td.rotation) > 5.2 || td.air > 1.3) {
      slowmo(0.3, 0.5);
      rig.punch(8);
      flash = Math.max(flash, 0.15);
    }
  }
  for (const trick of runStats.takeTricks()) {
    ui.trick(trick);
    if (trick.bailed) continue;
    runTricks.push(trick.name);
    if (trick.grade === 'perfect') sound.perfect();
    else if (trick.points >= 1000) sound.success();
    else sound.click(true);
  }
}

let wipeouts = loadCounters().wipeouts;

/** Unlocks achievements for the current run state (mid-run or at the end). */
function checkAchievements(ended: boolean, rating = 0) {
  if (mode !== 'game' || replaying) return;
  const s = runStats.stats;
  const levelDone = ended && s.finished && !s.crashed && currentLevel !== null;
  const worlds = noteWorld(env.config.biome, levelDone);
  const ctx: RunContext = {
    stats: s,
    vehicle: vehicle.id,
    levelId: currentLevel !== null ? LEVELS[currentLevel].id : null,
    rating,
    tricks: runTricks,
    ended,
    totalStars: totalStars(),
    wipeouts,
    beatChallenge: ended && challengeScore > 0 && s.score >= challengeScore,
    ownTrack: currentLevel === null && challengeScore === 0 && !pristine,
    world: env.config,
    worldsRidden: worlds.rode.length,
    worldsFinished: worlds.finished.length,
    champion: ended ? champions() : {},
  };
  for (const a of evaluate(ctx)) {
    ui.toast(a.title, a.desc, a.ride);
    sound.success();
  }
}

function checkRunEnd(dt: number) {
  if (summaryShown || mode !== 'game') return;
  // Paused or scrubbing: the run hasn't ended, the player is looking around.
  if (!playing) {
    crashClock = finishClock = 0;
    return;
  }
  const s = runStats.stats;
  crashClock = s.crashed ? crashClock + dt : 0;
  finishClock = s.finished ? finishClock + dt : 0;
  const ended = crashClock > 2.4 || finishClock > 1.6 || (s.still > 1.2 && s.time > 1.5) || frame >= MAX_FRAME;
  if (!ended) return;
  summaryShown = true;
  pause();
  if (!s.crashed && s.tricks === 0) sound.success();
  const wasReplay = replaying;
  setReplay(false);
  const rating = rateRun(track, s);
  let levelInfo: { number: number; name: string; nextUnlocked: boolean; hasNext: boolean } | undefined;
  if (currentLevel !== null && !wasReplay) saveLevelResult(LEVELS[currentLevel].id, rating.stars, s.score);
  if (currentLevel !== null) {
    levelInfo = {
      number: currentLevel + 1,
      name: LEVELS[currentLevel].name,
      hasNext: currentLevel + 1 < LEVELS.length,
      nextUnlocked: isUnlocked(currentLevel + 1),
    };
  }
  // Save this run as the ghost to beat if it's the best so far.
  let ghostSaved = false;
  if (!wasReplay && riderOn()) {
    const key = ghostKey();
    if (beats(s.score, s.finishTime, loadGhost(key))) {
      saveGhost(key, { rle: encodeInputs(sim.inputsUpTo(frame)), frames: frame, score: s.score, finishTime: s.finishTime });
      ghostSaved = true;
    }
  }
  const best = wasReplay ? { best: recordBest(0, 0).best, newBest: false } : recordBest(s.score, rating.stars);
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
      challenge: challengeScore,
      vehicle: vehicle.name,
    },
    () => {
      resetRun();
      play();
    },
    () => stop(),
    () => {
      // Watch the run just recorded, with the player's inputs played back.
      setReplay(true);
      resetRun();
      play();
    },
    () => backToLevels(),
    () => {
      if (currentLevel !== null) startLevel(currentLevel + 1);
    },
  );
}

function loop(time: number) {
  timer.update(time);
  const rawDt = timer.getDelta();
  const dt = THREE.MathUtils.clamp(rawDt, 0, 0.1);
  const t = timer.getElapsed();

  // Ease the time scale toward the current slow-motion target.
  slowTimer = Math.max(0, slowTimer - dt);
  const scaleTarget = slowTimer > 0 && mode === 'game' ? slowTarget : 1;
  timeScale += (scaleTarget - timeScale) * (1 - Math.exp(-dt * (scaleTarget < timeScale ? 18 : 5)));
  sound.slowmo(timeScale);
  impact = Math.max(0, impact - dt * 0.8);
  postfx.impact = settings.reducedMotion ? 0 : impact;

  const startFrame = frame;
  if (playing) {
    acc += dt * timeScale * (slowMo && mode === 'game' ? 0.25 : 1);
    while (acc >= STEP) {
      acc -= STEP;
      frame++;
    }
    if (frame >= MAX_FRAME) frame = MAX_FRAME;
  }
  // Rider mode: record the live input for every step we are about to simulate
  // (including the look-ahead step used for interpolation).
  if (playing && mode === 'game' && riderOn() && !replaying) {
    const mask = keyMask | touchMask;
    for (let f = startFrame; f <= frame; f++) sim.setInput(f, mask);
  }

  // Always make sure the next frame exists so we can interpolate.
  sim.seek(frame + 1);
  sim.seek(frame);
  const alpha = playing ? acc / STEP : 0;
  sim.interpolated(alpha, riderView.pts);
  const rider = sim.rider;
  riderView.update(dt, rider.crashed);

  // Ghost of the best run, in lockstep with the player.
  const showGhost = !!ghost && mode === 'game' && !replaying && frame > 0 && frame <= ghost.record.frames + 40;
  ghostView.visible = showGhost;
  if (showGhost && ghost) {
    ghost.sim.seek(frame + 1);
    ghost.sim.seek(frame);
    ghost.sim.interpolated(alpha, ghostView.pts);
    ghostView.update(dt, ghost.sim.rider.crashed);
  }
  riderCenter.copy(riderView.pts[P.butt]);
  rider.velocity(riderVel);

  const events = runStats.advance(sim, frame, STEPS_PER_SECOND);
  const stats = runStats.stats;

  if (playing) {
    const justCrashed = effects.fromRider(frame, rider.pos, rider.contact, rider.crashed, riderVel, STEPS_PER_SECOND);
    side.subVectors(riderView.pts[P.tailR], riderView.pts[P.tailL]).normalize();
    tail.addVectors(riderView.pts[P.tailL], riderView.pts[P.tailR]).multiplyScalar(0.5);
    trail.push(tail, side, stats.speed);
    groundMarks.update(frame, rider.pos, rider.contact, rider.crashed);
    if (mode === 'game') handleRideEvents(events, justCrashed);
    if (frame % 10 === 0) checkAchievements(false);
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
  const throttle = ((replaying ? sim.inputAt(frame) : keyMask | touchMask) & INPUT.push) !== 0 && riderOn() && !rider.crashed;
  sound.ride(playing && mode === 'game', stats.speed, onTrack, onSnow, throttle, !rider.contact.some((c) => c));

  // Camera.
  if (mode === 'title') {
    // Loop the demo run behind the title.
    if (stats.still > 1 || stats.crashed || frame > 900) resetRun();
    tourWorlds(dt);
    if (devView) {
      camera.position.copy(devView[0]);
      camera.lookAt(devView[1]);
      controls.target.copy(devView[1]);
    } else attractCamera(t, dt);
    rig.settle(dt);
  } else if (tween) {
    updateTween(dt);
    rig.settle(dt);
    controls.update();
  } else if (playing) {
    rig.update(dt, riderCenter, riderVel, STEPS_PER_SECOND, !rider.contact.some((c) => c) && !rider.crashed);
    if (rig.mode === 'follow') controls.update();
  } else {
    if (!photoOn) rig.settle(dt);
    controls.update();
  }
  rig.applyShake(dt);
  effects.update(dt);

  if (mode === 'game') checkRunEnd(dt);
  flash = Math.max(0, flash - dt * 1.5);
  // Lightning flashes the screen a little (barely with reduced motion).
  postfx.flash = Math.max(settings.reducedMotion ? 0 : flash, env.weather.flash * (settings.reducedMotion ? 0.04 : 0.22));
  governQuality(rawDt);

  editor.update(!playing && mode === 'game' && currentLevel === null);
  trackView.update(t, riderCenter, sim.rider.stars);
  env.update(dt, controls.target, t, camera.position);
  updateHeadlight();
  ui.setTime(frame, sim.recorded, STEPS_PER_SECOND);
  ui.setHud(mode === 'game' && (playing || frame > 0) && !summaryShown, stats, track.stars.size);
  ui.setTouchPad(isTouch && riderOn() && mode === 'game' && playing && !replaying, vehicle.handling.yaw !== null);
  postfx.render(dt);

  if (!booted) {
    booted = true;
    document.getElementById('boot')?.classList.add('gone');
    setTimeout(() => document.getElementById('boot')?.remove(), 700);
    // A share link opens its track directly; otherwise show the title.
    readSharedLink()
      .then((shared) => (shared ? enterShared(shared.data, shared.challenge, shared.vehicle) : enterTitle()))
      .catch(() => {
        ui.flash('That share link looks broken');
        enterTitle();
      });
  }
}
renderer.setAnimationLoop(loop);

/** Opens a track from a share link, with an intro (and the challenge score). */
async function enterShared(data: SerializedTrack, challenge: number, vehicleId: string | null) {
  leaveTitle();
  setLevel(null);
  challengeScore = challenge;
  // A challenge is ridden on the challenger's ride.
  if (challenge > 0 && vehicleId) {
    lockedVehicle = vehicleById(vehicleId);
    applyVehicle(lockedVehicle);
  }
  loadInto(() => track.load(data));
  changeWorld(trackWorld());
  pristine = true;
  history.replaceState(null, '', location.pathname + location.search);
  if (challenge > 0) ui.setRiderMode(true);
  const v = startView();
  flyTo(v.pos, v.target, 1.3);
  await ui.showSharedIntro(challenge, rateRun(track, runStats.stats).goals.map((g) => g.label), keysFor(vehicle), ridePicker(), worldPicker(trackWorld()));
  play();
}

let devClock = performance.now();
if (import.meta.env.DEV) Object.assign(window, { lr3d: { track, editor, sim, camera, controls, scene, trackView, ui, runStats, env, renderer,
  shot: (biome: string, time = 'day', weather = 'clear', p?: number[], t?: number[]) => {
    document.body.classList.add('dev-shot');
    applyWorld({ biome, time, weather } as Partial<WorldConfig>);
    if (p && t) devView = [new THREE.Vector3(...p), new THREE.Vector3(...t)];
    return env.config;
  },
  view: (p?: number[], t?: number[]) => (devView = p && t ? [new THREE.Vector3(...p), new THREE.Vector3(...t)] : null),
  world: (biome: string, time?: string, weather?: string) => applyWorld({ biome, time, weather } as Partial<WorldConfig>), keys: (m: number) => (keyMask = m),
    /** Dev: advance the game loop by hand (hidden tabs get no animation frames). */
    tick: (n = 1, ms = 1000 / 60) => {
      timer.disconnect();
      for (let k = 0; k < n; k++) loop((devClock += ms));
    },
    chooseVehicle, fx: () => ({ timeScale, impact, fov: camera.fov }), ghostInfo: () => ({ visible: ghostView.root.visible, frame: ghost?.sim.frame, butt: ghost?.sim.rider.pos[P.butt].toArray(), me: sim.rider.pos[P.butt].toArray() }) } });
