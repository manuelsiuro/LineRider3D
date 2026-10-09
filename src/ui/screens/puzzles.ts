import { LINE_COLORS, type LineType } from '../../track/types';
import { biomeById, type BiomeId } from '../../world/worlds';
import type { PuzzleKind } from '../../levels/puzzles';
import { closeOverlay, h, hex } from '../dom';
import { icon } from '../icons';
import type { PuzzleCard, ScreenCtx, WorldTab } from '../types';

const TYPE_NAME: Partial<Record<LineType, string>> = { normal: 'Track', accel: 'Boost', bouncy: 'Bouncy', ice: 'Ice', mud: 'Mud', crumble: 'Crumble' };

/** Each kind of puzzle: its name, icon, and how to play it. */
const KINDS: Record<PuzzleKind, { name: string; icon: string; steps: [string, string][] }> = {
  draw: { name: 'Draw', icon: 'pencil', steps: [['pencil', "Draw what's missing (left to right)"], ['play', 'Press Play to test it'], ['stop', 'Stop, fix, and try again']] },
  oneline: { name: 'One line', icon: 'line', steps: [['line', 'Draw it all in a single line'], ['play', 'Press Play to test it'], ['eraser', 'Erase it to start over']] },
  trick: { name: 'Trick', icon: 'replay', steps: [['pencil', 'Draw a ramp or a drop'], ['play', 'Bosh has to land the trick'], ['stop', 'Then reach the finish']] },
  rings: { name: 'Rings', icon: 'star', steps: [['star', 'Tap the track to hang a boost ring'], ['play', 'Press Play: rings push Bosh along'], ['eraser', 'Erase a ring to move it']] },
  erase: { name: 'Erase', icon: 'eraser', steps: [['eraser', 'Erase the lines in the way'], ['play', 'Press Play to test it'], ['undo', 'Undo to put a line back']] },
};

