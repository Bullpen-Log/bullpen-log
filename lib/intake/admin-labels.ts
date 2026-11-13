/**
 * 외부 영상 접수 관리 화면의 이름표 — 브라우저에서도 부르는 순수 표다. 상태 값의 뜻은 lib/intake/state.ts 가 정하고, 여기는 사람이 읽는 말만 둔다.
 * 색만으로 상태를 알리지 않게 화면은 늘 이 글을 같이 보인다.
 */
import { INTAKE_ORIGINAL_RETENTION_DAYS, INTAKE_WITHDRAWN_DRAFT_GRACE_DAYS, VERIFY_BUDGET_NOTE_PREFIX } from '@/lib/intake/limits';
import type { IntakeMediaFacts } from '@/lib/intake/media';
import type { RetentionBasis } from '@/lib/intake/retention';
import { assetGone, type IntakeView } from '@/lib/intake/state';

export const VIEW_TEXT: Record<IntakeView, string> = { side: '옆', rear: '뒤' };

export const SUBMISSION_STATUS_TEXT: Record<string, string> = {
  draft: '접수 전',
  submitted: '파일 확인 중',
  verified: '검증 완료',
  needs_attention: '확인 필요',
  correction_requested: '고침 요청함',
  withdrawn: '철회됨',
};

export const ANALYSIS_STATUS_TEXT: Record<string, string> = {
  none: '분석 전',
  ready: '분석 가능',
  queued: '대기 중',
  running: '분석 중',
  succeeded: '분석 완료',
  failed: '분석 실패',
};

export const PUBLICATION_STATUS_TEXT: Record<string, string> = {
  unpublished: '비공개',
  published: '공개 중',
};

export const INVITATION_STATUS_TEXT: Record<string, string> = {
  active: '사용 중',
  revoked: '폐기됨',
};

export const ASSET_STATUS_TEXT: Record<string, string> = {
  reserved: '전송 대기',
  uploading: '전송 중',
  uploaded: '도착',
  verifying: '검증 중',
  verified: '검증됨',
  unconfirmed: '영상 확인 필요',
  rejected: '막힘',
  replaced: '교체됨',
  abandoned: '버려짐',
  purging: '지우는 중',
  purged: '지워짐',
};

export const REVISION_STATUS_TEXT: Record<string, string> = {
  pending: '확인 중',
  verified: '검증 완료',
  failed: '확인 필요',
};

export const RUN_STATUS_TEXT: Record<string, string> = {
  requested: '요청됨',
  running: '분석 중',
  succeeded: '성공',
  failed: '실패',
};

export const CONSENT_KIND_TEXT: Record<string, string> = {
  submission: '영상 제출과 처리',
  overseas: '분석 서버 국외 이전',
  model: '모델 개발 이용(선택)',
};

export const REJECT_CODE_TEXT: Record<string, string> = {
  size_mismatch: '도착한 크기가 신고한 크기와 달라요',
  hash_mismatch: '해시가 고른 파일과 달라요',
  not_video: '파일 머리를 읽어 보니 영상이 아니에요',
  unsupported_container: 'MOV · MP4 가 아닌 그릇이라 받지 않았어요',
  facts_unreadable: '파일 머리를 읽지 못했어요',
};

export const FAILURE_CODE_TEXT: Record<string, string> = {
  same_file: '옆과 뒤가 같은 파일이에요',
  asset_rejected: '막힌 영상이 있어요',
  media_unconfirmed: '영상인지 확인하지 못한 파일이 있어요',
};

export const CORRECTION_FIELD_TEXT: Record<string, string> = {
  athleteName: '선수 이름',
  throwingHand: '던지는 손',
  submitterName: '보내는 분 이름',
  submitterRelation: '보내는 분과의 관계',
};

export const AGE_BAND_TEXT: Record<string, string> = {
  '14_or_over': '만 14세 이상(본인 신고)',
  under_14: '만 14세 미만',
};

export const HAND_TEXT: Record<string, string> = { R: '오른손', L: '왼손' };

