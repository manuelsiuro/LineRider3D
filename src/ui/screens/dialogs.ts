import { closeOverlay, h } from '../dom';
import { icon } from '../icons';
import type { ScreenCtx } from '../types';

/** In-game confirmation dialog. */
export function confirm(ctx: ScreenCtx, title: string, text: string, ok = 'OK'): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = h(
      'div',
      'modal',
      `<div class="card small">
        <h2>${title}</h2>
        <p>${text}</p>
        <div class="actions"><button class="big-btn ghost" data-v="0">Cancel</button><button class="big-btn primary" data-v="1">${ok}</button></div>
      </div>`,
    );
    overlay.onclick = (e) => {
      const v = (e.target as HTMLElement).closest('button')?.dataset.v;
      if (v === undefined && e.target !== overlay) return;
      ctx.click();
      closeOverlay(overlay, 200);
      resolve(v === '1');
    };
    document.body.append(overlay);
  });
}

/** Shows a link to copy by hand (when the clipboard isn't available). */
export function showLink(ctx: ScreenCtx, url: string, challenge: number) {
  const overlay = h(
    'div',
    'modal',
    `<div class="card small">
      <h2>${challenge ? 'Challenge a friend' : 'Share your track'}</h2>
      <p>${challenge ? `Send this link: your friend rides the same track and tries to beat <b>${challenge.toLocaleString()}</b> points.` : 'Anyone with this link can ride your track.'}</p>
      <input class="link-input" readonly value="${url}" />
      <div class="actions">
        <button class="big-btn ghost" data-a="close">Close</button>
        <button class="big-btn primary" data-a="copy">${icon('share', 18)} Copy link</button>
      </div>
    </div>`,
  );
  const input = overlay.querySelector('input')!;
  setTimeout(() => input.select(), 50);
  overlay.onclick = async (e) => {
    const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (btn?.dataset.a === 'copy') {
      ctx.click();
      input.select();
      let ok = false;
      try {
        await Promise.race([navigator.clipboard.writeText(url), new Promise((_, no) => setTimeout(no, 1500))]);
        ok = true;
      } catch {
        // Older browsers: copy the selected text.
        ok = document.execCommand?.('copy') ?? false;
      }
      btn.innerHTML = ok ? `${icon('check', 18)} Copied!` : 'Select & copy the link';
      return;
    }
    if (!btn && e.target !== overlay) return;
    closeOverlay(overlay, 200);
  };
  document.body.append(overlay);
}
