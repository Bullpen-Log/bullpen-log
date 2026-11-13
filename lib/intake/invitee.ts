/**
 * 받는 사람 이름 · PIN · 세션 (INTAKE-MAIN/R03, 2026-11-13 사용자 승인 — 지인 비공개 수집).
 *
 * ── 약속 ──────────────────────────────
 * - 초대 하나 = 사람 하나. 처음 연 사람이 이름과 네 자리 숫자 PIN 을 정한다. 조건부 갱신(enrolledAt IS NULL)으로 하나만 이긴다 — 동시에 연 두 창이 서로 덮지 않는다.
 * - 다시 올 때는 같은 링크 + 같은 이름 · PIN 이다. 이름만으로 전체에서 찾는 길은 없다(초대 번호가 신원이다. 이름이 같아도 다른 초대면 다른 사람이다).
 * - PIN 은 숫자 네 자리 글자 그대로다('0042' 의 앞 0 을 지킨다). 소금을 친 scrypt 해시만 둔다. 원문은 주소 · 브라우저 저장소 · 로그 · 관리자 화면에 남기지 않는다.
 * - 틀린 이름과 틀린 PIN 은 같은 답이다(invitee_credentials_wrong). 대조 전에 시도 자리를 DB 가 한 번에 센다 — 동시에 보낸 틀린 시도가 낡은 값을 보고 한도를 넘지 않게.
 *   창마다의 제한(rate-limit 'pin')과 누적 잠금(PIN_MAX_FAILURES)이 함께 지킨다. 잠금은 관리자만 푼다.
 * - 맞히면 서버가 세션을 준다. 원문은 HttpOnly · Secure · SameSite=Strict 쿠키로만 다니고(자바스크립트가 못 읽는다) DB 에는 해시만 둔다.
 *   쿠키 이름은 초대마다 다르다 — 한 브라우저에서 두 링크를 열어도 서로 덮지 않는다.
 * - 공개 API(상태 · 초안 · 동의 · 칸 잡기 · 전송 토큰 · 업로드 주소 · 도착 확인 · 완료 · 결과)는 초대 토큰과 이 세션을 함께 본다(lib/intake/public-api.ts · publication.ts).
 *   세션 없이 열리는 것은 이름 · PIN 을 정하거나 맞히는 길과 '정했는지'만 알려 주는 관문뿐이다 — 이름 · 초안 · 파일 · 결과를 주지 않는다.
 * - 세션은 쓰지 않고 2시간이면 끝, 써도 12시간이면 끝이다. 관리자가 이름 · PIN 을 지우거나 링크를 바꾸면 세대(sessionEpoch)가 올라 예전 세션이 모두 막힌다.
 * - 한계: 세션 검사는 요청 맨 앞에서 한다. 이미 들어온 요청 하나는 끝까지 간다. 이미 내준 저장소 전송 토큰은 수명까지 산다(초대 폐기와 같다).
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { IntakeScope } from '@/lib/intake/access';
import { writeAudit } from '@/lib/intake/audit';
import { IntakeError } from '@/lib/intake/errors';
import { hitRateLimit, refundRateLimit, enforceRateLimit } from '@/lib/intake/rate-limit';

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;

/** PIN — 숫자 네 자리. 글자 그대로 다룬다(숫자로 바꾸면 앞 0 이 사라진다) */
export const PIN_RE = /^[0-9]{4}$/;
export const isPin = (v: unknown): v is string => typeof v === 'string' && PIN_RE.test(v);
export const INVITEE_NAME_MAX = 40;
/** 틀린 이름 · PIN 누적 한도 — 넘으면 관리자가 풀 때까지 잠근다. 네 자리라 한도가 곧 막이다(1만 개 중 10개 = 0.1%) */
export const PIN_MAX_FAILURES = 10;
/** 시도 자리를 쥔 채 대조하는 시간의 상한 — 함수 하나의 수명보다 길다(access.ts 와 같은 규칙) */
export const PIN_HOLD_STALE_MS = 2 * 60_000;
export const SESSION_IDLE_MS = 2 * 60 * 60_000;
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60_000;
/** 마지막 사용 시각은 이만큼 지났을 때만 다시 적는다 — 칸 잡기 · 토큰 같은 잦은 요청마다 쓰지 않게 */
export const SESSION_TOUCH_MS = 5 * 60_000;
export const SESSION_COOKIE_PATH = '/api/intake/public';

