import { changeSession, rpc, rpcForm, RpcError, sessionEpoch, syncSession } from '~/lib/rpc';
import { cacheClear } from '~/lib/store';
import { SITE_URL } from '~/lib/site';
import { BullpenNative } from '../../modules/bullpen-native';
import { unregisterPush } from '~/shell/push';

/**
 * 계정 화면(로그인 · 가입 · 비밀번호 · 로그아웃 · 탈퇴)이 로그인 쿠키를 다루는 곳.
 *
 * 쿠키의 주인은 앱 저장소다 — 계정 동작은 모두 앱 fetch(/api/rpc)로 부르고, 서버의 Set-Cookie 는 앱 저장소(HTTPCookieStorage)에 바로
 * 들어간다. 그 뒤 웹뷰 저장소를 앱 저장소와 같게 맞춘다(BullpenNative.mirror — 앱에 없는 로그인은 웹뷰에서도 지운다). 다 맞춘 다음에
 * 웹을 옮겨야 웹이 새 로그인으로 그린다.
 */
const HOST = new URL(SITE_URL).hostname;

/** 웹뷰 로그인을 앱 저장소와 같게 — 서버가 쿠키를 바꾼 뒤 */
export const mirrorSession = () => BullpenNative.mirror(HOST);

/** 두 저장소의 로그인을 지운다 — 로그인 화면에 왔다 = 로그아웃 상태 */
export const clearSession = () => changeSession(async () => {
  await syncSession();
  await BullpenNative.clearSession(HOST);
  await cacheClear();
});

/** Validate through the existing server contract; failures are not evidence of logout. */
export async function restoreAccount(): Promise<void> {
  const me = await rpc<{ ok: true } | { ok: false; error: string }>('app.loadAppMe');
  if (!me.ok) {
    if (me.error !== '로그인이 필요해요.') throw new Error('session validation unavailable');
    await clearSession();
  }
  // Only disposable caches. Per-owner drafts, files and outboxes remain untouched.
  await cacheClear();
}

/**
 * 계정 동작의 답 — 서버가 다른 화면으로 보냈으면(로그인 · 가입 성공 '/today', 로그아웃 · 탈퇴 '/login') moved,
 * 폼 상태를 돌려줬으면(막힘 · 비밀번호 바꿈 성공) state, 못 닿았으면 error.
 */
export type AccountResult<S> = { moved: string } | { state: S } | { error: string };

async function settle<S>(run: () => Promise<S>, epoch = sessionEpoch()): Promise<AccountResult<S>> {
  const current = () => {
    if (epoch !== sessionEpoch()) throw new RpcError('계정이 변경됐어요. 다시 열어 주세요.', 'session-changed');
  };
  try {
    current();
    let result: AccountResult<S>;
    try {
      result = { state: await run() };
    } catch (e) {
      if (!(e instanceof RpcError && e.code === 'redirect')) throw e;
      result = { moved: e.to ?? '/today' };
    }
    current();
    /* 비밀번호를 바꾸면 서버가 이 기기 로그인을 새로 내준다 — 막힌 답이어도 맞춰 두는 것은 해가 없다 */
    await mirrorSession();
    current();
    return result;
  } catch (e) {
    if (e instanceof RpcError && e.code === 'offline') return { error: '신호가 약해 서버에 닿지 못했어요. 적은 것은 그대로 있어요.' };
    if (e instanceof RpcError && e.code === 'update') return { error: '앱을 업데이트해 주세요.' };
    return { error: '서버에서 처리하지 못했어요. 잠시 뒤 다시 해 주세요.' };
  }
}

/** 폼 동작(auth.login · auth.signup · auth.changePassword · auth.deleteAccount) */
export const accountForm = <S>(action: string, fields: Record<string, string | null | undefined>) =>
  changeSession(async (version) => {
    await cacheClear();
    return settle(() => rpcForm<S>(action, fields), version);
  });

/** 로그아웃 — 서버가 쿠키를 지우고 '/login' 으로 보낸다 */
export const logoutNow = (): Promise<AccountResult<null>> => changeSession(async () => {
  /* 이 폰으로 앞사람 알림이 오지 않게 — 로그인이 살아 있을 때 먼저(native/src/shell/push.ts) */
  try {
    await unregisterPush();
    await settle(() => rpc<null>('auth.logout'));
  } finally {
    // Offline logout is still final on this device. Never retain a previous login.
    await BullpenNative.clearSession(HOST);
    await cacheClear();
  }
  return { moved: '/login' };
}).catch(() => ({ error: '로그인을 정리하지 못했어요. 다시 시도해 주세요.' }));
