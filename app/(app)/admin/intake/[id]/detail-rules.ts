/**
 * 접수 상세 화면의 판단 — 무엇을 보이고 무엇을 먼저 물을지. 화면 코드와 떼어 둬서 시험이 표로 본다(detail.selftest.mts).
 * 권한 · 상태 이동의 근거는 서버(lib/intake/admin.ts · service.ts)가 다시 본다. 여기는 누를 수 없는 단추를 안 보이게 할 뿐이다.
 */
import type { IntakeAssetDetail, IntakeDetail } from '@/lib/intake/admin';
import { CORRECTION_FIELD_TEXT, REJECT_CODE_TEXT, VIEW_TEXT, textOf } from '@/lib/intake/admin-labels';
import { REQUIRED_CONSENT_KINDS } from '@/lib/intake/consent';
import type { CorrectionRequest, IntakeView } from '@/lib/intake/state';

const DAY_MS = 86_400_000;

/** 고를 수 있는 올리기 기간(일) — 맨 끝이 서버 한도(lib/intake/admin.ts MAX_UPLOAD_DAYS)다 */
export const EXTEND_DAY_CHOICES = [3, 7, 14, 30, 60] as const;

/** 지금 끝나는 날보다 뒤인 칸만 — 서버는 앞당기는 기간을 받지 않는다 */
export function extendDayChoices(uploadExpiresAt: string, now: Date = new Date()): number[] {
  const end = new Date(uploadExpiresAt).getTime();
  return EXTEND_DAY_CHOICES.filter((d) => now.getTime() + d * DAY_MS > end);
}

/** 화면이 낡아서 막힌 답 — 최신 내용을 다시 받아야 다음 판단이 맞다 */
const FRESH_VIEW_CODES: ReadonlySet<string> = new Set(['run_not_current', 'invalid_state', 'invitation_revoked', 'not_finalized', 'original_locked', 'original_purged', 'result_unavailable']);
export const needsFreshView = (code: string) => code.startsWith('stale') || FRESH_VIEW_CODES.has(code);

const KNOWN_CONTAINERS: ReadonlySet<string> = new Set(['mov', 'mp4', 'matroska']);

type WarnAsset = Pick<IntakeAssetDetail, 'status' | 'rejectCode' | 'verifiedAt' | 'container'>;

/**
 * 내려받기 전에 먼저 말할 까닭 — 영상이라고 확인된 파일이 아니면 받는 쪽 컴퓨터에 무엇이 들어올지 모른다. 없으면 null.
 * 교체된 옛 파일은 상태가 'replaced' 라 상태만 봐서는 모른다. 그래서 막힌 까닭 · 검증 시각 · 그릇을 같이 본다.
 */
export function originalWarning(a: WarnAsset): string | null {
  if (a.rejectCode) return `${textOf(REJECT_CODE_TEXT, a.rejectCode)}.`;
  if (a.status === 'rejected') return '파일 검증에서 막힌 파일이에요.';
  if (a.status === 'unconfirmed') return '영상인지 확인하지 못한 파일이에요.';
  if (a.status === 'verified') return null;
  if (a.verifiedAt == null) return '아직 파일 확인이 끝나지 않았어요.';
  return a.container != null && KNOWN_CONTAINERS.has(a.container) ? null : '영상인지 확인하지 못한 파일이에요.';
}

/** 짝 내려받기가 줄 두 파일의 까닭 — 서버는 지금 판의 짝을 준다(판이 없으면 지금 고른 짝) */
export function pairOriginalWarning(d: Pick<IntakeDetail, 'assets' | 'revisions'>): string | null {
  const revision = d.revisions.find((r) => r.current);
  const pair = d.assets.filter((a) => (revision ? a.revisions.includes(revision.number) : a.current));
  const lines = pair.flatMap((a) => {
    const why = originalWarning(a);
    return why ? [`${VIEW_TEXT[a.view]} 영상: ${why}`] : [];
  });
  return lines.length ? lines.join(' ') : null;
}

/** 지금 칸에서 밀려난 파일 — 판에 얼린 것은 공개 결과의 근거일 수 있어 미리보기 · 내려받기를 준다 */
export function splitOlderAssets<T extends Pick<IntakeAssetDetail, 'current' | 'revisions'>>(assets: readonly T[]): { frozen: T[]; loose: T[] } {
  const older = assets.filter((a) => !a.current);
  return { frozen: older.filter((a) => a.revisions.length > 0), loose: older.filter((a) => a.revisions.length === 0) };
}

