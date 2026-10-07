import type { Editor, Tool } from '../editor/Editor';
import { DECOR_LABELS } from '../world/models';
import type { DecorKind, LineType } from '../track/types';
import { LINE_COLORS } from '../track/types';
import type { Stats } from '../game/RunStats';
import { icon } from './icons';

export type TitleChoice = 'continue' | 'demo' | 'new';

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
  toggleSfx(): boolean;
  toggleMusic(): boolean;
  click(): void;
}

const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: 'pencil', icon: 'pencil', label: 'Pencil', key: 'Q' },
  { id: 'line', icon: 'line', label: 'Line', key: 'W' },
  { id: 'eraser', icon: 'eraser', label: 'Eraser', key: 'E' },
  { id: 'bank', icon: 'bank', label: 'Bank', key: 'B' },
  { id: 'ring', icon: 'ring', label: 'Ring', key: 'R' },
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
  private hintTimer = 0;
  private playing = false;

  constructor(root: HTMLElement, private editor: Editor, private handlers: UIHandlers) {
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
    item('plus', 'New track', handlers.newTrack);
    item('sled', 'Demo track', handlers.loadDemo);
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
    const focusBtn = button('btn icon-btn', icon('target'), 'Focus rider (F)');
    focusBtn.onclick = handlers.focusRider;
    this.camBtn = button('btn text-btn', `${icon('camera', 18)}<span>Follow</span>`, 'Camera mode (C)');
    this.camBtn.onclick = () => this.cycleCamera();
    const sfxBtn = button('btn icon-btn', icon('sound'), 'Sound effects');
    const musicBtn = button('btn icon-btn', icon('music'), 'Music');
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
    right.append(group1, focusBtn, this.camBtn, group2);
    top.append(left, right);
    editor.history.onChange = () => this.refreshHistory();
    this.refreshHistory();

    // ------------------------------------------------------------ player
    const player = h('div', 'player');
    this.playBtn = button('play-btn', icon('play', 24), 'Play / Pause (Space)');
    this.playBtn.onclick = () => (this.playing ? handlers.pause() : handlers.play());
    const stopBtn = button('btn icon-btn flat', icon('stop', 18), 'Stop (Esc)');
    stopBtn.onclick = handlers.stop;
    const slowBtn = button('btn icon-btn flat', icon('slow', 20), 'Slow motion');
    slowBtn.onclick = () => slowBtn.classList.toggle('active', handlers.toggleSlowMo());
    this.timeline = h('input', 'timeline') as HTMLInputElement;
    this.timeline.type = 'range';
    this.timeline.min = '0';
    this.timeline.max = '400';
    this.timeline.value = '0';
    this.timeline.setAttribute('aria-label', 'Timeline');
    this.timeline.oninput = () => handlers.seek(Number(this.timeline.value));
    this.timeLabel = h('span', 'time', '0:00.0');
    player.append(this.playBtn, stopBtn, slowBtn, this.timeline, this.timeLabel);

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
      <div class="air-chip hidden">AIR <b>0.0s</b></div>`,
    );
    this.gaugeArc = this.hud.querySelector('.gauge-fg')!;
    this.gaugeValue = this.hud.querySelector('.gauge-text b')!;
    this.airChip = this.hud.querySelector('.air-chip')!;
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
    root.append(top, player, this.hud, this.popups, bottom, this.hint);
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
        ring: 'Tap a track to hang a boost ring over it, or tap the drawing plane.',
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

  setTime(frame: number, recorded: number, fps: number) {
    const max = Math.max(400, recorded + 40);
    this.timeline.max = String(max);
    this.timeline.value = String(frame);
    this.timeline.style.setProperty('--progress', `${(frame / max) * 100}%`);
    const t = frame / fps;
    this.timeLabel.textContent = `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
  }

  /** Live speed and airtime readout. */
  setHud(visible: boolean, stats: Stats) {
    this.hud.classList.toggle('hidden', !visible);
    if (!visible) return;
    const kmh = stats.speed * KMH;
    this.gaugeValue.textContent = String(Math.round(kmh));
    const frac = Math.min(kmh / 110, 1);
    this.gaugeArc.style.strokeDashoffset = String(1 - frac);
    this.hud.classList.toggle('fast', kmh > 60);
    const airborne = stats.air > 0.35 && !stats.crashed;
    this.airChip.classList.toggle('hidden', !airborne);
    if (airborne) this.airChip.querySelector('b')!.textContent = `${stats.air.toFixed(1)}s`;
  }

  /** Big animated callout in the middle of the screen. */
  popup(text: string, kind: 'boost' | 'bounce' | 'air' | 'crash' = 'boost') {
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
  showTitle(hasSave: boolean): Promise<TitleChoice> {
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
            ${hasSave ? `<button class="big-btn primary" data-c="continue">${icon('play', 20)} Continue my track</button>` : ''}
            <button class="big-btn ${hasSave ? 'secondary' : 'primary'}" data-c="demo">${icon('sled', 20)} Ride the demo</button>
            <button class="big-btn ghost" data-c="new">${icon('pencil', 20)} Draw a new track</button>
          </div>
          <p class="title-foot">${icon('sound', 16)} Best with sound on · works with mouse and touch</p>
        </div>`,
      );
      overlay.onclick = (e) => {
        const c = (e.target as HTMLElement).closest('button')?.dataset.c as TitleChoice | undefined;
        if (!c) return;
        this.handlers.click();
        overlay.classList.add('leaving');
        document.body.classList.remove('on-title');
        setTimeout(() => overlay.remove(), 600);
        resolve(c);
      };
      document.body.append(overlay);
    });
  }

  /** End-of-run card. */
  showSummary(stats: Stats, onReplay: () => void, onEdit: () => void) {
    document.querySelector('.summary')?.remove();
    const clean = !stats.crashed;
    const fmt = (n: number, d = 0) => n.toFixed(d);
    const overlay = h(
      'div',
      'summary',
      `<div class="card">
        <div class="summary-head ${clean ? 'clean' : 'wipeout'}">
          <span class="badge">${clean ? 'Clean run' : 'Wipeout'}</span>
          <h2>${clean ? 'Nice ride!' : 'Ouch, Bosh!'}</h2>
        </div>
        <div class="stats">
          <div><b>${fmt(stats.time, 1)}<small>s</small></b><span>Time</span></div>
          <div><b>${fmt(stats.distance * METERS)}<small>m</small></b><span>Distance</span></div>
          <div><b>${fmt(stats.topSpeed * KMH)}<small>km/h</small></b><span>Top speed</span></div>
          <div><b>${fmt(stats.bestAir, 1)}<small>s</small></b><span>Best air</span></div>
          <div><b>${stats.rings}</b><span>Rings</span></div>
          <div><b>${stats.bounces}</b><span>Bounces</span></div>
        </div>
        <div class="actions">
          <button class="big-btn ghost" data-a="edit">${icon('pencil', 18)} Edit track</button>
          <button class="big-btn primary" data-a="replay">${icon('replay', 18)} Ride again</button>
        </div>
      </div>`,
    );
    overlay.onclick = (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a;
      if (!a && e.target !== overlay) return;
      this.handlers.click();
      overlay.classList.add('leaving');
      setTimeout(() => overlay.remove(), 250);
      if (a === 'replay') onReplay();
      else if (a === 'edit') onEdit();
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
          <div>${icon('ring')}<p><b>Boost</b> speeds up, <b>Ice</b> has no grip, <b>Bouncy</b> is a trampoline. <b>Rings</b> launch Bosh through them.</p></div>
          <div>${icon('play')}<p>Press <b>Play</b> and watch Bosh ride. Scrub the timeline, try slow-mo and switch cameras.</p></div>
        </div>
        <p class="keys"><b>Desktop</b> left-drag draw · right-drag orbit · middle-drag pan · wheel zoom<br/>
        <b>Touch</b> one finger draw · two fingers orbit &amp; zoom · Camera tool to pan<br/>
        <b>Keys</b> Space play · Esc stop · Q W E B R D S H tools · C camera · F focus · Ctrl+Z undo</p>
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
      if (document.body.classList.contains('on-title')) return;
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
