import 'server-only';
import type { AccountType, Role } from '@prisma/client';
import { requestCache as cache } from '@/lib/request-cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { readSession, passwordFingerprint } from '@/lib/session';
import { ensureSim } from '@/lib/clock-server';
import { can, type Permission } from '@/lib/permissions';

/**
 * 현재 로그인한 사용자를 반환한다. 로그인하지 않았으면 null.
 * 한 요청 안에서 여러 번 호출해도 DB는 한 번만 조회한다.
 */
export const getCurrentUser = cache(async () => {
  const session = await readSession();
  if (!session) return null;

  /*
   * 시험 계정 날짜(ensureSim — 30초에 한 번 DB)와 사용자 조회를 같이 돌린다. 예전엔 날짜를 다 읽은 뒤에 사용자를 읽어, 30초 지난
   * 첫 요청(사용자가 적을 때는 거의 모든 요청)마다 화면 그리기 전에 왕복이 하나 더 쌓였다(2026-10-15 탭 전환 속도). 둘 다 끝난 뒤에
   * 돌려주므로 이 사용자로 그리는 화면은 예전처럼 새 날짜를 본다.
   */
  const [, user] = await Promise.all([
    ensureSim(),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        nickname: true,
        /* 막대와 상단 바의 아바타에 쓴다. 이름 옆에 늘 붙는 값이라 함께 읽는다. */
        avatarPath: true,
        role: true,
        /* 선수 · 마스터(팀 · 레슨장 관리) — (app) 틀이 마스터를 /manage 로 보내고, requireMaster 가 선수를 막는다 */
        accountType: true,
        birthDate: true,
        /* 내 정보에서 고치고, 영양 목표의 기초대사량 계산이 읽는다 */
        sex: true,
        heightCm: true,
        weightKg: true,
        wingspanCm: true,
        targetVelocity: true,
        baselineFreq: true,
        baselineVolume: true,
        baselineIntensity: true,
        baselineMix: true,
        baselineWorkoutFreq: true,
        throwingHand: true,
        competitionLevel: true,
        dailyWorkoutMinutes: true,
        ownedEquipment: true,
        trainingLevel: true,
        trainingGoal: true,
        trainingFocus: true,
        /*
         * 탭 잠금 · 튜토리얼(lib/feature-locks.ts) — 막대 · 홈 · 각 탭이 매 요청마다 보므로 여기서 한 번에 읽는다.
         * 영양은 NutritionProfile 줄의 유무로 가른다(가입에서는 더 이상 만들지 않는다).
         */
        pitchSetupAt: true,
        trainingSetupAt: true,
        tutorialsDone: true,
        nutritionProfile: { select: { onboardedAt: true } },
        /* 개편 전에 가입한 계정은 영양을 잠그지 않는다(lib/feature-locks.ts NUTRITION_LOCK_SINCE) */
        createdAt: true,
        /* 표의 비밀번호 지문과 견주는 데만 쓴다 — 돌려주지 않는다(아래) */
        password: true,
      },
    }),
  ]);
  if (!user) return null;

  const { password, ...rest } = user;
  /*
   * 비밀번호를 바꾸면 그 전에 받은 표(다른 기기의 로그인)는 끝난다 — 지문이 다르다. 지문이 없는 옛 표는 기한까지
   * 통한다(lib/jwt.ts SessionPayload.pw).
   */
  if (session.pw && session.pw !== passwordFingerprint(password)) return null;
  return rest;
});

/** 로그인이 필요한 페이지에서 사용. 비로그인 시 /login으로 보낸다. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    /*
     * 토큰은 멀쩡한데 회원이 없는 경우가 있다 — 관리자가 계정을 삭제했는데
     * 그 사람 브라우저에 로그인 쿠키가 남아 있을 때.
     *
     * 이때 쿠키를 그대로 둔 채 /login 으로 보내면, 로그인 화면이 토큰만 보고
     * 다시 /today 로 돌려보내 무한 리다이렉트가 된다. 페이지를 그리는 중에는
     * 쿠키를 지울 수 없으므로, 쿠키를 지워주는 경로를 한 번 거쳐서 나간다.
     */
    const session = await readSession();
    redirect(session ? '/api/session/clear' : '/login');
  }
  return user;
}

/** 대표관리자 전용 동작에서 사용(2026-10-20 준관리자가 생긴 뒤에도 ADMIN 만). */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'ADMIN') redirect('/today');
  return user;
}

/** 이 기능을 쓸 수 있는 관리자(대표 · 준)만 — 표는 lib/permissions.ts. 못 쓰면 오늘 화면으로 */
export async function requirePermission(perm: Permission) {
  const user = await requireUser();
  if (!can(user.role, perm)) redirect('/today');
  return user;
}

/** 팀 · 레슨장 마스터 화면(app/(master))에 들어갈 수 있는 사람 — 마스터 계정과 관리자. 선수 계정은 제 홈으로 */
export function isMasterUser(user: { role: Role; accountType: AccountType }): boolean {
  return user.role === 'ADMIN' || user.accountType === 'MASTER';
}

/**
 * 마스터 화면 · 마스터 동작(app/actions/org.ts)에서 사용. 선수 계정은 /today 로 — 이 앱에는 미들웨어가 없어 (master) 틀과 동작마다
 * 이것이 유일한 방어선이다(2026-10-20 사용자: "일반 선수 사용자는 절대 이 페이지를 들어갈 수가 없어야 돼").
 */
export async function requireMaster() {
  const user = await requireUser();
  if (!isMasterUser(user)) redirect('/today');
  return user;
}
