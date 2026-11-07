/**
 * 접수 상세 화면의 판단 — 무엇을 보이고 무엇을 먼저 물을지. 화면 코드와 떼어 둬서 시험이 표로 본다(detail.selftest.mts).
 * 권한 · 상태 이동의 근거는 서버(lib/intake/admin.ts · service.ts)가 다시 본다. 여기는 누를 수 없는 단추를 안 보이게 할 뿐이다.
 */
import type { IntakeAssetDetail, IntakeDetail } from '@/lib/intake/admin';
import { CORRECTION_FIELD_TEXT, REJECT_CODE_TEXT, RETENTION_BASIS_TEXT, VIEW_TEXT, seoulDateText, slotProgressOf, textOf } from '@/lib/intake/admin-labels';
import { REQUIRED_CONSENT_KINDS } from '@/lib/intake/consent';
import { INTAKE_ORIGINAL_RETENTION_DAYS, INTAKE_WITHDRAWN_DRAFT_GRACE_DAYS } from '@/lib/intake/limits';
import { INTAKE_VIEWS, assetGone, type CorrectionRequest, type IntakeView } from '@/lib/intake/state';

const DAY_MS = 86_400_000;

/** 고를 수 있는 올리기 기간(일) — 맨 끝이 서버 한도(lib/intake/admin.ts MAX_UPLOAD_DAYS)다 */
export const EXTEND_DAY_CHOICES = [3, 7, 14, 30, 60] as const;

/** 지금 끝나는 날보다 뒤인 칸만 — 서버는 앞당기는 기간을 받지 않는다 */
export function extendDayChoices(uploadExpiresAt: string, now: Date = new Date()): number[] {
  const end = new Date(uploadExpiresAt).getTime();
  return EXTEND_DAY_CHOICES.filter((d) => now.getTime() + d * DAY_MS > end);
}

/** 화면이 낡아서 막힌 답 — 최신 내용을 다시 받아야 다음 판단이 맞다 */
const FRESH_VIEW_CODES: ReadonlySet<string> = new Set(['run_not_current', 'invalid_state', 'invitation_revoked', 'not_finalized', 'original_locked', 'original_purged', 'purge_in_progress', 'result_unavailable']);
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

/** 받는 사람이 다시 보내야 하는 칸 — 고침 요청을 쓸 때 미리 골라 둔다. 지운 칸은 빼고 내도 서버가 넣는다 */
export const viewsToResend = (assets: readonly Pick<IntakeAssetDetail, 'view' | 'status' | 'current'>[]): IntakeView[] =>
  assets.filter((a) => a.current && (a.status === 'rejected' || a.status === 'unconfirmed' || assetGone(a.status))).map((a) => a.view);

/**
 * 그 가운데 원본이 없는 칸(지웠거나 지우는 중) — 접수는 이미 끝났고 공개 중일 수도 있어서 '받아야 끝낼 수 있다'고 말하면 거짓이다. 다시 분석하려면 받아야 한다는 것만 참이다.
 */
export const goneViewsOf = (assets: readonly Pick<IntakeAssetDetail, 'view' | 'status' | 'current'>[]): IntakeView[] =>
  assets.filter((a) => a.current && assetGone(a.status)).map((a) => a.view);

/** 그 가운데 아직 지우고 있는 칸 — 지우는 일이 안 끝났는데 '지웠어요'라고 하면 거짓이다 */
export const deletingViewsOf = (assets: readonly Pick<IntakeAssetDetail, 'view' | 'status' | 'current'>[]): IntakeView[] =>
  assets.filter((a) => a.current && a.status === 'purging').map((a) => a.view);

const viewNames = (views: readonly IntakeView[]) => views.map((v) => `${VIEW_TEXT[v]} 영상`).join(' · ');

/** 고침 칸의 원본 없는 칸 글 — 지운 칸과 지우는 칸을 따로 말한다. 그런 칸이 없으면 null */
export function goneViewsText(gone: readonly IntakeView[], deleting: readonly IntakeView[] = []): string | null {
  if (gone.length === 0) return null;
  const done = gone.filter((v) => !deleting.includes(v));
  const doing = gone.filter((v) => deleting.includes(v));
  return [
    done.length > 0 ? `${viewNames(done)} 원본을 지웠어요.` : null,
    doing.length > 0 ? `${viewNames(doing)} 원본을 지우고 있어요.` : null,
    '다시 분석하려면 영상을 다시 받아야 해요.',
  ]
    .filter(Boolean)
    .join(' ');
}

