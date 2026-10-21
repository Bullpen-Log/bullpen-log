import 'server-only';

import { appNow } from '@/lib/clock';
import { prisma } from '@/lib/prisma';
import { favoriteDrillIds } from '@/lib/favorites';
import { allGuides, trainingGuides } from '@/lib/library-cache';
import { createPlaybackUrls } from '@/lib/storage';
import { loadLatestReport } from '@/lib/pitch-lab';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { ageFromBirthDate } from '@/lib/profile';
import { equipmentForToday } from '@/lib/report/equipment';
import { groupDrills, type MechanicsDrillView, type MechanicsVariant } from '@/lib/mechanics/drills';
import { MECHANICS_PAIN_WINDOW_DAYS, mechanicsFoldOf } from '@/lib/mechanics/fold';
import {
  buildProgramSession,
  canUseVariant,
  drillThrowNote,
  focusView,
  levelAdvice,
  readProgramState,
  type DrillThrowNote,
  type FilmNote,
  type FocusView,
  type ProgramState,
  type MechanicsPainFold,
  type SessionItem,
} from '@/lib/mechanics/program';
import { levelSession, SESSIONS_PER_LEVEL, type LevelKey } from '@/lib/mechanics/levels';

/** 도구 하나 + 가진 장비로 할 수 있나(장비를 안 고른 사람은 늘 true) */
export type PlayerVariant = MechanicsVariant & { owned: boolean };

/** 따라 하기에서 바꿔 할 수 있는 동작 하나 — 그 동작의 도구들과 처음 고를 도구 */
export type SessionAlternative = { title: string; guideId: string; variants: PlayerVariant[] };

/**
 * 세션의 드릴 한 줄 + 영상 정보(고른 도구의 것).
 * alternatives: 맨 앞이 이 드릴, 뒤가 같은 요소 · 같은 단계의 다른 동작(SessionItem.swaps) — 따라 하기의 '다른 드릴' · 도구 칩
 */
export type SessionDrillView = SessionItem & {
  variant: MechanicsVariant;
  alternatives: SessionAlternative[];
};

export type MechanicsProgramView = {
  /** 고른 수준 — 안 골랐으면 null(수준 고르기 화면) */
  level: LevelKey | null;
  /** 이 수준에서 마친 세션 수(0~12) */
  index: number;
  /** 다음 세션의 주차 · 그 주의 몇 번째 — 12번을 다 마쳤으면 null */
  week: number | null;
  day: number | null;
  /** 한 수준의 세션 수(12) */
  total: number;
  /** 수준과 상관없이 지금까지 마친 세션 수 — 영상 찍기 알림(filmPrompt)이 쓴다 */
  sessionsDone: number;
  /** 오늘 세션을 하나라도 마쳤나 */
  finishedToday: boolean;
  /** 다음 · 아래 수준 권하기(levelAdvice) */
  advice: ReturnType<typeof levelAdvice>;
  /** 찍어서 처음과 견준 결과 — 세션 번호 순(프로그램 칸의 '견준 기록') */
  films: FilmNote[];
  /** 3D 리포트 처방(진행 중 · 마침) — 없으면 null. 진행 중이면 수준 12세션을 마친 뒤에도 세션이 있다 */
  focus: FocusView | null;
};

/**
 * 접기 판정의 재료(lib/mechanics/fold.ts mechanicsFoldOf, 2판 P6 검토) — 최근 7일 체크인의 다섯 부위 · 던지는 일정(오늘 통증 D5 · 최근 통증인데
 * 오늘 체크인 없음 · 오늘 · 어제 등판 답)과 오늘 투구 기록(경기 · 세게 던진 날). 오늘 상태 한 장(facts 45일)을 모으면 화면이 무거워져 이 둘만
 * 읽는다 — 판정은 중재(lib/engine/arbiter.ts)와 같은 규칙 · 같은 차례(자체 시험이 견준다).
 */
function foldInputs(userId: string, todayKey: string) {
  const from = dbDate(shiftDateKey(todayKey, -(MECHANICS_PAIN_WINDOW_DAYS - 1)));
  return Promise.all([
    prisma.dailyCheckin.findMany({
      where: { userId, date: { gte: from, lte: dbDate(todayKey) } },
      select: {
        date: true,
        shoulder: true,
        elbow: true,
        wrist: true,
        lowerBack: true,
        lowerBody: true,
        throwPlan: true,
      },
    }),
    prisma.pitchLog.findMany({
      where: { userId, date: dbDate(todayKey) },
      select: { sessionType: true, pitchCount: true, intensity: true, effortPct: true },
    }),
  ]);
}

