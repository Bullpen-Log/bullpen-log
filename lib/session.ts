import 'server-only';
import { cookies } from 'next/headers';
import { encrypt, decrypt, type SessionPayload } from '@/lib/jwt';

const SESSION_COOKIE = 'session';

/**
 * 로그인이 얼마나 가는가.
 *
 * '자동 로그인'을 켜면 30일이다. 매일 쓰는 앱이고 대개 자기 폰에서 쓰므로,
 * 한 달에 한 번 다시 로그인하는 정도면 성가시지 않다.
 *
 * 끄면 기한을 아예 적지 않는다. 그러면 브라우저를 닫는 순간 쿠키가 사라진다 —
 * 남의 컴퓨터나 공용 PC 에서 쓰고 나올 때 기대하는 동작이다. 다만 브라우저를
 * 계속 켜 두는 사람도 있으므로 표 자체에는 하루라는 기한을 박아 둔다.
 * 쿠키는 브라우저가 지키는 약속이지만 표의 기한은 서버가 확인한다.
 */
const PERSISTENT_DAYS = 30;
const SESSION_ONLY_TOKEN_AGE = '1d';

/**
 * 로그인 표를 만들어 쿠키에 담는다.
 *
 * @param persist '자동 로그인'을 켰는가. 가입 직후처럼 따로 묻지 않은 자리는
 *                켠 것으로 본다 — 방금 계정을 만든 사람을 브라우저 닫았다고
 *                내보낼 이유가 없다.
 */
export async function createSession(payload: SessionPayload, persist = true) {
  const token = await encrypt(payload, persist ? `${PERSISTENT_DAYS}d` : SESSION_ONLY_TOKEN_AGE);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    /*
     * expires 를 안 주면 '세션 쿠키'가 되어 브라우저를 닫을 때 사라진다.
     * undefined 를 넘기는 것과 아예 안 적는 것이 같으므로 이렇게 쓴다.
     */
    ...(persist
      ? { expires: new Date(Date.now() + PERSISTENT_DAYS * 24 * 60 * 60 * 1000) }
      : {}),
    sameSite: 'lax',
    path: '/',
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return decrypt(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
