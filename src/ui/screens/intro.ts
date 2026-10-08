import { BIOMES, TIMES, WEATHERS, biomeById } from '../../world/worlds';
import { controlsHtml } from '../controls';
import { closeOverlay, h } from '../dom';
import { icon } from '../icons';
import type { BiomeId, WorldConfig } from '../../world/worlds';
import type { ScreenCtx, WorldPicker, RidePicker, Controls, MedalRow } from '../types';

/** World chips (landscape, time, weather) for an intro card. */
export function worldPicker(ctx: ScreenCtx, card: HTMLElement, picker: WorldPicker | undefined) {
  const slot = card.querySelector('.world-pick') as HTMLElement | null;
  if (!slot || !picker) return;
  let w = picker.value;
  const render = () => {
    const home = picker.home;
    const isHome = w.biome === home.biome && w.time === home.time && w.weather === home.weather;
    const weathers = WEATHERS.filter((x) => biomeById(w.biome).weathers.includes(x.id));
    slot.innerHTML = `<div class="world-row">${BIOMES.map(
      (b) => `<button class="world-chip ${b.id === w.biome ? 'active' : ''}" data-biome="${b.id}" title="${b.name}">${icon(b.id, 18)}<span>${b.name}</span>${b.id === home.biome ? '<i class="home-dot" title="Home world"></i>' : ''}</button>`,
    ).join('')}</div>
      <div class="world-row small">
        <div class="mini-seg">${TIMES.map((t) => `<button class="${t.id === w.time ? 'active' : ''}" data-time="${t.id}" title="${t.name}">${icon(t.id, 16)}</button>`).join('')}</div>
        <div class="mini-seg">${weathers.map((x) => `<button class="${x.id === w.weather ? 'active' : ''}" data-weather="${x.id}" title="${x.name}">${icon(x.id, 16)}</button>`).join('')}</div>
        <span class="world-label">${TIMES.find((t) => t.id === w.time)!.name} · ${WEATHERS.find((x) => x.id === w.weather)!.name}</span>
        ${isHome ? '' : `<button class="world-home" data-home>${icon('replay', 14)} Home</button>`}
      </div>`;
  };
  render();
  slot.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLElement | null;
    if (!b) return;
    e.stopPropagation();
    ctx.click();
    const d = b.dataset;
    const next: Partial<WorldConfig> =
      d.home !== undefined
        ? picker.home
        : d.biome
          ? { ...w, biome: d.biome as BiomeId, weather: d.biome === picker.home.biome ? picker.home.weather : biomeById(d.biome).weathers[0] }
          : d.time
            ? { ...w, time: d.time as WorldConfig['time'] }
            : { ...w, weather: d.weather as WorldConfig['weather'] };
    w = picker.onPick(next);
    render();
  });
}

/** Row of ride chips for an intro card (or the level's fixed ride). */
export function ridePicker(ctx: ScreenCtx, card: HTMLElement, ride: RidePicker | undefined, keysEl: HTMLElement | null) {
  const slot = card.querySelector('.ride-pick') as HTMLElement | null;
  if (!slot || !ride) return;
  const medalSlot = card.querySelector('.medal-pick') as HTMLElement | null;
  const medals = (id: string) => {
    if (medalSlot) medalSlot.innerHTML = medalRowHtml(ride.medals?.(id) ?? null);
  };
  medals(ride.selected);
  const render = (sel: string) => {
    if (ride.locked) {
      const o = ride.options.find((x) => x.id === sel)!;
      slot.innerHTML = `<span class="ride-chip active locked">${icon(o.id, 20)}<span>${o.name}</span></span><span class="ride-note">${icon('lock', 13)} ${ride.lockNote ?? "This level's ride"}</span>`;
      return;
    }
    slot.innerHTML = ride.options
      .map((o) => `<button class="ride-chip ${o.id === sel ? 'active' : ''}" data-ride="${o.id}" title="${o.name}">${icon(o.id, 20)}<span>${o.name}</span></button>`)
      .join('');
  };
  render(ride.selected);
  slot.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-ride]') as HTMLElement | null;
    if (!b) return;
    e.stopPropagation();
    ctx.click();
    const keys = ride.onPick(b.dataset.ride!);
    if (keysEl) keysEl.innerHTML = controlsHtml(keys);
    medals(b.dataset.ride!);
    render(b.dataset.ride!);
  });
}

