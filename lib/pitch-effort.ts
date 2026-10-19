import {
  EFFORT_STEP,
  MAX_EFFORT_PCT,
  MIN_EFFORT_PCT,
  effortToIntensity,
  trustedEffortPct,
} from '@/lib/pitch-stats';

/**
 * 투구 기록의 체감 강도(%)를 받고 남기는 규칙 — 입력 폼 · 투구 기록 API · 구속 측정 저장 · 재활 복귀표가 같이 쓴다
 * (트레이닝 추천 2판 D2, 2026-10-12).
 *
 * 읽는 규칙(effortPctOf · intensityOf)은 lib/pitch-stats.ts 에 있다. 여기는 쓰는 쪽이다. 따로 둔 까닭: 쓰는 길이 넷이라
 * 각자 검사하면 한쪽만 고쳐져 어긋난다(85 를 받아 intensity 를 8 로 남기는 곳 · 0 을 받는 곳이 생긴다).
 *
 * 저장은 늘 둘 다 한다 — effortPct 와 intensity = effortToIntensity(effortPct). 1~10 을 읽는 옛 코드 · 상대방 컴퓨터의
 * 옛 클라이언트가 그대로 돈다. 옛 화면(배포 직전에 열어 둔 탭 · 옛 앱)은 intensity 만 보낸다. 그때는 effortPct 를 비운다
 * (null). 읽을 때 effortPctOf 가 intensity × 10 으로 메우니 값은 같고, null 은 '사용자가 % 로 고른 적 없음'이라는 뜻을 지킨다.
 *
 * 순수 파일 — server-only · prisma · 날짜 함수 없음. 화면(클라이언트)과 서버, 자체 시험이 그대로 부른다.
 */

/**
 * 입력 칩 — 화면은 1~10, 값은 그 × 10 의 %(10 · 20 … 100). 2026-10-18 사용자: "50~100% 를 1~10 으로 다시".
 * 저장 · 계산은 그대로 체감 강도 %(effortPct)라 부하 · 추천 엔진은 바뀌지 않는다.
 */
export const EFFORT_CHIPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

/** % → 화면의 1~10 글 — 90 → '9', 85(예전 % 로 고른 기록) → '8.5' */
export function effortScaleText(pct: number): string {
  return String(Math.round(pct) / 10);
}

/** 5% 칸에 맞춘다(83 → 85 · 82 → 80). 범위 검사는 부르는 쪽이 먼저 한다 */
export function snapEffortPct(pct: number): number {
  return Math.round(pct / EFFORT_STEP) * EFFORT_STEP;
}

/** −/+ 한 번 — 5% 씩, 5~100 안에서 멈춘다 */
export function stepEffortPct(pct: number, dir: 1 | -1): number {
  return Math.min(
    MAX_EFFORT_PCT,
    Math.max(MIN_EFFORT_PCT, snapEffortPct(pct) + dir * EFFORT_STEP)
  );
}

/** 저장할 두 칸 — 체감 강도(%)를 고른 기록. 쉰 날은 이 함수를 거치지 않는다(effortPct null · intensity 0) */
export function effortFields(pct: number): { effortPct: number; intensity: number } {
  return { effortPct: pct, intensity: effortToIntensity(pct) };
}

export type EffortInput =
  | { error: string }
  | {
      /** 저장할 체감 강도(%). 쉰 날 · 옛 화면이 intensity 만 보낸 기록은 null */
      effortPct: number | null;
      /** 저장할 1~10(쉰 날 0) */
      intensity: number;
      /**
       * effortPct 를 받지 않고 옛 intensity 로 읽었다. 고치기(PATCH)가 저장된 % 를 지킬지 정할 때 본다
       * (effortUpdate) — 85% 로 남긴 기록을 옛 탭에서 메모만 고쳐도 90% 로 바뀌면 안 된다.
       */
      legacy: boolean;
    };

const EFFORT_RANGE_ERROR = `체감 강도는 ${MIN_EFFORT_PCT}~${MAX_EFFORT_PCT}% 사이로 골라 주세요.`;
export const EFFORT_MISSING_ERROR = '체감 강도를 골라 주세요.';

/** 비어 있음 — 칸이 없거나 null · 빈 글자. 숫자 0 은 비어 있음이 아니다(범위 밖으로 거절한다) */
const blank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '');

