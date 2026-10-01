import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { getAiClient } from '@/lib/ai/client';
import { BASIC_FOODS } from '@/lib/nutrition/foods';
import { toFood } from '@/lib/nutrition/mfds-parse';
import { findMfdsReps } from '@/lib/nutrition/mfds-reps';
import {
  matchPhotoFoods,
  pickMfdsRep,
  type PhotoCandidate,
} from '@/lib/nutrition/photo-match';

/**
 * 사진 기록(영양 로드맵 7번) — 밥 사진에서 음식과 양을 알아본다(AI). 사진은 저장하지 않는다 — 이 요청 안에서만 쓰고 버린다.
 *
 * 식단 짜기는 AI 를 안 쓰기로 했다(사용자 2026-10-01). 사진은 음식을 '알아보는' 일이라 AI 가 필요하다 — 로드맵을 정할 때부터
 * 'Claude 비전'이었다. 영양 값은 AI 가 아니라 되도록 앱의 기본 음식 · 식약처 값으로 맞춘다(photo-match.ts).
 *
 *   모델   AI_PHOTO_MODEL(없으면 claude-opus-5-5). 사진을 알아보는 일이라 생각을 깊게 할 까닭이 없어 노력은 low —
 *          기다리는 시간(보통 5~15초)이 짧아진다. 혹시 안전 분류기가 거절하면 서버가 다른 모델로 이어 답한다(fallbacks).
 *   상한   한 사람 하루 30번(DailyNutrition.photoCalls) — 한 번에 몇 원이 들어, 누가 반복해 불러도 끝이 있게.
 */

export const PHOTO_MODEL = process.env.AI_PHOTO_MODEL ?? 'claude-opus-5-5';
export const PHOTO_CALLS_PER_DAY = 30;
const TIMEOUT_MS = 45_000;

const PhotoSchema = z.object({
  foods: z.array(
    z.object({
      name: z.string(),
      grams: z.number(),
      kcal: z.number(),
      carbs: z.number(),
      protein: z.number(),
      fat: z.number(),
      confidence: z.enum(['high', 'medium', 'low']),
    })
  ),
  note: z.string(),
});

/* 고정된 지시 — 기본 음식 이름을 늘 같은 차례로 넣어, 같은 이름이면 앱의 값과 맞춰지게 한다 */
const SYSTEM = `너는 한국 야구 선수의 식단 기록을 돕는 영양사다. 사진에 보이는 음식을 하나씩 찾아 적는다.

- 음식마다: 흔히 부르는 한국어 이름, 사진에 보이는 먹을 양의 무게(g, 음료는 mL 를 g 으로), 그 양의 kcal · 탄수화물 · 단백질 · 지방(g), 알아본 확신(high · medium · low).
- 아래 '앱 음식 이름'에 같은 음식이 있으면 그 이름을 그대로 쓴다(값을 맞추는 데 쓴다). 없으면 흔한 이름으로.
- 비빔밥 · 국밥 · 짜장면처럼 한 그릇 요리는 한 음식으로, 밥 · 국 · 반찬이 따로 담겨 있으면 따로 적는다.
- 그릇 · 숟가락 · 젓가락 · 손 크기로 양을 어림한다. 모르겠으면 보통 1인분으로 하고 확신을 낮춘다.
- 음식이 아니거나 알아볼 수 없으면 foods 를 비운다.
- note: 사용자에게 보일 한 줄 — 해요체로 짧게(예: '소스 양은 짐작이에요', '반찬이 겹쳐 있어 양이 덜 정확해요'). 할 말이 없으면 빈 글.

앱 음식 이름: ${BASIC_FOODS.map((f) => f.name).join(', ')}`;

export type PhotoResult =
  | { ok: true; candidates: PhotoCandidate[]; note: string }
  | { ok: false; error: string };

/** 식약처 품목대표에서 그 이름의 음식(서버에만 있는 자료) */
function findMfdsFood(name: string) {
  const rep = pickMfdsRep(name, findMfdsReps(name.split(/[\s(]/)[0] || name));
  return rep ? toFood(rep) : null;
}

export async function recognizeMealPhoto(
  image: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
): Promise<PhotoResult> {
  try {
    const response = await getAiClient().beta.messages.parse(
      {
        model: PHOTO_MODEL,
        max_tokens: 6000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: betaZodOutputFormat(PhotoSchema) },
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: image },
              },
              { type: 'text', text: '이 사진의 음식을 알아봐 주세요.' },
            ],
          },
        ],
      },
      { timeout: TIMEOUT_MS, maxRetries: 1 }
    );
    if (response.stop_reason === 'refusal') {
      return {
        ok: false,
        error: '이 사진은 알아볼 수 없어요. 음식이 잘 보이게 다시 찍어 주세요.',
      };
    }
    if (response.stop_reason === 'max_tokens') {
      return {
        ok: false,
        error: '음식이 너무 많아 다 알아보지 못했어요. 한 끼씩 찍어 주세요.',
      };
    }
    const out = response.parsed_output;
    if (!out)
      return { ok: false, error: '알아본 결과를 읽지 못했어요. 다시 해 주세요.' };
    return {
      ok: true,
      candidates: matchPhotoFoods(out.foods, findMfdsFood),
      note: out.note.trim().slice(0, 120),
    };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return {
        ok: false,
        error: '지금 사진을 알아보는 사람이 많아요. 잠시 뒤에 다시 해 주세요.',
      };
    }
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      return { ok: false, error: '알아보는 데 너무 오래 걸렸어요. 다시 해 주세요.' };
    }
    if (error instanceof Anthropic.BadRequestError) {
      return { ok: false, error: '이 사진은 보낼 수 없어요. 다른 사진으로 해 주세요.' };
    }
    if (error instanceof Anthropic.APIError) {
      return {
        ok: false,
        error: '사진을 알아보지 못했어요. 잠시 뒤에 다시 해 주세요.',
      };
    }
    return { ok: false, error: '사진을 알아보지 못했어요. 다시 해 주세요.' };
  }
}
