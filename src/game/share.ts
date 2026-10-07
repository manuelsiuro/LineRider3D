import type { SerializedTrack } from '../track/Track';

/**
 * Track share links: the whole track lives in the URL hash, compressed with
 * deflate (when the browser supports it) and base64url-encoded.
 *   #t=<code>[&c=<score to beat>]
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
  const bytes = fromBase64Url(code.slice(1));
  const json = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  const data = JSON.parse(new TextDecoder().decode(json)) as SerializedTrack;
  if (!data || !Array.isArray(data.strokes)) throw new Error('Not a track');
  return data;
}

export async function shareLink(data: SerializedTrack, challenge = 0): Promise<string> {
  const code = await encodeTrack(data);
  const base = `${location.origin}${location.pathname}`;
  return `${base}#t=${code}${challenge > 0 ? `&c=${challenge}` : ''}`;
}

/** Reads a shared track from the current URL, if any. */
export async function readSharedLink(): Promise<{ data: SerializedTrack; challenge: number } | null> {
  const params = new URLSearchParams(location.hash.slice(1));
  const code = params.get('t');
  if (!code) return null;
  const data = await decodeTrack(code);
  return { data, challenge: Number(params.get('c') ?? 0) || 0 };
}