const FROZEN_ALIVE_TEXT = '새로 받은 영상이 없어요. 판에 얼린 원본은 아래 이전에 고른 영상에 있어요.';

/**
 * 영상 칸이 비었을 때의 글 — 칸이 빈 접수에서만 부른다. 목록 칸과 같은 함수(slotProgressOf)로 칸마다 판단한다.
 * 끊긴 전송을 정리가 버리면 칸을 비운다. 그래서 칸이 비어도 그 칸의 파일을 다 지웠으면 받은 적 없는 접수처럼 말하지 않는다.
 * 칸 하나만 지웠으면 그 칸만 지웠다고 하고, 다른 칸은 목록처럼 없다고 한다.
 * 고침 중에는 새로 고른 파일만 지워졌어도 판에 얼린 원본이 살아 있다 — 그 칸은 목록처럼 '없음'이고, 글은 아래 원본을 가리킨다.
 */
export function emptyVideosText(assets: readonly Pick<IntakeAssetDetail, 'view' | 'status' | 'revisions'>[]): string {
  const progress = INTAKE_VIEWS.map((view) => ({ view, p: slotProgressOf(assets, view, null) }));
  const frozenAlive = (view?: IntakeView) => assets.some((a) => a.revisions.length > 0 && !assetGone(a.status) && (view == null || a.view === view));
  const gone = progress.filter(({ p }) => p === 'deleted' || p === 'deleting');
  if (gone.length === 0) {
    if (frozenAlive()) return FROZEN_ALIVE_TEXT;
    const frozen = assets.filter((a) => a.revisions.length > 0);
    if (frozen.length > 0) return `새로 받은 영상이 없어요. 판에 얼린 원본은 ${frozen.some((a) => a.status === 'purging') ? '지우고 있어요' : '지웠어요'}.`;
    return '아직 고른 영상이 없어요.';
  }
  if (gone.length === progress.length && gone.every(({ p }) => p === gone[0].p)) return gone[0].p === 'deleting' ? '받은 영상을 지우고 있어요.' : '받은 영상을 지웠어요.';
  return progress
    .map(({ view, p }) => {
      const name = `${VIEW_TEXT[view]} 영상`;
      if (p === 'deleted') return `${name}은 지웠어요.`;
      if (p === 'deleting') return `${name}은 지우고 있어요.`;
      return frozenAlive(view) ? `${name} 원본은 아래 이전에 고른 영상에 있어요.` : `${name}은 없어요.`;
    })
    .join(' ');
}

/** 짝 내려받기 단추 — 서버는 지금 판의 짝을 주므로, 그 둘의 바이트가 있어야 한다 */
export function pairDownloadable(d: Pick<IntakeDetail, 'assets' | 'revisions' | 'status'>): boolean {
  const revision = d.revisions.find((r) => r.current);
  if (d.status === 'withdrawn' || !revision) return false;
  return d.assets.filter((a) => a.revisions.includes(revision.number)).every((a) => a.available);
}

type Retention = NonNullable<IntakeDetail['retention']>;

/**
 * 부르는 이름 — '원본'은 판에 얼린 파일만 부른다. 판에 한 번도 안 오른 채 철회한 초안('withdrawn_draft')의 파일은 받은 영상이다.
 * label 은 줄 이름에 붙이는 말('영상 지운 날'), noun 은 글 속에 쓰는 말('받은 영상은 … 지웠어요')이다.
 */
const fileWords = (r: Pick<Retention, 'basis'>) => (r.basis === 'withdrawn_draft' ? { label: '영상', noun: '받은 영상' } : { label: '원본', noun: '원본' });

/**
 * 접수의 파일을 지우는 중인가 — 지금 판의 파일이다. 판이 없는 철회 초안은 판을 몰라 purgingScope 가 'older' 라고 하지만, 지우는 파일이 다 받은 영상이다.
 */
const purgingFiles = (r: Retention) => r.purging?.scope === 'current' || (r.basis === 'withdrawn_draft' && r.purging != null);

