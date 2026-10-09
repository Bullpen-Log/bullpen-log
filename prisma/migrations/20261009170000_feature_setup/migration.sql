-- 가입 · 탭별 첫 설정 · 튜토리얼(2026-10-09, docs/designs/signup-and-tab-onboarding.md — lib/feature-locks.ts).
-- 가입은 이름 · 이메일 · 생년월일 · 성별 · 키 · 몸무게 · 비밀번호 · 소속 · 약관만 받고, 투구 · 트레이닝 · 영양 질문은
-- 그 탭에 처음 들어갈 때 받는다. 그래서 '그 탭의 첫 설정을 마쳤는가'를 계정에 적어 둔다.
--
-- 넷 다 비워 둘 수 있거나 기본값이 있어, 이 칸을 모르는 코드(아직 떠 있는 옛 배포 · 상대방 쪽)가 회원 줄을 만들어도 실패하지 않는다.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "agreedAt" TIMESTAMP(3),
ADD COLUMN     "pitchSetupAt" TIMESTAMP(3),
ADD COLUMN     "trainingSetupAt" TIMESTAMP(3),
ADD COLUMN     "tutorialsDone" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 이미 가입한 계정은 잠그지 않는다 — 옛 가입이 받은 답이 있거나 그 탭의 기록이 있으면 설정을 마친 것으로 본다.
-- 가입한 시각으로 적어 두어 '언제 마쳤나'가 가입 뒤로 어긋나지 않는다. 다시 돌려도 결과가 같다(빈 칸에만).
UPDATE "User" AS u
SET "pitchSetupAt" = u."createdAt"
WHERE u."pitchSetupAt" IS NULL
  AND (
    (u."baselineFreq" IS NOT NULL AND u."throwingHand" IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "PitchLog" p WHERE p."userId" = u."id")
  );

UPDATE "User" AS u
SET "trainingSetupAt" = u."createdAt"
WHERE u."trainingSetupAt" IS NULL
  AND (
    u."trainingLevel" IS NOT NULL
    OR EXISTS (SELECT 1 FROM "TrainingSession" t WHERE t."userId" = u."id")
    OR EXISTS (SELECT 1 FROM "DailyTrainingSetup" d WHERE d."userId" = u."id")
  );
