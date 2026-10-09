import * as THREE from 'three';
import type { Track } from '../track/Track';
import { profilePiece, type PieceSize, type ProfilePiece } from './pieces';

/** Starting points for a new track: empty, or a few Build pieces to change and ride. */
export type TemplateId = 'blank' | 'slope' | 'jumps';

export const TEMPLATES: { id: TemplateId; name: string; blurb: string; icon: string }[] = [
  { id: 'blank', name: 'Blank', blurb: 'Just the start flag: draw it all yourself.', icon: 'plus' },
  { id: 'slope', name: 'Starter slope', blurb: 'A rolling run to the finish, ready to change.', icon: 'pencil' },
  { id: 'jumps', name: 'Jump park', blurb: 'A steep drop into a gap jump.', icon: 'build' },
];

const CHAINS: Record<Exclude<TemplateId, 'blank'>, [ProfilePiece, PieceSize][]> = {
  slope: [['slope', 'M'], ['dip', 'M'], ['bump', 'S'], ['slope', 'M'], ['finish', 'M']],
  jumps: [['slope', 'M'], ['drop', 'M'], ['gap', 'M'], ['slope', 'S'], ['finish', 'M']],
};

/**
 * Fills a cleared track with a template; returns where the track ends (the drawing
 * plane's anchor), or null for a blank track.
 */
export function buildTemplate(track: Track, id: TemplateId): { end: THREE.Vector3; tangent: THREE.Vector3 } | null {
  track.clear();
  if (id === 'blank') {
    track.setStart(new THREE.Vector3(0, 12, 0));
    return null;
  }
  const start = new THREE.Vector3(0, 40, 0);
  track.setStart(start);
  const normal = new THREE.Vector3(0, 0, 1);
  const u = new THREE.Vector3(1, 0, 0);
  let origin = start.clone().add(new THREE.Vector3(0, -1.2, 0));
  let heading = THREE.MathUtils.degToRad(-15);
  let end = origin;
  let tangent = u.clone();
  for (const [kind, size] of CHAINS[id]) {
    const r = profilePiece(kind, size, { origin, u, normal, heading, width: 2.4 });
    for (const points of r.strokes) track.addStroke({ type: 'normal', mode: 'profile', points, planeNormal: normal.clone(), bank: 0, width: 2.4 });
    if (r.finish) track.setFinish({ position: r.finish.position, axis: r.finish.axis, halfWidth: 2.1 });
    origin = end = r.end;
    tangent = r.tangent;
    heading = Math.atan2(r.tangent.y, r.tangent.dot(u));
  }
  return { end, tangent };
}