const PIN_N = 16384;
const PIN_R = 8;
const PIN_P = 1;
const PIN_LEN = 32;
const SESSION_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/* ────────────────────────────── 이름 · PIN ────────────────────────────── */

/** 화면에 보일 이름 — NFC, 앞뒤 공백 · 겹친 공백 정리. 제어 · 형식 글자가 있으면 막는다 */
export function cleanInviteeName(raw: unknown): string {
  if (typeof raw !== 'string') throw new IntakeError('invitee_name_invalid');
  const text = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!text || [...text].length > INVITEE_NAME_MAX) throw new IntakeError('invitee_name_invalid');
  if (/[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/u.test(text)) throw new IntakeError('athlete_name_chars');
  return text;
}

/** 이름 비교 열쇠 — 호환 글자 · 대소문자 · 공백을 접는다. '홍길동' 과 ' 홍길동 ' 과 '홍 길동' 은 같지 않다(띄어쓰기는 이름의 일부다) */
export const inviteeNameKey = (name: string) => name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

const pinMessage = (invitationId: string, pin: string) => `intake-pin|${invitationId}|${pin}`;

export async function hashPin(invitationId: string, pin: string): Promise<string> {
  if (!isPin(pin)) throw new IntakeError('pin_invalid');
  const salt = randomBytes(16);
  const key = await scrypt(pinMessage(invitationId, pin), salt, PIN_LEN, { N: PIN_N, r: PIN_R, p: PIN_P });
  return `scrypt$${PIN_N}$${PIN_R}$${PIN_P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPin(invitationId: string, pin: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  /* 모양이 틀린 PIN 도 같은 시간을 쓰게 한 번은 잰다 */
  const got = await scrypt(pinMessage(invitationId, isPin(pin) ? pin : '----'), Buffer.from(salt, 'base64url'), want.length, { N: Number(n), r: Number(r), p: Number(p) });
  return isPin(pin) && got.length === want.length && timingSafeEqual(got, want);
}

const sameKey = (a: string, b: string) => {
  const x = createHash('sha256').update(a, 'utf8').digest();
  const y = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(x, y);
};

/* ────────────────────────────── 쿠키 ────────────────────────────── */

/** 초대마다 다른 쿠키 이름 — 초대 번호를 해시해 줄인다(번호 자체를 쿠키 이름에 드러내지 않는다) */
export const sessionCookieName = (invitationId: string) => `intake_s_${createHash('sha256').update(`intake-session-cookie|${invitationId}`).digest('hex').slice(0, 16)}`;

/** 'a=1; b=2' 머리에서 이 초대의 세션 원문을 꺼낸다. 모양이 틀리면 null */
export function readSessionCookie(cookieHeader: string | null | undefined, invitationId: string): string | null {
  if (!cookieHeader) return null;
  const name = sessionCookieName(invitationId);
  for (const part of cookieHeader.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    const value = part.slice(i + 1).trim();
    return SESSION_TOKEN_RE.test(value) ? value : null;
  }
  return null;
}

export function sessionSetCookie(invitationId: string, token: string, maxAgeSec: number): string {
  return `${sessionCookieName(invitationId)}=${token}; Path=${SESSION_COOKIE_PATH}; Max-Age=${Math.max(0, Math.floor(maxAgeSec))}; HttpOnly; Secure; SameSite=Strict`;
}

export const sessionClearCookie = (invitationId: string) => `${sessionCookieName(invitationId)}=; Path=${SESSION_COOKIE_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

const hashSessionToken = (token: string) => createHash('sha256').update(`intake-session|${token}`, 'utf8').digest('hex');

/* ────────────────────────────── 관문(세션 없이 묻는 것) ────────────────────────────── */

export type InviteeGate = { enrolled: boolean; locked: boolean };

/** 이름 · PIN 을 정했는지 · 잠겼는지만 — 이름 · 초안 · 파일은 주지 않는다 */
export async function loadInviteeGate(db: Db, scope: IntakeScope, now: Date = new Date()): Promise<InviteeGate> {
  await enforceRateLimit(db, { scope: 'gate', subject: scope.invitationId, now });
  const inv = await db.intakeInvitation.findUnique({ where: { id: scope.invitationId }, select: { tokenHash: true, enrolledAt: true, pinHash: true, pinLockedAt: true } });
  if (!inv || inv.tokenHash !== scope.tokenHash) throw new IntakeError('invitation_invalid');
  return { enrolled: inv.enrolledAt != null && inv.pinHash != null, locked: inv.pinLockedAt != null };
}

/* ────────────────────────────── 세션 ────────────────────────────── */

export type IssuedSession = { token: string; maxAgeSec: number; idleExpiresAt: Date; expiresAt: Date };

async function issueSession(db: Db | Tx, invitationId: string, epoch: number, now: Date): Promise<IssuedSession> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MS);
  const idleExpiresAt = new Date(now.getTime() + SESSION_IDLE_MS);
  await db.intakeInviteeSession.create({ data: { invitationId, tokenHash: hashSessionToken(token), epoch, lastSeenAt: now, idleExpiresAt, expiresAt, createdAt: now } });
  return { token, maxAgeSec: SESSION_ABSOLUTE_MS / 1000, idleExpiresAt, expiresAt };
}

