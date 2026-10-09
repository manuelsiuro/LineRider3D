import { h } from '../dom';
import { icon } from '../icons';

/** What a tour step waits for. */
export type TourEvent = 'stroke' | 'piece' | 'orbit' | 'play';

export interface TourStep {
  text: string;
  /** What the bubble points at: an element, a point on screen, or nothing (centred). */
  at: () => Element | { x: number; y: number } | null;
  until: TourEvent;
}

export interface Tour {
  event(e: TourEvent): void;
  stop(): void;
}

/**
 * Coach marks for a first track: one small bubble at a time, pointing at what to try,
 * moving on by itself once it's done. Skip ends it.
 */
export function startTour(steps: TourStep[], finished: () => void): Tour {
  let i = 0;
  let raf = 0;
  const bubble = h('div', 'coach');
  document.body.append(bubble);

  const render = () => {
    const step = steps[i];
    bubble.innerHTML = `<span class="coach-step">${i + 1}/${steps.length}</span><p>${step.text}</p><button class="coach-skip" aria-label="Skip the tour">${icon('close', 14)}</button>`;
    bubble.querySelector('button')!.onclick = () => stop();
    bubble.classList.remove('coach-in');
    void bubble.offsetWidth;
    bubble.classList.add('coach-in');
  };

  const place = () => {
    const step = steps[i];
    const target = step?.at();
    const w = bubble.offsetWidth;
    const hgt = bubble.offsetHeight;
    let x = innerWidth / 2;
    let y = innerHeight * 0.3;
    let below = false;
    if (target instanceof Element) {
      const r = target.getBoundingClientRect();
      x = r.left + r.width / 2;
      // Point down at things low on screen, up at things high on screen.
      below = r.top < innerHeight / 2;
      y = below ? r.bottom + 14 : r.top - 14;
    } else if (target) {
      x = target.x;
      below = target.y < innerHeight / 2;
      y = below ? target.y + 30 : target.y - 30;
    }
    const left = Math.min(Math.max(12, x - w / 2), innerWidth - w - 12);
    const top = below ? y : y - hgt;
    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(Math.max(8, Math.min(top, innerHeight - hgt - 8)))}px`;
    bubble.style.setProperty('--arrow-x', `${Math.round(x - left)}px`);
    bubble.classList.toggle('below', below);
    raf = requestAnimationFrame(place);
  };

  const stop = () => {
    cancelAnimationFrame(raf);
    bubble.remove();
    finished();
  };

  render();
  place();
  return {
    event(e) {
      if (steps[i]?.until !== e) return;
      i++;
      if (i >= steps.length) stop();
      else render();
    },
    stop,
  };
}
