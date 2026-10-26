import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { isOwner } from '@/lib/permissions';
import { loadMapPlaces } from '@/lib/market/map-load';
import { CANDIDATE_FLAGS, candidateMapPlaces, loadCandidates } from '@/lib/market/candidate-load';
import { VENUE_KINDS, isVenueKind } from '@/lib/market/venues';

/**
 * 연습장 · 레슨장 목록(덕아웃 앱 지도 화면 native/src/dugout/app/venues.tsx, 2026-10-25) — 웹 /venues 와 같은 읽기(loadMapPlaces).
 * 로그인 없이 본다(웹 화면도 공개). ?kind=lesson | 연습장 종류 · ?q= 검색. 종류 목록도 같이 보내 앱이 칩을 그린다.
 *
 * admin — 대표관리자면 true(앱이 [공개 지도 | 수집 후보] 고르개를 그린다). ?view=candidates 는 대표관리자만 — 수집 후보를 같은 모양으로,
 * 그때 kind 는 후보 거르기 열쇠(2026-10-26 김민). 앱은 웹뷰의 로그인 쿠키를 실어 보낸다(syncSession).
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const raw = (sp.get('kind') ?? '').trim();
  const q = (sp.get('q') ?? '').trim().slice(0, 40) || undefined;
  try {
    const admin = isOwner((await getCurrentUser())?.role);
    if (sp.get('view') === 'candidates') {
      if (!admin) return NextResponse.json({ error: '관리자만 볼 수 있어요' }, { status: 403 });
      const flag = CANDIDATE_FLAGS.some((f) => f.key === raw) ? raw : undefined;
      const { items } = await loadCandidates({ q, flag });
      return NextResponse.json({
        places: candidateMapPlaces(items),
        kinds: CANDIDATE_FLAGS.map((f) => ({ key: f.key, label: f.label })),
        admin,
      });
    }
    const kind = raw === 'lesson' || isVenueKind(raw) ? raw : undefined;
    const places = await loadMapPlaces({ kind, q });
    return NextResponse.json({
      places,
      kinds: [{ key: 'lesson', label: '레슨장' }, ...VENUE_KINDS.map((k) => ({ key: k.key, label: k.label }))],
      admin,
    });
  } catch (error) {
    console.error('[GET /api/places]', error);
    return NextResponse.json({ error: '장소를 불러오지 못했어요' }, { status: 500 });
  }
}
