import { getCurrentUser } from '@/lib/dal';
import { handleImport, type ApiViewer } from '@/lib/review-evidence/api';
import { evidenceDeps } from '@/lib/review-evidence/storage';

/**
 * 검수 근거자료 과거 가져오기(EX-REF04) — 대표관리자만, 로그인한 그 계정으로만 보낸다(익명 · 기계 열쇠 길 없음).
 * 한 묶음(최대 150줄)이 기록 하나가 된다. 묶음마다 요청 번호가 정해져 있어(가져오기 기준 · 묶음 번호) 다시 보내도 겹치지 않는다.
 * 과거 기록의 쓴 사람은 '과거 기록(금윤호 · 김민)'으로만 적힌다 — 지금 로그인한 사람의 쓰임과 섞이지 않는다.
 */

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let viewer: ApiViewer;
  try {
    viewer = await getCurrentUser();
  } catch {
    viewer = 'gate-error';
  }
  return handleImport(req, viewer, evidenceDeps());
}
