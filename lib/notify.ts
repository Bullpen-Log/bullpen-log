import 'server-only';
import { prisma } from '@/lib/prisma';
import { usesSinker } from '@/lib/brand';
import {
  appsFor,
  isExpoToken,
  type AppName,
  type NotifyKind,
} from '@/lib/notify-rules';

/**
 * 알림 보내기(2026-10-21 개편 5단계) — 기록 한 줄(Notification, 웹 알림함) + 앱 푸시(Expo push API, 등록된 기기가 있을 때만).
 * 보내는 쪽(채팅 · 예약 · 레슨 노트 …)은 이 함수 하나만 부른다. 푸시 실패는 삼킨다 — 알림 때문에 본 동작이 막히면 안 된다.
 */
export type NotifyInput = {
  kind: NotifyKind;
  title: string;
  body?: string;
  link?: string;
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function notify(userId: string, input: NotifyInput): Promise<void> {
  if (!userId) return;
  try {
    await prisma.notification.create({
      data: {
        userId,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      },
    });
  } catch {
    return;
  }
  try {
    await pushTo(userId, input);
  } catch {
    /* 푸시는 덤 */
  }
}

export async function notifyMany(userIds: string[], input: NotifyInput): Promise<void> {
  await Promise.all([...new Set(userIds)].map((id) => notify(id, input)));
}

async function pushTo(userId: string, input: NotifyInput) {
  const devices = await prisma.pushDevice.findMany({
    where: { userId },
    select: { token: true, app: true },
  });
  if (devices.length === 0) return;
  const has = new Set(devices.map((d) => d.app as AppName));
  /* 두 앱을 다 가졌을 때만 누구인지 본다 — 선수면 선수 활동 알림도 싱커로(lib/notify-rules.ts) */
  const player =
    has.size > 1
      ? await prisma.user
          .findUnique({ where: { id: userId }, select: { accountType: true, sinkerStartedAt: true } })
          .then((u) => (u ? usesSinker(u) : false))
      : false;
  const target = new Set(appsFor(input.kind, has, { player }));
  const tokens = devices
    .filter((d) => target.has(d.app as AppName) && isExpoToken(d.token))
    .map((d) => d.token);
  if (tokens.length === 0) return;
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(
      tokens.map((to) => ({
        to,
        title: input.title,
        body: input.body ?? '',
        data: { link: input.link ?? '/', kind: input.kind },
        sound: 'default',
      }))
    ),
  });
  /* 더는 안 받는 토큰(DeviceNotRegistered)은 지운다 */
  if (res.ok) {
    const json = (await res.json().catch(() => null)) as {
      data?: { status: string; details?: { error?: string } }[];
    } | null;
    const dead = (json?.data ?? [])
      .map((t, i) =>
        t.status === 'error' && t.details?.error === 'DeviceNotRegistered'
          ? tokens[i]
          : null
      )
      .filter((t): t is string => !!t);
    if (dead.length)
      await prisma.pushDevice.deleteMany({ where: { token: { in: dead } } });
  }
}

/** 위 막대의 숫자 */
export async function countUnreadNotifications(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
