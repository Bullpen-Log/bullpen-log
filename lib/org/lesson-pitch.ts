/**
 * 일지의 던진 공 → 선수 투구 기록(2026-10-26 2단계, docs/designs/sinker-team-lesson-contract.md 3절 '운동량 규칙'). 순수 함수만.
 *
 * - 선수가 그날 직접 남긴 투구 기록이 있으면 새 줄을 만들지 않고 코치가 고른 그 줄에 활동(orgEventId)만 잇는다 — 같은 공을 두 번 세지 않게.
 *   코치가 '따로 던진 공'이라고 고르면('new') 일지 줄을 새로 만든다.
 * - 코치 줄은 일지 하나에 하나(clientKey = noteKey(일지 id)) — 고치면 그 줄을 고치고, 지우면 그 줄만 지운다.
 * - 가입 전 자리 · 투구 공유를 안 켠 회원은 선수 기록에 안 쓴다(일지에만 남음). 코치가 대신 적는 투구 기록(org-record.ts)과 같은 선.
 */

export type NotePitchPlan = { kind: 'none' } | { kind: 'own' } | { kind: 'link'; logId: string };

/** 코치 고른 값: '' 안 고름 · 'new' 따로 던진 공(일지 줄 새로) · 그 밖은 이을 선수 기록 id */
export function planNotePitch(i: {
  pitchCount: number | null;
  /** 가입했고 투구 공유를 켬 */
  canWrite: boolean;
  /** 선수가 그날 직접 남긴 기록(코치가 적은 줄은 뺌) */
  selfLogIds: string[];
  link: string;
}): NotePitchPlan | { error: string } {
  if (!i.canWrite || !i.pitchCount) return { kind: 'none' };
  if (i.link === 'new') return { kind: 'own' };
  if (i.link) return i.selfLogIds.includes(i.link) ? { kind: 'link', logId: i.link } : { error: '이을 투구 기록을 찾을 수 없어요. 다시 골라 주세요.' };
  if (i.selfLogIds.length > 0) return { error: '선수가 그날 남긴 투구 기록이 있어요. 이을 기록을 고르거나 따로 던진 공으로 골라 주세요.' };
  return { kind: 'own' };
}

/** 일지가 만든 코치 줄의 열쇠 — PitchLog.clientKey */
export const noteKey = (noteId: string) => `note:${noteId}`;

/** 지도 활동 상태 — OrgEvent.status */
export const EVENT_STATUSES = ['planned', 'done', 'canceled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const isEventStatus = (v: unknown): v is EventStatus => EVENT_STATUSES.includes(v as EventStatus);
export const EVENT_STATUS_LABEL: Record<EventStatus, string> = { planned: '예정', done: '실시', canceled: '취소' };
