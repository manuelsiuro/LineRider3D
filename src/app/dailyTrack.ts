import { Track, type SerializedTrack } from '../track/Track';
import { buildDaily } from '../levels/daily';

const pending = new Map<string, Promise<SerializedTrack>>();
let worker: Worker | null = null;

function buildHere(day: string) {
  const t = new Track();
  buildDaily(day, t);
  return t.serialize();
}

/**
 * A day's daily track, built in a worker so the physics checks never stall a
 * frame (falls back to the main thread where workers are unavailable).
 * Asking early (at boot) means it is usually ready before the player is.
 */
export function dailyTrack(day: string): Promise<SerializedTrack> {
  const known = pending.get(day);
  if (known) return known;
  const p = new Promise<SerializedTrack>((resolve) => {
    try {
      worker ??= new Worker(new URL('../levels/dailyWorker.ts', import.meta.url), { type: 'module' });
      const w = worker;
      const onMessage = (e: MessageEvent<{ day: string; track: SerializedTrack }>) => {
        if (e.data.day !== day) return;
        w.removeEventListener('message', onMessage);
        resolve(e.data.track);
      };
      w.addEventListener('message', onMessage);
      w.addEventListener('error', () => resolve(buildHere(day)), { once: true });
      w.postMessage(day);
    } catch {
      resolve(buildHere(day));
    }
  });
  pending.set(day, p);
  return p;
}
