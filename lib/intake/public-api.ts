/**
 * 공개 접수 API 의 몸통 — 라우트(app/api/intake/public/**)는 이 처리기를 그대로 내보내기만 한다.
 * db · 저장소를 밖에서 받으므로 시험이 PGlite 와 가짜 저장소로 같은 코드를 돌린다(`npm run intake:public-test`).
 *
 * 지키는 것:
 * - 토큰은 Authorization 머리로만 받는다. 주소 · 몸통 · 로그에 쓰지 않는다. 로그에는 오류 이름만 남긴다.
 * - 모든 응답은 저장 금지(no-store) · 색인 금지 · Referer 없음.
 * - 횟수 제한은 주소별 전체, 틀린 토큰, 전송 토큰 발급, 완료를 따로 센다.
 * - 초대는 관리자 세션이 아니다 — 여기서는 로그인 정보를 읽지 않는다.
 * - 결과 내용은 여기서 주지 않는다(공개 결과 경계는 따로 있다).
 *
 * 완료 라우트의 범위 op 가 'read' 인 까닭: 응답을 잃은 재시도는 기간이 지나도 영수증을 받아야 해서, 기간 판단은 finalizeSubmission 이 트랜잭션 안에서 한다.
 * 동의 라우트도 같다: 접수 뒤의 다시 동의는 올리기 기간과 상관없고, 초안의 기간 판단은 recordConsents 가 한다.
 */
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { openIntakeScope, type IntakeOp, type IntakeScope } from '@/lib/intake/access';
import { INTAKE_CONSENT_DOCS, type ConsentAnswer, type IntakeConsentDoc } from '@/lib/intake/consent';
import { IntakeError, isIntakeError } from '@/lib/intake/errors';
import { runVerifySoon } from '@/lib/intake/job-handlers';
import { clientAddress, enforceRateLimit, type RateScope } from '@/lib/intake/rate-limit';
import {
  confirmUpload,
  finalizeSubmission,
  issueUploadToken,
  loadPublicState,
  recordConsents,
  registerUploadUrl,
  reserveAsset,
  saveDraft,
  withdrawConsent,
  type DraftPatch,
  type ExpectedPair,
  type PublicIntakeState,
} from '@/lib/intake/service';
import { INTAKE_VIEWS, type IntakeView } from '@/lib/intake/state';
import type { IntakeStorage } from '@/lib/intake/storage-core';

export type PublicApiDeps = {
  db: PrismaClient;
  /** 저장소가 필요할 때만 만든다 — 설정이 없어도 상태 보기는 돈다 */
  storage: () => IntakeStorage;
  /** 응답 뒤에 할 일 — 앱은 next/server 의 after, 시험은 모아 두었다 돌린다 */
  schedule?: (task: () => Promise<unknown>) => void;
  now?: () => Date;
};

/** 화면이 동의 글을 그대로 보여 주고 판 · 해시를 되돌려 보내게 하는 사본 */
export type PublicConsentDoc = Pick<IntakeConsentDoc, 'kind' | 'version' | 'title' | 'required' | 'defaultGranted' | 'body' | 'textHash'>;
export type PublicStateResponse = { state: PublicIntakeState; consentDocs: PublicConsentDoc[] };

const MAX_BODY_BYTES = 32 * 1024;

/** 공개 응답의 공통 머리 */
export const PUBLIC_RESPONSE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Authorization',
};

function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...PUBLIC_RESPONSE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function replyError(e: unknown, label: string): Response {
  if (isIntakeError(e)) {
    const retry = typeof e.detail?.retryAfterSec === 'number' ? { 'Retry-After': String(e.detail.retryAfterSec) } : undefined;
    return reply(e.httpStatus, { error: { code: e.code, message: e.message, detail: e.detail ?? null } }, retry);
  }
  /* 요청 내용 · 머리를 찍지 않는다. 이름만 */
  console.error(`[intake public] ${label}: ${e instanceof Error ? e.name : 'unknown'}`);
  return reply(500, { error: { code: 'internal', message: '잠시 뒤에 다시 시도해 주세요.', detail: null } });
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) throw new IntakeError('invalid_input', { field: 'contentType' });
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw new IntakeError('invalid_input', { field: 'body' });
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new IntakeError('invalid_input', { field: 'body' });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new IntakeError('invalid_input', { field: 'body' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new IntakeError('invalid_input', { field: 'body' });
  return body as Record<string, unknown>;
}

const text = (v: unknown, field: string): string => {
  if (typeof v !== 'string') throw new IntakeError('invalid_input', { field });
  return v;
};
const whole = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new IntakeError('invalid_input', { field });
  return v;
};

