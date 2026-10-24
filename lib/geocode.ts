import 'server-only';

/**
 * 주소 → 위도 · 경도(덕아웃 지도, 2026-10-24) — 카카오 로컬 API(주소 검색, 못 찾으면 키워드 검색).
 * 열쇠는 KAKAO_REST_API_KEY(카카오 개발자 콘솔의 REST API 키). 없거나 못 찾으면 null — 저장은 막지 않고 지도에만 안 뜬다.
 * 카카오 약관상 받은 좌표는 카카오 지도 위에 표시하는 데 쓴다(다른 지도에 옮겨 쓰지 않는다).
 */
export type LatLng = { lat: number; lng: number };

const BASE = 'https://dapi.kakao.com/v2/local/search';

async function ask(kind: 'address' | 'keyword', query: string, key: string): Promise<LatLng | null> {
  const res = await fetch(`${BASE}/${kind}.json?size=1&query=${encodeURIComponent(query)}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(4000),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { documents?: { x?: string; y?: string }[] };
  const d = body.documents?.[0];
  const lat = Number(d?.y);
  const lng = Number(d?.x);
  // 한국 안쪽만(대략) — 엉뚱한 결과를 막는다
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 32 || lat > 39.5 || lng < 124 || lng > 132) return null;
  return { lat, lng };
}

export async function geocode(address: string | null | undefined, name?: string): Promise<LatLng | null> {
  const key = process.env.KAKAO_REST_API_KEY;
  const q = address?.trim();
  if (!key || !q) return null;
  try {
    return (await ask('address', q, key)) ?? (await ask('keyword', name ? `${q} ${name}` : q, key));
  } catch {
    return null;
  }
}
