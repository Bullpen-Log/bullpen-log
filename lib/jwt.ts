import { SignJWT, jwtVerify } from 'jose';

const encodedKey = new TextEncoder().encode(process.env.SESSION_SECRET);

export type SessionPayload = {
  userId: string;
  role: 'USER' | 'ADMIN';
  /**
   * 비밀번호 지문 — 표를 만들 때의 비밀번호(해시)에서 뽑은 짧은 값(lib/session.ts passwordFingerprint). 비밀번호를
   * 바꾸면 달라져서, 바꾸기 전에 다른 기기에서 받은 표는 더는 통하지 않는다(lib/dal.ts getCurrentUser). 예전에는 표에
   * 이것이 없어 비밀번호를 바꿔도 남의 컴퓨터에 남은 로그인이 30일 동안 살아 있었다. 이 칸이 생기기 전에 받은 표에는
   * 없다 — 그런 표는 기한까지 그대로 통한다(다 같이 한 번 로그아웃되지 않게).
   */
  pw?: string;
};

/** 읽은 표 — 담긴 값에 더해, 오래 가는 표(자동 로그인)인가 */
export type SessionInfo = SessionPayload & { persistent: boolean };

/**
 * 로그인 표를 만든다.
 *
 * 유효기간을 밖에서 받는다. '자동 로그인'을 켠 사람과 아닌 사람의 기간이
 * 다르기 때문이다(lib/session.ts).
 *
 * 쿠키에도 같은 기간을 적지만 진짜 기한은 이쪽이다. 쿠키 만료는 브라우저가
 * 지키는 약속이라 손대면 그만이고, 이쪽은 서명이 걸려 있어 못 늘린다.
 */
export async function encrypt(payload: SessionPayload, expiresIn: string) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(encodedKey);
}

export async function decrypt(token?: string): Promise<SessionInfo | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ['HS256'] });
    /* 자동 로그인 표는 30일, 아니면 하루(lib/session.ts) — 다시 만들 때 같은 쪽으로 만든다 */
    const lifetime =
      typeof payload.exp === 'number' && typeof payload.iat === 'number'
        ? payload.exp - payload.iat
        : 0;
    return {
      userId: payload.userId as string,
      role: payload.role as 'USER' | 'ADMIN',
      ...(typeof payload.pw === 'string' ? { pw: payload.pw } : {}),
      persistent: lifetime > 2 * 24 * 60 * 60,
    };
  } catch {
    return null;
  }
}
