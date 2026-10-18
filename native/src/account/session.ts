import { rpc, rpcForm, RpcError } from '~/lib/rpc';
import { SITE_URL } from '~/lib/site';
import { BullpenNative } from '../../modules/bullpen-native';

/**
 * 계정 화면(로그인 · 가입 · 비밀번호 · 로그아웃 · 탈퇴)이 로그인 쿠키를 다루는 곳.
 *
 * 쿠키의 주인은 앱 저장소다 — 계정 동작은 모두 앱 fetch(/api/rpc)로 부르고, 서버의 Set-Cookie 는 앱 저장소(HTTPCookieStorage)에 바로
 * 들어간다. 그 뒤 웹뷰 저장소를 앱 저장소와 같게 맞춘다(BullpenNative.mirror — 앱에 없는 로그인은 웹뷰에서도 지운다). 다 맞춘 다음에
 * 웹을 옮겨야 웹이 새 로그인으로 그린다.
 */
const HOST = new URL(SITE_URL).hostname;

/** 웹뷰 로그인을 앱 저장소와 같게 — 서버가 쿠키를 바꾼 뒤 */
export const mirrorSession = () => BullpenNative.mirror(HOST).catch(() => 0);

/** 두 저장소의 로그인을 지운다 — 로그인 화면에 왔다 = 로그아웃 상태 */
export const clearSession = () => BullpenNative.clearSession(HOST).catch(() => undefined);

/**
 * 계정 동작의 답 — 서버가 다른 화면으로 보냈으면(로그인 · 가입 성공 '/today', 로그아웃 · 탈퇴 '/login') moved,
 * 폼 상태를 돌려줬으면(막힘 · 비밀번호 바꿈 성공) state, 못 닿았으면 error.
 */
export type AccountResult<S> = { moved: string } | { state: S } | { error: string };

async function settle<S>(run: () => Promise<S>): Promise<AccountResult<S>> {
  try {
    const state = await run();
    /* 비밀번호를 바꾸면 서버가 이 기기 로그인을 새로 내준다 — 막힌 답이어도 맞춰 두는 것은 해가 없다 */
    await mirrorSession();
    return { state };
  } catch (e) {
    if (e instanceof RpcError && e.code === 'redirect') {
      await mirrorSession();
      return { moved: e.to ?? '/today' };
    }
    if (e instanceof RpcError && e.code === 'offline') return { error: '신호가 약해 서버에 닿지 못했어요. 적은 것은 그대로 있어요.' };
    if (e instanceof RpcError && e.code === 'update') return { error: '앱을 업데이트해 주세요.' };
    return { error: '서버에서 처리하지 못했어요. 잠시 뒤 다시 해 주세요.' };
  }
}

/** 폼 동작(auth.login · auth.signup · auth.changePassword · auth.deleteAccount) */
export const accountForm = <S>(action: string, fields: Record<string, string | null | undefined>) =>
  settle(() => rpcForm<S>(action, fields));

/** 로그아웃 — 서버가 쿠키를 지우고 '/login' 으로 보낸다 */
export const logoutNow = () => settle(() => rpc<null>('auth.logout'));