export type CheckedSession = { sessionId: string; idleExpiresAt: Date; expiresAt: Date };

/**
 * 공개 API 의 세션 관문 — openIntakeScope 바로 뒤에 부른다. 없으면 session_required, 끝났으면 session_expired.
 * 다른 초대의 세션 · 지운 세션 · 세대가 지난 세션(관리자가 이름 · PIN 을 지움 · 링크를 바꿈)은 없는 것과 같다.
 */
export async function requireInviteeSession(db: Db, scope: IntakeScope, cookieHeader: string | null | undefined, now: Date = new Date()): Promise<CheckedSession> {
  const token = readSessionCookie(cookieHeader, scope.invitationId);
  if (!token) throw new IntakeError('session_required');
  const row = await db.intakeInviteeSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { invitation: { select: { sessionEpoch: true, enrolledAt: true, pinHash: true, tokenHash: true } } },
  });
  if (!row || row.invitationId !== scope.invitationId || row.revokedAt) throw new IntakeError('session_required');
  /* 토큰 먼저 — 링크를 바꾸면 토큰과 세대가 같이 바뀐다. 예전 링크로 온 요청은 '이름 · PIN 다시'가 아니라 '쓸 수 없는 링크'여야 한다(openIntakeScope 와 같은 답) */
  if (row.invitation.tokenHash !== scope.tokenHash) throw new IntakeError('invitation_invalid');
  if (row.epoch !== row.invitation.sessionEpoch || !row.invitation.enrolledAt || !row.invitation.pinHash) throw new IntakeError('session_required');
  if (row.expiresAt.getTime() <= now.getTime() || row.idleExpiresAt.getTime() <= now.getTime()) throw new IntakeError('session_expired');
  let idleExpiresAt = row.idleExpiresAt;
  if (now.getTime() - row.lastSeenAt.getTime() >= SESSION_TOUCH_MS) {
    idleExpiresAt = new Date(Math.min(now.getTime() + SESSION_IDLE_MS, row.expiresAt.getTime()));
    await db.intakeInviteeSession.updateMany({ where: { id: row.id, revokedAt: null }, data: { lastSeenAt: now, idleExpiresAt } });
  }
  return { sessionId: row.id, idleExpiresAt, expiresAt: row.expiresAt };
}

