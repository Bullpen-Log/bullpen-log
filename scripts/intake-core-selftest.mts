/**
 * 외부 접수의 순수 규칙 시험 — 상태 전이 · 화면 고르기 · 토큰 · 경로 · 동의 · 한도 · 파일 머리. `npm run intake:test`
 * DB · 저장소 · 네트워크에 닿지 않는다.
 */
import { ANALYSIS_CONSENT } from '@/lib/analysis-consent';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { analysisRunGate, consentDocOf, consentIsCurrent, hasRequiredConsents, INTAKE_CONSENT_DOCS, latestConsents, modelUseAllowed, overseasTransferAllowed, REQUIRED_CONSENT_KINDS } from '@/lib/intake/consent';
import { IntakeError, INTAKE_ERROR_TEXT } from '@/lib/intake/errors';
import { backoffMs } from '@/lib/intake/jobs';
import { DEFAULT_MAX_FILE_BYTES, DEFAULT_MAX_TOTAL_BYTES, GIB, INTAKE_BUCKET_MAX_BYTES, TUS_CHUNK_BYTES, intakeLimits } from '@/lib/intake/limits';
import { inspectPick } from '@/components/intake/pick';
import { REJECT_CODE_TEXT } from '@/lib/intake/admin-labels';
import { CAPTURE_FPS_FLOOR, CAPTURE_RATE_TEXT, MEDIA_REJECT_TEXT, captureMs, captureRatePickText, measuredFpsText, pickDiagnostics, captureRateCode, cleanFileText, fpsLabel, integrityLabel, mediaRejectCode, mediaUnconfirmed, nominalFpsOf, notAVideo, readIntakeMediaFacts, sniffContainer, timingNote } from '@/lib/intake/media';
import { assetObjectPath, downloadFileName, isPurgeablePath, isSubmissionPath, originalExtension, runObjectPrefix, safeNamePart, seoulDateKey } from '@/lib/intake/paths';
import { cleanAuditDetail } from '@/lib/intake/audit';
import { INTAKE_CORRECTION_HOLD_DAYS, INTAKE_ORIGINAL_RETENTION_DAYS, INTAKE_WITHDRAWN_DRAFT_GRACE_DAYS } from '@/lib/intake/limits';
import { correctionHoldUntil, currentOriginalsPurgedAt, originalRetention, originalsPurgedAt, retentionDue, shownRetention } from '@/lib/intake/retention';
import { assertInvitationAllows } from '@/lib/intake/access';
import { hashRateSubject } from '@/lib/intake/rate-limit';
import { ASSET_GONE, ASSET_STATUSES, assetArrived, assetGone, assetVerifyDone, canEditField, canEditView, canMoveAsset, canMoveAnalysis, canMovePublication, canMoveSubmission, correctionReceiptLine, currentOriginalsGone, publicStatusText, purgingScope, readCorrection, receiptHead, receiptRetentionRows, reconsentOpen, resolveScreen, type ScreenInput } from '@/lib/intake/state';
import { directStorageOrigin, tokenTtlOf } from '@/lib/intake/storage-core';
import { generateInvitationToken, generateReceiptCode, hashAccessCode, hashInvitationToken, isAccessCode, isIdempotencyKey, parseIntakeAuthorization, verifyAccessCode } from '@/lib/intake/token';
import { buildMov, hugeMoovHeader, mov120, mov240 } from './intake-fixtures.mts';

let passed = 0;
const ok = (cond: unknown, label: string) => {
  assert.ok(cond, label);
  passed++;
};
const eq = (a: unknown, b: unknown, label: string) => {
  assert.deepEqual(a, b, label);
  passed++;
};
const reader = (buf: Buffer) => ({ size: buf.length, read: async (s: number, e: number) => new Uint8Array(buf.subarray(s, e)) });

/* ── 전이 ── */
ok(canMoveAsset('reserved', 'uploading') && canMoveAsset('uploaded', 'verifying') && canMoveAsset('verifying', 'verified'), '자산 정상 길');
ok(!canMoveAsset('verified', 'uploading') && !canMoveAsset('purged', 'replaced'), '끝난 자산은 되돌아가지 않는다');
ok(canMoveSubmission('draft', 'submitted') && canMoveSubmission('submitted', 'verified'), '접수 정상 길');
ok(!canMoveSubmission('verified', 'draft') && !canMoveSubmission('withdrawn', 'draft'), '접수는 초안으로 안 돌아간다');
ok(canMoveSubmission('correction_requested', 'submitted') && canMoveSubmission('verified', 'correction_requested'), '고침 길');
ok(canMoveAnalysis('succeeded', 'queued') && canMoveAnalysis('failed', 'queued') && !canMoveAnalysis('none', 'running'), '분석 길');
ok(canMovePublication('published', 'unpublished') && !canMovePublication('published', 'published'), '공개 길');
for (const s of ASSET_STATUSES) ok(!canMoveAsset(s, s), `${s} 는 제자리로 안 옮긴다`);
ok(canMoveAsset('verifying', 'unconfirmed') && canMoveAsset('unconfirmed', 'replaced') && !canMoveAsset('unconfirmed', 'verified'), '영상 확인 못 한 자산은 저절로 검증되지 않는다');
ok(canMoveAsset('verified', 'abandoned') && canMoveAsset('rejected', 'abandoned') && canMoveAsset('unconfirmed', 'abandoned'), '끝내지 않은 접수의 도착한 자산도 버릴 수 있다');
ok(assetArrived('unconfirmed') && assetVerifyDone('unconfirmed') && assetVerifyDone('rejected') && !assetVerifyDone('verifying'), '영상 확인 못 한 자산은 도착했고 검증은 끝났다');
ok(canMoveSubmission('correction_requested', 'correction_requested'), '고침 요청은 바꿀 수 있다');
ok(canMoveSubmission('correction_requested', 'verified') && canMoveSubmission('correction_requested', 'needs_attention'), '고침 취소는 앞 상태로 돌아간다');
ok(!canMoveSubmission('correction_requested', 'draft'), '고침 취소가 초안을 만들지 않는다');
ok(reconsentOpen('verified', false) && reconsentOpen('submitted', false) && reconsentOpen('needs_attention', false), '접수 뒤 동의가 낡으면 다시 받는다');
ok(!reconsentOpen('verified', true) && !reconsentOpen('withdrawn', false) && !reconsentOpen('draft', false), '그 밖에는 이 길이 아니다');

const corr = readCorrection({ fields: ['athleteName', 'bogus'], views: ['rear', 'bad'], message: '뒤 영상을 다시' });
eq(corr, { fields: ['athleteName'], views: ['rear'], message: '뒤 영상을 다시' }, '고침 요청은 아는 칸만');
ok(canEditField('correction_requested', corr, 'athleteName') && !canEditField('correction_requested', corr, 'throwingHand'), '요청받은 글 칸만');
ok(canEditView('correction_requested', corr, 'rear') && !canEditView('correction_requested', corr, 'side'), '요청받은 칸의 영상만');
ok(!canEditField('verified', corr, 'athleteName') && !canEditView('submitted', null, 'side'), '접수 뒤에는 못 고친다');
ok(canEditField('draft', null, 'athleteAgeBand'), '초안은 다 고친다');

