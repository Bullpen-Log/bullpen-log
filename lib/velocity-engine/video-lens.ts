/**
 * 영상 파일의 렌즈 정보 — 아이폰 mov 는 파일 머리(moov › meta › keys · ilst)에 카메라 기종 · 렌즈 ·
 * 35mm 환산 초점거리를 적는다. 그것으로 영상 모드의 화각을 짐작한다.
 *
 * 왜 필요한가(2026-09-28, 김민의 첫 보정 영상 18개): 화각을 69° 로 가정했더니 카메라 구속이 스피드건보다
 * 한결같이 14~16% 낮았다. 69° 는 사진(4:3)의 가로 화각이고, 아이폰 영상(16:9 · 손떨림 보정 크롭)은
 * 그보다 좁다. 파일에 "iPhone … back camera … 24mm" 가 적혀 있으면 기본 화각을 스피드건 짝으로 맞춘 값(1.5.0 은 62°,
 * 1.6.0 은 윤곽 자에 맞춰 59.8° — IPHONE_VIDEO_MAIN_FOV_DEG)으로 둔다. 렌즈 보정(공으로 초점거리 재기)이 있으면 그것이 우선이다.
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

/**
 * 아이폰 1x 메인(35mm 환산 24mm)으로 찍은 영상의 긴 변 화각 — 스피드건 짝으로 정한 '분석 길 보정값'(2차 보정, 모델 1.6.0).
 * 렌즈의 물리 화각 그 자체가 아니라, 이 엔진(윤곽 자) · 이 촬영(아이폰 영상 모드)의 배율을 스피드건에 맞춘 값이다.
 *
 * 물리로 아는 것: 15 Pro Max 메인 센서 폭 9.84mm(8064 × 1.22µm), 초점거리 6.765mm(파일에 적힌 값) → 센서를 자르지 않은
 * 긴 변 화각은 72.0° 다(35mm 환산 23.8mm 와 맞는다). 영상은 16:9 로 위아래만 자르므로 긴 변은 그대로지만, 카메라 앱의
 * 손떨림 보정이 가장자리를 여유로 떼어 내 좁아진다. 그 배율은 파일에 없고 애플도 밝히지 않는다 — 1.12~1.30배라면 화각은
 * 65~58° 사이다. 그래서 물리만으로는 ±3° 밖에 못 좁히고, 짝으로 정한다.
 *
 * 1.5.0 의 62° 는 면적 지름으로 맞춘 값이었다. 면적 지름은 번진 릴리스 장면 · 작은 먼 공을 크게 읽어(감마로 눌린 가장자리)
 * 배율이 영상마다 흔들렸으므로 '물리 화각'의 근거가 되지 못한다. 1.6.0 의 윤곽 자로 18개 짝(흰 천 없는 14개, 새 구간)을
 * 맞추면 배율 1.045 = 화각 59.8°(한 개 빼고 맞추기 59.7~59.9°, 공 15개 전부로는 59.9°)다 — 손떨림 자르기로 치면 1.26배,
 * 위 물리 범위 안이다. 이 4.5% 에는 화각 말고도 스피드건과 구분할 수 없는 것들이 함께 들어 있다:
 *   - 릴리스 값은 첫 관측(손에서 0~1m) 시점 속도라 스피드건(손을 떠난 직후 최고)보다 공기저항만큼 낮다 — 최대 0.8%
 *   - 공 크기: 계산은 73mm(규격의 가장 작은 쪽)로 한다. 규격은 72.9~74.8mm — 실제 공이 74mm 면 1.4%
 *   - 윤곽 자의 배율: 윤곽 비율 α 는 스피드건 없이 궤적의 공기저항이 물리에 맞게(크기에 따라 흐르는 치우침이 없게) 정했다.
 *     그 검사는 '모든 크기에 같은 배율로 틀리는 것'은 못 본다(합성 시험대의 실제 카메라 윤곽에서는 −0.8~+0.5%)
 *   - 스피드건 자체의 배율(기종 · 놓은 자리 모름)
 * 그래서 이 값은 화각을 가정하는 길(영상 파일의 렌즈 정보)에만 쓴다. 공으로 렌즈를 보정하면(lib/velocity-lens.ts) 초점거리를
 * 직접 재므로 이 값을 거치지 않는다 — 그때는 공 크기 가정이 약분되고, 남는 것은 윤곽 자와 보정 화면의 자가 같은가뿐이다.
 * 2x(48mm) · 26mm 도 아래 videoFovInfo 가 이 값에서 tan 비례로 구하므로 같은 배율(초점거리 ×1.045)을 받는다.
 * 영상 · 스피드건 짝이 더 쌓이면(다른 날 · 다른 폰 · 다른 스피드건) 다시 맞춘다 — 지금 짝은 한 폰 · 한 날 · 한 스피드건이다.
 */
