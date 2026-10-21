'use server';

import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { isExpoToken } from '@/lib/notify-rules';

/**
 * 앱 알림 기기 등록(2026-10-21 개편 5단계 5-3) — 앱(싱커 · 덕아웃)이 expo-notifications 로 받은 토큰을 /api/rpc/push.registerPushDevice 로 보낸다(김민 B-4).
 * 같은 토큰이 다른 계정으로 오면(폰을 다른 사람이 로그인) 그 계정으로 옮긴다.
 */
export async function registerPushDevice(input: {
  token: string;
  app: 'sinker' | 'dugout';
  platform?: string;
}): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const token = String(input?.token ?? '').trim();
  const app = input?.app === 'dugout' ? 'dugout' : 'sinker';
  if (!isExpoToken(token)) return { ok: false };
  const platform = String(input?.platform ?? 'ios').slice(0, 16);
  await prisma.pushDevice.upsert({
    where: { token },
    update: { userId: user.id, app, platform, lastSeenAt: new Date() },
    create: { userId: user.id, token, app, platform },
  });
  return { ok: true };
}

/** 로그아웃 · 알림 끄기 때 — 내 토큰만 지운다 */
export async function unregisterPushDevice(input: {
  token: string;
}): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const token = String(input?.token ?? '').trim();
  if (!token) return { ok: false };
  await prisma.pushDevice.deleteMany({ where: { token, userId: user.id } });
  return { ok: true };
}
