/**
 * 메커니즘 드릴을 오늘 접는가 — 팔 예산(등판 보호) · 통증 확인 전(안전) · 오늘 어깨 · 팔꿈치 통증(D5)을 한 판정으로(트레이닝 추천 2판 P6 검토,
 * 2026-10-13, docs/designs/training-recommendation-engine.md).
 *
 * 왜 두는가. 2판 P6-5 는 사용자 결정 D5(통증 날만 던지기 · 메디신볼 드릴을 접고 '그래도 하기')만 넣고, 중재(lib/engine/arbiter.ts)의 위 두 층은
 * 메커니즘 화면이 읽지 않았다. 그래서 오늘 등판 · 오늘 경기 기록 · 오늘 세게 던진 날에도 던지기 드릴이 그대로 열렸고(중재 머리 주석은 등판 보호
 * 층이 메커니즘 던지기 드릴을 빼고 '그래도 하기'로도 못 넘긴다고 약속했다), 어제 어깨가 아팠는데 오늘 체크인이 없는 날(투구 계획 · 매일 일정 ·
 * 프로그램이 다 멈추는 날)에도 열렸다. 성장기(만 16세 미만)는 통증 날 '그래도 하기'로 던지기 드릴을 할 수 있었는데, 앱의 다른 규칙(lib/checkin.ts
 * ARM_PAIN_ROUTINE_MIN_AGE — 그 나이 밑은 통증을 운동으로 다루지 않고 진료를 권한다)과 부딪혔다.
 *
 * 차례(위가 이긴다 — 중재 arbitrate 의 mechanics 칸과 같은 차례, 자체 시험이 같은 답인지 본다):
 *   armSpent     오늘 팔을 다 썼다 — 오늘 등판(오늘 '오늘 등판', 또는 오늘 답 없이 어제 '내일 등판') · 오늘 '경기' 기록 · 오늘 세게 던진 날
 *                (Σ 투구수 × 체감 강도 ≥ 2,700 — lib/report/facts.ts isHardOuting). 접고 못 펼친다
 *   painUnknown  최근 7일 체크인에 통증이 있었는데 오늘 체크인이 없다(lib/report/prescription.ts painStateUnknown 과 같은 규칙). 접고 못 펼친다 —
 *                체크인을 남기면 그 답으로 다시 정한다
 *   pain         오늘 어깨 · 팔꿈치 '통증'(D5 — lib/mechanics/program.ts mechanicsPainFold). 성인은 펼쳐 '그래도 하기', 성장기는 못 펼친다(가정 —
 *                사용자 확인 전, ARM_PAIN_ROUTINE_MIN_AGE 와 같은 선)
 * 접는 드릴은 셋 다 같다 — 팔에 싣는 드릴(isArmLoaded: 스로잉 · 메디신볼). 무브먼트 드릴은 남는다(그날 할 수 있는 드릴).
 *
 * 순수 파일이다 — 'server-only' · prisma · 날짜 함수 없음. 화면 부품(클라이언트)이 부르는 lib/mechanics/program.ts 에 두지 않는 까닭: 투구 합 ·
 * 세게 던진 날 판정(lib/report/facts.ts)을 끌고 오면 클라이언트 번들이 무거워진다. 읽기는 lib/mechanics/load.ts 가 한다.
 */
import { CHECKIN_PARTS, hasPain, todayOutingRole } from '@/lib/checkin';
import { shiftDateKey } from '@/lib/pitch-stats';
import { addOutingLog, isHardOuting, type OutingTotals } from '@/lib/report/facts';
import {
  MECHANICS_FOLD_TEXT,
  mechanicsPainFold,
  type MechanicsPainFold,
} from '@/lib/mechanics/program';

/** 체크인 한 줄 — 날짜 키와 다섯 부위 · 던지는 일정(DB 줄 그대로) */
export type MechanicsFoldCheckin = {
  /** YYYY-MM-DD */
  date: string;
  shoulder?: string | null;
  elbow?: string | null;
  wrist?: string | null;
  lowerBack?: string | null;
  lowerBody?: string | null;
  throwPlan?: string | null;
};

/** 오늘 투구 기록 한 줄 */
export type MechanicsFoldLog = {
  sessionType?: string;
  pitchCount: number;
  intensity: number;
  effortPct?: number | null;
};

/** 최근 통증을 보는 창 — 오늘 포함 7일(facts.ts 의 last7 · painRecently 와 같다) */
export const MECHANICS_PAIN_WINDOW_DAYS = 7;

/** 팔을 다 쓴 까닭 — 중재 ArmSpentReason 과 같은 값 · 같은 차례 */
export type MechanicsArmSpent = 'gameToday' | 'gameLogged' | 'hardToday';

