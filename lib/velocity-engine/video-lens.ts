/**
 * 영상 파일의 렌즈 정보 — 아이폰 mov 는 파일 머리(moov › meta › keys · ilst)에 카메라 기종 · 렌즈 ·
 * 35mm 환산 초점거리를 적는다. 그것으로 영상 모드의 화각을 짐작한다.
 *
 * 왜 필요한가(2026-09-28, 김민의 첫 보정 영상 18개): 화각을 69° 로 가정했더니 카메라 구속이 스피드건보다
 * 한결같이 14~16% 낮았다. 69° 는 사진(4:3)의 가로 화각이고, 아이폰 영상(16:9 · 손떨림 보정 크롭)은
 * 그보다 좁다 — 스피드건 짝으로 되맞춘 값은 61~62°. 파일에 "iPhone … back camera … 24mm" 가 적혀
 * 있으면 기본 화각을 62° 로 둔다. 렌즈 보정(공으로 초점거리 재기)이 있으면 그것이 우선이다.
 *
 * 값은 문자열 검색으로 읽는다 — ilst 의 data 상자에 UTF-8 로 그대로 들어 있어, 상자를 다 파싱하지 않고도
 * 열쇠 이름 다음 data 값을 찾을 수 있다. 못 읽으면 null(화각은 지금처럼 사용자 값).
 */

export type VideoLens = {
  /** 기종 — 'iPhone 15 Pro Max' */
  model: string | null;
  /** 렌즈 — 'iPhone 15 Pro Max back camera 6.765mm f/1.78' */
  lens: string | null;
  /** 35mm 환산 초점거리(mm) — 24 · 13 · 120 … */
  focal35: number | null;
};

const KEYS = {
  model: 'com.apple.quicktime.model',
  lens: 'com.apple.quicktime.camera.lens_model',
  focal35: 'com.apple.quicktime.camera.focal_length.35mm_equivalent',
} as const;

/** 파일 머리 4MB 안에서 열쇠 목록(keys)과 값(ilst)을 찾는다 — 아이폰 mov 는 moov 가 앞이거나 뒤(둘 다 본다) */
export async function readVideoLens(file: Blob): Promise<VideoLens | null> {
  try {
    const head = await sliceText(file, 0, 4 * 1024 * 1024);
    let text = head;
    if (!text.includes('keys') && file.size > 4 * 1024 * 1024) {
      text = await sliceText(file, Math.max(0, file.size - 4 * 1024 * 1024), file.size);
    }
    const keysAt = text.indexOf('keys');
    const ilstAt = text.indexOf('ilst', keysAt);
    if (keysAt < 0 || ilstAt < 0) return null;
    /* keys 상자: 열쇠 이름이 차례로 — 그 차례(1부터)가 ilst 안 값의 번호다 */
    const names: string[] = [];
    const re = /mdta(com\.apple\.quicktime\.[a-z0-9_.\-]+)/g;
    const keysText = text.slice(keysAt, ilstAt);
    for (let m = re.exec(keysText); m; m = re.exec(keysText)) names.push(m[1]);
    if (names.length === 0) return null;
    const valueOf = (key: string): string | null => {
      const idx = names.indexOf(key);
      if (idx < 0) return null;
      /* ilst 안 항목: [크기 4][번호 4(빅엔디언 = idx+1)][data 상자: 크기 4 'data' 종류 4 로케일 4 값] */
      const tag = String.fromCharCode(
        (idx + 1) >>> 24,
        ((idx + 1) >>> 16) & 255,
        ((idx + 1) >>> 8) & 255,
        (idx + 1) & 255
      );
      const ilst = text.slice(ilstAt, ilstAt + 64 * 1024);
      const at = ilst.indexOf(tag + '\0\0\0', 0);
      for (let p = ilst.indexOf(tag, 0); p >= 0 && p < ilst.length; p = ilst.indexOf(tag, p + 1)) {
        const dataAt = ilst.indexOf('data', p);
        if (dataAt < 0 || dataAt - p > 12) continue;
        const size = readU32(ilst, dataAt - 4);
        if (size < 16 || size > 512) continue;
        return ilst.slice(dataAt + 12, dataAt - 4 + size).replace(/\0+$/g, '');
      }
      void at;
      return null;
    };
    const model = valueOf(KEYS.model);
    const lens = valueOf(KEYS.lens);
    const f35 = valueOf(KEYS.focal35);
    const focal35 = f35 != null && /^\d+(\.\d+)?$/.test(f35.trim()) ? Number(f35) : null;
    if (model == null && lens == null && focal35 == null) return null;
    return { model, lens, focal35 };
  } catch {
    return null;
  }
}

async function sliceText(file: Blob, from: number, to: number): Promise<string> {
  const buf = new Uint8Array(await file.slice(from, to).arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
  }
  return s;
}

function readU32(s: string, at: number): number {
  if (at < 0 || at + 4 > s.length) return 0;
  return (
    ((s.charCodeAt(at) << 24) >>> 0) +
    (s.charCodeAt(at + 1) << 16) +
    (s.charCodeAt(at + 2) << 8) +
    s.charCodeAt(at + 3)
  );
}

/** 아이폰 영상 모드의 기본 화각 — 렌즈 정보로 짐작. 모르면 null(사용자 값 그대로) */
export const IPHONE_VIDEO_MAIN_FOV_DEG = 62;

export function videoFovFor(lens: VideoLens | null): number | null {
  if (!lens) return null;
  const text = `${lens.model ?? ''} ${lens.lens ?? ''}`;
  if (!/iPhone/i.test(text) || !/back/i.test(text)) return null;
  /* 1x 메인(24 · 26mm). 초광각(13 · 14mm) · 망원(48mm 이상)은 아직 짝이 없어 안 짐작한다 */
  if (lens.focal35 != null && lens.focal35 >= 20 && lens.focal35 <= 28) return IPHONE_VIDEO_MAIN_FOV_DEG;
  return null;
}

/** '아이폰 15 Pro Max · 24mm → 화각 62°' 같은 한 줄 */
export function videoLensText(lens: VideoLens | null): string | null {
  if (!lens) return null;
  const parts = [lens.model, lens.focal35 != null ? `${lens.focal35}mm` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
