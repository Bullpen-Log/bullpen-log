import {
  onlyPainPartChanges,
  type FingerprintChange,
  type FingerprintKey,
} from '@/lib/report/plan-fingerprint';
import type { DailyPlan } from '@/lib/report/daily-plan';

/**
 * 상태 바뀜 알림 — 오늘 일정을 만든 뒤 '판단 입력'이 바뀌었으면 일정 카드 위에 띠 하나(트레이닝 추천 2판 P6-6, 2026-10-13).
 *
 * 왜 두는가. P2 의 일정 지문(lib/report/plan-fingerprint.ts)이 만들 때 본 상태와 지금 상태를 견줘 바뀐 항목을 한 줄씩 내지만
 * (today-data.ts 의 stateChanges), 화면은 그 값을 읽지 않았다. 그래서 아침에 일정을 만들고 저녁에 경기 85구를 남겨도,
 * 체크인을 고쳐 컨디션 8 → 3 이 돼도 트레이닝은 아침 일정을 아무 말 없이 그대로 보였다(안전 재검사는 무거운 운동만 뺀다).
 * 이 파일은 그 줄들을 '띄울지 · 무엇을 · 한 번 눌러 다시 만들 수 있는지'로 바꾼다.
 *
 * 규칙(차례대로 — 앞이 이긴다):
 *   1. 오늘 운동을 마쳤으면(세션 FINISHED) 띄우지 않는다 — 다시 만들 것이 없고, 완료 카드가 오늘을 말한다.
 *   2. 바뀐 것이 없으면 띄우지 않는다(지문 없는 옛 일정 · 일정 없음 · 멈춘 날도 today-data 가 빈 목록을 준다).
 *   3. 바뀐 것이 아픈 부위(오늘 · 최근)뿐이고 안전 재검사가 이미 운동을 뺐으면 띠 대신 기존 한 줄('몸 상태가 바뀌어 무리인 운동
 *      N개를 뺐어요')만 — 두 알림이 같은 일을 겹쳐 말하지 않게(P2 today-data.ts 주석 · onlyPainPartChanges). 'safety-only'.
 *   4. 그 밖은 띠('remake'): 줄은 KEY_RANK 차례로(아픈 곳 · 재활 · 팔 피로 → 던진 기록 → 등판 → 몸 → 부하 · 고른 것), 세게 던진 날
 *      줄이 있으면 같은 투구를 말하는 마지막 투구 줄은 뺀다('오늘 85구를 던졌어요' · '오늘 거의 전력으로 85구를 …' 두 줄이 되던 것).
 *      최대 STATE_NOTICE_MAX_LINES 줄 + '외 N가지'.
 *   한 번 눌러 다시 만들 수 있는가(canRemake): 근력 프로그램이 오늘 주인이면 아니다(그날 일정은 프로그램 운동 그대로라 다시 만들 것이
 *   없다 — 2판 P6-4 D6, 화면도 일정 카드를 안 그린다). 운동 판이 진행 중이면 아니다(얼린 판은 바뀌지 않아 목록과 판이 어긋난다).
 *   오늘 체크인이 없으면 아니다(일정 만들기가 체크인 없는 날은 만들지 않고 되돌아온다 — 누르면 아무 일도 없는 단추가 된다).
 *
 * 띄우기만 하고 아무것도 빼지 않는다 — 빼는 것은 안전 재검사(today-data.ts safeIds) 몫이다. 다시 만들기도 사람이 누를 때만 한다
 * (볼 때마다 저절로 다시 만들면 새로고침만 해도 목록이 바뀌던 옛 문제가 돌아온다 — today-data.ts 'savedPlan' 주석).
 *
 * 순수 파일이다(DB · 날짜 함수 없음) — 트레이닝 화면 · 트레이닝 홈 카드 · 기준선 도구(㉒ shown) · 자체 시험이 같은 함수를 쓴다.
 */

/** 오늘 운동 판의 상태 — 판이 없거나(none) · 하는 중(active) · 마침(finished). TrainingSession.status 의 ACTIVE · FINISHED 와 짝 */
export type TodaySessionState = 'none' | 'active' | 'finished';

/** 한 번 눌러 다시 만들 수 없는 까닭(앞이 이긴다) */
export type RemakeBlock = 'program' | 'active' | 'checkin';

