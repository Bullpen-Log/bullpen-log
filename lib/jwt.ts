import { SignJWT, jwtVerify } from 'jose';

const encodedKey = new TextEncoder().encode(process.env.SESSION_SECRET);

export type SessionPayload = {
  userId: string;
  role: 'USER' | 'ADMIN';
};

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

export async function decrypt(token?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ['HS256'] });
    return { userId: payload.userId as string, role: payload.role as 'USER' | 'ADMIN' };
  } catch {
    return null;
  }
}