export const IPHONE_VIDEO_MAIN_FOV_DEG = 59.8;
/** 위 화각을 정한 영상의 35mm 환산 초점거리(mm) */
export const IPHONE_VIDEO_MAIN_FOCAL35 = 24;
/** 메인 센서를 쓰는 환산 초점거리 범위(mm) — 1x(24 · 26) · 크롭(28 · 35) · 2x(48 · 52) */
const MAIN_SENSOR_FOCAL35: [number, number] = [20, 52];

export type VideoFov = {
  /** 긴 변 화각(도) */
  fovDeg: number;
  /**
   * 짐작한 값인가 — 스피드건 짝으로 맞춘 것은 24mm(15 Pro Max) 하나뿐이다. 다른 환산 초점거리는 같은 손떨림 자르기를
   * 가정해 늘리거나 줄인 값이라, 화면에 '추정 화각'으로 보이고 렌즈 보정(공으로 초점거리 재기)을 권한다.
   */
  estimate: boolean;
};

/**
 * 아이폰 영상의 기본 화각 — 렌즈 정보로 짐작. 모르면 null(사용자 값 그대로).
 *
 * 메인 센서를 쓰는 1x ~ 2x(환산 20~52mm)는 같은 센서를 같은 손떨림 자르기로 쓴다고 보고, 화각의 tan 을 환산 초점거리에
 * 반비례하게 늘리거나 줄인다: tan(화각/2) = tan(기준/2) × 24 / 환산. 기준 59.8° 이면 24mm 는 59.8° 그대로, 2x(48mm)는
 * 32.1°(예전에는 null → 기본 69° 라 초점거리를 2.3배 작게 보아 구속이 절반 밑으로 나왔다), 26mm 는 55.9°. 초점거리로 보면
 * 모두 24mm 의 (환산 ÷ 24)배라, 기준값에 든 분석 길 배율(1.045)을 다 같이 받는다.
 *
 * 26mm(아이폰 12 · 13 · 14 · 15 기본 모델의 메인)는 추정이다: 그 기종들은 '향상된 손떨림 보정'이 없거나 자르는 폭이
 * 달라, 실제 화각이 55.9° 보다 넓을 수 있다(자르기가 15 Pro Max 보다 1.1배 덜하면 약 6% — 그만큼 구속이 높게 나온다).
 * 짝이 쌓일 때까지 estimate 로 표시하고 렌즈 보정을 권한다. 초광각(13mm)은 왜곡 보정 · 자르기가 달라서, 망원(77 ·
 * 120mm)은 다른 센서라서 짐작하지 않는다.
 */
export function videoFovInfo(lens: VideoLens | null): VideoFov | null {
  if (!lens) return null;
  const text = `${lens.model ?? ''} ${lens.lens ?? ''}`;
  if (!/iPhone/i.test(text) || !/back/i.test(text)) return null;
  const f35 = lens.focal35;
  if (f35 == null || !(f35 >= MAIN_SENSOR_FOCAL35[0] && f35 <= MAIN_SENSOR_FOCAL35[1])) return null;
  const half = Math.atan((Math.tan((IPHONE_VIDEO_MAIN_FOV_DEG * Math.PI) / 360) * IPHONE_VIDEO_MAIN_FOCAL35) / f35);
  return {
    fovDeg: Math.round(((half * 360) / Math.PI) * 10) / 10,
    estimate: f35 !== IPHONE_VIDEO_MAIN_FOCAL35,
  };
}

/**
 * 윤곽 비율(α) · 위 화각을 스피드건 짝으로 맞춘 카메라인가 — 아이폰 15 Pro · Pro Max 뒷면 메인(환산 24mm). 짝은 이
 * 카메라에서만 나왔다(2차 보정). 같은 센서의 2x(48mm) · 다른 기종은 값은 내되 '보정 조건 밖'으로 친다(analyze-frames
 * calibrated — ± 를 넓히고 믿음은 '보통'까지).
 */
export function isCalibratedCamera(lens: VideoLens | null): boolean {
  if (!lens) return false;
  const text = `${lens.model ?? ''} ${lens.lens ?? ''}`;
  return /iPhone 15 Pro\b/i.test(text) && /back/i.test(text) && lens.focal35 === IPHONE_VIDEO_MAIN_FOCAL35;
}

/** 화각 숫자만 — 예전 이름 그대로(부르는 곳이 많다) */
export function videoFovFor(lens: VideoLens | null): number | null {
  return videoFovInfo(lens)?.fovDeg ?? null;
}

/** '아이폰 15 Pro Max · 24mm' 같은 한 줄 */
export function videoLensText(lens: VideoLens | null): string | null {
  if (!lens) return null;
  const parts = [lens.model, lens.focal35 != null ? `${lens.focal35}mm` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
