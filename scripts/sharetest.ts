import { Track } from '../src/track/Track';
import { encodeTrack, decodeTrack } from '../src/game/share';
import { LEVELS } from '../src/levels/levels';

// Round trip every built-in level through a share code.
for (const level of LEVELS) {
  const t = new Track();
  level.build(t);
  const data = t.serialize();
  const code = await encodeTrack(data);
  const back = await decodeTrack(code);
  const t2 = new Track();
  t2.load(back);
  const ok = t2.strokes.size === t.strokes.size && t2.stars.size === t.stars.size && !!t2.finish === !!t.finish && t2.rings.size === t.rings.size;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${level.name.padEnd(14)} json ${JSON.stringify(data).length} chars → link code ${code.length} chars`);
  if (!ok) process.exitCode = 1;
}
