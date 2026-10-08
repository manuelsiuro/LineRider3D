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

// Broken and hostile links fail with a message for the player, never a crash.
import { TrackFormatError, TRACK_VERSION } from '../src/track/Track';
import { check } from './assert';
{
  const t = new Track();
  LEVELS[0].build(t);
  const good = await encodeTrack(t.serialize());
  const newer = await encodeTrack({ ...t.serialize(), version: (TRACK_VERSION + 1) as 1 });
  const cases: [string, string][] = [
    ['cut off', good.slice(0, Math.floor(good.length / 2))],
    ['garbage', 'zNotARealCode!!'],
    ['unknown encoding', 'q' + good.slice(1)],
    ['plain non-track', 'j' + Buffer.from('{"hello":1}').toString('base64url')],
    ['newer version', newer],
  ];
  for (const [name, code] of cases) {
    let msg = 'decoded';
    try {
      await decodeTrack(code);
    } catch (e) {
      msg = e instanceof TrackFormatError ? e.message : `UNEXPECTED ${String(e)}`;
    }
    check(msg !== 'decoded' && !msg.startsWith('UNEXPECTED'), `${name} link: ${msg}`);
    console.log(`${name.padEnd(16)} → ${msg}`);
  }
  // Junk inside an otherwise valid track is dropped, the rest loads.
  const junk = { ...t.serialize(), decor: [{ kind: 'pine', position: [1, 2] }, null], stars: [[1, 2, 3], ['x']], strokes: [...t.serialize().strokes, { points: [1, 2] }] };
  const back = await decodeTrack('j' + Buffer.from(JSON.stringify(junk)).toString('base64url'));
  check(back.strokes.length === t.strokes.size && back.decor.length === 0 && back.stars!.length === 1, 'junk entries should be dropped');
  console.log('junk dropped    → strokes', back.strokes.length, 'decor', back.decor.length, 'stars', back.stars!.length);
}
