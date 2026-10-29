import type * as ImagePicker from 'expo-image-picker';
import { File, FileMode } from 'expo-file-system';
import { createUploadTask, FileSystemUploadType } from 'expo-file-system/legacy';
import { readVideoFps } from '@/lib/velocity-engine/video-fps';
import { readVideoLens } from '@/lib/velocity-engine/video-lens';
import { readLabFileFacts } from '@/lib/pitch-lab-file';
import type { LabCapture, LabVideoInfo } from '@/lib/pitch-lab-guard';
import type { LabSport, LabView } from '@/lib/pitch-lab-meta';
import { SITE_URL } from '~/lib/site';
import { syncSession } from '~/lib/rpc';

/**
 * 3D 동작 분석 올리기(앱) — 웹 app/(app)/videos/lab/lab-client.tsx 의 probeLabVideo · fileFingerprint · uploadToStorage 를 앱으로.
 * 검사 규칙은 웹과 같은 lib(pitch-lab-guard · pitch-lab-file · velocity-engine/video-fps · video-lens)에 파일 손잡이를 Blob 꼴로 감싸 넘긴다
 * (영상을 통째로 메모리에 안 올림). 올리기는 디스크에서 바로(createUploadTask) — 150MB 영상을 fetch().blob() 로 읽지 않게.
 */

const MB = 1 << 20;

/**
 * 파일 손잡이를 lib 가 부르는 Blob 모양(size · slice().arrayBuffer())으로. readBytes 는 비동기라 offset 을 두 읽기가 다투지 않게
 * 한 줄로 세운다(앞 읽기가 끝나야 다음 offset).
 */
function reader(handle: ReturnType<File['open']>, size: number) {
  let queue: Promise<unknown> = Promise.resolve();
  const read = (from: number, to: number): Promise<Uint8Array> => {
    const next = queue.then(async () => {
      handle.offset = from;
      return handle.readBytes(Math.max(0, Math.min(size, to) - from));
    });
    queue = next.catch(() => undefined);
    return next;
  };
  const blob = {
    size,
    slice: (from = 0, to = size) => ({
      arrayBuffer: async () => {
        const b = await read(from, to);
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      },
    }),
  } as unknown as Blob;
  return { blob, read };
}

/** 고른 영상의 올리기 전 검사 재료 + 지문 — 웹 probeLabVideo 와 같은 값(머리를 못 읽은 칸은 null, 그 칸으로는 안 막는다) */
export async function probeLabAsset(
  asset: ImagePicker.ImagePickerAsset
): Promise<{ info: LabVideoInfo; capture: LabCapture & { fp: string } }> {
  const handle = new File(asset.uri).open(FileMode.ReadOnly);
  try {
    const size = handle.size ?? asset.fileSize ?? 0;
    const { blob, read } = reader(handle, size);
    const fps = await readVideoFps(blob).catch(() => null);
    const lens = await readVideoLens(blob).catch(() => null);
    const facts = await readLabFileFacts(blob).catch(() => null);
    const fp = await fingerprint(read, size);
    const w = asset.width || 0;
    const h = asset.height || 0;
    const boxDur = asset.duration ? asset.duration / 1000 : null;
    const lensSeen = lens != null && (lens.lens != null || lens.focal35 != null);
    return {
      info: {
        name: asset.fileName ?? '',
        fps,
        shortSide: w > 0 && h > 0 ? Math.min(w, h) : null,
        durationSec: boxDur,
        focal35: lens?.focal35 ?? null,
        aspect: w > 0 && h > 0 ? Math.max(w, h) / Math.min(w, h) : null,
        hasLens: lensSeen || facts?.hasLens ? true : facts ? false : null,
      },
      capture: {
        startMs: facts?.startMs ?? null,
        timeSource: facts?.timeSource ?? null,
        durationSec: facts?.durationSec ?? boxDur,
        fp,
      },
    };
  } finally {
    handle.close();
  }
}

/**
 * 파일 지문 — 웹 lib/pitch-lab-guard.ts fileFingerprint 와 같은 값(크기 글자 + 앞 1MB + 뒤 1MB 의 SHA-256 16진).
 * 같은 영상을 웹 · 앱 어디서 올려도 같아야 '이미 실패한 영상' 막기가 듣는다. 앱에는 crypto.subtle 이 없어 SHA-256 을 여기서 센다.
 */
async function fingerprint(read: (from: number, to: number) => Promise<Uint8Array>, size: number): Promise<string> {
  const head = new TextEncoder().encode(String(size));
  const first = await read(0, Math.min(MB, size));
  const last = size > MB ? await read(Math.max(MB, size - MB), size) : new Uint8Array(0);
  const all = new Uint8Array(head.length + first.length + last.length);
  all.set(head, 0);
  all.set(first, head.length);
  all.set(last, head.length + first.length);
  return sha256Hex(all);
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256(FIPS 180-4) — 지문 2MB 남짓에만 쓴다 */
export function sha256Hex(data: Uint8Array): string {
  const bitLen = data.length * 8;
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(padded.length - 4, bitLen >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] += a;
    H[1] += b;
    H[2] += c;
    H[3] += d;
    H[4] += e;
    H[5] += f;
    H[6] += g;
    H[7] += h;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
}

/**
 * 영상 하나를 그 샘플 폴더로 — 웹 uploadToStorage 와 같은 길(사이트에서 서명 주소 → 저장소에 PUT). 디스크에서 바로 보내 큰 영상도 메모리에 안 올린다.
 * 서명 주소는 upsert 라 신호가 끊겨 다시 보내도 덮어쓴다.
 */
export async function uploadLabVideo(
  id: string,
  view: LabView | 'cam3' | 'cam4',
  asset: ImagePicker.ImagePickerAsset,
  /** 퍼센트 + 보낸 · 전체 바이트(진행 화면이 두 파일을 합쳐 센다) */
  onProgress: (percent: number, sent?: number, total?: number) => void,
  /** 'hit' = 3D 스윙 분석(타자) 폴더 — ③ · ④ 카메라는 그때 3D 개발 관리자만 */
  sport: LabSport = 'pitch'
): Promise<void> {
  await syncSession();
  const type = asset.mimeType ?? 'video/quicktime';
  const res = await fetch(`${SITE_URL}/api/pitch-lab/upload-url?pair=${id}&view=${view}${sport === 'hit' ? '&sport=hit' : ''}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileName: asset.fileName ?? `${view}.mov`, fileSize: asset.fileSize ?? 1, fileType: type }),
  });
  const json = (await res.json().catch(() => null)) as { signedUrl?: string; error?: string } | null;
  if (!res.ok || !json?.signedUrl) throw new Error(json?.error ?? '업로드 주소를 받지 못했어요.');
  const put = async () => {
    const task = createUploadTask(
      json.signedUrl!,
      asset.uri,
      { httpMethod: 'PUT', uploadType: FileSystemUploadType.BINARY_CONTENT, headers: { 'content-type': type } },
      (p) =>
        p.totalBytesExpectedToSend > 0 &&
        onProgress(Math.round((p.totalBytesSent / p.totalBytesExpectedToSend) * 100), p.totalBytesSent, p.totalBytesExpectedToSend)
    );
    const r = await task.uploadAsync();
    if (!r || r.status < 200 || r.status >= 300) throw new Error('업로드에 실패했어요.');
  };
  try {
    await put();
  } catch {
    /* 신호가 잠깐 끊긴 것일 수 있다 — 같은 주소로 한 번 더(웹과 같다) */
    await new Promise((r) => setTimeout(r, 1500));
    onProgress(0, 0, asset.fileSize ?? undefined);
    await put();
  }
}
