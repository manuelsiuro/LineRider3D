import type { Editor, Tool } from '../editor/Editor';
import { DECOR_LABELS } from '../world/models';
import type { DecorKind, LineType } from '../track/types';
import { LINE_COLORS } from '../track/types';

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
}

const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: 'pencil', icon: '✏️', label: 'Pencil', key: 'Q' },
  { id: 'line', icon: '📏', label: 'Line', key: 'W' },
  { id: 'eraser', icon: '🧽', label: 'Eraser', key: 'E' },
  { id: 'bank', icon: '🌀', label: 'Bank', key: 'B' },
  { id: 'decor', icon: '🌲', label: 'Decor', key: 'D' },
  { id: 'start', icon: '🚩', label: 'Start', key: 'S' },
  { id: 'hand', icon: '✋', label: 'Camera', key: 'H' },
];

const LINE_TYPES: { id: LineType; label: string }[] = [
  { id: 'normal', label: 'Track' },
  { id: 'accel', label: 'Boost' },
  { id: 'scenery', label: 'Scenery' },
];

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
};

export class UI {
  private toolButtons = new Map<Tool, HTMLButtonElement>();
  private panel: HTMLElement;
  private playBtn: HTMLButtonElement;
  private timeline: HTMLInputElement;
  private timeLabel: HTMLElement;
  private crashBadge: HTMLElement;
  private hint: HTMLElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private hintTimer = 0;
  private playing = false;

  constructor(root: HTMLElement, private editor: Editor, private handlers: UIHandlers) {
    // Top bar.
    const top = h('div', 'topbar');
    const brand = h('div', 'brand', '<span class="logo">⛷️</span><span>Line Rider <b>3D</b></span>');
    const menuBtn = h('button', 'btn', '☰');
    menuBtn.title = 'Menu';
    const menu = h('div', 'menu hidden');
    const item = (label: string, fn: () => void) => {
      const b = h('button', 'menu-item', label);
      b.onclick = () => {
        menu.classList.add('hidden');
        fn();
      };
      menu.append(b);
    };
    const fileInput = h('input') as HTMLInputElement;
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    fileInput.onchange = () => {
      if (fileInput.files?.[0]) handlers.importTrack(fileInput.files[0]);
      fileInput.value = '';
    };
    item('🆕 New track', handlers.newTrack);
    item('🎿 Demo track', handlers.loadDemo);
    item('💾 Export JSON', handlers.exportTrack);
    item('📂 Import JSON', () => fileInput.click());
    item('❔ Help', () => this.showHelp());
    menuBtn.onclick = () => menu.classList.toggle('hidden');
    brand.prepend(menuBtn);
    top.append(brand, menu, fileInput);

    const right = h('div', 'top-actions');
    this.undoBtn = h('button', 'btn', '↶') as HTMLButtonElement;
    this.undoBtn.title = 'Undo (Ctrl+Z)';
    this.undoBtn.onclick = () => editor.history.undo();
    this.redoBtn = h('button', 'btn', '↷') as HTMLButtonElement;
    this.redoBtn.title = 'Redo (Ctrl+Shift+Z)';
    this.redoBtn.onclick = () => editor.history.redo();
    const camBtn = h('button', 'btn wide', '🎥 Follow') as HTMLButtonElement;
    camBtn.title = 'Camera mode (C)';
    camBtn.onclick = () => (camBtn.innerHTML = handlers.cycleCamera());
    const focusBtn = h('button', 'btn', '🎯') as HTMLButtonElement;
    focusBtn.title = 'Focus rider (F)';
    focusBtn.onclick = handlers.focusRider;
    right.append(this.undoBtn, this.redoBtn, focusBtn, camBtn);
    top.append(right);
    editor.history.onChange = () => this.refreshHistory();
    this.refreshHistory();

    // Player controls.
    const player = h('div', 'player');
    this.playBtn = h('button', 'btn play', '▶') as HTMLButtonElement;
    this.playBtn.title = 'Play / Pause (Space)';
    this.playBtn.onclick = () => (this.playing ? handlers.pause() : handlers.play());
    const stopBtn = h('button', 'btn', '⏹') as HTMLButtonElement;
    stopBtn.title = 'Stop (Esc)';
    stopBtn.onclick = handlers.stop;
    const slowBtn = h('button', 'btn', '🐢') as HTMLButtonElement;
    slowBtn.title = 'Slow motion';
    slowBtn.onclick = () => slowBtn.classList.toggle('active', handlers.toggleSlowMo());
    this.timeline = h('input', 'timeline') as HTMLInputElement;
    this.timeline.type = 'range';
    this.timeline.min = '0';
    this.timeline.max = '400';
    this.timeline.value = '0';
    this.timeline.oninput = () => handlers.seek(Number(this.timeline.value));
    this.timeLabel = h('span', 'time', '0.0s');
    this.crashBadge = h('span', 'crash hidden', '💥 Crash!');
    player.append(this.playBtn, stopBtn, slowBtn, this.timeline, this.timeLabel, this.crashBadge);

    // Tool options panel + toolbar.
    this.panel = h('div', 'panel');
    const toolbar = h('div', 'toolbar');
    for (const t of TOOLS) {
      const b = h('button', 'tool', `<span class="icon">${t.icon}</span><span class="label">${t.label}</span>`) as HTMLButtonElement;
      b.title = `${t.label} (${t.key})`;
      // Tapping the active tool again folds its options away (handy on phones).
      b.onclick = () => (this.editor.tool === t.id ? this.panel.classList.toggle('folded') : this.selectTool(t.id));
      this.toolButtons.set(t.id, b);
      toolbar.append(b);
    }
    const bottom = h('div', 'bottom');
    bottom.append(this.panel, toolbar);

    this.hint = h('div', 'hint hidden');
    root.append(top, player, bottom, this.hint);
    editor.onHint = (t) => this.flash(t);

    this.selectTool('pencil');
    this.bindKeys();
  }