/* ── 화면 ── */
const base: ScreenInput = {
  invitationStatus: 'active',
  uploadExpired: false,
  resultExpired: false,
  accessCodeRequired: false,
  accessCodeOk: false,
  submissionStatus: 'draft',
  analysisStatus: 'none',
  published: false,
  hasAthleteName: false,
  underFourteen: false,
  consented: false,
  side: null,
  rear: null,
};
const screen = (p: Partial<ScreenInput>) => resolveScreen({ ...base, ...p });
eq(screen({}), 'welcome', '처음');
eq(screen({ hasAthleteName: true }), 'side', '이름 뒤에는 파일을 다시 고른다');
eq(screen({ hasAthleteName: true, consented: true, side: 'uploading' }), 'upload_recovery', '끊긴 전송');
eq(screen({ hasAthleteName: true, consented: true, side: 'verified', rear: 'reserved' }), 'upload_recovery', '한쪽만 끝난 전송');
eq(screen({ hasAthleteName: true, consented: true, side: 'uploaded', rear: 'verified' }), 'upload', '둘 다 도착하면 완료만 남는다');
eq(screen({ underFourteen: true }), 'under_14', '만 14세 미만');
eq(screen({ uploadExpired: true }), 'upload_expired', '초안 기간 끝');
eq(screen({ invitationStatus: 'revoked', submissionStatus: 'verified', published: true }), 'revoked', '폐기가 가장 먼저');
eq(screen({ submissionStatus: 'submitted' }), 'receipt', '접수');
eq(screen({ submissionStatus: 'verified', analysisStatus: 'running' }), 'analysis_running', '분석 중');
eq(screen({ submissionStatus: 'verified', analysisStatus: 'succeeded' }), 'admin_review', '공개 전 검토');
eq(screen({ submissionStatus: 'verified', analysisStatus: 'succeeded', published: true }), 'published', '공개');
eq(screen({ submissionStatus: 'verified', published: true, accessCodeRequired: true }), 'access_code', '접근 코드');
eq(screen({ submissionStatus: 'verified', published: true, accessCodeRequired: true, accessCodeOk: true }), 'published', '코드 맞음');
eq(screen({ submissionStatus: 'verified', published: true, resultExpired: true }), 'result_expired', '결과 기간 끝');
eq(screen({ submissionStatus: 'verified', published: true, uploadExpired: true }), 'published', '올리기 만료가 결과를 막지 않는다');
eq(screen({ submissionStatus: 'correction_requested' }), 'correction', '고침');
eq(screen({ submissionStatus: 'correction_requested', uploadExpired: true }), 'receipt', '고침인데 기간 끝: 기간 글만 보이지 않고 영수증 쪽으로');
eq(screen({ submissionStatus: 'correction_requested', uploadExpired: true, analysisStatus: 'succeeded' }), 'admin_review', '고침인데 기간 끝: 접수 상태를 그대로 보인다');
/* 고침 × 공개 × 기간 — 결과가 살아 있으면 어느 조합에서도 길이 있어야 한다 */
for (const uploadExpired of [false, true]) {
  for (const resultExpired of [false, true]) {
    for (const accessCodeRequired of [false, true]) {
      const got = screen({ submissionStatus: 'correction_requested', published: true, uploadExpired, resultExpired, accessCodeRequired });
      const want = !uploadExpired ? 'correction' : resultExpired ? 'result_expired' : accessCodeRequired ? 'access_code' : 'published';
      eq(got, want, `고침+공개: 기간끝=${uploadExpired} 결과끝=${resultExpired} 코드=${accessCodeRequired}`);
      ok(got !== 'upload_expired', '올리기 만료가 공개 결과를 가리지 않는다');
    }
  }
}
eq(screen({ submissionStatus: 'submitted', published: true, uploadExpired: true }), 'published', '고침을 다시 낸 뒤에도 공개는 그대로 보인다');
eq(screen({ uploadExpired: true, hasAthleteName: true, consented: true, side: 'verified', rear: 'uploaded' }), 'upload', '기간이 끝나도 둘 다 도착했으면 완료만 남는다');
eq(screen({ uploadExpired: true, hasAthleteName: true, consented: true, side: 'verified', rear: 'uploading' }), 'upload_expired', '아직 안 온 칸이 있으면 기간 끝');
eq(screen({ uploadExpired: true, hasAthleteName: true, consented: false, side: 'verified', rear: 'verified' }), 'upload_expired', '동의가 없으면 기간 끝');
eq(screen({ hasAthleteName: true, consented: true, side: 'unconfirmed', rear: 'verified' }), 'upload', '영상 확인 못 한 자산도 도착한 것이다');
eq(screen({ submissionStatus: 'withdrawn', published: true }), 'withdrawn', '철회');
ok(!publicStatusText('verified', 'ready', false).includes('알림'), '알림을 약속하지 않는다');
eq(publicStatusText('verified', 'failed', false), '담당자가 영상을 다시 확인하고 있습니다', '분석 실패는 사람이 본다는 사실만 말한다');
ok(!publicStatusText('verified', 'failed', false).includes('준비'), '저절로 다시 준비한다고 말하지 않는다');
eq(publicStatusText('correction_requested', 'ready', true), '고쳐야 할 내용이 있습니다', '공개 중이어도 고침 요청을 말한다');
ok(publicStatusText('correction_requested', 'ready', false, { uploadExpired: true }).includes('기간이 끝났습니다'), '기간이 끝난 고침은 그렇게 말한다');
ok(publicStatusText('verified', 'ready', false, { needsReconsent: true }).includes('동의'), '다시 동의가 필요하면 말한다');
eq(correctionReceiptLine({ submissionStatus: 'verified', revision: 1, publishedCurrent: false }), null, '첫 판에는 고침 줄이 없다');
ok(correctionReceiptLine({ submissionStatus: 'submitted', revision: 2, publishedCurrent: false })?.includes('고친 내용'), '다시 낸 뒤 고침 줄');
eq(correctionReceiptLine({ submissionStatus: 'verified', revision: 2, publishedCurrent: true }), null, '공개가 새 판이면 고침 줄이 없다');
eq(correctionReceiptLine({ submissionStatus: 'correction_requested', revision: 2, publishedCurrent: false }), null, '고침 중에는 고침 줄이 없다');

/* ── 초대 권한 ── */
const T0 = new Date('2026-11-06T00:00:00Z');
const later = new Date(T0.getTime() + 3600_000);
const before = new Date(T0.getTime() - 3600_000);
const inv = (p: object) => ({ status: 'active', uploadExpiresAt: later, resultExpiresAt: null, ...p });
const code = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as IntakeError).code;
  }
};
eq(code(() => assertInvitationAllows(inv({}), 'upload', T0)), null, '유효한 초대');
eq(code(() => assertInvitationAllows(inv({ uploadExpiresAt: before }), 'upload', T0)), 'upload_expired', '올리기 만료');
eq(code(() => assertInvitationAllows(inv({ uploadExpiresAt: before }), 'read', T0)), null, '만료여도 읽는다');
eq(code(() => assertInvitationAllows(inv({ uploadExpiresAt: before }), 'confirm', T0)), null, '끝난 전송의 확인은 된다');
eq(code(() => assertInvitationAllows(inv({ uploadExpiresAt: before }), 'view_result', T0)), null, '결과 만료는 따로다');
eq(code(() => assertInvitationAllows(inv({ resultExpiresAt: before }), 'view_result', T0)), 'result_expired', '결과 만료');
for (const op of ['read', 'edit', 'upload', 'confirm', 'view_result'] as const) {
  eq(code(() => assertInvitationAllows(inv({ status: 'revoked' }), op, T0)), 'invitation_revoked', `폐기면 ${op} 막음`);
}

/* ── 토큰 ── */
const tok = generateInvitationToken();
ok(tok.length === 43 && /^[A-Za-z0-9_-]+$/.test(tok), '토큰 43자');
ok(generateInvitationToken() !== tok, '토큰은 매번 다르다');
ok(hashInvitationToken(tok).length === 64 && !hashInvitationToken(tok).includes(tok), '해시');
eq(parseIntakeAuthorization(`Intake ${tok}`), tok, '머리 읽기');
eq(parseIntakeAuthorization(`Bearer ${tok}`), null, '다른 머리 막음');
eq(parseIntakeAuthorization(`Intake ${tok}x`), null, '길이 다르면 막음');
eq(parseIntakeAuthorization(null), null, '머리 없음');
const stored = await hashAccessCode('구장1234');
ok(!stored.includes('구장1234') && stored.startsWith('scrypt$'), '코드 원문을 안 남긴다');
ok(await verifyAccessCode(' 구장1234 ', stored), '코드 맞음');
ok(!(await verifyAccessCode('구장1235', stored)), '코드 틀림');
ok(!(await verifyAccessCode('구장1234', 'broken')), '깨진 값');
ok(/^IN-261106-[2-9A-HJKMNP-Z]{6}$/.test(generateReceiptCode(new Date('2026-11-06T03:00:00Z'))), '접수 번호 모양');
ok(generateReceiptCode(new Date('2026-11-05T16:00:00Z')).startsWith('IN-261106-'), '접수 번호는 한국 날짜');
ok(!isAccessCode('12345') && !isAccessCode('   12345   ') && isAccessCode('123456') && isAccessCode('a'.repeat(32)) && !isAccessCode('a'.repeat(33)), '접근 코드는 6~32자');
ok(isIdempotencyKey('a'.repeat(32)) && !isIdempotencyKey('short') && !isIdempotencyKey('x y'.repeat(9)), '요청 키 모양');

