import * as THREE from 'three';
import { Track } from '../track/Track';
import { TrackView } from '../render/TrackView';
import { RiderView } from '../render/RiderView';
import { CameraRig } from '../render/CameraRig';
import { Simulation } from '../physics/Simulation';
import { Editor } from '../editor/Editor';
import { Effects } from '../render/Effects';
import { Trail } from '../render/Trail';
import { SurfaceTracks } from '../render/SurfaceTracks';
import { Sound } from '../audio/Sound';
import { RunStats } from '../game/RunStats';
import { loadSettings, type Settings } from '../game/settings';
import type { UI } from '../ui/UI';
import type { Stage } from './stage';

/**
 * The long-lived game objects every controller works with. Built once at
 * startup; `ui` is filled in right after (its handlers call the controllers).
 */
export interface Core extends Stage {
  track: Track;
  trackView: TrackView;
  riderView: RiderView;
  /** The best run, replayed alongside the player. */
  ghostView: RiderView;
  sim: Simulation;
  rig: CameraRig;
  effects: Effects;
  trail: Trail;
  groundMarks: SurfaceTracks;
  sound: Sound;
  runStats: RunStats;
  editor: Editor;
  settings: Settings;
  ui: UI;
  /** Smoothed rider position and velocity, updated every frame. */
  riderCenter: THREE.Vector3;
  riderVel: THREE.Vector3;
}

export function createCore(stage: Stage): Omit<Core, 'ui'> & { ui: UI | null } {
  const { scene, renderer, camera, controls, env } = stage;
  const track = new Track();
  const trackView = new TrackView(scene, track);
  const riderView = new RiderView(scene);
  const ghostView = new RiderView(scene, true);
  ghostView.visible = false;
  const effects = new Effects(scene);
  effects.setViewportHeight(innerHeight * renderer.getPixelRatio());
  return {
    ...stage,
    track,
    trackView,
    riderView,
    ghostView,
    sim: new Simulation(track),
    rig: new CameraRig(camera, controls),
    effects,
    trail: new Trail(scene),
    groundMarks: new SurfaceTracks(scene),
    sound: new Sound(),
    runStats: new RunStats(),
    editor: new Editor(renderer.domElement, camera, scene, controls, track, trackView, env.ground),
    settings: loadSettings(),
    ui: null,
    riderCenter: new THREE.Vector3(),
    riderVel: new THREE.Vector3(),
  };
}