/** Puzzle select, world by world (locked worlds show the puzzle stars they need); resolves with a puzzle index, or null to go back. */
export function showPuzzles(ctx: ScreenCtx, puzzles: PuzzleCard[], worlds: WorldTab[]): Promise<number | null> {
  return new Promise((resolve) => {
    const total = puzzles.reduce((n, p) => n + p.stars, 0);
    const card = (p: PuzzleCard, i: number, open: boolean, k: number) => `<button class="level-card puzzle-card ${open ? '' : 'locked'}" data-world="${p.world}" data-i="${i}" ${open ? '' : 'disabled'} style="animation-delay:${Math.min(k, 14) * 0.03}s">
          <span class="level-num">${open ? i + 1 : icon('lock', 20)}</span>
          <span class="level-badges"><span title="${KINDS[p.kind].name} puzzle">${icon(KINDS[p.kind].icon, 18)}</span></span>
          <span class="level-name">${p.name}</span>
          <span class="level-stars">${[0, 1, 2].map((k) => `<i class="${k < p.stars ? 'on' : ''}">${icon('star', 18)}</i>`).join('')}</span>
          <span class="level-best">${open ? (p.best ? `Best ${p.best} · par ${p.par}` : `Par ${p.par}`) : 'Opens with the world'}</span>
        </button>`;
    const inWorld = (w: BiomeId) => puzzles.map((p, i) => [p, i] as const).filter(([p]) => p.world === w);
    const got = (w: BiomeId) => inWorld(w).reduce((n, [p]) => n + p.stars, 0);
    // Start at the furthest open world that isn't finished, else the first.
    const open = worlds.filter((w) => w.open && inWorld(w.id).length);
    let current: BiomeId = [...open].reverse().find((w) => got(w.id) < inWorld(w.id).length * 3)?.id ?? open[0]?.id ?? worlds[0].id;

    const tabs = () =>
      worlds
        .filter((w) => inWorld(w.id).length)
        .map((w) => {
          const n = inWorld(w.id).length * 3;
          return `<button class="world-tab ${w.id === current ? 'active' : ''} ${w.open ? '' : 'locked'}" data-world="${w.id}" data-tab="${w.id}">
            <span class="world-tab-ic">${icon(w.id, 20)}${w.open ? '' : `<i class="world-tab-lock">${icon('lock', 11)}</i>`}</span>
            <span class="world-tab-text"><b>${biomeById(w.id).name}</b><small>${icon('star', 12)} ${w.open ? `${got(w.id)}/${n}` : `${w.gate} to open`}</small></span>
          </button>`;
        })
        .join('');

    const page = () => {
      const w = worlds.find((x) => x.id === current)!;
      const b = biomeById(current);
      const items = inWorld(current);
      const lock = w.open
        ? ''
        : `<div class="world-lock">
            <span class="world-lock-ic">${icon('lock', 20)}</span>
            <div class="world-lock-body">
              <p>Collect <b>${w.gate - total}</b> more puzzle stars to open ${b.name}</p>
              <div class="world-lock-bar"><i style="width:${Math.min(100, (total / Math.max(1, w.gate)) * 100).toFixed(1)}%"></i></div>
            </div>
            <span class="world-lock-count">${icon('star', 14)} ${total} / ${w.gate}</span>
          </div>`;
      return `<section class="chapter puzzles" data-world="${current}">
          <header class="chapter-head">
            <span class="chapter-icon">${icon(current, 26)}</span>
            <div><h3>${b.name}</h3><p>${items.length} puzzles</p></div>
            <span class="pill">${icon('star', 14)} ${got(current)} / ${items.length * 3}</span>
          </header>
          ${lock}
          <div class="level-grid">${items.map(([p, i], k) => card(p, i, w.open, k)).join('')}</div>
        </section>`;
    };

    const overlay = h(
      'div',
      'screen levels-screen',
      `<div class="screen-inner">
        <div class="screen-head">
          <button class="btn icon-btn" data-back>${icon('chevronLeft')}</button>
          <h2>Fix the track</h2>
          <span class="pill big">${icon('star', 16)} ${total} / ${puzzles.length * 3}</span>
        </div>
        <p class="screen-sub">Each track is broken: draw what's missing, place rings, or erase what's in the way, then press Play. The less you use, the more stars.</p>
        <div class="world-tabs"></div>
        <div class="world-page"></div>
      </div>`,
    );
    const render = () => {
      overlay.querySelector('.world-tabs')!.innerHTML = tabs();
      overlay.querySelector('.world-page')!.innerHTML = page();
      overlay.querySelector('.world-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    };
    overlay.onclick = (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      ctx.click();
      if (btn.dataset.tab) {
        current = btn.dataset.tab as BiomeId;
        render();
        return;
      }
      closeOverlay(overlay);
      if (btn.dataset.back !== undefined) {
        resolve(null);
        return;
      }
      document.body.classList.remove('on-title');
      resolve(Number(btn.dataset.i));
    };
    document.body.append(overlay);
    render();
  });
}

/** Puzzle intro: the goals, the budget, and how this kind of puzzle is played. */
export function showPuzzleIntro(
  ctx: ScreenCtx,
  p: { number: number; name: string; tip: string; kind: PuzzleKind; budget: string; goals: [string, string]; types: LineType[]; stars: number; starsTotal: number },
): Promise<void> {
  return new Promise((resolve) => {
    const k = KINDS[p.kind];
    const goals = [p.goals[0], p.starsTotal > 1 ? `Collect all ${p.starsTotal} stars` : p.starsTotal ? 'Collect the star' : 'Finish without a crash', p.goals[1]];
    const overlay = h(
      'div',
      'modal intro',
      `<div class="card">
        <span class="badge dark">${icon(k.icon, 13)} Puzzle ${p.number} · ${k.name}</span>
        <h2>${p.name}</h2>
        <p>${p.tip}</p>
        <ul class="intro-goals">${goals.map((g, i) => `<li class="${i < p.stars ? 'done' : ''}">${icon('star', 18)}${g}</li>`).join('')}</ul>
        <div class="daily-facts">
          <span>${icon(k.icon, 15)} ${p.budget}</span>
          ${p.types.map((t) => `<span class="type-chip" style="--swatch:#${hex(LINE_COLORS[t])}"><i></i>${TYPE_NAME[t] ?? t}</span>`).join('')}
        </div>
        <ol class="puzzle-steps">${k.steps.map(([ic, text]) => `<li>${icon(ic, 16)} ${text}</li>`).join('')}</ol>
        <div class="actions"><button class="big-btn primary">${icon(k.icon, 18)} Start</button></div>
      </div>`,
    );
    overlay.onclick = (e) => {
      if (!(e.target as HTMLElement).closest('button') && e.target !== overlay) return;
      ctx.click();
      closeOverlay(overlay, 200);
      resolve();
    };
    document.body.append(overlay);
  });
}
