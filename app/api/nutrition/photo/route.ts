import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { isAiFeatureOn } from '@/lib/ai/features';
import { toDateKey } from '@/lib/pitch-stats';
import { dbDate } from '@/lib/nutrition/days';
import { prisma } from '@/lib/prisma';
import { PHOTO_CALLS_PER_DAY, recognizeMealPhoto } from '@/lib/nutrition/photo';

/**
 * 사진 기록 — 음식 창의 [사진으로 담기]가 줄인 사진(JPEG, 긴 변 1280px)을 보낸다(lib/nutrition/photo.ts).
 *
 *   보낸 것  { image: base64(머리 없이), mediaType }
 *   받는 것  { ok, candidates, note, left } 또는 { ok: false, error }
 *
 * 사진은 저장하지 않는다. 로그인한 사람만, 하루 30번까지(부르기 전에 센다 — 실패해도 AI 비용은 나갈 수 있다).
 * 서버 동작이 아니라 경로로 둔 까닭: 서버 동작은 몸통이 1MB 를 넘으면 막힌다(사진 base64 는 0.3~0.8MB).
 */
export const maxDuration = 60;

const TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/* base64 글자 수 상한 — 4MB 사진(1280px 로 줄였으면 1MB 안팎)까지 */
const MAX_BASE64 = 5_500_000;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { ok: false, error: '로그인이 필요합니다.' },
      { status: 401 }
    );
  /* 키가 없거나 잠시 멈춤(lib/ai/features.ts — AI 비용을 정하기 전까지) */
  if (!isAiFeatureOn('nutritionPhoto')) {
    return NextResponse.json(
      { ok: false, error: '사진 기록은 아직 준비 중이에요.' },
      { status: 503 }
    );
  }

  let body: { image?: unknown; mediaType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: '사진을 받지 못했어요.' },
      { status: 400 }
    );
  }
  const image = typeof body.image === 'string' ? body.image : '';
  const mediaType = TYPES.find((t) => t === body.mediaType);
  if (
    !image ||
    !mediaType ||
    image.length > MAX_BASE64 ||
    !/^[A-Za-z0-9+/=]+$/.test(image)
  ) {
    return NextResponse.json(
      { ok: false, error: '이 사진은 보낼 수 없어요.' },
      { status: 400 }
    );
  }

  /* 하루 상한 — 오늘 줄의 횟수를 보고, 남았으면 하나 올린 뒤 부른다 */
  const where = {
    userId_date: { userId: user.id, date: dbDate(toDateKey(new Date())) },
  };
  const today = await prisma.dailyNutrition.findUnique({
    where,
    select: { photoCalls: true },
  });
  const used = today?.photoCalls ?? 0;
  if (used >= PHOTO_CALLS_PER_DAY) {
    return NextResponse.json(
      {
        ok: false,
        error: `사진 기록은 하루 ${PHOTO_CALLS_PER_DAY}번까지예요. 내일 다시 쓸 수 있어요.`,
      },
      { status: 429 }
    );
  }
  await prisma.dailyNutrition.upsert({
    where,
    update: { photoCalls: { increment: 1 } },
    create: { userId: user.id, date: where.userId_date.date, photoCalls: 1 },
  });

  const result = await recognizeMealPhoto(image, mediaType);
  const left = Math.max(0, PHOTO_CALLS_PER_DAY - used - 1);
  return NextResponse.json(result.ok ? { ...result, left } : result, {
    status: result.ok ? 200 : 502,
  });
}
