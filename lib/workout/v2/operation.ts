import { createHash } from 'node:crypto';

/**
 * EX-RX01 R2A — 운동 판 v2 명령의 작업 번호(operation ID)와 내용 지문.
 *
 * - 새 클라이언트는 같은 뜻을 다시 보낼 때 같은 번호를 쓴다(응답을 잃은 재시도). 일부러 다시 고친 것은 새 번호다.
 * - 같은 번호에 다른 내용이 오면 거절한다(지문이 다르다). 시각으로 번호를 만들지 않는다.
 * - 지문은 키를 정렬한 JSON 의 sha256 — 객체 키 순서가 달라도 같은 뜻이면 같은 지문.
 */

/** 받는 작업 번호의 꼴 — UUID · ULID · nanoid 가 다 들어오게 넉넉히, 그러나 SQL · 로그에 위험한 글자는 없게 */
const OPERATION_ID = /^[A-Za-z0-9_-]{16,80}$/;

export function validOperationId(v: unknown): v is string {
  return typeof v === 'string' && OPERATION_ID.test(v);
}

/** 키를 정렬한 JSON — undefined 칸은 빼고, 배열 차례는 그대로(차례가 뜻이다) */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
  return v;
}

/** 명령 종류 + 내용의 지문 — 영수증에 남겨 같은 번호의 재전송이 같은 내용인지 본다 */
export function payloadHash(commandType: string, payload: unknown): string {
  return createHash('sha256').update(commandType).update('\u0000').update(canonicalJson(payload)).digest('hex');
}

/** 결과 코드(설계 13C). 앞의 셋만 '받았다'(서버가 가졌다)는 뜻이다 */
export type OutcomeCode = 'APPLIED' | 'NO_CHANGE' | 'DEFERRED' | 'CONFLICT' | 'RETRYABLE' | 'INVALID' | 'NOT_FOUND' | 'ENDED' | 'DISABLED';

export const DURABLE_OUTCOMES: ReadonlySet<OutcomeCode> = new Set(['APPLIED', 'NO_CHANGE', 'DEFERRED']);
