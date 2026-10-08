import { closeOverlay, h } from '../dom';
import { icon } from '../icons';
import type { ScreenCtx, OutfitCard } from '../types';

/** Outfit picker with live preview on Bosh. */
export function showWardrobe(ctx: ScreenCtx, outfits: OutfitCard[], stars: number, selected: string, onPick: (id: string) => void): Promise<void> {
  return new Promise((resolve) => {
    const render = (sel: string) =>
      outfits
        .map((o) => {
          const unlocked = o.unlocked;
          const swatch = o.colors.map((c) => `<i style="background:#${c.toString(16).padStart(6, '0')}"></i>`).join('');
          return `<button class="outfit ${o.id === sel ? 'active' : ''} ${unlocked ? '' : 'locked'}" data-id="${o.id}" ${unlocked ? '' : 'disabled'}>
            <span class="swatches">${swatch}</span>
            <span class="outfit-name">${o.name}</span>
            <span class="outfit-req">${unlocked ? (o.id === sel ? 'Wearing' : 'Wear') : o.world ? `${icon('lock', 13)} 3${icon('star', 13)} all ${o.world}` : `${icon('lock', 13)} ${o.stars} ${icon('star', 13)}`}</span>
          </button>`;
        })
        .join('');
    const overlay = h(
      'div',
      'screen wardrobe',
      `<div class="screen-inner">
        <div class="screen-head">
          <button class="btn icon-btn" data-back>${icon('chevronLeft')}</button>
          <h2>Wardrobe</h2>
          <span class="pill big">${icon('star', 16)} ${stars}</span>
        </div>
        <p class="screen-sub">Earn stars to unlock new looks for Bosh. Master a world (3 stars on all its levels) for its outfit.</p>
        <div class="outfit-grid">${render(selected)}</div>
      </div>`,
    );
    overlay.onclick = (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      ctx.click();
      if (btn.dataset.back !== undefined) {
        closeOverlay(overlay);
        resolve();
        return;
      }
      const id = btn.dataset.id;
      if (!id) return;
      onPick(id);
      // On phones the outfits are a sideways carousel: keep its place when a pick redraws it.
      const x = grid.scrollLeft;
      grid.innerHTML = render(id);
      grid.scrollLeft = x;
    };
    const grid = overlay.querySelector<HTMLElement>('.outfit-grid')!;
    document.body.append(overlay);
    grid.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  });
}
