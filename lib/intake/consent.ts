/**
 * 외부 접수의 동의 문서 — 판이 있는 글이다. 동의 줄에는 판과 본문 해시를 같이 남겨, 나중에 '무엇에 동의했나'를 글자 그대로 되짚을 수 있다.
 *
 * - submission 제출 · 처리(필수) · overseas 분석 서버 국외 이전(필수) · model 모델 개발 이용(선택 · 기본 꺼짐).
 * - 국외 이전 글은 lib/analysis-consent.ts ANALYSIS_CONSENT 의 사실만 인용한다. 비어 있는 칸은 지어내지 않고 '확인 중'이라고 쓴다.
 * - 관리자 동의로 대신하지 않는다. 동의는 초대를 받은 사람이 보낸 요청으로만 남는다.
 * - 법정대리인 절차가 없으므로 만 14세 미만 선수의 접수는 막는다(부모가 대신 보내도 같다).
 * - ANALYSIS_CONSENT 가 확정 전이면 GPU 실행을 막는다. INTAKE_ALLOW_DRAFT_ANALYSIS=1 일 때만 관리자 확인 뒤 허용한다(analysisRunGate).
 *
 * 글을 고치면 version 을 올린다 — 해시가 바뀌므로 옛 판 동의는 '다시 동의'로 돌아간다. 글자 손질이어도 그렇다(본문 해시가 근거라서).
 */
import type { Prisma } from '@prisma/client';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { ANALYSIS_CONSENT, ANALYSIS_CONSENT_PENDING, analysisConsentReady } from '@/lib/analysis-consent';
import { INTAKE_CORRECTION_HOLD_DAYS, INTAKE_ORIGINAL_RETENTION_DAYS, INTAKE_WITHDRAWN_DRAFT_GRACE_DAYS } from '@/lib/intake/limits';

export const INTAKE_CONSENT_KINDS = ['submission', 'overseas', 'model'] as const;
export type IntakeConsentKind = (typeof INTAKE_CONSENT_KINDS)[number];
export const isConsentKind = (v: unknown): v is IntakeConsentKind => (INTAKE_CONSENT_KINDS as readonly unknown[]).includes(v);

export const AGE_BANDS = ['14_or_over', 'under_14'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];
export const isAgeBand = (v: unknown): v is AgeBand => (AGE_BANDS as readonly unknown[]).includes(v);

export const SUBMITTER_RELATIONS = ['self', 'parent', 'coach', 'other'] as const;
export type SubmitterRelation = (typeof SUBMITTER_RELATIONS)[number];
export const isSubmitterRelation = (v: unknown): v is SubmitterRelation => (SUBMITTER_RELATIONS as readonly unknown[]).includes(v);
export const SUBMITTER_RELATION_TEXT: Record<SubmitterRelation, string> = {
  self: '선수 본인',
  parent: '부모 · 보호자',
  coach: '코치',
  other: '그 밖의 대리인',
};
/** 선수 본인이 아닌 사람이 보내나 — 동의 칸의 글이 달라진다. 관계가 동의 줄에 같이 남는다(service.ts writeConsents) */
export const isProxyRelation = (relation: string | null | undefined) => relation != null && relation !== 'self';

/*
 * 대리 동의의 체크 글 · 안내. 사실만 말한다 — 대리 권한을 어떻게 볼지(누가 대신 동의할 수 있나)는 아직 사람이 정하지 않았다.
 * 문서 본문은 kind 마다 한 판이라 대리용 글을 따로 해시하지 못한다. 그래서 본문에 대리 줄을 넣고, 체크 글은 화면이 관계를 보고 바꾼다.
 */
export const consentCheckLabel = (proxy: boolean) => (proxy ? '선수를 대신해 내용을 읽었고 동의해요' : '내용을 읽었고 동의해요');
export const modelCheckLabel = (proxy: boolean) => (proxy ? '선수를 대신해 모델 개발에 쓰는 것에 동의해요' : '모델 개발에 쓰는 것에 동의해요');
export const PROXY_CONSENT_NOTE = '선수를 대신해 보내고 있어요. 아래 동의는 보내는 분이 대신한 것으로, 선수와의 관계와 함께 기록돼요.';

