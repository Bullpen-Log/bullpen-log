import { handlePublicResultRequest } from '@/lib/intake/publication';

/**
 * 공개 결과 — 초대 토큰(Authorization: Intake …)으로 자기 접수의 지금 공개 판만 받는다. 접근 코드는 본문으로 받는다.
 * POST 만 받는다. 링크 미리보기의 GET 은 여기까지 오지 않는다. 몸체는 lib/intake/publication.ts handlePublicResultRequest.
 */
export const dynamic = 'force-dynamic';

export function POST(req: Request) {
  return handlePublicResultRequest(req);
}
