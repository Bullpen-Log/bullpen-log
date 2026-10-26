'use server';

import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { isOwnedBy } from '@/lib/storage';
import { isPhoneVideoPath } from '@/lib/phone-video-path';
import { checkNewVideo, cleanFeelNote, type MyVideoItem } from '@/lib/my-videos';
import { toDateKey } from '@/lib/pitch-stats';
import { loadMyVideos } from '@/lib/my-videos-load';

/**
 * '내 영상' 갤러리(2026-10-26) — 본인 영상만. 읽기는 줄 · 기록 영상 · 측정 클립을 합친 목록 전부(lib/my-videos-load.ts),
 * 고치기는 영상 메모 · ★ 만. 기록(투구수 · 강도 · 총평)은 건드리지 않는다 — 부하가 그대로다.
 */

export type MyVideosResult =
  { ok: true; items: MyVideoItem[] } | { ok: false; error: string };

export async function loadMyVideoList(): Promise<MyVideosResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  return { ok: true, items: await loadMyVideos(user.id) };
}

export type MyVideoUpdateResult =
  { ok: true; note: string | null; revisit: boolean } | { ok: false; error: string };

/**
 * 영상 메모 · ★ 고치기. 줄이 없는 기존 영상(기록 · 측정 클립에서 보이던 것)이면 이때 줄을 만든다 — 그 영상의 날짜 · 종목 · 출처를 그대로 옮긴다.
 * 갤러리 목록에 있는 경로만 받는다(남의 · 지운 · 아무 데도 없는 경로는 거절).
 */
export async function updateMyVideo(
  path: string,
  patch: { feelNote?: string | null; revisit?: boolean }
): Promise<MyVideoUpdateResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  if (typeof path !== 'string' || !isOwnedBy(path, user.id) || path.includes('..'))
    return { ok: false, error: '영상을 찾지 못했어요.' };

  /* ponytail: 고칠 때마다 목록을 다 읽는다 — 누를 때 한 번이라 괜찮다. 영상이 수천 개가 되면 경로 하나만 찾게 */
  const item = (await loadMyVideos(user.id)).find((v) => v.path === path);
  if (!item) return { ok: false, error: '영상을 찾지 못했어요. 새로고침해 주세요.' };

  const data: { feelNote?: string | null; revisit?: boolean; revisitAt?: Date | null } =
    {};
  if (patch.feelNote !== undefined) data.feelNote = cleanFeelNote(patch.feelNote);
  if (typeof patch.revisit === 'boolean') {
    data.revisit = patch.revisit;
    data.revisitAt = patch.revisit ? appNow() : null;
  }

  const row = await prisma.userVideo.upsert({
    where: { userId_path: { userId: user.id, path } },
    update: data,
    create: {
      userId: user.id,
      path,
      storage: item.storage,
      sport: item.sport,
      capturedDate: item.date ? new Date(`${item.date}T00:00:00.000Z`) : null,
      capturedSource: item.dateSource,
      origin: item.origin,
      ...data,
    },
    select: { feelNote: true, revisit: true },
  });
  return { ok: true, note: row.feelNote, revisit: row.revisit };
}

export type MyVideoCreateResult =
  { ok: true } | { ok: false; error: string; retry?: false };

/**
 * 영상만 저장(운동량 없이) — 폰이 찍거나 고른 영상을 갤러리에 남긴다. 폰의 대기열이 보내 끊기면 다시 보내는데, 같은 번호(clientId)면
 * 하나만 남는다. 기록(투구수 · 강도)은 만들지 않는다 — 부하가 그대로다. 거절(retry: false)은 다시 보내도 안 되니 폰이 버린다.
 */
export async function createMyVideo(input: unknown): Promise<MyVideoCreateResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const checked = checkNewVideo(input, user.id, toDateKey(appNow()));
  if ('error' in checked) return { ok: false, error: checked.error, retry: false };
  const v = checked.value;
  const done = await prisma.userVideo.findFirst({
    where: { userId: user.id, OR: [{ clientId: v.clientId }, { path: v.path }] },
    select: { id: true },
  });
  if (done) return { ok: true };
  /* 같은 번호를 거의 동시에 두 번 보내면 하나는 겹침(P2002)으로 막힌다 — 이미 남은 것이니 성공으로 */
  await prisma.userVideo
    .create({
      data: {
        userId: user.id,
        clientId: v.clientId,
        path: v.path,
        storage: isPhoneVideoPath(v.path) ? 'phone' : 'server',
        sport: v.sport,
        origin: v.origin,
        capturedAt: v.capturedAt ? new Date(v.capturedAt) : null,
        capturedDate: v.capturedDate
          ? new Date(`${v.capturedDate}T00:00:00.000Z`)
          : null,
        capturedSource: v.capturedSource,
        feelNote: v.feelNote,
        durationSec: v.durationSec,
        width: v.width,
        height: v.height,
      },
    })
    .catch((e: unknown) => {
      if ((e as { code?: string }).code !== 'P2002') throw e;
    });
  return { ok: true };
}
