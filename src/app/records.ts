import type { Track } from '../track/Track';
import type { SurfaceId } from '../world/worlds';
import { KEYS, readJSON, writeJSON } from '../game/storage';

/** A content hash of the rideable parts of a track (strokes, rings, start). */
export function trackKey(track: Track) {
  const data = track.serialize();
  const json = JSON.stringify({ s: data.strokes, r: data.rings, t: track.start.toArray() });
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

/** Ghosts and bests are per ride and ground (the sled on snow keeps the original keys). */
export function runKey(track: Track, vehicleId: string, ground: SurfaceId) {
  const base = vehicleId === 'sled' ? trackKey(track) : `${trackKey(track)}:${vehicleId}`;
  return ground === 'snow' ? base : `${base}:${ground}`;
}

interface BestRecord {
  score: number;
  stars: number;
}

/** Keeps the best score and star rating under `key`. */
export function recordBest(key: string, score: number, stars: number): { best: number; newBest: boolean } {
  const all = readJSON<Record<string, BestRecord>>(KEYS.best, {});
  const prev = all[key] ?? { score: 0, stars: 0 };
  const newBest = score > prev.score && score > 0;
  all[key] = { score: Math.max(prev.score, score), stars: Math.max(prev.stars, stars) };
  writeJSON(KEYS.best, all);
  return { best: all[key].score, newBest };
}
