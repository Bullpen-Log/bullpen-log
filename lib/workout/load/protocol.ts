/**
 * EX-LOAD01 — 세트 무게 기록의 주고받는 약속(프로토콜). 순수 — 서버 · 웹 · 앱이 같이 쓴다.
 *
 * - 새 웹 · 앱은 세트를 보낼 때 `loadProtocol: 1` 을 싣는다. 안 실은 요청은 옛 앱(대기열에 담겨 늦게 오는 것 포함)이다.
 * - 새 서버는 세트 쓰기 답마다 `loadAck` 를 붙인다. 구조화한 무게(밴드 · 섞임)를 보냈는데 답에 loadAck 가 없으면 옛 서버가
 *   그 칸을 모르고 버린 것이다 — 저장됐다고 보지 않고 대기열에 '확인 필요'로 남긴다.
 * - 고쳐야 다시 보낼 수 있는 거절(actionRequired)은 대기열이 지우지 않고 붙들어 둔다(사람이 고치거나 버린다).
 */

import { BAND_CATALOG_REVISION } from '@/lib/workout/load/band-catalog';
import { RESOLVER_VERSION } from '@/lib/workout/load/contract';

export const LOAD_PROTOCOL = 1;

export type LoadCapability = {
  protocol: number;
  resolver: number;
  catalog: string;
  /** 서버가 밴드 · 섞인 무게 · 복구 기록을 저장할 수 있는가(스키마 적용 뒤에만 true) */
  structured: boolean;
};

/**
 * 새 정규화로 **저장을 마친 뒤**에만 붙는 확인. 보낸 약속 · 해석기 · 카탈로그 판과 같아야 새 앱이 '저장됨'으로 본다.
 * 옛 쓰기를 그대로 둔 답(구조화 꺼짐 · 옛 앱)에는 붙지 않는다.
 */
export type LoadAck = { protocol: number; resolver: number; catalog: string; structured: boolean; persisted: true };

export function ackOf(structured: boolean): LoadAck {
  return { protocol: LOAD_PROTOCOL, resolver: RESOLVER_VERSION, catalog: BAND_CATALOG_REVISION, structured, persisted: true };
}

export function capabilityOf(structured: boolean): LoadCapability {
  return { protocol: LOAD_PROTOCOL, resolver: RESOLVER_VERSION, catalog: BAND_CATALOG_REVISION, structured };
}

/** 고쳐야 하는 거절의 종류 */
export type LoadErrorCode =
  /** 이 운동의 장비가 그 무게를 받지 않는다(맨몸 운동의 kg 등) */
  | 'LOAD_NOT_ALLOWED'
  /** 서버가 아직 그 기록(밴드 · 섞임)을 저장할 수 없다 — 업데이트 · 적용 뒤에 */
  | 'LOAD_UNSUPPORTED'
  /** 같은 세트에 서로 다른 무게 두 개 · 계약과 다른 뜻 */
  | 'LOAD_CONFLICT'
  /** 값이 잘못됐다(모르는 밴드 · 범위 밖) */
  | 'LOAD_INVALID'
  /** 무게를 꼭 적어야 하는 운동(바벨 · 덤벨) */
  | 'LOAD_REQUIRED'
  /** 이 서버가 모르는 약속 번호 · 해석기 · 카탈로그 판(앞으로 나올 앱 · 망가진 요청) — 지우지 말고 붙들어 둔다 */
  | 'LOAD_VERSION';

export type LoadRejection = { error: string; code: LoadErrorCode; actionRequired: true };

/** 대기열이 지우지 말고 붙들어야 하는 답인가 */
export function isActionRequired(result: unknown): result is LoadRejection {
  return (
    !!result &&
    typeof result === 'object' &&
    (result as { actionRequired?: unknown }).actionRequired === true &&
    typeof (result as { error?: unknown }).error === 'string'
  );
}

/** 구조화한 무게(밴드 · 섞임 · 서로 다른 무게 · 기구 이름)를 실은 요청인가 — 옛 서버가 조용히 버리면 안 되는 것 */
export function sendsStructuredLoad(p: { load?: unknown }): boolean {
  const l = p.load as { kind?: unknown } | null | undefined;
  return !!l && typeof l === 'object' && l.kind !== 'none';
}

/** 답에 이 앱과 같은 판의 저장 확인(loadAck)이 있는가 */
export function hasLoadAck(result: unknown): boolean {
  const a = (result as { loadAck?: Partial<LoadAck> } | null)?.loadAck;
  return !!a && a.persisted === true && a.protocol === LOAD_PROTOCOL && a.resolver === RESOLVER_VERSION && a.catalog === BAND_CATALOG_REVISION;
}

