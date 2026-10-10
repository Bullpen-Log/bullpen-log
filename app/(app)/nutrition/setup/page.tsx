import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import { toDietPrefs } from '@/lib/nutrition/diet-prefs';
import { recentWeightKg, toProfile } from '@/lib/nutrition/load';
import {
  EMPTY_ANSWERS,
  answersOfProfile,
} from '@/lib/nutrition/onboarding-answers';
import { ageOn } from '@/lib/nutrition/targets';
import { isSex } from '@/lib/profile';
import { SetupWizard } from './setup-wizard';

/**
 * 영양 첫 설정 — 처음 가입한 사람은 영양 탭이 잠겨 있어 여기로 온다(lib/feature-locks.ts, 2026-10-09). 키 · 체중 →
 * 목표 카드 → … → 추천 계획을 한 화면에 한 질문씩 답하고 한 트랜잭션으로 저장한다(app/actions/nutrition.ts
 * finishNutritionSetup). 저장하면 탭이 열리고, 탭 페이지가 사용법 튜토리얼을 한 번 보인다.
 *
 * 줄(NutritionProfile)이 없으면 빈 답으로 연다 — toProfile(null) 의 기본값(유지 · 보통 · 혼합식)으로 채우면 목표 카드와
 * 식단 화면이 미리 골라져 첫 질문을 건너뛰게 된다. 줄은 있는데 온보딩을 안 끝낸 옛 계정(영양 탭의 배너가 보낸다)은
 * 정해 둔 목표 · 취향으로 채워 연다. 이 화면 자체는 잠금에 걸리지 않는다(isSetupPath).
 */
export default async function NutritionSetupPage() {
  const user = await requireUser();
  const today = toDateKey(new Date());
  const [row, recent] = await Promise.all([
    prisma.nutritionProfile.findUnique({ where: { userId: user.id } }),
    recentWeightKg(user.id, today),
  ]);
  const age = ageOn(user.birthDate, today);
  const initial =
    row === null
      ? EMPTY_ANSWERS
      : answersOfProfile(toProfile(row), toDietPrefs(row), age);
  return (
    <SetupWizard
      today={today}
      name={user.nickname}
      age={age}
      sex={isSex(user.sex) ? user.sex : null}
      heightCm={user.heightCm}
      weightKg={recent ?? user.weightKg}
      /* 경기 수준은 2026-10-10 에 묻지 않기로 했다 — 평소 움직임은 기본값에서 사용자가 고른다 */
      level={null}
      hasProfile={row !== null}
      initial={initial}
    />
  );
}
