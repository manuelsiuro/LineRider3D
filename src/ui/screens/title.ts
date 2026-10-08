import { TIMES, biomeById } from '../../world/worlds';
import { h } from '../dom';
import { icon } from '../icons';
import type { BiomeId, WorldConfig } from '../../world/worlds';
import type { DailyCard, ScreenCtx, TitleChoice } from '../types';

/** Badge icon of each world (the logo follows the world on screen). */
export const BADGE: Record<BiomeId, string> = { alpine: 'snowflake', forest: 'forest', beach: 'beach', desert: 'desert', city: 'city' };

/** Title screen; resolves with the player's choice. */
export function showTitle(ctx: ScreenCtx, hasSave: boolean, stars: number, maxStars: number, daily: DailyCard): Promise<TitleChoice> {
  document.body.classList.add('on-title');
  return new Promise((resolve) => {
    const overlay = h(
      'div',
      'title-screen',
      `<div class="title-inner">
        <div class="logo">
          <div class="logo-mark" data-world="${ctx.world.biome}">${icon(BADGE[ctx.world.biome], 46)}</div>
          <h1>Line Rider<span>3D</span></h1>
          <p class="tagline">Draw it. Ride it. Wipe out in style.</p>
          <p class="title-world">${worldCaption(ctx.world)}</p>
        </div>
        <div class="title-actions">
          <button class="big-btn primary" data-c="levels">${icon('play', 20)} Play <span class="pill">${icon('star', 14)} ${stars}/${maxStars}</span></button>
          <button class="big-btn daily-btn" data-c="daily">
            <span class="daily-ic">${icon('calendar', 20)}</span>
            <span class="daily-text"><b>Daily ride #${daily.number}</b><small>${daily.best > 0 ? `Today's best ${daily.best.toLocaleString()}` : `${daily.name} · new every day`}</small></span>
            ${daily.streak > 0 ? `<span class="pill streak" title="Days in a row">${icon('flame', 14)} ${daily.streak}</span>` : ''}
          </button>
          <button class="big-btn secondary" data-c="${hasSave ? 'create' : 'new'}">${icon('pencil', 20)} ${hasSave ? 'Continue my track' : 'Create a track'}</button>
          <div class="title-row">
            <button class="big-btn menu-btn" data-c="puzzles"><span class="menu-ic">${icon('pencil', 18)}</span><span class="menu-label">Puzzles</span>${icon('chevronRight', 16)}</button>
            ${hasSave ? `<button class="big-btn menu-btn" data-c="gallery"><span class="menu-ic">${icon('folder', 18)}</span><span class="menu-label">My tracks</span>${icon('chevronRight', 16)}</button>` : ''}
            <button class="big-btn menu-btn" data-c="garage"><span class="menu-ic">${icon('garage', 18)}</span><span class="menu-label">Garage</span>${icon('chevronRight', 16)}</button>
            <button class="big-btn menu-btn" data-c="wardrobe"><span class="menu-ic">${icon('sled', 18)}</span><span class="menu-label">Wardrobe</span>${icon('chevronRight', 16)}</button>
            <button class="big-btn menu-btn" data-c="trophies"><span class="menu-ic">${icon('trophy', 18)}</span><span class="menu-label">Trophies</span>${icon('chevronRight', 16)}</button>
            <button class="big-btn menu-btn" data-c="settings"><span class="menu-ic">${icon('gear', 18)}</span><span class="menu-label">Settings</span>${icon('chevronRight', 16)}</button>
          </div>
        </div>
        <p class="title-foot">${icon('sound', 16)} Best with sound on · works with mouse and touch</p>
      </div>`,
    );
    overlay.onclick = (e) => {
      const c = (e.target as HTMLElement).closest('button')?.dataset.c as TitleChoice | undefined;
      if (!c) return;
      ctx.click();
      overlay.classList.add('leaving');
      if (c !== 'levels' && c !== 'puzzles' && c !== 'gallery' && c !== 'wardrobe' && c !== 'garage' && c !== 'settings' && c !== 'trophies') document.body.classList.remove('on-title');
      setTimeout(() => overlay.remove(), 450);
      resolve(c);
    };
    document.body.append(overlay);
  });
}

export function worldCaption(w: WorldConfig) {
  return `${icon(w.time, 15)}<span>${biomeById(w.biome).name}</span>·<span>${TIMES.find((t) => t.id === w.time)!.name}</span>`;
}
