import { TOUCH } from './dom';
import { icon } from './icons';
import type { Controls } from './types';

const KEYCAP = { left: '←', right: '→', up: '↑', jump: 'Space' };
const PADNAME = { left: 'Brake', right: 'Push', up: 'Spin', jump: 'Jump' };

/** Tips and blurbs name keys (← → ↑); on touch they name the on-screen buttons instead. */
export function padWords(text: string) {
  if (!TOUCH) return text;
  const pad = (k: string) => PADNAME[k === '←' ? 'left' : k === '→' ? 'right' : 'up'];
  return (
    text
      // "Brake (←)" would read "Brake (Brake)": keep the word, bold.
      .replace(/(\w+) \(([←→↑])\)/g, (all, word: string, k: string) => (word.toLowerCase() === pad(k).toLowerCase() ? `<b>${word}</b>` : all))
      .replace(/[←→↑]/g, (k) => `<b>${pad(k)}</b>`)
  );
}

/** The controls panel of an intro card. */
export function controlsHtml(c: Controls) {
  const row = (title: string, ic: string, items: Controls['ground']) =>
    `<div class="ctl-group"><span class="ctl-title">${icon(ic, 14)} ${title}</span><div class="ctl-items">${items
      .map((it) => {
        // Touch: a little copy of the on-screen pad, then what it does (once, if that differs).
        if (c.touch) {
          const pad = PADNAME[it.key];
          const ic = icon(it.key === 'up' ? 'replay' : it.key === 'jump' ? 'chevronUp' : it.key === 'left' ? 'chevronLeft' : 'chevronRight', 14);
          return `<span class="ctl"><span class="pad-chip ${it.key}">${ic}${pad}</span>${it.label !== pad ? `<span>${it.label}</span>` : ''}</span>`;
        }
        return `<span class="ctl"><kbd class="key ${it.key}">${KEYCAP[it.key]}</kbd><span>${it.label}</span></span>`;
      })
      .join('')}</div></div>`;
  return `${row('On the ground', 'sled', c.ground)}${row('In the air', 'replay', c.air)}<p class="ctl-note">${icon('target', 13)} ${c.note}</p>`;
}
