import { closeOverlay, h, hex } from '../dom';
import { padWords } from '../controls';
import { icon } from '../icons';
import type { ScreenCtx, VehicleCard } from '../types';

/** Ride picker with stats; the ride is previewed live behind the screen. */
export function showGarage(ctx: ScreenCtx, cards: VehicleCard[], selected: string, onPick: (id: string) => void, onPaint: (ride: string, paint: string) => VehicleCard[]): Promise<void> {
  return new Promise((resolve) => {
    const bars = (label: string, v: number) =>
      `<span class="stat"><span class="stat-label">${label}</span><span class="stat-bar">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= v ? 'on' : ''}"></i>`).join('')}</span></span>`;
    const render = (sel: string) =>
      cards
        .map(
          (c, i) => `<button class="ride-card ${c.id === sel ? 'active' : ''}" data-id="${c.id}" style="animation-delay:${i * 0.04}s">
            <span class="ride-icon">${icon(c.id, 40)}</span>
            <span class="ride-name">${c.name}${c.id === sel ? `<span class="ride-tag">${icon('check', 13)} Riding</span>` : ''}</span>
            <span class="ride-blurb">${padWords(c.blurb)}</span>
            <span class="ride-stats">${bars('Speed', c.stats.speed)}${bars('Grip', c.stats.grip)}${bars('Air', c.stats.air)}${bars('Tough', c.stats.toughness)}</span>
            <span class="ride-paints">
              <span class="ride-prog">${icon('trophy', 13)} ${c.progress.done}/${c.progress.total}</span>
              ${c.paints
                .map((p) => {
                  const bg = p.colors.length ? `background:linear-gradient(135deg,#${hex(p.colors[0])} 55%,#${hex(p.colors[1])} 55%)` : '';
                  return `<i class="paint ${p.id === c.paint ? 'on' : ''} ${p.unlocked ? '' : 'locked'} ${p.colors.length ? '' : 'paint-outfit'}" data-ride="${c.id}" data-paint="${p.id}" title="${p.unlocked ? p.name : `${p.name}: complete ${p.need} ride challenge${p.need > 1 ? 's' : ''}`}" style="${bg}">${p.unlocked ? '' : icon('lock', 11)}</i>`;
                })
                .join('')}
            </span>
          </button>`,
        )
        .join('');
    const overlay = h(
      'div',
      'screen garage',
      `<div class="screen-inner">
        <div class="screen-head">
          <button class="btn icon-btn" data-back>${icon('chevronLeft')}</button>
          <h2>Garage</h2>
        </div>
        <p class="screen-sub">Pick your ride. Every level works with every ride, and each one keeps its own best run.</p>
        <div class="ride-grid">${render(selected)}</div>
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
      const paint = (e.target as HTMLElement).closest('.paint') as HTMLElement | null;
      if (paint) {
        if (paint.classList.contains('locked')) {
          ctx.flash(paint.title);
          return;
        }
        cards = onPaint(paint.dataset.ride!, paint.dataset.paint!);
        selected = paint.dataset.ride!;
        onPick(selected);
        rerender(selected);
        return;
      }
      const id = btn.dataset.id;
      if (!id) return;
      selected = id;
      onPick(id);
      rerender(id);
    };
    const grid = overlay.querySelector<HTMLElement>('.ride-grid')!;
    // On phones the cards are a sideways carousel: keep its place when a pick redraws it.
    const rerender = (sel: string) => {
      const x = grid.scrollLeft;
      grid.innerHTML = render(sel);
      grid.scrollLeft = x;
    };
    document.body.append(overlay);
    grid.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  });
}