/** 감사 기록의 동작 이름 — 모르는 이름은 코드 그대로 보인다(숨기지 않는다) */
export const AUDIT_ACTION_TEXT: Record<string, string> = {
  'invitation.created': '초대를 만들었어요',
  'invitation.revoked': '초대를 폐기했어요',
  'invitation.reissued': '링크를 새로 바꿨어요',
  'consent.recorded': '동의를 남겼어요',
  'consent.withdrawn': '동의를 철회했어요',
  'consent.withdrawn_by_admin': '담당자가 필수 동의 철회를 기록했어요',
  'consent.model_withdrawn_by_admin': '담당자가 모델 개발 동의 철회를 기록했어요',
  'consent.overseas_withdrawn_by_admin': '담당자가 국외 이전 동의 철회를 기록했어요',
  'asset.reserved': '영상을 골랐어요',
  'asset.replaced': '영상을 바꿨어요',
  'asset.arrived': '영상이 저장소에 도착했어요',
  'asset.size_mismatch': '도착한 크기가 달랐어요',
  'asset.verified': '파일 검증을 마쳤어요',
  'asset.rejected': '파일 검증에서 막혔어요',
  'asset.unconfirmed': '바이트는 맞지만 영상인지 확인하지 못했어요',
  'asset.verify_requeued': '파일 확인을 다시 걸었어요',
  'asset.purged': '쓰이지 않는 파일을 지웠어요',
  'originals.purge_started': '보유 기간이 끝나 원본 지우기를 시작했어요',
  'originals.purged': '보유 기간이 끝나 원본과 미리보기를 지웠어요',
  'submission.finalized': '접수를 마쳤어요',
  'revision.verified': '두 파일이 검증됐어요',
  'revision.failed': '확인이 필요한 접수가 됐어요',
  'revision.registered': '두 원본을 분석 가능으로 등록했어요',
  'correction.requested': '고침을 요청했어요',
  'correction.updated': '고침 요청을 바꿨어요',
  'correction.cancelled': '고침 요청을 거뒀어요',
  'correction.widened': '막힌 영상 칸을 고침 요청에 더했어요',
  'draft.age_band_changed': '나이 확인을 바꿨어요',
  'revision.register_requeued': '분석 등록을 다시 걸었어요',
  'upload_window.extended': '올리기 기간을 늘렸어요',
  'access_code.wrong': '틀린 접근 코드를 입력했어요',
  'access_code.locked': '접근 코드를 많이 틀려 결과 보기가 잠겼어요',
  'access_code.reset': '접근 코드 막힘을 풀었어요',
  'assignee.changed': '담당자를 바꿨어요',
  'note.added': '내부 메모를 남겼어요',
  'note.deleted': '내부 메모를 지웠어요',
  'original.download_issued': '원본 내려받기 주소를 받았어요',
  'original.preview_issued': '원본 미리보기 주소를 받았어요',
  'preview.issued': '분석 미리보기 주소를 받았어요',
  'run.reviewed': '3D 결과를 열어 봤어요(예전 기록)',
  'run.review_opened': '3D 결과를 열어 봤어요',
  'run.review_acknowledged': '3D 결과 검토 완료',
  'analysis.hand_set': '던지는 손을 정했어요',
  'analysis.requested': '분석을 요청했어요',
  'analysis.carried': '같은 영상의 분석을 새 판에 이어 받았어요',
  'analysis.succeeded': '분석이 끝났어요',
  'analysis.failed': '분석이 실패했어요',
  'publication.published': '결과를 공개했어요',
  'publication.unpublished': '결과 공개를 내렸어요',
  'invitee.enrolled': '받는 분이 이름과 PIN 을 정했어요',
  'invitee.session_started': '받는 분이 이름과 PIN 으로 들어왔어요',
  'invitee.unlock_failed': '이름이나 PIN 이 틀렸어요',
  'invitee.locked': '이름 · PIN 을 많이 틀려 링크가 잠겼어요',
  'invitee.reset': '담당자가 이름과 PIN 을 지웠어요',
  'invitee.unlocked': '담당자가 링크 잠금을 풀었어요',
  'analysis.manual_imported': '3D 결과를 직접 가져왔어요',
  'original.local_copy_confirmed': '원본 로컬 사본을 확인했다고 적었어요',
  'manifest.exported': '원본 매니페스트를 받았어요',
};

/** 멈춘 일감 — 상세 화면이 까닭과 함께 보인다 */
export const JOB_KIND_TEXT: Record<string, string> = {
  verify_asset: '파일 확인',
  register_revision: '분석 등록',
  poll_analysis: '분석 결과 받기',
  cleanup_uploads: '임시 파일 정리',
  purge_originals: '보유 기간 끝난 원본 지우기',
};

