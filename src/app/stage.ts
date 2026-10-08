import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Environment } from '../world/Environment';
import { PostFX } from '../render/PostFX';
import { TOUCH } from '../ui/dom';

/** The renderer, scene, camera and the always-there world around the track. */
export interface Stage {
  app: HTMLElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  env: Environment;
  postfx: PostFX;
  /** Phones and small machines start on medium quality. */
  lowPower: boolean;
  isTouch: boolean;
}

export function createStage(app: HTMLElement): Stage {
  const isTouch = TOUCH;
  const lowPower = isTouch || (navigator.hardwareConcurrency ?? 8) <= 4;

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

  return { app, renderer, scene, camera, controls, env, postfx, lowPower, isTouch };
}

/** Keeps the canvas, camera and post effects sized to the window. */
export function fitToWindow(stage: Stage, after: () => void) {
  addEventListener('resize', () => {
    stage.camera.aspect = innerWidth / innerHeight;
    stage.camera.updateProjectionMatrix();
    stage.renderer.setSize(innerWidth, innerHeight);
    stage.postfx.setSize(innerWidth, innerHeight);
    after();
  });
}
