import { APP_API_HEADER, APP_API_LEVEL } from '@/lib/app-api';
import { SITE_URL } from '~/lib/site';
import { BullpenNative } from '../../modules/bullpen-native';

/**
 * 사이트 서버 동작 부르기 — POST /api/rpc/<파일>.<함수>(app/api/rpc/[action]/route.ts). 로그인은 웹뷰의 'session' 쿠키를 앱 저장소로
 * 옮겨(BullpenNative.sync — 처음 한 번) 그대로 실어 보낸다. 판 확인 장치(x-bullpen-app)가 426 이면 앱을 업데이트하라고 알린다.
 */
export class RpcError extends Error {
  constructor(
    message: string,
    readonly code: string,
    /** code 'redirect' 일 때 서버가 보내려던 주소(예: 운동을 마치면 '/workout/done?id=…') */
    readonly to?: string
  ) {
    super(message);
  }
}

let synced: Promise<unknown> | null = null;
const HOST = new URL(SITE_URL).hostname;

/** 웹뷰의 로그인 쿠키를 앱 요청 저장소로(처음 한 번) — rpc 말고 사이트 API(/api/…)를 부를 때도 먼저 */
export function syncSession(): Promise<unknown> {
  synced ??= BullpenNative.sync(HOST).catch(() => 0);
  return synced;
}

export function rpc<T>(action: string, ...args: unknown[]): Promise<T> {
  return call<T>(action, JSON.stringify({ args }), { 'content-type': 'application/json' });
}

/**
 * 폼 동작((prev, formData) 꼴 — auth.login · auth.changePassword …)을 부른다. 앞 인자는 늘 null(useActionState 의 지난 상태),
 * fields 는 웹 폼과 같은 칸 이름(app/api/rpc/[action]/route.ts 의 multipart · __args). 체크박스는 켰을 때만 'on' 으로 넣는다.
 */
export function rpcForm<T>(action: string, fields: Record<string, string | null | undefined>): Promise<T> {
  const form = new FormData();
  form.append('__args', '[null]');
  for (const [k, v] of Object.entries(fields)) if (v != null) form.append(k, v);
  /* content-type 은 비워 둔다 — fetch 가 경계(boundary)를 붙여 채운다 */
  return call<T>(action, form, {});
}

async function call<T>(action: string, payload: string | FormData, headers: Record<string, string>): Promise<T> {
  await syncSession();
  let res: Response;
  try {
    res = await fetch(`${SITE_URL}/api/rpc/${action}`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...headers, [APP_API_HEADER]: String(APP_API_LEVEL) },
      body: payload,
    });
  } catch {
    throw new RpcError('신호가 약해 서버에 닿지 못했어요.', 'offline');
  }
  const body = (await res.json().catch(() => null)) as
    | { ok: true; result: T }
    | { ok: true; redirect: string }
    | { ok: false; error: string }
    | null;
  if (res.status === 426) throw new RpcError('앱을 업데이트해 주세요.', 'update');
  if (!body || !body.ok) throw new RpcError('서버에서 처리하지 못했어요.', body?.error ?? 'server');
  if ('redirect' in body) throw new RpcError('다시 로그인해 주세요.', 'redirect', body.redirect);
  return body.result;
}