/** 이 기기의 세션을 끝낸다 — 없으면 아무것도 안 한다 */
export async function endInviteeSession(db: Db, scope: IntakeScope, cookieHeader: string | null | undefined, now: Date = new Date()): Promise<{ ended: boolean }> {
  const token = readSessionCookie(cookieHeader, scope.invitationId);
  if (!token) return { ended: false };
  const r = await db.intakeInviteeSession.updateMany({ where: { tokenHash: hashSessionToken(token), invitationId: scope.invitationId, revokedAt: null }, data: { revokedAt: now } });
  return { ended: r.count > 0 };
}

/* ────────────────────────────── 처음 정하기 ────────────────────────────── */

export type InviteeCredentials = { name: unknown; pin: unknown; pinConfirm?: unknown };
export type InviteeSessionResult = { name: string; session: IssuedSession };

/**
 * 처음 연 사람이 이름 · PIN 을 정한다. 이미 정한 초대면 invitee_already_enrolled — 화면은 '다시 들어가기'로 바꾼다.
 * 해시는 트랜잭션 밖에서 잰다. 조건부 갱신이 하나만 이기게 한다(enrolledAt IS NULL · 같은 토큰 · active).
 */
export async function enrollInvitee(db: Db, scope: IntakeScope, input: InviteeCredentials, now: Date = new Date()): Promise<InviteeSessionResult> {
  const name = cleanInviteeName(input.name);
  if (!isPin(input.pin)) throw new IntakeError('pin_invalid');
  if (input.pinConfirm !== input.pin) throw new IntakeError('pin_mismatch');
  await enforceRateLimit(db, { scope: 'enroll', subject: scope.invitationId, now });
  const pinHash = await hashPin(scope.invitationId, input.pin);
  return db.$transaction(async (tx) => {
    const moved = await tx.intakeInvitation.updateMany({
      where: { id: scope.invitationId, tokenHash: scope.tokenHash, status: 'active', enrolledAt: null },
      data: { inviteeName: name, inviteeNameKey: inviteeNameKey(name), pinHash, enrolledAt: now, pinFailures: 0, pinLockedAt: null },
    });
    const inv = await tx.intakeInvitation.findUnique({ where: { id: scope.invitationId }, select: { tokenHash: true, status: true, enrolledAt: true, sessionEpoch: true } });
    if (!inv || inv.tokenHash !== scope.tokenHash) throw new IntakeError('invitation_invalid');
    if (moved.count === 0) {
      if (inv.status !== 'active') throw new IntakeError('invitation_revoked');
      throw new IntakeError('invitee_already_enrolled');
    }
    await writeAudit(tx, { actor: { kind: 'invitee' }, action: 'invitee.enrolled', invitationId: scope.invitationId, submissionId: scope.submissionId }, now);
    const session = await issueSession(tx, scope.invitationId, inv.sessionEpoch, now);
    return { name, session };
  });
}

/* ────────────────────────────── 다시 들어가기 ────────────────────────────── */

