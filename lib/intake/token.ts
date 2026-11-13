/**
 * 초대 토큰 · 접근 코드 · 접수 번호. 서버에서만 쓴다(node:crypto).
 * 토큰 원문은 저장하지 않고, 로그에 찍지 않는다. 주소의 조각(#)으로 다니고 API 에는 Authorization 머리로만 온다.
 */
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { seoulDateKey } from '@/lib/intake/paths';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;

/** 32바이트 난수 → base64url 43자 */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const generateInvitationToken = () => randomBytes(32).toString('base64url');

export const isInvitationToken = (v: unknown): v is string => typeof v === 'string' && TOKEN_RE.test(v);

/** 저장 · 찾기에 쓰는 해시. 토큰이 충분히 길어 소금이 필요 없다 */
export const hashInvitationToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

/** 'Authorization: Intake <token>' → 토큰. 모양이 다르면 null */
export function parseIntakeAuthorization(header: string | null | undefined): string | null {
  const m = /^Intake ([A-Za-z0-9_-]{43})$/.exec(header?.trim() ?? '');
  return m ? m[1] : null;
}

const ACCESS_N = 16384;
const ACCESS_R = 8;
const ACCESS_P = 1;
const ACCESS_LEN = 32;

/** 접근 코드 글자 수 — 링크가 새어 나갔을 때의 마지막 막이다. 시도 횟수 제한(rate-limit 'code')과 누적 잠금(access.ts)이 함께 지킨다 */
export const ACCESS_CODE_MIN_CHARS = 6;
export const ACCESS_CODE_MAX_CHARS = 32;

export const isAccessCode = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length >= ACCESS_CODE_MIN_CHARS && v.trim().length <= ACCESS_CODE_MAX_CHARS;

export async function hashAccessCode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(code.trim(), salt, ACCESS_LEN, { N: ACCESS_N, r: ACCESS_R, p: ACCESS_P });
  return `scrypt$${ACCESS_N}$${ACCESS_R}$${ACCESS_P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyAccessCode(code: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  const got = await scrypt(code.trim(), Buffer.from(salt, 'base64url'), want.length, { N: Number(n), r: Number(r), p: Number(p) });
  return got.length === want.length && timingSafeEqual(got, want);
}

/* 헷갈리는 글자(0 O 1 I L)를 뺀 32자 */
const RECEIPT_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** 사람이 불러 줄 수 있는 접수 번호 — 'IN-261106-7KQ2M9'. 한국 날짜 + 6자 */
export function generateReceiptCode(at: Date): string {
  const day = seoulDateKey(at).replaceAll('-', '').slice(2);
  let tail = '';
  for (let i = 0; i < 6; i++) tail += RECEIPT_ALPHABET[randomInt(RECEIPT_ALPHABET.length)];
  return `IN-${day}-${tail}`;
}

/** 완료 요청 키 모양 — 화면이 한 번 만들어 다시 보낼 때도 같은 값을 쓴다 */
export const isIdempotencyKey = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);
