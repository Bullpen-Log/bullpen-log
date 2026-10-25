import { NextResponse } from 'next/server';
import { loadMapPlaces } from '@/lib/market/map-load';
import { VENUE_KINDS, isVenueKind } from '@/lib/market/venues';

/**
 * 연습장 · 레슨장 목록(덕아웃 앱 지도 화면 native/src/dugout/app/venues.tsx, 2026-10-25) — 웹 /venues 와 같은 읽기(loadMapPlaces).
 * 로그인 없이 본다(웹 화면도 공개). ?kind=lesson | 연습장 종류 · ?q= 검색. 종류 목록도 같이 보내 앱이 칩을 그린다.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const raw = (sp.get('kind') ?? '').trim();
  const kind = raw === 'lesson' || isVenueKind(raw) ? raw : undefined;
  const q = (sp.get('q') ?? '').trim().slice(0, 40) || undefined;
  try {
    const places = await loadMapPlaces({ kind, q });
    return NextResponse.json({
      places,
      kinds: [{ key: 'lesson', label: '레슨장' }, ...VENUE_KINDS.map((k) => ({ key: k.key, label: k.label }))],
    });
  } catch (error) {
    console.error('[GET /api/places]', error);
    return NextResponse.json({ error: '장소를 불러오지 못했어요' }, { status: 500 });
  }
}
