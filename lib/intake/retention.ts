/**
 * 원본 보유 기간 — 언제 지우는지의 규칙은 이 파일 하나다(2026-11-06 금윤호 결정). 순수 함수이고 브라우저에서도 부른다. 지우는 일 자체는 lib/intake/purge.ts 몫이다.
 *
 * - 공개한 적이 있으면: 마지막 공개일 또는 그 뒤에 다시 낸 날 가운데 늦은 날부터 90일. 내리기는 시계를 안 건드리고, 철회는 시계를 늦추지 않는다.
 * - 공개한 적이 없으면: 철회한 접수는 철회한 날, 그 밖에는 마지막으로 낸 날부터 90일.
 * - 판에 오른 적 없이 철회했으면: 지울 것이 임시 파일뿐이라 철회한 날부터 7일 유예다.
 * - 끝내지 않은 초안에는 시계가 없다. 임시 파일은 cleanupStaleUploads 가 다룬다.
 * - 모델 개발 동의는 예외가 아니다 — 입력에 동의가 없는 것이 그 뜻이다.
 *
 * 지울 날이 지나도 지우지 않고 기다리는 일이 하나 있다: 받는 사람이 고칠 수 있는 고침이 열려 있을 때(correctionHoldUntil).
 * 다시 내면 시계가 새로 돌고, 관리자가 보고 있는 바이트가 말없이 사라지지 않는다. 다만 INTAKE_CORRECTION_HOLD_DAYS 까지만 기다린다.
 */
import { INTAKE_CORRECTION_HOLD_DAYS, INTAKE_ORIGINAL_RETENTION_DAYS, INTAKE_WITHDRAWN_DRAFT_GRACE_DAYS } from '@/lib/intake/limits';

const DAY_MS = 86_400_000;
export const ORIGINAL_RETENTION_MS = INTAKE_ORIGINAL_RETENTION_DAYS * DAY_MS;
export const WITHDRAWN_DRAFT_GRACE_MS = INTAKE_WITHDRAWN_DRAFT_GRACE_DAYS * DAY_MS;
const CORRECTION_HOLD_MS = INTAKE_CORRECTION_HOLD_DAYS * DAY_MS;

export type RetentionBasis = 'published' | 'resubmitted' | 'submitted' | 'withdrawn' | 'withdrawn_draft';

export type RetentionFacts = {
  /** 이 접수의 모든 공개 시각 — 내린 공개도 넣는다 */
  publishedAts: readonly Date[];
  /** 마지막으로 낸 시각(가장 새 판). 판이 없으면 null */
  lastFrozenAt: Date | null;
  withdrawnAt: Date | null;
};

export type OriginalRetention = { basis: RetentionBasis; anchorAt: Date; purgeAt: Date };

const after = (basis: RetentionBasis, anchorAt: Date, ms = ORIGINAL_RETENTION_MS): OriginalRetention => ({ basis, anchorAt, purgeAt: new Date(anchorAt.getTime() + ms) });

/** 지울 날 — 시계가 없는 접수(끝내지 않은 초안)는 null */
export function originalRetention(f: RetentionFacts): OriginalRetention | null {
  const published = f.publishedAts.reduce<Date | null>((latest, at) => (latest == null || at > latest ? at : latest), null);
  if (published) return f.lastFrozenAt && f.lastFrozenAt > published ? after('resubmitted', f.lastFrozenAt) : after('published', published);
  if (f.withdrawnAt) return f.lastFrozenAt ? after('withdrawn', f.withdrawnAt) : after('withdrawn_draft', f.withdrawnAt, WITHDRAWN_DRAFT_GRACE_MS);
  return f.lastFrozenAt ? after('submitted', f.lastFrozenAt) : null;
}

/** 지울 날이 됐나 — 그 시각부터 지운다 */
export const retentionDue = (r: OriginalRetention | null, now: Date) => r != null && now.getTime() >= r.purgeAt.getTime();

export type CorrectionHoldInput = { status: string; invitationStatus: string; uploadExpiresAt: Date };

/**
 * 열린 고침이 삭제를 언제까지 기다리게 하나 — 없으면 null. 받는 사람이 아직 고칠 수 있을 때만 기다린다(폐기되거나 올리기 기간이 끝나면 기다릴 까닭이 없다).
 * 기다리는 동안에도 지울 날은 안 바뀐다. 고쳐 내면 시계가 새로 돈다.
 */
export function correctionHoldUntil(r: OriginalRetention | null, s: CorrectionHoldInput, now: Date): Date | null {
  if (!r || s.status !== 'correction_requested' || s.invitationStatus !== 'active') return null;
  const cap = r.purgeAt.getTime() + CORRECTION_HOLD_MS;
  const until = Math.min(s.uploadExpiresAt.getTime(), cap);
  return now.getTime() < until ? new Date(until) : null;
}

/** 지울 파일을 다 지운 시각 — 하나라도 남았거나 파일이 없으면 null. 넘기는 쪽이 어떤 파일을 볼지 고른다(판에 오른 파일, 없으면 전부) */
export function originalsPurgedAt(assets: readonly { purgedAt: Date | null }[]): Date | null {
  if (assets.length === 0 || assets.some((a) => a.purgedAt == null)) return null;
  return assets.reduce<Date>((latest, a) => (a.purgedAt! > latest ? a.purgedAt! : latest), assets[0].purgedAt!);
}