/**
 * 프로그램 칸 · 따라 하기가 읽는 것 — 내 프로그램과 오늘의 세션, 오늘 이미 한 드릴(2026-10-04).
 * 프로그램이 없으면 program 이 null 이고 세션도 비어 있다.
 *
 * painFold(2판 P6-5, 사용자 결정 D5 · 2판 P6 검토): 팔에 싣는 드릴을 접는 날 — 오늘 팔을 다 썼거나(등판 · 경기 기록 · 세게 던진 날, 못 펼침),
 * 최근 통증인데 오늘 체크인이 없거나(못 펼침), 오늘 어깨 · 팔꿈치가 '통증'(성인은 펼쳐 '그래도 하기'). 판정은 lib/mechanics/fold.ts mechanicsFoldOf
 * 하나 — 최근 7일 체크인과 오늘 투구 기록만 더 읽는다(오늘 상태 한 장 lib/engine/day-state.ts 를 만들면 facts 전체를 모아 화면이 무거워진다).
 * 같은 규칙 · 같은 차례라 중재와 답이 같다(자체 시험). session 은 접기 전 그대로 — 화면 · 따라 하기가 접는다.
 */
export async function loadMechanicsProgram(userId: string): Promise<{
  program: MechanicsProgramView | null;
  session: SessionDrillView[];
  /** 오늘 '했다'로 남은 드릴 id — 따라 하기를 이어서 할 때 건너뛴다 */
  doneToday: string[];
  /** 오늘 팔에 싣는 드릴을 접는가(까닭 · 펼칠 수 있나 포함) — 아니면 null */
  painFold: MechanicsPainFold | null;
  /** 오늘 드릴로 던진 공을 투구 기록에 남기라는 알림 — 없으면 null(drillThrowNote) */
  throwNote: DrillThrowNote | null;
}> {
  const now = appNow();
  const todayKey = toDateKey(now);
  /*
   * 접기 판정의 재료 — 아래 조회와 나란히 읽는다. 아래가 먼저 던지면 이 약속을 안 기다리게 되니, 처리 안 된 거절로 남지 않게 빈 catch 를 단다
   * (기다릴 때는 그대로 던진다).
   */
  const foldRead = foldInputs(userId, todayKey);
  foldRead.catch(() => {});
  const [row, guides, favorites, logs, user, setup] = await Promise.all([
    prisma.mechanicsProgram.findUnique({ where: { userId } }),
    trainingGuides(),
    favoriteDrillIds(userId),
    prisma.userDrillLog.findMany({
      where: { userId, date: dbDate(todayKey), done: true },
      select: { guideId: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      /* 생년월일 — 성장기(만 16세 미만)의 통증 날은 못 펼친다(lib/mechanics/fold.ts) */
      select: { ownedEquipment: true, birthDate: true },
    }),
    /* 트레이닝처럼 오늘 쓸 수 있는 장비(오늘 안 골랐으면 가진 것 전부) */
    prisma.dailyTrainingSetup.findUnique({
      where: { userId_date: { userId, date: dbDate(todayKey) } },
      select: { availableEquipment: true },
    }),
  ]);
  const [checkins, pitchesToday] = await foldRead;
  if (!row) return { program: null, session: [], doneToday: [], painFold: null, throwNote: null };

  const ownThumbs = await createPlaybackUrls(
    guides.filter((g) => !g.referenceVideoId && g.thumbPath).map((g) => g.thumbPath as string)
  );
  const drills = groupDrills(guides, favorites, ownThumbs);
  const state = readProgramState(row.progress);
  const plan = state.level ? levelSession(state.level, state.index) : null;
  const program: MechanicsProgramView = {
    level: state.level,
    index: state.index,
    week: plan?.week ?? null,
    day: plan?.day ?? null,
    total: SESSIONS_PER_LEVEL,
    sessionsDone: row.sessionsDone,
    finishedToday: row.lastSessionOn ? keyOfDbDate(row.lastSessionOn) === todayKey : false,
    advice: levelAdvice(state),
    films: state.films,
    focus: state.focus ? focusView(state.focus) : null,
  };
  const gear = equipmentForToday(user?.ownedEquipment ?? [], setup?.availableEquipment);
  const owned = gear.length > 0 ? new Set(gear) : null;
  const variants = new Map(drills.flatMap((d) => d.variants.map((v) => [v.id, v] as const)));
  const byTitle = new Map(drills.map((d) => [d.title, d] as const));
  const toAlternative = (d: MechanicsDrillView, guideId: string): SessionAlternative => ({
    title: d.title,
    guideId,
    variants: d.variants.map((v) => ({ ...v, owned: canUseVariant(v, owned) })),
  });
  const items = buildProgramSession({ drills, state, owned });
  const session = items.flatMap((item): SessionDrillView[] => {
    const variant = variants.get(item.guideId);
    const drill = byTitle.get(item.title);
    if (!variant || !drill) return [];
    const alternatives = [
      toAlternative(drill, item.guideId),
      ...item.swaps.flatMap((w) => {
        const d = byTitle.get(w.title);
        return d ? [toAlternative(d, w.guideId)] : [];
      }),
    ];
    return [{ ...item, variant, alternatives }];
  });

  /* 따라 하기에서 도구나 드릴을 바꿔 했어도 그 자리는 한 것으로 — 화면들은 item.guideId 로 본다 */
  const done = new Set(logs.map((l) => l.guideId));
  const doneToday = [...done];
  for (const item of session) {
    const ids = item.alternatives.flatMap((a) => a.variants.map((v) => v.id));
    if (!done.has(item.guideId) && ids.some((id) => done.has(id))) doneToday.push(item.guideId);
  }
  const guideById = new Map(guides.map((g) => [g.id, g] as const));
  return {
    program,
    session,
    doneToday,
    throwNote: drillThrowNote({
      throwLog: state.throwLog,
      todayKey,
      doneToday: [...done].flatMap((id) => {
        const g = guideById.get(id);
        return g ? [{ category: g.category, stage: g.stage }] : [];
      }),
      pitchedToday: pitchesToday.reduce((sum, p) => sum + p.pitchCount, 0),
    }),
    painFold: mechanicsFoldOf({
      todayKey,
      checkins: checkins.map((c) => ({ ...c, date: keyOfDbDate(c.date) })),
      logsToday: pitchesToday,
      age: user?.birthDate ? ageFromBirthDate(user.birthDate, now) : null,
    }),
  };
}

/** 요소별 드릴 칸이 보이는 내 처방 — 요소 칩의 점 · 요소 카드 맨 위 한 줄과 처방 드릴(docs/designs/pitch-3d-report.md 6-4절) */
export type ElementReportView = {
  element: string;
  level: 'improve' | 'edge';
  target: { label: string; now: string; goal: string } | null;
  /** 처방 드릴 — 단계 차례(주차 차례), 겹치지 않게. 처방 없이 리포트만 받았으면 빈 배열 */
  titles: { title: string; stage: string }[];
  /** 처방 없이 리포트만 받았을 때 그 리포트(샘플) 번호 — 카드가 '리포트에서 처방 시작'으로 잇는다 */
  reportId?: string;
};

/**
 * 진행 중 · 마친 처방의 요소들 — 처방(progress.focus)이 있으면 베낀 처방만 본다. 없으면 마지막 리포트 요약(3D 세션 loadLatestReport)의
 * 경계 이상 요소로 점만 찍는다(드릴 없음). 둘 다 없으면 null.
 */
export async function loadElementReport(userId: string): Promise<ElementReportView[] | null> {
  const row = await prisma.mechanicsProgram.findUnique({ where: { userId }, select: { progress: true } });
  const focus = row ? readProgramState(row.progress).focus : null;
  if (!focus) {
    // ponytail: 샘플마다 저장소 파일 둘을 읽는다 — 샘플이 수십 개로 늘면 리포트 요약을 한 파일에 모아 두기
    const latest = await loadLatestReport(userId).catch(() => null);
    if (!latest || latest.summary.bad.length === 0) return null;
    return latest.summary.bad.map((b) => ({ element: b.element, level: b.level, target: null, titles: [], reportId: latest.reportId }));
  }
  return focus.rx.map((r) => {
    const seen = new Set<string>();
    const titles = r.weeks.flatMap((w) =>
      w.drills.flatMap((d) => (seen.has(d.title) ? [] : (seen.add(d.title), [{ title: d.title, stage: w.stage }])))
    );
    return { element: r.element, level: r.level, target: r.target, titles };
  });
}

/**
 * 오늘 드릴로 던진 공 알림만 — 세션 끝 화면(finishMechanicsSession)이 마친 뒤에 부른다. 프로그램 칸 · 트레이닝 홈은 loadMechanicsProgram 의
 * throwNote(같은 식). 숨긴 · 나중에 촬영 드릴도 '했다'면 센다(visibleGuides 가 아니라 전체 캐시).
 */
export async function loadDrillThrowNote(
  userId: string,
  state: ProgramState,
  todayKey: string
): Promise<DrillThrowNote | null> {
  if (state.throwLog?.on !== todayKey || state.throwLog.closed) return null;
  const date = dbDate(todayKey);
  const [logs, pitched, guides] = await Promise.all([
    prisma.userDrillLog.findMany({ where: { userId, date, done: true }, select: { guideId: true } }),
    prisma.pitchLog.aggregate({ where: { userId, date }, _sum: { pitchCount: true } }),
    allGuides(),
  ]);
  const byId = new Map(guides.map((g) => [g.id, g] as const));
  return drillThrowNote({
    throwLog: state.throwLog,
    todayKey,
    doneToday: logs.flatMap((l) => {
      const g = byId.get(l.guideId);
      return g ? [{ category: g.category, stage: g.stage }] : [];
    }),
    pitchedToday: pitched._sum.pitchCount ?? 0,
  });
}
