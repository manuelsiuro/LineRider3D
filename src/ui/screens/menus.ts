import { TOUCH, closeOverlay, h, keyless } from '../dom';
import { icon } from '../icons';
import type { ScreenCtx, PauseChoice, SettingsView } from '../types';
import { confirm } from './dialogs';

/** Photo mode bar: field of view, snap and exit. Resolves on exit. */
export interface PhotoOptions {
  fov: number;
  onFov(fov: number): void;
  onSnap(): void;
  /** Next time of day / weather; return the new label (icon id and name). */
  cycleTime(): { icon: string; name: string };
  cycleWeather(): { icon: string; name: string };
  time: { icon: string; name: string };
  weather: { icon: string; name: string };
  /** Hides Bosh (and his ghost) for scenery shots; returns whether hidden. */
  toggleRider(): boolean;
}

/** Photo mode bar: frame, light and weather, then snap. */
export function showPhotoMode(ctx: ScreenCtx, o: PhotoOptions): Promise<void> {
  return new Promise((resolve) => {
    const look = (l: { icon: string; name: string }) => `${icon(l.icon, 16)}<span>${l.name}</span>`;
    const bar = h(
      'div',
      'photo-bar',
      `<span class="photo-hint">Drag to orbit · ${TOUCH ? 'pinch' : 'scroll'} to zoom</span>
       <label class="photo-fov">${icon('camera', 16)}<input type="range" min="20" max="90" value="${Math.round(o.fov)}" aria-label="Field of view"></label>
       <button class="chip photo-opt" data-a="time" title="${keyless('Time of day (T)')}">${look(o.time)}</button>
       <button class="chip photo-opt" data-a="weather" title="${keyless('Weather (W)')}">${look(o.weather)}</button>
       <button class="chip photo-opt" data-a="rider" title="${keyless('Hide Bosh (H)')}">${icon('eye', 16)}<span>Bosh</span></button>
       <button class="big-btn primary" data-a="snap">${icon('aperture', 18)} Snap</button>
       <button class="big-btn ghost" data-a="exit">Done</button>`,
    );
    const act = (a: string | undefined) => {
      if (a === 'snap') o.onSnap();
      else if (a === 'time') bar.querySelector('[data-a="time"]')!.innerHTML = look(o.cycleTime());
      else if (a === 'weather') bar.querySelector('[data-a="weather"]')!.innerHTML = look(o.cycleWeather());
      else if (a === 'rider') bar.querySelector('[data-a="rider"]')!.classList.toggle('off', o.toggleRider());
      else if (a === 'exit') exit();
      if (a && a !== 'snap') ctx.click();
    };
    const exit = () => {
      window.removeEventListener('keydown', onKey, true);
      closeOverlay(bar, 200);
      resolve();
    };
    const KEYS: Record<string, string> = { t: 'time', w: 'weather', h: 'rider' };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.key === 'Escape' || k === 'p') {
        e.stopImmediatePropagation();
        exit();
      } else if (e.code === 'Space') {
        e.preventDefault();
        e.stopImmediatePropagation();
        o.onSnap();
      } else if (KEYS[k] && !e.ctrlKey && !e.metaKey) {
        e.stopImmediatePropagation();
        act(KEYS[k]);
      }
    };
    window.addEventListener('keydown', onKey, true);
    bar.querySelector('input')!.addEventListener('input', (e) => o.onFov(Number((e.target as HTMLInputElement).value)));
    bar.onclick = (e) => act(((e.target as HTMLElement).closest('[data-a]') as HTMLElement | null)?.dataset.a);
    document.body.append(bar);
  });
}

