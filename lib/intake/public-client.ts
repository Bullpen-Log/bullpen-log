/**
 * 공개 화면이 서버를 부르는 길 — 브라우저에서만 쓴다. 토큰은 Authorization 머리로만 보내고, 저장하지 않는다.
 * 실패는 IntakeRequestError 하나로 온다. 코드는 lib/intake/errors.ts 의 것에 아래 넷을 더한 것이다.
 *   'network'   — 요청이 거절됐다(신호 끊김). 응답을 못 받았다.
 *   'timeout'   — 정한 시간 안에 응답(머리 + 본문)을 다 받지 못했다. 서버가 처리했는지는 모른다.
 *   'cancelled' — 부르는 쪽이 멈췄다(화면을 떠남 · 새 시도). 실패로 보이지 않는다.
 *   'internal'  — 응답은 왔는데 읽을 수 없다(2xx 라도 본문이 JSON 이 아니면 성공으로 치지 않는다).
 *
 * 시간 제한: 요청 하나마다 AbortController 하나가 fetch 와 본문 읽기(res.text → JSON.parse) 전체를 묶는다.
 * 머리만 오고 본문이 멈춰도 같은 시한에 끊긴다. 부르는 쪽의 signal 은 그 컨트롤러에 이어 붙이고, 끝나면 타이머 · 듣기를 늘 걷는다(finally).
 * 영상 바이트(TUS)에는 이 시한을 걸지 않는다 — 큰 파일 전송은 tus-js-client 의 재시도가 맡는다.
 */
import type { ConsentAnswer } from '@/lib/intake/consent';
import type { PublicStateResponse } from '@/lib/intake/public-api';
import type { DraftPatch, IntakeReceipt, PublicAsset, ReserveAssetInput, UploadGrant } from '@/lib/intake/service';
import type { IntakeView } from '@/lib/intake/state';

export type { PublicConsentDoc, PublicStateResponse } from '@/lib/intake/public-api';
export type { IntakeReceipt, PublicAsset, PublicIntakeState, UploadGrant } from '@/lib/intake/service';

