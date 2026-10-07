import type { Editor, ItemKind, Tool } from '../editor/Editor';
import { DECOR_LABELS } from '../world/models';
import type { DecorKind, LineType } from '../track/types';
import { LINE_COLORS } from '../track/types';
import type { Stats, Trick } from '../game/RunStats';
import { GRADE_LABEL } from '../game/RunStats';
import { icon } from './icons';

/** Writes text only when it changed (the HUD updates every frame). */
function setText(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text;
}

/** Is a menu, card or screen covering the game? */
export function overlayOpen() {
  return document.querySelector('.modal, .screen, .summary, .title-screen') !== null;
}

export type TitleChoice = 'levels' | 'create' | 'new' | 'wardrobe' | 'garage';

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
  /** Next ride (editor quick switch). */
  cycleVehicle(): void;
  /** Touch pad input: bit mask from the on-screen buttons. */
  touchInput(mask: number): void;
  click(): void;
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

export interface VehicleCard {
  id: string;
  name: string;
  blurb: string;
  stats: { speed: number; grip: number; air: number; toughness: number };
}

/** Ride choice shown on a level intro. */
export interface RidePicker {
  options: { id: string; name: string }[];
  selected: string;
  /** Level made for one ride: no choice. */
  locked: boolean;
  onPick(id: string): string;
}

export interface LevelCard {
  name: string;
  tip: string;
  stars: number;
  score: number;
  unlocked: boolean;
}

export interface OutfitCard {
  id: string;
  name: string;
  stars: number;
  colors: number[];
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

  constructor(root: HTMLElement, private editor: Editor, private handlers: UIHandlers, riderMode: boolean) {
    this.root = root;

    // ------------------------------------------------------------ top bar
    const top = h('div', 'topbar');
    const left = h('div', 'top-left');
    const menuBtn = button('btn icon-btn', icon('menu'), 'Menu');
    const brand = h('div', 'brand', `${icon('snowflake', 20)}<span>Line Rider</span><b>3D</b>`);
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
    right.append(group1, shareBtn, focusBtn, this.camBtn, group2);
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
    const bottom = h('div', 'bottom');
    bottom.append(this.panel, toolbar);

    this.hint = h('div', 'hint hidden');
    root.append(top, player, this.hud, this.popups, this.touchPad, bottom, this.hint);
    this.setRiderMode(riderMode);
    editor.onHint = (t) => this.flash(t);

    this.selectTool('pencil');
    this.bindKeys();
  }

  // ---------------------------------------------------------------- tools

  selectTool(tool: Tool) {
    this.editor.setTool(tool);
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
      seg(
        row(),
        (Object.keys(DECOR_LABELS) as DecorKind[]).map((k) => ({ id: k, label: DECOR_LABELS[k] })),
        s.decor,
        (v) => (s.decor = v),
      );
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
    this.popups.append(el);
    setTimeout(() => el.remove(), 1700);
  }

  /** Big animated callout in the middle of the screen. */
  popup(text: string, kind: 'boost' | 'bounce' | 'air' | 'crash' | 'finish' = 'boost') {
    const el = h('div', `popup ${kind}`, text);
    this.popups.append(el);
    setTimeout(() => el.remove(), 1400);
  }