/** 언제부터 세는지 — 규칙은 lib/intake/retention.ts */
export const RETENTION_BASIS_TEXT: Record<RetentionBasis, string> = {
  published: `공개한 날부터 ${INTAKE_ORIGINAL_RETENTION_DAYS}일`,
  resubmitted: `다시 낸 날부터 ${INTAKE_ORIGINAL_RETENTION_DAYS}일`,
  /* 시계는 마지막으로 낸 판이다 — 공개한 적 없이 고쳐 다시 내도 이 이름이다(lib/intake/retention.ts) */
  submitted: `마지막으로 낸 날부터 ${INTAKE_ORIGINAL_RETENTION_DAYS}일`,
  withdrawn: `철회한 날부터 ${INTAKE_ORIGINAL_RETENTION_DAYS}일`,
  withdrawn_draft: `철회한 날부터 ${INTAKE_WITHDRAWN_DRAFT_GRACE_DAYS}일`,
};

export const JOB_STATE_TEXT: Record<string, string> = {
  failed: '시도를 다 썼어요',
  retrying: '다시 시도하는 중이에요',
  stalled: '일꾼이 멈춘 것 같아요',
  /* 실패가 아니다 — 큰 파일이라 크론 한 번의 시간 안에 다 못 읽어 기다린다. 시도 횟수를 안 쓴다(lib/intake/admin.ts jobStateOf) */
  waiting: '검증 대기 · 큰 파일이라 다음 실행에서 이어 확인해요',
};

/** 일감 모습의 색 — 기다림은 오류 색으로 그리지 않는다. 색만으로 알리지 않게 화면은 JOB_STATE_TEXT 를 같이 보인다 */
export const jobStateTone = (state: string): 'danger' | 'neutral' => (state === 'waiting' ? 'neutral' : 'danger');

/**
 * 기다림 글(IntakeJobIssue.note)의 보일 부분 — 머리말을 떼고, 모습 글(JOB_STATE_TEXT.waiting)과 같은 말이면 null(두 번 말하지 않는다).
 * '검증 작업자를 기다려요' · '처음부터 다시 확인해요' 같은 덧붙일 사정만 남는다.
 */
export function jobWaitNoteText(note: string | null | undefined): string | null {
  if (!note) return null;
  const body = (note.startsWith(VERIFY_BUDGET_NOTE_PREFIX) ? note.slice(VERIFY_BUDGET_NOTE_PREFIX.length) : note).trim();
  if (!body) return null;
  return JOB_STATE_TEXT.waiting.includes(body.replace(/\.$/, '')) ? null : body;
}

/**
 * 표본 시간 칸의 이름. 영상에 적힌 시간이 찍은 시간이라고 말할 수 있는 때는 장면 간격이 일정한 고속 영상이고 재생 속도를 안 바꾼 때뿐이다.
 * 슬로 모션을 내보낸 파일은 표본 시간 자체가 늘어나 있어서, 그 밖에는 '표본 시간'이라고만 적는다.
 */
export function sampleDurationLabel(f: Pick<IntakeMediaFacts, 'frameTiming' | 'nominalFps' | 'editList'> | null | undefined): string {
  return f && f.frameTiming === 'constant' && (f.nominalFps ?? 0) >= 100 && !f.editList?.retimed ? '촬영 길이' : '표본 시간';
}

export const textOf = (table: Record<string, string>, key: string | null | undefined, empty = '없음'): string =>
  key == null ? empty : (table[key] ?? key);

/** 칸 하나의 지금 모습 — 목록의 '옆 · 뒤 완료' 칸 */
export type ViewProgress = 'empty' | 'transit' | 'arrived' | 'verified' | 'rejected' | 'deleting' | 'deleted';

export function viewProgressOf(assetStatus: string | null | undefined): ViewProgress {
  if (!assetStatus) return 'empty';
  if (assetStatus === 'verified') return 'verified';
  if (assetStatus === 'rejected') return 'rejected';
  if (assetStatus === 'uploaded' || assetStatus === 'verifying' || assetStatus === 'unconfirmed') return 'arrived';
  if (assetStatus === 'reserved' || assetStatus === 'uploading') return 'transit';
  /* 파일을 받은 적 없는 칸과 가른다 — '없음'이면 처음부터 안 온 영상처럼 읽힌다 */
  if (assetGone(assetStatus)) return assetStatus === 'purging' ? 'deleting' : 'deleted';
  return 'empty';
}

/**
 * 칸 하나의 모습 — 목록 칸과 상세의 빈 영상 글이 같이 쓴다. 칸이 가리키는 파일이 있으면 그 상태다.
 * 칸이 비었는데 그 칸의 파일을 다 지웠으면 '지워짐'이다. 끊긴 전송을 정리가 버리면 칸을 비워서,
 * 그냥 '없음'이라고 하면 받은 적 없는 칸처럼 읽힌다. 살아 있는 파일이 남은 칸(고침 중 얼린 원본 · 아직 안 지운 버린 파일)은 '없음' 그대로다.
 */
