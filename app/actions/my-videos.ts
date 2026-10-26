'use server';

import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { isOwnedBy } from '@/lib/storage';
import { cleanFeelNote, type MyVideoItem } from '@/lib/my-videos';
import { loadMyVideos } from '@/lib/my-videos-load';

/**
 * '내 영상' 갤러리(2026-10-26) — 본인 영상만. 읽기는 줄 · 기록 영상 · 측정 클립을 합친 목록 전부(lib/my-videos-load.ts),
 * 고치기는 영상 메모 · ★ 만. 기록(투구수 · 강도 · 총평)은 건드리지 않는다 — 부하가 그대로다.
 */

export type MyVideosResult = { ok: true; items: MyVideoItem[] } | { ok: false; error: string };

export async function listMyVideos(): Promise<MyVideosResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  return { ok: true, items: await loadMyVideos(user.id) };
}

export type MyVideoUpdateResult =
  | { ok: true; note: string | null; revisit: boolean }
  | { ok: false; error: string };

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

  const data: { feelNote?: string | null; revisit?: boolean; revisitAt?: Date | null } = {};
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