/**
 * 몸에서 온 체감 강도를 검사한다. effortPct(5~100, 5% 칸으로 맞춤)가 있으면 그것으로 둘 다 채우고, 없으면 옛 intensity(1~10)
 * 를 받는다(effortPct null · legacy). 쉰 날(resting)은 늘 effortPct null · intensity 0 — 화면이 칸을 감춰 값이 안 온다.
 *
 * 0~4% 는 받지 않는다. 0 은 '안 던진 날'과 헷갈리고(쉰 날은 intensity 0 으로 남는다) 부하 셈이 0 으로 읽는다.
 * 안 던졌으면 종류에서 휴식을 고른다.
 */
export function readEffortInput(
  body: { effortPct?: unknown; intensity?: unknown },
  resting: boolean
): EffortInput {
  if (resting) return { effortPct: null, intensity: 0, legacy: false };

  if (!blank(body.effortPct)) {
    const raw =
      typeof body.effortPct === 'number'
        ? body.effortPct
        : Number(String(body.effortPct));
    if (!Number.isFinite(raw) || raw < MIN_EFFORT_PCT || raw > MAX_EFFORT_PCT) {
      return { error: EFFORT_RANGE_ERROR };
    }
    return { ...effortFields(snapEffortPct(raw)), legacy: false };
  }

  if (blank(body.intensity)) return { error: EFFORT_MISSING_ERROR };
  /* 옛 화면은 range 칸의 글자('7')를 보냈다 — 예전 검사(parseInt)와 같게 읽는다 */
  const intensity = Number.parseInt(String(body.intensity), 10);
  if (Number.isNaN(intensity) || intensity < 1 || intensity > 10) {
    return { error: '투구 강도는 1에서 10 사이여야 해요.' };
  }
  return { effortPct: null, intensity, legacy: true };
}

/**
 * 고치기(PATCH)에 넣을 강도 칸 — 저장돼 있던 1~10(stored)을 보고 정한다.
 *   % 를 받았거나 쉰 날   → 두 칸 다 덮는다
 *   옛 화면 · 같은 강도   → intensity 만(저장된 effortPct 85 를 지킨다 — 옛 탭은 9 로 보였고 그대로 보냈을 뿐)
 *   옛 화면 · 다른 강도   → effortPct 를 비운다(85 를 두면 새로 고른 6 보다 85 가 읽힌다)
 */
export function effortUpdate(
  input: Exclude<EffortInput, { error: string }>,
  stored: number
): { intensity: number; effortPct?: number | null } {
  if (!input.legacy) return { effortPct: input.effortPct, intensity: input.intensity };
  if (input.intensity === stored) return { intensity: input.intensity };
  return { effortPct: null, intensity: input.intensity };
}

/**
 * 이 기록의 체감 강도를 화면이 쓸 꼴로 — 폼을 채울 때 · '강도 9에서 계산' 같은 표시를 붙일 때.
 * 쉰 날(안 던짐)은 null. derivedFrom 은 effortPct 가 없어 옛 1~10 에서 바꾼 값일 때 그 1~10(아니면 null).
 * effortPct 는 trustedEffortPct 로만 읽는다 — 옛 코드가 intensity 만 고쳐 낡은 % 가 남은 줄(쉰 날 + 85 · 6 + 85)은 옛 칸이 이긴다.
 */
export function readEffort(log: {
  intensity: number;
  effortPct?: number | null;
}): { pct: number; derivedFrom: number | null } | null {
  const pct = trustedEffortPct(log);
  if (pct != null) return { pct, derivedFrom: null };
  if (log.intensity >= 1)
    return { pct: log.intensity * 10, derivedFrom: log.intensity };
  return null;
}

/** 옛 1~10 에서 바꾼 값임을 알리는 짧은 글 — '강도 9에서 계산'. % 로 고른 기록 · 쉰 날은 null */
export function derivedEffortText(
  read: { derivedFrom: number | null } | null
): string | null {
  return read?.derivedFrom != null ? `강도 ${read.derivedFrom}에서 계산` : null;
}

/* ------------------------------------------------------------------ *
 * 화면에 보이는 체감 강도(2판 D2 표시, 2026-10-12)
 *
 * 입력이 % 로 바뀌었는데 달력 · 그날 요약 · 분석이 '강도 9' · '9/10' 을 그대로 보이면 사용자가 고른 85% 와 다른
 * 숫자를 본다. 보이는 곳은 모두 아래 셋으로 % 를 만든다(값은 readEffort · effortPctOf 와 같은 규칙 — effortPct 가
 * 있으면 그것, 옛 기록은 intensity × 10). 칸 색 · '강도 80% 이상' 같은 문턱도 이 % 로 견준다.
 * ------------------------------------------------------------------ */

