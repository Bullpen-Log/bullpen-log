/**
 * 공개 화면이 서버를 부르는 길 — 브라우저에서만 쓴다. 토큰은 Authorization 머리로만 보내고, 저장하지 않는다.
 * 실패는 IntakeRequestError 하나로 온다. 코드는 lib/intake/errors.ts 의 것에 'network'(응답을 못 받음) · 'internal' 을 더한 것이다.
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

export type IntakeClient = {
  state(): Promise<PublicStateResponse>;
  saveDraft(patch: DraftPatch): Promise<{ version: number }>;
  recordConsents(answers: readonly ConsentAnswer[]): Promise<{ requiredOk: boolean }>;
  withdrawModelConsent(): Promise<unknown>;
  reserveAsset(input: ReserveAssetInput): Promise<{ asset: PublicAsset; version: number; created: boolean }>;
  issueToken(assetId: string): Promise<UploadGrant>;
  registerUploadUrl(assetId: string, uploadUrl: string): Promise<{ transportExpiresAt: string }>;
  confirmUpload(assetId: string): Promise<PublicAsset>;
  finalize(input: {
    expectedVersion: number;
    idempotencyKey: string;
    samePitchConfirmed?: boolean;
    consents?: readonly ConsentAnswer[];
    /** 화면이 보여 준 짝 — 칸이 다른 자산이면 서버가 'stale_selection' 으로 막는다 */
    expectedAssets?: Partial<Record<IntakeView, string>>;
  }): Promise<IntakeReceipt>;
};

const BASE = '/api/intake/public';

export function createIntakeClient(token: string, doFetch: typeof fetch = (...a) => fetch(...a)): IntakeClient {
  async function call<T>(path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${BASE}/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Intake ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      throw new IntakeRequestError('network', NETWORK_TEXT);
    }
    const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string; detail: Record<string, unknown> | null } } | null;
    if (res.ok && data && !data.error) return data as T;
    const e = data?.error;
    throw new IntakeRequestError(e?.code ?? 'internal', e?.message ?? '잠시 뒤에 다시 시도해 주세요.', res.status, e?.detail ?? null);
  }

  return {
    state: () => call('state'),
    saveDraft: (patch) => call('draft', patch),
    recordConsents: (answers) => call('consents', { answers }),
    withdrawModelConsent: () => call('consents/withdraw', { kind: 'model' }),
    reserveAsset: (input) => call('assets', input),
    issueToken: (assetId) => call('assets/token', { assetId }),
    registerUploadUrl: (assetId, uploadUrl) => call('assets/upload-url', { assetId, uploadUrl }),
    confirmUpload: (assetId) => call('assets/confirm', { assetId }),
    finalize: (input) => call('finalize', input),
  };
}