/**
 * 오늘 팔을 다 썼는가 — 중재 armBudget 과 같은 차례(오늘 등판 > 오늘 경기 기록 > 오늘 세게 던진 날). 오늘 답이 없으면 어제 '내일 등판'이 오늘
 * 등판이다(todayOutingRole). 짐작(달력 · 같은 요일)은 안 읽는다 — 중재도 답(outing.role)만 본다.
 */
export function mechanicsArmSpentOf({
  todayKey,
  checkins,
  logsToday,
}: {
  todayKey: string;
  checkins: readonly MechanicsFoldCheckin[];
  logsToday: readonly MechanicsFoldLog[];
}): MechanicsArmSpent | null {
  const today = checkins.find((c) => c.date === todayKey) ?? null;
  const yesterday = checkins.find((c) => c.date === shiftDateKey(todayKey, -1)) ?? null;
  if (todayOutingRole(today?.throwPlan, yesterday?.throwPlan) === 'game')
    return 'gameToday';
  if (logsToday.some((l) => l.sessionType === '경기')) return 'gameLogged';
  const totals = logsToday.reduce<OutingTotals | null>(addOutingLog, null);
  if (totals && isHardOuting({ daysAgo: 0, ...totals })) return 'hardToday';
  return null;
}

/**
 * 오늘 메커니즘 드릴을 접는가 — 머리 주석의 차례. 접을 까닭이 없으면 null(D5 통증도 아니고 팔도 안 썼다).
 * checkins 는 오늘 포함 최근 7일(그 밖의 줄은 무시), age 는 만 나이(모르면 null — 성인으로 본다, 다른 나이 규칙과 같은 뜻).
 */
export function mechanicsFoldOf({
  todayKey,
  checkins,
  logsToday,
  age,
}: {
  todayKey: string;
  checkins: readonly MechanicsFoldCheckin[];
  logsToday: readonly MechanicsFoldLog[];
  age: number | null;
}): MechanicsPainFold | null {
  const windowStart = shiftDateKey(todayKey, -(MECHANICS_PAIN_WINDOW_DAYS - 1));
  const recent = checkins.filter((c) => c.date >= windowStart && c.date <= todayKey);
  const today = recent.find((c) => c.date === todayKey) ?? null;

  const spent = mechanicsArmSpentOf({ todayKey, checkins: recent, logsToday });
  if (spent) {
    return {
      joints: [],
      label: '',
      reason: MECHANICS_SPENT_TEXT[spent],
      because: 'armSpent',
      canUnfold: false,
      cause: MECHANICS_SPENT_CAUSE[spent],
    };
  }
  /* 최근 통증 — facts.ts painRecently 와 같은 함수(hasPain: 다섯 부위 중 하나라도 '통증'). DB 의 빈 칸(null)은 '정상'으로 본다 */
  const painIn = (c: MechanicsFoldCheckin) =>
    hasPain(
      Object.fromEntries(CHECKIN_PARTS.map((p) => [p.key, c[p.key] ?? undefined]))
    );
  if (today == null && recent.some(painIn)) {
    return {
      joints: [],
      label: '',
      reason: MECHANICS_FOLD_TEXT.painUnknown,
      because: 'painUnknown',
      canUnfold: false,
      cause: MECHANICS_UNKNOWN_CAUSE,
    };
  }
  return mechanicsPainFold(today, { age });
}

/** 팔을 다 쓴 날 프로그램 칸의 까닭 한 줄(해요체 · 줄표 없음 · 60자 안 — 시험이 본다) */
export const MECHANICS_SPENT_TEXT: Record<MechanicsArmSpent, string> = {
  gameToday: '오늘 등판이라 던지기 · 메디신볼 드릴은 쉬어요. 안 던지는 드릴만 해요.',
  gameLogged:
    '오늘 경기에서 던져 던지기 · 메디신볼 드릴은 쉬어요. 안 던지는 드릴만 해요.',
  hardToday: '오늘 많이 던져 던지기 · 메디신볼 드릴은 쉬어요. 안 던지는 드릴만 해요.',
};

/** 통증 확인 전 날의 트레이닝 홈 한 줄 머리말 */
export const MECHANICS_UNKNOWN_CAUSE = '체크인 전이라';

/** 트레이닝 홈 한 줄의 까닭 머리말('오늘은 {cause} 무브먼트 드릴 N개만 해요') */
export const MECHANICS_SPENT_CAUSE: Record<MechanicsArmSpent, string> = {
  gameToday: '등판이라',
  gameLogged: '경기에서 던져',
  hardToday: '많이 던져',
};
