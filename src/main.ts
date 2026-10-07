import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';
import { Track, type SerializedTrack } from './track/Track';
import { TrackView } from './render/TrackView';
import { RiderView } from './render/RiderView';
import { CameraRig, CAMERA_LABELS, type CameraMode } from './render/CameraRig';
import { Simulation, STEPS_PER_SECOND } from './physics/Simulation';
import { Environment } from './world/Environment';
import { Editor } from './editor/Editor';
import { UI } from './ui/UI';
import { buildDemoTrack } from './demoTrack';

const STORAGE_KEY = 'lr3d.track';
const lowPower = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4;

// ------------------------------------------------------------------ renderer
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.className = 'game';
app.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(4, 21, 34);
// Portrait screens: step back so the demo track fits.
if (innerWidth < innerHeight) camera.position.set(-6, 26, 58);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(10, 15, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.maxDistance = 250;
controls.minDistance = 2;
controls.update();

const env = new Environment(scene, lowPower);

// ------------------------------------------------------------------ game objects
const track = new Track();
const trackView = new TrackView(scene, track);
const riderView = new RiderView(scene);
const sim = new Simulation(track);
const rig = new CameraRig(camera, controls);
const ground = scene.getObjectByName('ground')!;
const editor = new Editor(renderer.domElement, camera, scene, controls, track, trackView, ground);

let playing = false;
let slowMo = false;
let frame = 0;
let acc = 0;

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(track.serialize()));
  } catch {
    /* storage full or unavailable */
  }
}
let saveTimer = 0;
track.on(() => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 400);
});

function loadSaved(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    track.load(JSON.parse(raw) as SerializedTrack);
    return true;
  } catch {
    return false;
  }
}

if (!loadSaved()) buildDemoTrack(track);

const riderCenter = new THREE.Vector3();
const riderVel = new THREE.Vector3();

function focusRider() {
  sim.seek(frame);
  sim.rider.center(riderCenter);
  const offset = camera.position.clone().sub(controls.target);
  offset.setLength(THREE.MathUtils.clamp(offset.length(), 8, 30));
  controls.target.copy(riderCenter);
  camera.position.copy(riderCenter).add(offset);
  rig.snapTo(riderCenter);
}

const cameraModes: CameraMode[] = ['follow', 'chase', 'side'];

const ui = new UI(app.appendChild(Object.assign(document.createElement('div'), { className: 'ui' })), editor, {
  play() {
    if (frame === 0) focusRider();
    else rig.snapTo(sim.rider.center(riderCenter));
    playing = true;
    ui.setPlaying(true);
  },
  pause() {
    playing = false;
    ui.setPlaying(false);
  },
  stop() {
    playing = false;
    frame = 0;
    acc = 0;
    ui.setPlaying(false);
  },
  seek(f) {
    frame = f;
    acc = 0;
  },
  cycleCamera() {
    rig.mode = cameraModes[(cameraModes.indexOf(rig.mode) + 1) % cameraModes.length];
    return CAMERA_LABELS[rig.mode];
  },
  toggleSlowMo() {
    slowMo = !slowMo;
    return slowMo;
  },
  newTrack() {
    if (track.strokes.size > 0 && !confirm('Start a new empty track? Your current track will be lost unless exported.')) return;
    track.clear();
    track.setStart(new THREE.Vector3(0, 12, 0));
    editor.history.clear();
    this.stop();
    controls.target.set(0, 10, 0);
    camera.position.set(0, 14, 30);
  },
  loadDemo() {
    if (track.strokes.size > 0 && !confirm('Replace your current track with the demo?')) return;
    buildDemoTrack(track);
    editor.history.clear();
    this.stop();
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
        this.stop();
        ui.flash('Track loaded');
      } catch {
        ui.flash('Invalid track file');
      }
    });
  },
  focusRider,
});
ui.maybeShowHelp();

// ------------------------------------------------------------------ loop
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const timer = new THREE.Timer();
timer.connect(document);
const STEP = 1 / STEPS_PER_SECOND;
const MAX_FRAME = STEPS_PER_SECOND * 60 * 10 - 2;

renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);

  if (playing) {
    acc += dt * (slowMo ? 0.25 : 1);
    while (acc >= STEP) {
      acc -= STEP;
      frame++;
    }
    if (frame >= MAX_FRAME) {
      frame = MAX_FRAME;
      playing = false;
      ui.setPlaying(false);
    }
  }

  // Always make sure the next frame exists so we can interpolate.
  sim.seek(frame + 1);
  sim.seek(frame);
  const alpha = playing ? acc / STEP : 0;
  sim.interpolated(alpha, riderView.pts);
  riderView.update(dt, sim.rider.crashed);

  if (playing) {
    riderCenter.copy(riderView.pts[6]);
    sim.rider.velocity(riderVel);
    rig.update(dt, riderCenter, riderVel);
    if (rig.mode === 'follow') controls.update();
  } else {
    controls.update();
  }

  editor.update(!playing);
  env.update(dt, controls.target, timer.getElapsed());
  ui.setTime(frame, sim.recorded, sim.rider.crashed, STEPS_PER_SECOND);
  renderer.render(scene, camera);
});

if (import.meta.env.DEV) Object.assign(window, { lr3d: { track, editor, sim, camera, controls, scene, trackView } });
