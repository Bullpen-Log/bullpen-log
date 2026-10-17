'use server';

import { appNow } from '@/lib/clock';
import { getCurrentUser } from '@/lib/dal';
import { featureLocks } from '@/lib/feature-locks';
import { toDateKey } from '@/lib/pitch-stats';
import { loadHomeFeed, loadHomeRings, type HomeRing } from '@/lib/report/home-today';
import { loadTodayCoreCached } from '@/lib/report/today-data';
import { armStatusOf, type ArmStatus } from '@/lib/report/arm-status';
import type { FeedItem } from '@/lib/report/feed-items';

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

/**
 * 앱 홈 — 웹 홈(app/(app)/today/home-page.tsx)과 같은 숫자: 링 넷 · 요약 칸 장들(lib/report/home-today.ts) · 캘린더 밑 알림 카드
 * (메모의 통증 말 · 회복만 고른 날 · 첫날의 팔 상태). 그리기는 앱이(native/src/home). 캘린더 · 그날 칸은 투구 기록 API · /api/day-detail.
 */
export async function loadAppHome(): Promise<
  | {
      ok: true;
      today: string;
      rings: HomeRing[];
      checkinDone: boolean;
      feed: FeedItem[];
      /** 최근 투구 메모에 통증 같은 말 — 체크인으로 확인할 때까지 투구는 쉬고 운동은 회복만(웹 홈 맨 위 경고 카드) */
      painWords: string[] | null;
      /** 최근 체크인 통증으로 오늘은 회복 운동만 */
      recovering: boolean;
      /** 투구 기록을 한 번도 안 남긴 사람 — 지금 팔 상태(첫날 카드) */
      firstDay: ArmStatus | null;
      pitchLocked: boolean;
    }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const today = toDateKey(appNow());
  const locks = featureLocks(user);
  const [rings, feed, core] = await Promise.all([
    loadHomeRings(user, today, locks.pitch),
    loadHomeFeed(user, today),
    loadTodayCoreCached(user),
  ]);
  const { plan, picked, facts } = core;
  return {
    ok: true,
    today,
    rings: rings.items,
    checkinDone: rings.checkinDone,
    feed,
    painWords: plan.needsPainCheck && !picked.halted ? facts.condition.painWordsInMemo : null,
    recovering: plan.recovering && !plan.needsPainCheck && !picked.halted,
    firstDay: core.everLogged ? null : armStatusOf(facts),
    pitchLocked: locks.pitch,
  };
}