export class IntakeRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: Record<string, unknown> | null;
  constructor(code: string, message: string, status = 0, detail: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'IntakeRequestError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export const NETWORK_TEXT = '연결이 끊겼어요. 신호를 확인한 뒤 다시 시도해 주세요.';
export const TIMEOUT_TEXT = '서버 응답이 늦어지고 있어요. 신호를 확인한 뒤 다시 시도해 주세요.';
export const CANCELLED_TEXT = '요청을 멈췄어요.';

/**
 * 상태 · 초안 · 동의 · 칸 잡기 · 토큰 · 업로드 주소 · 도착 확인의 시한. 모두 DB 몇 줄 + 저장소 한두 번이라 보통 1초 안이다.
 * 20초는 느린 모바일 망에서도 넉넉하고, 사람이 '멈췄다'고 느끼기 전에 다시 시도할 길을 보이는 값이다. 실측 뒤 조정한다.
 */
export const CONTROL_TIMEOUT_MS = 20_000;
/**
 * 완료(finalize)만 따로 길게 둔다 — 잠금 · 판 얼리기 · 원본 사실 확인을 한 트랜잭션에서 해서 다른 요청보다 무겁다.
 * 짧게 끊으면 서버는 얼렸는데 화면만 실패를 보는 일이 잦아진다. 끊겨도 같은 키로 다시 내면 같은 영수증이라 안전하지만, 그 왕복을 줄인다.
 */
export const FINALIZE_TIMEOUT_MS = 30_000;

export type RequestOptions = { signal?: AbortSignal };

export const cancelledError = () => new IntakeRequestError('cancelled', CANCELLED_TEXT);
export const isCancelled = (e: unknown): boolean => e instanceof IntakeRequestError && e.code === 'cancelled';

/**
 * 약속을 signal 과 겨룬다 — signal 이 먼저 멈추면 곧바로 make() 로 거절한다. 원래 약속이 끝내 안 끝나도 기다리지 않는다.
 * 원래 약속이 늦게 거절돼도 처리되지 않은 거절로 남지 않게 받아 둔다.
 */
export function raceSignal<T>(p: Promise<T>, signal: AbortSignal | undefined, make: () => Error = cancelledError): Promise<T> {
  if (!signal) return p;
  p.catch(() => {});
  if (signal.aborted) return Promise.reject(make());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(make());
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

export type BoundedResponse = { ok: boolean; status: number; data: unknown };

/**
 * 시한이 있는 요청 하나. fetch 와 본문 읽기를 같은 시한 · 같은 취소로 묶는다. 결과 화면도 이 길을 쓴다.
 * 던지는 것은 'cancelled' · 'timeout' · 'network' 셋뿐이다. 응답이 오면 상태 · 본문(못 읽으면 null)을 돌려준다.
 */
export async function requestJson(
  doFetch: typeof fetch,
  url: string,
  init: RequestInit,
  opts: { timeoutMs: number; signal?: AbortSignal; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout },
): Promise<BoundedResponse> {
  /* 이미 멈춘 요청은 보내지도 않는다 */
  if (opts.signal?.aborted) throw cancelledError();
  const setTimer = opts.setTimer ?? setTimeout;
  const clearTimer = opts.clearTimer ?? clearTimeout;
  const ctrl = new AbortController();
  let why: 'timeout' | 'cancelled' | null = null;
  const fail = () => (why === 'cancelled' ? cancelledError() : why === 'timeout' ? new IntakeRequestError('timeout', TIMEOUT_TEXT) : new IntakeRequestError('network', NETWORK_TEXT));
  const onCallerAbort = () => {
    why ??= 'cancelled';
    ctrl.abort();
  };
  opts.signal?.addEventListener('abort', onCallerAbort, { once: true });
  const timer = setTimer(() => {
    why ??= 'timeout';
    ctrl.abort();
  }, opts.timeoutMs);
  try {
    let res: Response;
    try {
      /* fetch 가 signal 을 안 따르더라도(가짜 · 옛 구현) 시한에는 끊는다 */
      res = await raceSignal(doFetch(url, { ...init, signal: ctrl.signal }), ctrl.signal, fail);
    } catch {
      throw fail();
    }
    let text: string;
    try {
      text = await raceSignal(res.text(), ctrl.signal, fail);
    } catch {
      /* 머리는 왔는데 본문이 끊김 · 멈춤 — 멈춘 본문은 닫아 둔다 */
      res.body?.cancel().catch(() => {});
      throw fail();
    }
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimer(timer);
    opts.signal?.removeEventListener('abort', onCallerAbort);
  }
}

/** 이름 · PIN 관문(R03) — 세션 원문은 HttpOnly 쿠키로만 오고 여기에는 없다 */
export type InviteeGateResponse = { enrolled: boolean; locked: boolean; session: boolean };
export type InviteeSessionResponse = { name: string; idleExpiresAt: string; expiresAt: string };
/** 세션이 없거나 끝나 이름 · PIN 을 다시 물어야 하는 답 */
export const SESSION_CODES: ReadonlySet<string> = new Set(['session_required', 'session_expired']);
export const isSessionError = (e: unknown): boolean => e instanceof IntakeRequestError && SESSION_CODES.has(e.code);

export type IntakeClient = {
  /** 이름 · PIN 을 정했는지 · 잠겼는지 · 이 기기에 살아 있는 세션이 있는지 — 세션 없이 묻는다 */
  gate(opts?: RequestOptions): Promise<InviteeGateResponse>;
  /** 처음 연 사람이 이름 · PIN(숫자 네 자리, 글자 그대로) 을 정한다. 이미 정한 링크면 'invitee_already_enrolled' */
  enroll(input: { name: string; pin: string; pinConfirm: string }, opts?: RequestOptions): Promise<InviteeSessionResponse>;
  /** 같은 이름 · PIN 으로 다시 들어간다 */
  unlock(input: { name: string; pin: string }, opts?: RequestOptions): Promise<InviteeSessionResponse>;
  /** 이 기기의 세션을 끝낸다 */
  endSession(opts?: RequestOptions): Promise<{ ended: boolean }>;
  state(opts?: RequestOptions): Promise<PublicStateResponse>;
  saveDraft(patch: DraftPatch, opts?: RequestOptions): Promise<{ version: number }>;
  recordConsents(answers: readonly ConsentAnswer[], opts?: RequestOptions): Promise<{ requiredOk: boolean }>;
  withdrawModelConsent(opts?: RequestOptions): Promise<unknown>;
  reserveAsset(input: ReserveAssetInput, opts?: RequestOptions): Promise<{ asset: PublicAsset; version: number; created: boolean }>;
  issueToken(assetId: string, opts?: RequestOptions): Promise<UploadGrant>;
  registerUploadUrl(assetId: string, uploadUrl: string, opts?: RequestOptions): Promise<{ transportExpiresAt: string }>;
  confirmUpload(assetId: string, opts?: RequestOptions): Promise<PublicAsset>;
  finalize(
    input: {
      expectedVersion: number;
      idempotencyKey: string;
      samePitchConfirmed?: boolean;
      consents?: readonly ConsentAnswer[];
      /** 화면이 보여 준 짝 — 칸이 다른 자산이면 서버가 'stale_selection' 으로 막는다 */
      expectedAssets?: Partial<Record<IntakeView, string>>;
    },
    opts?: RequestOptions,
  ): Promise<IntakeReceipt>;
};

/** 시험용 — 시한과 타이머를 바꿔 끼운다 */
export type IntakeClientOptions = {
  controlTimeoutMs?: number;
  finalizeTimeoutMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
};

const BASE = '/api/intake/public';

export function createIntakeClient(token: string, doFetch: typeof fetch = (...a) => fetch(...a), options: IntakeClientOptions = {}): IntakeClient {
  const control = options.controlTimeoutMs ?? CONTROL_TIMEOUT_MS;
  const finalizeMs = options.finalizeTimeoutMs ?? FINALIZE_TIMEOUT_MS;

  async function call<T>(path: string, body: unknown, timeoutMs: number, opts: RequestOptions = {}): Promise<T> {
    const r = await requestJson(
      doFetch,
      `${BASE}/${path}`,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Intake ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        /* 세션 쿠키(HttpOnly, Path=/api/intake/public) 는 같은 출처 요청에 저절로 실린다 — 분명히 적어 둔다 */
        credentials: 'same-origin',
        referrerPolicy: 'no-referrer',
      },
      { timeoutMs, signal: opts.signal, setTimer: options.setTimer, clearTimer: options.clearTimer },
    );
    const data = r.data as { error?: { code: string; message: string; detail: Record<string, unknown> | null } } | null;
    if (r.ok && data && typeof data === 'object' && !data.error) return data as T;
    const e = data && typeof data === 'object' ? data.error : undefined;
    throw new IntakeRequestError(e?.code ?? 'internal', e?.message ?? '잠시 뒤에 다시 시도해 주세요.', r.status, e?.detail ?? null);
  }

  return {
    gate: (o) => call('session', undefined, control, o),
    enroll: (input, o) => call('session/enroll', input, control, o),
    unlock: (input, o) => call('session/unlock', input, control, o),
    endSession: (o) => call('session/end', {}, control, o),
    state: (o) => call('state', undefined, control, o),
    saveDraft: (patch, o) => call('draft', patch, control, o),
    recordConsents: (answers, o) => call('consents', { answers }, control, o),
    withdrawModelConsent: (o) => call('consents/withdraw', { kind: 'model' }, control, o),
    reserveAsset: (input, o) => call('assets', input, control, o),
    issueToken: (assetId, o) => call('assets/token', { assetId }, control, o),
    registerUploadUrl: (assetId, uploadUrl, o) => call('assets/upload-url', { assetId, uploadUrl }, control, o),
    confirmUpload: (assetId, o) => call('assets/confirm', { assetId }, control, o),
    finalize: (input, o) => call('finalize', input, finalizeMs, o),
  };
}
