import type { ConfidenceKey } from '@/lib/velocity-meta';

/**
 * 측정 화면(app/(session)/velocity/velocity-screen.tsx)이 세션 중 · 세션 요약 · 이전 공 시트에
 * 넘기는 공 하나 — 화면에 보일 만큼만. 잰 값(rawKmh)과 보정한 값(kmh)을 둘 다 든다.
 * 서버 저장 모양(SavePitchInput)은 따로다 — 화면 부품이 저장 모양에 묶이지 않게.
 */
export type SessionPitch = {
  id: number;
  /** 1부터 — 세션에서 몇 번째 공 */
  seq: number;
  /** 보정 뒤 km/h(화면에 보이는 값). 단위 바꾸기는 부르는 쪽이 한다(lib/units.ts) */
  kmh: number;
  /** 카메라 값(보정 전) km/h */
  rawKmh: number;
  errorKmh: number;
  confidence: ConfidenceKey;
  /** 릴리스 구속 추정(보정 뒤) km/h */
  releaseKmh: number | null;
  releaseDxCm: number | null;
  releaseDyCm: number | null;
  releaseDistM: number | null;
  travelM: number | null;
  durationSec: number | null;
  frames: number | null;
  fps: number | null;
  /** lib/velocity-meta.ts 의 PITCH_TYPES 키 */
  pitchType: string | null;
  /** 코스 1~9(왼쪽 위부터, 투수 시점) */
  zone: number | null;
  /** 'strike' · 'ball' */
  result: string | null;
  gunKmh: number | null;
  memo: string | null;
  autoDetected: boolean;
  source: 'camera' | 'file';
  /** 이 폰에 든 영상 클립(blob URL). 아직 안 왔거나 버렸으면 null */
  clip: { url: string; durationSec: number; eventSec: number } | null;
};

/** 던지는 손 — 회전축 그림이 좌우를 뒤집는 데 쓴다. 프로필의 '우투' · '좌투' · '양투'에서 온다 */
export type ThrowingHand = 'right' | 'left';

/** 프로필 값('우투' · '좌투' · '양투' · 없음)을 그림용 손으로 — 양투 · 없음은 오른손으로 본다 */
export function throwingHandOf(profile: string | null | undefined): ThrowingHand {
  return profile === '좌투' ? 'left' : 'right';
}

/** 측정 화면 안의 화면들 — 관리자 점프 단추(components/velocity/admin-jump.tsx)가 이 이름으로 옮긴다 */
export const VELOCITY_SCREENS = [
  { key: 'ask', label: '지난 설정 묻기', hint: '저장된 설정이 있을 때 첫 화면' },
  { key: 'type', label: '어떤 투구', hint: '불펜 · 라이브 · 경기 · 캐치볼' },
  { key: 'camera', label: '카메라 위치', hint: '투수 뒤 · 포수 뒤' },
  { key: 'net', label: '네트', hint: '있음 · 없음' },
  { key: 'tips', label: '주의사항 창', hint: '카메라 화면 위 팝업' },
  { key: 'align', label: '수평 · 표적', hint: '카메라 맞추기' },
  { key: 'zone', label: '스트라이크 존', hint: '존 놓기' },
  { key: 'lens', label: '렌즈 보정', hint: '공으로 초점거리 재기' },
  { key: 'measure', label: '측정 대기', hint: '카메라 앱 모양 · 시작 전' },
  { key: 'live', label: '측정 중', hint: '세션 화면 · 구속 · 구종 · 회전축' },
  { key: 'summary', label: '세션 요약', hint: '세션 종료 뒤 · 저장 · 계속' },
] as const;

export type VelocityScreenKey = (typeof VELOCITY_SCREENS)[number]['key'];

/**
 * 구속 측정 메인 화면(/velocity)의 지난 세션 한 줄 — 세션마다 최고 · 평균 · 공 수.
 * 서버가 lib/velocity-load.ts 의 loadVelocityHistory 로 만들어 넘긴다(components/velocity/session-history.tsx).
 */
export type VelocityHistoryItem = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** ISO — 같은 날 여러 세션의 차례 */
  createdAt: string;
  /** 같이 만든 투구 기록의 종류(불펜 · 라이브 · 경기 · 캐치볼). 없으면 null */
  sessionType: string | null;
  /** 늘 'pitch' — 타구 측정('hit')은 2026-10-03 뺐다(DB 칸만 남음) */
  mode: string;
  /** 'behind-pitcher' · 'behind-catcher' */
  cameraPos: string;
  net: boolean;
  n: number;
  /** 보정 뒤 km/h */
  maxKmh: number;
  avgKmh: number;
  /** 구종 키별 공 수 — 안 고른 공은 빠진다 */
  byType: Record<string, number>;
};