/**
 * 원본 칸에 보일 글 — 지우는 중이면 그 사실, 아니면 지운 날이나 지울 날. 지금 판을 지우는 중이면 날짜는 시작한 때다.
 * 지우기 시작한 파일은 고침 · 철회를 안 기다리고 끝까지 지운다. 그래서 지울 날이나 기다린다는 글을 보이면 거짓이다.
 * 옛 판만 지우는 중이면 지금 판의 날짜는 그대로 두고 옛 판을 따로 말한다. 옛 판이 끝나도 지금 판의 지운 날이 생기지는 않는다.
 * 판에 안 오른 철회 초안이면 줄 이름이 '영상 …'이다(fileWords).
 */
export function retentionText(r: Retention, now: Date = new Date()): { label: string; date: string; note: string | null } {
  const w = fileWords(r).label;
  if (purgingFiles(r)) return { label: `${w} 지우는 중`, date: r.purging!.since, note: '저장소에서 지우고 있어요. 끝나면 지운 날로 바뀌어요. 막히면 6시간마다 다시 해요.' };
  if (r.purgedAt) return { label: `${w} 지운 날`, date: r.purgedAt, note: r.purging ? '옛 판 파일은 아직 지우고 있어요. 막히면 6시간마다 다시 해요.' : null };
  const waiting = r.heldUntil != null && new Date(r.purgeAt) <= now;
  const note = r.purging ? '옛 판 파일을 지우고 있어요. 지금 판의 지울 날은 그대로예요.' : waiting ? '고침 요청이 열려 있어 삭제를 기다리고 있어요. 고쳐서 내면 시계가 새로 돌고, 거두면 다음 정리 때 지워요.' : null;
  return { label: `${w} 삭제 예정일`, date: r.purgeAt, note };
}

/**
 * 지울 날이 지났는데 아직 안 지운 원본인가 — 고침을 기다리거나(heldUntil) 크론이 아직 안 돈 경우다. 이 원본은 고침을 거두거나 초대를 폐기하면 다음 정리 때 지운다.
 * 지우기 시작했거나 다 지운 원본은 따로 말한다.
 */
const overdueAlive = (r: Retention, now: Date) => !purgingFiles(r) && !r.purgedAt && new Date(r.purgeAt).getTime() <= now.getTime();

/** 철회 배너 첫 줄 — 판에 한 번도 안 오른 접수의 파일은 원본이 아니라 받은 영상이다(fileWords 와 같은 낱말) */
export const withdrawnBannerLead = (d: Pick<IntakeDetail, 'revisions'>) => `필수 동의가 철회된 접수예요. ${d.revisions.length > 0 ? '원본' : '받은 영상'}을 열거나 분석할 수 없어요.`;

/** 철회 배너 끝에 붙일 글 — 철회가 지울 날을 밀어도 지우기 시작한 원본은 끝까지 지운다. 지난 날짜에 지운다고 말하지 않는다. 판에 안 오른 초안이면 받은 영상이라고 한다 */
export function withdrawnRetentionText(r: IntakeDetail['retention'], now: Date = new Date()): string {
  if (!r) return '';
  const { noun } = fileWords(r);
  if (purgingFiles(r)) return ` ${noun}을 지우고 있어요.`;
  if (r.purgedAt) return ` ${noun}은 ${seoulDateText(r.purgedAt)}에 지웠어요.`;
  return overdueAlive(r, now) ? ` 지울 날이 지나 다음 정리 때 ${noun}을 지워요.` : ` ${noun}은 ${seoulDateText(r.purgeAt)}에 지워요.`;
}

/** 고침 거두기 확인창 — 지운 원본을 그대로라고 말하지 않고, 거두면 곧 지워지는 원본도 그대로라고 말하지 않는다 */
export function cancelCorrectionDetail(r: IntakeDetail['retention'], now: Date = new Date()): string {
  const originals =
    r?.purging?.scope === 'current'
      ? '얼린 판의 원본은 지우고 있어요.'
      : r?.purgedAt
        ? '얼린 판의 원본은 이미 지웠어요.'
        : r && overdueAlive(r, now)
          ? '지울 날이 지나 거두면 다음 정리 때 얼린 판의 원본을 지워요. 되돌릴 수 없어요.'
          : '얼린 판의 원본은 그대로예요.';
  return `접수가 지금 판의 상태로 돌아가요. 받는 분이 그사이 새로 고른 영상이나 고친 글은 칸에서 내려가요. ${originals}`;
}

