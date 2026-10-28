import 'server-only';
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external';
import { prisma } from '@/lib/prisma';
import { isTimeZone } from '@/lib/time-zone';

/**
 * 시뮬레이션 날짜(User.simDate)를 가진 계정 → 날짜. 30초마다 다시 읽는다(김민이 '다음날로'를 DB 에서 바꾸면 곧 반영).
 * 요청 계정은 로그인 쿠키(서명된 JWT)의 userId 를 바로 읽는다 — 검증은 다른 곳이 하고, 여기선 시각만 고른다.
 */
const SIM = new Map<string, string>();
let loaded = 0;
let loading: Promise<void> | null = null;

async function load() {
  const us = await prisma.user.findMany({ where: { simDate: { not: null } }, select: { id: true, simDate: true } });
  SIM.clear();
  for (const u of us) if (u.simDate) SIM.set(u.id, u.simDate.toISOString().slice(0, 10));
  loaded = Date.now();
}

/**
 * 30초 지났으면 다시 읽고 기다린다. 예전엔 처음 한 번만 기다리고 그 뒤로는 뒤에서 읽어, 30초 지난 첫 요청이 옛 날짜로 그려졌다
 * (그 요청의 화면 시계까지 옛 날짜). 시뮬레이션 계정이 있을 때 30초에 한 번 짧은 읽기라 기다려도 된다.
 */
export async function ensureSim() {
  if (Date.now() - loaded < 30_000) return;
  if (!loading) loading = load().catch(() => {}).finally(() => (loading = null));
  await loading;
}

function requestUserId(): string | null {
  try {
    const store = workUnitAsyncStorage.getStore() as unknown as
      | { cookies?: { get?: (n: string) => { value: string } | undefined } }
      | undefined;
    const token = typeof store?.cookies?.get === 'function' ? store.cookies.get('session')?.value : undefined;
    if (!token) return null;
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof p.userId === 'string' ? p.userId : null;
  } catch {
    return null;
  }
}

const KST = 9 * 3600_000;

/** 그 계정의 '지금' — 날짜는 시뮬레이션 날짜, 하루 안의 시각(한국 시각)은 실제 */
export function simNowMs(): number {
  const real = Date.now();
  if (real - loaded >= 30_000 && !loading) void ensureSim();
  if (!SIM.size) return real;
  const id = requestUserId();
  const day = id ? SIM.get(id) : undefined;
  if (!day) return real;
  return Date.parse(`${day}T00:00:00Z`) - KST + ((real + KST) % 86_400_000);
}

(globalThis as { __bpNow?: () => number }).__bpNow = simNowMs;

/**
 * 이 요청의 기기 시간대(lib/time-zone.ts) — 앱 요청은 머리글 x-bp-tz, 웹 화면은 쿠키 bp-tz. 둘 다 없거나 엉뚱하면 null(→ 한국).
 * 2026-10-28 김민 Q10: 날짜 · 하루 넘어감은 기기 기준.
 */
function requestZone(): string | null {
  try {
    const store = workUnitAsyncStorage.getStore() as unknown as
      | {
          headers?: { get?: (n: string) => string | null };
          cookies?: { get?: (n: string) => { value: string } | undefined };
        }
      | undefined;
    const header = typeof store?.headers?.get === 'function' ? store.headers.get('x-bp-tz') : null;
    if (isTimeZone(header)) return header;
    const cookie = typeof store?.cookies?.get === 'function' ? store.cookies.get('bp-tz')?.value : undefined;
    const z = cookie ? decodeURIComponent(cookie) : null;
    return isTimeZone(z) ? z : null;
  } catch {
    return null;
  }
}

(globalThis as { __bpZone?: () => string | null }).__bpZone = requestZone;

/** 이 요청 계정의 시계가 실제보다 얼마나 옮겨졌나(ms) — 뿌리 레이아웃이 화면 시계를 같은 만큼 옮긴다. 다른 계정은 0 */
export const simOffsetMs = () => simNowMs() - Date.now();
