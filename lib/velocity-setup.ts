/**
 * 구속 측정 설정 — 카메라를 켜기 전에 고르는 것들과 스트라이크 존 자리.
 *
 * 브라우저(localStorage)에 남겨 두어 다음에 "지난 설정 그대로 쓸까요?"로 바로 카메라까지 간다.
 * 폰마다 자리가 달라(삼각대 높이 · 거리) 계정이 아니라 기기에 둔다.
 */

import type { Approach } from '@/lib/velocity-engine/analyze-frames';

export const SETUP_KEY = 'bullpen-velocity-setup';
/** 같은 탭 안에서 설정이 바뀌었다고 알리는 신호 — storage 이벤트는 다른 탭에만 간다 */
export const SETUP_CHANGE_EVENT = 'bullpen:velocity-setup';

export type RecordMode = 'pitch' | 'hit';
export type CameraPos = 'behind-pitcher' | 'behind-catcher';

/**
 * 스트라이크 존 — 카메라 장면(원본 프레임) 기준 0~1 비율(왼쪽 위 x · y, 폭 · 높이).
 *
 * 예전에는 뷰파인더 칸 기준이었다. 그런데 칸 모양이 단계마다 달라(존 놓기는 좁은 칸, 측정은 꽉 찬
 * 칸) 뷰파인더가 장면을 다르게 잘라 보여 주니, 같은 비율이 장면의 다른 자리를 가리켰다 — 놓은 존이
 * 측정 화면에서 다른 자리 · 다른 크기로 보였다. 장면 기준으로 두고 그릴 때마다 칸에 맞춰 바꾼다
 * (frameRectToView · viewRectToFrame).
 */
export type ZoneRect = { x: number; y: number; w: number; h: number };

export type VelocitySetup = {
  mode: RecordMode;
  cameraPos: CameraPos;
  net: boolean;
  zone: ZoneRect;
  /** 잰 구속을 소리로 읽어 줄까 */
  voice: boolean;
  /** 스피드건 보정식을 적용할까 */
  useCal: boolean;
  /**
   * 포수 뒤에서 찍을 때, 카메라에서 릴리스 지점까지의 거리(m). 다가오는 공은 마지막 몇 m 만
   * 보이므로 이 거리만큼 공기저항을 되돌려 릴리스 구속을 낸다(1m 에 약 0.8km/h).
   * 정규 마운드(18.44m)에서 릴리스가 판보다 약 1.8m 앞, 카메라가 홈플레이트 뒤 약 1.8m 면 ≈ 18.5m.
   */
  releaseDistM: number;
  /** 자동 측정 — 켜 두면 공마다 알아서 잡는다. 끄면 공마다 단추를 눌러 기다린다 */
  autoMode: boolean;
  /** 관리자의 '정확도 보정용 저장' — 켜고 재면 공마다 영상 클립 · 분석 자료를 올린다(관리자만 효과) */
  calibSave: boolean;
  savedAt: string;
};

export const RELEASE_DIST_MIN = 3;
export const RELEASE_DIST_MAX = 40;

export const MODE_OPTIONS: { key: RecordMode; label: string; hint: string }[] = [
  { key: 'pitch', label: '투구 녹화', hint: '투수가 던진 공의 구속' },
  { key: 'hit', label: '타격 녹화', hint: '방망이에 맞고 나가는 타구 속도' },
];

export const CAMERA_OPTIONS: { key: CameraPos; label: string; hint: string }[] = [
  {
    key: 'behind-pitcher',
    label: '투수 뒤',
    hint: '1m 이내 · 공이 멀어져요 · 릴리스 포인트까지 잡혀요',
  },
  {
    key: 'behind-catcher',
    label: '포수 뒤',
    hint: '네트 뒤 1~3m · 공이 다가와요 · 코스가 잘 보여요',
  },
];

export const NET_OPTIONS: { key: boolean; label: string; hint: string }[] = [
  {
    key: true,
    label: '네트 있음',
    hint: '초점을 고정해요(수동초점) — 그물코에 초점이 안 잡히게',
  },
  { key: false, label: '네트 없음', hint: '자동초점 · 포수나 벽까지 잰다' },
];

/** 처음 놓이는 스트라이크 존 — 화면 가운데 조금 아래, 폭 40% · 높이 30% */
export const DEFAULT_ZONE: ZoneRect = { x: 0.3, y: 0.42, w: 0.4, h: 0.3 };

export const DEFAULT_SETUP: Omit<VelocitySetup, 'savedAt'> = {
  mode: 'pitch',
  cameraPos: 'behind-pitcher',
  net: true,
  zone: DEFAULT_ZONE,
  voice: false,
  useCal: true,
  releaseDistM: 18.5,
  autoMode: true,
  calibSave: false,
};

const isRect = (z: unknown): z is ZoneRect =>
  !!z &&
  typeof z === 'object' &&
  ['x', 'y', 'w', 'h'].every((k) => {
    const v = (z as Record<string, unknown>)[k];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  });

export function loadSetup(): VelocitySetup | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<VelocitySetup>;
    if (p.mode !== 'pitch' && p.mode !== 'hit') return null;
    if (p.cameraPos !== 'behind-pitcher' && p.cameraPos !== 'behind-catcher')
      return null;
    return {
      mode: p.mode,
      cameraPos: p.cameraPos,
      net: p.net !== false,
      zone: isRect(p.zone) ? p.zone : DEFAULT_ZONE,
      voice: p.voice === true,
      useCal: p.useCal !== false,
      releaseDistM:
        typeof p.releaseDistM === 'number' &&
        p.releaseDistM >= RELEASE_DIST_MIN &&
        p.releaseDistM <= RELEASE_DIST_MAX
          ? p.releaseDistM
          : DEFAULT_SETUP.releaseDistM,
      autoMode: p.autoMode !== false,
      calibSave: p.calibSave === true,
      savedAt: typeof p.savedAt === 'string' ? p.savedAt : '',
    };
  } catch {
    return null;
  }
}

