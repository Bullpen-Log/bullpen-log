/**
 * 구속 측정에서 사람이 고르는 것들 — 구종 · 코스 · 결과 — 과 화면 · 서버가 같이 쓰는 모양.
 *
 * 구종은 투수가 던지고 나서 직접 고른다. 카메라는 뒤에서 공 크기만 보므로 구종을 알 수 없다
 * (Smart Scout · PitchLab 도 그렇다). 코스는 스트라이크 존 9칸 — 카메라가 투수 뒤라 왼쪽 · 오른쪽은
 * 투수가 보는 대로다.
 */

import type { ZoneRect } from '@/lib/velocity-setup';

/**
 * 측정을 저장하며 같이 만든 투구 기록의 메모 머리. 이 표시가 있는 기록만 공을 지울 때 투구수 ·
 * 구속을 다시 맞추고, 세션을 지울 때 같이 지운다 — 사람이 따로 적은 기록은 건드리지 않는다.
 */
export const VELOCITY_MEMO_MARK = '[구속 측정]';

export const PITCH_TYPES = [
  { key: 'fastball', label: '직구' },
  { key: 'two-seam', label: '투심' },
  { key: 'cutter', label: '커터' },
  { key: 'slider', label: '슬라이더' },
  { key: 'curve', label: '커브' },
  { key: 'changeup', label: '체인지업' },
  { key: 'splitter', label: '포크 · 스플리터' },
  { key: 'other', label: '기타' },
] as const;

export type PitchTypeKey = (typeof PITCH_TYPES)[number]['key'];
export const PITCH_TYPE_KEYS: readonly string[] = PITCH_TYPES.map((t) => t.key);

export function pitchTypeLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return PITCH_TYPES.find((t) => t.key === key)?.label ?? null;
}

/** 코스 — 1~9, 왼쪽 위부터 줄 순서(투수 시점). 0 · null 은 안 고른 것 */
export const ZONE_MIN = 1;
export const ZONE_MAX = 9;
const ZONE_ROWS = ['높은', '가운데', '낮은'] as const;
const ZONE_COLS = ['왼쪽', '가운데', '오른쪽'] as const;

export function zoneLabel(zone: number | null | undefined): string | null {
  if (zone == null || zone < ZONE_MIN || zone > ZONE_MAX) return null;
  const row = ZONE_ROWS[Math.floor((zone - 1) / 3)];
  const col = ZONE_COLS[(zone - 1) % 3];
  if (row === '가운데' && col === '가운데') return '한가운데';
  return `${row} ${col === '가운데' ? '' : col}`.trim();
}

export const PITCH_RESULTS = [
  { key: 'strike', label: '스트라이크' },
  { key: 'ball', label: '볼' },
] as const;
export type PitchResultKey = (typeof PITCH_RESULTS)[number]['key'];
export const PITCH_RESULT_KEYS: readonly string[] = PITCH_RESULTS.map((r) => r.key);

export const CONFIDENCE_TEXT = {
  high: '신뢰도 높음',
  medium: '신뢰도 보통',
  low: '신뢰도 낮음',
} as const;
export type ConfidenceKey = keyof typeof CONFIDENCE_TEXT;

/** 화면이 받는 공 하나 — 서버에서 읽은 것과 화면에서 막 잰 것이 같은 모양 */
export type VelocityPitchView = {
  id: string;
  seq: number;
  rawKmh: number;
  kmh: number;
  errorKmh: number;
  confidence: ConfidenceKey;
  releaseKmh: number | null;
  releaseDxCm: number | null;
  releaseDyCm: number | null;
  releaseDistM: number | null;
  travelM: number | null;
  durationSec: number | null;
  frames: number | null;
  fps: number | null;
  pitchType: string | null;
  zone: number | null;
  result: string | null;
  gunKmh: number | null;
  memo: string | null;
  /** 공 하나의 영상 — 서명 재생 주소(한 시간). 없으면(올리기 전에 끊김 · 옛 공) null */
  clip?: PitchClipView | null;
  /** 같은 공을 광각 카메라로 함께 찍은 영상(아이폰 앱 · 설정 '광각 영상도 같이 저장') */
  wideClip?: PitchClipView | null;
  /** 잰 순간의 스트라이크 존(카메라 장면 비율) — 영상 위에 겹친다. 옛 공 · 영상 파일은 없다 */
  zoneRect?: ZoneRect | null;
};

