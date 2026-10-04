import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { cleanBarcode } from '@/lib/nutrition/barcode';
import { lookupBarcode } from '@/lib/nutrition/barcode-lookup';

/**
 * 바코드로 음식 찾기(영양 로드맵 8번) — GET ?code=8801043014809.
 * 서버 동작이 아니라 경로로 둔 까닭: 카메라가 읽는 대로 여러 번 물을 수 있고, 창이 닫히면 브라우저가 물음을 끊는다(AbortController).
 * 그 사람이 적어 둔 바코드 음식도 섞여 나오므로 브라우저 캐시는 쓰지 않는다.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { ok: false, error: '로그인이 필요해요.' },
      { status: 401 }
    );
  const code = cleanBarcode(req.nextUrl.searchParams.get('code'));
  if (!code)
    return NextResponse.json(
      {
        ok: false,
        error: '바코드 숫자가 맞지 않아요. 밑의 숫자를 다시 확인해 주세요.',
      },
      { status: 400 }
    );
  const result = await lookupBarcode(user.id, code);
  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
