import { BIOMES } from '../../world/worlds';
import { TOUCH, closeOverlay, h } from '../dom';
import { icon } from '../icons';
import type { ScreenCtx } from '../types';
import { BADGE } from './title';

/** How to play: a short visual walkthrough, one idea per page. */
export function showHelp(ctx: ScreenCtx) {
  const cap = (k: string, cls = '') => `<kbd class="key big ${cls}">${k}</kbd>`;
  const pages: { title: string; art: string; text: string }[] = [
    {
      title: 'Draw a track',
      art: `<svg class="help-art" viewBox="0 0 320 150" aria-hidden="true">
          <defs><pattern id="hg" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#d6e1ee" stroke-width="1"/></pattern></defs>
          <rect width="320" height="150" rx="18" fill="url(#hg)"/>
          <path d="M24 34 C 90 40, 110 118, 190 112 S 280 70, 300 88" fill="none" stroke="#2f7fd8" stroke-width="12" stroke-linecap="round"/>
          <path d="M24 30 C 90 36, 110 114, 190 108 S 280 66, 300 84" fill="none" stroke="#9fd0ff" stroke-width="3" stroke-linecap="round"/>
          <circle cx="24" cy="34" r="9" fill="#ffffff" stroke="#ff8a3d" stroke-width="4"/>
          <g transform="translate(286 52) rotate(35)"><rect x="-6" y="-26" width="12" height="34" rx="3" fill="#ffc23d"/><path d="M-6 8 0 20 6 8Z" fill="#f2c9a0"/><rect x="-6" y="-30" width="12" height="6" rx="2" fill="#f0529c"/></g>
        </svg>
        <div class="help-chips">${(
          [
            ['#2f7fd8', 'Track'],
            ['#e0433a', 'Boost'],
            ['#5ec8e6', 'Ice'],
            ['#f0529c', 'Bouncy'],
          ] as const
        )
          .map(([c, n]) => `<span><i style="background:${c}"></i>${n}</span>`)
          .join('')}</div>`,
      text: 'Drag to draw. The <b>colored side</b> is the floor, so draw <b>left to right</b>. Start on the end of a track (orange ring) to join them.',
    },
    {
      title: 'Watch Bosh ride',
      art: `<div class="help-play">
          <span class="help-play-btn">${icon('play', 40)}</span>
          <div class="help-timeline"><i></i><b></b></div>
          ${TOUCH ? '' : `<div class="help-keys-row">${cap('Space')}<span>play / pause</span></div>`}
        </div>`,
      text: 'Press <b>Play</b>. Drag the timeline to rewind, try slow-mo and other cameras, then fix your track and go again.',
    },
    {
      title: 'Take control',
      art: `<div class="help-arrows">
          <div class="arrow-cluster">
            <span class="up">${cap(TOUCH ? icon('replay', 22) : '↑', 'up')}<small>Spin</small></span>
            <span class="left">${cap(TOUCH ? icon('chevronLeft', 24) : '←', 'left')}<small>Brake</small></span>
            <span class="right">${cap(TOUCH ? icon('chevronRight', 24) : '→', 'right')}<small>Push</small></span>
          </div>
          <div class="air-hint">${icon('replay', 16)} In the air, ${TOUCH ? '<b>Brake</b> and <b>Push</b>' : '<b>←</b> and <b>→</b>'} flip</div>
        </div>`,
      text: TOUCH
        ? 'Turn on <b>rider mode</b> (the gamepad button) and steer Bosh with the buttons at the bottom of the screen. <b>Let go before landing</b> and touch down flat for a Perfect.'
        : 'Turn on <b>rider mode</b> to steer Bosh. <b>Let go before landing</b> and touch down flat for a Perfect.',
    },
    {
      title: 'Rides and worlds',
      art: `<div class="help-explore">
          <div class="row">${['sled', 'skis', 'snowboard', 'bike', 'moto', 'buggy'].map((v) => `<span class="ride">${icon(v, 24)}</span>`).join('')}</div>
          <div class="row">${BIOMES.map((b) => `<span class="world" data-world="${b.id}">${icon(BADGE[b.id], 22)}</span>`).join('')}</div>
        </div>`,
      text: 'Pick one of six rides in the <b>Garage</b>. In the editor, <b>World</b> sets the landscape, time of day and weather of your track.',
    },
    // Touch has no keyboard: the last page lists the gestures and buttons instead.
    TOUCH ? gesturesPage() : {
      title: 'Shortcuts',
      art: `<div class="help-short">
          ${keyGroup('Play', 'play', [
            [['Space'], 'Play'],
            [['Esc'], 'Pause'],
            [['C'], 'Camera'],
            [['F'], 'Find Bosh'],
            [['V'], 'Next ride'],
            [['P'], 'Photo'],
          ])}
          ${keyGroup('Build', 'pencil', [
            [['Q'], 'Pencil'],
            [['W'], 'Line'],
            [['X'], 'Select'],
            [['E'], 'Eraser'],
            [['T'], 'Test here'],
            [['G'], 'World'],
            [['Ctrl', 'Z'], 'Undo'],
          ])}
        </div>`,
      text: 'Right-drag to orbit, wheel to zoom. On touch: one finger draws, two fingers orbit and zoom.',
    },
  ];
  const overlay = h(
    'div',
    'modal',
    `<div class="card help" data-pager>
      <div class="help-pages">${pages
        .map(
          (p, i) => `<section class="help-page" data-page="${i}">
            <span class="help-step">${i < pages.length - 1 ? `Step ${i + 1} of ${pages.length - 1}` : 'Reference'}</span>
            <h2>${p.title}</h2>
            <div class="help-visual">${p.art}</div>
            <p class="help-text">${p.text}</p>
          </section>`,
        )
        .join('')}</div>
      <div class="help-foot">
        <div class="help-dots">${pages.map((_, i) => `<button class="dot" data-go="${i}" aria-label="Page ${i + 1}"></button>`).join('')}</div>
        <div class="actions">
          <button class="big-btn ghost" data-nav="-1">${icon('chevronLeft', 18)} Back</button>
          <button class="big-btn primary" data-nav="1">Next ${icon('chevronRight', 18)}</button>
        </div>
      </div>
    </div>`,
  );
  let page = 0;
  const back = overlay.querySelector('[data-nav="-1"]') as HTMLButtonElement;
  const next = overlay.querySelector('[data-nav="1"]') as HTMLButtonElement;
  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    closeOverlay(overlay, 200);
  };
  const show = (i: number) => {
    page = Math.max(0, Math.min(pages.length - 1, i));
    overlay.querySelectorAll<HTMLElement>('.help-page').forEach((el, k) => el.classList.toggle('on', k === page));
    overlay.querySelectorAll('.dot').forEach((el, k) => el.classList.toggle('on', k === page));
    back.style.visibility = page === 0 ? 'hidden' : 'visible';
    // The last tutorial step starts riding; the shortcuts page is only a reference.
    next.innerHTML = page >= pages.length - 2 ? "Let's ride!" : `Next ${icon('chevronRight', 18)}`;
  };
  const onKey = (e: KeyboardEvent) => {
    if (!overlay.isConnected) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopImmediatePropagation();
      ctx.click();
      show(page + (e.key === 'ArrowRight' ? 1 : -1));
    } else if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      close();
    }
  };
  window.addEventListener('keydown', onKey, true);
  overlay.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (e.target === overlay) return close();
    if (!b) return;
    ctx.click();
    if (b.dataset.go) return show(Number(b.dataset.go));
    if (b.dataset.nav === '-1') return show(page - 1);
    if (page >= pages.length - 2) return close();
    show(page + 1);
  };
  show(0);
  document.body.append(overlay);
}