/* ── 경로 · 이름 ── */
const SUB = '11111111-1111-4111-8111-111111111111';
const AST = '22222222-2222-4222-8222-222222222222';
eq(assetObjectPath(SUB, AST), `sub/${SUB}/${AST}/original`, '원본 경로에 이름 없음');
eq(runObjectPrefix(SUB, AST), `sub/${SUB}/runs/${AST}`, '결과 경로');
assert.throws(() => assetObjectPath('../x', AST));
passed++;
ok(isSubmissionPath(`sub/${SUB}/${AST}/original`, SUB) && !isSubmissionPath(`sub/${SUB}/../other`, SUB), '경로 소유 확인');
eq(seoulDateKey(new Date('2026-11-05T15:30:00Z')), '2026-11-06', '접수일은 한국 날짜');
const when = new Date('2026-11-06T03:00:00Z');
eq(downloadFileName({ athleteName: '금윤호', receivedAt: when, receiptCode: 'IN-261106-ABCDEF', view: 'side', ext: 'mov' }), '금윤호_2026-11-06_IN-261106-ABCDEF_side_original.mov', '내려받기 이름');
eq(downloadFileName({ athleteName: 'José  O’Neil/../x', receivedAt: when, receiptCode: 'R1', view: 'rear', ext: 'mp4' }), 'José-O’Neil..x_2026-11-06_R1_rear_original.mp4', '위험한 글자 뺌');
eq(downloadFileName({ athleteName: '../..', receivedAt: when, receiptCode: 'R1', view: 'rear', ext: 'ex e' }), 'athlete_2026-11-06_R1_rear_original.bin', '이름이 비면 대체');
ok(!safeNamePart('a‮b\u0000c').match(/[‮\u0000]/), '보이지 않는 제어 글자 뺌');
eq([...safeNamePart('가'.repeat(100))].length, 40, '이름 길이 제한');
eq(originalExtension('mov', 'x.mp4'), 'mov', '그릇이 먼저');
eq(originalExtension('unknown', 'clip.MOV'), 'bin', '보낸 사람이 지은 이름으로 짐작하지 않는다');
eq(originalExtension('unknown', 'invoice.exe'), 'bin', '실행 파일 이름이 내려받기 이름이 되지 않는다');
eq(originalExtension(null, 'noext'), 'bin', '모르면 bin');

/* ── 동의 ── */
eq(INTAKE_CONSENT_DOCS.map((d) => d.kind), ['submission', 'overseas', 'model'], '동의 셋');
eq(REQUIRED_CONSENT_KINDS, ['submission'], '필수는 제출 · 처리 하나 — 수동 수집이라 국외 이전은 선택(R03 Q-R03-2)');
ok(consentDocOf('overseas').required === false && consentDocOf('overseas').defaultGranted === false, '국외 이전은 선택 · 기본 꺼짐');
ok(/내려받아/.test(consentDocOf('submission').body) && /검토하고 승인한 결과만/.test(consentDocOf('submission').body), '제출 글이 팀 내려받기 · 직접 결과 만들기 · 승인한 결과 전달을 말한다');
ok(/선택 항목에 동의했을 때만/.test(consentDocOf('submission').body), '자동 분석 서버로는 선택 동의가 있을 때만 보낸다고 말한다');
ok(!/영상을 접수할 수 없/.test(consentDocOf('overseas').body), '국외 이전 거부가 접수를 막는다고 말하지 않는다');
ok(consentDocOf('model').required === false && consentDocOf('model').defaultGranted === false, '모델 이용은 선택 · 기본 꺼짐');
ok(consentDocOf('overseas').body.includes('확인 중'), '빈 칸은 확인 중으로 쓴다');
ok(consentDocOf('overseas').body.includes('Modal Labs'), '받는 곳은 문서의 사실');
ok(!consentDocOf('overseas').body.includes('null'), '빈 값이 그대로 안 나간다');
ok(consentDocOf('submission').body.includes('분석 결과의 보유 기간: 확인 중입니다'), '정하지 않은 분석 결과 보유 기간을 지어내지 않는다');
for (const d of INTAKE_CONSENT_DOCS) ok(!d.body.includes('—'), `${d.kind} 글에 줄표 없음`);
/* R04: 약관 본문의 접수 쪽 글은 '합니다' 체 — 국외 이전 글에 끼는 ANALYSIS_CONSENT 값(다른 화면과 같이 쓰는 문서)은 빼고 본다 */
{
  const shared = [ANALYSIS_CONSENT.recipient, ANALYSIS_CONSENT.items, ANALYSIS_CONSENT.when, ANALYSIS_CONSENT.purpose, ANALYSIS_CONSENT.retention ?? '', ANALYSIS_CONSENT.contact ?? ''];
  for (const d of INTAKE_CONSENT_DOCS) {
    const own = d.body.split('\n').filter((line) => !shared.some((v) => v && line.includes(v)));
    ok(own.every((line) => !/(해요|돼요|이에요|예요|어요|아요|워요|봐요|줘요|세요)([.\s)]|$)/.test(line)), `R04: ${d.kind} 약관 글이 '합니다' 체`);
  }
}
const row = (kind: string, p: object = {}) => {
  const d = consentDocOf(kind as never);
  return { kind, docVersion: d.version, textHash: d.textHash, granted: true, agreedAt: T0, withdrawnAt: null, ...p };
};
ok(hasRequiredConsents([row('submission'), row('overseas')]), '필수와 선택 모두');
ok(hasRequiredConsents([row('submission')]), '국외 이전 없이도 필수는 찼다');
ok(hasRequiredConsents([row('submission'), row('overseas', { granted: false })]), '국외 이전을 거부해도 필수는 찼다');
ok(!hasRequiredConsents([row('overseas')]), '제출 동의가 없으면 모자람');
ok(!hasRequiredConsents([row('submission', { textHash: 'old' })]), '글이 바뀌면 다시');
ok(!hasRequiredConsents([row('submission', { withdrawnAt: later })]), '철회');
/* 자동 분석의 국외 이전 — 필수와 따로, 지금 판으로만 */
ok(overseasTransferAllowed([row('submission'), row('overseas')]), '지금 판 국외 동의 → 자동 분석 가능');
ok(!overseasTransferAllowed([row('submission')]), '국외 동의 없음 → 자동 분석 불가');
ok(!overseasTransferAllowed([row('submission'), row('overseas', { granted: false })]), '거부 → 불가');
ok(!overseasTransferAllowed([row('submission'), row('overseas', { textHash: 'old' })]), '옛 글의 동의 → 불가');
ok(!overseasTransferAllowed([row('submission'), row('overseas', { withdrawnAt: later })]), '철회 → 불가');
ok(!overseasTransferAllowed([row('overseas', { relation: 'self' })], 'parent'), '다른 관계로 낸 동의 → 불가');
ok(!modelUseAllowed([row('model', { granted: false })]) && modelUseAllowed([row('model')]), '모델 이용 답');
ok(latestConsents([row('model', { granted: false }), row('model', { agreedAt: later })]).get('model')?.granted === true, '최근 답');
ok(consentIsCurrent(undefined, consentDocOf('model')) === false, '답 없음');
/* 지금 보내는 사람의 답을 찾는다 — 고침을 거둬 관계가 돌아가면 앞서 낸 동의가 다시 보여야 한다 */
{
  const by = (relation: string, kind: string, p: object = {}) => row(kind, { relation, ...p });
  const parent = [by('parent', 'submission'), by('parent', 'overseas')];
  const coach = [by('coach', 'submission', { agreedAt: later }), by('coach', 'overseas', { agreedAt: later })];
  ok(hasRequiredConsents([...parent, ...coach], 'parent'), '다른 관계의 새 동의가 앞선 동의를 가리지 않는다');
  ok(hasRequiredConsents([...parent, ...coach], 'coach'), '새 관계의 동의도 있다');
  ok(!hasRequiredConsents(parent, 'coach'), '그 관계로 답한 적이 없으면 없다');
  ok(!hasRequiredConsents([...parent, by('coach', 'submission', { agreedAt: later, withdrawnAt: later })], 'parent'), '철회는 어느 관계의 줄이든 멈춘다');
  const refused = by('parent', 'model', { granted: false, agreedAt: later });
  ok(!modelUseAllowed([by('self', 'model'), refused], 'self'), '다른 관계로 낸 거부가 옛 동의를 지운다');
  ok(!modelUseAllowed([by('self', 'model', { granted: false }), by('coach', 'model', { agreedAt: later })], 'self'), '다른 관계의 동의가 내 거부를 지우지 않는다');
  ok(modelUseAllowed([by('self', 'model'), by('coach', 'model', { agreedAt: later })], 'self'), '다른 관계의 동의는 내 동의를 안 가린다');
  eq(latestConsents([by('self', 'model'), refused]).get('model')?.granted, false, '관계를 안 주면 마지막 답이다');
}
eq(analysisRunGate(true, {}), { ok: false, reason: 'consent_doc_draft' }, '문서가 확정 전이면 GPU 막음');
eq(analysisRunGate(false, { INTAKE_ALLOW_DRAFT_ANALYSIS: '1' }), { ok: false, reason: 'needs_confirm' }, '허용해도 확인이 필요');
eq(analysisRunGate(true, { INTAKE_ALLOW_DRAFT_ANALYSIS: '1' }), { ok: true, draft: true }, '확인하면 간다');

/* ── 한도 ── */
eq(intakeLimits(null, {}).maxFileBytes, DEFAULT_MAX_FILE_BYTES, '기본 1GiB');
eq(intakeLimits(null, {}).maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES, '기본 2GiB');
eq(intakeLimits({ maxFileBytes: 5 * GIB }, {}).maxFileBytes, INTAKE_BUCKET_MAX_BYTES, '버킷 한도를 못 넘는다');
eq(intakeLimits({ maxFileBytes: BigInt(100) }, {}).maxFileBytes, 100, 'BigInt 값');
eq(intakeLimits({ maxFileBytes: 900, maxTotalBytes: 100 }, {}).maxTotalBytes, 900, '합계는 파일 한도보다 작지 않다');
eq(intakeLimits(null, { INTAKE_MAX_FILE_BYTES: '500' }).maxFileBytes, 500, '환경변수');
eq(TUS_CHUNK_BYTES, 6 * 1024 * 1024, 'TUS 조각 6MB');

