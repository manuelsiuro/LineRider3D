import { TrackFormatError, validateTrack, type SerializedTrack } from '../track/Track';

/**
 * Track share links: the whole track lives in the URL hash, compressed with
 * deflate (when the browser supports it) and base64url-encoded.
 *   #t=<code>[&c=<score to beat>][&v=<ride id>]
 * A daily ride needs no track, only its day:
 *   #d=<YYYY-MM-DD>[&c=<score to beat>]
 * The code's first letter is the encoding (z: deflate, j: plain JSON); the
 * track inside carries its format version, checked by validateTrack.
 */

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const body = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

/** Rounds coordinates to centimeters to keep links short. */
function compact(data: SerializedTrack): SerializedTrack {
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    ...data,
    strokes: data.strokes.map((s) => ({ ...s, points: s.points.map(r) })),
  };
}

export async function encodeTrack(data: SerializedTrack): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(compact(data)));
  if (typeof CompressionStream !== 'undefined') {
    return 'z' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
  }
  return 'j' + toBase64Url(json);
}

export async function decodeTrack(code: string): Promise<SerializedTrack> {
  const kind = code[0];
  if (kind !== 'z' && kind !== 'j') throw new TrackFormatError('That share link looks broken');
  let text: string;
  try {
    const bytes = fromBase64Url(code.slice(1));
    const json = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
    text = new TextDecoder().decode(json);
  } catch {
    throw new TrackFormatError('That share link is incomplete: was it cut off when copied?');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new TrackFormatError('That share link looks broken');
  }
  return validateTrack(raw);
}

export async function shareLink(data: SerializedTrack, challenge = 0, vehicle = 'sled'): Promise<string> {
  const code = await encodeTrack(data);
  const base = `${location.origin}${location.pathname}`;
  return `${base}#t=${code}${challenge > 0 ? `&c=${challenge}` : ''}${vehicle !== 'sled' ? `&v=${vehicle}` : ''}`;
}

/** A link to a day's daily ride, with a score to beat. */
export function dailyLink(day: string, challenge = 0): string {
  return `${location.origin}${location.pathname}#d=${day}${challenge > 0 ? `&c=${challenge}` : ''}`;
}

export type SharedLink =
  | { kind: 'track'; data: SerializedTrack; challenge: number; vehicle: string | null }
  | { kind: 'daily'; day: string; challenge: number };

/** Reads a shared track (or daily ride) from the current URL, if any. */
export async function readSharedLink(): Promise<SharedLink | null> {
  const params = new URLSearchParams(location.hash.slice(1));
  const challenge = Number(params.get('c') ?? 0) || 0;
  const day = params.get('d');
  if (day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) throw new TrackFormatError('That daily link looks broken');
    return { kind: 'daily', day, challenge };
  }
  const code = params.get('t');
  if (!code) return null;
  const data = await decodeTrack(code);
  return { kind: 'track', data, challenge, vehicle: params.get('v') };
}
