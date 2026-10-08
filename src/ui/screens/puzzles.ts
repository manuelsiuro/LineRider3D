import { LINE_COLORS, type LineType } from '../../track/types';
import { closeOverlay, h, hex } from '../dom';
import { icon } from '../icons';
import type { PuzzleCard, ScreenCtx } from '../types';

const TYPE_NAME: Partial<Record<LineType, string>> = { normal: 'Track', accel: 'Boost', bouncy: 'Bouncy', ice: 'Ice' };

/** Puzzle select; resolves with a puzzle index, or null to go back. */
export function showPuzzles(ctx: ScreenCtx, puzzles: PuzzleCard[]): Promise<number | null> {
  return new Promise((resolve) => {
    const total = puzzles.reduce((n, p) => n + p.stars, 0);
    const cards = puzzles
      .map(
        (p, i) => `<button class="level-card puzzle-card" data-i="${i}" style="animation-delay:${i * 0.04}s">
          <span class="level-num">${i + 1}</span>
          <span class="level-name">${p.name}</span>
          <span class="level-stars">${[0, 1, 2].map((k) => `<i class="${k < p.stars ? 'on' : ''}">${icon('star', 18)}</i>`).join('')}</span>
          <span class="level-best">${p.ink > 0 ? `Best ink ${p.ink.toFixed(1)} m · par ${p.par.toFixed(1)} m` : `Par ${p.par.toFixed(1)} m of ink`}</span>
        </button>`,
      )
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
        <section class="chapter puzzles">
          <header class="chapter-head">
            <span class="chapter-icon">${icon('pencil', 26)}</span>
            <div><h3>Puzzles</h3><p>Each track is broken. Draw what's missing with the ink you have, then press Play. Less ink, more stars.</p></div>
          </header>
          <div class="level-grid">${cards}</div>
        </section>
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
  });
}

/** Puzzle intro: the goal, the ink and the line types allowed. */
export function showPuzzleIntro(ctx: ScreenCtx, p: { number: number; name: string; tip: string; ink: number; par: number; types: LineType[]; stars: number; starsTotal: number }): Promise<void> {
  return new Promise((resolve) => {
    const goals = ['Reach the finish', p.starsTotal ? `Collect all ${p.starsTotal} star${p.starsTotal > 1 ? 's' : ''}` : 'Finish without a crash', `Use ${p.par.toFixed(1)} m of ink or less`];
    const overlay = h(
      'div',
      'modal intro',
      `<div class="card">
        <span class="badge dark">${icon('pencil', 13)} Puzzle ${p.number}</span>
        <h2>${p.name}</h2>
        <p>${p.tip}</p>
        <ul class="intro-goals">${goals.map((g, i) => `<li class="${i < p.stars ? 'done' : ''}">${icon('star', 18)}${g}</li>`).join('')}</ul>
        <div class="daily-facts">
          <span>${icon('pencil', 15)} ${p.ink.toFixed(1)} m of ink</span>
          ${p.types.map((t) => `<span class="type-chip" style="--swatch:#${hex(LINE_COLORS[t])}"><i></i>${TYPE_NAME[t] ?? t}</span>`).join('')}
        </div>
        <ol class="puzzle-steps">
          <li>${icon('pencil', 16)} Draw what's missing (left to right)</li>
          <li>${icon('play', 16)} Press Play to test it</li>
          <li>${icon('stop', 16)} Stop, fix, and try again</li>
        </ol>
        <div class="actions"><button class="big-btn primary">${icon('pencil', 18)} Start drawing</button></div>
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