/* ── 파일 머리 ── */
eq(sniffContainer(new Uint8Array(mov240().subarray(0, 64))).container, 'mov', 'qt 상표는 mov');
eq(sniffContainer(new Uint8Array(buildMov({ stts: [[60, 10]], brand: 'isom' }).subarray(0, 64))).container, 'mp4', 'isom 은 mp4');
eq(sniffContainer(new Uint8Array(Buffer.from('<html>나쁜 파일이에요. 영상이 아니에요'))).container, 'unknown', '글 파일');
eq(sniffContainer(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])).container, 'matroska', 'webm/mkv');
eq(nominalFpsOf(239.76), 240, '239.76 → 240');
eq(nominalFpsOf(119.88), 120, '119.88 → 120');
eq(nominalFpsOf(59.94), 60, '59.94 → 60');
eq(nominalFpsOf(29.97), 30, '29.97 → 30');
eq(nominalFpsOf(23.976), 24, '23.976 → 24');
eq(nominalFpsOf(173), 173, '흔하지 않으면 반올림');

const f240 = await readIntakeMediaFacts(reader(mov240(5000, { appleDate: '2026-10-15T14:03:22+0900' })));
eq(f240.container, 'mov', '240 그릇');
eq(f240.codec, 'HEVC', 'HEVC');
eq(f240.rotation, 90, '세로로 든 폰');
eq(f240.nominalFps, 240, '240 감지');
ok(Math.abs(f240.averageFps! - 239.76) < 0.01, '평균은 소수 그대로');
eq(f240.frameTiming, 'constant', '고른 간격');
eq(f240.frameCount, 1200, '장면 수');
eq(f240.captureSource, 'apple', '촬영 시각 출처');
eq(f240.captureAtMs, Date.parse('2026-10-15T14:03:22+09:00'), '촬영 시각');
eq(fpsLabel(f240), '240fps 감지', '이름표');
ok(!fpsLabel(f240).includes('원본'), 'fps 를 원본이라고 말하지 않는다');

const f120 = await readIntakeMediaFacts(reader(mov120()));
eq(fpsLabel(f120), '120fps 감지', '120 이름표');
eq(f120.rotation, 0, '가로');

/* 가변 간격 */
const vfr = await readIntakeMediaFacts(reader(buildMov({ timescale: 600, stts: [[100, 10], [100, 20], [100, 5]] })));
eq(vfr.frameTiming, 'variable', '간격이 고르지 않다');
ok(fpsLabel(vfr).startsWith('약 '), '가변은 약');
ok(timingNote(vfr)?.includes('일정하지'), '가변 안내');

/* 끝 표본만 다른 건 고르다 */
eq((await readIntakeMediaFacts(reader(buildMov({ timescale: 600, stts: [[300, 10], [1, 7]] })))).frameTiming, 'constant', '끝 한 칸은 봐준다');

/* 슬로 모션 편집: 2초 표본을 8초로 재생 */
const slow = await readIntakeMediaFacts(reader(buildMov({ timescale: 240, stts: [[480, 1]], edits: [[600, 0], [3000, 120], [1200, 360]] })));
ok(Math.abs(slow.sampleDurationSec! - 2) < 0.001, '표본 시간 2초');
ok(Math.abs(slow.playbackDurationSec! - 8) < 0.001, '재생 8초');
ok(slow.editList.retimed && slow.editList.segments === 3, '재생이 다르다');
eq(slow.nominalFps, 240, '재생 길이로 fps 를 재지 않는다');
ok(timingNote(slow)?.includes('재생 속도'), '슬로 모션 안내');

/* 앞뒤만 자른 영상: 4초 표본 중 3초만 재생, 속도는 그대로 — 슬로 모션이라고 말하면 거짓이다 */
const trim = await readIntakeMediaFacts(reader(buildMov({ timescale: 600, stts: [[120, 20]], edits: [[1800, 600]] })));
ok(!trim.editList.retimed && trim.editList.trimmed, '자른 것은 속도 변경이 아니다');
ok(timingNote(trim) != null && !timingNote(trim)!.includes('속도'), '자른 영상의 안내');
ok(Math.abs(trim.playbackDurationSec! - 3) < 0.001 && Math.abs(trim.sampleDurationSec! - 4) < 0.001, '재생 3초 · 표본 4초');
/* 아이폰 원본처럼 조각 하나로 전부 재생 */
const whole = await readIntakeMediaFacts(reader(buildMov({ timescale: 600, stts: [[120, 20]], edits: [[2400, 0]] })));
ok(!whole.editList.retimed && !whole.editList.trimmed && timingNote(whole) === null, '편집 없는 것과 같은 영상');
/* B 장면 때문에 앞 두 장면을 건너뛰는 흔한 편집 */
const bframe = await readIntakeMediaFacts(reader(buildMov({ timescale: 600, stts: [[120, 20]], edits: [[2360, 40]] })));
ok(!bframe.editList.retimed && !bframe.editList.trimmed, '앞 몇 장면 건너뛰기는 잘린 것이 아니다');
/* ffmpeg 모양: 미디어 시각 = 첫 표시 오프셋(B 장면 둘), 재생 = 표본 전체. 복호 시간 합만 보면 앞머리만큼 늘어난 것으로 잘못 읽는다 */
for (const [fps, sec] of [[30, 2], [30, 3], [24, 4], [60, 2]] as const) {
  const d = 600 / fps;
  const f = await readIntakeMediaFacts(reader(buildMov({ timescale: 600, stts: [[fps * sec, d]], edits: [[600 * sec, d * 2]] })));
  ok(!f.editList.retimed && !f.editList.trimmed && timingNote(f) === null, `B 장면 앞머리는 늘린 것이 아니다(${fps}fps ${sec}초)`);
}
/* 앞머리로 봐주는 몫은 몇 장면까지다 — 정말 늘린 마지막 조각은 그대로 잡는다 */
const stretched = await readIntakeMediaFacts(reader(buildMov({ timescale: 600, stts: [[120, 20]], edits: [[600, 0], [6000, 600]] })));
ok(stretched.editList.retimed, '마지막 조각을 늘린 것은 잡는다');
/* 재생 속도 칸이 1 이 아니면 대응이 1:1 이 아니다 */
const rate = await readIntakeMediaFacts(reader(buildMov({ timescale: 600, stts: [[120, 20]], edits: [[2400, 0, 0.5]] })));
ok(rate.editList.retimed, '속도 칸을 읽는다');
/* 앞뒤를 자른 두 조각: 뜀은 있어도 늘어난 곳은 없다 */
const cuts = await readIntakeMediaFacts(reader(buildMov({ timescale: 600, stts: [[300, 20]], edits: [[600, 0], [600, 3000]] })));
ok(!cuts.editList.retimed && cuts.editList.trimmed, '잘라 붙이기도 속도 변경이 아니다');

/* 35mm 환산 초점거리 */
eq((await readIntakeMediaFacts(reader(mov240(2048, { appleFocal: '48' })))).focal35mm, 48, '초점거리를 읽는다');
eq((await readIntakeMediaFacts(reader(mov240()))).focal35mm, null, '없으면 null');

/* 못 읽는 파일 */
const text = await readIntakeMediaFacts(reader(Buffer.from('이건 영상이 아니에요. 그냥 글이에요. '.repeat(10))));
ok(notAVideo(text), '글은 영상 아님');
eq(fpsLabel(text), '영상 정보 확인 필요', '정보 없음 이름표');
const noMoov = await readIntakeMediaFacts(reader(mov240().subarray(0, 40)));
ok(notAVideo(noMoov), '머리가 잘린 파일');
const mkv = await readIntakeMediaFacts(reader(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4])));
eq(mediaRejectCode(mkv), 'unsupported_container', '네 바이트만 맞춘 mkv 는 받지 않는다');
ok(notAVideo(mkv) && MEDIA_REJECT_TEXT.unsupported_container.includes('MOV'), 'mkv 는 고를 때도 막고 까닭을 말한다');
eq(mediaRejectCode(text), 'not_video', '글은 not_video');

/* 머리 한도로 못 읽은 파일은 '영상 아님'이 아니라 '모름'이다 */
const hugeHead = hugeMoovHeader(17 * 1024 * 1024);
const huge = await readIntakeMediaFacts({ size: 40 * 1024 * 1024, read: async (s, e) => new Uint8Array(hugeHead.subarray(s, e)) });
eq(huge.hasVideo, null, '16MiB 넘는 moov');
ok(!notAVideo(huge) && mediaUnconfirmed(huge), '막지 않되 확인도 안 된다');
eq(fpsLabel(huge), '영상 정보 확인 필요', '확인 필요 이름표');
const manyBoxes = await readIntakeMediaFacts(reader(mov240(100, { fillerBoxes: 70 })));
ok(manyBoxes.hasVideo === null && mediaUnconfirmed(manyBoxes), '맨 위 상자가 너무 많은 파일');
ok(!mediaUnconfirmed(f240) && !mediaUnconfirmed(text) && !mediaUnconfirmed(mkv), '읽은 파일 · 막는 파일은 해당 없음');

