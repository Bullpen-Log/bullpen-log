'use server';

import { appNow } from '@/lib/clock';
import { getCurrentUser } from '@/lib/dal';
import { featureLocks } from '@/lib/feature-locks';
import { toDateKey } from '@/lib/pitch-stats';

/**
 * 아이폰 앱(native/)이 화면을 열 때 — 누구인가(폰 영상 경로 `{userId}/local-…` 를 만든다) · 오늘(시험 계정 날짜까지) · 잠긴 탭 · 관리자.
 * /api/rpc/app.loadAppMe 로 부른다.
 */
export async function loadAppMe(): Promise<
  | {
      ok: true;
      userId: string;
      nickname: string;
      isAdmin: boolean;
      today: string;
      locks: { pitch: boolean; training: boolean; nutrition: boolean };
    }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  return {
    ok: true,
    userId: user.id,
    nickname: user.nickname,
    isAdmin: user.role === 'ADMIN',
    today: toDateKey(appNow()),
    locks: featureLocks(user),
  };
}