/**
 * 요청의 약속 번호 읽기 — **칸이 아예 없을 때만** 옛 앱이다. 있는데 이 서버가 아는 번호(1)가 아니면(앞으로 나올 2 · 글자 '1' · null)
 * 모르는 판으로 본다(거절하되 actionRequired — 새 앱 대기열이 지우지 않는다).
 */
export function protocolKind(hasField: boolean, value: unknown): 'legacy' | 'modern' | 'unknown' {
  if (!hasField || value === undefined) return 'legacy';
  return value === LOAD_PROTOCOL ? 'modern' : 'unknown';
}

/** 구조화 무게가 실제로 '저장소에 들어갔다'고 말하는 확인인가 — 판이 같고, 저장을 마쳤고, 구조화 저장을 할 수 있는 서버 */
export function hasStructuredAck(result: unknown): boolean {
  if (!hasLoadAck(result)) return false;
  return (result as { loadAck: LoadAck }).loadAck.structured === true;
}

/** 저장 성공 답의 모양인가 — { sets: [...] } (오류 칸 없음). 모양이 틀린 '성공'은 저장으로 보지 않는다 */
function wellFormedSuccess(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  if ('error' in (result as object)) return false;
  return Array.isArray((result as { sets?: unknown }).sets);
}

/**
 * 대기열이 보낸 답을 어떻게 다룰지 — 'saved'(빼도 됨) · 'held'(붙들어 둠, 사람에게 보임). 웹 · 앱 대기열이 같은 판단을 쓴다.
 * 빼는 것은 저장이 증명된 답뿐이다(GPT 서브1 점검 — 오류 답 · 저장 확인 없는 구조화 무게를 '저장'으로 보던 유실 두 건):
 *   - 오류 답({ error })은 무엇이든 붙든다(지우지 않는다 — 사람이 고치거나 버린다). 코드가 있으면 그 코드, 없으면 REJECTED.
 *   - 성공 답은 모양이 맞아야 한다({ sets: [] }). 틀린 모양 · 빈 답은 붙든다(MALFORMED).
 *   - 구조화 무게(밴드 · 섞임 · 서로 다른 무게 · 기구 이름)를 보냈으면, 같은 판의 저장 확인 **그리고 structured: true** 가 있어야 저장이다
 *     (structured: false 확인 · 확인 없음 · 다른 판 확인 → 붙든다). 무게 숫자만 보낸 세트는 꺼진 서버의 옛 칸 투영이 명시적으로 허락된
 *     길이라 확인이 없거나 structured: false 여도 저장이다 — 다만 확인이 있으면 판이 같아야 한다.
 */
export function outcomeOf(
  sent: { load?: unknown },
  result: unknown,
  /**
   * 이 줄을 담은 계정이 지금 로그인한 계정과 같다고 **아는가**. 모르거나(계정 표시가 없는 옛 줄) 다르면 '이 계정의 판이 아님' 답은
   * 다른 사람의 세트일 수 있다는 뜻으로 붙든다(계정 바꾸기).
   */
  ownerMatches = true
): { kind: 'saved' } | { kind: 'held'; code: string; message: string } {
  if (isActionRequired(result)) return { kind: 'held', code: result.code, message: result.error };
  if (result && typeof result === 'object' && typeof (result as { error?: unknown }).error === 'string') {
    const code = (result as { code?: unknown }).code;
    if (!ownerMatches && code === 'SESSION_UNAVAILABLE')
      return { kind: 'held', code: 'OWNER_UNKNOWN', message: '다른 계정에서 남긴 세트일 수 있어요. 그 계정으로 다시 로그인하면 보내요.' };
    return { kind: 'held', code: typeof code === 'string' ? code : 'REJECTED', message: (result as { error: string }).error };
  }
  if (!wellFormedSuccess(result)) return { kind: 'held', code: 'MALFORMED', message: '서버 답을 확인하지 못했어요. 다시 보내 주세요.' };
  const ack = (result as { loadAck?: unknown }).loadAck;
  if (sendsStructuredLoad(sent)) {
    if (!hasStructuredAck(result))
      return { kind: 'held', code: 'LOAD_UNSUPPORTED', message: '서버가 이 기록(밴드 · 서로 다른 무게 · 기구 이름)을 저장했다는 확인이 없어요. 업데이트한 뒤 다시 보내 주세요.' };
    return { kind: 'saved' };
  }
  if (ack !== undefined && !hasLoadAck(result)) return { kind: 'held', code: 'LOAD_VERSION', message: '다른 판의 서버 답이에요. 앱을 업데이트한 뒤 다시 보내 주세요.' };
  return { kind: 'saved' };
}
