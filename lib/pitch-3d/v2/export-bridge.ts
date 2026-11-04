/** Decode bounded, independently encoded bridge chunks without relying on a Node or browser Buffer. */
export function decodeExportChunk(value: string): Uint8Array {
  if (!value || value.length > 262_144 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('영상 조각이 올바르지 않아요.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const out = new Uint8Array(value.length / 4 * 3 - padding);
  let pos = 0;
  for (let i = 0; i < value.length; i += 4) {
    const a = alphabet.indexOf(value[i]);
    const b = alphabet.indexOf(value[i + 1]);
    const c = value[i + 2] === '=' ? 0 : alphabet.indexOf(value[i + 2]);
    const d = value[i + 3] === '=' ? 0 : alphabet.indexOf(value[i + 3]);
    if (a < 0 || b < 0 || c < 0 || d < 0 || (value[i + 2] === '=' && value[i + 3] !== '=') || (i + 4 < value.length && (value[i + 2] === '=' || value[i + 3] === '='))) throw new Error('영상 조각이 올바르지 않아요.');
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (pos < out.length) out[pos++] = n >> 16;
    if (pos < out.length) out[pos++] = n >> 8 & 255;
    if (pos < out.length) out[pos++] = n & 255;
  }
  return out;
}