/* 64비트 크기로 적힌 moov 도 같은 영상이다 */
const large = await readIntakeMediaFacts(reader(mov240(100, { largeMoov: true })));
ok(large.hasVideo === true && large.nominalFps === 240 && large.codec === 'HEVC', '64비트 moov 를 읽는다');

/* 파일에서 읽은 글 · 시각은 믿지 않는다 */
const nul = await readIntakeMediaFacts(reader(buildMov({ stts: [[60, 10]], codec: 'a\0\0b', brand: 'q\0\0t', appleModel: 'iPhone\u0000 15\u0007' })));
eq(nul.codec, 'ab', '코덱의 NUL 을 뺀다');
eq(nul.brand, 'qt', '상표의 NUL 을 뺀다');
eq(nul.model, 'iPhone 15', '기종의 제어 글자를 뺀다');
ok(!JSON.stringify(nul).includes('\\u0000'), '저장할 글에 NUL 이 없다');
eq((await readIntakeMediaFacts(reader(buildMov({ stts: [[60, 10]], codec: '\0\0\0\0' })))).codec, null, '남는 글자가 없으면 없는 값');
const farFuture = await readIntakeMediaFacts(reader(buildMov({ stts: [[60, 10]], mvhdCreated: BigInt(2) ** BigInt(62) })));
ok(farFuture.captureAtMs === null && farFuture.captureSource === null, '말이 안 되는 촬영 시각은 버린다');
ok(!Number.isNaN(new Date(f240.captureAtMs!).getTime()), '정상 시각은 그대로다');
eq(captureMs(8.64e15 + 1), null, 'Date 로 못 만드는 값');
eq(captureMs(Date.UTC(1980, 0, 1)), null, '너무 옛날');
eq(cleanFileText('  iPhone\u202E 15  '), 'iPhone 15', '방향 문자도 뺀다');
eq([...cleanFileText('가'.repeat(200))!].length, 80, '길이도 자른다');
eq(cleanFileText(null), null, '없는 값');

eq(integrityLabel('unconfirmed'), '영상 정보 확인 필요', '확인 못 한 자산은 그대로라고 말하지 않는다');
eq(integrityLabel('verified'), '선택한 파일 그대로 전송됨', '검증 뒤 이름표');
eq(integrityLabel('uploaded'), null, '검증 전에는 말하지 않는다');

/* ── 그 밖 ── */
eq(directStorageOrigin('https://abcd1234.supabase.co'), 'https://abcd1234.storage.supabase.co', '직접 저장소 주소');
eq(directStorageOrigin('http://127.0.0.1:54321'), 'http://127.0.0.1:54321', '로컬은 그대로');
const jwt = (exp: number) => `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`;
eq(tokenTtlOf(jwt(1000), 400_000), 600_000, '토큰 남은 시간');
ok(tokenTtlOf('not-a-token', 0) > 0, '못 읽으면 짧은 기본값');
ok(backoffMs(1) === 30_000 && backoffMs(2) === 60_000 && backoffMs(30) === 3_600_000, '기다림');
eq(cleanAuditDetail({ uploadUrl: 'x', token: 'y', view: 'side', receiptCode: 'IN', size: BigInt(3) }), { uploadUrl: '[빼 둠]', token: '[빼 둠]', view: 'side', receiptCode: 'IN', size: 3 }, '감사 기록에 비밀 없음');
ok(hashRateSubject('1.2.3.4', 'a') !== hashRateSubject('1.2.3.4', 'b') && !hashRateSubject('1.2.3.4', 'a').includes('1.2.3.4'), '주소 해시');
const err = new IntakeError('stale_version', { currentVersion: 3 });
ok(err.httpStatus === 409 && err.message === INTAKE_ERROR_TEXT.stale_version, '오류 코드');
ok(new IntakeError('under_14').httpStatus === 400, '기본 400');
for (const [k, v] of Object.entries(INTAKE_ERROR_TEXT)) ok(!v.includes('—'), `${k} 글에 줄표 없음`);

/* 이름이 없는 초안은 끝낼 수 없다 — 나이를 고치며 이름이 지워진 경우, 파일이 다 왔어도 이름부터 받는다 */
{
  const nameless = { invitationStatus: 'active', uploadExpired: false, resultExpired: false, accessCodeRequired: false, accessCodeOk: false, submissionStatus: 'draft', analysisStatus: 'none', published: false, hasAthleteName: false, underFourteen: false, consented: true, side: 'verified', rear: 'verified' };
  eq(resolveScreen(nameless), 'welcome', '이름 없이 파일이 다 왔으면 이름부터');
  eq(resolveScreen({ ...nameless, uploadExpired: true }), 'upload_expired', '기간이 끝나면 이름을 저장할 수 없다');
  eq(resolveScreen({ ...nameless, hasAthleteName: true }), 'upload', '이름이 있으면 끝내기');
}

/* 고를 때도 까닭대로 말한다 — mkv 를 고른 사람에게 '영상이 아니에요'라고 하지 않는다 */
{
  const limits = { maxFileBytes: 1e9, maxTotalBytes: 2e9, maxAssets: 12 };
  const r = await inspectPick(new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4])], 'a.mkv'), limits, { picked: null, asset: null });
  eq(r.ok ? null : r.message, MEDIA_REJECT_TEXT.unsupported_container, 'MKV 를 고르면 MOV · MP4 만 받는다고 말한다');
  const t = await inspectPick(new File([new TextEncoder().encode('글입니다. '.repeat(20))], 'a.mov'), limits, { picked: null, asset: null });
  eq(t.ok ? null : t.message, MEDIA_REJECT_TEXT.not_video, '영상이 아니면 그대로 말한다');
}

/* 막힌 까닭의 글 — 코드가 그대로 나가면 안 된다 */
ok(REJECT_CODE_TEXT.unsupported_container && !/[a-z_]{5,}/.test(REJECT_CODE_TEXT.unsupported_container), '관리자 글이 있다');
ok(MEDIA_REJECT_TEXT.unsupported_container.includes('MOV'), '고르는 사람 글');