/** 시도 자리를 잡는다 — 대조 전에 DB 가 한 번에 센다(access.ts holdCodeAttempt 와 같은 규칙). 잡은 자리 번호를 돌려준다 */
async function holdPinAttempt(db: Db, scope: IntakeScope, now: Date): Promise<number> {
  const window = await hitRateLimit(db, { scope: 'pin', subject: scope.invitationId, now });
  if (!window.allowed) throw new IntakeError('rate_limited', { retryAfterSec: window.retryAfterSec });
  const rows = await db.$queryRaw<{ pinFailures: number }[]>`
    UPDATE "IntakeInvitation" SET "pinFailures" = "pinFailures" + 1, "updatedAt" = ${now}
    WHERE "id" = ${scope.invitationId} AND "tokenHash" = ${scope.tokenHash} AND "enrolledAt" IS NOT NULL
      AND "pinLockedAt" IS NULL AND "pinFailures" < ${PIN_MAX_FAILURES}
    RETURNING "pinFailures"`;
  if (rows[0]) return rows[0].pinFailures;
  await refundRateLimit(db, { scope: 'pin', subject: scope.invitationId, now });
  const inv = await db.intakeInvitation.findUnique({ where: { id: scope.invitationId }, select: { tokenHash: true, enrolledAt: true, pinLockedAt: true } });
  if (!inv || inv.tokenHash !== scope.tokenHash) throw new IntakeError('invitation_invalid');
  if (!inv.enrolledAt) throw new IntakeError('invitee_not_enrolled');
  if (inv.pinLockedAt) throw new IntakeError('invitee_locked');
  if (await lockAbandonedPinSeat(db, scope, now)) throw new IntakeError('invitee_locked');
  /* 다른 시도가 마지막 자리를 쥐고 대조하는 중이다 — 그 결과에 따라 잠기거나 자리가 돌아온다 */
  throw new IntakeError('rate_limited', { retryAfterSec: 5 });
}

/** 마지막 자리를 잡은 시도가 끝을 못 적고 죽었다 — 틀린 쪽으로 친다(살아 있는 시도의 결과를 앞지르지 않게 시간을 둔다) */
async function lockAbandonedPinSeat(db: Db, scope: IntakeScope, now: Date): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const moved = await tx.intakeInvitation.updateMany({
      where: { id: scope.invitationId, pinLockedAt: null, pinFailures: { gte: PIN_MAX_FAILURES }, updatedAt: { lt: new Date(now.getTime() - PIN_HOLD_STALE_MS) } },
      data: { pinLockedAt: now },
    });
    if (moved.count === 0) return false;
    await writeAudit(tx, { actor: { kind: 'system' }, action: 'invitee.locked', invitationId: scope.invitationId, submissionId: scope.submissionId, detail: { failures: PIN_MAX_FAILURES, abandoned: true } }, now);
    return true;
  });
}

async function releasePinAttempt(db: Db, scope: IntakeScope, now: Date): Promise<void> {
  await db.intakeInvitation.updateMany({ where: { id: scope.invitationId, pinFailures: { gt: 0 } }, data: { pinFailures: { decrement: 1 } } });
  await refundRateLimit(db, { scope: 'pin', subject: scope.invitationId, now });
}