/**
 * 초대 폐기 확인창의 원본 줄 — 폐기는 철회가 아니어서 보유 기간이 그대로 돈다. 지울 날이 있으면 그날까지만 열린다.
 * 이미 철회한 접수는 원본이 잠겨 있어서(issueOriginalLinks 'original_locked') 열린다고 말하지 않는다. 지울 날이 지났으면 지난 날짜까지 열린다고 하지 않는다.
 */
export function revokeRetentionText(r: IntakeDetail['retention'], opts: { status?: string; now?: Date } = {}): string {
  const now = opts.now ?? new Date();
  if (opts.status === 'withdrawn') return r ? `이미 철회한 접수라 ${fileWords(r).noun}은 열 수 없어요.${withdrawnRetentionText(r, now)}` : '이미 철회한 접수예요.';
  if (r?.purging?.scope === 'current') return '동의 철회는 아니에요. 원본은 지우고 있어요.';
  if (r?.purgedAt) return '동의 철회는 아니에요. 원본은 이미 지웠어요.';
  if (r && overdueAlive(r, now)) return '동의 철회는 아니에요. 지울 날이 지나 다음 정리 때 원본을 지워요. 되돌릴 수 없어요.';
  return r ? `동의 철회는 아니어서 원본은 지울 날(${seoulDateText(r.purgeAt)})까지 열려요.` : '동의 철회는 아니에요.';
}

/**
 * 필수 동의 철회 확인창의 원본 줄 — 이미 지웠거나 지우고 있는 원본을 앞으로 지운다고 말하지 않는다.
 * 공개한 적이 있으면 철회가 지울 날을 늦추지 않는다(retention.ts). 그 날이 지났으면 철회로 고침 기다림도 끝나 다음 정리 때 지운다 — 지난 '원래 지울 날'을 앞날처럼 말하지 않는다.
 * 공개한 적이 없으면 철회한 날부터 다시 세므로 지난 날짜여도 곧 지우지 않는다.
 */
export function withdrawConsentRetentionText(r: IntakeDetail['retention'], now: Date = new Date()): string {
  const draft = `접수를 끝내지 못한 파일은 ${INTAKE_WITHDRAWN_DRAFT_GRACE_DAYS}일 뒤 지워요.`;
  if (r?.purging?.scope === 'current') return `원본은 이미 지우고 있어요. 철회해도 끝까지 지워요. ${draft}`;
  if (r?.purgedAt) return `원본은 이미 지웠어요. ${draft}`;
  if (r && (r.basis === 'published' || r.basis === 'resubmitted') && overdueAlive(r, now)) return `공개한 적이 있는 접수라 철회해도 지울 날은 그대로예요. 지울 날이 지나 철회하면 다음 정리 때 원본을 지워요. 되돌릴 수 없어요. ${draft}`;
  return `원본은 공개한 적이 없으면 철회한 날부터 ${INTAKE_ORIGINAL_RETENTION_DAYS}일 뒤 지우고, 공개한 적이 있으면 원래 지울 날에 지워요. ${draft}`;
}

/**
 * 접수 정보의 원본 줄 — 지울 날(또는 지운 날 · 지우는 중)과 그 기준.
 * 지운 뒤 · 지우는 중에는 기준을 안 보인다: 기준은 지금 시계에서 다시 셈해, 지운 뒤에 한 철회 · 공개를 지운 근거라고 말하게 된다.
 * 시계가 없는 초안이라도 받은 파일을 지웠으면 그 날을 말한다.
 */
export function retentionFactRows(r: IntakeDetail['retention'], filesPurgedAt: string | null, now: Date = new Date()): [string, string][] {
  if (!r) return filesPurgedAt ? [['영상 지운 날', seoulDateText(filesPurgedAt)]] : [];
  const shown = retentionText(r, now);
  const rows: [string, string][] = [[shown.label, seoulDateText(shown.date)]];
  if (!r.purgedAt && !purgingFiles(r)) rows.push(['삭제 기준', RETENTION_BASIS_TEXT[r.basis]]);
  return rows;
}

