/** Builds a daily track off the main thread (the physics checks take a moment). */
import { Track } from '../track/Track';
import { buildDaily } from './daily';

self.onmessage = (e: MessageEvent<string>) => {
  const t = new Track();
  buildDaily(e.data, t);
  self.postMessage({ day: e.data, track: t.serialize() });
};