/** 같은 이름 · PIN 이면 새 세션을 준다. 틀리면 같은 답(invitee_credentials_wrong) — 한도에 닿으면 잠근다 */
export async function unlockInvitee(db: Db, scope: IntakeScope, input: InviteeCredentials, now: Date = new Date()): Promise<InviteeSessionResult> {
  /* 모양이 틀린 입력도 시도로 센다 — 모양으로 무엇이 틀렸는지 알려 주지 않는다. 다만 비어 있는 이름 · PIN 은 그 칸을 알려 준다 */
  if (typeof input.name !== 'string' || !input.name.trim()) throw new IntakeError('invitee_name_invalid');
  if (typeof input.pin !== 'string' || !input.pin) throw new IntakeError('pin_invalid');
  const failures = await holdPinAttempt(db, scope, now);
  let right = false;
  let name = '';
  let epoch = -1;
  try {
    const inv = await db.intakeInvitation.findUnique({ where: { id: scope.invitationId }, select: { inviteeName: true, inviteeNameKey: true, pinHash: true, sessionEpoch: true, enrolledAt: true } });
    const keyOk = inv?.inviteeNameKey != null && sameKey(inviteeNameKey(input.name.normalize('NFC')), inv.inviteeNameKey);
    const pinOk = inv?.pinHash != null && (await verifyPin(scope.invitationId, input.pin, inv.pinHash));
    right = keyOk && pinOk;
    name = inv?.inviteeName ?? '';
    /* 대조한 그 판(세대)에만 잠금을 건다 — 그사이 관리자가 지웠으면 세대가 바뀌어 늦은 틀린 시도가 새 판을 잠그지 못한다 */
    epoch = inv?.enrolledAt ? inv.sessionEpoch : -1;
  } catch (e) {
    await releasePinAttempt(db, scope, now);
    throw e;
  }
  if (!right) {
    const lock = failures >= PIN_MAX_FAILURES;
    const lockedNow = await db.$transaction(async (tx) => {
      /*
       * 잠금은 그 시도가 아직 지금 판의 것일 때만 — 같은 세대 · 이름 · PIN 이 있음 · 누적이 아직 한도(관리자가 풀었으면 0 이다).
       * 관리자가 지우거나 푼 직후 늦게 끝난 틀린 시도가 새로 정할 링크를 잠그지 않게.
       */
      const locked = lock
        ? (await tx.intakeInvitation.updateMany({
            where: { id: scope.invitationId, pinLockedAt: null, sessionEpoch: epoch, enrolledAt: { not: null }, pinFailures: { gte: PIN_MAX_FAILURES } },
            data: { pinLockedAt: now },
          })).count > 0
        : false;
      await writeAudit(tx, { actor: { kind: 'invitee' }, action: locked ? 'invitee.locked' : 'invitee.unlock_failed', invitationId: scope.invitationId, submissionId: scope.submissionId, detail: { failures } }, now);
      return locked;
    });
    throw new IntakeError(lockedNow ? 'invitee_locked' : 'invitee_credentials_wrong');
  }
  await releasePinAttempt(db, scope, now);
  return db.$transaction(async (tx) => {
    /* 대조하는 사이 관리자가 지웠거나 링크를 바꿨으면 세션을 주지 않는다 */
    const inv = await tx.intakeInvitation.findUnique({ where: { id: scope.invitationId }, select: { tokenHash: true, sessionEpoch: true, enrolledAt: true, status: true } });
    if (!inv || inv.tokenHash !== scope.tokenHash) throw new IntakeError('invitation_invalid');
    if (inv.status !== 'active') throw new IntakeError('invitation_revoked');
    if (!inv.enrolledAt || inv.sessionEpoch !== epoch) throw new IntakeError('invitee_credentials_wrong');
    await writeAudit(tx, { actor: { kind: 'invitee' }, action: 'invitee.session_started', invitationId: scope.invitationId, submissionId: scope.submissionId }, now);
    return { name, session: await issueSession(tx, scope.invitationId, epoch, now) };
  });
}

/* ────────────────────────────── 관리자 ────────────────────────────── */

export type InviteeAdminFacts = {
  enrolled: boolean;
  name: string | null;
  enrolledAt: string | null;
  failures: number;
  locked: boolean;
  lockedAt: string | null;
  resetAt: string | null;
  /** 지금 살아 있는 세션 수 · 마지막 사용 — 기기 수를 짐작하는 데만 쓴다 */
  liveSessions: number;
  lastSeenAt: string | null;
};

export async function inviteeAdminFacts(db: Db | Tx, invitationId: string, now: Date = new Date()): Promise<InviteeAdminFacts> {
  const inv = await db.intakeInvitation.findUniqueOrThrow({
    where: { id: invitationId },
    select: { inviteeName: true, enrolledAt: true, pinFailures: true, pinLockedAt: true, inviteeResetAt: true, sessionEpoch: true },
  });
  const live = await db.intakeInviteeSession.findMany({
    where: { invitationId, epoch: inv.sessionEpoch, revokedAt: null, expiresAt: { gt: now }, idleExpiresAt: { gt: now } },
    select: { lastSeenAt: true },
    orderBy: { lastSeenAt: 'desc' },
  });
  return {
    enrolled: inv.enrolledAt != null,
    name: inv.inviteeName,
    enrolledAt: inv.enrolledAt?.toISOString() ?? null,
    failures: inv.pinFailures,
    locked: inv.pinLockedAt != null,
    lockedAt: inv.pinLockedAt?.toISOString() ?? null,
    resetAt: inv.inviteeResetAt?.toISOString() ?? null,
    liveSessions: live.length,
    lastSeenAt: live[0]?.lastSeenAt.toISOString() ?? null,
  };
}