  selectTool(tool: Tool) {
    this.editor.setTool(tool);
    this.panel.classList.remove('folded');
    for (const [id, b] of this.toolButtons) b.classList.toggle('active', id === tool);
    this.renderPanel();
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
        const b = h('button', o.id === value ? 'active' : '', o.label) as HTMLButtonElement;
        if (o.color !== undefined) b.style.setProperty('--swatch', `#${o.color.toString(16).padStart(6, '0')}`);
        if (o.color !== undefined) b.classList.add('swatch');
        b.onclick = () => {
          set(o.id);
          this.renderPanel();
        };
        g.append(b);
      }
      r.append(g);
    };
    const slider = (r: HTMLElement, label: string, min: number, max: number, step: number, value: number, unit: string, set: (v: number) => void) => {
      const wrap = h('label', 'slider');
      const text = h('span', '', `${label} <b>${value}${unit}</b>`);
      const input = h('input') as HTMLInputElement;
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      input.oninput = () => {
        set(Number(input.value));
        text.innerHTML = `${label} <b>${input.value}${unit}</b>`;
      };
      wrap.append(text, input);
      r.append(wrap);
    };

    if (tool === 'pencil' || tool === 'line') {
      const r1 = row();
      seg(r1, LINE_TYPES.map((t) => ({ ...t, color: LINE_COLORS[t.id] })), s.lineType, (v) => (s.lineType = v));
      seg(
        r1,
        [
          { id: 'profile', label: '⛰ Profile' },
          { id: 'path', label: '🗺 Path' },
        ],
        s.mode,
        (v) => (s.mode = v),
      );
      if (s.mode === 'profile') {
        const lock = h('button', `chip ${s.lockPlane ? 'active' : ''}`, s.lockPlane ? '🔒 Plane locked' : '🔓 Plane follows view') as HTMLButtonElement;
        lock.onclick = () => {
          s.lockPlane = !s.lockPlane;
          this.renderPanel();
        };
        r1.append(lock);
      } else {
        const auto = h('button', `chip ${s.autoBank ? 'active' : ''}`, s.autoBank ? '🛷 Auto-bank on' : '🛷 Auto-bank off') as HTMLButtonElement;
        auto.onclick = () => {
          s.autoBank = !s.autoBank;
          this.renderPanel();
        };
        r1.append(auto);
      }
      const r2 = row();
      slider(r2, 'Width', 1, 6, 0.2, s.width, '', (v) => (s.width = v));
      slider(r2, 'Bank', -90, 90, 5, s.bank, '°', (v) => (s.bank = v));
      if (s.mode === 'path') slider(r2, 'Descent', 0, 60, 1, s.grade, '%', (v) => (s.grade = v));
    } else if (tool === 'decor') {
      const r = row();
      seg(
        r,
        (Object.keys(DECOR_LABELS) as DecorKind[]).map((k) => ({ id: k, label: DECOR_LABELS[k] })),
        s.decor,
        (v) => (s.decor = v),
      );
    } else {
      const tips: Partial<Record<Tool, string>> = {
        eraser: 'Tap or drag over a track or decoration to remove it.',
        bank: 'Drag a track left/right to tilt it (snaps every 15°).',
        start: 'Tap a track or the drawing plane to move the start flag.',
        hand: 'Drag to orbit, two fingers / right-drag to pan, pinch / wheel to zoom.',
      };
      row().append(h('span', 'tip', tips[tool] ?? ''));
    }
  }

  private refreshHistory() {
    this.undoBtn.disabled = !this.editor.history.canUndo;
    this.redoBtn.disabled = !this.editor.history.canRedo;
  }

  setPlaying(playing: boolean) {
    this.playing = playing;
    this.playBtn.innerHTML = playing ? '⏸' : '▶';
    document.body.classList.toggle('is-playing', playing);
  }

  setTime(frame: number, recorded: number, crashed: boolean, fps: number) {
    const max = Math.max(400, recorded + 40);
    this.timeline.max = String(max);
    this.timeline.value = String(frame);
    this.timeLabel.textContent = `${(frame / fps).toFixed(1)}s`;
    this.crashBadge.classList.toggle('hidden', !crashed);
  }

  flash(text: string) {
    this.hint.textContent = text;
    this.hint.classList.remove('hidden');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hint.classList.add('hidden'), 1500);
  }

  private showHelp() {
    const overlay = h(
      'div',
      'help',
      `<div class="card">
        <h2>⛷️ Line Rider 3D</h2>
        <p>Draw tracks in 3D and watch Bosh sled down them!</p>
        <ul>
          <li><b>Profile</b> mode draws on a vertical plane facing you, like classic Line Rider. Orbit the camera to turn the plane.</li>
          <li><b>Path</b> mode draws on the ground seen from above: the ribbon descends as you draw.</li>
          <li>Start a stroke on the <b>end of another track</b> (orange ring) to connect them seamlessly.</li>
          <li>Tracks are solid on their <b>colored side</b>: draw left → right for a floor.</li>
          <li><b>Bank</b> tilts a track for turns, loops and corkscrews.</li>
        </ul>
        <p class="keys"><b>Desktop:</b> left-drag draw · right-drag orbit · middle-drag pan · wheel zoom<br/>
        <b>Mobile:</b> one finger draw · two fingers orbit &amp; pinch zoom · ✋ tool to pan</p>
        <p class="keys">Space play/pause · Esc stop · Q W E B D S H tools · C camera · F focus · Ctrl+Z undo</p>
        <button class="btn wide">Let's ride!</button>
      </div>`,
    );
    overlay.onclick = (e) => {
      if (e.target === overlay || (e.target as HTMLElement).tagName === 'BUTTON') overlay.remove();
    };
    document.body.append(overlay);
  }

  maybeShowHelp() {
    try {
      if (localStorage.getItem('lr3d.helpSeen')) return;
      localStorage.setItem('lr3d.helpSeen', '1');
    } catch {
      /* storage unavailable */
    }
    this.showHelp();
  }

  private bindKeys() {
    window.addEventListener('keydown', (e) => {
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
      if (e.key.toLowerCase() === 'c') {
        const label = this.handlers.cycleCamera();
        const camBtn = document.querySelector('.top-actions .wide');
        if (camBtn) camBtn.innerHTML = label;
        return;
      }
      if (e.key.toLowerCase() === 'f') return this.handlers.focusRider();
      const tool = TOOLS.find((t) => t.key === e.key.toUpperCase());
      if (tool) this.selectTool(tool.id);
    });
  }
}
