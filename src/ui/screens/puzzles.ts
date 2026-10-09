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
    const card = (p: PuzzleCard, i: number, open: boolean) => `<button class="level-card puzzle-card ${open ? '' : 'locked'}" data-world="${p.world}" data-i="${i}" ${open ? '' : 'disabled'} style="animation-delay:${Math.min(i, 14) * 0.03}s">
          <span class="level-num">${open ? i + 1 : icon('lock', 20)}</span>
          <span class="level-badges"><span title="${KINDS[p.kind].name} puzzle">${icon(KINDS[p.kind].icon, 18)}</span></span>
          <span class="level-name">${p.name}</span>
          <span class="level-stars">${[0, 1, 2].map((k) => `<i class="${k < p.stars ? 'on' : ''}">${icon('star', 18)}</i>`).join('')}</span>
          <span class="level-best">${p.best ? `Best ${p.best} · par ${p.par}` : `Par ${p.par}`}</span>
        </button>`;
    const sections = worlds
      .map((w) => {
        const items = puzzles.map((p, i) => [p, i] as const).filter(([p]) => p.world === w.id);
        if (!items.length) return '';
        const b = biomeById(w.id);
        const got = items.reduce((n, [p]) => n + p.stars, 0);
        return `<section class="chapter puzzles" data-world="${w.id}">
          <header class="chapter-head">
            <span class="chapter-icon">${icon(w.open ? w.id : 'lock', 26)}</span>
            <div><h3>${b.name}</h3><p>${w.open ? `${items.length} puzzles` : `Collect ${w.gate - total} more puzzle stars to open (${total} / ${w.gate})`}</p></div>
            <span class="pill">${icon('star', 14)} ${got} / ${items.length * 3}</span>
          </header>
          <div class="level-grid">${items.map(([p, i]) => card(p, i, w.open)).join('')}</div>
        </section>`;
      })
      .join('');
    const overlay = h(
      'div',
      'screen',
      `<div class="screen-inner">
        <div class="screen-head">
          <button class="btn icon-btn" data-back>${icon('chevronLeft')}</button>
          <h2>Fix the track</h2>
          <span class="pill big">${icon('star', 16)} ${total} / ${puzzles.length * 3}</span>
        </div>
        <p class="screen-sub">Each track is broken: draw what's missing, place rings, or erase what's in the way, then press Play. The less you use, the more stars.</p>
        <div class="chapters">${sections}</div>
      </div>`,
    );
    overlay.onclick = (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      ctx.click();
      closeOverlay(overlay);
      if (btn.dataset.back !== undefined) {
        resolve(null);
        return;
      }
      document.body.classList.remove('on-title');
      resolve(Number(btn.dataset.i));
    };
    document.body.append(overlay);
    // Start at the furthest open world.
    const open = worlds.filter((w) => w.open && puzzles.some((p) => p.world === w.id));
    const focus: BiomeId | undefined = open[open.length - 1]?.id;
    if (focus && focus !== open[0]?.id) overlay.querySelector(`.chapter[data-world="${focus}"]`)?.scrollIntoView({ block: 'start' });
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
