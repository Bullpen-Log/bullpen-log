import { getCurrentUser } from '@/lib/dal';
import { handleList, handleRegister, type ApiViewer } from '@/lib/review-evidence/api';
import { evidenceDeps } from '@/lib/review-evidence/storage';

/**
 * 검수 근거자료(EX-REF04) API — 대표관리자만. 로그인 안 함 401 · 일반 · 준관리자(출시 전 베타에 막힌 사람 포함) 403 — 저장소를 묻기 전에.
 * GET  : 목록(등록 도구의 확인 · 빠진 등록 찾기용). ?view=summary 면 숫자만.
 * POST : 실제로 쓴 출처 하나 + 쓰임 하나를 등록. 같은 요청 번호 · 같은 내용은 몇 번 보내도 한 번만 저장된다.
 * 순서는 lib/review-evidence/api.ts, 저장 규칙은 store.ts, 요청 검사는 http.ts. 응답은 늘 저장 금지.
 */

export const dynamic = 'force-dynamic';

async function viewer(): Promise<ApiViewer> {
  try {
    return await getCurrentUser();
  } catch {
    return 'gate-error';
  }
}

export async function GET(req: Request) {
  return handleList(req, await viewer(), evidenceDeps());
}

export async function POST(req: Request) {
  return handleRegister(req, await viewer(), evidenceDeps());
}
