import type { Editor, ItemKind, Tool } from '../editor/Editor';
import { DECOR_LABELS } from '../world/models';
import type { DecorKind, LineType } from '../track/types';
import { LINE_COLORS } from '../track/types';
import type { Stats, Trick } from '../game/RunStats';
import { GRADE_LABEL } from '../game/RunStats';
import { icon } from './icons';
import { BIOMES, DEFAULT_WORLD, TIMES, WEATHERS, biomeById, type BiomeId, type WorldConfig } from '../world/worlds';

/** Badge icon of each world (the logo follows the world on screen). */
const BADGE: Record<BiomeId, string> = { alpine: 'snowflake', forest: 'forest', beach: 'beach', desert: 'desert', city: 'city' };

const hex = (n: number) => n.toString(16).padStart(6, '0');

/** Writes text only when it changed (the HUD updates every frame). */
function setText(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text;
}

/** Is a menu, card or screen covering the game? */
export function overlayOpen() {
  return document.querySelector('.modal, .screen, .summary, .title-screen, .photo-bar') !== null;
}

export type TitleChoice = 'levels' | 'create' | 'new' | 'wardrobe' | 'garage' | 'settings' | 'trophies';
export type PauseChoice = 'resume' | 'restart' | 'settings' | 'levels' | 'menu';

export interface UIHandlers {
  play(): void;
  pause(): void;
  stop(): void;
  seek(frame: number): void;
  cycleCamera(): string;
  toggleSlowMo(): boolean;
  newTrack(): void;
  loadDemo(): void;
  exportTrack(): void;
  importTrack(file: File): void;
  focusRider(): void;
  levels(): void;
  mainMenu(): void;
  share(challenge?: number): void;
  toggleSfx(): boolean;
  toggleMusic(): boolean;
  toggleRiderMode(): boolean;
  /** Opens the settings screen. */
  settings(): void;
  /** Esc: pause menu while riding, otherwise stop. */
  escape(): void;
  /** Enters photo mode. */
  photo(): void;
  /** Next ride (editor quick switch). */
  cycleVehicle(): void;
  /** Touch pad input: bit mask from the on-screen buttons. */
  touchInput(mask: number): void;
  /** The world of the track being edited. */
  world(): WorldConfig;
  /** Changes it; returns the (validated) world now shown. */
  setWorld(w: Partial<WorldConfig>): WorldConfig;
  click(): void;
}

/** World choice shown on a level or shared-track intro. */
export interface WorldPicker {
  value: WorldConfig;
  /** The level's own world. */
  home: WorldConfig;
  onPick(w: Partial<WorldConfig>): WorldConfig;
}

export interface SummaryInfo {
  best: number;
  newBest: boolean;
  riderMode: boolean;
  goals: { label: string; done: boolean }[];
  rating: number;
  starsTotal: number;
  ghostSaved?: boolean;
  /** Set when playing a built-in level. */
  level?: { number: number; name: string; nextUnlocked: boolean; hasNext: boolean };
  /** Score to beat from a friend's challenge link. */
  challenge?: number;
  /** Name of the ride used. */
  vehicle?: string;
}

/** What the settings screen edits (mirrors game/settings Settings). */
export interface SettingsView {
  quality: string;
  /** Shown under Quality, e.g. "Auto: High". */
  qualityNote: string;
  sfxVolume: number;
  musicVolume: number;
  camera: string;
  cameraDistance: number;
  reducedMotion: boolean;
}

export interface VehicleCard {
  id: string;
  name: string;
  blurb: string;
  stats: { speed: number; grip: number; air: number; toughness: number };
  /** Ride challenges done / total. */
  progress: { done: number; total: number };
  paints: { id: string; name: string; colors: number[]; unlocked: boolean; need: number }[];
  paint: string;
}

export interface TrophyCard {
  id: string;
  title: string;
  desc: string;
  /** Ride icon for ride challenges. */
  ride?: string;
  rideName?: string;
  unlocked: boolean;
}

/** Ride choice shown on a level intro. */
export interface RidePicker {
  options: { id: string; name: string }[];
  selected: string;
  /** Level made for one ride: no choice. */
  locked: boolean;
  /** Picks a ride; returns its controls. */
  onPick(id: string): Controls;
}

/** A ride's controls, drawn as key caps. */
export interface Controls {
  /** Touch device: name the on-screen buttons instead of keys. */
  touch: boolean;
  ground: { key: 'left' | 'right' | 'up'; label: string }[];
  air: { key: 'left' | 'right' | 'up'; label: string }[];
  note: string;
}

const KEYCAP = { left: '←', right: '→', up: '↑' };
const PADNAME = { left: 'Brake', right: 'Push', up: 'Spin' };

/** The controls panel of an intro card. */
function controlsHtml(c: Controls) {
  const row = (title: string, ic: string, items: Controls['ground']) =>
    `<div class="ctl-group"><span class="ctl-title">${icon(ic, 14)} ${title}</span><div class="ctl-items">${items
      .map(
        (it) =>
          `<span class="ctl"><kbd class="key ${it.key}">${c.touch ? icon(it.key === 'up' ? 'replay' : it.key === 'left' ? 'chevronLeft' : 'chevronRight', 14) : KEYCAP[it.key]}</kbd>${
            c.touch ? `<em>${PADNAME[it.key]}</em>` : ''
          }<span>${it.label}</span></span>`,
      )
      .join('')}</div></div>`;
  return `${row('On the ground', 'sled', c.ground)}${row('In the air', 'replay', c.air)}<p class="ctl-note">${icon('target', 13)} ${c.note}</p>`;
}

export interface LevelCard {
  name: string;
  tip: string;
  stars: number;
  score: number;
  unlocked: boolean;
  /** Chapter (home world). */
  world: BiomeId;
  /** Level made for one ride. */
  ride?: string;
}

export interface OutfitCard {
  id: string;
  name: string;
  stars: number;
  colors: number[];
  unlocked: boolean;
  /** World to master, for world outfits. */
  world?: string;
}

const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: 'pencil', icon: 'pencil', label: 'Pencil', key: 'Q' },
  { id: 'line', icon: 'line', label: 'Line', key: 'W' },
  { id: 'eraser', icon: 'eraser', label: 'Eraser', key: 'E' },
  { id: 'bank', icon: 'bank', label: 'Bank', key: 'B' },
  { id: 'item', icon: 'star', label: 'Items', key: 'R' },
  { id: 'decor', icon: 'tree', label: 'Decor', key: 'D' },
  { id: 'start', icon: 'flag', label: 'Start', key: 'S' },
  { id: 'hand', icon: 'move', label: 'Camera', key: 'H' },
];

const LINE_TYPES: { id: LineType; label: string }[] = [
  { id: 'normal', label: 'Track' },
  { id: 'accel', label: 'Boost' },
  { id: 'ice', label: 'Ice' },
  { id: 'bouncy', label: 'Bouncy' },
  { id: 'scenery', label: 'Scenery' },
];

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
};

const button = (cls: string, html: string, title = '') => {
  const b = h('button', cls, html) as HTMLButtonElement;
  if (title) {
    b.title = title;
    b.setAttribute('aria-label', title);
  }
  return b;
};

/** One world unit is about 0.6 m (Bosh's sled is 1.75 units long). */
const METERS = 0.6;
const KMH = 3.6 * METERS;

export class UI {
  private root: HTMLElement;
  private toolButtons = new Map<Tool, HTMLButtonElement>();
  private panel: HTMLElement;
  private playBtn: HTMLButtonElement;
  private timeline: HTMLInputElement;
  private timeLabel: HTMLElement;
  private hint: HTMLElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;
  private camBtn: HTMLButtonElement;
  private hud: HTMLElement;
  private gaugeArc: SVGPathElement;
  private gaugeValue: HTMLElement;
  private airChip: HTMLElement;
  private popups: HTMLElement;
  private scoreChip: HTMLElement;
  private comboChip: HTMLElement;
  private starsChip: HTMLElement;
  private touchPad: HTMLElement;
  private riderBtn: HTMLButtonElement;
  private vehicleBtn: HTMLButtonElement;
  private sfxBtn!: HTMLButtonElement;
  private musicBtn!: HTMLButtonElement;
  private hintTimer = 0;
  private playing = false;
  private worldBtn!: HTMLButtonElement;
  private brandMark!: HTMLElement;
  private shownWorld: WorldConfig = { ...DEFAULT_WORLD };
  /** The editor panel shows the world options instead of the tool's. */
  private worldOpen = false;
  /** Decor palette shows every kind, not only the world's. */
  private allDecor = false;

