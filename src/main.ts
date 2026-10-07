import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';
import { Track, type SerializedTrack } from './track/Track';
import { TrackView } from './render/TrackView';
import { RiderView } from './render/RiderView';
import { CameraRig, CAMERA_LABELS, type CameraMode } from './render/CameraRig';
import { Simulation, STEPS_PER_SECOND } from './physics/Simulation';
import { EVENT, INPUT, P } from './physics/Rider';
import { Environment } from './world/Environment';
import { terrainHeight } from './world/terrain';
import { Editor } from './editor/Editor';
import { UI } from './ui/UI';
import { Effects } from './render/Effects';
import { Trail } from './render/Trail';
import { PostFX } from './render/PostFX';
import { Sound } from './audio/Sound';
import { RunStats } from './game/RunStats';
import { buildDemoTrack } from './demoTrack';
import { rateRun } from './game/rating';
import { GhostRun, beats, encodeInputs, loadGhost, saveGhost } from './game/Ghost';
import { LEVELS } from './levels/levels';
import { OUTFITS, isUnlocked, loadProgress, saveLevelResult, selectOutfit, selectedOutfit, totalStars } from './game/progress';
import { applyOutfit } from './render/RiderView';

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

const env = new Environment(scene, lowPower);
env.bakeEnvironment(renderer, scene);
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
const sound = new Sound();
const runStats = new RunStats();
const ground = scene.getObjectByName('ground')!;
const editor = new Editor(renderer.domElement, camera, scene, controls, track, trackView, ground);

let mode: 'title' | 'game' = 'title';
let playing = false;
let slowMo = false;
let frame = 0;
let acc = 0;
let summaryShown = false;
let crashClock = 0;
let finishClock = 0;
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
  ArrowUp: INPUT.push,
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

// ------------------------------------------------------------------ saving

/** A freshly loaded demo is not saved, so it never overwrites the player's own track. */
let pristine = true;
let loading = false;
let saveTimer = 0;

function loadInto(fn: () => void) {
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
applyOutfit(selectedOutfit());

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
  frame = 0;
  acc = 0;
  summaryShown = false;
  crashClock = 0;
  finishClock = 0;
  sparkled.clear();
  effects.reset();
  trail.reset();
  runStats.reset();
  ui.hideSummary();
}

function play() {
  if (summaryShown) resetRun();
  // A fresh attempt (or a classic run) starts with no recorded input.
  if (frame === 0 && !replaying) sim.clearInputs();
  if (frame === 0) {
    const record = mode === 'game' ? loadGhost(trackKey()) : null;
    ghost = record ? new GhostRun(track, record) : null;
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
  replaying = false;
  resetRun();
}

/** Best score per track, keyed by a hash of its content. */
function trackKey() {
  const json = JSON.stringify({ s: track.serialize().strokes, r: track.serialize().rings, t: track.start.toArray() });
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  return String(h >>> 0);
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
  const key = trackKey();
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

const cameraModes: CameraMode[] = ['follow', 'chase', 'side'];

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
    loadInto(() => buildDemoTrack(track));
applyOutfit(selectedOutfit());
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
        setLevel(null);
        track.load(JSON.parse(text) as SerializedTrack);
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
  click: () => sound.click(),
}, riderMode);

function startNewTrack() {
  loadInto(() => {
    track.clear();
    track.setStart(new THREE.Vector3(0, 12, 0));
  });
  pristine = true;
  editor.history.clear();
  stop();
  flyTo(new THREE.Vector3(0, 14, 30), new THREE.Vector3(0, 10, 0));
}

// ------------------------------------------------------------------ title, levels, wardrobe
/** Index of the built-in level being played, or null in the editor. */
let currentLevel: number | null = null;

