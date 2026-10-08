import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import { toDietPrefs } from '@/lib/nutrition/diet-prefs';
import { recentWeightKg, toProfile } from '@/lib/nutrition/load';
import { answersOfProfile, levelOf } from '@/lib/nutrition/onboarding-answers';
import { ageOn } from '@/lib/nutrition/targets';
import { isSex } from '@/lib/profile';
import { SetupWizard } from './setup-wizard';

/**
 * 기존 사용자 온보딩 — 가입 때 영양 답이 없던 계정(옛 계정 · 배포 전 가입)이 가입 마법사와 같은 질문(키 · 체중 → 목표 카드 →
 * … → 추천 계획)을 한 번에 답하고 한 트랜잭션으로 저장한다(app/actions/nutrition.ts finishNutritionSetup).
 * 영양 탭의 배너가 여기로 보낸다. 이미 정한 목표가 있으면 그 값으로 채워 연다.
 */
export default async function NutritionSetupPage() {
  const user = await requireUser();
  const today = toDateKey(new Date());
  const [row, recent] = await Promise.all([
    prisma.nutritionProfile.findUnique({ where: { userId: user.id } }),
    recentWeightKg(user.id, today),
  ]);
  const profile = toProfile(row);
  const prefs = toDietPrefs(row);
  const age = ageOn(user.birthDate, today);
  return (
    <SetupWizard
      today={today}
      name={user.nickname}
      age={age}
      sex={isSex(user.sex) ? user.sex : null}
      heightCm={user.heightCm}
      weightKg={recent ?? user.weightKg}
      level={levelOf(user.competitionLevel)}
      hasProfile={row !== null}
      initial={answersOfProfile(profile, prefs, age)}
    />
  );
}
