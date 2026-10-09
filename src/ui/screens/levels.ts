import { biomeById } from '../../world/worlds';
import { closeOverlay, h } from '../dom';
import { icon } from '../icons';
import type { BiomeId } from '../../world/worlds';
import type { ScreenCtx, LevelCard, WorldTab } from '../types';

/**
 * Level select, one world at a time: a strip of world tabs (locked ones show the stars
 * they need), then the world's levels. Resolves with a level index, or null to go back.
 */
export function showLevels(ctx: ScreenCtx, levels: LevelCard[], worlds: WorldTab[], stars: number, focus?: BiomeId): Promise<number | null> {
  return new Promise((resolve) => {
    const inWorld = (w: BiomeId) => levels.map((l, i) => [l, i] as const).filter(([l]) => l.world === w);
    const got = (w: BiomeId) => inWorld(w).reduce((n, [l]) => n + l.stars, 0);
    // Start on the asked-for world, else the furthest one played in that isn't finished,
    // else the first.
    const open = worlds.filter((w) => w.open && inWorld(w.id).length);
    let current: BiomeId = focus ?? [...open].reverse().find((w) => got(w.id) > 0 && got(w.id) < inWorld(w.id).length * 3)?.id ?? open[0]?.id ?? worlds[0].id;

    const pips = (n: number) => `<span class="level-diff" title="Difficulty ${n} of 5">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span>`;
    const card = (l: LevelCard, i: number, k: number, worldIsOpen: boolean) => `<button class="level-card ${l.unlocked ? '' : 'locked'}" data-world="${l.world}" data-i="${i}" ${l.unlocked ? '' : 'disabled'} style="animation-delay:${Math.min(k, 14) * 0.03}s">
          <span class="level-num">${l.unlocked ? i + 1 : icon('lock', 20)}</span>
          <span class="level-badges">${l.skill ? `<span title="Needs your controls">${icon('gamepad', 18)}</span>` : ''}${l.ride ? `<span title="Made for one ride">${icon(l.ride, 18)}</span>` : ''}</span>
          <span class="level-name">${l.name}</span>
          ${pips(l.difficulty)}
          <span class="level-stars">${[0, 1, 2].map((s) => `<i class="${s < l.stars ? 'on' : ''}">${icon('star', 18)}</i>`).join('')}${l.medal && l.unlocked ? `<b class="level-medal ${l.medal}" title="${l.medal} medal">${icon('medal', 16)}</b>` : ''}</span>
          <span class="level-best">${l.unlocked ? (l.score ? `Best ${l.score.toLocaleString()}` : 'Not played') : worldIsOpen ? `Star level ${i} to open` : 'Opens with the world'}</span>
        </button>`;

    const tabs = () =>
      worlds
        .filter((w) => inWorld(w.id).length)
        .map((w) => {
          const n = inWorld(w.id).length * 3;
          return `<button class="world-tab ${w.id === current ? 'active' : ''} ${w.open ? '' : 'locked'}" data-world="${w.id}" data-tab="${w.id}">
            <span class="world-tab-ic">${icon(w.id, 20)}${w.open ? '' : `<i class="world-tab-lock">${icon('lock', 11)}</i>`}</span>
            <span class="world-tab-text"><b>${biomeById(w.id).name}</b><small>${w.open ? `${icon('star', 12)} ${got(w.id)}/${n}` : `${icon('star', 12)} ${w.gate} to open`}</small></span>
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
              <p>Collect <b>${w.gate - stars}</b> more stars to open ${b.name}</p>
              <div class="world-lock-bar"><i style="width:${Math.min(100, (stars / Math.max(1, w.gate)) * 100).toFixed(1)}%"></i></div>
            </div>
            <span class="world-lock-count">${icon('star', 14)} ${stars} / ${w.gate}</span>
          </div>`;
      return `<section class="chapter" data-world="${current}">
          <header class="chapter-head">
            <span class="chapter-icon">${icon(current, 26)}</span>
            <div><h3>${b.name}</h3><p>${b.blurb}</p></div>
            <span class="pill">${icon('star', 14)} ${got(current)} / ${items.length * 3}</span>
          </header>
          ${lock}
          <div class="level-grid">${items.map(([l, i], k) => card(l, i, k, w.open)).join('')}</div>
        </section>`;
    };

    const overlay = h(
      'div',
      'screen levels-screen',
      `<div class="screen-inner">
        <div class="screen-head">
          <button class="btn icon-btn" data-back>${icon('chevronLeft')}</button>
          <h2>Levels</h2>
          <span class="pill big">${icon('star', 16)} ${stars} / ${levels.length * 3}</span>
        </div>
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
      if (btn.dataset.back !== undefined) {
        closeOverlay(overlay);
        resolve(null);
        return;
      }
      if (btn.dataset.tab) {
        current = btn.dataset.tab as BiomeId;
        render();
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
    render();
  });
}
