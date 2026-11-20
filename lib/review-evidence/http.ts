/**
 * EX-REF04 — 검수 근거자료 API 의 요청 검사 · 응답 모양(순수, 'server-only' 없음 — 시험이 같이 쓴다).
 *
 * 쓰기 요청 순서(라우트가 이 순서대로 부른다): 로그인 · 대표관리자 확인 → 요청 출처 검사(이 파일) → 본문 크기 → 모양 → 저장소.
 * 요청 출처 검사(CSRF):
 *  - `x-review-evidence: 1` 머리 필수 — 다른 사이트의 폼 · 단순 요청은 이 머리를 붙일 수 없다(붙이려면 사전 확인 요청이 필요한데 허락하지 않는다).
 *  - `Content-Type: application/json` 만.
 *  - `Sec-Fetch-Site` 가 있으면 same-origin 또는 none(주소창 · 명령 도구)만.
 *  - `Origin` 이 있으면 이 서버의 호스트와 같아야 한다(명령 도구는 Origin 을 보내지 않는다).
 * 응답은 늘 저장 금지 · 형식 추측 금지. 오류에는 종류(code)와 짧은 한국어만 — 경로 · 값 · 내부 까닭은 담지 않는다.
 */

export const API_HEADER = 'x-review-evidence';

export const NO_STORE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
} as const;

export type ApiError =
  | 'unauthenticated'
  | 'forbidden'
  | 'bad_origin'
  | 'missing_header'
  | 'unsupported_type'
  | 'too_large'
  | 'bad_json'
  | 'invalid'
  | 'conflict'
  | 'pending'
  | 'unavailable';

export const API_ERROR_TEXT: Record<ApiError, string> = {
  unauthenticated: '로그인이 필요해요.',
  forbidden: '대표관리자만 쓸 수 있어요.',
  bad_origin: '다른 사이트에서 온 요청은 받지 않아요.',
  missing_header: '검수 근거자료 등록 도구에서 보낸 요청이 아니에요.',
  unsupported_type: 'JSON 본문만 받아요.',
  too_large: '본문이 너무 커요.',
  bad_json: 'JSON 모양이 맞지 않아요.',
  invalid: '넣은 값을 확인해 주세요.',
  conflict: '같은 요청 번호로 다른 내용이 이미 저장돼 있어요. 내용을 바꿨다면 새 요청 번호로 보내 주세요.',
  pending: '저장했는지 확인하지 못했어요. 같은 요청 번호로 다시 보내면 겹치지 않아요.',
  unavailable: '저장소에 잠시 닿지 못했어요. 같은 요청 번호로 다시 보내 주세요.',
};

const STATUS: Record<ApiError, number> = {
  unauthenticated: 401,
  forbidden: 403,
  bad_origin: 403,
  missing_header: 403,
  unsupported_type: 415,
  too_large: 413,
  bad_json: 400,
  invalid: 400,
  conflict: 409,
  pending: 503,
  unavailable: 503,
};

/**
 * 목록을 모으지 못한 까닭(store.ts LoadFailure) — 목록 · 거두기가 503 unavailable 에 reason 과 함께 이 글을 싣는다.
 * unsupported 는 다시 보내도 풀리지 않는 운영 준비 조건(저장소 목록 v2)이고, 나머지는 잠시 뒤 다시 하면 풀릴 수 있다.
 */
export type ListFailureReason = 'unavailable' | 'too_large' | 'unsupported' | 'inconsistent' | 'unexpected';

export const LIST_FAILURE_TEXT: Record<ListFailureReason, string> = {
  unavailable: '저장소에 잠시 닿지 못했어요. 조금 뒤 다시 해 주세요.',
  too_large: '기록이 한 번에 읽을 수 있는 한도를 넘었어요. 관리 담당에게 알려 주세요.',
  unsupported: '서버 저장소가 목록 v2(list-v2)를 지원하지 않아 목록을 모을 수 없어요. 관리 담당에게 알려 주세요.',
  inconsistent: '저장소 목록이 중간에 어긋나 전부 모았는지 확인하지 못했어요. 조금 뒤 다시 해 주세요.',
  unexpected: '저장소가 기록 자리 밖의 항목을 돌려줘 목록을 멈췄어요. 관리 담당에게 알려 주세요.',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_STORE_HEADERS });
}

export function errorResponse(code: ApiError, extra?: Record<string, unknown>): Response {
  return jsonResponse({ ok: false, error: code, message: API_ERROR_TEXT[code], ...(extra ?? {}) }, STATUS[code]);
}

/** 요청을 받은 이 서버의 호스트 — 앞단(Vercel)이 붙이는 x-forwarded-host 가 있으면 그것 */
function requestHost(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-host');
  const host = (fwd ? fwd.split(',')[0] : req.headers.get('host'))?.trim().toLowerCase();
  return host || null;
}

export function checkWriteRequest(req: Request, maxBytes: number): { ok: true } | { ok: false; error: ApiError } {
  if (req.headers.get(API_HEADER) !== '1') return { ok: false, error: 'missing_header' };
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return { ok: false, error: 'bad_origin' };
  const origin = req.headers.get('origin');
  if (origin !== null) {
    let oh: string | null = null;
    try {
      oh = origin === 'null' ? null : new URL(origin).host.toLowerCase();
    } catch {
      oh = null;
    }
    const host = requestHost(req);
    if (!oh || !host || oh !== host) return { ok: false, error: 'bad_origin' };
  }
  const type = (req.headers.get('content-type') ?? '').toLowerCase();
  if (!/^application\/json\s*(;|$)/.test(type)) return { ok: false, error: 'unsupported_type' };
  const len = req.headers.get('content-length');
  if (len !== null && (!/^\d+$/.test(len) || Number(len) > maxBytes)) return { ok: false, error: 'too_large' };
  return { ok: true };
}

/** 본문을 한도까지만 읽는다 — 넘으면 읽기를 멈추고 too_large */
export async function readBodyCapped(req: Request, maxBytes: number): Promise<{ ok: true; value: unknown } | { ok: false; error: 'too_large' | 'bad_json' }> {
  if (!req.body) return { ok: false, error: 'bad_json' };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, error: 'too_large' };
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    buf.set(c, at);
    at += c.byteLength;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return { ok: false, error: 'bad_json' };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'bad_json' };
  }
}
