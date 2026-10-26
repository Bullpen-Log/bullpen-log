'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { isOwnedBy } from '@/lib/storage';
import { isPhoneVideoPath } from '@/lib/phone-video-path';
import { checkNewVideo, cleanFeelNote, type MyVideoItem } from '@/lib/my-videos';
import { toDateKey } from '@/lib/pitch-stats';
import { loadMyVideos } from '@/lib/my-videos-load';
import { deleteUnreferenced } from '@/lib/video-refs';

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

/** 기록 하나에 붙는 영상 수 — 투구 기록 API(app/api/pitch-log/route.ts MAX_VIDEOS)와 같다. 갤러리 보관 수에는 한도가 없다 */
const LOG_VIDEO_MAX = 2;

export type LinkTarget = {
  kind: 'pitch' | 'hit';
  id: string;
  date: string;
  type: string;
  count: number;
  videos: number;
};

/** 이 날짜(모르면 최근 14일)의 내 투구 · 타격 기록 — '기록에 연결' 시트 */
export async function loadMyVideoLinkTargets(
  date: string | null
): Promise<{ ok: true; logs: LinkTarget[] } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const day =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T00:00:00.000Z`)
      : null;
  const where = day
    ? { userId: user.id, date: day }
    : {
        userId: user.id,
        date: { gte: new Date(appNow().getTime() - 14 * 86_400_000) },
      };
  const [pitch, hit] = await Promise.all([
    prisma.pitchLog.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 30,
      select: {
        id: true,
        date: true,
        sessionType: true,
        pitchCount: true,
        videoPaths: true,
      },
    }),
    prisma.hittingLog.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 30,
      select: {
        id: true,
        date: true,
        sessionType: true,
        swings: true,
        videoPaths: true,
      },
    }),
  ]);
  const key = (d: Date) => d.toISOString().slice(0, 10);
  return {
    ok: true,
    logs: [
      ...pitch.map((l) => ({
        kind: 'pitch' as const,
        id: l.id,
        date: key(l.date),
        type: l.sessionType,
        count: l.pitchCount,
        videos: l.videoPaths.length,
      })),
      ...hit.map((l) => ({
        kind: 'hit' as const,
        id: l.id,
        date: key(l.date),
        type: l.sessionType,
        count: l.swings,
        videos: l.videoPaths.length,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date)),
  };
}

type Done = { ok: true } | { ok: false; error: string };

/** 갤러리 항목을 줄로 남긴다(없으면 만든다) — 기록에서 떼거나 지워도 그 영상이 갤러리에 남게 */
async function keepRow(userId: string, item: MyVideoItem) {
  await prisma.userVideo.upsert({
    where: { userId_path: { userId, path: item.path } },
    update: {},
    create: {
      userId,
      path: item.path,
      storage: item.storage,
      sport: item.sport,
      capturedDate: item.date ? new Date(`${item.date}T00:00:00.000Z`) : null,
      capturedSource: item.dateSource,
      origin: item.origin,
    },
  });
}

/** 기록에서 빠진 영상이 그날 대표로 남아 있으면 지운다(그날 다른 기록에도 없을 때) */
async function dropStaleFeatured(userId: string, path: string) {
  const rows = await prisma.dailyFeaturedVideo.findMany({
    where: { userId, videoPath: path },
    select: { id: true, date: true },
  });
  for (const r of rows) {
    const still = await prisma.pitchLog.count({
      where: { userId, date: r.date, videoPaths: { has: path } },
    });
    if (!still)
      await prisma.dailyFeaturedVideo
        .delete({ where: { id: r.id } })
        .catch(() => undefined);
  }
}

async function galleryItem(userId: string, path: unknown) {
  if (typeof path !== 'string' || !isOwnedBy(path, userId)) return null;
  return (await loadMyVideos(userId)).find((v) => v.path === path) ?? null;
}

/**
 * 기록에 연결 — 그 기록의 영상 목록(videoPaths)에 경로만 더한다. 투구수 · 강도 · 총평은 그대로라 부하가 안 바뀐다.
 * 기록 하나에 2개까지(기록 첨부 규칙).
 */
export async function linkMyVideo(
  path: string,
  target: { kind: 'pitch' | 'hit'; id: string }
): Promise<Done> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const item = await galleryItem(user.id, path);
  if (!item) return { ok: false, error: '영상을 찾지 못했어요. 새로고침해 주세요.' };
  if (item.logs.some((l) => l.kind === target?.kind && l.id === target.id))
    return { ok: true };
  const where = { id: String(target?.id ?? ''), userId: user.id };
  const log =
    target?.kind === 'hit'
      ? await prisma.hittingLog.findFirst({ where, select: { videoPaths: true } })
      : await prisma.pitchLog.findFirst({ where, select: { videoPaths: true } });
  if (!log) return { ok: false, error: '기록을 찾지 못했어요.' };
  if (log.videoPaths.length >= LOG_VIDEO_MAX)
    return {
      ok: false,
      error: `기록 하나에는 영상을 ${LOG_VIDEO_MAX}개까지 붙여요. 기록에서 하나를 빼고 다시 해 주세요.`,
    };
  await keepRow(user.id, item);
  const data = { videoPaths: { push: path } };
  if (target.kind === 'hit')
    await prisma.hittingLog.update({ where: { id: where.id }, data });
  else await prisma.pitchLog.update({ where: { id: where.id }, data });
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** 연결 해제 — 그 기록의 영상 목록에서만 뺀다. 파일 · 갤러리의 영상 · 메모는 남는다 */
export async function unlinkMyVideo(
  path: string,
  target: { kind: 'pitch' | 'hit'; id: string }
): Promise<Done> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const item = await galleryItem(user.id, path);
  if (!item) return { ok: false, error: '영상을 찾지 못했어요. 새로고침해 주세요.' };
  const where = { id: String(target?.id ?? ''), userId: user.id };
  const log =
    target?.kind === 'hit'
      ? await prisma.hittingLog.findFirst({ where, select: { videoPaths: true } })
      : await prisma.pitchLog.findFirst({ where, select: { videoPaths: true } });
  if (!log) return { ok: false, error: '기록을 찾지 못했어요.' };
  await keepRow(user.id, item);
  const data = { videoPaths: log.videoPaths.filter((p) => p !== path) };
  if (target.kind === 'hit')
    await prisma.hittingLog.update({ where: { id: where.id }, data });
  else await prisma.pitchLog.update({ where: { id: where.id }, data });
  await dropStaleFeatured(user.id, path);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * 영상 지우기(갤러리에서) — 붙은 기록들에서 빼고(투구수 그대로) → 그날 대표에서 빼고 → 지운 표시 → 아무 데도 안 쓰면 서버 파일을 지운다.
 * 폰 파일은 앱이 서버에 물어 지운다(removePhoneOrphans). 구속 측정 클립은 그 측정의 영상이라 구속 기록 화면에서만 지운다.
 */
export async function deleteMyVideo(path: string): Promise<Done> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const item = await galleryItem(user.id, path);
  if (!item) return { ok: true };
  if (item.clip)
    return {
      ok: false,
      error: '구속 측정 영상은 투구 기록의 구속 측정 칸에서 지워요.',
    };
  const pitchIds = item.logs.filter((l) => l.kind === 'pitch').map((l) => l.id);
  const hitIds = item.logs.filter((l) => l.kind === 'hit').map((l) => l.id);
  const [pitchLogs, hitLogs] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId: user.id, id: { in: pitchIds } },
      select: { id: true, videoPaths: true },
    }),
    prisma.hittingLog.findMany({
      where: { userId: user.id, id: { in: hitIds } },
      select: { id: true, videoPaths: true },
    }),
  ]);
  await prisma.$transaction([
    ...pitchLogs.map((l) =>
      prisma.pitchLog.update({
        where: { id: l.id },
        data: { videoPaths: l.videoPaths.filter((p) => p !== path) },
      })
    ),
    ...hitLogs.map((l) =>
      prisma.hittingLog.update({
        where: { id: l.id },
        data: { videoPaths: l.videoPaths.filter((p) => p !== path) },
      })
    ),
    prisma.dailyFeaturedVideo.deleteMany({
      where: { userId: user.id, videoPath: path },
    }),
    prisma.userVideo.upsert({
      where: { userId_path: { userId: user.id, path } },
      update: { deletedAt: appNow() },
      create: {
        userId: user.id,
        path,
        storage: item.storage,
        sport: item.sport,
        origin: item.origin,
        deletedAt: appNow(),
      },
    }),
  ]);
  if (!isPhoneVideoPath(path)) await deleteUnreferenced([path]).catch(() => undefined);
  revalidatePath('/', 'layout');
  return { ok: true };
}
