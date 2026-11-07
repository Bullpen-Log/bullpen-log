/**
 * 외부 영상 접수의 오류 코드 — 서버가 던지고(IntakeError) 화면이 코드로 갈라 본다. 브라우저에서도 부를 수 있는 순수 정의다.
 * 글은 '무엇이 안 됐고 무엇을 하면 되는지' 한 문장씩. 코드 뜻은 바꾸지 말고 새 코드를 더한다.
 */

export const INTAKE_ERROR_TEXT = {
  invitation_invalid: '이 링크는 쓸 수 없어요. 링크를 보내 준 분에게 다시 받아 주세요.',
  invitation_revoked: '이 링크는 더 쓸 수 없어요. 링크를 보내 준 분에게 문의해 주세요.',
  upload_expired: '영상을 보낼 수 있는 기간이 끝났어요. 링크를 보내 준 분에게 문의해 주세요.',
  result_expired: '결과를 볼 수 있는 기간이 끝났어요. 링크를 보내 준 분에게 문의해 주세요.',
  access_code_required: '접근 코드를 입력해 주세요.',
  access_code_wrong: '접근 코드가 맞지 않아요. 다시 입력해 주세요.',
  access_code_locked: '접근 코드를 너무 많이 틀려 결과 보기를 잠갔어요. 링크를 보내 준 분에게 문의해 주세요.',
  rate_limited: '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.',
  stale_version: '다른 곳에서 내용이 바뀌었어요. 최신 내용을 불러온 뒤 다시 시도해 주세요.',
  stale_selection: '다른 기기에서 이 칸의 영상을 바꿨어요. 최신 내용을 확인해 주세요.',
  not_editable: '지금은 이 내용을 바꿀 수 없어요.',
  invalid_input: '입력한 내용을 확인해 주세요.',
  athlete_name_required: '선수 이름을 입력해 주세요.',
  athlete_name_invalid: '이름은 1자 이상 40자 이하로 입력해 주세요.',
  athlete_name_chars: '이름에 쓸 수 없는 글자가 들어 있어요. 붙여 넣었다면 직접 입력해 주세요.',
  age_band_required: '선수가 만 14세 이상인지 확인해 주세요.',
  under_14: '만 14세 미만 선수의 영상은 아직 받을 수 없어요. 법정대리인 동의 절차를 준비하고 있어요.',
  consent_required: '필수 동의를 확인해 주세요.',
  consent_stale: '동의 내용이 바뀌었어요. 다시 읽고 동의해 주세요.',
  same_pitch_required: '두 영상이 같은 투구인지 확인해 주세요.',
  same_file: '옆과 뒤에 같은 파일을 골랐어요. 다른 영상을 골라 주세요.',
  file_too_large: '파일이 너무 커요. 한도 안의 영상을 골라 주세요.',
  total_too_large: '두 영상을 합친 크기가 한도를 넘었어요.',
  file_empty: '비어 있는 파일이에요. 다른 영상을 골라 주세요.',
  too_many_assets: '영상을 너무 여러 번 바꿨어요. 링크를 보내 준 분에게 문의해 주세요.',
  asset_not_found: '이 영상을 찾을 수 없어요. 처음부터 다시 골라 주세요.',
  asset_not_selected: '지금 고른 영상이 아니에요. 최신 내용을 확인해 주세요.',
  asset_finished: '이미 전송이 끝난 영상이에요.',
  assets_incomplete: '두 영상의 전송이 아직 끝나지 않았어요.',
  correction_incomplete: '요청받은 내용을 먼저 고쳐 주세요.',
  upload_missing: '전송이 아직 끝나지 않았어요. 이어서 보내 주세요.',
  upload_size_mismatch: '도착한 파일 크기가 고른 파일과 달라요. 다시 보내 주세요.',
  upload_url_invalid: '전송 주소가 올바르지 않아요.',
  storage_unavailable: '저장소에 연결하지 못했어요. 잠시 뒤에 다시 시도해 주세요.',
  submission_not_found: '접수를 찾을 수 없어요.',
  not_finalized: '아직 접수가 끝나지 않았어요.',
  invalid_state: '지금 상태에서는 이 작업을 할 수 없어요.',
  /* 관리자 쪽 — 공개 화면에는 안 나간다 */
  admin_forbidden: '외부 영상 접수를 관리할 권한이 없어요.',
  stale_assignee: '다른 관리자가 담당자를 바꿨어요. 최신 내용을 확인해 주세요.',
  note_not_found: '메모를 찾을 수 없어요.',
  original_locked: '동의가 철회된 접수라 원본을 열 수 없어요.',
  original_unavailable: '아직 저장소에 도착하지 않은 영상이에요.',
  original_purged: '보유 기간이 끝난 원본이라 쓸 수 없어요. 필요하면 고침을 요청해 영상을 다시 받아 주세요.',
  purge_in_progress: '이 영상의 원본을 지우는 중이에요. 끝난 뒤에 다시 시도해 주세요.',
  /* 분석 · 공개 */
  analysis_not_configured: '분석 서버 설정이 없어요.',
  analysis_not_ready: '아직 분석할 수 없어요. 두 영상의 검증이 끝났는지 확인해 주세요.',
  analysis_hand_required: '던지는 손을 먼저 정해 주세요.',
  analysis_consent_missing: '선수 쪽 필수 동의가 없거나 철회됐거나, 동의 글의 판이 바뀌어 다시 받아야 해요. 분석을 시작할 수 없어요.',
  analysis_doc_draft: '국외 이전 안내가 아직 확정되지 않아 분석을 시작할 수 없어요.',
  analysis_confirm_required: '국외 이전 안내가 확정 전이에요. 알고 진행한다고 확인해 주세요.',
  analysis_busy: '이 접수는 이미 분석하고 있어요.',
  run_not_found: '분석 기록을 찾을 수 없어요.',
  run_not_publishable: '끝까지 성공한 분석 결과만 공개할 수 있어요.',
  result_not_published: '아직 공개된 결과가 없어요.',
  result_unavailable: '지금은 결과를 볼 수 없어요. 링크를 보내 준 분에게 문의해 주세요.',
} as const;