export type StateNotice = {
  /**
   * 'remake' — 띠를 띄운다(바뀐 줄 · 다시 만들기). 'safety-only' — 띠 없이 기존 안전 한 줄만(아픈 부위만 바뀌어 이미 뺀 날).
   * null — 아무것도 안 띄운다(바뀐 것이 없거나 오늘 운동을 마쳤다).
   */
  kind: 'remake' | 'safety-only' | null;
  /** 띠에 보일 바뀐 줄(해요체 · 줄표 없음 · 60자 안 — plan-fingerprint.ts 의 글 그대로), 최대 STATE_NOTICE_MAX_LINES 줄 */
  lines: string[];
  /** 줄 수를 넘어 못 보인 바뀜 수 — 0 보다 크면 '외 N가지' */
  more: number;
  /** 띠의 '지금 상태로 다시 만들기' 한 번 누름을 내는가 */
  canRemake: boolean;
  /** 다시 만들 수 없는 까닭 — canRemake 면 null */
  blockedBy: RemakeBlock | null;
  /** 다시 만들 수 없을 때 띠 밑의 한 줄 — canRemake 면 null */
  note: string | null;
};

/** 띠에 보일 줄 수 — 넘으면 '외 N가지'(설계: 트레이닝 일정 카드 위 띠는 짧게) */
export const STATE_NOTICE_MAX_LINES = 3;

/**
 * 바뀐 항목의 차례(작을수록 먼저) — 몸을 지키는 것 → 오늘 팔에 실린 것 → 등판 → 오늘 몸 → 부하 통계 · 고른 것. Record 라 지문에
 * 항목(FingerprintKey)이 늘면 여기서 타입 오류가 나 빠뜨릴 수 없다(plan-fingerprint.ts 머리 주석의 '칸을 더하면 같은 커밋에서' 규칙).
 */
export const KEY_RANK: Record<FingerprintKey, number> = {
  checkin: 0,
  parts: 1,
  painRecent: 2,
  memo: 3,
  rehab: 4,
  armFatigue: 5,
  hardOuting: 6,
  lastThrow: 7,
  throwPlan: 8,
  throwPlanYesterday: 9,
  outingGuess: 10,
  loggedYesterday: 11,
  condition: 12,
  soreness: 13,
  sleep: 14,
  effortSpike: 15,
  zone: 16,
  /* 나이 구간 · 경력 — 규칙 전체가 바뀌는 입력이지만 드물다. 몸 신호 뒤, 고른 것 앞(2026-10-16 점검 2번) */
  ageBand: 17,
  trainingLevel: 18,
  preferredWorkout: 19,
};

/** 화면 글(해요체 · 줄표 없음 · 60자 안 — 자체 시험이 본다) */
export const STATE_NOTICE_TEXT = {
  /** 띠 제목 */
  title: '상태가 바뀌었어요',
  /** 다시 만들기 단추 · 누른 뒤 */
  remake: '지금 상태로 다시 만들기',
  remaking: '다시 만드는 중…',
  /** 다시 만들 수 없을 때 */
  program: '오늘은 프로그램 날이라 일정을 다시 만들지 않아요.',
  active: '운동 중이라 지금 일정은 그대로 둬요.',
  checkin: '오늘 체크인을 남기면 다시 만들 수 있어요.',
  /** 체크인 여는 단추 */
  checkinButton: '오늘 체크인 남기기',
  /** 트레이닝 홈 카드 한 줄(마침표 없이, 홈 카드의 다른 줄과 같게) */
  home: '상태가 바뀌었어요 · 일정을 다시 만들어 보세요',
} as const;

/** '외 N가지' */
export function moreText(n: number): string {
  return `외 ${n}가지`;
}

const NONE: StateNotice = {
  kind: null,
  lines: [],
  more: 0,
  canRemake: false,
  blockedBy: null,
  note: null,
};

/**
 * @param changes  today-data.ts 의 stateChanges(지문 견주기 — 바뀐 항목의 key · 글)
 * @param programOwns  근력 프로그램이 오늘 매일 일정 자리를 갖는가(lib/report/training-screen.ts trainingScreenOf 의 programOwns)
 * @param droppedForSafety  만든 뒤 몸 상태가 바뀌어 안전 재검사가 일정에서 뺀 수(today-data.ts)
 * @param session  오늘 운동 판(안 주면 판 없음)
 * @param checkedIn  오늘 체크인을 남겼나(안 주면 남겼다고 본다 — 일정은 체크인이 있는 날에만 만들어진다)
 */
