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

export const button = (cls: string, html: string, title = '') => {
  const b = h('button', cls, html) as HTMLButtonElement;
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