/** 기록 한 건의 강도 글 — 1~10('9', 예전 85% 기록은 '8.5'). 쉰 날 · 강도를 안 적은 기록은 null(2026-10-18 1~10 으로 되돌림) */
export function effortText(log: {
  intensity: number;
  effortPct?: number | null;
}): string | null {
  const read = readEffort(log);
  return read ? effortScaleText(read.pct) : null;
}

/** 여러 기록(같은 날) 가운데 가장 센 체감 강도(%) — 달력 칸 색 · 그날 요약. 던진 기록이 없으면 0 */
export function maxEffortPct(
  logs: readonly { intensity: number; effortPct?: number | null }[]
): number {
  return logs.reduce((max, log) => Math.max(max, readEffort(log)?.pct ?? 0), 0);
}

/**
 * 1~10 눈금의 값(실수)을 화면의 정수 % 로 — 하루 평균(DayTotals.intensity) · 기간 평균 · 최고 · 이틀 합, 투구 계획의
 * 강도 범위(DayPlan.min/maxIntensity). 하루 가중평균은 7.33 같은 실수라 반올림한다(73%).
 */
export function scaleToEffortPct(intensity: number): number {
  return Math.round(intensity * 10);
}

/** 달력 칸을 가장 진하게(흰 글자) 칠하는 체감 강도(%) — 예전 1~10 의 8 */
export const STRONG_EFFORT_PCT = 80;
/** 중간 진하기의 바닥 — 예전 1~10 의 5 */
export const MID_EFFORT_PCT = 50;

/**
 * 칸 색의 띠 — components/month-calendar.tsx effortClass 가 색으로 바꾼다(홈 캘린더 · 투구 기록 달력 · 영상 목록).
 * 문턱이 예전 1~10 의 × 10 이라 옛 기록은 같은 띠다. 화면 파일(.tsx)은 자체 시험이 못 읽어 규칙만 여기 둔다.
 */
export function effortBand(effortPct: number): 'strong' | 'mid' | 'light' {
  if (effortPct >= STRONG_EFFORT_PCT) return 'strong';
  if (effortPct >= MID_EFFORT_PCT) return 'mid';
  return 'light';
}

/*
 * 강도 기준표의 글 — 웹 components/intensity-guide.tsx · 앱 native/src/app/pitch/edit.tsx 가 같이 읽는다. 2026-10-20 김민: 설명이
 * '얼마나 세게 던졌나'로 읽혀 틀렸다 → 오늘 던진 뒤 팔이 얼마나 지치고 부담이 갔는지를 묻는 글로. 칩 값 · 저장(%)은 그대로.
 */
export const PITCH_EFFORT_ASK = '강도는 팔이 얼마나 지쳤는지로 골라요';
export const PITCH_EFFORT_INTRO = '오늘 던진 공 전체로 팔이 얼마나 피로했는지, 부하가 얼마나 걸렸는지를 골라요.';
export const PITCH_EFFORT_LEVELS = [
  { range: '1 – 2', label: '거의 부담 없음', detail: '팔이 전혀 지치지 않았어요. 가까운 거리 캐치볼 정도예요.' },
  { range: '3 – 4', label: '가벼운 피로', detail: '팔에 조금 힘이 들어갔지만 금방 풀려요. 롱토스 워밍업 정도예요.' },
  { range: '5 – 6', label: '적당한 부하', detail: '팔이 적당히 지쳤어요. 불펜 초반이나 폼 점검 정도예요.' },
  { range: '7 – 8', label: '꽤 지침', detail: '팔이 무겁고 피로가 남아요. 불펜 본 세션, 라이브 정도예요.' },
  { range: '9 – 10', label: '다 씀', detail: '팔을 다 썼어요. 하루 이틀 쉬어야 할 만큼 부하가 컸어요. 경기 정도예요.' },
] as const;
export const PITCH_EFFORT_WARN = {
  strong: '느낌보다 팔에 가는 부담은 커요.',
  rest: '절반 힘으로 던져도 팔꿈치에는 최고의 75% 가 걸려요. 덜 지친 것 같아도 던진 만큼 적어 주세요.',
} as const;
