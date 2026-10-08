import qrcode from 'qrcode-generator';
import { closeOverlay, h } from '../dom';
import { icon } from '../icons';
import type { ScreenCtx } from '../types';

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/**
 * The address a phone can open: this page as is, or (when it's served to
 * this computer only) the dev server's address on the local network.
 */
async function phoneUrl(): Promise<{ url: string; lan: boolean } | null> {
  const page = location.origin + location.pathname;
  if (!LOCAL.test(location.hostname)) return { url: page, lan: false };
  try {
    const res = await fetch('/__lan');
    const urls = (await res.json()) as string[];
    // Prefer a home network address over VPN or virtual adapters.
    const best = urls.find((u) => /\/\/192\.168\./.test(u)) ?? urls.find((u) => /\/\/10\./.test(u)) ?? urls[0];
    if (!best) return null;
    return { url: new URL(location.pathname, best).href, lan: true };
  } catch {
    return null;
  }
}

/** The QR code as a crisp SVG (one path, quiet zone included). */
function qrSvg(text: string) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const m = 2;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#14243a"/></svg>`;
}

/** "Play on your phone": a QR code of the game's address. */
export function showPhone(ctx: ScreenCtx): Promise<void> {
  return new Promise((resolve) => {
    const overlay = h(
      'div',
      'modal',
      `<div class="card small phone-card">
        <h2>${icon('phone', 24)} Play on your phone</h2>
        <div class="qr-box"><div class="qr-wait"></div></div>
        <p class="phone-text">Scan with your phone's camera.</p>
        <input class="link-input" readonly />
        <div class="actions">
          <button class="big-btn ghost" data-a="copy">${icon('copy', 18)} Copy link</button>
          <button class="big-btn primary" data-a="close">Done</button>
        </div>
      </div>`,
    );
    const box = overlay.querySelector('.qr-box')!;
    const text = overlay.querySelector('.phone-text')!;
    const input = overlay.querySelector('input')!;
    const copy = overlay.querySelector<HTMLButtonElement>('[data-a="copy"]')!;
    copy.disabled = true;
    phoneUrl().then((found) => {
      if (!found) {
        box.innerHTML = `<div class="qr-none">${icon('phone', 40)}</div>`;
        text.innerHTML = 'No network address found. Start the game with <b>npm run dev</b> and connect this computer to Wi‑Fi.';
        input.remove();
        copy.remove();
        return;
      }
      box.innerHTML = qrSvg(found.url);
      input.value = found.url;
      copy.disabled = false;
      if (found.lan) text.innerHTML = 'Scan with your phone’s camera. Your phone must be on the <b>same Wi‑Fi</b> as this computer.';
    });
    overlay.onclick = async (e) => {
      const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (btn?.dataset.a === 'copy') {
        ctx.click();
        input.select();
        let ok = false;
        try {
          await navigator.clipboard.writeText(input.value);
          ok = true;
        } catch {
          ok = document.execCommand?.('copy') ?? false;
        }
        btn.innerHTML = ok ? `${icon('check', 18)} Copied!` : 'Select & copy';
        return;
      }
      if (btn?.dataset.a !== 'close' && e.target !== overlay) return;
      ctx.click();
      closeOverlay(overlay, 200);
      resolve();
    };
    document.body.append(overlay);
  });
}
