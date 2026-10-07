import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';
import { Track, type SerializedTrack } from './track/Track';
import { TrackView } from './render/TrackView';
import { RiderView } from './render/RiderView';
import { CameraRig, CAMERA_LABELS, type CameraMode } from './render/CameraRig';
import { Simulation, STEPS_PER_SECOND } from './physics/Simulation';
import { EVENT, P } from './physics/Rider';
import { Environment } from './world/Environment';
import { terrainHeight } from './world/terrain';
import { Editor } from './editor/Editor';
import { UI, type TitleChoice } from './ui/UI';
import { Effects } from './render/Effects';
import { Trail } from './render/Trail';
import { PostFX } from './render/PostFX';
import { Sound } from './audio/Sound';
import { RunStats } from './game/RunStats';
import { buildDemoTrack } from './demoTrack';

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
let flash = 0;

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
  if (loading || e.kind === 'cleared') return;
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
  effects.reset();
  trail.reset();
  runStats.reset();
  ui.hideSummary();
}

function play() {
  if (summaryShown) resetRun();
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
  resetRun();
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
  async newTrack() {
    if (!pristine && track.strokes.size > 0) {
      const ok = await ui.confirm('Start a new track?', 'Your current track will be replaced. Export it first if you want to keep it.', 'Start fresh');
      if (!ok) return;
    }
    startNewTrack();
  },
  async loadDemo() {
    if (!pristine && track.strokes.size > 0) {
      const ok = await ui.confirm('Load the demo?', 'Your current track will be replaced. Export it first if you want to keep it.', 'Load demo');
      if (!ok) return;
    }
    loadInto(() => buildDemoTrack(track));
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
  click: () => sound.click(),
});

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

// ------------------------------------------------------------------ title screen
function enterTitle() {
  mode = 'title';
  resetRun();
  playing = true;
  ui.showTitle(savedTrack() !== null).then(onTitleChoice);
}

function onTitleChoice(choice: TitleChoice) {
  mode = 'game';
  playing = false;
  resetRun();
  ui.setPlaying(false);
  if (choice === 'continue') {
    const data = savedTrack();
    if (data) {
      loadInto(() => track.load(data));
      pristine = false;
    }
    const v = startView();
    flyTo(v.pos, v.target);
  } else if (choice === 'demo') {
    const v = startView();
    flyTo(v.pos, v.target, 1.2, () => play());
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
}

/** Slow cinematic orbit around the rider behind the title screen. */
function attractCamera(time: number, dt: number) {
  const k = 1 - Math.exp(-dt * 2);
  controls.target.lerp(riderCenter, k);
  const a = time * 0.12;
  const desired = riderCenter.clone().add(new THREE.Vector3(Math.sin(a) * 16, 5 + Math.sin(time * 0.3) * 2, Math.cos(a) * 16));
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
let lastAir = 0;
let booted = false;

function handleRideEvents(events: number, justCrashed: boolean) {
  const s = runStats.stats;
  if (events & EVENT.ring) {
    sound.ring();
    ui.popup('BOOST!', 'boost');
    flash = 0.35;
  }
  if (events & EVENT.bounce) {
    sound.bounce();
    if (Math.random() < 0.5) ui.popup('BOING!', 'bounce');
  }
  if (justCrashed) {
    sound.crash();
    ui.popup('WIPEOUT!', 'crash');
    rig.shake(0.6);
  }
  // Landing after a big jump.
  if (lastAir > 1.2 && s.air === 0 && !s.crashed) {
    ui.popup(`BIG AIR ${lastAir.toFixed(1)}s`, 'air');
  }
  lastAir = s.air;
}

function checkRunEnd(dt: number) {
  if (summaryShown || mode !== 'game') return;
  const s = runStats.stats;
  crashClock = s.crashed ? crashClock + dt : 0;
  const ended = crashClock > 2.4 || (s.still > 1.2 && s.time > 1.5) || frame >= MAX_FRAME;
  if (!ended) return;
  summaryShown = true;
  pause();
  if (!s.crashed) sound.success();
  ui.showSummary(
    { ...s },
    () => {
      resetRun();
      play();
    },
    () => stop(),
  );
}

renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);
  const t = timer.getElapsed();

  if (playing) {
    acc += dt * (slowMo && mode === 'game' ? 0.25 : 1);
    while (acc >= STEP) {
      acc -= STEP;
      frame++;
    }
    if (frame >= MAX_FRAME) frame = MAX_FRAME;
  }

  // Always make sure the next frame exists so we can interpolate.
  sim.seek(frame + 1);
  sim.seek(frame);
  const alpha = playing ? acc / STEP : 0;
  sim.interpolated(alpha, riderView.pts);
  const rider = sim.rider;
  riderView.update(dt, rider.crashed);
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

  editor.update(!playing && mode === 'game');
  trackView.update(t, riderCenter);
  env.update(dt, controls.target, t);
  ui.setTime(frame, sim.recorded, STEPS_PER_SECOND);
  ui.setHud(mode === 'game' && (playing || frame > 0) && !summaryShown, stats);
  postfx.render(dt);

  if (!booted) {
    booted = true;
    document.getElementById('boot')?.classList.add('gone');
    setTimeout(() => document.getElementById('boot')?.remove(), 700);
    enterTitle();
  }
});

if (import.meta.env.DEV) Object.assign(window, { lr3d: { track, editor, sim, camera, controls, scene, trackView, ui, runStats } });