function consentAnswers(v: unknown): ConsentAnswer[] {
  if (!Array.isArray(v) || v.length > INTAKE_CONSENT_DOCS.length) throw new IntakeError('invalid_input', { field: 'consent' });
  return v.map((a) => {
    if (!a || typeof a !== 'object') throw new IntakeError('invalid_input', { field: 'consent' });
    const r = a as Record<string, unknown>;
    return { kind: r.kind as ConsentAnswer['kind'], version: text(r.version, 'consent'), textHash: text(r.textHash, 'consent'), granted: r.granted === true };
  });
}

/** 화면이 보여 준 짝 — 없으면 undefined. 칸마다 글이어야 한다 */
function expectedPair(v: unknown): ExpectedPair | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) throw new IntakeError('invalid_input', { field: 'expectedAssets' });
  const r = v as Record<string, unknown>;
  const out: ExpectedPair = {};
  for (const view of INTAKE_VIEWS) if (r[view] !== undefined) out[view] = text(r[view], 'expectedAssets');
  return out;
}

/** startedAtMs: 요청을 받은 벽시계 시각(Date.now) — 응답 뒤 검증의 남은 시간을 여기서 센다. 업무 시각 now 와 따로다(시험은 now 를 옮긴다) */
type Ctx = { scope: IntakeScope; body: Record<string, unknown>; now: Date; startedAtMs: number };