export type IntakeConsentDoc = {
  kind: IntakeConsentKind;
  version: string;
  title: string;
  required: boolean;
  /** 기본값 — 선택 동의는 늘 꺼져 있다 */
  defaultGranted: boolean;
  body: string;
  /** 본문 SHA-256 — 화면이 보여 준 글과 서버의 글이 같은지 견준다 */
  textHash: string;
};

const PENDING = '확인 중이에요';
const pendingHas = (word: string) => ANALYSIS_CONSENT_PENDING.some((p) => p.includes(word));

const submissionBody = [
  '보내는 것: 옆 · 뒤 투구 영상 원본 2개, 선수 이름, 선수 나이대(만 14세 이상인지), 보내는 사람이 선수 본인인지 대리인인지와 그 관계, 영상 파일 이름이에요. 적었을 때는 던지는 손과 보내는 분 이름도 남겨요.',
  '영상은 줄이거나 고치지 않고 원본 그대로 보내요. 원본 안에 든 촬영 시각, 기기, 위치 같은 정보도 함께 가요.',
  '쓰는 곳: 접수 확인, 영상 파일 검증, 투구 3D 분석 준비와 결과 전달이에요.',
  `보는 사람: 불펜로그의 접수 담당 관리자가 봐요. 분석 서버로 가는 내용은 '${ANALYSIS_CONSENT.title}' 글에 따로 적었어요.`,
  '영상에는 얼굴과 체형이 담길 수 있어요.',
  `원본 보유 기간: 공개한 날, 공개하지 않은 접수는 접수한 날, 철회한 접수는 철회한 날부터 ${INTAKE_ORIGINAL_RETENTION_DAYS}일 뒤 원본을 지워요. 모델 개발에 동의해도 같아요.`,
  '공개한 적이 있는 접수는 철회해도 공개한 날부터 세요. 고쳐서 다시 내거나 다시 공개하면 그날부터 다시 세요.',
  `고쳐 달라는 요청이 열려 있으면 고칠 수 있는 동안 기다렸다가 지워요. 기다려도 지울 날에서 ${INTAKE_CORRECTION_HOLD_DAYS}일을 넘기지 않아요.`,
  `철회한 접수에서 접수를 끝내지 못한 파일은 철회한 날부터 ${INTAKE_WITHDRAWN_DRAFT_GRACE_DAYS}일 뒤 지워요.`,
  '원본을 지울 때 분석 서버가 만든 미리보기 영상도 같이 지워요.',
  `분석 결과의 보유 기간: ${PENDING}.`,
  '철회: 링크를 보내 준 담당자에게 알려 주시면 처리해요.',
  '대신 보내는 경우: 보내는 분과 선수의 관계가 이 동의와 함께 기록돼요.',
  '거부: 동의하지 않을 수 있어요. 동의하지 않으면 영상을 접수할 수 없어요.',
].join('\n');

const overseasBody = [
  `받는 곳: ${ANALYSIS_CONSENT.recipient}`,
  `받는 곳 연락처: ${ANALYSIS_CONSENT.contact ?? PENDING}`,
  `처리 나라: ${ANALYSIS_CONSENT.country}${pendingHas('처리 나라') ? `(${PENDING})` : ''}`,
  `보내는 것: ${ANALYSIS_CONSENT.items}`,
  '영상은 원본 그대로라 그 안에 든 촬영 시각, 기기, 위치 같은 정보도 함께 가요.',
  `보내는 때: ${ANALYSIS_CONSENT.when}`,
  `목적: ${ANALYSIS_CONSENT.purpose}`,
  `받는 곳의 보유 기간: ${ANALYSIS_CONSENT.retention ?? PENDING}`,
  '동의하지 않으면 영상을 접수할 수 없어요.',
].join('\n');