/* ── 원본 보유 기간 — 규칙 한 곳(lib/intake/retention.ts) ── */
{
  const DAY = 86_400_000;
  const d = (n: number) => new Date(Date.parse('2026-01-01T00:00:00Z') + n * DAY);
  const plain = { publishedAts: [] as Date[], lastFrozenAt: null as Date | null, withdrawnAt: null as Date | null };
  eq([INTAKE_ORIGINAL_RETENTION_DAYS, INTAKE_WITHDRAWN_DRAFT_GRACE_DAYS], [90, 7], '보유 90일 · 유예 7일');
  eq(originalRetention(plain), null, '끝내지 않은 초안에는 시계가 없다');

  const sent = originalRetention({ ...plain, lastFrozenAt: d(0) })!;
  eq([sent.basis, sent.purgeAt], ['submitted', d(90)], '공개하지 않은 접수는 마지막으로 낸 날부터');
  eq(originalRetention({ ...plain, lastFrozenAt: d(20) })!.purgeAt, d(110), '다시 내면 그 판의 시각이다');
  ok(!retentionDue(sent, new Date(d(90).getTime() - 1)), '90일이 되기 1ms 전에는 안 지운다');
  ok(retentionDue(sent, d(90)), '90일이 된 그 시각부터 지운다');
  ok(!retentionDue(null, d(9999)), '시계가 없으면 지울 날도 없다');

  const pub = originalRetention({ ...plain, lastFrozenAt: d(0), publishedAts: [d(10), d(40), d(20)] })!;
  eq([pub.basis, pub.anchorAt, pub.purgeAt], ['published', d(40), d(130)], '내린 공개까지 넣어 가장 늦은 공개일이다');
  const again = originalRetention({ ...plain, lastFrozenAt: d(60), publishedAts: [d(40)] })!;
  eq([again.basis, again.purgeAt], ['resubmitted', d(150)], '공개 뒤에 다시 내면 시계가 새로 돈다');
  eq(originalRetention({ ...plain, lastFrozenAt: d(60), publishedAts: [d(40), d(70)] })!.purgeAt, d(160), '고친 뒤 다시 공개하면 공개일이 이긴다');

  const left = originalRetention({ ...plain, lastFrozenAt: d(0), withdrawnAt: d(30) })!;
  eq([left.basis, left.purgeAt], ['withdrawn', d(120)], '공개한 적 없는 철회는 철회한 날부터');
  eq(originalRetention({ ...plain, lastFrozenAt: d(0), publishedAts: [d(10)], withdrawnAt: d(80) })!.purgeAt, d(100), '철회가 공개한 접수의 시계를 늦추지 않는다');
  eq(originalRetention({ ...plain, lastFrozenAt: d(50), publishedAts: [d(10)], withdrawnAt: d(80) })!.purgeAt, d(140), '철회해도 다시 낸 날은 그대로다');
  const loose = originalRetention({ ...plain, withdrawnAt: d(5) })!;
  eq([loose.basis, loose.purgeAt], ['withdrawn_draft', d(12)], '판에 오른 적 없는 철회는 7일 유예다');

  /* 지적 9: 표시 도우미 — 지울 파일이 없는 철회 초안만 날짜를 안 보인다. 삭제 판단은 originalRetention 그대로다 */
  eq(shownRetention(loose, 0), null, '파일이 없는 철회 초안에는 지울 날을 안 보인다');
  eq(shownRetention(loose, 1), loose, '파일이 있으면 유예 끝날을 보인다');
  eq(shownRetention(left, 0), left, '판에 오른 철회는 자산 수와 상관없다');
  eq(shownRetention(sent, 0), sent, '낸 접수도 그대로다');
  eq(shownRetention(null, 0), null, '시계가 없으면 없다');

  const hold = (s: Partial<Parameters<typeof correctionHoldUntil>[1]>, now: Date) => correctionHoldUntil(sent, { status: 'correction_requested', invitationStatus: 'active', uploadExpiresAt: d(95), ...s }, now);
  eq(hold({}, d(91)), d(95), '고칠 수 있는 동안 기다린다');
  eq(hold({ uploadExpiresAt: d(200) }, d(91)), d(90 + INTAKE_CORRECTION_HOLD_DAYS), '기간을 늘려도 상한까지만 기다린다');
  eq(hold({ uploadExpiresAt: d(200) }, d(90 + INTAKE_CORRECTION_HOLD_DAYS)), null, '상한이 된 그 시각부터 안 기다린다');
  eq(hold({}, d(95)), null, '올리기 기간이 끝나면 안 기다린다');
  eq(hold({ status: 'verified' }, d(91)), null, '고침이 없으면 안 기다린다');
  eq(hold({ invitationStatus: 'revoked' }, d(91)), null, '폐기되면 고칠 사람이 없다');
  eq(correctionHoldUntil(null, { status: 'correction_requested', invitationStatus: 'active', uploadExpiresAt: d(95) }, d(91)), null, '시계가 없으면 기다릴 것도 없다');

  eq(originalsPurgedAt([]), null, '파일이 없으면 지운 날도 없다');
  eq(originalsPurgedAt([{ purgedAt: d(1) }, { purgedAt: null }]), null, '하나라도 남으면 아직이다');
  eq(originalsPurgedAt([{ purgedAt: d(1) }, { purgedAt: d(3) }]), d(3), '다 지운 시각이다');

  /* 지워도 되는 경로 */
  const s1 = '11111111-1111-4111-8111-111111111111';
  const s2 = '22222222-2222-4222-8222-222222222222';
  const a1 = '33333333-3333-4333-8333-333333333333';
  ok(isPurgeablePath(assetObjectPath(s1, a1), s1), '이 접수의 원본');
  ok(isPurgeablePath(`sub/${s1}/runs/${a1}/preview-side.mp4`, s1) && isPurgeablePath(`sub/${s1}/runs/${a1}/preview-rear.mp4`, s1), '실행의 미리보기');
  ok(!isPurgeablePath(`sub/${s1}/runs/${a1}/analysis.json`, s1), '분석 결과는 지울 수 없다');
  ok(!isPurgeablePath(assetObjectPath(s2, a1), s1), '다른 접수의 원본');
  ok(!isPurgeablePath(`sub/${s1}/../${s2}/${a1}/original`, s1), '경로 뛰어넘기');
  ok(!isPurgeablePath(`${s1}/pitch-lab/${a1}/side.mov`, s1), '다른 폴더');
  ok(!isPurgeablePath(`sub/${s1}/${a1}/original/x`, s1) && !isPurgeablePath(`sub/${s1}/${a1}/original\n`, s1), '뒤에 무엇이 붙은 경로');
  ok(!isPurgeablePath(assetObjectPath(s1, a1), 'nope'), '접수 번호 모양이 틀림');

  /* 상태표 — 판에 오른 원본은 'purging' 을 거쳐서만 지운 것으로 간다 */
  for (const from of ['uploaded', 'verifying', 'verified', 'unconfirmed', 'rejected', 'replaced', 'abandoned'] as const) ok(canMoveAsset(from, 'purging'), `${from} → 지우는 중`);
  for (const from of ['reserved', 'uploading', 'purging', 'purged'] as const) ok(!canMoveAsset(from, 'purging'), `${from} 는 지우기로 못 정한다`);
  for (const from of ['replaced', 'abandoned', 'purging'] as const) ok(canMoveAsset(from, 'purged'), `${from} → 지움`);
  for (const from of ['reserved', 'uploading', 'uploaded', 'verifying', 'verified', 'unconfirmed', 'rejected', 'purged'] as const) ok(!canMoveAsset(from, 'purged'), `${from} 는 바로 못 지운다`);
  for (const to of ASSET_STATUSES) if (to !== 'purged') ok(!canMoveAsset('purging', to), `지우는 중에서 ${to} 로 돌아오는 길은 없다`);
  eq([...ASSET_GONE], ['purging', 'purged'], '바이트가 없다고 치는 상태');
  for (const s of ASSET_STATUSES) eq(assetGone(s), (ASSET_GONE as readonly string[]).includes(s), `${s} 판정이 목록과 같다`);
  ok(!assetArrived('purging') && !assetVerifyDone('purging'), '지우는 파일은 도착한 파일로 안 친다');

  /* 지우는 중인 원본이 어느 쪽인가 */
  const pair = { sideAssetId: 'a', rearAssetId: 'b' };
  eq(purgingScope([{ id: 'a', status: 'verified' }], pair), null, '지우는 파일이 없다');
  eq(purgingScope([{ id: 'a', status: 'purging' }, { id: 'c', status: 'purged' }], pair), 'current', '지금 판의 파일을 지운다');
  eq(purgingScope([{ id: 'a', status: 'verified' }, { id: 'c', status: 'purging' }], pair), 'older', '옛 판의 파일뿐이다');
  eq(purgingScope([{ id: 'c', status: 'purging' }], null), 'older', '지금 판을 모르면 지금 판이라고 안 말한다');

  /* 화면이 말하는 지운 날 — 지금 판의 두 파일을 본다 */
  const purgedPair = [{ id: 'a', purgedAt: d(5) }, { id: 'b', purgedAt: d(6) }];
  eq(currentOriginalsPurgedAt([...purgedPair, { id: 'c', purgedAt: null }], pair), d(6), '옛 판 파일이 남아도 지금 판을 지운 날을 말한다');
  eq(currentOriginalsPurgedAt([{ id: 'a', purgedAt: d(5) }, { id: 'b', purgedAt: null }, { id: 'c', purgedAt: d(1) }], pair), null, '지금 판이 남았으면 없다');
  eq(currentOriginalsPurgedAt([{ id: 'c', purgedAt: d(1) }], null), d(1), '판이 없으면 있는 파일을 본다');
  eq(currentOriginalsPurgedAt([], null), null, '파일이 없으면 없다');

  /* 영수증의 원본 줄 — 지우는 중이면 날짜를 안 말한다 */
  const receipt = (s: Partial<Parameters<typeof receiptRetentionRows>[0]>) => receiptRetentionRows({ originalDeleting: null, originalDeletedDate: null, originalDeleteDate: null, ...s });
  eq(receipt({}), [], '시계가 없으면 줄이 없다');
  eq(receipt({ originalDeleteDate: '2027-02-04' }), [{ label: '원본 삭제 예정일', date: '2027-02-04' }], '지울 날을 말한다');
  eq(receipt({ originalDeleteDate: '2027-02-04', originalDeletedDate: '2027-02-05' }), [{ label: '원본 지운 날', date: '2027-02-05' }], '지운 뒤에는 지운 날이다');
  eq(receipt({ originalDeleteDate: '2027-05-07', originalDeleting: 'current' }), [{ label: '원본', text: '지우는 중입니다' }], '철회로 밀린 날을 예정일이라고 안 말한다');
  eq(receipt({ originalDeleteDate: '2027-05-07', originalDeleting: 'older' }), [{ label: '원본 삭제 예정일', date: '2027-05-07' }, { label: '옛 영상', text: '지우는 중입니다' }], '옛 영상을 따로 말한다');
  eq(receipt({ originalDeleteDate: '2027-02-04', originalDeletedDate: '2027-02-05', originalDeleting: 'older' }), [{ label: '원본 지운 날', date: '2027-02-05' }, { label: '옛 영상', text: '지우는 중입니다' }], '지운 날과 옛 영상을 같이 말한다');

  /* 'purged' 비교가 새로 생기면 지우는 파일을 있음으로 본다 — 도우미를 쓰게 소스를 훑는다. 예외: 상태 정의, 두 삭제의 끝 쓰기 */
  const PURGED_ALLOWED: [string, RegExp][] = [
    ['lib/intake/state.ts', /'purged'/],
    ['lib/intake/purge.ts', /status: 'purged', purgedAt: now/],
    ['lib/intake/service.ts', /status: 'purged', purgedAt: now/],
  ];
  const sources = ['lib/intake', 'components/intake', 'app/(app)/admin/intake'].flatMap((root) =>
    (readdirSync(root, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f)).map((f) => `${root}/${f}`),
  );
  ok(sources.length > 30 && !sources.some((f) => f.endsWith('.selftest.mts')), '소스를 훑는다(시험 값은 뺀다)');
  const comparisons = sources.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.includes("'purged'") && !/^\s*(\*|\/\*|\/\/)/.test(line) && !/outcome/.test(line))
      .map((line) => ({ file, line: line.trim() })),
  );
  eq(comparisons.filter(({ file, line }) => !PURGED_ALLOWED.some(([f, re]) => f === file && re.test(line))), [], "'purged' 를 직접 견주지 않는다 — assetGone · ASSET_GONE 을 쓴다");
  ok(PURGED_ALLOWED.every(([f]) => comparisons.some((c) => c.file === f)), '허용 목록이 낡지 않았다');

  /* 동의 글 — 정한 규칙을 그대로 말한다 */
  const body = consentDocOf('submission').body;
  ok(body.includes('공개한 날, 공개하지 않은 접수는 접수한 날, 철회한 접수는 철회한 날부터 90일 뒤 원본을 지웁니다'), '보유 규칙');
  ok(body.includes('모델 개발에 동의해도 같습니다'), '모델 동의는 예외가 아니다');
  ok(!body.includes('자동으로 지우지 않아요'), '옛 약속이 안 남는다');
  const model = consentDocOf('model').body;
  ok(model.includes('필수 동의를 철회해도 이 동의는 함께 철회되지 않습니다'), '필수 철회와 따로다');
  ok(model.includes('따로 철회할 수 있습니다') && model.includes('담당자에게 알리면'), '철회 길을 말한다');
  ok(model.includes('지운 뒤에는 원본을 모델 작업에 쓰지 않습니다'), '지운 뒤에는 안 쓴다');
  ok(!consentDocOf('submission').version.endsWith('.2') && consentDocOf('model').version !== 'intake-model-2026-11-06', '두 문서의 판이 오른다');
  eq(integrityLabel('purged'), '보유 기간이 지나 원본을 지웠습니다', '지운 파일을 그대로 전송됨이라고 안 말한다');
  eq(integrityLabel('purging'), '보유 기간이 지나 원본을 지우는 중입니다', '지우는 파일도 사실대로 말한다');
  eq([integrityLabel('purged', false), integrityLabel('purging', false)], ['접수에 쓰이지 않은 임시 파일이라 지웠습니다', '접수에 쓰이지 않은 임시 파일이라 지우는 중입니다'], '판에 오른 적 없는 파일은 보유 기간이 까닭이라고 안 한다');
  /* 검증 지적: 철회 유예가 끝나 지운 받은 영상을 '쓰이지 않은 임시 파일'이라고 했다 — 까닭은 철회다 */
  eq([integrityLabel('purged', false, true), integrityLabel('purging', false, true)], ['접수를 철회해서 지웠습니다', '접수를 철회해서 지우는 중입니다'], '철회해서 지운 받은 영상은 철회를 까닭으로 말한다');
  eq(integrityLabel('purged', true, true), '보유 기간이 지나 원본을 지웠습니다', '판에 얼린 원본은 보유 기간이 까닭이다');
  eq(new IntakeError('purge_in_progress').httpStatus, 409, '지우는 중 공개는 충돌로 답한다');
}

