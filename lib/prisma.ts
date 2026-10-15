import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/*
 * 시험 계정(User.simDate)의 '지금'은 시뮬레이션 날짜다(lib/clock-server.ts). 그런데 DB 가 채우는 시각(@default(now()) · @updatedAt)은
 * 실제 시각이라, 둘을 견주는 곳이 어긋났다 — 운동 시간(시작 시각 ↔ 세트 시각), 쉬는 시계, 2분 안 같은 기록 막기 같은 것
 * (2026-10-12 점검). 그 계정의 요청일 때만 만들거나 고칠 때 비어 있는 시각 칸을 시뮬레이션 지금으로 채운다. 다른 계정은
 * 그대로(__bpNow 가 실제 시각을 돌려주면 손대지 않는다). 안에 끼워 만드는(nested) 줄은 채우지 않는다 — 드물고 견주는 곳이 없다.
 */
const TIME_FIELDS: Record<string, string[]> = {
  calendarEvent: ['createdAt', 'updatedAt'],
  dailyArmcare: ['createdAt', 'updatedAt'],
  dailyCheckin: ['createdAt', 'updatedAt'],
  dailyNutrition: ['createdAt', 'updatedAt'],
  dailyTrainingNote: ['createdAt', 'updatedAt'],
  dailyTrainingSetup: ['createdAt', 'updatedAt'],
  mealCombo: ['createdAt', 'updatedAt'],
  mealEntry: ['createdAt', 'updatedAt'],
  mealPlan: ['createdAt', 'updatedAt'],
  mechanicsProgram: ['startedAt', 'updatedAt'],
  nutritionProfile: ['createdAt', 'updatedAt'],
  pitchLog: ['createdAt'],
  poseAnalysis: ['createdAt', 'updatedAt'],
  shootCheck: ['checkedAt', 'createdAt', 'updatedAt'],
  trainingSession: ['startedAt', 'createdAt', 'updatedAt'],
  user: ['createdAt'],
  userArmcareRoutine: ['createdAt', 'updatedAt'],
  userDrillFavorite: ['createdAt'],
  userExerciseFavorite: ['createdAt'],
  userExerciseNote: ['createdAt', 'updatedAt'],
  userExerciseSet: ['recordedAt'],
  userFood: ['createdAt', 'updatedAt'],
  userRehabProgram: ['startedAt', 'createdAt', 'updatedAt'],
  userRehabSession: ['createdAt'],
  userRehabWeekly: ['createdAt'],
  userTrainingProgram: ['startedAt', 'createdAt', 'updatedAt'],
  velocityAttempt: ['createdAt'],
  velocityCalibRun: ['createdAt'],
  velocityPitch: ['createdAt'],
  velocityRecording: ['createdAt', 'updatedAt'],
  velocityRecordingCut: ['createdAt', 'updatedAt'],
  velocityRecordingPart: ['createdAt'],
  velocitySession: ['createdAt'],
};

/*
 * 조회마다 걸린 시간을 서버 창에 찍는다 — PRISMA_TIMING=1 일 때만(scripts/tab-timing.mjs 와 같이, 2026-10-15 탭 전환 속도 재기).
 */
const TIMING = process.env.PRISMA_TIMING === '1';

function simNow(): Date | null {
  const f = (globalThis as { __bpNow?: () => number }).__bpNow;
  if (typeof window !== 'undefined' || !f) return null;
  const t = f();
  return Math.abs(t - Date.now()) < 60_000 ? null : new Date(t);
}

function fill(model: string, data: unknown, now: Date, onlyUpdated: boolean) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  const row = data as Record<string, unknown>;
  for (const f of TIME_FIELDS[model] ?? []) {
    if (onlyUpdated && f !== 'updatedAt') continue;
    if (row[f] === undefined) row[f] = now;
  }
}

function withSimTime(base: PrismaClient): PrismaClient {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const now = simNow();
          const key = model[0].toLowerCase() + model.slice(1);
          if (now && TIME_FIELDS[key]) {
            const a = args as { data?: unknown; create?: unknown; update?: unknown };
            if (operation === 'create') fill(key, a.data, now, false);
            if (operation === 'createMany' || operation === 'createManyAndReturn')
              for (const d of Array.isArray(a.data) ? a.data : [a.data]) fill(key, d, now, false);
            if (operation === 'update' || operation === 'updateMany') fill(key, a.data, now, true);
            if (operation === 'upsert') {
              fill(key, a.create, now, false);
              fill(key, a.update, now, true);
            }
          }
          if (!TIMING) return query(args);
          const t0 = performance.now();
          try {
            return await query(args);
          } finally {
            console.log(`[db] ${model}.${operation} ${Math.round(performance.now() - t0)} ms`);
          }
        },
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? withSimTime(new PrismaClient({ adapter }));

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
