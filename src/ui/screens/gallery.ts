import { BIOMES as WORLDS } from '../../world/worlds';
import { closeOverlay, h } from '../dom';
import { icon } from '../icons';
import type { GalleryActions, GalleryCard, ScreenCtx } from '../types';
import { confirm } from './dialogs';

const BIOMES = new Set<string>(WORLDS.map((b) => b.id));

/** "just now", "5 min ago", "yesterday", "12 Mar". */
function ago(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** My tracks: open one, start a new one, rename, duplicate or delete. */
export function showGallery(ctx: ScreenCtx, cards: GalleryCard[], actions: GalleryActions): Promise<{ open: string } | { create: true } | null> {
  return new Promise((resolve) => {
    const overlay = h('div', 'screen gallery');
    let latest = cards;
    const render = (list: GalleryCard[]) => {
      latest = list;
      overlay.innerHTML = `<div class="screen-inner">
        <div class="screen-head">
          <button class="btn icon-btn" data-back>${icon('chevronLeft')}</button>
          <h2>My tracks</h2>
          <span class="pill big">${list.length} saved</span>
        </div>
        <div class="gallery-grid">
          <button class="gallery-card new" data-a="new"><span class="gallery-ic">${icon('plus', 28)}</span><b>New track</b><small>Start from a blank slope</small></button>
          ${list
            .map(
              (c, i) => `<div class="gallery-card ${c.current ? 'current' : ''}" data-id="${c.id}" style="animation-delay:${Math.min(i, 12) * 0.03}s">
                <button class="gallery-open" data-a="open" aria-label="Open ${escape(c.name)}">
                  <span class="gallery-ic" data-world="${BIOMES.has(c.world) ? c.world : 'alpine'}">${icon(BIOMES.has(c.world) ? c.world : 'alpine', 26)}</span>
                  <b class="gallery-name">${escape(c.name)}</b>
                  <small>${c.strokes} line${c.strokes === 1 ? '' : 's'} · ${ago(c.savedAt)}${c.current ? ' · last edited' : ''}</small>
                </button>
                <div class="gallery-tools">
                  <button class="btn icon-btn flat" data-a="rename" title="Rename" aria-label="Rename">${icon('pencil', 16)}</button>
                  <button class="btn icon-btn flat" data-a="duplicate" title="Duplicate" aria-label="Duplicate">${icon('copy', 16)}</button>
                  <button class="btn icon-btn flat" data-a="delete" title="Delete" aria-label="Delete">${icon('trash', 16)}</button>
                </div>
              </div>`,
            )
            .join('')}
        </div>
        ${list.length === 0 ? `<p class="gallery-empty">Your tracks are saved here automatically as you draw.</p>` : ''}
      </div>`;
    };
    render(cards);
    const close = (v: { open: string } | { create: true } | null) => {
      closeOverlay(overlay);
      if (v) document.body.classList.remove('on-title');
      resolve(v);
    };
    overlay.onclick = async (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      ctx.click();
      if (btn.dataset.back !== undefined) return close(null);
      const a = btn.dataset.a;
      if (a === 'new') return close({ create: true });
      const card = btn.closest<HTMLElement>('[data-id]');
      const id = card?.dataset.id;
      if (!id || !card) return;
      if (a === 'open') return close({ open: id });
      if (a === 'duplicate') return render(actions.duplicate(id));
      if (a === 'delete') {
        const name = card.querySelector('.gallery-name')?.textContent ?? 'this track';
        if (await confirm(ctx, 'Delete this track?', `"${escape(name)}" will be erased from this device. Export it first if you want to keep a copy.`, 'Delete')) render(actions.remove(id));
        return;
      }
      if (a === 'rename') {
        // Rename in place: the name turns into a text field.
        const nameEl = card.querySelector('.gallery-name') as HTMLElement;
        const input = Object.assign(document.createElement('input'), { className: 'gallery-rename', value: nameEl.textContent ?? '', maxLength: 40 });
        nameEl.replaceWith(input);
        input.focus();
        input.select();
        const done = (save: boolean) => {
          input.onblur = null;
          render(save ? actions.rename(id, input.value) : latest);
        };
        input.onkeydown = (k) => {
          k.stopPropagation();
          if (k.key === 'Enter') done(true);
          if (k.key === 'Escape') done(false);
        };
        input.onblur = () => done(true);
        input.onclick = (k) => k.stopPropagation();
      }
    };
    document.body.append(overlay);
  });
}