export function slotProgressOf(assets: readonly { view: string; status: string }[], view: IntakeView, slotStatus: string | null): ViewProgress {
  if (slotStatus != null) return viewProgressOf(slotStatus);
  const files = assets.filter((a) => a.view === view);
  if (files.length === 0 || !files.every((a) => assetGone(a.status))) return 'empty';
  return files.some((a) => a.status === 'purging') ? 'deleting' : 'deleted';
}

export const VIEW_PROGRESS_TEXT: Record<ViewProgress, string> = {
  empty: '없음',
  transit: '전송 중',
  arrived: '도착',
  verified: '완료',
  rejected: '막힘',
  deleting: '지우는 중',
  deleted: '지워짐',
};

const SEOUL_DATE = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const SEOUL_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 서버 시각 → 한국 날짜 글. 없으면 '-' */
export const seoulDateText = (iso: string | null | undefined) => (iso ? SEOUL_DATE.format(new Date(iso)) : '-');
export const seoulTimeText = (iso: string | null | undefined) => (iso ? SEOUL_TIME.format(new Date(iso)) : '-');

/** hasRevision: 판에 오른 적이 있나 — 없으면 이 접수의 파일은 원본이 아니라 받은 영상이다(상세 fileWords · 칩 analysisBlockOf 와 같은 낱말) */
type RetentionCell = { originalPurgeAt: string | null; originalsPurgedAt: string | null; originalsPurging: string | null; hasRevision: boolean };

/**
 * 지금 지우는 파일이 이 접수의 지금 파일인가 — 판이 있으면 지금 판의 파일('current')이다.
 * 판이 없으면 purgingScope 는 판을 몰라 'older' 라고 하지만 지우는 파일이 다 받은 영상이다(상세 purgingFiles 와 같다).
 */
const purgingNow = (r: RetentionCell) => r.originalsPurging === 'current' || (!r.hasRevision && r.originalsPurging != null);

/** 목록의 보유 칸 — 지금 파일을 지우는 중이면 그 사실을, 지운 뒤에는 지운 날을, 아니면 지울 날을 보인다. 지우는 중에 철회로 밀린 날을 지울 날이라고 말하지 않는다 */
export const retentionCellText = (r: RetentionCell) =>
  purgingNow(r) ? '지우는 중' : r.originalsPurgedAt ? `지워짐 · ${seoulDateText(r.originalsPurgedAt)}` : seoulDateText(r.originalPurgeAt);

/**
 * 이 접수로 새 분석을 할 수 없는 까닭 — 서버의 분석 막힘(lib/intake/analysis.ts submissionBlockers) 가운데 고칠 길이 없거나 영상이 없는 것만이다. 없으면 null.
 * 'deleting' · 'deleted' 지금 판의 원본을 지우고 있거나 지웠다, 'withdrawn' 필수 동의를 철회했다, 'revoked' 초대를 폐기했다, 'overdue' 지울 날이 지나 새 분석을 안 받는다.
 * 'received_deleting' · 'received_deleted' 는 지금 판이 없는 접수(끝내지 않은 초안 · 판에 오른 적 없이 철회)의 받은 영상을 지우고 있거나 지웠다. '원본'은 판에 얼린 파일만 부른다.
 * 목록 · 상세 칩과 목록의 '분석 가능' 거름이 같은 말을 하게 이 함수 하나로 정한다(거름은 lib/intake/admin.ts 가 같은 조건을 SQL 로 쓴다).
 * 판이 없는 접수는 '분석 가능'이 될 수 없어(판을 정산해야 ready 가 된다) 거름이 받은 영상 쪽을 따로 안 본다.
 */
export type AnalysisBlock = 'deleting' | 'deleted' | 'received_deleting' | 'received_deleted' | 'withdrawn' | 'revoked' | 'overdue';

export function analysisBlockOf(
  f: RetentionCell & { status: string; invitationStatus: string },
  now: Date,
): AnalysisBlock | null {
  /* 판이 없으면 지우는 파일이 다 받은 영상이다 — purgingScope 는 판을 모르면 'older' 라고 한다 */
  if (!f.hasRevision) {
    if (f.originalsPurging) return 'received_deleting';
    if (f.originalsPurgedAt) return 'received_deleted';
  }
  if (f.originalsPurging === 'current') return 'deleting';
  if (f.originalsPurgedAt) return 'deleted';
  if (f.status === 'withdrawn') return 'withdrawn';
  if (f.invitationStatus !== 'active') return 'revoked';
  if (f.originalPurgeAt && new Date(f.originalPurgeAt).getTime() <= now.getTime()) return 'overdue';
  return null;
}

