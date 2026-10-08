import { Track } from '../../src/track/Track';
import { Simulation } from '../../src/physics/Simulation';
import { P } from '../../src/physics/Rider';
import { LEVELS } from '../../src/levels/levels';

const name = process.argv[2];
const level = LEVELS.find((l) => l.id === name)!;
const t = new Track();
level.build(t);
const sim = new Simulation(t);
let line = '';
let crashAt = -1;
for (let f = 0; f <= 640; f++) {
  sim.seek(f);
  const b = sim.rider.pos[P.butt];
  if (sim.rider.crashed && crashAt < 0) crashAt = f;
  if (f % 10 === 0) line += ` ${f}:${b.x.toFixed(0)},${b.y.toFixed(1)},${b.z.toFixed(1)}${sim.rider.contact.some((c) => c) ? '' : '^'}${sim.rider.crashed ? 'X' : ''}`;
}
console.log(name, 'crash at', crashAt, '\n', line);
const strokes = [...t.strokes.values()].map((s) => `${s.type}:${s.points[0].x.toFixed(0)}..${s.points[s.points.length - 1].x.toFixed(0)} y${s.points[0].y.toFixed(1)}→${s.points[s.points.length - 1].y.toFixed(1)}`);
console.log(strokes.join(' | '));
