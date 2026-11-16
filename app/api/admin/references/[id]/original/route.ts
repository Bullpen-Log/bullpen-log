import { getCurrentUser } from '@/lib/dal';
import { serveReferenceOriginal } from '@/lib/admin-references/storage';

/**
 * 참고자료 원본 보기(EX-REF02) — 대표관리자만. 주소는 자료 번호 하나뿐이고 저장소 열쇠 · 서명 주소는 받지도 내보내지도 않는다.
 * 순서 · 조건 · Range 는 lib/admin-references/original.ts. 응답은 늘 저장 금지(no-store).
 * 로그인 안 함 401 · 일반 · 준관리자 403(출시 전 베타에 막힌 사람도 403) — 원본 저장소를 묻기 전에.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let viewer: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    viewer = await getCurrentUser();
  } catch {
    return new Response('열 수 없는 자료예요.', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  const { id } = await params;
  return serveReferenceOriginal(viewer, id, req.headers.get('range'), req.signal);
}