/** Pause menu; resolves with the choice. */
export function showPause(ctx: ScreenCtx, title: string, canLevels: boolean): Promise<PauseChoice> {
  return new Promise((resolve) => {
    const overlay = h(
      'div',
      'modal pause',
      `<div class="card small" role="dialog" aria-label="Paused">
        <span class="badge dark">Paused</span>
        <h2>${title}</h2>
        <div class="pause-actions">
          <button class="big-btn primary" data-p="resume">${icon('play', 18)} Resume</button>
          <button class="big-btn secondary" data-p="restart">${icon('replay', 18)} Restart</button>
          <button class="big-btn ghost" data-p="settings">${icon('gear', 18)} Settings</button>
          ${canLevels ? `<button class="big-btn ghost" data-p="levels">${icon('star', 18)} Levels</button>` : ''}
          <button class="big-btn ghost" data-p="menu">${icon('home', 18)} Main menu</button>
        </div>
      </div>`,
    );
    const close = (c: PauseChoice) => {
      ctx.click();
      window.removeEventListener('keydown', onKey, true);
      closeOverlay(overlay, 200);
      resolve(c);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      close('resume');
    };
    window.addEventListener('keydown', onKey, true);
    overlay.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('[data-p]') as HTMLElement | null;
      if (b) close(b.dataset.p as PauseChoice);
      else if (e.target === overlay) close('resume');
    };
    document.body.append(overlay);
    (overlay.querySelector('[data-p="resume"]') as HTMLElement).focus();
  });
}

/** Settings screen; every change is applied live through `onChange`. */
export function showSettings(ctx: ScreenCtx, s: SettingsView, onChange: (s: SettingsView) => void, onReset: () => void): Promise<void> {
  return new Promise((resolve) => {
    const seg = (name: string, options: [string, string][], value: string) =>
      `<div class="seg" data-name="${name}">${options.map(([v, l]) => `<button class="${v === value ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const overlay = h(
      'div',
      'screen settings',
      `<div class="screen-inner">
        <div class="screen-head">
          <button class="btn icon-btn" data-back>${icon('chevronLeft')}</button>
          <h2>Settings</h2>
        </div>
        <div class="settings-list">
          <section>
            <h3>Graphics</h3>
            <div class="row"><span>Quality<small class="q-note">${s.qualityNote}</small></span>${seg('quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], s.quality)}</div>
          </section>
          <section>
            <h3>Sound</h3>
            <label class="row"><span>Effects</span><input type="range" min="0" max="100" data-name="sfxVolume" value="${Math.round(s.sfxVolume * 100)}"></label>
            <label class="row"><span>Music</span><input type="range" min="0" max="100" data-name="musicVolume" value="${Math.round(s.musicVolume * 100)}"></label>
          </section>
          <section>
            <h3>Camera</h3>
            <div class="row"><span>Default view</span>${seg('camera', [['cinematic', 'Cinema'], ['chase', 'Chase'], ['side', 'Side'], ['follow', 'Free']], s.camera)}</div>
            <label class="row"><span>Distance</span><input type="range" min="70" max="140" data-name="cameraDistance" value="${Math.round(s.cameraDistance * 100)}"></label>
            <label class="row toggle"><span>Reduced motion<small>No shake, zoom punches or flashes</small></span><input type="checkbox" data-name="reducedMotion" ${s.reducedMotion ? 'checked' : ''}><i></i></label>
          </section>
          <section>
            <h3>Progress</h3>
            <div class="row"><span>Reset stars, bests and ghosts</span><button class="big-btn danger small-btn" data-reset>Reset</button></div>
          </section>
        </div>
      </div>`,
    );
    const emit = () => onChange({ ...s });
    overlay.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      const name = el.dataset.name as keyof SettingsView | undefined;
      if (!name) return;
      if (el.type === 'checkbox') (s as unknown as Record<string, unknown>)[name] = el.checked;
      else (s as unknown as Record<string, unknown>)[name] = Number(el.value) / 100;
      emit();
    });
    overlay.onclick = async (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      if (btn.dataset.back !== undefined) {
        ctx.click();
        closeOverlay(overlay);
        resolve();
        return;
      }
      if (btn.dataset.reset !== undefined) {
        ctx.click();
        if (await confirm(ctx, 'Reset all progress?', 'Stars, best scores and ghosts on this device will be erased. This cannot be undone.', 'Reset')) {
          onReset();
          ctx.flash('Progress reset');
        }
        return;
      }
      const segEl = btn.closest('.seg') as HTMLElement | null;
      if (segEl) {
        ctx.click();
        segEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
        (s as unknown as Record<string, unknown>)[segEl.dataset.name!] = btn.dataset.v;
        emit();
      }
    };
    document.body.append(overlay);
  });
}