/** 분석 미리보기 영상 칸 — 실패한 실행도 구운 영상이 있으면 보인다. 철회된 접수는 서버가 막는다 */
export const runPreviewVisible = (run: { hasPreviews: boolean }, locked: boolean) => run.hasPreviews && !locked;

/** 고침 칸 — 초대를 폐기해도 열린 고침 요청은 거둘 수 있어야 한다 */
export const correctionSectionVisible = (d: Pick<IntakeDetail, 'status'> & { invitation: Pick<IntakeDetail['invitation'], 'status'> }) =>
  d.status === 'correction_requested' || (d.status !== 'draft' && d.status !== 'withdrawn' && d.invitation.status === 'active');

/** 올리기 기간은 초안과 고침 중에만 뜻이 있다(서버 extendUploadWindow 와 같은 조건) */
export const uploadWindowExtendable = (d: Pick<IntakeDetail, 'status'> & { invitation: Pick<IntakeDetail['invitation'], 'status'> }) =>
  d.invitation.status === 'active' && (d.status === 'draft' || d.status === 'correction_requested');

/** 철회를 기록할 수 있나 — 살아 있는 필수 동의가 있을 때다. 동의 전 초안에는 거둘 것이 없다 */
export const withdrawalRecordable = (d: Pick<IntakeDetail, 'status' | 'consents'>) =>
  d.status !== 'withdrawn' && d.consents.some((c) => c.granted && c.withdrawnAt == null && (REQUIRED_CONSENT_KINDS as readonly string[]).includes(c.kind));

/** 모델 개발 동의 철회를 기록할 수 있나 — 철회 · 폐기된 접수에서도 된다. 그 사람에게는 화면이 없어서다 */
export const modelWithdrawalRecordable = (d: Pick<IntakeDetail, 'modelConsentOpen'>) => d.modelConsentOpen;

export function accessCodeText(inv: Pick<IntakeDetail['invitation'], 'hasAccessCode' | 'accessCodeLocked' | 'accessCodeFailures'>): string {
  if (!inv.hasAccessCode) return '없음';
  if (inv.accessCodeLocked) return `있음 · 잠김(틀린 횟수 ${inv.accessCodeFailures}번)`;
  return inv.accessCodeFailures > 0 ? `있음 · 틀린 횟수 ${inv.accessCodeFailures}번` : '있음';
}

export const correctionText = (c: CorrectionRequest) =>
  [...c.fields.map((f) => textOf(CORRECTION_FIELD_TEXT, f)), ...c.views.map((v) => `${VIEW_TEXT[v]} 영상`)].join(' · ');

/** 받는 사람이 다시 보내야 끝낼 수 있는 칸 — 고침 요청을 쓸 때 미리 골라 둔다. 지운 칸은 빼고 내도 서버가 넣는다 */
export const viewsToResend = (assets: readonly Pick<IntakeAssetDetail, 'view' | 'status' | 'current'>[]): IntakeView[] =>
  assets.filter((a) => a.current && (a.status === 'rejected' || a.status === 'unconfirmed' || a.status === 'purged')).map((a) => a.view);

/** 짝 내려받기 단추 — 서버는 지금 판의 짝을 주므로, 그 둘의 바이트가 있어야 한다 */
export function pairDownloadable(d: Pick<IntakeDetail, 'assets' | 'revisions' | 'status'>): boolean {
  const revision = d.revisions.find((r) => r.current);
  if (d.status === 'withdrawn' || !revision) return false;
  return d.assets.filter((a) => a.revisions.includes(revision.number)).every((a) => a.available);
}

/** 원본 칸에 보일 글 — 지운 날이나 지울 날 */
export function retentionText(r: NonNullable<IntakeDetail['retention']>, now: Date = new Date()): { label: string; date: string; note: string | null } {
  if (r.purgedAt) return { label: '원본 지운 날', date: r.purgedAt, note: null };
  const waiting = r.heldUntil != null && new Date(r.purgeAt) <= now;
  return { label: '원본 삭제 예정일', date: r.purgeAt, note: waiting ? '고침 요청이 열려 있어 삭제를 기다리고 있어요. 고쳐서 내면 시계가 새로 돌아요.' : null };
}