/** The touch reference page: each control's icon instead of a key. */
function gesturesPage() {
  const group = (title: string, ic: string, items: [string, string][]) =>
    `<section class="key-group"><h4>${icon(ic, 14)} ${title}</h4><div class="key-list">${items
      .map(([i, label]) => `<span class="key-item"><span class="caps"><kbd class="key">${icon(i, 15)}</kbd></span><span>${label}</span></span>`)
      .join('')}</div></section>`;
  return {
    title: 'Gestures',
    art: `<div class="help-short">
          ${group('Build', 'pencil', [
            ['pencil', 'One finger draws'],
            ['move', 'Two fingers orbit and zoom'],
            ['select', '<b>Add</b> picks several lines'],
            ['test', '<b>Test</b> rides from the centre'],
            ['undo', 'Undo'],
          ])}
          ${group('Play', 'play', [
            ['play', 'Play / pause'],
            ['target', 'Find Bosh'],
            ['camera', 'Camera'],
            ['aperture', 'Photo'],
          ])}
        </div>`,
    text: 'The <b>Camera</b> tool orbits with one finger and pans with two. Tap the active tool again to fold its options away.',
  };
}

/** A titled block of key caps for the help card. */
export function keyGroup(title: string, ic: string, items: [string[], string][]) {
  const cap = (k: string) => `<kbd class="key ${k.length > 1 ? 'wide' : ''}">${k}</kbd>`;
  return `<section class="key-group"><h4>${icon(ic, 14)} ${title}</h4><div class="key-list">${items
    .map(([keys, label]) => `<span class="key-item"><span class="caps">${keys.map(cap).join(keys[0] === 'Ctrl' ? '<i>+</i>' : '<i>/</i>')}</span>${label}</span>`)
    .join('')}</div></section>`;
}
