import type { Track } from '../track/Track';
import type { Stats } from './RunStats';

export interface Goal {
  label: string;
  done: boolean;
}

/**
 * The three goals of a track. Each completed goal earns a star:
 * 1. reach the finish (or ride without crashing if there is no finish),
 * 2. collect every star (or land a Perfect if there are none),
 * 3. reach the target score.
 */
export function rateRun(track: Track, s: Stats): { goals: Goal[]; stars: number } {
  const totalStars = track.stars.size;
  const goals: Goal[] = [
    track.finish ? { label: 'Reach the finish', done: s.finished } : { label: 'Ride without crashing', done: !s.crashed },
    totalStars > 0
      ? { label: `Collect all ${totalStars} stars`, done: s.stars >= totalStars }
      : { label: 'Land a Perfect', done: s.perfects > 0 },
    { label: `Score ${track.targetScore.toLocaleString()}`, done: s.score >= track.targetScore },
  ];
  return { goals, stars: goals.filter((g) => g.done).length };
}
