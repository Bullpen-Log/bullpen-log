import { NextResponse } from 'next/server';
import { APP_API_HEADER, MIN_APP_API, appApiLevelOf } from '@/lib/app-api';
import { RPC_MODULES } from '../registry';
import { runWithRequestCache } from '@/lib/request-cache';

/**
 * 아이폰 앱(native/, Expo)이 서버 액션을 부르는 입구 — POST /api/rpc/<파일>.<함수>(2026-10-17 엔지니어링 검토 D2).
 *
 * 앱은 서버 액션을 직접 못 부른다(Next 가 웹 화면에만 심는 통로라서). 화면마다 route 를 따로 만들면 액션을 고칠 때마다 route 도
 * 고쳐야 해 웹 · 앱이 어긋나기 쉬워, 이 하나가 허용 목록(registry.ts)의 액션을 이름으로 부른다. 로그인은 웹과 같은 'session'
 * 쿠키다 — 액션 안의 createSession · deleteSession 이 이 응답에 Set-Cookie 를 싣고, 앱(iOS 쿠키 저장소)과 앱 안 웹뷰가 같이 쓴다.
 *
 * 몸:
 *   - JSON `{ "args": [...] }` — 인자 그대로.
 *   - multipart/form-data — 폼 액션((prev, formData) 꼴). `__args` 칸에 앞 인자들의 JSON 배열(보통 `[null]`)을 넣으면
 *     그 뒤에 나머지 칸을 FormData 로 붙여 부른다. `__args` 가 없으면 FormData 하나만.
 * 답:
 *   - 200 `{ ok: true, result }` · redirect() 는 200 `{ ok: true, redirect: '/today' }` 로 바꾼다(앱이 그 화면으로 감).
 *   - 404 `{ ok: false, error: 'unknown-action' }` · notFound() 같은 것은 그 상태(404 · 403 · 401)로 `error: 'http'`.
 *   - 426 `{ ok: false, error: 'update', min }` — 앱 약속 번호가 낮다(lib/app-api.ts). 머리가 없어도 426(남의 사이트에서 쿠키로
 *     부르는 것도 이걸로 막힌다 — CSRF).
 *   - 400 몸이 깨짐 · 500 그 밖의 오류(로그에 남김).
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ action: string }> }
) {
  const level = appApiLevelOf(request.headers.get(APP_API_HEADER));
  if (level < MIN_APP_API)
    return NextResponse.json(
      { ok: false, error: 'update', min: MIN_APP_API },
      { status: 426 }
    );

  const { action } = await ctx.params;
  const fn = lookup(action);
  if (!fn)
    return NextResponse.json({ ok: false, error: 'unknown-action' }, { status: 404 });

  let args: unknown[];
  try {
    args = await readArgs(request);
  } catch {
    return NextResponse.json({ ok: false, error: 'bad-body' }, { status: 400 });
  }

  try {
    /*
     * 읽기(load…)는 한 요청 안에서 같은 읽기를 한 번만(lib/request-cache.ts — React cache 가 라우트 핸들러에서는 안 먹는다).
     * 쓰는 동작은 쓴 뒤 다시 읽을 수 있어 그대로 둔다(웹 서버 동작과 같은 뜻).
     */
    const run = () => fn(...args);
    const result = await (/\.load[A-Z]/.test(action) ? runWithRequestCache(run) : run());
    return NextResponse.json({ ok: true, result: result ?? null });
  } catch (e) {
    const digest =
      typeof (e as { digest?: unknown })?.digest === 'string'
        ? (e as { digest: string }).digest
        : '';
    // redirect(): 'NEXT_REDIRECT;<type>;<url>;<status>;'
    if (digest.startsWith('NEXT_REDIRECT;'))
      return NextResponse.json({ ok: true, redirect: digest.split(';')[2] });
    // notFound() · forbidden() · unauthorized(): 'NEXT_HTTP_ERROR_FALLBACK;<status>'
    if (digest.startsWith('NEXT_HTTP_ERROR_FALLBACK;')) {
      const status = Number(digest.split(';')[1]) || 404;
      return NextResponse.json({ ok: false, error: 'http', status }, { status });
    }
    console.error('[rpc]', action, e);
    return NextResponse.json({ ok: false, error: 'server' }, { status: 500 });
  }
}

/** '<파일>.<함수>' → 허용 목록의 함수(없으면 null). 모듈의 export 만 본다 — 프로토타입 이름(constructor 등)은 못 고른다. */
function lookup(action: string): ((...a: unknown[]) => Promise<unknown>) | null {
  const dot = action.lastIndexOf('.');
  if (dot <= 0) return null;
  const mod = RPC_MODULES[action.slice(0, dot)];
  const name = action.slice(dot + 1);
  if (!mod || !Object.hasOwn(mod, name)) return null;
  const fn = mod[name];
  return typeof fn === 'function'
    ? (fn as (...a: unknown[]) => Promise<unknown>)
    : null;
}

async function readArgs(request: Request): Promise<unknown[]> {
  const type = request.headers.get('content-type') ?? '';
  if (type.startsWith('multipart/form-data')) {
    const form = await request.formData();
    const head = form.get('__args');
    form.delete('__args');
    const lead = typeof head === 'string' ? JSON.parse(head) : [];
    if (!Array.isArray(lead)) throw new Error('bad __args');
    return [...lead, form];
  }
  const text = await request.text();
  if (!text) return [];
  const body = JSON.parse(text) as { args?: unknown };
  if (body.args === undefined) return [];
  if (!Array.isArray(body.args)) throw new Error('bad args');
  return body.args;
}