export function stateNoticeOf(
  changes: readonly FingerprintChange[],
  {
    programOwns,
    droppedForSafety,
    session = 'none',
    checkedIn = true,
  }: {
    programOwns: boolean;
    droppedForSafety: number;
    session?: TodaySessionState;
    checkedIn?: boolean;
  }
): StateNotice {
  if (session === 'finished' || changes.length === 0) return NONE;
  if (droppedForSafety > 0 && onlyPainPartChanges(changes)) {
    return { ...NONE, kind: 'safety-only' };
  }

  const hasHard = changes.some((c) => c.key === 'hardOuting');
  /* 차례는 KEY_RANK, 같은 항목 안에서는 지문이 낸 차례 그대로(부위는 CHECKIN_PARTS 차례 — 안정 정렬) */
  const ordered = changes
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !(hasHard && c.key === 'lastThrow'))
    .sort((a, b) => KEY_RANK[a.c.key] - KEY_RANK[b.c.key] || a.i - b.i)
    .map(({ c }) => c.text);
  /* 같은 글이 두 번 오면 한 번만(지문은 항목마다 한 줄이라 드물지만, 화면 key 가 겹치지 않게) */
  const texts = [...new Set(ordered)];
  const lines = texts.slice(0, STATE_NOTICE_MAX_LINES);

  const blockedBy: RemakeBlock | null = programOwns
    ? 'program'
    : session === 'active'
      ? 'active'
      : !checkedIn
        ? 'checkin'
        : null;
  return {
    kind: 'remake',
    lines,
    more: texts.length - lines.length,
    canRemake: blockedBy == null,
    blockedBy,
    note: blockedBy ? STATE_NOTICE_TEXT[blockedBy] : null,
  };
}

/**
 * '지금 상태로 다시 만들기'가 일정 만들기(app/actions/training-setup.ts generateTodayPlan)에 보낼 숨은 칸 — 만들 때 고른 조건 그대로.
 * 펼쳐서 조건을 다시 고르는 길('조건 바꿔 다시 만들기')은 그대로 남는다. 이것은 조건은 그대로, 상태만 지금 것으로 다시 짜는 길이다.
 *
 *   mode       자동 맞춤으로 만들었으면(auto 칸) 'auto' — 목표 · 시간을 지금 상태로 다시 정한다. 아니면 'manual'.
 *              프로그램 날 일정(program 칸)은 자동 맞춤으로(트레이닝 화면의 다시 만들기 폼과 같은 규칙 — 그날은 auto 칸이 없다).
 *   minutes    고른 시간(requestedMinutes — 회복 데이로 줄인 minutes 가 아니라). 직접 고르기만 읽는다.
 *   trainingGoal · trainingFocus  고른 목표 · 부위(없으면 안 보낸다 — 서버가 저장해 둔 값으로). 직접 고르기만 읽는다.
 *   availableEquipment  오늘 고른 장비(DailyTrainingSetup.availableEquipment — 없으면 일정에 찍어 둔 equipment.available). 하나도 안 보내면
 *              서버는 '맨몸만'으로 읽으니(training-setup.ts 주석) 저장된 목록을 그대로 다 보낸다.
 *
 * 싣지 않는 것: overrideCondition · overrideEffort(몸 상태 경고를 넘긴 것은 그때 상태를 보고 한 결정이라, 상태가 바뀐 지금은 다시 묻는다 —
 * 펼친 폼에서 다시 고를 수 있다), saveDefaults(기본값을 굳히는 일은 이 단추의 뜻이 아니다).
 */
export function remakeFieldsOf(
  savedPlan: Pick<
    DailyPlan,
    'auto' | 'program' | 'requestedMinutes' | 'goal' | 'focus' | 'equipment'
  >,
  {
    returnTo,
    availableToday,
  }: { returnTo: string; availableToday?: readonly string[] | null }
): [name: string, value: string][] {
  const equipment = availableToday?.length
    ? availableToday
    : (savedPlan.equipment?.available ?? []);
  return [
    ['returnTo', returnTo],
    ['mode', savedPlan.auto || savedPlan.program ? 'auto' : 'manual'],
    ['minutes', String(savedPlan.requestedMinutes)],
    ...(savedPlan.goal ? [['trainingGoal', savedPlan.goal] as [string, string]] : []),
    ...(savedPlan.focus
      ? [['trainingFocus', savedPlan.focus] as [string, string]]
      : []),
    ...[...new Set(equipment)].map(
      (name) => ['availableEquipment', name] as [string, string]
    ),
  ];
}