/** Intro for a track opened from a share link. */
export function showSharedIntro(ctx: ScreenCtx, challenge: number, goals: string[], keys: Controls, ride?: RidePicker, world?: WorldPicker, racing = false): Promise<void> {
  return new Promise((resolve) => {
    const overlay = h(
      'div',
      'modal intro',
      `<div class="card">
        <span class="badge dark">${challenge ? 'Challenge' : 'Shared track'}</span>
        <h2>${challenge ? `Beat ${challenge.toLocaleString()} points!` : 'A friend shared a track'}</h2>
        <p>${challenge ? 'Your friend set this score on this track. Can you top it?' : 'Ride it, then edit it or make it your own.'}</p>
        ${racing ? `<p class="race-note">${icon('eye', 15)} Their ghost rides with you: race it!</p>` : ''}
        <ul class="intro-goals">${goals.map((g) => `<li>${icon('star', 18)}${g}</li>`).join('')}</ul>
        <div class="ride-pick"></div>
        <div class="world-pick"></div>
        <div class="keys controls">${controlsHtml(keys)}</div>
        <div class="actions"><button class="big-btn primary">${icon('play', 18)} Ride!</button></div>
      </div>`,
    );
    overlay.onclick = (e) => {
      if (!(e.target as HTMLElement).closest('button') && e.target !== overlay) return;
      ctx.click();
      closeOverlay(overlay, 200);
      resolve();
    };
    ridePicker(ctx, overlay, ride, overlay.querySelector('.keys'));
    worldPicker(ctx, overlay, world);
    document.body.append(overlay);
  });
}

/** Level intro card with its goals. */
export function showLevelIntro(ctx: ScreenCtx, number: number, name: string, tip: string, goals: string[], stars: number, keys: Controls, ride?: RidePicker, world?: WorldPicker): Promise<void> {
  return new Promise((resolve) => {
    const overlay = h(
      'div',
      'modal intro',
      `<div class="card">
        <span class="badge dark">Level ${number}</span>
        <h2>${name}</h2>
        <p>${tip}</p>
        <ul class="intro-goals">${goals.map((g, i) => `<li class="${i < stars ? 'done' : ''}">${icon('star', 18)}${g}</li>`).join('')}</ul>
        <div class="medal-pick"></div>
        <div class="ride-pick"></div>
        <div class="world-pick"></div>
        <div class="keys controls">${controlsHtml(keys)}</div>
        <div class="actions"><button class="big-btn primary">${icon('play', 18)} Ride!</button></div>
      </div>`,
    );
    overlay.onclick = (e) => {
      if (!(e.target as HTMLElement).closest('button') && e.target !== overlay) return;
      ctx.click();
      closeOverlay(overlay, 200);
      resolve();
    };
    ridePicker(ctx, overlay, ride, overlay.querySelector('.keys'));
    worldPicker(ctx, overlay, world);
    document.body.append(overlay);
  });
}

/** Intro for the daily ride: the same track, ride and world for everyone today. */
export function showDailyIntro(ctx: ScreenCtx, info: { number: number; name: string; date: string; challenge: number; best: number; streak: number; world: string; racing: boolean }, goals: string[], keys: Controls, ride?: RidePicker): Promise<void> {
  return new Promise((resolve) => {
    const overlay = h(
      'div',
      'modal intro',
      `<div class="card">
        <span class="badge dark daily">${icon('calendar', 13)} Daily ride #${info.number} · ${info.date}</span>
        <h2>${info.challenge ? `Beat ${info.challenge.toLocaleString()} points!` : info.name}</h2>
        <p>${info.challenge ? `A friend scored ${info.challenge.toLocaleString()} on ${info.name}. Can you top it?` : 'A new track every day, the same for everyone. Ride it as often as you like: your best score counts.'}</p>
        ${info.racing ? `<p class="race-note">${icon('eye', 15)} Their ghost rides with you: race it!</p>` : ''}
        <div class="daily-facts">
          <span>${icon('globe', 15)} ${info.world}</span>
          ${info.best > 0 ? `<span>${icon('trophy', 15)} Best ${info.best.toLocaleString()}</span>` : ''}
          ${info.streak > 0 ? `<span class="streak">${icon('flame', 15)} ${info.streak}-day streak</span>` : ''}
        </div>
        <ul class="intro-goals">${goals.map((g) => `<li>${icon('star', 18)}${g}</li>`).join('')}</ul>
        <div class="ride-pick"></div>
        <div class="keys controls">${controlsHtml(keys)}</div>
        <div class="actions"><button class="big-btn primary">${icon('play', 18)} Ride!</button></div>
      </div>`,
    );
    overlay.onclick = (e) => {
      if (!(e.target as HTMLElement).closest('button') && e.target !== overlay) return;
      ctx.click();
      closeOverlay(overlay, 200);
      resolve();
    };
    ridePicker(ctx, overlay, ride, overlay.querySelector('.keys'));
    document.body.append(overlay);
  });
}

const MEDAL_KEYS = ['bronze', 'silver', 'gold', 'dev'];

/** Medal targets for the selected ride; the ones already won are lit. */
function medalRowHtml(row: MedalRow | null) {
  if (!row) return '';
  const chips = row.times
    .map((t, i) => `<span class="medal-chip ${MEDAL_KEYS[i]} ${row.best > 0 && row.best <= t + 1e-6 ? 'got' : ''}" title="${MEDAL_KEYS[i]}">${icon('medal', 15)}${t.toFixed(1)}s</span>`)
    .join('');
  return `<div class="medal-row" title="Finish times on the level's home world">${chips}${row.best > 0 ? `<span class="medal-best">Best ${row.best.toFixed(2)}s</span>` : ''}</div>`;
}
