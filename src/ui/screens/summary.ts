import { KMH, METERS, closeOverlay, h } from '../dom';
import { icon } from '../icons';
import type { Stats } from '../../game/RunStats';
import type { ScreenCtx, SummaryInfo } from '../types';

/** End-of-run card. */
export function showSummary(
  ctx: ScreenCtx,
  stats: Stats,
  info: SummaryInfo,
  onReplay: () => void,
  onEdit: () => void,
  onWatch: () => void,
  onLevels?: () => void,
  onNext?: () => void,
) {
  document.querySelector('.summary')?.remove();
  const clean = !stats.crashed;
  const fmt = (n: number, d = 0) => n.toFixed(d);
  const overlay = h(
    'div',
    'summary',
    `<div class="card">
      <div class="summary-head ${clean ? 'clean' : 'wipeout'}">
        ${info.level ? `<span class="badge">Level ${info.level.number} · ${info.level.name}</span> ` : ''}<span class="badge">${stats.finished ? `Finished · ${stats.finishTime.toFixed(2)}s` : clean ? 'Clean run' : 'Wipeout'}</span>${info.vehicle ? ` <span class="badge">${info.vehicle}</span>` : ''}
        <div class="rating">${[0, 1, 2].map((i) => `<span class="rstar ${i < info.rating ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.18}s">${icon('star', 44)}</span>`).join('')}</div>
        <h2>${info.rating === 3 ? 'Legendary!' : stats.finished ? 'Finished!' : clean ? 'Nice ride!' : 'Ouch, Bosh!'}</h2>
        <div class="score-line">
          <div class="score-big">${stats.score.toLocaleString()}<small>pts</small></div>
          ${info.newBest ? `<span class="new-best">${icon('trophy', 16)} New best!</span>` : info.best > 0 ? `<span class="best">Best ${info.best.toLocaleString()}</span>` : ''}
        </div>
        ${stats.bestTrick ? `<p class="best-trick">Best trick: <b>${stats.bestTrick}</b></p>` : ''}
        ${info.ghostSaved ? `<span class="ghost-badge">${icon('eye', 14)} Saved as your ghost to beat</span>` : ''}
        ${
          info.challenge
            ? `<p class="challenge-line">${stats.score >= info.challenge ? `${icon('trophy', 16)} You beat the challenge of ${info.challenge.toLocaleString()}!` : `${(info.challenge - stats.score).toLocaleString()} points short of the ${info.challenge.toLocaleString()} challenge`}</p>`
            : ''
        }
      </div>
      <ul class="goals">${info.goals.map((g) => `<li class="${g.done ? 'done' : ''}">${icon(g.done ? 'check' : 'circle', 16)}${g.label}</li>`).join('')}</ul>
      <div class="stats">
        <div><b>${fmt(stats.time, 1)}<small>s</small></b><span>Time</span></div>
        <div><b>${fmt(stats.distance * METERS)}<small>m</small></b><span>Distance</span></div>
        <div><b>${fmt(stats.topSpeed * KMH)}<small>km/h</small></b><span>Top speed</span></div>
        <div><b>${fmt(stats.bestAir, 1)}<small>s</small></b><span>Best air</span></div>
        <div><b>${stats.tricks}<small>${stats.perfects ? ` · ${stats.perfects} perfect` : ''}</small></b><span>Tricks</span></div>
        <div><b>${info.starsTotal ? `${stats.stars}/${info.starsTotal}` : `x${stats.bestCombo}`}</b><span>${info.starsTotal ? 'Stars' : 'Best combo'}</span></div>
      </div>
      <div class="actions">
        ${
          info.level
            ? `<button class="big-btn ghost icon-only" data-a="levels" title="Levels" aria-label="Levels">${icon('menu', 20)}</button>
               <button class="big-btn ghost icon-only" data-a="watch" title="Watch replay" aria-label="Watch replay">${icon('eye', 20)}</button>
               <button class="big-btn ${info.level.hasNext && info.level.nextUnlocked ? 'ghost' : 'primary'}" data-a="replay">${icon('replay', 18)} Retry</button>
               ${info.level.hasNext && info.level.nextUnlocked ? `<button class="big-btn primary" data-a="next">Next ${icon('chevronRight', 18)}</button>` : ''}`
            : `<button class="big-btn ghost icon-only" data-a="edit" title="Edit track" aria-label="Edit track">${icon('pencil', 20)}</button>
               ${info.riderMode ? `<button class="big-btn ghost icon-only" data-a="watch" title="Watch replay" aria-label="Watch replay">${icon('eye', 20)}</button>` : ''}
               ${stats.score > 0 ? `<button class="big-btn ghost" data-a="challenge">${icon('share', 18)} Challenge</button>` : ''}
               <button class="big-btn primary" data-a="replay">${icon('replay', 18)} Ride again</button>`
        }
      </div>
    </div>`,
  );
  overlay.onclick = (e) => {
    const a = (e.target as HTMLElement).closest('button')?.dataset.a;
    if (!a && e.target !== overlay) return;
    ctx.click();
    if (a === 'challenge') {
      ctx.share(stats.score);
      return;
    }
    closeOverlay(overlay);
    if (a === 'replay') onReplay();
    else if (a === 'edit') onEdit();
    else if (a === 'watch') onWatch();
    else if (a === 'levels') onLevels?.();
    else if (a === 'next') onNext?.();

  };
  document.body.append(overlay);
}

export function hideSummary() {
  document.querySelector('.summary')?.remove();
}