export function createPublicApi(deps: PublicApiDeps) {
  const clock = deps.now ?? (() => new Date());
  const { db } = deps;

  /**
   * 응답 뒤 곧바로 한 번 검증을 돌린다. 못 돌면 크론이 이어 받으니 여기서는 실패해도 그만이다.
   * after() 는 라우트의 maxDuration 안에서만 돈다(요청을 받은 때부터 센다). 그래서 크론과 같은 예산 규칙(runVerifySoon)으로 —
   * 남은 시간(라우트 시간 − 여유 − 이미 쓴 시간) 안에 끝날 파일만 시작하고, 시각이 오면 해시를 끊어 시도 횟수를 돌려준다.
   * 라우트 시간은 lib/intake/limits.ts INTAKE_PUBLIC_ROUTE_MAX_DURATION_SEC 와 같아야 한다(intake:budget-test 가 견준다).
   */
  const verifySoon = (startedAtMs: number) => {
    deps.schedule?.(async () => {
      try {
        await runVerifySoon({ db, storage: deps.storage(), now: deps.now }, { startedAtMs, owner: `public-${randomUUID()}`, limit: 2 });
      } catch (e) {
        console.error(`[intake public] verify: ${e instanceof Error ? e.name : 'unknown'}`);
      }
    });
  };

  function route(
    label: string,
    opts: { op: IntakeOp; body?: boolean; limit?: RateScope },
    run: (ctx: Ctx) => Promise<unknown>,
  ) {
    return async (req: Request): Promise<Response> => {
      const startedAtMs = Date.now();
      const now = clock();
      try {
        const address = clientAddress(req.headers);
        await enforceRateLimit(db, { scope: 'public', subject: address, now });
        let scope: IntakeScope;
        try {
          scope = await openIntakeScope(db, req.headers.get('authorization'), opts.op, now);
        } catch (e) {
          if (isIntakeError(e) && e.code === 'invitation_invalid') await enforceRateLimit(db, { scope: 'invalid_token', subject: address, now });
          throw e;
        }
        if (opts.limit) await enforceRateLimit(db, { scope: opts.limit, subject: scope.invitationId, now });
        const body = opts.body === false ? {} : await readBody(req);
        return reply(200, await run({ scope, body, now, startedAtMs }));
      } catch (e) {
        return replyError(e, label);
      }
    };
  }

  return {
    /** 다시 찾아온 사람에게 보일 상태 — 읽기만 한다 */
    state: route('state', { op: 'read', body: false }, async ({ scope, now }): Promise<PublicStateResponse> => ({
      state: await loadPublicState(db, scope, { now }),
      consentDocs: INTAKE_CONSENT_DOCS.map(({ kind, version, title, required, defaultGranted, body, textHash }) => ({
        kind,
        version,
        title,
        required,
        defaultGranted,
        body,
        textHash,
      })),
    })),

    draft: route('draft', { op: 'edit', limit: 'draft' }, async ({ scope, body, now }) => {
      const patch: DraftPatch = { expectedVersion: whole(body.expectedVersion, 'expectedVersion') };
      if (body.athleteName !== undefined) patch.athleteName = text(body.athleteName, 'athleteName');
      if (body.athleteAgeBand !== undefined) patch.athleteAgeBand = text(body.athleteAgeBand, 'athleteAgeBand');
      if (body.throwingHand !== undefined) patch.throwingHand = body.throwingHand === null ? null : text(body.throwingHand, 'throwingHand');
      if (body.submitterRelation !== undefined) patch.submitterRelation = text(body.submitterRelation, 'submitterRelation');
      if (body.submitterName !== undefined) patch.submitterName = body.submitterName === null ? null : text(body.submitterName, 'submitterName');
      if (body.samePitchConfirmed !== undefined) patch.samePitchConfirmed = body.samePitchConfirmed === true;
      return saveDraft(db, scope, patch, now);
    }),

    consents: route('consents', { op: 'read', limit: 'consent' }, ({ scope, body, now }) =>
      recordConsents(db, scope, { answers: consentAnswers(body.answers) }, now),
    ),

    /** 받는 사람이 스스로 거둘 수 있는 것은 선택 동의뿐이다. 필수 동의 철회는 접수를 멈추는 일이라 담당자가 받는다(동의 글에 그렇게 적혀 있다) */
    withdraw: route('withdraw', { op: 'read', limit: 'withdraw' }, ({ scope, body, now }) => {
      if (body.kind !== 'model') throw new IntakeError('invalid_input', { field: 'kind' });
      return withdrawConsent(db, scope, { kind: 'model' }, now);
    }),

    reserve: route('reserve', { op: 'upload' }, ({ scope, body, now }) => {
      const expected = body.expectedAssetId;
      if (expected !== null && typeof expected !== 'string') throw new IntakeError('invalid_input', { field: 'expectedAssetId' });
      return reserveAsset(
        db,
        scope,
        {
          view: body.view as IntakeView,
          expectedAssetId: expected,
          fileName: text(body.fileName, 'fileName'),
          sizeBytes: whole(body.sizeBytes, 'sizeBytes'),
          declaredType: typeof body.declaredType === 'string' ? body.declaredType : null,
          sha256: text(body.sha256, 'sha256'),
          pairConfirmed: body.pairConfirmed === true,
        },
        now,
      );
    }),

    uploadToken: route('token', { op: 'upload', limit: 'upload_token' }, ({ scope, body, now }) =>
      issueUploadToken(db, deps.storage(), scope, { assetId: text(body.assetId, 'assetId') }, now),
    ),

    uploadUrl: route('upload-url', { op: 'upload' }, ({ scope, body, now }) =>
      registerUploadUrl(db, deps.storage(), scope, { assetId: text(body.assetId, 'assetId'), uploadUrl: text(body.uploadUrl, 'uploadUrl') }, now),
    ),

    confirm: route('confirm', { op: 'confirm' }, async ({ scope, body, now, startedAtMs }) => {
      const asset = await confirmUpload(db, deps.storage(), scope, { assetId: text(body.assetId, 'assetId') }, now);
      verifySoon(startedAtMs);
      return asset;
    }),

    finalize: route('finalize', { op: 'read', limit: 'finalize' }, async ({ scope, body, now, startedAtMs }) => {
      const receipt = await finalizeSubmission(
        db,
        scope,
        {
          expectedVersion: whole(body.expectedVersion, 'expectedVersion'),
          idempotencyKey: text(body.idempotencyKey, 'idempotencyKey'),
          samePitchConfirmed: body.samePitchConfirmed === true ? true : undefined,
          consents: body.consents === undefined ? undefined : consentAnswers(body.consents),
          expectedAssets: expectedPair(body.expectedAssets),
        },
        now,
      );
      verifySoon(startedAtMs);
      return receipt;
    }),
  };
}

export type PublicApi = ReturnType<typeof createPublicApi>;