const modelBody = [
  '접수한 영상과 분석 결과를 투구 분석 모델을 만들고 고치는 데 써도 되는지 묻는 선택 항목이에요.',
  '동의하지 않아도 접수와 분석은 그대로 진행돼요.',
  '언제든 철회할 수 있어요.',
  '필수 동의를 철회해도 이 동의는 함께 철회되지 않아요. 이 동의는 따로 철회할 수 있어요.',
  '링크가 닫힌 뒤에는 링크를 보내 준 담당자에게 알려 주시면 처리해요.',
  '이 동의를 해도 원본은 같은 보유 기간에 맞춰 지워요. 지운 뒤에는 원본을 모델 작업에 쓰지 않아요.',
].join('\n');

const hashText = (text: string) => bytesToHex(sha256(utf8ToBytes(text)));

const doc = (d: Omit<IntakeConsentDoc, 'textHash'>): IntakeConsentDoc => ({ ...d, textHash: hashText(d.body) });

/** 지금 판의 문서 셋 — 차례대로 보인다. 국외 이전 판에는 기대는 ANALYSIS_CONSENT 판을 같이 적는다 */
export const INTAKE_CONSENT_DOCS: readonly IntakeConsentDoc[] = [
  doc({ kind: 'submission', version: 'intake-submission-2026-11-06.3', title: '영상 제출과 처리', required: true, defaultGranted: false, body: submissionBody }),
  doc({
    kind: 'overseas',
    version: `intake-overseas-2026-11-06.2+${ANALYSIS_CONSENT.version}`,
    title: ANALYSIS_CONSENT.title,
    required: true,
    defaultGranted: false,
    body: overseasBody,
  }),
  doc({ kind: 'model', version: 'intake-model-2026-11-06.2', title: '모델 개발 이용(선택)', required: false, defaultGranted: false, body: modelBody }),
];

export const consentDocOf = (kind: IntakeConsentKind) => INTAKE_CONSENT_DOCS.find((d) => d.kind === kind)!;
export const REQUIRED_CONSENT_KINDS = INTAKE_CONSENT_DOCS.filter((d) => d.required).map((d) => d.kind);

/** 화면이 보내는 동의 한 줄 */
export type ConsentAnswer = { kind: IntakeConsentKind; version: string; textHash: string; granted: boolean };

export type ConsentRow = {
  kind: string;
  docVersion: string;
  textHash: string;
  granted: boolean;
  agreedAt: Date;
  withdrawnAt: Date | null;
  /** 누구의 자격으로 답했나 — 시험의 짧은 줄에는 없을 수 있다 */
  relation?: string;
};

export type StoredConsentRow = ConsentRow & { id: string; relation: string; proxy: boolean };

/**
 * 줄들 → 종류별 가장 최근 답. 철회한 줄은 없는 것으로 본다.
 * relation 을 주면 지금 '보내는 사람'의 답을 찾는다 — 다른 관계로 낸 동의가 그 답을 가리지 않게. 고침을 거둬 관계가 돌아갔을 때 앞서 낸 동의가 살아 있어야 한다.
 * 다른 관계로 낸 거부는 그대로 이긴다. 선택 동의를 마지막에 거부한 사람의 뜻을 옛 동의가 되살리면 안 된다.
 */
export function latestConsents(rows: readonly ConsentRow[], relation?: string): Map<string, ConsentRow> {
  const out = new Map<string, ConsentRow>();
  for (const r of [...rows].sort((a, b) => a.agreedAt.getTime() - b.agreedAt.getTime())) {
    if (r.withdrawnAt) out.delete(r.kind);
    else if (relation === undefined || r.relation === relation) out.set(r.kind, r);
    else if (!r.granted) out.delete(r.kind);
  }
  return out;
}

/**
 * 판단에 드는 줄만 읽는다 — 종류 · 관계 · 답 · 철회 여부마다 가장 새 줄이다. 그 묶음의 앞선 줄은 latestConsents 의 답을 못 바꿔서, 답을 뒤집어 쌓은 줄 수와 상관없이 몇십 줄이다.
 * 옛날 것부터 돌려준다. 시각이 같으면 먼저 쓴 줄이 앞이다.
 */
