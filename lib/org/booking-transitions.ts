import { completeBookingTx, type CompleteTx } from '@/lib/org/booking-complete';
import { enrollMemberTx, type MembershipTx } from '@/lib/org/membership-transitions';

/**
 * 레슨 예약 상태 전이 계약(2026-11-01 교정 F01 · F02 — docs/designs/sinker-dugout-team-lesson-platform-review-2026-11-01.md).
 * 예전엔 확정 · 거절 · 취소가 트랜잭션 **밖**에서 상태를 읽고 id 만으로 갱신해, 겹친 두 확정이 시간표 줄을 둘 만들고(F02) 완료 뒤 늦게 온 취소가
 * DONE(수강권 차감됨)을 CANCELED 로 덮었다(F01). 이제 모든 전이는 트랜잭션 안에서 **허용된 이전 상태 · 주인 · 조직을 조건으로 한 갱신(바뀐 줄 1)** 으로
 * 먼저 선점하고, 이긴 요청만 회원 · 시간표 · 수강권 같은 뒤따르는 일을 한다. 진 요청은 '이미 처리됨'(already) 또는 '다른 상태'(conflict)를 돌려받는다.
 * 전이 안에서 뒤따르는 일이 던지면 트랜잭션이 선점까지 되돌린다. 알림은 이긴 전이에만(부르는 쪽, app/actions/lessons.ts).
 *
 *   REQUESTED → CONFIRMED(코치) · DECLINED(코치) · CANCELED(선수)
 *   CONFIRMED → DONE(코치, 수강권 차감 — booking-complete.ts) · CANCELED(선수)
 *   DONE · DECLINED · CANCELED → 끝(늦게 온 확정 · 취소는 아무것도 안 바꿈. 완료 뒤 정정은 별도 업무 — 원장 단계 M-C)
 *
 * 트랜잭션 클라이언트를 받는 순수 함수라 시험(scripts/org-selftest.mts)이 두 요청을 겹쳐 돌린다.
 */
