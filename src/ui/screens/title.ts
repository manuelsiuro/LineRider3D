import { TIMES, biomeById } from '../../world/worlds';
import { MOBILE, TOUCH, h } from '../dom';
import { icon } from '../icons';
import type { BiomeId, WorldConfig } from '../../world/worlds';
import type { DailyCard, ScreenCtx, TitleChoice, TitleMenu } from '../types';

/** Badge icon of each world (the logo follows the world on screen). */
export const BADGE: Record<BiomeId, string> = { alpine: 'snowflake', forest: 'forest', beach: 'beach', desert: 'desert', city: 'city', halloween: 'pumpkin', volcano: 'volcano', moon: 'moon' };

/** Title screen; resolves with the player's choice. */
export function showTitle(ctx: ScreenCtx, hasSave: boolean, stars: number, maxStars: number, daily: DailyCard, season: { stars: number; max: number } | null = null, next: { name: string; world: BiomeId; number: number; fresh: boolean } | null = null, menu: TitleMenu | null = null): Promise<TitleChoice> {
  document.body.classList.add('on-title');
  const m = menu;
  /** A menu entry: icon, name, a line of facts and, for progress, a thin bar. */
  const entry = (c: string, ic: string, label: string, sub: string, done: number | null = null) =>
    `<button class="big-btn menu-btn" data-c="${c}"${done !== null ? ` style="--done:${(Math.min(1, done) * 100).toFixed(1)}%"` : ''}><span class="menu-ic">${icon(ic, 18)}</span><span class="menu-text"><span class="menu-label">${label}</span>${sub ? `<small>${sub}</small>` : ''}</span>${icon('chevronRight', 16)}${done !== null ? '<i class="menu-bar"></i>' : ''}</button>`;
  return new Promise((resolve) => {
    const overlay = h(
      'div',
      'title-screen',
      `<div class="title-inner">
        <div class="logo">
          <div class="logo-mark" data-world="${ctx.world.biome}">${icon(BADGE[ctx.world.biome], 46)}</div>
          <h1>Line Rider<span>3D</span></h1>
          <p class="tagline">${season ? 'Draw it. Ride it. Get spooked.' : 'Draw it. Ride it. Wipe out in style.'}</p>
          <p class="title-world">${worldCaption(ctx.world)}</p>
        </div>
        <div class="title-actions">
          <button class="big-btn daily-btn play-card" data-c="levels" style="--done:${((stars / Math.max(1, maxStars)) * 100).toFixed(1)}%">
            <span class="daily-ic">${icon('play', 22)}</span>
            <span class="daily-text"><b>${next && !next.fresh ? 'Continue' : 'Play'}</b><small>${next ? `${next.fresh ? 'Start with' : 'Next'}: ${next.number}. ${next.name} · ${biomeById(next.world).name}` : 'Every level won · go for 3 stars'}</small></span>
            <span class="pill">${icon('star', 14)} ${stars}/${maxStars}</span>
          </button>
          <button class="big-btn daily-btn" data-c="daily">
            <span class="daily-ic">${icon('calendar', 20)}</span>
            <span class="daily-text"><b>Daily ride #${daily.number}</b><small>${daily.best > 0 ? `Today's best ${daily.best.toLocaleString()}` : `${daily.name} · new every day`}</small></span>
            ${daily.streak > 0 ? `<span class="pill streak" title="Days in a row">${icon('flame', 14)} ${daily.streak}</span>` : ''}
          </button>
          ${
            season
              ? `<button class="big-btn daily-btn season-btn" data-c="season">
            <span class="daily-ic">${icon('pumpkin', 22)}</span>
            <span class="daily-text"><b>Haunted Hollow</b><small>Halloween is here · ${season.max / 3} spooky levels</small></span>
            <span class="pill">${icon('star', 14)} ${season.stars}/${season.max}</span>
          </button>`
              : ''
          }
          <button class="big-btn daily-btn create-card" data-c="${hasSave ? 'create' : 'new'}">
            <span class="daily-ic">${icon('pencil', 22)}</span>
            <span class="daily-text"><b>${hasSave ? 'Continue my track' : 'Create a track'}</b><small>${hasSave ? 'Pick up where you left off' : 'Draw it, ride it, share it'}</small></span>
            ${icon('chevronRight', 18)}
          </button>
          <div class="title-row">
            ${entry('puzzles', 'pencil', 'Puzzles', m ? `${icon('star', 12)} ${m.puzzles.stars}/${m.puzzles.max}<span class="wide-only"> · ${m.puzzles.open} open</span>` : '', m ? m.puzzles.stars / m.puzzles.max : null)}
            ${hasSave ? entry('gallery', 'folder', 'My tracks', m ? `${m.tracks} saved` : '') : ''}
            ${entry('garage', 'garage', 'Garage', m ? `Riding the ${m.ride}` : '')}
            ${entry('wardrobe', 'sled', 'Wardrobe', m ? `${m.outfit.got}/${m.outfit.total} outfits` : '')}
            ${entry('trophies', 'trophy', 'Trophies', m ? `${m.trophies.got}/${m.trophies.total} unlocked` : '', m ? m.trophies.got / m.trophies.total : null)}
            ${entry('settings', 'gear', 'Settings', 'Sound &amp; camera')}
            ${onPhone() ? '' : entry('phone', 'phone', 'Play on phone', 'Scan a QR code')}
          </div>
        </div>
        <div class="title-foot">
          ${m ? `<button class="sound-toggle ${m.muted ? 'off' : ''}" data-sound aria-pressed="${!m.muted}">${icon(m.muted ? 'mute' : 'sound', 16)}<span>${m.muted ? 'Sound off' : 'Sound on'}</span></button>` : icon('sound', 16)}
          <span>Best with headphones${TOUCH ? '' : ' · mouse or touch'}</span>
        </div>
      </div>
      <span class="title-version">v${__APP_VERSION__}</span>`,
    );
    overlay.onclick = (e) => {
      const toggle = (e.target as HTMLElement).closest<HTMLElement>('[data-sound]');
      if (toggle && m) {
        const muted = m.toggleSound();
        toggle.classList.toggle('off', muted);
        toggle.setAttribute('aria-pressed', String(!muted));
        toggle.innerHTML = `${icon(muted ? 'mute' : 'sound', 16)}<span>${muted ? 'Sound off' : 'Sound on'}</span>`;
        if (!muted) ctx.click();
        return;
      }
      const c = (e.target as HTMLElement).closest('button')?.dataset.c as TitleChoice | undefined;
      if (!c) return;
      ctx.click();
      overlay.classList.add('leaving');
      if (c !== 'levels' && c !== 'season' && c !== 'puzzles' && c !== 'gallery' && c !== 'wardrobe' && c !== 'garage' && c !== 'settings' && c !== 'trophies' && c !== 'phone') document.body.classList.remove('on-title');
      setTimeout(() => overlay.remove(), 450);
      resolve(c);
    };
    document.body.append(overlay);
  });
}

/** Already on a phone or tablet: no need to offer the QR code. */
const onPhone = () => MOBILE || (TOUCH && matchMedia('(hover: none)').matches);

export function worldCaption(w: WorldConfig) {
  return `${icon(w.time, 15)}<span>${biomeById(w.biome).name}</span>·<span>${TIMES.find((t) => t.id === w.time)!.name}</span>`;
}
