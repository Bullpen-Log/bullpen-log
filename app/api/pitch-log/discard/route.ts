import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { isOwnAvatarPath, isOwnedBy } from '@/lib/storage';
import { deleteUnreferenced } from '@/lib/video-refs';

/** 한 번에 받는 경로 수 — 기록 하나에 영상은 두 개까지다 */
const MAX_PATHS = 10;

/**
 * 올렸다가 저장하지 않고 버린 투구 영상을 지운다 — 기록 폼에서 새로 올린 영상을 빼거나, 저장하지 않고 폼을 닫을 때
 * (app/(app)/pitch-log/entry-form.tsx).
 *
 * 예전에는 버린 업로드가 저장소에 영영 남았다(영상과 자동 미리보기, 두 개씩). 지우기 전에 꼭 본다:
 * - 이 사람 폴더의 파일인가(isOwnedBy) — 프로필 사진은 아닌가
 * - 어느 투구 기록(videoPaths)에도, 어느 구속 측정 공(clipPath)에도 안 붙어 있는가. 붙어 있으면 건드리지 않는다 —
 *   저장이 먼저 끝났거나 다른 기록이 쓰는 파일이다.
 * 미리보기(thumb-…)는 deleteVideos 가 영상 이름에서 찾아 같이 지운다.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { paths?: unknown };
  const asked = Array.isArray(body.paths)
    ? body.paths.map((p) => String(p ?? '').trim()).filter(Boolean)
    : [];
  const own = [...new Set(asked)]
    .slice(0, MAX_PATHS)
    .filter(
      (p) =>
        isOwnedBy(p, user.id) &&
        !isOwnAvatarPath(p, user.id) &&
        !p.includes('..') &&
        /* 3D 분석 샘플 폴더는 기록 폼이 올린 것이 아니다 — 지우지 않는다(2026-10-18) */
        !p.includes('/pitch-lab/')
    );
  if (own.length === 0) return NextResponse.json({ deleted: 0 });

  /* 투구 · 타격 기록 · 구속 측정 공 · 시도 클립 · 녹화 조각 어디에도 안 붙은 것만(lib/video-refs.ts) */
  const orphans = await deleteUnreferenced(own);

  /* orphans — 어느 기록 · 클립에도 없는 경로. 폰 영상(local-)은 서버에 파일이 없어, 부르는 쪽이 이것만 폰에서 지운다(lib/local-video.ts discardPhoneVideos) */
  return NextResponse.json({ deleted: orphans.length, orphans });
}
