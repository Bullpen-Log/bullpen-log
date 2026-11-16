import { slotProgressOf, type DayDone } from '@/lib/coach/status';
import type { DaySlot } from '@/lib/coach/week';

/**
 * 어제 이어보기(2026-11-16, 설계 v0.3 독립 검토의 2번) — 코치 탭을 열면 어제 계획한 과제(운동 · 메커니즘 드릴)를 덜 한 날에 한 번 묻는다.
 * '무엇 때문이었어요?' 한 번 누르면 끝. 답은 그날 칸(CoachWeek.slots 의 DaySlot.followup)에 남는다 — 새 표 없음. 주중 다시 맞춤은 지난 날을
 * 그대로 두니 답이 지워지지 않는다. 다음 걸음은 이미 있는 길만 가리킨다(조정 단추 · 체크인 · 오늘 운동 만들기) — 새 계산을 만들지 않는다.
 * 못 한 운동은 몰아서 하지 않는다(planWeek 와 같은 약속). 순수 파일 — 앱 화면 · 서버가 같이 쓴다.
 */
export const FOLLOWUP_WHYS = [
  { value: 'time', label: '시간이 없었어요' },
  { value: 'tired', label: '피곤했어요' },
  { value: 'pain', label: '아팠어요' },
  { value: 'gear', label: '장비 · 장소가 없었어요' },
  { value: 'other', label: '그냥 못 했어요' },
] as const;

export type FollowupWhy = (typeof FOLLOWUP_WHYS)[number]['value'];
/** 칸에 남는 답 — skip 은 '넘어가기', 또는 건강 동의 없이 '아팠어요'를 고른 날(건강정보라 까닭은 안 남긴다) */
export type FollowupAnswer = FollowupWhy | 'skip';

/** 답 다음 걸음 — 이미 있는 길만. adjust = 이번 주 조정 단추, checkin = 오늘 체크인, training = 오늘 운동 만들기 */
export const FOLLOWUP_NEXT: Record<FollowupWhy, { text: string; action: { kind: 'adjust' | 'checkin' | 'training'; label: string } | null }> = {
  time: { text: '못 한 운동은 몰아서 하지 않아요. 오늘도 시간이 빠듯하면 시간을 줄이거나 하루를 옮겨요.', action: { kind: 'adjust', label: '이번 주 일정 고치기' } },
  tired: { text: '오늘 체크인에 컨디션을 적으면 앱이 오늘 운동을 그만큼 줄여요.', action: { kind: 'checkin', label: '몸 상태 체크인' } },
  pain: { text: '오늘 체크인에 아픈 곳을 적어 주세요. 앱이 오늘 운동을 멈추거나 줄여요. 계속 아프면 의사나 트레이너 같은 전문가와 상의해 주세요.', action: { kind: 'checkin', label: '몸 상태 체크인' } },
  gear: { text: '오늘 쓸 수 있는 장비를 고르면 그 장비로 운동을 만들어요.', action: { kind: 'training', label: '오늘 운동 만들기' } },
  other: { text: '괜찮아요. 못 한 운동은 몰아서 하지 않고 오늘 계획대로 가요.', action: null },
};

export const readFollowupWhy = (v: unknown): FollowupWhy | 'skip' | null =>
  v === 'skip' || FOLLOWUP_WHYS.some((o) => o.value === v) ? (v as FollowupWhy | 'skip') : null;

export type FollowupAsk = { date: string; did: string[]; left: string[] };

/**
 * 어제 칸을 물을까 — 계획한 과제가 남았고 아직 답이 없을 때만. 사용자가 그날을 가져갔으면(owner 'user') 묻지 않는다(그날은 사용자 것, U38).
 * 암케어는 제안이라 안 했어도 묻지 않는다(U23).
 */
export function followupAskOf(slot: DaySlot | undefined, done: DayDone | undefined): FollowupAsk | null {
  if (!slot || slot.followup || slot.owner === 'user') return null;
  const { did, left } = slotProgressOf(slot, done);
  return left.length ? { date: slot.date, did, left } : null;
}

/** 묻는 한 줄 — '어제(화) 운동은 했고 메커니즘 드릴은 못 했어요.' · '어제(화) 계획한 운동을 못 했어요.' */
export function followupLine(ask: FollowupAsk, dayLabel: string): string {
  const join = (xs: string[]) => xs.join(' · ');
  return ask.did.length ? `어제(${dayLabel}) ${join(ask.did)}은 했고 ${join(ask.left)}은 못 했어요.` : `어제(${dayLabel}) 계획한 ${join(ask.left)}을 못 했어요.`;
}

/** AI 맥락에 실을 까닭 글 — 아팠어요는 건강 동의가 있을 때만(없으면 칸에 애초에 'skip' 으로 남는다) */
export function followupReasonText(answer: FollowupAnswer | undefined): string | null {
  if (!answer || answer === 'skip') return null;
  return FOLLOWUP_WHYS.find((o) => o.value === answer)?.label ?? null;
}