const ANALYSIS_BLOCK_TEXT: Record<AnalysisBlock, string> = {
  deleting: '원본 지우는 중',
  deleted: '원본 지워짐',
  received_deleting: '영상 지우는 중',
  received_deleted: '영상 지워짐',
  withdrawn: '분석 불가',
  revoked: '분석 불가',
  overdue: '분석 불가',
};

/**
 * 분석 칩을 대신할 글 — 막힘이 있으면 '분석 가능' · '분석 전'은 거짓이다. 없으면 null 이고 칩은 분석 상태를 그대로 말한다.
 * 분석이 끝났거나 실패한 접수는 그 사실이 그대로 참이라 안 바꾼다. 까닭은 상세의 분석 칸이 말한다.
 */
export function analysisChipText(analysisStatus: string, block: AnalysisBlock | null | undefined): string | null {
  if (analysisStatus !== 'ready' && analysisStatus !== 'none') return null;
  return block ? ANALYSIS_BLOCK_TEXT[block] : null;
}

/** 휴대폰 목록의 줄 — 칸 제목이 없어 날짜가 지울 날일 때만 이름을 붙인다. '원본'은 판에 얼린 파일만 부른다 */
export const retentionLineText = (r: RetentionCell) =>
  purgingNow(r) || r.originalsPurgedAt ? retentionCellText(r) : `${r.hasRevision ? '원본' : '영상'} 삭제 예정일 ${retentionCellText(r)}`;


/* ────────────────────────────── 초대 준비 · 링크 ────────────────────────────── */

/** 정식 주소가 아닌 까닭 — lib/intake/link-origin.ts LinkOriginProblem */
export const LINK_ORIGIN_PROBLEM_TEXT: Record<string, string> = {
  unparsable: '주소를 읽을 수 없어요',
  not_https: 'https 주소가 아니에요',
  has_path: '주소 뒤에 경로가 붙어 있어요',
  has_port: '포트 번호가 붙어 있어요',
  credentials: '주소에 계정 정보가 들어 있어요',
  ip_literal: '도메인이 아니라 IP 주소예요',
  local_host: '이 컴퓨터나 내부망에서만 열리는 주소예요',
  preview_host: '미리보기 배포 주소예요',
};

type ReadinessView = {
  blockers: readonly string[];
  link: { source: string; problem: string | null; external: boolean };
};

/** 설정 칸 이름 — 기본값을 쓰는 중이면 고칠 칸은 NEXT_PUBLIC_SITE_URL 이다 */
const originVarOf = (source: string) => (source === 'INTAKE_PUBLIC_ORIGIN' ? 'INTAKE_PUBLIC_ORIGIN' : 'NEXT_PUBLIC_SITE_URL');

/** 초대를 못 만드는 까닭 — 화면이 버튼을 끄고 이 글을 보인다. 준비됐으면 빈 목록 */
export function readinessLines(r: ReadinessView): string[] {
  const lines: string[] = [];
  if (r.blockers.includes('db')) lines.push('DB 마이그레이션 적용 전이에요. 외부 접수 표를 만든 뒤에 초대를 만들 수 있어요.');
  if (r.blockers.includes('origin')) {
    const why = r.link.problem ? ` ${textOf(LINK_ORIGIN_PROBLEM_TEXT, r.link.problem)}.` : '';
    lines.push(`외부 주소 설정이 없어요: ${originVarOf(r.link.source)}.${why} 받는 사람이 열 수 있는 https 정식 주소를 넣어 주세요.`);
  }
  return lines;
}

/** 개발용 링크의 경고 — 정식 주소가 아니면 화면이 링크 위에 붙인다. 정식이면 null */
export function devLinkText(r: Pick<ReadinessView, 'link'>): string | null {
  if (r.link.external) return null;
  const why = r.link.problem ? ` (${textOf(LINK_ORIGIN_PROBLEM_TEXT, r.link.problem)})` : '';
  return `개발용 주소라 받는 사람에게 보내면 안 돼요${why}. 정식 주소는 ${originVarOf(r.link.source)} 설정으로 정해요.`;
}

/** 새 링크 만들기의 확인 글 — 받은 영상 · 공개 결과는 이어진다 */
export const REISSUE_WARNING_TEXT = '새 링크로 바꾸면 예전 링크는 바로 막혀요. 이미 받은 영상과 공개한 결과는 새 링크로 이어져요.';

/** 받는 분이 아직 시작하지 않은 접수 — 열었는지는 기록하지 않아 모른다 */
export const UNTOUCHED_TEXT = '받는 분이 아직 시작하지 않았어요';
