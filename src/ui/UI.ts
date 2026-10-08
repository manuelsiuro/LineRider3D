import type { Editor, ItemKind, Tool } from '../editor/Editor';
import { DECOR_LABELS } from '../world/models';
import type { DecorKind, LineType } from '../track/types';
import { LINE_COLORS } from '../track/types';
import type { Stats, Trick } from '../game/RunStats';
import { GRADE_LABEL } from '../game/RunStats';
import { icon } from './icons';
import { BIOMES, DEFAULT_WORLD, TIMES, WEATHERS, biomeById, type WorldConfig } from '../world/worlds';
import { KMH, button, h, overlayOpen, setText } from './dom';
import type { ScreenCtx, UIHandlers } from './types';
import { confirm, showLink } from './screens/dialogs';
import { BADGE, showTitle, worldCaption } from './screens/title';
import { showLevels } from './screens/levels';
import { showWardrobe } from './screens/wardrobe';
import { showGarage } from './screens/garage';
import { showTrophies } from './screens/trophies';
import { showLevelIntro, showSharedIntro } from './screens/intro';
import { hideSummary, showSummary } from './screens/summary';
import { showPause, showPhotoMode, showSettings } from './screens/menus';
import { showHelp } from './screens/help';

export type * from './types';
export { overlayOpen };

/** A screen function's arguments after the shared context. */
type Rest<F> = F extends (ctx: ScreenCtx, ...a: infer A) => unknown ? A : never;


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
  private toastQueue: { title: string; desc: string; ride?: string }[] = [];
  private toasting = false;
  /** What the screens need from the shell. */
  private readonly ctx: ScreenCtx;

  constructor(root: HTMLElement, private editor: Editor, private handlers: UIHandlers, riderMode: boolean) {
    this.root = root;
    const shell = this;
    this.ctx = {
      click: () => handlers.click(),
      flash: (text, ms) => shell.flash(text, ms),
      share: (score) => handlers.share(score),
      get world() {
        return shell.shownWorld;
      },
    };

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
    if (cap) cap.innerHTML = worldCaption(w);
  }







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





  setCameraLabel(label: string) {
    this.camBtn.innerHTML = `${icon('camera', 18)}<span>${label}</span>`;
  }

  /** Updates the "currently: Medium" note next to Auto quality. */
  setQualityNote(text: string) {
    const el = document.querySelector('.settings .q-note');
    if (el) el.textContent = text;
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

  // ---------------------------------------------------------------- screens (see ./screens)

  confirm(...a: Rest<typeof confirm>) {
    return confirm(this.ctx, ...a);
  }
  showTitle(...a: Rest<typeof showTitle>) {
    return showTitle(this.ctx, ...a);
  }
  showLevels(...a: Rest<typeof showLevels>) {
    return showLevels(this.ctx, ...a);
  }
  showWardrobe(...a: Rest<typeof showWardrobe>) {
    return showWardrobe(this.ctx, ...a);
  }
  showGarage(...a: Rest<typeof showGarage>) {
    return showGarage(this.ctx, ...a);
  }
  showTrophies(...a: Rest<typeof showTrophies>) {
    return showTrophies(this.ctx, ...a);
  }
  showLevelIntro(...a: Rest<typeof showLevelIntro>) {
    return showLevelIntro(this.ctx, ...a);
  }
  showSharedIntro(...a: Rest<typeof showSharedIntro>) {
    return showSharedIntro(this.ctx, ...a);
  }
  showSummary(...a: Rest<typeof showSummary>) {
    return showSummary(this.ctx, ...a);
  }
  hideSummary() {
    hideSummary();
  }
  showPause(...a: Rest<typeof showPause>) {
    return showPause(this.ctx, ...a);
  }
  showSettings(...a: Rest<typeof showSettings>) {
    return showSettings(this.ctx, ...a);
  }
  showPhotoMode(...a: Rest<typeof showPhotoMode>) {
    return showPhotoMode(this.ctx, ...a);
  }
  showLink(...a: Rest<typeof showLink>) {
    return showLink(this.ctx, ...a);
  }
  showHelp() {
    showHelp(this.ctx);
  }
}