  constructor(root: HTMLElement, private editor: Editor, private handlers: UIHandlers, riderMode: boolean) {
    this.root = root;

    // ------------------------------------------------------------ top bar
    const top = h('div', 'topbar');
    const left = h('div', 'top-left');
    const menuBtn = button('btn icon-btn', icon('menu'), 'Menu');
    const brand = h('div', 'brand', `<i class="brand-mark">${icon('snowflake', 20)}</i><span>Line Rider</span><b>3D</b>`);
    this.brandMark = brand.querySelector('.brand-mark')!;
    const menu = h('div', 'menu hidden');
    const fileInput = h('input') as HTMLInputElement;
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.hidden = true;
    fileInput.onchange = () => {
      if (fileInput.files?.[0]) handlers.importTrack(fileInput.files[0]);
      fileInput.value = '';
    };
    const item = (ic: string, label: string, fn: () => void) => {
      const b = button('menu-item', `${icon(ic, 18)}<span>${label}</span>`);
      b.onclick = () => {
        menu.classList.add('hidden');
        handlers.click();
        fn();
      };
      menu.append(b);
    };
    item('home', 'Main menu', handlers.mainMenu);
    item('star', 'Levels', handlers.levels);
    item('plus', 'New track', handlers.newTrack);
    item('sled', 'Demo track', handlers.loadDemo);
    item('share', 'Share link', () => handlers.share());
    item('download', 'Export track', handlers.exportTrack);
    item('upload', 'Import track', () => fileInput.click());
    item('gear', 'Settings', handlers.settings);
    item('help', 'How to play', () => this.showHelp());
    menuBtn.onclick = () => {
      handlers.click();
      menu.classList.toggle('hidden');
    };
    document.addEventListener('pointerdown', (e) => {
      if (!menu.contains(e.target as Node) && !menuBtn.contains(e.target as Node)) menu.classList.add('hidden');
    });
    left.append(menuBtn, brand, menu, fileInput);

    const right = h('div', 'top-right');
    this.undoBtn = button('btn icon-btn', icon('undo'), 'Undo (Ctrl+Z)');
    this.undoBtn.onclick = () => editor.history.undo();
    this.redoBtn = button('btn icon-btn', icon('redo'), 'Redo (Ctrl+Shift+Z)');
    this.redoBtn.onclick = () => editor.history.redo();
    const focusBtn = button('btn icon-btn focus-btn', icon('target'), 'Focus rider (F)');
    focusBtn.onclick = handlers.focusRider;
    this.camBtn = button('btn text-btn', `${icon('camera', 18)}<span>Cinema</span>`, 'Camera mode (C)');
    this.camBtn.onclick = () => this.cycleCamera();
    const sfxBtn = button('btn icon-btn', icon('sound'), 'Sound effects');
    const musicBtn = button('btn icon-btn', icon('music'), 'Music');
    this.sfxBtn = sfxBtn;
    this.musicBtn = musicBtn;
    sfxBtn.onclick = () => {
      const on = handlers.toggleSfx();
      sfxBtn.innerHTML = icon(on ? 'sound' : 'mute');
      sfxBtn.classList.toggle('off', !on);
    };
    musicBtn.onclick = () => musicBtn.classList.toggle('off', !handlers.toggleMusic());
    const group1 = h('div', 'btn-group');
    group1.append(this.undoBtn, this.redoBtn);
    const group2 = h('div', 'btn-group');
    group2.append(sfxBtn, musicBtn);
    const shareBtn = button('btn icon-btn share-btn', icon('share'), 'Share this track');
    shareBtn.onclick = () => {
      handlers.click();
      handlers.share();
    };
    const photoBtn = button('btn icon-btn photo-btn', icon('aperture'), 'Photo mode (P)');
    photoBtn.onclick = () => {
      handlers.click();
      handlers.photo();
    };
    right.append(group1, shareBtn, photoBtn, focusBtn, this.camBtn, group2);
    top.append(left, right);
    editor.history.onChange = () => this.refreshHistory();
    this.refreshHistory();

    // ------------------------------------------------------------ player
    const player = h('div', 'player');
    this.playBtn = button('play-btn', icon('play', 24), 'Play / Pause (Space)');
    this.playBtn.onclick = () => (this.playing ? handlers.pause() : handlers.play());
    const stopBtn = button('btn icon-btn flat', icon('stop', 18), 'Stop (Esc)');
    stopBtn.onclick = handlers.stop;
    const slowBtn = button('btn icon-btn flat slow-btn', icon('slow', 20), 'Slow motion');
    slowBtn.onclick = () => slowBtn.classList.toggle('active', handlers.toggleSlowMo());
    this.timeline = h('input', 'timeline') as HTMLInputElement;
    this.timeline.type = 'range';
    this.timeline.min = '0';
    this.timeline.max = '400';
    this.timeline.value = '0';
    this.timeline.setAttribute('aria-label', 'Timeline');
    this.timeline.oninput = () => handlers.seek(Number(this.timeline.value));
    this.timeLabel = h('span', 'time', '0:00.0');
    this.riderBtn = button(`btn icon-btn flat rider-btn ${riderMode ? 'active' : ''}`, icon('gamepad', 22), 'Rider mode: control Bosh with the arrow keys');
    this.riderBtn.onclick = () => {
      handlers.click();
      const on = handlers.toggleRiderMode();
      this.setRiderMode(on);
      this.flash(on ? 'Rider mode: → push · ← brake · flip in the air' : 'Classic mode');
    };
    this.vehicleBtn = button('btn icon-btn flat vehicle-btn', icon('sled', 22), 'Ride');
    this.vehicleBtn.onclick = () => {
      handlers.click();
      handlers.cycleVehicle();
    };
    player.append(this.playBtn, stopBtn, slowBtn, this.riderBtn, this.vehicleBtn, this.timeline, this.timeLabel);

    // ------------------------------------------------------------ HUD
    this.hud = h(
      'div',
      'hud hidden',
      `<div class="gauge">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <path class="gauge-bg" pathLength="1" d="M 22 92 A 48 48 0 1 1 98 92" />
          <path class="gauge-fg" pathLength="1" d="M 22 92 A 48 48 0 1 1 98 92" />
        </svg>
        <div class="gauge-text"><b>0</b><span>km/h</span></div>
      </div>
      <div class="hud-chips">
        <div class="score-chip hidden">${icon('trophy', 16)}<b>0</b></div>
        <div class="stars-chip hidden">${icon('star', 16)}<b>0/0</b></div>
        <div class="combo-chip hidden"><span>COMBO</span><b>x1</b><i><em></em></i></div>
        <div class="air-chip hidden">AIR <b>0.0s</b></div>
      </div>`,
    );
    this.gaugeArc = this.hud.querySelector('.gauge-fg')!;
    this.gaugeValue = this.hud.querySelector('.gauge-text b')!;
    this.airChip = this.hud.querySelector('.air-chip')!;
    this.scoreChip = this.hud.querySelector('.score-chip')!;
    this.comboChip = this.hud.querySelector('.combo-chip')!;
    this.starsChip = this.hud.querySelector('.stars-chip')!;

    // On-screen controls for touch devices in rider mode.
    this.touchPad = h(
      'div',
      'touch-pad hidden',
      `<button class="pad pad-brake" data-bit="2" aria-label="Brake / backflip">${icon('chevronLeft', 34)}<span>Brake</span></button>
       <button class="pad pad-spin" data-bit="4" aria-label="Spin">${icon('replay', 30)}<span>Spin</span></button>
       <button class="pad pad-push" data-bit="1" aria-label="Push / frontflip">${icon('chevronRight', 34)}<span>Push</span></button>`,
    );
    let mask = 0;
    const held = new Map<number, number>();
    const update = () => {
      mask = 0;
      for (const bit of held.values()) mask |= bit;
      handlers.touchInput(mask);
      this.touchPad.querySelectorAll('.pad').forEach((b) => b.classList.toggle('down', (mask & Number((b as HTMLElement).dataset.bit)) !== 0));
    };
    this.touchPad.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest('.pad') as HTMLElement | null;
      if (!b) return;
      e.preventDefault();
      held.set(e.pointerId, Number(b.dataset.bit));
      update();
    });
    const release = (e: PointerEvent) => {
      if (held.delete(e.pointerId)) update();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    this.popups = h('div', 'popups');

    // ------------------------------------------------------------ tools
    this.panel = h('div', 'panel');
    const toolbar = h('div', 'toolbar');
    for (const t of TOOLS) {
      const b = button('tool', `${icon(t.icon)}<span class="label">${t.label}</span><kbd>${t.key}</kbd>`, `${t.label} (${t.key})`);
      // Tapping the active tool again folds its options away (handy on phones).
      b.onclick = () => {
        handlers.click();
        if (this.editor.tool === t.id) this.panel.classList.toggle('folded');
        else this.selectTool(t.id);
      };
      this.toolButtons.set(t.id, b);
      toolbar.append(b);
    }
    // World: the track's landscape, time of day and weather.
    this.worldBtn = button('tool world-tool', `${icon('globe')}<span class="label">World</span><kbd>G</kbd>`, 'World (G)');
    this.worldBtn.onclick = () => {
      handlers.click();
      this.toggleWorldPanel();
    };
    toolbar.append(this.worldBtn);
    const bottom = h('div', 'bottom');
    bottom.append(this.panel, toolbar);

    this.hint = h('div', 'hint hidden');
    const replayTag = h('div', 'replay-tag', '<i></i>REPLAY');
    root.append(h('div', 'letterbox'), top, player, this.hud, this.popups, this.touchPad, bottom, this.hint, replayTag);
    this.setRiderMode(riderMode);
    editor.onHint = (t) => this.flash(t);

    this.selectTool('pencil');
    this.bindKeys();
  }

  // ---------------------------------------------------------------- tools

  toggleWorldPanel() {
    this.worldOpen = !this.worldOpen;
    this.panel.classList.remove('folded');
    this.worldBtn.classList.toggle('active', this.worldOpen);
    for (const [id, b] of this.toolButtons) b.classList.toggle('active', !this.worldOpen && id === this.editor.tool);
    this.renderPanel();
  }

  selectTool(tool: Tool) {
    this.editor.setTool(tool);
    this.worldOpen = false;
    this.worldBtn?.classList.remove('active');
    this.panel.classList.remove('folded');
    for (const [id, b] of this.toolButtons) b.classList.toggle('active', id === tool);
    this.renderPanel();
  }

  private cycleCamera() {
    this.camBtn.innerHTML = `${icon('camera', 18)}<span>${this.handlers.cycleCamera()}</span>`;
  }

  private renderPanel() {
    const s = this.editor.settings;
    const tool = this.editor.tool;
    this.panel.innerHTML = '';
    const row = () => {
      const r = h('div', 'row');
      this.panel.append(r);
      return r;
    };
    const seg = <T extends string>(r: HTMLElement, options: { id: T; label: string; color?: number }[], value: T, set: (v: T) => void) => {
      const g = h('div', 'seg');
      for (const o of options) {
        const b = button(o.id === value ? 'active' : '', o.label);
        if (o.color !== undefined) {
          b.style.setProperty('--swatch', `#${o.color.toString(16).padStart(6, '0')}`);
          b.classList.add('swatch');
        }
        b.onclick = () => {
          this.handlers.click();
          set(o.id);
          this.renderPanel();
        };
        g.append(b);
      }
      r.append(g);
    };
    const toggle = (r: HTMLElement, on: boolean, label: string, set: (v: boolean) => void) => {
      const b = button(`chip ${on ? 'active' : ''}`, `<i class="switch"></i>${label}`);
      b.onclick = () => {
        this.handlers.click();
        set(!on);
        this.renderPanel();
      };
      r.append(b);
    };
    const slider = (r: HTMLElement, label: string, min: number, max: number, step: number, value: number, unit: string, set: (v: number) => void) => {
      const wrap = h('label', 'slider');
      const text = h('span', '', `${label}<b>${value}${unit}</b>`);
      const input = h('input') as HTMLInputElement;
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      input.oninput = () => {
        set(Number(input.value));
        text.innerHTML = `${label}<b>${input.value}${unit}</b>`;
      };
      wrap.append(text, input);
      r.append(wrap);
    };

    if (this.worldOpen) {
      const w = this.handlers.world();
      const set = (patch: Partial<WorldConfig>) => this.handlers.setWorld({ ...this.handlers.world(), ...patch });
      seg(
        row(),
        BIOMES.map((b) => ({ id: b.id, label: `${icon(b.id, 16)} ${b.name}` })),
        w.biome,
        (v) => set({ biome: v, weather: biomeById(v).weathers[0] }),
      );
      const r2 = row();
      seg(r2, TIMES.map((t) => ({ id: t.id, label: `${icon(t.id, 16)} ${t.name}` })), w.time, (v) => set({ time: v }));
      seg(
        r2,
        WEATHERS.filter((x) => biomeById(w.biome).weathers.includes(x.id)).map((x) => ({ id: x.id, label: `${icon(x.id, 16)} ${x.name}` })),
        w.weather,
        (v) => set({ weather: v }),
      );
      row().append(h('span', 'tip', `${biomeById(w.biome).blurb} Saved with the track and its share link.`));
      return;
    }

    if (tool === 'pencil' || tool === 'line') {
      const r1 = row();
      seg(r1, LINE_TYPES.map((t) => ({ ...t, color: LINE_COLORS[t.id] })), s.lineType, (v) => (s.lineType = v));
      const r2 = row();
      seg(
        r2,
        [
          { id: 'profile', label: 'Profile' },
          { id: 'path', label: 'Path' },
        ],
        s.mode,
        (v) => (s.mode = v),
      );
      if (s.mode === 'profile') toggle(r2, s.lockPlane, 'Lock plane', (v) => (s.lockPlane = v));
      else toggle(r2, s.autoBank, 'Auto-bank', (v) => (s.autoBank = v));
      slider(r2, 'Width', 1, 6, 0.2, s.width, '', (v) => (s.width = v));
      slider(r2, 'Bank', -90, 90, 5, s.bank, '°', (v) => (s.bank = v));
      if (s.mode === 'path') slider(r2, 'Descent', 0, 60, 1, s.grade, '%', (v) => (s.grade = v));
    } else if (tool === 'item') {
      seg(
        row(),
        [
          { id: 'star' as ItemKind, label: '★ Star' },
          { id: 'ring' as ItemKind, label: '◎ Boost ring' },
          { id: 'finish' as ItemKind, label: '🏁 Finish gate' },
        ],
        s.item,
        (v) => (s.item = v),
      );
      const r2 = row();
      slider(r2, '3rd star target', 500, 30000, 500, this.editor.targetScore, ' pts', (v) => (this.editor.targetScore = v));
      r2.append(h('span', 'tip', s.item === 'star' ? 'Tap a track to float a star over it.' : s.item === 'ring' ? 'Tap a track to hang a ring over it.' : 'Tap a track to place the finish gate.'));
    } else if (tool === 'decor') {
      // The world's own decor first; everything else on request.
      const native = biomeById(this.handlers.world().biome).decor;
      const kinds = this.allDecor ? (Object.keys(DECOR_LABELS) as DecorKind[]) : native;
      const r = row();
      seg(
        r,
        kinds.map((k) => ({ id: k, label: DECOR_LABELS[k] })),
        s.decor,
        (v) => (s.decor = v),
      );
      toggle(r, this.allDecor, 'All worlds', (v) => (this.allDecor = v));
    } else {
      const tips: Partial<Record<Tool, string>> = {
        eraser: 'Tap or drag over a track, ring or decoration to remove it.',
        bank: 'Drag a track left or right to tilt it. Snaps every 15°.',
        start: 'Tap a track or the drawing plane to move the start flag.',
        hand: 'Drag to orbit · two fingers or right-drag to pan · pinch or wheel to zoom.',
      };
      row().append(h('span', 'tip', tips[tool] ?? ''));
    }
  }

  private refreshHistory() {
    this.undoBtn.disabled = !this.editor.history.canUndo;
    this.redoBtn.disabled = !this.editor.history.canRedo;
  }

  // ---------------------------------------------------------------- play state

  setPlaying(playing: boolean) {
    this.playing = playing;
    this.playBtn.innerHTML = icon(playing ? 'pause' : 'play', 24);
    this.playBtn.classList.toggle('is-playing', playing);
    document.body.classList.toggle('is-playing', playing);
  }

  private lastTime = '';
  setTime(frame: number, recorded: number, fps: number) {
    const max = Math.max(400, recorded + 40);
    const key = `${frame}/${max}`;
    if (key === this.lastTime) return;
    this.lastTime = key;
    this.timeline.max = String(max);
    this.timeline.value = String(frame);
    this.timeline.style.setProperty('--progress', `${(frame / max) * 100}%`);
    const t = frame / fps;
    setText(this.timeLabel, `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`);
  }

  /** Live speed and airtime readout. */
  setHud(visible: boolean, stats: Stats, starsTotal = 0) {
    this.hud.classList.toggle('hidden', !visible);
    if (!visible) return;
    const kmh = stats.speed * KMH;
    setText(this.gaugeValue, String(Math.round(kmh)));
    const frac = Math.min(kmh / 110, 1);
    const dash = (1 - frac).toFixed(3);
    if (this.gaugeArc.style.strokeDashoffset !== dash) this.gaugeArc.style.strokeDashoffset = dash;
    this.hud.classList.toggle('fast', kmh > 60);
    this.scoreChip.classList.toggle('hidden', stats.score === 0 && !document.body.classList.contains('rider-mode'));
    setText(this.scoreChip.querySelector('b')!, stats.score.toLocaleString());
    this.starsChip.classList.toggle('hidden', starsTotal === 0);
    const starLabel = `${stats.stars}/${starsTotal}`;
    const sb = this.starsChip.querySelector('b')!;
    if (sb.textContent !== starLabel) {
      sb.textContent = starLabel;
      this.starsChip.classList.remove('bump');
      void this.starsChip.offsetWidth;
      this.starsChip.classList.add('bump');
    }
    this.starsChip.classList.toggle('complete', starsTotal > 0 && stats.stars >= starsTotal);
    const comboOn = stats.combo > 1 && !stats.crashed;
    this.comboChip.classList.toggle('hidden', !comboOn);
    if (comboOn) {
      const b = this.comboChip.querySelector('b')!;
      const label = `x${stats.combo % 1 ? stats.combo.toFixed(1) : stats.combo}`;
      if (b.textContent !== label) {
        b.textContent = label;
        this.comboChip.classList.remove('bump');
        void this.comboChip.offsetWidth;
        this.comboChip.classList.add('bump');
      }
      (this.comboChip.querySelector('em') as HTMLElement).style.transform = `scaleX(${stats.comboLeft})`;
    }
    const airborne = stats.air > 0.35 && !stats.crashed;
    this.airChip.classList.toggle('hidden', !airborne);
    if (airborne) setText(this.airChip.querySelector('b')!, `${stats.air.toFixed(1)}s`);
  }

  setRiderMode(on: boolean) {
    this.riderBtn.classList.toggle('active', on);
    document.body.classList.toggle('rider-mode', on);
  }

  /** Shows the on-screen push/brake (and spin) buttons (touch devices, rider mode, riding). */
  setTouchPad(visible: boolean, spin = false) {
    this.touchPad.classList.toggle('hidden', !visible);
    this.touchPad.classList.toggle('with-spin', spin);
  }

  /** Shows the current ride on the quick-switch button; `lockedBy` explains why it can't change. */
  setVehicle(id: string, name: string, lockedBy: string | null) {
    this.vehicleBtn.innerHTML = icon(id, 22);
    this.vehicleBtn.title = lockedBy ? `${name} (${lockedBy})` : `Ride: ${name} (V to switch)`;
    this.vehicleBtn.disabled = lockedBy !== null;
  }

  /** Reflects the saved sound settings on the buttons. */
  setSoundState(sfx: boolean, music: boolean) {
    this.sfxBtn.innerHTML = icon(sfx ? 'sound' : 'mute');
    this.sfxBtn.classList.toggle('off', !sfx);
    this.musicBtn.classList.toggle('off', !music);
  }

  /** Trick callout with grade, points and combo. */
  trick(t: Trick) {
    if (t.bailed) {
      this.popup(t.name, 'crash');
      return;
    }
    const grade = t.grade ?? 'good';
    const tags = [
      `<span class="grade ${grade}">${GRADE_LABEL[grade]}</span>`,
      t.combo && t.combo > 1 ? `<span class="tag combo">x${t.combo}</span>` : '',
      t.repeat ? '<span class="tag">Repeat ½</span>' : '',
    ].join('');
    const el = h('div', `popup trick ${grade}`, `<div class="tags">${tags}</div>${t.name}<small>+${t.points.toLocaleString()}</small>`);
    this.addPopup(el, 1700);
  }

  /** Callouts stack in a column (newest on top), never on top of each other. */
  private addPopup(el: HTMLElement, life: number) {
    this.popups.prepend(el);
    // Keep the stack short: the oldest go first.
    while (this.popups.children.length > 3) this.popups.lastElementChild!.remove();
    setTimeout(() => el.remove(), life);
  }

  /** Big animated callout in the middle of the screen. */
  popup(text: string, kind: 'boost' | 'bounce' | 'air' | 'crash' | 'finish' = 'boost') {
    this.addPopup(h('div', `popup ${kind}`, text), 1400);
  }

  flash(text: string, ms = 1500) {
    this.hint.textContent = text;
    this.hint.classList.remove('hidden');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hint.classList.add('hidden'), ms);
  }

  // ---------------------------------------------------------------- overlays

  /** In-game confirmation dialog. */
  confirm(title: string, text: string, ok = 'OK'): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = h(
        'div',
        'modal',
        `<div class="card small">
          <h2>${title}</h2>
          <p>${text}</p>
          <div class="actions"><button class="big-btn ghost" data-v="0">Cancel</button><button class="big-btn primary" data-v="1">${ok}</button></div>
        </div>`,
      );
      overlay.onclick = (e) => {
        const v = (e.target as HTMLElement).closest('button')?.dataset.v;
        if (v === undefined && e.target !== overlay) return;
        this.handlers.click();
        overlay.classList.add('leaving');
        setTimeout(() => overlay.remove(), 200);
        resolve(v === '1');
      };
      document.body.append(overlay);
    });
  }

  /** Title screen; resolves with the player's choice. */
  showTitle(hasSave: boolean, stars: number, maxStars: number): Promise<TitleChoice> {
    document.body.classList.add('on-title');
    return new Promise((resolve) => {
      const overlay = h(
        'div',
        'title-screen',
        `<div class="title-inner">
          <div class="logo">
            <div class="logo-mark" data-world="${this.shownWorld.biome}">${icon(BADGE[this.shownWorld.biome], 46)}</div>
            <h1>Line Rider<span>3D</span></h1>
            <p class="tagline">Draw it. Ride it. Wipe out in style.</p>
            <p class="title-world">${this.worldCaption(this.shownWorld)}</p>
          </div>
          <div class="title-actions">
            <button class="big-btn primary" data-c="levels">${icon('play', 20)} Play <span class="pill">${icon('star', 14)} ${stars}/${maxStars}</span></button>
            <button class="big-btn secondary" data-c="${hasSave ? 'create' : 'new'}">${icon('pencil', 20)} ${hasSave ? 'Continue my track' : 'Create a track'}</button>
            <div class="title-row">
              <button class="big-btn menu-btn" data-c="garage"><span class="menu-ic">${icon('garage', 18)}</span><span class="menu-label">Garage</span>${icon('chevronRight', 16)}</button>
              <button class="big-btn menu-btn" data-c="wardrobe"><span class="menu-ic">${icon('sled', 18)}</span><span class="menu-label">Wardrobe</span>${icon('chevronRight', 16)}</button>
              <button class="big-btn menu-btn" data-c="trophies"><span class="menu-ic">${icon('trophy', 18)}</span><span class="menu-label">Trophies</span>${icon('chevronRight', 16)}</button>
              <button class="big-btn menu-btn" data-c="settings"><span class="menu-ic">${icon('gear', 18)}</span><span class="menu-label">Settings</span>${icon('chevronRight', 16)}</button>
              ${hasSave ? `<button class="big-btn menu-btn" data-c="new"><span class="menu-ic">${icon('plus', 18)}</span><span class="menu-label">New track</span>${icon('chevronRight', 16)}</button>` : ''}
            </div>
          </div>
          <p class="title-foot">${icon('sound', 16)} Best with sound on · works with mouse and touch</p>
        </div>`,
      );
      overlay.onclick = (e) => {
        const c = (e.target as HTMLElement).closest('button')?.dataset.c as TitleChoice | undefined;
        if (!c) return;
        this.handlers.click();
        overlay.classList.add('leaving');
        if (c !== 'levels' && c !== 'wardrobe' && c !== 'garage' && c !== 'settings' && c !== 'trophies') document.body.classList.remove('on-title');
        setTimeout(() => overlay.remove(), 450);
        resolve(c);
      };
      document.body.append(overlay);
    });
  }

  /** The logo badges follow the world on screen (title tour, levels, editor). */
  setWorldBadge(w: WorldConfig) {
    const changed = w.biome !== this.shownWorld.biome;
    this.shownWorld = { ...w };
    this.brandMark.innerHTML = icon(BADGE[w.biome], 20);
    this.brandMark.dataset.world = w.biome;
    const mark = document.querySelector<HTMLElement>('.title-screen .logo-mark');
    if (mark) {
      mark.dataset.world = w.biome;
      mark.innerHTML = icon(BADGE[w.biome], 46);
      if (changed) {
        // Restart the pop animation.
        mark.classList.remove('pop');
        void mark.offsetWidth;
        mark.classList.add('pop');
      }
    }
    const cap = document.querySelector('.title-screen .title-world');
    if (cap) cap.innerHTML = this.worldCaption(w);
  }

  private worldCaption(w: WorldConfig) {
    return `${icon(w.time, 15)}<span>${biomeById(w.biome).name}</span>·<span>${TIMES.find((t) => t.id === w.time)!.name}</span>`;
  }

  /** Level select, chapter by chapter; resolves with a level index, or null to go back. */
  showLevels(levels: LevelCard[], stars: number): Promise<number | null> {
    return new Promise((resolve) => {
      const card = (l: LevelCard, i: number) => `<button class="level-card ${l.unlocked ? '' : 'locked'}" data-world="${l.world}" data-i="${i}" ${l.unlocked ? '' : 'disabled'} style="animation-delay:${Math.min(i, 14) * 0.03}s">
            <span class="level-num">${l.unlocked ? i + 1 : icon('lock', 20)}</span>
            ${l.ride ? `<span class="level-ride" title="Made for one ride">${icon(l.ride, 18)}</span>` : ''}
            <span class="level-name">${l.name}</span>
            <span class="level-stars">${[0, 1, 2].map((k) => `<i class="${k < l.stars ? 'on' : ''}">${icon('star', 18)}</i>`).join('')}</span>
            <span class="level-best">${l.unlocked ? (l.score ? `Best ${l.score.toLocaleString()}` : 'Not played') : 'Get a star on the previous level'}</span>
          </button>`;
      // Group the levels by world, keeping their order.
      const chapters: { world: BiomeId; items: [LevelCard, number][] }[] = [];
      levels.forEach((l, i) => {
        let c = chapters.find((x) => x.world === l.world);
        if (!c) chapters.push((c = { world: l.world, items: [] }));
        c.items.push([l, i]);
      });
      const cards = chapters
        .map((c) => {
          const b = biomeById(c.world);
          const got = c.items.reduce((n, [l]) => n + l.stars, 0);
          return `<section class="chapter" data-world="${c.world}">
            <header class="chapter-head">
              <span class="chapter-icon">${icon(c.world, 26)}</span>
              <div><h3>${b.name}</h3><p>${b.blurb}</p></div>
              <span class="pill">${icon('star', 14)} ${got} / ${c.items.length * 3}</span>
            </header>
            <div class="level-grid">${c.items.map(([l, i]) => card(l, i)).join('')}</div>
          </section>`;
        })
        .join('');
      const overlay = h(
        'div',
        'screen',
        `<div class="screen-inner">
          <div class="screen-head">
            <button class="btn icon-btn" data-back>${icon('chevronLeft')}</button>
            <h2>Levels</h2>
            <span class="pill big">${icon('star', 16)} ${stars} / ${levels.length * 3}</span>
          </div>
          <div class="chapters">${cards}</div>
        </div>`,
      );
      overlay.onclick = (e) => {
        const btn = (e.target as HTMLElement).closest('button');
        if (!btn) return;
        this.handlers.click();
        if (btn.dataset.back !== undefined) {
          overlay.classList.add('leaving');
          setTimeout(() => overlay.remove(), 250);
          resolve(null);
          return;
        }
        const i = Number(btn.dataset.i);
        if (Number.isNaN(i)) return;
        overlay.classList.add('leaving');
        document.body.classList.remove('on-title');
        setTimeout(() => overlay.remove(), 250);
        resolve(i);
      };
      document.body.append(overlay);
    });
  }

  /** Outfit picker with live preview on Bosh. */
  showWardrobe(outfits: OutfitCard[], stars: number, selected: string, onPick: (id: string) => void): Promise<void> {
    return new Promise((resolve) => {
      const render = (sel: string) =>
        outfits
          .map((o) => {
            const unlocked = o.unlocked;
            const swatch = o.colors.map((c) => `<i style="background:#${c.toString(16).padStart(6, '0')}"></i>`).join('');
            return `<button class="outfit ${o.id === sel ? 'active' : ''} ${unlocked ? '' : 'locked'}" data-id="${o.id}" ${unlocked ? '' : 'disabled'}>
              <span class="swatches">${swatch}</span>
              <span class="outfit-name">${o.name}</span>
              <span class="outfit-req">${unlocked ? (o.id === sel ? 'Wearing' : 'Wear') : o.world ? `${icon('lock', 13)} 3${icon('star', 13)} all ${o.world}` : `${icon('lock', 13)} ${o.stars} ${icon('star', 13)}`}</span>
            </button>`;
          })
          .join('');
      const overlay = h(
        'div',
        'screen wardrobe',
        `<div class="screen-inner">
          <div class="screen-head">
            <button class="btn icon-btn" data-back>${icon('chevronLeft')}</button>
            <h2>Wardrobe</h2>
            <span class="pill big">${icon('star', 16)} ${stars}</span>
          </div>
          <p class="screen-sub">Earn stars to unlock new looks for Bosh. Master a world (3 stars on all its levels) for its outfit.</p>
          <div class="outfit-grid">${render(selected)}</div>
        </div>`,
      );
      overlay.onclick = (e) => {
        const btn = (e.target as HTMLElement).closest('button');
        if (!btn) return;
        this.handlers.click();
        if (btn.dataset.back !== undefined) {
          overlay.classList.add('leaving');
          setTimeout(() => overlay.remove(), 250);
          resolve();
          return;
        }
        const id = btn.dataset.id;
        if (!id) return;
        onPick(id);
        overlay.querySelector('.outfit-grid')!.innerHTML = render(id);
      };
      document.body.append(overlay);
    });
  }

  /** Ride picker with stats; the ride is previewed live behind the screen. */
  showGarage(cards: VehicleCard[], selected: string, onPick: (id: string) => void, onPaint: (ride: string, paint: string) => VehicleCard[]): Promise<void> {
    return new Promise((resolve) => {
      const bars = (label: string, v: number) =>
        `<span class="stat"><span class="stat-label">${label}</span><span class="stat-bar">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= v ? 'on' : ''}"></i>`).join('')}</span></span>`;
      const render = (sel: string) =>
        cards
          .map(
            (c, i) => `<button class="ride-card ${c.id === sel ? 'active' : ''}" data-id="${c.id}" style="animation-delay:${i * 0.04}s">
              <span class="ride-icon">${icon(c.id, 40)}</span>
              <span class="ride-name">${c.name}${c.id === sel ? `<span class="ride-tag">${icon('check', 13)} Riding</span>` : ''}</span>
              <span class="ride-blurb">${c.blurb}</span>
              <span class="ride-stats">${bars('Speed', c.stats.speed)}${bars('Grip', c.stats.grip)}${bars('Air', c.stats.air)}${bars('Tough', c.stats.toughness)}</span>
              <span class="ride-paints">
                <span class="ride-prog">${icon('trophy', 13)} ${c.progress.done}/${c.progress.total}</span>
                ${c.paints
                  .map((p) => {
                    const bg = p.colors.length ? `background:linear-gradient(135deg,#${hex(p.colors[0])} 55%,#${hex(p.colors[1])} 55%)` : '';
                    return `<i class="paint ${p.id === c.paint ? 'on' : ''} ${p.unlocked ? '' : 'locked'} ${p.colors.length ? '' : 'outfit'}" data-ride="${c.id}" data-paint="${p.id}" title="${p.unlocked ? p.name : `${p.name}: complete ${p.need} ride challenge${p.need > 1 ? 's' : ''}`}" style="${bg}">${p.unlocked ? '' : icon('lock', 11)}</i>`;
                  })
                  .join('')}
              </span>
            </button>`,
          )
          .join('');
      const overlay = h(
        'div',
        'screen garage',
        `<div class="screen-inner">
          <div class="screen-head">
            <button class="btn icon-btn" data-back>${icon('chevronLeft')}</button>
            <h2>Garage</h2>
          </div>
          <p class="screen-sub">Pick your ride. Every level works with every ride, and each one keeps its own best run.</p>
          <div class="ride-grid">${render(selected)}</div>
        </div>`,
      );
      overlay.onclick = (e) => {
        const btn = (e.target as HTMLElement).closest('button');
        if (!btn) return;
        this.handlers.click();
        if (btn.dataset.back !== undefined) {
          overlay.classList.add('leaving');
          setTimeout(() => overlay.remove(), 250);
          resolve();
          return;
        }
        const paint = (e.target as HTMLElement).closest('.paint') as HTMLElement | null;
        if (paint) {
          if (paint.classList.contains('locked')) {
            this.flash(paint.title);
            return;
          }
          cards = onPaint(paint.dataset.ride!, paint.dataset.paint!);
          selected = paint.dataset.ride!;
          onPick(selected);
          overlay.querySelector('.ride-grid')!.innerHTML = render(selected);
          return;
        }
        const id = btn.dataset.id;
        if (!id) return;
        selected = id;
        onPick(id);
        overlay.querySelector('.ride-grid')!.innerHTML = render(id);
      };
      document.body.append(overlay);
    });
  }

  /** World chips (landscape, time, weather) for an intro card. */
  private worldPicker(card: HTMLElement, picker: WorldPicker | undefined) {
    const slot = card.querySelector('.world-pick') as HTMLElement | null;
    if (!slot || !picker) return;
    let w = picker.value;
    const render = () => {
      const home = picker.home;
      const isHome = w.biome === home.biome && w.time === home.time && w.weather === home.weather;
      const weathers = WEATHERS.filter((x) => biomeById(w.biome).weathers.includes(x.id));
      slot.innerHTML = `<div class="world-row">${BIOMES.map(
        (b) => `<button class="world-chip ${b.id === w.biome ? 'active' : ''}" data-biome="${b.id}" title="${b.name}">${icon(b.id, 18)}<span>${b.name}</span>${b.id === home.biome ? '<i class="home-dot" title="Home world"></i>' : ''}</button>`,
      ).join('')}</div>
        <div class="world-row small">
          <div class="mini-seg">${TIMES.map((t) => `<button class="${t.id === w.time ? 'active' : ''}" data-time="${t.id}" title="${t.name}">${icon(t.id, 16)}</button>`).join('')}</div>
          <div class="mini-seg">${weathers.map((x) => `<button class="${x.id === w.weather ? 'active' : ''}" data-weather="${x.id}" title="${x.name}">${icon(x.id, 16)}</button>`).join('')}</div>
          <span class="world-label">${TIMES.find((t) => t.id === w.time)!.name} · ${WEATHERS.find((x) => x.id === w.weather)!.name}</span>
          ${isHome ? '' : `<button class="world-home" data-home>${icon('replay', 14)} Home</button>`}
        </div>`;
    };
    render();
    slot.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLElement | null;
      if (!b) return;
      e.stopPropagation();
      this.handlers.click();
      const d = b.dataset;
      const next: Partial<WorldConfig> =
        d.home !== undefined
          ? picker.home
          : d.biome
            ? { ...w, biome: d.biome as BiomeId, weather: d.biome === picker.home.biome ? picker.home.weather : biomeById(d.biome).weathers[0] }
            : d.time
              ? { ...w, time: d.time as WorldConfig['time'] }
              : { ...w, weather: d.weather as WorldConfig['weather'] };
      w = picker.onPick(next);
      render();
    });
  }

  /** Row of ride chips for an intro card (or the level's fixed ride). */
  private ridePicker(card: HTMLElement, ride: RidePicker | undefined, keysEl: HTMLElement | null) {
    const slot = card.querySelector('.ride-pick') as HTMLElement | null;
    if (!slot || !ride) return;
    const render = (sel: string) => {
      if (ride.locked) {
        const o = ride.options.find((x) => x.id === sel)!;
        slot.innerHTML = `<span class="ride-chip active locked">${icon(o.id, 20)}<span>${o.name}</span></span><span class="ride-note">${icon('lock', 13)} This level's ride</span>`;
        return;
      }
      slot.innerHTML = ride.options
        .map((o) => `<button class="ride-chip ${o.id === sel ? 'active' : ''}" data-ride="${o.id}" title="${o.name}">${icon(o.id, 20)}<span>${o.name}</span></button>`)
        .join('');
    };
    render(ride.selected);
    slot.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-ride]') as HTMLElement | null;
      if (!b) return;
      e.stopPropagation();
      this.handlers.click();
      const keys = ride.onPick(b.dataset.ride!);
      if (keysEl) keysEl.innerHTML = controlsHtml(keys);
      render(b.dataset.ride!);
    });
  }

  private toastQueue: { title: string; desc: string; ride?: string }[] = [];
  private toasting = false;

  /** Achievement unlocked banner (queued, one at a time). */
  toast(title: string, desc: string, ride?: string) {
    this.toastQueue.push({ title, desc, ride });
    if (!this.toasting) this.nextToast();
  }

  private nextToast() {
    const t = this.toastQueue.shift();
    if (!t) {
      this.toasting = false;
      return;
    }
    this.toasting = true;
    const el = h(
      'div',
      'toast',
      `<span class="toast-icon">${icon(t.ride ?? 'trophy', 26)}</span>
       <span class="toast-text"><small>${t.ride ? 'Ride challenge complete' : 'Achievement unlocked'}</small><b>${t.title}</b><em>${t.desc}</em></span>`,
    );
    document.body.append(el);
    setTimeout(() => el.classList.add('leaving'), 3200);
    setTimeout(() => {
      el.remove();
      this.nextToast();
    }, 3600);
  }

  /** Achievements and ride challenges. */
  showTrophies(cards: TrophyCard[]): Promise<void> {
    return new Promise((resolve) => {
      const done = cards.filter((c) => c.unlocked).length;
      const groups = new Map<string, TrophyCard[]>();
      for (const c of cards) {
        const key = c.rideName ?? 'General';
        groups.set(key, [...(groups.get(key) ?? []), c]);
      }
      const section = ([name, list]: [string, TrophyCard[]]) => `
        <section class="trophy-group">
          <h3>${list[0].ride ? icon(list[0].ride, 16) : icon('trophy', 16)} ${name}<span>${list.filter((c) => c.unlocked).length}/${list.length}</span></h3>
          <div class="trophy-grid">${list
            .map(
              (c) => `<div class="trophy ${c.unlocked ? 'on' : ''}">
                <span class="trophy-icon">${icon(c.unlocked ? 'trophy' : 'lock', 20)}</span>
                <span><b>${c.title}</b><small>${c.desc}</small></span>
              </div>`,
            )
            .join('')}</div>
        </section>`;
      const overlay = h(
        'div',
        'screen trophies',
        `<div class="screen-inner">
          <div class="screen-head">
            <button class="btn icon-btn" data-back>${icon('chevronLeft')}</button>
            <h2>Trophies</h2>
            <span class="pill big">${icon('trophy', 16)} ${done} / ${cards.length}</span>
          </div>
          <p class="screen-sub">Ride challenges unlock new paint jobs in the Garage.</p>
          ${[...groups.entries()].map(section).join('')}
        </div>`,
      );
      overlay.onclick = (e) => {
        const btn = (e.target as HTMLElement).closest('[data-back]');
        if (!btn) return;
        this.handlers.click();
        overlay.classList.add('leaving');
        setTimeout(() => overlay.remove(), 250);
        resolve();
      };
      document.body.append(overlay);
    });
  }

  /** Photo mode bar: field of view, snap and exit. Resolves on exit. */
  showPhotoMode(fov: number, onFov: (fov: number) => void, onSnap: () => void): Promise<void> {
    return new Promise((resolve) => {
      const bar = h(
        'div',
        'photo-bar',
        `<span class="photo-hint">Drag to orbit · scroll to zoom</span>
         <label class="photo-fov">${icon('camera', 16)}<input type="range" min="20" max="90" value="${Math.round(fov)}" aria-label="Field of view"></label>
         <button class="big-btn primary" data-a="snap">${icon('aperture', 18)} Snap</button>
         <button class="big-btn ghost" data-a="exit">Done</button>`,
      );
      const exit = () => {
        window.removeEventListener('keydown', onKey, true);
        bar.classList.add('leaving');
        setTimeout(() => bar.remove(), 200);
        resolve();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
          e.stopImmediatePropagation();
          exit();
        } else if (e.code === 'Space') {
          e.preventDefault();
          e.stopImmediatePropagation();
          onSnap();
        }
      };
      window.addEventListener('keydown', onKey, true);
      bar.querySelector('input')!.addEventListener('input', (e) => onFov(Number((e.target as HTMLInputElement).value)));
      bar.onclick = (e) => {
        const a = ((e.target as HTMLElement).closest('[data-a]') as HTMLElement | null)?.dataset.a;
        if (a === 'snap') onSnap();
        else if (a === 'exit') {
          this.handlers.click();
          exit();
        }
      };
      document.body.append(bar);
    });
  }

  /** Pause menu; resolves with the choice. */
  showPause(title: string, canLevels: boolean): Promise<PauseChoice> {
    return new Promise((resolve) => {
      const overlay = h(
        'div',
        'modal pause',
        `<div class="card small" role="dialog" aria-label="Paused">
          <span class="badge dark">Paused</span>
          <h2>${title}</h2>
          <div class="pause-actions">
            <button class="big-btn primary" data-p="resume">${icon('play', 18)} Resume</button>
            <button class="big-btn secondary" data-p="restart">${icon('replay', 18)} Restart</button>
            <button class="big-btn ghost" data-p="settings">${icon('gear', 18)} Settings</button>
            ${canLevels ? `<button class="big-btn ghost" data-p="levels">${icon('star', 18)} Levels</button>` : ''}
            <button class="big-btn ghost" data-p="menu">${icon('home', 18)} Main menu</button>
          </div>
        </div>`,
      );
      const close = (c: PauseChoice) => {
        this.handlers.click();
        window.removeEventListener('keydown', onKey, true);
        overlay.classList.add('leaving');
        setTimeout(() => overlay.remove(), 200);
        resolve(c);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        e.stopImmediatePropagation();
        close('resume');
      };
      window.addEventListener('keydown', onKey, true);
      overlay.onclick = (e) => {
        const b = (e.target as HTMLElement).closest('[data-p]') as HTMLElement | null;
        if (b) close(b.dataset.p as PauseChoice);
        else if (e.target === overlay) close('resume');
      };
      document.body.append(overlay);
      (overlay.querySelector('[data-p="resume"]') as HTMLElement).focus();
    });
  }

  /** Settings screen; every change is applied live through `onChange`. */
  showSettings(s: SettingsView, onChange: (s: SettingsView) => void, onReset: () => void): Promise<void> {
    return new Promise((resolve) => {
      const seg = (name: string, options: [string, string][], value: string) =>
        `<div class="seg" data-name="${name}">${options.map(([v, l]) => `<button class="${v === value ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
      const overlay = h(
        'div',
        'screen settings',
        `<div class="screen-inner">
          <div class="screen-head">
            <button class="btn icon-btn" data-back>${icon('chevronLeft')}</button>
            <h2>Settings</h2>
          </div>
          <div class="settings-list">
            <section>
              <h3>Graphics</h3>
              <div class="row"><span>Quality<small class="q-note">${s.qualityNote}</small></span>${seg('quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], s.quality)}</div>
            </section>
            <section>
              <h3>Sound</h3>
              <label class="row"><span>Effects</span><input type="range" min="0" max="100" data-name="sfxVolume" value="${Math.round(s.sfxVolume * 100)}"></label>
              <label class="row"><span>Music</span><input type="range" min="0" max="100" data-name="musicVolume" value="${Math.round(s.musicVolume * 100)}"></label>
            </section>
            <section>
              <h3>Camera</h3>
              <div class="row"><span>Default view</span>${seg('camera', [['cinematic', 'Cinema'], ['chase', 'Chase'], ['side', 'Side'], ['follow', 'Free']], s.camera)}</div>
              <label class="row"><span>Distance</span><input type="range" min="70" max="140" data-name="cameraDistance" value="${Math.round(s.cameraDistance * 100)}"></label>
              <label class="row toggle"><span>Reduced motion<small>No shake, zoom punches or flashes</small></span><input type="checkbox" data-name="reducedMotion" ${s.reducedMotion ? 'checked' : ''}><i></i></label>
            </section>
            <section>
              <h3>Progress</h3>
              <div class="row"><span>Reset stars, bests and ghosts</span><button class="big-btn danger small-btn" data-reset>Reset</button></div>
            </section>
          </div>
        </div>`,
      );
      const emit = () => onChange({ ...s });
      overlay.addEventListener('input', (e) => {
        const el = e.target as HTMLInputElement;
        const name = el.dataset.name as keyof SettingsView | undefined;
        if (!name) return;
        if (el.type === 'checkbox') (s as unknown as Record<string, unknown>)[name] = el.checked;
        else (s as unknown as Record<string, unknown>)[name] = Number(el.value) / 100;
        emit();
      });
      overlay.onclick = async (e) => {
        const btn = (e.target as HTMLElement).closest('button');
        if (!btn) return;
        if (btn.dataset.back !== undefined) {
          this.handlers.click();
          overlay.classList.add('leaving');
          setTimeout(() => overlay.remove(), 250);
          resolve();
          return;
        }
        if (btn.dataset.reset !== undefined) {
          this.handlers.click();
          if (await this.confirm('Reset all progress?', 'Stars, best scores and ghosts on this device will be erased. This cannot be undone.', 'Reset')) {
            onReset();
            this.flash('Progress reset');
          }
          return;
        }
        const segEl = btn.closest('.seg') as HTMLElement | null;
        if (segEl) {
          this.handlers.click();
          segEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
          (s as unknown as Record<string, unknown>)[segEl.dataset.name!] = btn.dataset.v;
          emit();
        }
      };
      document.body.append(overlay);
    });
  }

  setCameraLabel(label: string) {
    this.camBtn.innerHTML = `${icon('camera', 18)}<span>${label}</span>`;
  }

  /** Updates the "currently: Medium" note next to Auto quality. */
  setQualityNote(text: string) {
    const el = document.querySelector('.settings .q-note');
    if (el) el.textContent = text;
  }

  /** Shows a link to copy by hand (when the clipboard isn't available). */
  showLink(url: string, challenge: number) {
    const overlay = h(
      'div',
      'modal',
      `<div class="card small">
        <h2>${challenge ? 'Challenge a friend' : 'Share your track'}</h2>
        <p>${challenge ? `Send this link: your friend rides the same track and tries to beat <b>${challenge.toLocaleString()}</b> points.` : 'Anyone with this link can ride your track.'}</p>
        <input class="link-input" readonly value="${url}" />
        <div class="actions">
          <button class="big-btn ghost" data-a="close">Close</button>
          <button class="big-btn primary" data-a="copy">${icon('share', 18)} Copy link</button>
        </div>
      </div>`,
    );
    const input = overlay.querySelector('input')!;
    setTimeout(() => input.select(), 50);
    overlay.onclick = async (e) => {
      const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (btn?.dataset.a === 'copy') {
        this.handlers.click();
        input.select();
        let ok = false;
        try {
          await Promise.race([navigator.clipboard.writeText(url), new Promise((_, no) => setTimeout(no, 1500))]);
          ok = true;
        } catch {
          // Older browsers: copy the selected text.
          ok = document.execCommand?.('copy') ?? false;
        }
        btn.innerHTML = ok ? `${icon('check', 18)} Copied!` : 'Select & copy the link';
        return;
      }
      if (!btn && e.target !== overlay) return;
      overlay.classList.add('leaving');
      setTimeout(() => overlay.remove(), 200);
    };
    document.body.append(overlay);
  }

  /** Intro for a track opened from a share link. */
  showSharedIntro(challenge: number, goals: string[], keys: Controls, ride?: RidePicker, world?: WorldPicker): Promise<void> {
    return new Promise((resolve) => {
      const overlay = h(
        'div',
        'modal intro',
        `<div class="card">
          <span class="badge dark">${challenge ? 'Challenge' : 'Shared track'}</span>
          <h2>${challenge ? `Beat ${challenge.toLocaleString()} points!` : 'A friend shared a track'}</h2>
          <p>${challenge ? 'Your friend set this score on this track. Can you top it?' : 'Ride it, then edit it or make it your own.'}</p>
          <ul class="intro-goals">${goals.map((g) => `<li>${icon('star', 18)}${g}</li>`).join('')}</ul>
          <div class="ride-pick"></div>
          <div class="world-pick"></div>
          <div class="keys controls">${controlsHtml(keys)}</div>
          <div class="actions"><button class="big-btn primary">${icon('play', 18)} Ride!</button></div>
        </div>`,
      );
      overlay.onclick = (e) => {
        if (!(e.target as HTMLElement).closest('button') && e.target !== overlay) return;
        this.handlers.click();
        overlay.classList.add('leaving');
        setTimeout(() => overlay.remove(), 200);
        resolve();
      };
      this.ridePicker(overlay, ride, overlay.querySelector('.keys'));
      this.worldPicker(overlay, world);
      document.body.append(overlay);
    });
  }

  /** Level intro card with its goals. */
  showLevelIntro(number: number, name: string, tip: string, goals: string[], stars: number, keys: Controls, ride?: RidePicker, world?: WorldPicker): Promise<void> {
    return new Promise((resolve) => {
      const overlay = h(
        'div',
        'modal intro',
        `<div class="card">
          <span class="badge dark">Level ${number}</span>
          <h2>${name}</h2>
          <p>${tip}</p>
          <ul class="intro-goals">${goals.map((g, i) => `<li class="${i < stars ? 'done' : ''}">${icon('star', 18)}${g}</li>`).join('')}</ul>
          <div class="ride-pick"></div>
          <div class="world-pick"></div>
          <div class="keys controls">${controlsHtml(keys)}</div>
          <div class="actions"><button class="big-btn primary">${icon('play', 18)} Ride!</button></div>
        </div>`,
      );
      overlay.onclick = (e) => {
        if (!(e.target as HTMLElement).closest('button') && e.target !== overlay) return;
        this.handlers.click();
        overlay.classList.add('leaving');
        setTimeout(() => overlay.remove(), 200);
        resolve();
      };
      this.ridePicker(overlay, ride, overlay.querySelector('.keys'));
      this.worldPicker(overlay, world);
      document.body.append(overlay);
    });
  }

  /** End-of-run card. */
  showSummary(
    stats: Stats,
    info: SummaryInfo,
    onReplay: () => void,
    onEdit: () => void,
    onWatch: () => void,
    onLevels?: () => void,
    onNext?: () => void,
  ) {
    document.querySelector('.summary')?.remove();
    const clean = !stats.crashed;
    const fmt = (n: number, d = 0) => n.toFixed(d);
    const overlay = h(
      'div',
      'summary',
      `<div class="card">
        <div class="summary-head ${clean ? 'clean' : 'wipeout'}">
          ${info.level ? `<span class="badge">Level ${info.level.number} · ${info.level.name}</span> ` : ''}<span class="badge">${stats.finished ? `Finished · ${stats.finishTime.toFixed(2)}s` : clean ? 'Clean run' : 'Wipeout'}</span>${info.vehicle ? ` <span class="badge">${info.vehicle}</span>` : ''}
          <div class="rating">${[0, 1, 2].map((i) => `<span class="rstar ${i < info.rating ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.18}s">${icon('star', 44)}</span>`).join('')}</div>
          <h2>${info.rating === 3 ? 'Legendary!' : stats.finished ? 'Finished!' : clean ? 'Nice ride!' : 'Ouch, Bosh!'}</h2>
          <div class="score-line">
            <div class="score-big">${stats.score.toLocaleString()}<small>pts</small></div>
            ${info.newBest ? `<span class="new-best">${icon('trophy', 16)} New best!</span>` : info.best > 0 ? `<span class="best">Best ${info.best.toLocaleString()}</span>` : ''}
          </div>
          ${stats.bestTrick ? `<p class="best-trick">Best trick: <b>${stats.bestTrick}</b></p>` : ''}
          ${info.ghostSaved ? `<span class="ghost-badge">${icon('eye', 14)} Saved as your ghost to beat</span>` : ''}
          ${
            info.challenge
              ? `<p class="challenge-line">${stats.score >= info.challenge ? `${icon('trophy', 16)} You beat the challenge of ${info.challenge.toLocaleString()}!` : `${(info.challenge - stats.score).toLocaleString()} points short of the ${info.challenge.toLocaleString()} challenge`}</p>`
              : ''
          }
        </div>
        <ul class="goals">${info.goals.map((g) => `<li class="${g.done ? 'done' : ''}">${icon(g.done ? 'check' : 'circle', 16)}${g.label}</li>`).join('')}</ul>
        <div class="stats">
          <div><b>${fmt(stats.time, 1)}<small>s</small></b><span>Time</span></div>
          <div><b>${fmt(stats.distance * METERS)}<small>m</small></b><span>Distance</span></div>
          <div><b>${fmt(stats.topSpeed * KMH)}<small>km/h</small></b><span>Top speed</span></div>
          <div><b>${fmt(stats.bestAir, 1)}<small>s</small></b><span>Best air</span></div>
          <div><b>${stats.tricks}<small>${stats.perfects ? ` · ${stats.perfects} perfect` : ''}</small></b><span>Tricks</span></div>
          <div><b>${info.starsTotal ? `${stats.stars}/${info.starsTotal}` : `x${stats.bestCombo}`}</b><span>${info.starsTotal ? 'Stars' : 'Best combo'}</span></div>
        </div>
        <div class="actions">
          ${
            info.level
              ? `<button class="big-btn ghost icon-only" data-a="levels" title="Levels" aria-label="Levels">${icon('menu', 20)}</button>
                 <button class="big-btn ghost icon-only" data-a="watch" title="Watch replay" aria-label="Watch replay">${icon('eye', 20)}</button>
                 <button class="big-btn ${info.level.hasNext && info.level.nextUnlocked ? 'ghost' : 'primary'}" data-a="replay">${icon('replay', 18)} Retry</button>
                 ${info.level.hasNext && info.level.nextUnlocked ? `<button class="big-btn primary" data-a="next">Next ${icon('chevronRight', 18)}</button>` : ''}`
              : `<button class="big-btn ghost icon-only" data-a="edit" title="Edit track" aria-label="Edit track">${icon('pencil', 20)}</button>
                 ${info.riderMode ? `<button class="big-btn ghost icon-only" data-a="watch" title="Watch replay" aria-label="Watch replay">${icon('eye', 20)}</button>` : ''}
                 ${stats.score > 0 ? `<button class="big-btn ghost" data-a="challenge">${icon('share', 18)} Challenge</button>` : ''}
                 <button class="big-btn primary" data-a="replay">${icon('replay', 18)} Ride again</button>`
          }
        </div>
      </div>`,
    );
    overlay.onclick = (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a;
      if (!a && e.target !== overlay) return;
      this.handlers.click();
      if (a === 'challenge') {
        this.handlers.share(stats.score);
        return;
      }
      overlay.classList.add('leaving');
      setTimeout(() => overlay.remove(), 250);
      if (a === 'replay') onReplay();
      else if (a === 'edit') onEdit();
      else if (a === 'watch') onWatch();
      else if (a === 'levels') onLevels?.();
      else if (a === 'next') onNext?.();

    };
    document.body.append(overlay);
  }

  hideSummary() {
    document.querySelector('.summary')?.remove();
  }

  /** How to play: a short visual walkthrough, one idea per page. */
  showHelp() {
    const cap = (k: string, cls = '') => `<kbd class="key big ${cls}">${k}</kbd>`;
    const pages: { title: string; art: string; text: string }[] = [
      {
        title: 'Draw a track',
        art: `<svg class="help-art" viewBox="0 0 320 150" aria-hidden="true">
            <defs><pattern id="hg" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#d6e1ee" stroke-width="1"/></pattern></defs>
            <rect width="320" height="150" rx="18" fill="url(#hg)"/>
            <path d="M24 34 C 90 40, 110 118, 190 112 S 280 70, 300 88" fill="none" stroke="#2f7fd8" stroke-width="12" stroke-linecap="round"/>
            <path d="M24 30 C 90 36, 110 114, 190 108 S 280 66, 300 84" fill="none" stroke="#9fd0ff" stroke-width="3" stroke-linecap="round"/>
            <circle cx="24" cy="34" r="9" fill="#ffffff" stroke="#ff8a3d" stroke-width="4"/>
            <g transform="translate(286 52) rotate(35)"><rect x="-6" y="-26" width="12" height="34" rx="3" fill="#ffc23d"/><path d="M-6 8 0 20 6 8Z" fill="#f2c9a0"/><rect x="-6" y="-30" width="12" height="6" rx="2" fill="#f0529c"/></g>
          </svg>
          <div class="help-chips">${(
            [
              ['#2f7fd8', 'Track'],
              ['#e0433a', 'Boost'],
              ['#5ec8e6', 'Ice'],
              ['#f0529c', 'Bouncy'],
            ] as const
          )
            .map(([c, n]) => `<span><i style="background:${c}"></i>${n}</span>`)
            .join('')}</div>`,
        text: 'Drag to draw. The <b>colored side</b> is the floor, so draw <b>left to right</b>. Start on the end of a track (orange ring) to join them.',
      },
      {
        title: 'Watch Bosh ride',
        art: `<div class="help-play">
            <span class="help-play-btn">${icon('play', 40)}</span>
            <div class="help-timeline"><i></i><b></b></div>
            <div class="help-keys-row">${cap('Space')}<span>play / pause</span></div>
          </div>`,
        text: 'Press <b>Play</b>. Drag the timeline to rewind, try slow-mo and other cameras, then fix your track and go again.',
      },
      {
        title: 'Take control',
        art: `<div class="help-arrows">
            <div class="arrow-cluster">
              <span class="up">${cap('↑', 'up')}<small>Spin</small></span>
              <span class="left">${cap('←', 'left')}<small>Brake</small></span>
              <span class="right">${cap('→', 'right')}<small>Push</small></span>
            </div>
            <div class="air-hint">${icon('replay', 16)} In the air, <b>←</b> and <b>→</b> flip</div>
          </div>`,
        text: 'Turn on <b>rider mode</b> to steer Bosh. <b>Let go before landing</b> and touch down flat for a Perfect.',
      },
      {
        title: 'Rides and worlds',
        art: `<div class="help-explore">
            <div class="row">${['sled', 'skis', 'snowboard', 'bike', 'moto', 'buggy'].map((v) => `<span class="ride">${icon(v, 24)}</span>`).join('')}</div>
            <div class="row">${BIOMES.map((b) => `<span class="world" data-world="${b.id}">${icon(BADGE[b.id], 22)}</span>`).join('')}</div>
          </div>`,
        text: 'Pick one of six rides in the <b>Garage</b>. In the editor, <b>World</b> sets the landscape, time of day and weather of your track.',
      },
      {
        title: 'Shortcuts',
        art: `<div class="help-short">
            ${this.keyGroup('Play', 'play', [
              [['Space'], 'Play'],
              [['Esc'], 'Pause'],
              [['C'], 'Camera'],
              [['F'], 'Find Bosh'],
              [['V'], 'Next ride'],
              [['P'], 'Photo'],
            ])}
            ${this.keyGroup('Build', 'pencil', [
              [['Q'], 'Pencil'],
              [['W'], 'Line'],
              [['E'], 'Eraser'],
              [['D'], 'Decor'],
              [['G'], 'World'],
              [['Ctrl', 'Z'], 'Undo'],
            ])}
          </div>`,
        text: 'Right-drag to orbit, wheel to zoom. On touch: one finger draws, two fingers orbit and zoom.',
      },
    ];
    const overlay = h(
      'div',
      'modal',
      `<div class="card help" data-pager>
        <div class="help-pages">${pages
          .map(
            (p, i) => `<section class="help-page" data-page="${i}">
              <span class="help-step">${i < pages.length - 1 ? `Step ${i + 1} of ${pages.length - 1}` : 'Reference'}</span>
              <h2>${p.title}</h2>
              <div class="help-visual">${p.art}</div>
              <p class="help-text">${p.text}</p>
            </section>`,
          )
          .join('')}</div>
        <div class="help-foot">
          <div class="help-dots">${pages.map((_, i) => `<button class="dot" data-go="${i}" aria-label="Page ${i + 1}"></button>`).join('')}</div>
          <div class="actions">
            <button class="big-btn ghost" data-nav="-1">${icon('chevronLeft', 18)} Back</button>
            <button class="big-btn primary" data-nav="1">Next ${icon('chevronRight', 18)}</button>
          </div>
        </div>
      </div>`,
    );
    let page = 0;
    const back = overlay.querySelector('[data-nav="-1"]') as HTMLButtonElement;
    const next = overlay.querySelector('[data-nav="1"]') as HTMLButtonElement;
    const close = () => {
      window.removeEventListener('keydown', onKey, true);
      overlay.classList.add('leaving');
      setTimeout(() => overlay.remove(), 200);
    };
    const show = (i: number) => {
      page = Math.max(0, Math.min(pages.length - 1, i));
      overlay.querySelectorAll<HTMLElement>('.help-page').forEach((el, k) => el.classList.toggle('on', k === page));
      overlay.querySelectorAll('.dot').forEach((el, k) => el.classList.toggle('on', k === page));
      back.style.visibility = page === 0 ? 'hidden' : 'visible';
      // The last tutorial step starts riding; the shortcuts page is only a reference.
      next.innerHTML = page >= pages.length - 2 ? "Let's ride!" : `Next ${icon('chevronRight', 18)}`;
    };
    const onKey = (e: KeyboardEvent) => {
      if (!overlay.isConnected) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.handlers.click();
        show(page + (e.key === 'ArrowRight' ? 1 : -1));
      } else if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    overlay.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (e.target === overlay) return close();
      if (!b) return;
      this.handlers.click();
      if (b.dataset.go) return show(Number(b.dataset.go));
      if (b.dataset.nav === '-1') return show(page - 1);
      if (page >= pages.length - 2) return close();
      show(page + 1);
    };
    show(0);
    document.body.append(overlay);
  }

  /** A titled block of key caps for the help card. */
  private keyGroup(title: string, ic: string, items: [string[], string][]) {
    const cap = (k: string) => `<kbd class="key ${k.length > 1 ? 'wide' : ''}">${k}</kbd>`;
    return `<section class="key-group"><h4>${icon(ic, 14)} ${title}</h4><div class="key-list">${items
      .map(([keys, label]) => `<span class="key-item"><span class="caps">${keys.map(cap).join(keys[0] === 'Ctrl' ? '<i>+</i>' : '<i>/</i>')}</span>${label}</span>`)
      .join('')}</div></section>`;
  }

  private bindKeys() {
    // Cards are keyboard friendly: arrows move a highlight between the buttons,
    // Enter presses it (the main button by default: Next, Retry, Ride!...).
    const MOVE: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
    window.addEventListener(
      'keydown',
      (e) => {
        if ((e.key !== 'Enter' && !(e.key in MOVE)) || e.altKey || e.ctrlKey || e.metaKey) return;
        const t = e.target as HTMLElement;
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
        const layer = [...document.querySelectorAll('.modal, .summary')].filter((l) => !l.classList.contains('leaving')).pop();
        if (!layer) return;
        // Paged cards (How to play) turn pages with the arrows themselves.
        if (e.key !== 'Enter' && layer.querySelector('[data-pager]')) return;
        const buttons = [...layer.querySelectorAll<HTMLButtonElement>('.big-btn')].filter((b) => !b.disabled && b.offsetParent !== null);
        const main = layer.querySelector<HTMLButtonElement>('.big-btn.primary');
        const sel = layer.querySelector<HTMLButtonElement>('.big-btn.kb-sel') ?? main;
        if (e.key === 'Enter') {
          if (e.repeat || !sel || sel.disabled) return;
          // Also stops a focused button from being clicked a second time.
          e.preventDefault();
          e.stopImmediatePropagation();
          sel.click();
          return;
        }
        // Arrows held while riding into the end of a run shouldn't jump around.
        if (e.repeat || buttons.length < 2) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const i = sel ? buttons.indexOf(sel) : -1;
        const next = buttons[(Math.max(0, i) + MOVE[e.key] + buttons.length) % buttons.length];
        for (const b of buttons) b.classList.toggle('kb-sel', b === next);
        this.handlers.click();
      },
      true,
    );
    window.addEventListener('keydown', (e) => {
      // Esc backs out of full screens (levels, garage, wardrobe).
      if (e.key === 'Escape') {
        const back = [...document.querySelectorAll('.screen [data-back]')].pop() as HTMLElement | undefined;
        if (back) {
          back.click();
          return;
        }
      }
      // Nothing reaches the game behind a menu, card or the title.
      if (document.body.classList.contains('on-title') || overlayOpen()) return;
      if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.editor.history.redo();
        else this.editor.history.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.editor.history.redo();
        return;
      }
      if (mod) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.playing) this.handlers.pause();
        else this.handlers.play();
        return;
      }
      if (e.key === 'Escape') return this.handlers.escape();
      if (e.key.toLowerCase() === 'c') return this.cycleCamera();
      if (e.key.toLowerCase() === 'f') return this.handlers.focusRider();
      if (e.key.toLowerCase() === 'p') return this.handlers.photo();
      if (e.key.toLowerCase() === 'g' && this.editor.enabled) return this.toggleWorldPanel();
      const tool = TOOLS.find((t) => t.key === e.key.toUpperCase());
      if (tool) this.selectTool(tool.id);
    });
  }

  get element() {
    return this.root;
  }
}
