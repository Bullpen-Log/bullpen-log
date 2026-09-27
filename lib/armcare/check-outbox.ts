/**
 * 아직 서버에 못 보낸 암케어 체크를 폰에 맡겨 두는 곳 — 따라하기(app/(session)/armcare/play)가 쓴다.
 *
 * 실내 연습장처럼 신호가 약한 곳에서 루틴을 끝내면 마친 운동의 체크가 못 가는 일이 있다.
 * 예전에는 못 보낸 체크를 화면의 메모리에만 들고 있어서, 그대로 '돌아가기'를 누르거나
 * 앱을 닫으면 말없이 사라졌다(2026-09-27 검토). 이제 체크는 먼저 여기에 담기고, 보내는 데
 * 성공한 것만 지운다. 따라하기나 암케어 목록을 다시 열면 이어서 보낸다.
 *
 * 같은 체크(운동 · 날)를 두 번 보내도 서버는 한 줄로 남긴다(markExerciseDone 의 upsert).
 * 담고 보내는 틀은 lib/outbox.ts — 운동 세트와 같이 쓴다.
 */

import { createOutbox } from '@/lib/outbox';

export type PendingCheck = {
  exerciseId: string;
  /** 체크를 남길 날(YYYY-MM-DD) — 따라하기가 보여 준 루틴의 날 */
  dateKey: string;
  /** 마친 순간(ISO) — 보내는 차례 */
  recordedAt: string;
};

type CheckKey = Pick<PendingCheck, 'exerciseId' | 'dateKey'>;

function isPendingCheck(v: unknown): v is PendingCheck {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.exerciseId === 'string' &&
    typeof p.dateKey === 'string' &&
    typeof p.recordedAt === 'string'
  );
}

export const checkOutbox = createOutbox<PendingCheck, CheckKey>({
  key: 'bullpen-log:pending-armcare-checks:v1',
  isItem: isPendingCheck,
  same: (a, b) => a.exerciseId === b.exerciseId && a.dateKey === b.dateKey,
});

/** 화면에서 한 체크를 가리키는 이름 */
export const checkId = (p: CheckKey) => `${p.exerciseId}|${p.dateKey}`;