async function lockInvitationOf(tx: Tx, submissionId: string) {
  await tx.$queryRaw`SELECT "id" FROM "IntakeSubmission" WHERE "id" = ${submissionId} FOR UPDATE`;
  const sub = await tx.intakeSubmission.findUnique({ where: { id: submissionId }, select: { id: true, invitationId: true } });
  if (!sub) throw new IntakeError('submission_not_found');
  return sub;
}

/**
 * 이름 · PIN 을 지운다 — 받는 분이 PIN 을 잊었을 때. 세대를 올려 모든 세션을 막고, 다음에 링크를 연 사람이 다시 정한다.
 * 접수 · 받은 영상 · 결과는 그대로다. 링크가 새어 나간 것이 걱정이면 '새 링크 만들기'를 같이 쓴다(지우기만으로는 링크를 가진 다른 사람이 먼저 정할 수 있다).
 */
export async function resetInviteeEnrollment(db: Db, input: { adminId: string; submissionId: string }, now: Date = new Date()): Promise<{ reset: boolean }> {
  return db.$transaction(async (tx) => {
    const sub = await lockInvitationOf(tx, input.submissionId);
    const inv = await tx.intakeInvitation.findUniqueOrThrow({ where: { id: sub.invitationId }, select: { enrolledAt: true, pinFailures: true } });
    if (!inv.enrolledAt) return { reset: false };
    await tx.intakeInvitation.update({
      where: { id: sub.invitationId },
      data: { inviteeName: null, inviteeNameKey: null, pinHash: null, enrolledAt: null, pinFailures: 0, pinLockedAt: null, inviteeResetAt: now, sessionEpoch: { increment: 1 } },
    });
    await tx.intakeInviteeSession.updateMany({ where: { invitationId: sub.invitationId, revokedAt: null }, data: { revokedAt: now } });
    await writeAudit(tx, { actor: { kind: 'admin', id: input.adminId }, action: 'invitee.reset', invitationId: sub.invitationId, submissionId: sub.id, detail: { failures: inv.pinFailures } }, now);
    return { reset: true };
  });
}

/** 잠금만 푼다 — 이름 · PIN · 세션은 그대로다 */
export async function unlockInviteePin(db: Db, input: { adminId: string; submissionId: string }, now: Date = new Date()): Promise<{ unlocked: boolean }> {
  return db.$transaction(async (tx) => {
    const sub = await lockInvitationOf(tx, input.submissionId);
    const inv = await tx.intakeInvitation.findUniqueOrThrow({ where: { id: sub.invitationId }, select: { pinFailures: true, pinLockedAt: true } });
    if (inv.pinFailures === 0 && inv.pinLockedAt == null) return { unlocked: false };
    await tx.intakeInvitation.update({ where: { id: sub.invitationId }, data: { pinFailures: 0, pinLockedAt: null } });
    await writeAudit(tx, { actor: { kind: 'admin', id: input.adminId }, action: 'invitee.unlocked', invitationId: sub.invitationId, submissionId: sub.id, detail: { failures: inv.pinFailures } }, now);
    return { unlocked: true };
  });
}

/** 끝난 세션 줄을 지운다 — 정리 작업이 부른다. 하루 여유를 둔다 */
export async function pruneInviteeSessions(db: Db, now: Date = new Date()): Promise<number> {
  const before = new Date(now.getTime() - 86_400_000);
  const r = await db.intakeInviteeSession.deleteMany({ where: { OR: [{ expiresAt: { lt: before } }, { idleExpiresAt: { lt: before } }, { revokedAt: { lt: before } }] } });
  return r.count;
}
