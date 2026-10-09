/** Small DOM helpers shared by the HUD and the screens. */

export const hex = (n: number) => n.toString(16).padStart(6, '0');

/** Writes text only when it changed (the HUD updates every frame). */
export function setText(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text;
}

/** Is a menu, card or screen covering the game? */
export function overlayOpen() {
  return document.querySelector('.modal, .screen, .summary, .title-screen, .photo-bar') !== null;
}

export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
};

const ua = navigator.userAgent;
/** A phone or tablet by its own word (some, like a Samsung with an S Pen, report a fine pointer). */
export const MOBILE =
  /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
  ((navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile ?? false) ||
  // iPadOS asks for desktop sites and says "Macintosh", but has a touch screen.
  (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

/** Phones and tablets: no keyboard, no hover. Set once (the `touch` class on body mirrors it). */
export const TOUCH = MOBILE || matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', TOUCH);

/** Drops a trailing shortcut like " (Ctrl+Z)" or " (P)" on touch, where there's no keyboard. */
export const keyless = (title: string) =>
  TOUCH ? title.replace(/\s*\((?:Ctrl|⌘|Esc|Space|Del|[A-Z](?=[ +)])|V to switch)[^)]*\)$/, '') : title;

export const button = (cls: string, html: string, title = '') => {
  const b = h('button', cls, html) as HTMLButtonElement;
  title = keyless(title);
  if (title) {
    b.title = title;
    b.setAttribute('aria-label', title);
  }
  return b;
};

/** One world unit is about 0.6 m (Bosh's sled is 1.75 units long). */
export const METERS = 0.6;
export const KMH = 3.6 * METERS;

/** Fades an overlay out, then removes it. */
export function closeOverlay(el: HTMLElement, ms = 250) {
  el.classList.add('leaving');
  setTimeout(() => el.remove(), ms);
}

/**
 * Makes a sideways row of cards easy to scroll with a mouse: arrow buttons over its ends
 * (hidden at either end, and on touch screens) and the vertical wheel scrolling it sideways.
 * Wraps the row in a `.carousel` element.
 */
export function carousel(row: HTMLElement, arrow: (dir: 'left' | 'right') => string) {
  const wrap = document.createElement('div');
  wrap.className = 'carousel';
  row.replaceWith(wrap);
  const prev = document.createElement('button');
  prev.className = 'carousel-arrow prev';
  prev.setAttribute('aria-label', 'Scroll left');
  prev.innerHTML = arrow('left');
  const next = document.createElement('button');
  next.className = 'carousel-arrow next';
  next.setAttribute('aria-label', 'Scroll right');
  next.innerHTML = arrow('right');
  wrap.append(prev, row, next);
  const update = () => {
    prev.disabled = row.scrollLeft <= 4;
    next.disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
  };
  const page = (dir: number) => row.scrollBy({ left: dir * row.clientWidth * 0.8, behavior: 'smooth' });
  prev.onclick = (e) => {
    e.stopPropagation();
    page(-1);
  };
  next.onclick = (e) => {
    e.stopPropagation();
    page(1);
  };
  row.addEventListener('scroll', update, { passive: true });
  row.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || row.scrollWidth <= row.clientWidth) return;
      e.preventDefault();
      row.scrollLeft += e.deltaY;
    },
    { passive: false },
  );
  addEventListener('resize', update);
  requestAnimationFrame(update);
  return update;
}
