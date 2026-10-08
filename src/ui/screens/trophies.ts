import { closeOverlay, h } from '../dom';
import { icon } from '../icons';
import type { ScreenCtx, TrophyCard } from '../types';

/** Achievements and ride challenges. */
export function showTrophies(ctx: ScreenCtx, cards: TrophyCard[]): Promise<void> {
  return new Promise((resolve) => {
    const done = cards.filter((c) => c.unlocked).length;
    const groups = new Map<string, TrophyCard[]>();
    for (const c of cards) {
      const key = c.rideName ?? 'General';
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    const section = ([name, list]: [string, TrophyCard[]]) => `
      <section class="trophy-group">
        <h3>${list[0].ride ? icon(list[0].ride, 16) : icon('trophy', 16)} ${name}<span>${list.filter((c) => c.unlocked).length}/${list.length}</span></h3>
        <div class="trophy-grid">${list
          .map(
            (c) => `<div class="trophy ${c.unlocked ? 'on' : ''}">
              <span class="trophy-icon">${icon(c.unlocked ? 'trophy' : 'lock', 20)}</span>
              <span><b>${c.title}</b><small>${c.desc}</small></span>
            </div>`,
          )
          .join('')}</div>
      </section>`;
    const overlay = h(
      'div',
      'screen trophies',
      `<div class="screen-inner">
        <div class="screen-head">
          <button class="btn icon-btn" data-back>${icon('chevronLeft')}</button>
          <h2>Trophies</h2>
          <span class="pill big">${icon('trophy', 16)} ${done} / ${cards.length}</span>
        </div>
        <p class="screen-sub">Ride challenges unlock new paint jobs in the Garage.</p>
        ${[...groups.entries()].map(section).join('')}
      </div>`,
    );
    overlay.onclick = (e) => {
      const btn = (e.target as HTMLElement).closest('[data-back]');
      if (!btn) return;
      ctx.click();
      closeOverlay(overlay);
      resolve();
    };
    document.body.append(overlay);
  });
}
