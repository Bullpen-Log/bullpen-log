import { APP_API_HEADER, APP_API_LEVEL } from '@/lib/app-api';
import { deviceTimeZone } from '@/lib/time-zone';
import { BETA_LOCK_BODY, BETA_LOCK_TITLE, FEATURE_LOCKED_BETA } from '@/lib/release-access';
import { SITE_URL } from '~/lib/site';
import { BullpenNative } from '../../modules/bullpen-native';
import { createReadShare } from './read-share';
import { cacheEpoch } from './store';

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
  /* 끝의 undefined 인자는 잘라 보낸다 — JSON 은 undefined 를 null 로 바꿔 '안 넘김'이 '비움'이 됐다(촬영 메모가 지워지던 것) */
  while (args.length && args[args.length - 1] === undefined) args.pop();
  const body = JSON.stringify({ args });
  if (!isRead(action)) return call<T>(action, body, { 'content-type': 'application/json' });
  /*
   * 같은 읽기를 겹쳐 부르면 하나로 — 화면에 돌아올 때 · 탭이 보일 때 · 앱이 앞에 올 때 · 같은 값을 읽는 화면 여럿(암케어 목록 위의 재활 화면)이
   * 한꺼번에 같은 것을 불렀다(2026-10-26 2차 점검). 가는 중인 읽기가 떠난 뒤에 쓰기가 끝났으면 합치지 않고 새로 부른다(저장 직후 옛 값을 받지 않게).
   */
  /* 계정 세대를 열쇠에 — 로그아웃 뒤 다른 계정이 앞 계정의 가는 중인 읽기(앞 계정 쿠키로 보낸 것)에 합류하지 않게 */
  return reads.run(`${cacheEpoch()}|${action}${body}`, () => call<T>(action, body, { 'content-type': 'application/json' }));
}

/**
 * 폼 동작((prev, formData) 꼴 — auth.login · auth.changePassword …)을 부른다. 앞 인자는 기본 null(useActionState 의 지난 상태),
 * fields 는 웹 폼과 같은 칸 이름(app/api/rpc/[action]/route.ts 의 multipart · __args). 체크박스는 켰을 때만 'on' 으로 넣는다.
 * 폼 하나만 받는 동작(지우기 등 (formData) 꼴)은 lead 를 [] 로 — 늘 null 을 붙이면 null 이 폼 자리에 들어가 터졌다(2026-10-25 초대 코드).
 */
export function rpcForm<T>(action: string, fields: Record<string, string | null | undefined>, lead: unknown[] = [null]): Promise<T> {
  const form = new FormData();
  form.append('__args', JSON.stringify(lead));
  for (const [k, v] of Object.entries(fields)) if (v != null) form.append(k, v);
  /* content-type 은 비워 둔다 — fetch 가 경계(boundary)를 붙여 채운다 */
  return call<T>(action, form, {});
}

/*
 * 마지막으로 서버에 쓴 때 — 탭을 다시 볼 때 새로 받을지 정한다(shell/tab-pager useOnTabActive). 서버 동작 이름이 load · fetch · get 으로
 * 시작하면 읽기, 나머지는 쓰기로 본다(쓰기를 읽기로 잘못 보면 다른 탭이 30초까지 옛 값이라, 모르는 이름은 쓰기 쪽으로).
 */
let wroteAt = 0;
/*
 * 이름은 load · fetch · get 이 아니지만 읽기만 하는 것 — 쓰기로 세면 홈 종(알림 수)을 볼 때마다 판 넷이 '쓴 것 있음'으로 다시 받았다
 * (2026-10-24 전체 검토). 새 읽기 동작을 load… 로 짓지 못하면 여기에 더한다.
 */
const READ_ACTIONS = new Set([
  'notifications.countBellNotifications',
  'content.exerciseDescription',
  'content.guideDescription',
  'training-days.trainingMarkedDays',
  'auth.checkSignupEmail',
]);
export const lastWriteAt = () => wroteAt;
export const markWrite = () => {
  wroteAt = Date.now();
  reads.wrote();
};

/** 가는 중인 읽기(rpc) — 같은 동작 · 같은 인자 */
const reads = createReadShare();
const isRead = (action: string) => /\.(load|fetch|get)[A-Z]/.test(action) || READ_ACTIONS.has(action);

async function call<T>(action: string, payload: string | FormData, headers: Record<string, string>): Promise<T> {
  await syncSession();
  let res: Response;
  try {
    res = await fetch(`${SITE_URL}/api/rpc/${action}`, {
      method: 'POST',
      credentials: 'include',
      /* 기기 시간대 — 서버가 '오늘'을 이 기기 날짜로 센다(lib/time-zone.ts, 2026-10-28 김민 Q10) */
      headers: { ...headers, [APP_API_HEADER]: String(APP_API_LEVEL), 'x-bp-tz': deviceTimeZone() ?? '' },
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
  /* 출시 전 베타에 잠긴 기능(2026-10-29, lib/release-gate.ts) — 일반 오류와 갈라 다시 시도하지 않는다(대기열은 멈추고 남긴다) */
  if (res.status === 403 && body && !body.ok && body.error === FEATURE_LOCKED_BETA) throw new RpcError(`${BETA_LOCK_TITLE} ${BETA_LOCK_BODY}`, FEATURE_LOCKED_BETA);
  if (!body || !body.ok) throw new RpcError('서버에서 처리하지 못했어요.', body?.error ?? 'server');
  if ('redirect' in body) throw new RpcError('다시 로그인해 주세요.', 'redirect', body.redirect);
  if (!isRead(action)) markWrite();
  return body.result;
}
