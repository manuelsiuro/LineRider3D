import { biomeById } from '../../world/worlds';
import { closeOverlay, h } from '../dom';
import { icon } from '../icons';
import type { BiomeId } from '../../world/worlds';
import type { ScreenCtx, LevelCard } from '../types';

/** Level select, chapter by chapter; resolves with a level index, or null to go back. */
export function showLevels(ctx: ScreenCtx, levels: LevelCard[], stars: number): Promise<number | null> {
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
      ctx.click();
      if (btn.dataset.back !== undefined) {
        closeOverlay(overlay);
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
