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
    readonly code: string
  ) {
    super(message);
  }
}

let synced: Promise<unknown> | null = null;
const HOST = new URL(SITE_URL).hostname;

export async function rpc<T>(action: string, ...args: unknown[]): Promise<T> {
  synced ??= BullpenNative.sync(HOST).catch(() => 0);
  await synced;
  let res: Response;
  try {
    res = await fetch(`${SITE_URL}/api/rpc/${action}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', [APP_API_HEADER]: String(APP_API_LEVEL) },
      body: JSON.stringify({ args }),
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
  if ('redirect' in body) throw new RpcError('다시 로그인해 주세요.', 'redirect');
  return body.result;
}
