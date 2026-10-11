import 'server-only';
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external';
import { prisma } from '@/lib/prisma';

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

/** 처음 한 번은 읽기를 기다린다. 그 뒤로는 30초 지나면 뒤에서 다시 읽는다 */
export async function ensureSim() {
  if (Date.now() - loaded < 30_000) return;
  if (!loading) loading = load().catch(() => {}).finally(() => (loading = null));
  if (!loaded) await loading;
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

/** 이 요청 계정의 시계가 실제보다 얼마나 옮겨졌나(ms) — 뿌리 레이아웃이 화면 시계를 같은 만큼 옮긴다. 다른 계정은 0 */
export const simOffsetMs = () => simNowMs() - Date.now();