export type IntakeErrorCode = keyof typeof INTAKE_ERROR_TEXT;

const STATUS: Partial<Record<IntakeErrorCode, number>> = {
  invitation_invalid: 404,
  submission_not_found: 404,
  asset_not_found: 404,
  invitation_revoked: 403,
  admin_forbidden: 403,
  original_locked: 403,
  original_purged: 410,
  purge_in_progress: 409,
  upload_expired: 403,
  result_expired: 403,
  access_code_required: 401,
  access_code_wrong: 401,
  access_code_locked: 403,
  rate_limited: 429,
  stale_version: 409,
  stale_selection: 409,
  asset_not_selected: 409,
  stale_assignee: 409,
  analysis_busy: 409,
  run_not_found: 404,
  result_not_published: 404,
  result_unavailable: 403,
  storage_unavailable: 503,
};

export class IntakeError extends Error {
  readonly code: IntakeErrorCode;
  /** 화면에 알려도 되는 추가 사실(지금 판 번호 등) — 비밀을 넣지 않는다 */
  readonly detail?: Record<string, unknown>;

  constructor(code: IntakeErrorCode, detail?: Record<string, unknown>) {
    super(INTAKE_ERROR_TEXT[code]);
    this.name = 'IntakeError';
    this.code = code;
    this.detail = detail;
  }

  /** 알맞은 HTTP 상태 — 나머지는 400 */
  get httpStatus(): number {
    return STATUS[this.code] ?? 400;
  }
}

export const isIntakeError = (e: unknown): e is IntakeError => e instanceof IntakeError;
