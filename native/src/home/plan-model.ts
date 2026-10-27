import type { AppHome, HomeWorkout } from './api';

/**
 * 홈의 '지금 할 일 하나'(히어로 CTA)와 오늘 플랜 카드의 글 — 순수(자체 시험 native-home:test).
 *
 * 차례(2026-10-27 홈 개편 — 시안의 currentAction 을 앱의 기존 규칙에 맞춤):
 *   통증 확인(메모에 통증 같은 말) → 체크인 → 투구 · 휴식(잠겼으면 첫 설정) → 남은 운동(회복 날은 회복 운동) → 오늘 다 함.
 * 체크인을 회복 운동보다 먼저 둔다 — 오늘 체크인이 회복 날을 다시 정한다(시안은 회복을 맨 앞에 두었다).
 * 다 했나(완료 수)는 링과 같은 셈: 체크인 · 투구(쉰 날 포함) · 운동(일정이 있는 날만 — 없는 날은 분모에서 뺀다).
 */
export type ActionKey = 'painCheck' | 'checkin' | 'pitchSetup' | 'pitch' | 'workout' | 'done';
export type NextAction = { key: ActionKey; title: string; sub: string; cta: string };

type Facts = Pick<AppHome, 'checkinDone' | 'pitchDone' | 'pitchLocked' | 'recovering' | 'painWords' | 'rings'> & {
  workout?: HomeWorkout | null;
};

/** 오늘 셀 것 · 한 것 — 링(rings)과 같은 셈. 운동 링이 none(일정 없음)이면 분모에서 뺀다 */
export function todayCount(home: Pick<AppHome, 'rings'>): { done: number; total: number } {
  const counted = home.rings.filter((r) => !r.none);
  return { done: counted.filter((r) => r.value >= 1).length, total: counted.length };
}

const workoutLeft = (w: HomeWorkout | null | undefined) => (w && w.total > 0 && w.done < w.total ? w.total - w.done : 0);

export function nextAction(h: Facts): NextAction {
  if (h.painWords?.length)
    return { key: 'painCheck', title: '통증 확인이 먼저예요', sub: '체크인으로 오늘 몸 상태를 알려 주세요.', cta: '체크인하기' };
  /* 체크인은 제목만(2026-10-27 김민: 밑의 '몸 상태 · 수면 · 불편한 곳'은 뺐다) — sub 가 비면 히어로가 줄을 안 그린다 */
  if (!h.checkinDone) return { key: 'checkin', title: '오늘 체크인', sub: '', cta: '체크인하기' };
  if (!h.pitchDone)
    return h.pitchLocked
      ? { key: 'pitchSetup', title: '투구 기록 시작', sub: '세 가지만 알려 주면 기록을 시작해요.', cta: '투구 기록 설정하기' }
      : { key: 'pitch', title: '오늘 투구 기록', sub: '던진 날과 쉰 날을 남겨요.', cta: '투구 · 휴식 남기기' };
  const left = workoutLeft(h.workout);
  if (left > 0 && h.workout) {
    const w = h.workout;
    return {
      key: 'workout',
      title: h.recovering ? '오늘 회복 운동' : `남은 운동 ${left}개`,
      sub: w.done > 0 ? `${w.done} / ${w.total} 완료 · 남은 약 ${w.leftMinutes}분` : `${w.total}개 · 약 ${w.minutes}분`,
      cta: w.done > 0 ? '운동 이어 하기' : h.recovering ? '회복 운동 보기' : '오늘 운동 보기',
    };
  }
  const { total } = todayCount(h);
  return {
    key: 'done',
    title: '오늘 기록 완료',
    sub: total >= 3 ? '체크인 · 투구 · 운동' : '체크인 · 투구',
    cta: '오늘 기록 보기',
  };
}

/** 투구 · 휴식 카드 — 오늘 남긴 기록(쉰 날 포함)을 값으로 */
export function pitchCard(h: Pick<AppHome, 'pitchDone' | 'pitchLocked' | 'board' | 'today'>): { value: string; unit: string; meta: string; done: boolean } {
  if (h.pitchDone) {
    const p = h.board?.lastPitch;
    const todayLog = p && p.date === h.today ? p : null;
    if (todayLog && !todayLog.rested) return { value: String(todayLog.pitches), unit: '구', meta: '기록 보기 · 고치기', done: true };
    if (todayLog?.rested) return { value: '휴식', unit: '', meta: '기록 보기 · 고치기', done: true };
    return { value: '기록함', unit: '', meta: '기록 보기 · 고치기', done: true };
  }
  if (h.pitchLocked) return { value: '설정 전', unit: '', meta: '투구 기록 설정하기', done: false };
  return { value: '기록 전', unit: '', meta: '오늘 던진 양 남기기', done: false };
}

/** 오늘 운동 카드 — 실제 운동 수 · 분만. 일정이 없으면 '일정 없음'(가짜 0/5 를 만들지 않는다) */
export function workoutCard(
  w: HomeWorkout | null | undefined,
  locked: boolean
): { value: string; unit: string; meta: string; done: boolean; state: 'locked' | 'none' | 'todo' | 'doing' | 'done' } {
  if (locked) return { value: '설정 전', unit: '', meta: '트레이닝 설정하기', done: false, state: 'locked' };
  if (!w || w.total <= 0) return { value: '일정 없음', unit: '', meta: '운동 플랜 보기', done: false, state: 'none' };
  if (w.done >= w.total) return { value: '완료', unit: '', meta: '오늘 운동 기록', done: true, state: 'done' };
  if (w.done > 0) return { value: `${w.done}`, unit: `/ ${w.total}개`, meta: `남은 약 ${w.leftMinutes}분 · 이어서 하기`, done: false, state: 'doing' };
  const meta =
    w.checkin === 'applied'
      ? `예상 ${w.minutes}분 · 체크인 반영`
      : w.checkin === 'changed'
        ? `예상 ${w.minutes}분 · 체크인 뒤 상태가 바뀌었어요`
        : '저장된 운동 · 체크인 반영 전';
  return { value: `${w.total}`, unit: '개', meta, done: false, state: 'todo' };
}

/** 'YYYY-MM-DD' → '10.27' */
export const dotDate = (key: string) => `${Number(key.slice(5, 7))}.${Number(key.slice(8, 10))}`;
/** 'YYYY-MM-DD' → '10월 27일' */
export const korDate = (key: string) => `${Number(key.slice(5, 7))}월 ${Number(key.slice(8, 10))}일`;
const WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;
const WEEK_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
/** 그 날의 요일(0 = 일) — 폰 시간대와 상관없이 날짜 키로 */
export const weekdayOf = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();
export const weekdayKo = (key: string) => WEEK_KO[weekdayOf(key)];
export const weekdayEn = (key: string) => WEEK_EN[weekdayOf(key)];