  flash(text: string) {
    this.hint.textContent = text;
    this.hint.classList.remove('hidden');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hint.classList.add('hidden'), 1500);
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
            <div class="logo-mark">${icon('snowflake', 46)}</div>
            <h1>Line Rider<span>3D</span></h1>
            <p class="tagline">Draw it. Ride it. Wipe out in style.</p>
          </div>
          <div class="title-actions">
            <button class="big-btn primary" data-c="levels">${icon('play', 20)} Play <span class="pill">${icon('star', 14)} ${stars}/${maxStars}</span></button>
            <button class="big-btn secondary" data-c="${hasSave ? 'create' : 'new'}">${icon('pencil', 20)} ${hasSave ? 'Continue my track' : 'Create a track'}</button>
            <div class="title-row">
              <button class="big-btn ghost" data-c="garage">${icon('garage', 18)} Garage</button>
              <button class="big-btn ghost" data-c="wardrobe">${icon('sled', 18)} Wardrobe</button>
              ${hasSave ? `<button class="big-btn ghost" data-c="new">${icon('plus', 18)} New track</button>` : ''}
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
        if (c !== 'levels' && c !== 'wardrobe' && c !== 'garage') document.body.classList.remove('on-title');
        setTimeout(() => overlay.remove(), 450);
        resolve(c);
      };
      document.body.append(overlay);
    });
  }

  /** Level select; resolves with a level index, or null to go back. */
  showLevels(levels: LevelCard[], stars: number): Promise<number | null> {
    return new Promise((resolve) => {
      const cards = levels
        .map(
          (l, i) => `<button class="level-card ${l.unlocked ? '' : 'locked'}" data-i="${i}" ${l.unlocked ? '' : 'disabled'} style="animation-delay:${i * 0.04}s">
            <span class="level-num">${l.unlocked ? i + 1 : icon('lock', 20)}</span>
            <span class="level-name">${l.name}</span>
            <span class="level-stars">${[0, 1, 2].map((k) => `<i class="${k < l.stars ? 'on' : ''}">${icon('star', 18)}</i>`).join('')}</span>
            <span class="level-best">${l.unlocked ? (l.score ? `Best ${l.score.toLocaleString()}` : 'Not played') : 'Get a star on the previous level'}</span>
          </button>`,
        )
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
          <div class="level-grid">${cards}</div>
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
            const unlocked = stars >= o.stars;
            const swatch = o.colors.map((c) => `<i style="background:#${c.toString(16).padStart(6, '0')}"></i>`).join('');
            return `<button class="outfit ${o.id === sel ? 'active' : ''} ${unlocked ? '' : 'locked'}" data-id="${o.id}" ${unlocked ? '' : 'disabled'}>
              <span class="swatches">${swatch}</span>
              <span class="outfit-name">${o.name}</span>
              <span class="outfit-req">${unlocked ? (o.id === sel ? 'Wearing' : 'Wear') : `${icon('lock', 13)} ${o.stars} ${icon('star', 13)}`}</span>
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
          <p class="screen-sub">Earn stars in the levels to unlock new looks for Bosh.</p>
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
  showGarage(cards: VehicleCard[], selected: string, onPick: (id: string) => void): Promise<void> {
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
        const id = btn.dataset.id;
        if (!id) return;
        onPick(id);
        overlay.querySelector('.ride-grid')!.innerHTML = render(id);
      };
      document.body.append(overlay);
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
      if (keysEl) keysEl.innerHTML = `${icon('gamepad', 14)} ${keys}`;
      render(b.dataset.ride!);
    });
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
  showSharedIntro(challenge: number, goals: string[], keys: string, ride?: RidePicker): Promise<void> {
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
          <p class="keys">${icon('gamepad', 14)} ${keys}</p>
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
      document.body.append(overlay);
    });
  }

  /** Level intro card with its goals. */
  showLevelIntro(number: number, name: string, tip: string, goals: string[], stars: number, keys: string, ride?: RidePicker): Promise<void> {
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
          <p class="keys">${icon('gamepad', 14)} ${keys}</p>
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

  showHelp() {
    const overlay = h(
      'div',
      'modal',
      `<div class="card help">
        <h2>How to play</h2>
        <div class="help-grid">
          <div>${icon('pencil')}<p><b>Draw</b> tracks on the grid plane. <b>Profile</b> draws like classic Line Rider; orbit the camera to turn the plane. <b>Path</b> draws winding descents from above, auto-banked like a bobsled run.</p></div>
          <div>${icon('line')}<p>Start a stroke on the <b>end of another track</b> (orange ring) to connect them. The <b>colored side</b> is solid: draw left → right for a floor.</p></div>
          <div>${icon('ring')}<p><b>Boost</b> speeds up, <b>Ice</b> has no grip, <b>Bouncy</b> is a trampoline. With <b>Items</b>, add <b>stars</b> to collect, <b>rings</b> that launch Bosh and a <b>finish gate</b>.</p></div>
          <div>${icon('play')}<p>Press <b>Play</b> and watch Bosh ride. Scrub the timeline, try slow-mo and switch cameras.</p></div>
          <div>${icon('gamepad')}<p><b>Rider mode</b>: <b>→</b> pushes and <b>←</b> brakes on the track. In the air they <b>flip</b> Bosh forward or backward (on bikes and the buggy, → lifts the nose). On skis and the snowboard, <b>↑</b> spins 360s. Land clean to score!</p></div>
          <div>${icon('garage')}<p><b>Garage</b>: ride a sled, skis, a snowboard, a BMX, a motorbike or a buggy. Press <b>V</b> to switch while editing.</p></div>
        </div>
        <p class="keys"><b>Desktop</b> left-drag draw · right-drag orbit · middle-drag pan · wheel zoom<br/>
        <b>Touch</b> one finger draw · two fingers orbit &amp; zoom · Camera tool to pan<br/>
        <b>Keys</b> ← → ride · ↑ spin · V ride · Space play · Esc stop · Q W E B R D S H tools · C camera · F focus · Ctrl+Z undo</p>
        <div class="actions"><button class="big-btn primary">Let's ride!</button></div>
      </div>`,
    );
    overlay.onclick = (e) => {
      if (e.target === overlay || (e.target as HTMLElement).closest('button')) {
        this.handlers.click();
        overlay.classList.add('leaving');
        setTimeout(() => overlay.remove(), 200);
      }
    };
    document.body.append(overlay);
  }

  private bindKeys() {
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
      if (e.key === 'Escape') return this.handlers.stop();
      if (e.key.toLowerCase() === 'c') return this.cycleCamera();
      if (e.key.toLowerCase() === 'f') return this.handlers.focusRider();
      const tool = TOOLS.find((t) => t.key === e.key.toUpperCase());
      if (tool) this.selectTool(tool.id);
    });
  }

  get element() {
    return this.root;
  }
}
