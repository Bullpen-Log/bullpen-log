import { NextResponse } from 'next/server';
import { APP_API_HEADER, BETA_APP_API, MIN_APP_API, appApiLevelOf, minAppApiForAction } from '@/lib/app-api';
import { RPC_MODULES } from '../registry';
import { runWithRequestCache } from '@/lib/request-cache';
import { loadSessionUserUnchecked } from '@/lib/dal';
import { FEATURE_LOCKED_BETA, RELEASE_POLICY_VERSION, decideAccess, isBetaRestricted, type AccessDecision } from '@/lib/release-access';
import { gateDenied, isFeatureLocked, releaseStage, runInGate } from '@/lib/release-gate';
import { rpcAccessOf } from '@/lib/release-ops';

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
 *   - 403 `{ ok: false, error: 'FEATURE_LOCKED_BETA', capability, policyVersion }` — 출시 전 베타에 잠긴 기능(2026-10-29, lib/release-gate.ts).
 *     권한 없는 관리 업무는 `error: 'PERMISSION_DENIED'`. 앱은 이것을 다시 시도하지 않는다(정책이 바뀔 때까지).
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
  const actionMin = minAppApiForAction(action);
  if (level < actionMin)
    return NextResponse.json({ ok: false, error: 'update', min: actionMin }, { status: 426 });
  const fn = lookup(action);
  if (!fn)
    return NextResponse.json({ ok: false, error: 'unknown-action' }, { status: 404 });

  /*
   * 출시 전 베타(lib/release-gate.ts) — 베타 제한을 받는 사람이면 몸을 읽기 전에 표(lib/release-ops.ts)로 판정한다. 잠긴 동작은 부르지 않는다.
   * 베타를 모르는 옛 앱(BETA_APP_API 밑)은 잠긴 화면에서 일반 오류만 되풀이하므로 '업데이트해 주세요'(426)로 보낸다 — 앱을 다시 켜면 새 화면 코드를 받는다.
   * 지나가도 동작 안에서 사람을 읽을 때 한 번 더 판정한다(동작 맨 위의 allowFeature 가 없으면 막힘).
   */
  const stage = releaseStage();
  if (stage === 'restricted_beta') {
    const subject = await loadSessionUserUnchecked();
    if (subject && isBetaRestricted(subject, stage)) {
      if (level < BETA_APP_API)
        return NextResponse.json({ ok: false, error: 'update', min: BETA_APP_API }, { status: 426 });
      const op = rpcAccessOf(action);
      const d = decideAccess(subject, op.cap, { stage, perm: op.perm });
      if (!d.allowed) return locked(d);
    }
  }

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
    const run = () => runInGate('rpc', action, async () => {
      const result = await fn(...args);
      /* 동작이 막힘을 자기 try/catch 로 삼켜 { ok:false } 로 돌려줘도 입구는 막힘으로 답한다 — 앱이 일반 오류로 다시 시도하지 않게 */
      return { result, denied: gateDenied() };
    });
    const out = await (/\.load[A-Z]/.test(action) ? runWithRequestCache(run) : run());
    if (out.denied) return locked(out.denied);
    return NextResponse.json({ ok: true, result: out.result ?? null });
  } catch (e) {
    if (isFeatureLocked(e)) return locked(e.decision);
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

/** 베타 잠금 · 권한 없음 — 403, 기계용 코드와 정책 판 */
function locked(d: AccessDecision) {
  return NextResponse.json(
    {
      ok: false,
      error: d.reason === 'permission_denied' ? 'PERMISSION_DENIED' : FEATURE_LOCKED_BETA,
      capability: d.capability,
      policyVersion: RELEASE_POLICY_VERSION,
    },
    { status: 403 }
  );
}

/** '<파일>.<함수>' → 허용 목록의 함수(없으면 null). 모듈의 export 만 본다 — 프로토타입 이름(constructor 등)은 못 고른다. */
function lookup(action: string): ((...a: unknown[]) => Promise<unknown>) | null {
  const dot = action.lastIndexOf('.');
  if (dot <= 0) return null;
  const key = action.slice(0, dot);
  /* 모듈 이름도 허용 목록 자신의 것만 — 'constructor.assign' 처럼 Object 의 것을 고르지 못하게(2026-10-18 통합 점검) */
  const mod = Object.hasOwn(RPC_MODULES, key) ? RPC_MODULES[key] : undefined;
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