export const BOOKING_STATUSES = ['REQUESTED', 'CONFIRMED', 'DONE', 'DECLINED', 'CANCELED'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** 전이마다 허용된 이전 상태 */
export const ALLOWED_FROM: Record<'confirm' | 'decline' | 'finish' | 'cancel', BookingStatus[]> = {
  confirm: ['REQUESTED'],
  decline: ['REQUESTED'],
  finish: ['CONFIRMED'],
  cancel: ['REQUESTED', 'CONFIRMED'],
};

export type TransitionTx = CompleteTx & MembershipTx & {
  lessonBooking: {
    updateMany(a: {
      where: { id: string; status?: string | { in: string[] }; orgId?: string; userId?: string };
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
    findUnique(a: { where: { id: string }; select: { status: true; eventId?: true } }): Promise<{ status: string; eventId?: string | null } | null>;
  };
  shareConsent: {
    findUnique(a: { where: { memberId: string }; select: { memberId: true } }): Promise<{ memberId: string } | null>;
  };
  orgEvent: {
    create(a: {
      data: { orgId: string; date: Date; time: string | null; kind: 'lesson'; title: string; memberId: string; createdById: string };
      select: { id: true };
    }): Promise<{ id: string }>;
    updateMany(a: { where: { id: string; status: string }; data: { status: string } }): Promise<{ count: number }>;
  };
};

/** 진 요청의 까닭 — already: 이미 같은 전이가 됐다(재시도 · 겹침), conflict: 다른 상태로 가 있다(취소된 것을 확정하려 함 등) */
export type Lost = { ok: false; reason: 'already' | 'conflict'; status: BookingStatus | null };

async function lost(tx: TransitionTx, id: string, wanted: BookingStatus): Promise<Lost> {
  const now = await tx.lessonBooking.findUnique({ where: { id }, select: { status: true } });
  const status = (now?.status ?? null) as BookingStatus | null;
  return { ok: false, reason: status === wanted ? 'already' : 'conflict', status };
}

/**
 * 확정 — REQUESTED → CONFIRMED 를 먼저 선점한 요청만 회원 줄 · 시간표 줄을 만들고 예약에 잇는다. 공유 동의는 만들지 않는다(2026-10-25 계약 2-1).
 * consentPending: 동의 줄이 없는 회원(싱커에서 골라야 함) — 부르는 쪽이 알림.
 */
export async function confirmBookingTx(
  tx: TransitionTx,
  a: { bookingId: string; orgId: string; userId: string; nickname: string; chosen: Date; date: Date; time: string | null; reply: string | null; createdById: string }
): Promise<{ ok: true; eventId: string; memberId: string; consentPending: boolean } | Lost> {
  const claimed = await tx.lessonBooking.updateMany({
    where: { id: a.bookingId, status: 'REQUESTED', orgId: a.orgId },
    data: { status: 'CONFIRMED', chosen: a.chosen, reply: a.reply, confirmedAt: new Date() },
  });
  if (claimed.count !== 1) return lost(tx, a.bookingId, 'CONFIRMED');
  /*
   * 선수 등록은 회원 전이 표(membership-transitions.ts, G02)대로 — 나간 코치 줄은 선수로 다시 들어오고(코치 권한 안 되살림), 활동 중인 코치 · 소유자는
   * 선수로 못 등록한다(MembershipConflict → 트랜잭션 되돌림, 예약은 REQUESTED 그대로 남는다)
   */
  const m = await enrollMemberTx(tx, { orgId: a.orgId, user: { id: a.userId, nickname: a.nickname }, incoming: 'PLAYER', now: new Date() });
  const memberId = m.memberId;
  const consent = m.existed ? await tx.shareConsent.findUnique({ where: { memberId }, select: { memberId: true } }) : null;
  const ev = await tx.orgEvent.create({
    data: { orgId: a.orgId, date: a.date, time: a.time, kind: 'lesson', title: `${a.nickname} 레슨(덕아웃 예약)`, memberId, createdById: a.createdById },
    select: { id: true },
  });
  /* 선점한 줄에 회원 · 시간표를 잇는다 — 상태 조건을 다시 건다(그새 바뀌었을 리 없지만 바뀌었으면 0줄 → 던져서 되돌림) */
  const linked = await tx.lessonBooking.updateMany({ where: { id: a.bookingId, status: 'CONFIRMED' }, data: { memberId, eventId: ev.id } });
  if (linked.count !== 1) throw new Error('booking vanished during confirm');
  return { ok: true, eventId: ev.id, memberId, consentPending: !consent };
}

/** 거절 — REQUESTED → DECLINED */
export async function declineBookingTx(tx: TransitionTx, a: { bookingId: string; orgId: string; reply: string | null }): Promise<{ ok: true } | Lost> {
  const r = await tx.lessonBooking.updateMany({ where: { id: a.bookingId, status: 'REQUESTED', orgId: a.orgId }, data: { status: 'DECLINED', reply: a.reply } });
  return r.count === 1 ? { ok: true } : lost(tx, a.bookingId, 'DECLINED');
}

/**
 * 취소(선수 본인) — REQUESTED · CONFIRMED → CANCELED. 주인(userId)도 조건. 이긴 요청만 확정 때 만든 시간표 줄을 '취소'로(예정인 것만 — 실시한 활동은 그대로, 지우지 않음).
 * DONE(수강권 차감됨)은 못 덮는다 — conflict. 시간표 줄 번호(eventId)는 선점한 **뒤 트랜잭션 안에서** 읽는다 — 밖에서 읽은 값은 확정이 그새 끝났으면 비어 있어 일정이 남았다(시험이 잡음).
 */
export async function cancelBookingTx(tx: TransitionTx, a: { bookingId: string; userId: string }): Promise<{ ok: true } | Lost> {
  const r = await tx.lessonBooking.updateMany({
    where: { id: a.bookingId, userId: a.userId, status: { in: [...ALLOWED_FROM.cancel] } },
    data: { status: 'CANCELED' },
  });
  if (r.count !== 1) return lost(tx, a.bookingId, 'CANCELED');
  const now = await tx.lessonBooking.findUnique({ where: { id: a.bookingId }, select: { status: true, eventId: true } });
  if (now?.eventId) await tx.orgEvent.updateMany({ where: { id: now.eventId, status: 'planned' }, data: { status: 'canceled' } });
  return { ok: true };
}

/** 끝냄 — CONFIRMED → DONE + 수강권 한 회(booking-complete.ts). 이미 끝났거나 취소됐으면 Lost */
export async function finishBookingTx(
  tx: TransitionTx,
  a: { bookingId: string; orgId: string; memberId: string | null; lessonDay: string }
): Promise<{ ok: true; passId: string | null } | Lost> {
  /* 조직 조건은 completeBookingTx 의 CONFIRMED → DONE 조건부 갱신에 같이 건다(빈 갱신으로 '잠그는' 척하지 않는다 — 2차 검토) */
  const r = await completeBookingTx(tx, a);
  if (!r.done) return lost(tx, a.bookingId, 'DONE');
  return { ok: true, passId: r.passId };
}

/** 코치 · 선수 화면에 보이는 결과 글 */
export const BOOKING_RESULT_TEXT = {
  confirmed: '확정했어요. 시간표와 회원에 들어갔어요.',
  declined: '거절했어요.',
  finished: '끝남으로 적었어요. 수강권 한 회를 썼어요. 선수가 후기를 쓸 수 있어요.',
  finishedNoPass: '끝남으로 적었어요. 쓸 수 있는 수강권이 없어 차감하지 않았어요 — 수강권을 넣은 뒤 정정해 주세요.',
  canceled: '예약을 취소했어요.',
  already: '이미 처리된 예약이에요.',
  conflict: '예약 상태가 그새 바뀌어 처리하지 못했어요. 목록을 새로 봐 주세요.',
  roleConflict: '이 사람은 이 조직의 코치 · 대표 계정이라 회원(선수)으로 등록할 수 없어요. 선수 계정으로 다시 예약하게 해 주세요.',
} as const;
