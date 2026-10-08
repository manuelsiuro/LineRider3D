import { h } from '../dom';
import { icon } from '../icons';

/**
 * "A new version is ready" banner. Waits until no run is playing; Restart
 * switches to the new version, Later hides it until the next launch.
 */
export function showUpdate(version: string | null, restart: () => void) {
  if (document.querySelector('.update-banner')) return;
  const el = h(
    'div',
    'update-banner',
    `<span class="update-ic">${icon('download', 20)}</span>
     <span class="update-text"><b>New version${version ? ` v${version}` : ''} is ready</b><small>Restart to get the latest rides and fixes.</small></span>
     <button class="big-btn primary small-btn" data-u="restart">Restart</button>
     <button class="btn icon-btn flat" data-u="later" aria-label="Later">${icon('close', 18)}</button>`,
  );
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('[data-u]') as HTMLElement | null;
    if (!b) return;
    if (b.dataset.u === 'restart') {
      b.textContent = 'Restarting…';
      restart();
    } else {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 300);
    }
  };
  // Never during a ride: show it once the run stops.
  const show = () => {
    if (document.body.classList.contains('is-playing')) return setTimeout(show, 1500);
    document.body.append(el);
  };
  show();
}
