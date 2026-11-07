/**
 * 외부 영상 접수 관리 화면의 이름표 — 브라우저에서도 부르는 순수 표다. 상태 값의 뜻은 lib/intake/state.ts 가 정하고, 여기는 사람이 읽는 말만 둔다.
 * 색만으로 상태를 알리지 않게 화면은 늘 이 글을 같이 보인다.
 */
import { INTAKE_ORIGINAL_RETENTION_DAYS, INTAKE_WITHDRAWN_DRAFT_GRACE_DAYS } from '@/lib/intake/limits';
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
  'consent.recorded': '동의를 남겼어요',
  'consent.withdrawn': '동의를 철회했어요',
  'consent.withdrawn_by_admin': '담당자가 필수 동의 철회를 기록했어요',
  'consent.model_withdrawn_by_admin': '담당자가 모델 개발 동의 철회를 기록했어요',
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
  'analysis.hand_set': '던지는 손을 정했어요',
  'analysis.requested': '분석을 요청했어요',
  'analysis.carried': '같은 영상의 분석을 새 판에 이어 받았어요',
  'analysis.succeeded': '분석이 끝났어요',
  'analysis.failed': '분석이 실패했어요',
  'publication.published': '결과를 공개했어요',
  'publication.unpublished': '결과 공개를 내렸어요',
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
  submitted: `접수한 날부터 ${INTAKE_ORIGINAL_RETENTION_DAYS}일`,
  withdrawn: `철회한 날부터 ${INTAKE_ORIGINAL_RETENTION_DAYS}일`,
  withdrawn_draft: `철회한 날부터 ${INTAKE_WITHDRAWN_DRAFT_GRACE_DAYS}일`,
};

export const JOB_STATE_TEXT: Record<string, string> = {
  failed: '시도를 다 썼어요',
  retrying: '다시 시도하는 중이에요',
  stalled: '일꾼이 멈춘 것 같아요',
};

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

type RetentionCell = { originalPurgeAt: string | null; originalsPurgedAt: string | null; originalsPurging: string | null };

/** 목록의 원본 칸 — 지금 판을 지우는 중이면 그 사실을, 지운 뒤에는 지운 날을, 아니면 지울 날을 보인다. 지우는 중에 철회로 밀린 날을 지울 날이라고 말하지 않는다 */
export const retentionCellText = (r: RetentionCell) =>
  r.originalsPurging === 'current' ? '지우는 중' : r.originalsPurgedAt ? `지워짐 · ${seoulDateText(r.originalsPurgedAt)}` : seoulDateText(r.originalPurgeAt);

/**
 * 분석 칩을 대신할 글 — 지금 판의 원본이 없으면 '분석 가능' · '분석 전'은 거짓이다. 없으면 null 이고 칩은 분석 상태를 그대로 말한다.
 * 분석이 끝났거나 실패한 접수는 그 사실이 그대로 참이라 안 바꾼다. 상세의 분석 칸이 쓸 수 없다는 까닭을 말한다.
 */
export function analysisGoneText(analysisStatus: string, r: Pick<RetentionCell, 'originalsPurgedAt' | 'originalsPurging'>): string | null {
  if (analysisStatus !== 'ready' && analysisStatus !== 'none') return null;
  return r.originalsPurging === 'current' ? '원본 지우는 중' : r.originalsPurgedAt ? '원본 지워짐' : null;
}

/** 휴대폰 목록의 줄 — 칸 제목이 없어 날짜가 지울 날일 때만 이름을 붙인다 */
export const retentionLineText = (r: RetentionCell) => (r.originalsPurging === 'current' || r.originalsPurgedAt ? retentionCellText(r) : `원본 삭제 예정일 ${retentionCellText(r)}`);