/* ── 지금 판의 원본이 없을 때의 글(지적 1 · 3) ── */
{
  const rev = { sideAssetId: 's', rearAssetId: 'r' };
  const row = (id: string, status: string) => ({ id, status });
  eq(currentOriginalsGone([row('s', 'verified'), row('r', 'verified')], rev), null, '살아 있으면 말이 없다');
  eq(currentOriginalsGone([row('s', 'purging'), row('r', 'purging')], rev), 'deleting', '표시만 걸려도 지우는 중이다');
  eq(currentOriginalsGone([row('s', 'purged'), row('r', 'purging')], rev), 'deleting', '하나가 남으면 지우는 중이다');
  eq(currentOriginalsGone([row('s', 'purged'), row('r', 'purged')], rev), 'deleted', '둘 다 끝나야 지웠다');
  eq(currentOriginalsGone([row('s', 'purged'), row('r', 'purged'), row('n1', 'verified'), row('n2', 'verified')], { sideAssetId: 'n1', rearAssetId: 'n2' }), null, '옛 판을 지워도 새 판이 살아 있으면 말이 없다');
  eq(currentOriginalsGone([row('s', 'purged')], null), null, '판이 없으면 말이 없다');

  ok(!reconsentOpen('verified', false, 'deleted') && !reconsentOpen('needs_attention', false, 'deleting'), '지운 접수에는 동의를 다시 안 받는다');
  ok(reconsentOpen('verified', false, null), '살아 있으면 그대로 받는다');
  eq(correctionReceiptLine({ submissionStatus: 'verified', revision: 2, publishedCurrent: false, originalsGone: 'deleted' }), null, '지운 판을 담당자가 확인한다고 안 말한다');

  /* 격자 — 어느 상태에서도 없는 영상의 분석을 약속하지 않는다. 끝난 분석의 결과는 남아 공개할 수 있어서 그때만 검토를 말한다 */
  const bad: string[] = [];
  const PROMISE = /분석을 기다리|분석하고 있어요|영상을 확인하고|다시 확인하고|잘 도착|다시 확인해 주시면/;
  const HEAD_PROMISE = /공개되면|잘 도착|영상을 확인하고|분석하고 있어요|그대로 있어요/;
  for (const gone of ['deleting', 'deleted'] as const) {
    for (const status of ['submitted', 'verified', 'needs_attention', 'correction_requested']) {
      for (const analysis of ['none', 'ready', 'queued', 'running', 'failed', 'succeeded']) {
        for (const uploadExpired of [false, true]) {
          const text = publicStatusText(status, analysis, false, { uploadExpired, originalsGone: gone });
          if (PROMISE.test(text)) bad.push(`글 ${gone} ${status} ${analysis}: ${text}`);
          if (status !== 'correction_requested' && analysis !== 'succeeded' && !text.includes(gone === 'deleted' ? '지웠습니다' : '지우는 중입니다')) bad.push(`사실 ${gone} ${status} ${analysis}: ${text}`);
          for (const screen of ['receipt', 'analysis_running', 'admin_review']) {
            const head = receiptHead({ screen, submissionStatus: status, analysisStatus: analysis, originalsGone: gone });
            if (analysis !== 'succeeded' && HEAD_PROMISE.test(head.title + head.desc)) bad.push(`머리 ${gone} ${status} ${analysis} ${screen}: ${head.title} / ${head.desc}`);
            if (status === 'correction_requested' && head.desc.includes('그대로 있습니다')) bad.push(`고침 머리 ${gone} ${analysis}: ${head.desc}`);
          }
        }
      }
    }
  }
  eq(bad, [], '지운 뒤 글 격자');

  eq(publicStatusText('verified', 'succeeded', false, { originalsGone: 'deleted' }), '담당자가 결과를 검토하고 있습니다', '끝난 분석의 결과는 남는다');
  eq(receiptHead({ screen: 'admin_review', submissionStatus: 'verified', analysisStatus: 'succeeded', originalsGone: 'deleted' }).title, '담당자가 결과를 검토하고 있습니다', '머리도 같은 말이다');
  eq(publicStatusText('verified', 'ready', true, { originalsGone: 'deleted' }), '결과가 공개됐습니다', '공개 중이면 결과를 말한다');
  eq(publicStatusText('withdrawn', 'ready', false, { originalsGone: 'deleted' }), '접수가 철회됐습니다', '철회는 철회를 말한다');
  ok(publicStatusText('correction_requested', 'ready', false, { uploadExpired: true, originalsGone: 'deleted' }).includes('문의'), '기간이 끝난 고침은 문의를 말한다');
  eq(publicStatusText('correction_requested', 'ready', false, { originalsGone: 'deleted' }), '고쳐야 할 내용이 있습니다', '고칠 수 있으면 고침을 말한다');
  eq(publicStatusText('verified', 'ready', false), '파일을 확인했습니다. 결과 준비를 기다리고 있습니다', '살아 있으면 글이 그대로다');
  eq(receiptHead({ screen: 'receipt', submissionStatus: 'verified', analysisStatus: 'ready', originalsGone: null }).title, '영상이 도착했습니다', '살아 있으면 머리가 그대로다');
  eq(receiptHead({ screen: 'receipt', submissionStatus: 'correction_requested', analysisStatus: 'ready', originalsGone: null }).desc, '접수된 내용은 그대로 있습니다. 링크를 보내 준 담당자에게 문의하십시오.', '안 지웠으면 그대로 있다고 말한다');
  eq(receiptHead({ screen: 'receipt', submissionStatus: 'needs_attention', analysisStatus: 'none', originalsGone: null }).title, '영상을 확인하고 있습니다', '확인 중 머리가 그대로다');

  /* 검증 지적: 재분석이 실패한 뒤 지운 접수 — 앞선 성공 실행은 공개할 수 있어 '결과가 안 나온다'고 단정하지 않는다. 할 수 없는 일(새 분석)만 말한다 */
  for (const gone of ['deleting', 'deleted'] as const) {
    for (const analysis of ['none', 'ready', 'failed']) {
      const head = receiptHead({ screen: 'receipt', submissionStatus: 'verified', analysisStatus: analysis, originalsGone: gone });
      ok(!head.desc.includes('나오지 않아요') && head.desc.includes('새 분석'), `지운 뒤 머리가 결과를 단정하지 않는다: ${gone} ${analysis}`);
    }
  }
}