function enterTitle() {
  mode = 'title';
  ghost = null;
  setLevel(null);
  loadInto(() => buildDemoTrack(track));
applyOutfit(selectedOutfit());
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
        OUTFITS.map((o) => ({ id: o.id, name: o.name, stars: o.stars, colors: [o.jacket, o.scarf, o.hat, o.sled] })),
        stars,
        selectedOutfit().id,
        (id) => {
          selectOutfit(id);
          applyOutfit(selectedOutfit());
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
  editor.enabled = index === null;
  document.body.classList.toggle('level-mode', index !== null);
  ui.setRiderMode(index !== null ? true : riderMode);
}

/** Effective rider mode: always on in levels. */
const riderOn = () => currentLevel !== null || riderMode;

async function startLevel(index: number) {
  leaveTitle();
  setLevel(index);
  const level = LEVELS[index];
  loadInto(() => level.build(track));
  pristine = true;
  editor.history.clear();
  stop();
  const v = startView();
  flyTo(v.pos, v.target, 1.3);
  const best = loadProgress()[level.id]?.stars ?? 0;
  const goals = rateRun(track, runStats.stats).goals.map((g) => g.label);
  await ui.showLevelIntro(index + 1, level.name, level.tip, goals, best);
  play();
}

async function backToLevels() {
  stop();
  const idx = await pickLevel();
  if (idx === null) enterTitle();
  else startLevel(idx);
}

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
    sound.crash();
    ui.popup('WIPEOUT!', 'crash');
    rig.shake(0.6);
  }
  for (const trick of runStats.takeTricks()) {
    ui.trick(trick);
    if (trick.bailed) continue;
    if (trick.grade === 'perfect') sound.perfect();
    else if (trick.points >= 1000) sound.success();
    else sound.click(true);
  }
}

function checkRunEnd(dt: number) {
  if (summaryShown || mode !== 'game') return;
  const s = runStats.stats;
  crashClock = s.crashed ? crashClock + dt : 0;
  finishClock = s.finished ? finishClock + dt : 0;
  const ended = crashClock > 2.4 || finishClock > 1.6 || (s.still > 1.2 && s.time > 1.5) || frame >= MAX_FRAME;
  if (!ended) return;
  summaryShown = true;
  pause();
  if (!s.crashed && s.tricks === 0) sound.success();
  const wasReplay = replaying;
  replaying = false;
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
    const key = trackKey();
    if (beats(s.score, s.finishTime, loadGhost(key))) {
      saveGhost(key, { rle: encodeInputs(sim.inputsUpTo(frame)), frames: frame, score: s.score, finishTime: s.finishTime });
      ghostSaved = true;
    }
  }
  const best = wasReplay ? { best: recordBest(0, 0).best, newBest: false } : recordBest(s.score, rating.stars);
  if (rating.stars === 3) setTimeout(() => sound.perfect(), 700);
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
    },
    () => {
      resetRun();
      play();
    },
    () => stop(),
    () => {
      // Watch the run just recorded, with the player's inputs played back.
      replaying = true;
      resetRun();
      play();
    },
    () => backToLevels(),
    () => {
      if (currentLevel !== null) startLevel(currentLevel + 1);
    },
  );
}

renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);
  const t = timer.getElapsed();

  const startFrame = frame;
  if (playing) {
    acc += dt * (slowMo && mode === 'game' ? 0.25 : 1);
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
    if (mode === 'game') handleRideEvents(events, justCrashed);
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
  sound.ride(playing && mode === 'game', stats.speed, onTrack, onSnow);

  // Camera.
  if (mode === 'title') {
    // Loop the demo run behind the title.
    if (stats.still > 1 || stats.crashed || frame > 900) resetRun();
    attractCamera(t, dt);
    rig.settle(dt);
  } else if (tween) {
    updateTween(dt);
    rig.settle(dt);
    controls.update();
  } else if (playing) {
    rig.update(dt, riderCenter, riderVel, STEPS_PER_SECOND);
    if (rig.mode === 'follow') controls.update();
  } else {
    rig.settle(dt);
    controls.update();
  }
  rig.applyShake(dt);
  effects.update(dt);

  if (mode === 'game') checkRunEnd(dt);
  flash = Math.max(0, flash - dt * 1.5);
  postfx.flash = flash;

  editor.update(!playing && mode === 'game' && currentLevel === null);
  trackView.update(t, riderCenter, sim.rider.stars);
  env.update(dt, controls.target, t);
  ui.setTime(frame, sim.recorded, STEPS_PER_SECOND);
  ui.setHud(mode === 'game' && (playing || frame > 0) && !summaryShown, stats, track.stars.size);
  ui.setTouchPad(isTouch && riderOn() && mode === 'game' && playing && !replaying);
  postfx.render(dt);

  if (!booted) {
    booted = true;
    document.getElementById('boot')?.classList.add('gone');
    setTimeout(() => document.getElementById('boot')?.remove(), 700);
    enterTitle();
  }
});

if (import.meta.env.DEV) Object.assign(window, { lr3d: { track, editor, sim, camera, controls, scene, trackView, ui, runStats, keys: (m: number) => (keyMask = m), ghostInfo: () => ({ visible: ghostView.root.visible, frame: ghost?.sim.frame, butt: ghost?.sim.rider.pos[P.butt].toArray(), me: sim.rider.pos[P.butt].toArray() }) } });
