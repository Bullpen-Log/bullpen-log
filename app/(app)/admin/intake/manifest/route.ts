import type { PrismaClient } from '@prisma/client';
import { requirePermission } from '@/lib/dal';
import { buildIntakeManifest } from '@/lib/intake/admin';
import { isIntakeError } from '@/lib/intake/errors';
import { isIntakeId } from '@/lib/intake/paths';
import { prisma } from '@/lib/prisma';
import { allowAdmin } from '@/lib/release-gate';

/**
 * 원본 짝 매니페스트 내려받기(INTAKE-MAIN/R03 B) — 대표관리자만. JSON 파일 하나다.
 * 원본 바이트 · PIN · 초대 링크 · 서명 주소 · 저장소 경로는 들어 있지 않다(lib/intake/admin.ts buildIntakeManifest). ?submission=<번호> 를 주면 그 접수만.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  allowAdmin('intake');
  const user = await requirePermission('intake');
  const one = new URL(req.url).searchParams.get('submission');
  try {
    const manifest = await buildIntakeManifest(prisma as unknown as PrismaClient, { id: user.id, role: user.role }, one && isIntakeId(one) ? { submissionIds: [one] } : {});
    const day = manifest.generatedAt.slice(0, 10);
    return new Response(JSON.stringify(manifest, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="intake-manifest-${day}${one ? `-${one.slice(0, 8)}` : ''}.json"`,
        'Cache-Control': 'no-store, max-age=0',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch (e) {
    if (isIntakeError(e)) return Response.json({ error: { code: e.code, message: e.message } }, { status: e.httpStatus, headers: { 'Cache-Control': 'no-store' } });
    throw e;
  }
}