/** 하루치 카메라 측정 한 줄 — 공 수 · 최고(km/h) · 영상이 남은 공 수(홈 캘린더 정보 · 투구 기록 캘린더) */
export type VelocityDayFact = {
  n: number;
  max: number;
  clips: number;
  /**
   * 그날 공들의 지문(구종 · 코스 · 구속 · 클립) — 그날 화면에서 구종만 고쳐도 바뀐다. 홈이 이것으로 받아 둔 그날 클립 목록을
   * 버리고 새로 받는다(공 수 · 최고만 보면 구종을 고친 것은 못 잡아 홈 칩에 옛 구종이 남았다).
   */
  sig: string;
};

/** 홈 캘린더 정보의 영상 칸이 받는 클립 하나 — 클립이 남은 공만, 일반 카메라 영상만 */
export type DayClip = {
  id: string;
  seq: number;
  kmh: number;
  pitchType: string | null;
  zone: number | null;
  zoneRect: ZoneRect | null;
  clip: PitchClipView;
  /** 'behind-pitcher' · 'behind-catcher' — 존 칸을 어느 쪽에서 보는가 */
  cameraPos: string;
};

/** 그날 화면이 받는 영상 하나 */
export type PitchClipView = {
  url: string;
  /** 영상 안에서 던진 시각(초) — 재생기가 이 조금 앞에서 시작한다 */
  eventSec: number | null;
  sec: number | null;
};

export type VelocitySessionView = {
  id: string;
  date: string;
  pitchLogId: string | null;
  fovDeg: number;
  calScale: number;
  calOffset: number;
  calPairs: number;
  source: string;
  /** 늘 'pitch' — 타구 측정('hit')은 2026-10-03 뺐다(DB 칸만 남음) */
  mode: string;
  /** 'behind-pitcher' · 'behind-catcher' */
  cameraPos: string;
  net: boolean;
  device: string | null;
  createdAt: string;
  pitches: VelocityPitchView[];
};

/** '투구 · 투수 뒤 · 네트 있음' — 세션 머리 한 줄 */
export function sessionSetupText(s: { cameraPos: string; net: boolean }) {
  return [
    s.cameraPos === 'behind-catcher' ? '포수 뒤' : '투수 뒤',
    s.net ? '네트 있음' : '네트 없음',
  ].join(' · ');
}

/** 사람이 고치는 칸 — 측정 화면과 그날 화면이 같은 편집기를 쓴다 */
export type PitchEdit = {
  pitchType: string | null;
  zone: number | null;
  result: string | null;
  gunKmh: number | null;
  memo: string | null;
};

/** 세션 요약 — 최고 · 평균 · 스트라이크 비율 · 릴리스 포인트 흩어짐 */
export function summarize(
  pitches: {
    kmh: number;
    result: string | null;
    releaseDxCm: number | null;
    releaseDyCm: number | null;
  }[]
) {
  if (pitches.length === 0) return null;
  const kmhs = pitches.map((p) => p.kmh);
  const max = Math.max(...kmhs);
  const avg = Math.round((kmhs.reduce((s, v) => s + v, 0) / kmhs.length) * 10) / 10;
  const judged = pitches.filter((p) => p.result === 'strike' || p.result === 'ball');
  const strikes = judged.filter((p) => p.result === 'strike').length;
  const points = pitches.filter((p) => p.releaseDxCm != null && p.releaseDyCm != null);
  let spreadCm: number | null = null;
  if (points.length >= 2) {
    const mx =
      points.reduce((s, p) => s + (p.releaseDxCm as number), 0) / points.length;
    const my =
      points.reduce((s, p) => s + (p.releaseDyCm as number), 0) / points.length;
    const r =
      points.reduce(
        (s, p) =>
          s +
          Math.hypot((p.releaseDxCm as number) - mx, (p.releaseDyCm as number) - my),
        0
      ) / points.length;
    spreadCm = Math.round(r * 10) / 10;
  }
  return {
    n: pitches.length,
    max,
    avg,
    strikeRate: judged.length ? Math.round((strikes / judged.length) * 100) : null,
    judged: judged.length,
    spreadCm,
  };
}