/* ── R04: 120fps 필수 규칙 — 표본 시간으로 재고, 허용 폭은 119.82 까지(119.88 = 120 × 1000/1001) ── */
{
  const rate = async (o: Parameters<typeof buildMov>[0]) => captureRateCode(await readIntakeMediaFacts(reader(buildMov(o))));
  eq(await rate({ timescale: 120000, stts: [[600, 1001]] }), null, '119.88fps(NTSC 120) 받는다');
  eq(await rate({ timescale: 600, stts: [[600, 5]] }), null, '120fps 받는다');
  eq(await rate({ timescale: 240000, stts: [[1200, 1001]] }), null, '239.76fps 받는다');
  eq(await rate({ timescale: 600, stts: [[1200, 2]] }), null, '300fps 받는다');
  eq(await rate({ timescale: 119700, stts: [[600, 1000]] }), 'capture_rate_low', '119.7fps 는 이름표로는 120 이지만 막는다(좁은 폭)');
  eq(nominalFpsOf(119.7), 120, '이름표 반올림은 판단과 다르다');
  eq(await rate({ timescale: 600, stts: [[600, 10]] }), 'capture_rate_low', '60fps 막는다');
  eq(await rate({ timescale: 30000, stts: [[300, 1001]] }), 'capture_rate_low', '29.97fps 막는다');
  /* 아이폰 슬로 모션 원본: 240 표본 + 늘린 편집 목록 → 받는다. 펴서 30 으로 내보낸 파일 → 막는다 */
  eq(await rate({ timescale: 240, stts: [[480, 1]], edits: [[600, 0], [3000, 120], [1200, 360]] }), null, '늘려 재생하는 240fps 원본은 받는다');
  eq(await rate({ timescale: 600, stts: [[300, 20]], edits: [[2400, 0, 0.5]] }), 'capture_rate_low', '재생 속도만 바꾼 30fps 는 막는다');
  /* 몇 장면 빠진 진짜 120 — 평균은 하한 밑이어도 가장 많은 간격이 120 이면 받는다 */
  const dropped = await readIntakeMediaFacts(reader(buildMov({ timescale: 120000, stts: [[598, 1001], [2, 2002]] })));
  ok(dropped.frameTiming === 'constant' && (dropped.averageFps ?? 0) < CAPTURE_FPS_FLOOR && captureRateCode(dropped) === null, '몇 장면 빠진 120 원본은 받는다');
  /* 간격이 고르지 않은 파일 — 평균도 넘어야 한다 */
  eq(await rate({ timescale: 240000, stts: [[100, 1000], [60, 8000]] }), 'capture_rate_low', '240 간격이 많아도 평균이 66 이면 막는다');
  eq(await rate({ timescale: 240000, stts: [[200, 1000], [10, 1500]] }), null, '간격이 조금 고르지 않아도 평균 · 간격이 120 넘으면 받는다');
  /* 모름 */
  eq(await rate({ timescale: 600, stts: [] }), 'capture_rate_unknown', '표본 시간표가 없으면 모름');
  eq(captureRateCode(null), 'capture_rate_unknown', '사실이 없으면 모름');
  eq(captureRateCode({ averageFps: 240, frameTiming: 'variable', stepFps: undefined }), null, '옛 사실(stepFps 없음)은 평균으로 본다');
  /* R07: 시간 단위가 240 으로 안 나뉘는 파일(600) — 간격이 2 · 3 번갈아 고르지 않아도 평균 240 이면 받는다(정수 반올림 조사) */
  const alt: [number, number][] = Array.from({ length: 480 }, (_, i) => [1, i % 2 ? 3 : 2]);
  eq(await rate({ timescale: 600, stts: alt }), null, '시간 단위 600 의 240fps(간격 2·3 번갈음)는 받는다');
  const alt120: [number, number][] = Array.from({ length: 600 }, (_, i) => [1, i % 6 === 5 ? 6 : 5]);
  eq(await rate({ timescale: 600, stts: alt120 }), 'capture_rate_low', '간격이 5·6 섞인 약 115fps 는 막는다');
  /* R07: 진단 줄 · 잰 fps 글 — 파일 이름 · 기종을 넣지 않고, 모르면 지어내지 않는다 */
  const f240 = await readIntakeMediaFacts(reader(mov240(1024)));
  eq(measuredFpsText(f240), '239.76', '잰 fps 는 반올림 이름표가 아니라 잰 값(239.76)');
  eq(measuredFpsText({ averageFps: 119.88011988, stepFps: 119.88011988 }), '119.88', '119.88 그대로');
  eq(measuredFpsText({ averageFps: null, stepFps: null }), null, '모르면 null');
  eq(captureRatePickText('capture_rate_unknown', f240), CAPTURE_RATE_TEXT.capture_rate_unknown, '모름 글은 숫자를 안 넣는다');
  const diag = pickDiagnostics(f240, 1024);
  ok(diag.some((l) => l.includes('239.76fps')) && diag.every((l) => !/IMG_|iPhone/.test(l)), '진단 줄은 잰 값만 적는다');
  eq(pickDiagnostics(null, 10)[1], '파일 머리를 읽지 못했습니다', '머리를 못 읽으면 그렇게 적는다');
  /* R07 검수: 판정과 글이 같은 기준을 말한다 — 간격 240 · 평균 66 은 평균 때문에 막힌다 */
  const vf = { stepFps: 240, averageFps: 66, frameTiming: 'variable' as const };
  eq(captureRateCode(vf), 'capture_rate_low', '간격 240 · 평균 66 은 막힌다(판정 그대로)');
  ok(/240fps이지만 평균은 66fps/.test(captureRatePickText('capture_rate_low', vf)), '글이 걸린 평균 기준과 두 값을 적는다');
  eq(captureRatePickText('capture_rate_low', { stepFps: 240, averageFps: 240, frameTiming: 'constant' }), CAPTURE_RATE_TEXT.capture_rate_low, '걸린 기준을 못 가리면 일반 글');
}

/* R04: 약관 판이 오르면 R03b 판으로 남은 동의는 지금 동의가 아니다 — 줄은 그대로 두고, 옮기지 않는다 */
{
  const at = new Date('2026-11-13T09:00:00Z');
  const old = [
    { kind: 'submission', docVersion: 'intake-submission-2026-11-13.4', textHash: 'r03b', granted: true, agreedAt: at, withdrawnAt: null, relation: 'self' },
    { kind: 'overseas', docVersion: 'intake-overseas-2026-11-13.3+x', textHash: 'r03b', granted: true, agreedAt: at, withdrawnAt: null, relation: 'self' },
    { kind: 'model', docVersion: 'intake-model-2026-11-13.3', textHash: 'r03b', granted: true, agreedAt: at, withdrawnAt: null, relation: 'self' },
  ];
  ok(!hasRequiredConsents(old, 'self'), 'R04: R03b 판 필수 동의는 다시 받아야 한다');
  ok(!overseasTransferAllowed(old, 'self') && !modelUseAllowed(old, 'self'), 'R04: R03b 판 선택 동의도 지금 동의가 아니다(자동 분석 · 모델 개발 안 됨)');
  const fresh = [...old, ...INTAKE_CONSENT_DOCS.filter((d) => d.required).map((d) => ({ kind: d.kind, docVersion: d.version, textHash: d.textHash, granted: true, agreedAt: new Date(at.getTime() + 1), withdrawnAt: null, relation: 'self' }))];
  ok(hasRequiredConsents(fresh, 'self') && !overseasTransferAllowed(fresh, 'self'), 'R04: 필수만 다시 받으면 선택 동의는 옛 판 그대로 지금 동의가 아니다');
  eq(fresh.length, 4, 'R04: 옛 줄은 지우지 않고 새 줄을 더한다');
}

console.log(`intake core selftest: ${passed} 통과`);