export function saveSetup(setup: Omit<VelocitySetup, 'savedAt'>): VelocitySetup {
  const full = { ...setup, savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(full));
  } catch {
    /* 사생활 보호 모드 등 — 이번만 쓴다 */
  }
  window.dispatchEvent(new Event(SETUP_CHANGE_EVENT));
  return full;
}

/** 저장된 설정을 지운다 — 다음 측정 때 처음부터 다시 묻는다 */
export function clearSetup() {
  try {
    localStorage.removeItem(SETUP_KEY);
  } catch {
    /* 위와 같다 */
  }
  window.dispatchEvent(new Event(SETUP_CHANGE_EVENT));
}

/**
 * 공이 카메라에서 멀어지나 다가오나 — 엔진이 크기 변화 방향을 정하는 데 쓴다.
 *
 * 투구를 투수 뒤에서 찍으면 멀어지고, 포수 뒤에서 찍으면 다가온다. 타구는 반대다 — 포수 뒤에서
 * 찍으면 맞고 나가는 공이 멀어지고, 투수 뒤(마운드 뒤)에서 찍으면 다가온다.
 */
export function approachOf(setup: Pick<VelocitySetup, 'mode' | 'cameraPos'>): Approach {
  const away = setup.mode === 'pitch' ? 'behind-pitcher' : 'behind-catcher';
  return setup.cameraPos === away ? 'receding' : 'approaching';
}

export function modeLabel(mode: RecordMode) {
  return mode === 'hit' ? '타구' : '구속';
}

export function setupSummary(s: Pick<VelocitySetup, 'mode' | 'cameraPos' | 'net'>) {
  return [
    MODE_OPTIONS.find((o) => o.key === s.mode)?.label,
    CAMERA_OPTIONS.find((o) => o.key === s.cameraPos)?.label,
    s.net ? '네트 있음' : '네트 없음',
  ].join(' · ');
}

/**
 * 뷰파인더 안의 한 점(0~1)이 스트라이크 존의 어느 칸인가 — 1~9, 왼쪽 위부터. 밖이면 null.
 * 카메라가 투수 뒤면 화면의 왼쪽이 투수의 왼쪽이라 그대로, 포수 뒤면 좌우가 뒤집힌다.
 */
/** 장면 비율(0~1)의 점이 존의 몇 번째 칸(1~9, 투수 시점)인가 — 존 밖이면 null */
export function zoneOfPoint(
  px: number,
  py: number,
  rect: ZoneRect,
  cameraPos: CameraPos
): number | null {
  const u = (px - rect.x) / rect.w;
  const v = (py - rect.y) / rect.h;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
  let col = Math.min(2, Math.floor(u * 3));
  const row = Math.min(2, Math.floor(v * 3));
  if (cameraPos === 'behind-catcher') col = 2 - col;
  return row * 3 + col + 1;
}

/**
 * 카메라 프레임 안의 점(픽셀)을 뷰파인더 비율(0~1)로 — 뷰파인더는 object-cover 라 프레임의
 * 가장자리가 잘려 보인다. 잘린 만큼을 빼고 비율로 바꾼다. 화면 밖이면 0~1 을 벗어난 값이 나온다.
 */
export function frameToView(
  point: { x: number; y: number },
  frame: { width: number; height: number },
  view: { width: number; height: number }
): { x: number; y: number } {
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  const shownW = frame.width * scale;
  const shownH = frame.height * scale;
  const offX = (view.width - shownW) / 2;
  const offY = (view.height - shownH) / 2;
  return {
    x: (point.x * scale + offX) / view.width,
    y: (point.y * scale + offY) / view.height,
  };
}

/**
 * object-cover 로 채운 뷰파인더에 장면의 어느 부분이 보이나 — 보이는 조각을 장면 비율(0~1)로.
 * 칸이 장면보다 넓적하면 위아래가, 홀쭉하면 양옆이 잘린다.
 */
export function visibleFrameRect(
  frame: { width: number; height: number },
  view: { width: number; height: number }
): ZoneRect {
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  const w = view.width / scale / frame.width;
  const h = view.height / scale / frame.height;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** 장면 비율 사각형 → 뷰파인더 비율 사각형(칸 밖이면 0~1 을 벗어난다) */
export function frameRectToView(
  rect: ZoneRect,
  frame: { width: number; height: number },
  view: { width: number; height: number }
): ZoneRect {
  const v = visibleFrameRect(frame, view);
  return {
    x: (rect.x - v.x) / v.w,
    y: (rect.y - v.y) / v.h,
    w: rect.w / v.w,
    h: rect.h / v.h,
  };
}

/** 뷰파인더 비율 사각형 → 장면 비율 사각형 */
export function viewRectToFrame(
  rect: ZoneRect,
  frame: { width: number; height: number },
  view: { width: number; height: number }
): ZoneRect {
  const v = visibleFrameRect(frame, view);
  return {
    x: v.x + rect.x * v.w,
    y: v.y + rect.y * v.h,
    w: rect.w * v.w,
    h: rect.h * v.h,
  };
}
