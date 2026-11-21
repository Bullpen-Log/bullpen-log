import { getCurrentUser } from '@/lib/dal';
import { instagramReviewClip, mechanicsReferenceClipPath, splitInstagramReference } from '@/lib/mechanics/reference-draft';
import { can } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { videoBucket } from '@/lib/storage';

const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };

export async function GET(request: Request) {
  const viewer = await getCurrentUser();
  if (!can(viewer?.role, 'shoot')) {
    return Response.json({ error: '관리자만 참고 클립을 볼 수 있어요.' }, { status: viewer ? 403 : 401, headers });
  }
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const path = mechanicsReferenceClipPath(id);
  const item = path ? await prisma.mechanicsGuide.findUnique({
    where: { id },
    select: { description: true, hiddenAt: true },
  }) : null;
  if (!path || !item || item.hiddenAt || (!instagramReviewClip(id) && !splitInstagramReference(item.description).segment?.recorded)) {
    return Response.json({ error: '참고 클립을 찾을 수 없어요.' }, { status: 404, headers });
  }
  const { data, error } = await videoBucket().createSignedUrl(path, 600);
  if (!data || error) {
    return Response.json({ error: '참고 클립을 열 수 없어요.' }, { status: 502, headers });
  }
  return new Response(null, { status: 302, headers: { ...headers, Location: data.signedUrl } });
}