export function consentDecisionRows(db: Pick<Prisma.TransactionClient, '$queryRaw'>, submissionId: string): Promise<StoredConsentRow[]> {
  return db.$queryRaw<StoredConsentRow[]>`
    SELECT * FROM (
      SELECT DISTINCT ON ("kind", "relation", "granted", ("withdrawnAt" IS NULL))
        "id", "kind", "docVersion", "textHash", "granted", "proxy", "relation", "agreedAt", "withdrawnAt", "createdAt"
      FROM "IntakeConsent"
      WHERE "submissionId" = ${submissionId}
      ORDER BY "kind", "relation", "granted", ("withdrawnAt" IS NULL), "agreedAt" DESC, "createdAt" DESC
    ) d
    ORDER BY "agreedAt" ASC, "createdAt" ASC`;
}

/**
 * 이 동의가 지금 판의 글에 대한 것인가. relation 을 주면 지금 '보내는 사람'이 한 답인지도 본다 —
 * 본인으로 답한 뒤 관계를 부모 · 코치로 고치면 그 줄은 대리인의 동의가 아니라서 다시 받는다.
 */
export const consentIsCurrent = (row: ConsentRow | undefined, d: IntakeConsentDoc, relation?: string) =>
  row != null && row.granted && row.docVersion === d.version && row.textHash === d.textHash && (relation === undefined || row.relation === relation);

/** 필수 동의가 지금 판으로 다 있나 — relation 은 위와 같다 */
export function hasRequiredConsents(rows: readonly ConsentRow[], relation?: string): boolean {
  const latest = latestConsents(rows, relation);
  return INTAKE_CONSENT_DOCS.filter((d) => d.required).every((d) => consentIsCurrent(latest.get(d.kind), d, relation));
}

/** 모델 개발 이용에 동의했나 — 지금 답 그대로(판이 바뀌었으면 다시 물어야 해서 false) */
export function modelUseAllowed(rows: readonly ConsentRow[], relation?: string): boolean {
  return consentIsCurrent(latestConsents(rows, relation).get('model'), consentDocOf('model'), relation);
}

type DocStamp = { kind: string; version: string; textHash: string };

/** 판이나 본문이 바뀐 문서의 종류 — 처음 받는 때(prev 없음)는 바뀐 것이 없다 */
export function changedConsentKinds(prev: readonly DocStamp[] | null, next: readonly DocStamp[]): string[] {
  if (!prev) return [];
  return next
    .filter((d) => {
      const was = prev.find((p) => p.kind === d.kind);
      return !was || was.version !== d.version || was.textHash !== d.textHash;
    })
    .map((d) => d.kind);
}

/** 화면이 쥔 체크 → 새 문서를 받은 뒤의 체크. 바뀐 종류는 비운다 — 옛 글에 누른 체크가 새 글의 동의로 남으면 안 된다 */
export function agreedAfterDocs(agreed: Record<string, boolean>, prev: readonly DocStamp[] | null, next: readonly DocStamp[]): Record<string, boolean> {
  const changed = changedConsentKinds(prev, next);
  if (changed.length === 0) return agreed;
  const out = { ...agreed };
  for (const kind of changed) delete out[kind];
  return out;
}

/** 만 14세 미만 막기 — 막으면 글, 아니면 null */
export const ageBandBlocked = (band: string | null | undefined) => band === 'under_14';

/**
 * GPU 를 돌려도 되나. ANALYSIS_CONSENT 가 확정이면 그대로 가고, 확정 전이면 막는다.
 * INTAKE_ALLOW_DRAFT_ANALYSIS=1 이면 관리자가 '확정 전임을 알고 돌린다'를 확인해야 간다(화면이 confirmDraft 를 넘긴다).
 */
export function analysisRunGate(
  confirmDraft: boolean,
  env: Record<string, string | undefined> = process.env,
): { ok: true; draft: boolean } | { ok: false; reason: 'consent_doc_draft' | 'needs_confirm' } {
  if (analysisConsentReady()) return { ok: true, draft: false };
  if (env.INTAKE_ALLOW_DRAFT_ANALYSIS !== '1') return { ok: false, reason: 'consent_doc_draft' };
  return confirmDraft ? { ok: true, draft: true } : { ok: false, reason: 'needs_confirm' };
}
