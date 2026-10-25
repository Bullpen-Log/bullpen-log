import 'server-only';
import { loadArmcareHistory, type ArmcareHistoryItem } from '@/lib/armcare/history';
import type { getCurrentUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';
import { visibleExercises, type CachedExercise } from '@/lib/library-cache';
import { ARMCARE_AREAS, ARMCARE_CATEGORY, findArmcareArea, primaryArea, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { loadArmcareToday, notAdvised, type ArmcareTodayData } from '@/lib/armcare/today';
import { AFTER_THROWING_TEXT, ARMCARE_KIND_TEXT, armcareMinutes, type ArmcareKind } from '@/lib/armcare/routine';
import { loadArmcareCoverage, type ArmPainLine } from '@/lib/armcare/coverage-load';
import { loadMyRoutines } from '@/lib/armcare/my-routines-store';
import { MY_ROUTINE_MAX } from '@/lib/armcare/my-routines';
import { favoriteExerciseIds } from '@/lib/favorites';
import {
  REHAB_CONDITIONS,
  REHAB_ENABLED,
  REHAB_STAGES,
  WEEKLY_EVERY_DAYS,
  conditionsFor,
  firstCkcRecord,
  rehabAvoid,
  rehabNotes,
  rehabTitle,
  sessionResultText,
  severityLabel,
  stageTestFor,
  type RehabResult,
  daysBetween,
  hasPlyoBall,
  throwingNext,
  type RehabConditionKey,
  type RehabSeverity,
  type RehabStage,
  type StageTest,
  type ThrowRecord,
  type ThrowingNext,
} from '@/lib/armcare/rehab';
import { loadRehabThrows } from '@/lib/armcare/rehab-store';
import { shiftDateKey } from '@/lib/pitch-stats';
import { toArmcareViews } from '@/app/(app)/training/armcare-views';
import type { ArmcareExerciseView } from '@/app/(app)/training/armcare-media';

/**
 * 아이폰 앱 암케어 화면(native/src/app/training-armcare.tsx)이 그릴 것 — 웹 암케어 칸(app/(app)/training/armcare-section.tsx)이 서버에서
 * 모으는 것과 같은 함수 · 같은 규칙(loadArmcareToday · notAdvised · toArmcareViews · loadArmcareCoverage)으로, 화면 모양 대신 평범한 JSON 으로.
 * 웹 칸은 그대로 두고 여기서 같은 셈을 한 번 더 한다 — 웹 칸을 고치면 여기도 같이 본다(맞춤 루틴 · 내 루틴 · 재활 겉 한 줄 · 부위별 보강).
 * 재활 시작 · 단계 시험 · 매주 확인 · 루틴 만들기 · 3D 근육 지도는 앱이 웹으로 보낸다.
 * 'use server' 파일에 두지 않는다 — user 를 받는 함수가 거기 있으면 누구나 부를 수 있는 입구가 된다.
 */

type AppUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** 체크 목록의 한 줄 — 웹 ArmcareTodayItem 과 같은 뜻, 부위 이름까지 붙여 */
export type AppArmcareItem = {
  exercise: ArmcareExerciseView;
  area: ArmcareAreaKey;
  areaLabel: string | null;
  done: boolean;
  /** 만든 뒤 몸 상태가 바뀌어 지금은 권하지 않는 운동(아직 안 한 것만) */
  unsafe: boolean;
  /** 이름 옆 한마디 — 재활 운동의 '가볍게' 등 */
  note: string | null;
};

/** 오늘 재활 겉 세 줄(웹 rehab-card.tsx 의 접힌 모습) — 자세히 · 단계 시험 · 매주 확인 · 투구 복귀표는 앱 화면(native/src/app/rehab*.tsx, detail 칸) */
export type AppRehabSummary = {
  title: string;
  day: number;
  line: { kind: string; text: string } | null;
  rest: boolean;
  today: { resultLabel: string; text: string; warn: boolean } | null;
  count: number;
  done: number;
  estimatedMinutes: number;
  /** 진행 한 줄 — '깨끗한 세션 2/3 · 이 단계 5/14일' · 4단계는 공 운동 날 수 */
  progress: string;
  items: AppArmcareItem[];
  /** 앱 재활 자세히(native/src/app/rehab.tsx) — 웹 rehab-card.tsx 의 [자세히]에 그리는 것. 옛 앱은 안 읽는다 */
  detail?: AppRehabDetail;
};

export type AppRehabDetail = {
  stage: RehabStage;
  goal: string;
  notes: string[];
  avoid: string[];
  gate: { ready: boolean; checks: { label: string; ok: boolean }[] };
  hasStageTest: boolean;
  /** 이 단계에서 다음으로 가는 시험(1~3단계) — 앱 단계 시험 · 매주 확인 ⑤가 적는다 */
  stageTest: StageTest | null;
  /** 시작 때 고른 내 활동 — 매주 확인 ③ */
  activities: string[];
  /** 팔굽혀 터치 내 첫 기록 */
  ckcFirst: number | null;
  conditionChoices: { key: string; label: string }[];
  /** 매주 확인 — 지난 확인(날짜 · 다치기 전의 %) · 다음 확인 날(지금 할 수 있으면 null) */
  weekly: { allowed: boolean; last: { date: string; normalPct: number } | null; nextOn: string | null };
  /** 4단계 — 투구 복귀표(웹 rehab-throwing.tsx RehabThrowingView 와 같은 칸) */
  throwing: AppRehabThrowing | null;
  /** 지난 7일 안의 매주 확인 — 투구 복귀표 열기가 이 % · 자신감을 쓴다(없으면 매주 확인부터) */
  weeklyRecent: { normalPct: number; confidence: number } | null;
};

export type AppRehabThrowing = {
  opened: boolean;
  painFreeBallDays: number;
  needed: number;
  hasPlyo: boolean;
  severity: RehabSeverity;
  condition: RehabConditionKey | null;
  daysSinceStart: number;
  throws: ThrowRecord[];
  next: ThrowingNext | null;
  todayKey: string;
};

export type AppArmcareCustom =
  | { kind: 'rehab'; rehab: AppRehabSummary }
  | { kind: 'checkin' }
  | { kind: 'rest'; reason: string; pain: boolean }
  | {
      kind: 'routine';
      decision: { kind: ArmcareKind; label: string; reason: string };
      afterThrowing: string | null;
      /** 오늘 팔 통증(통증 루틴 날) — 웹은 [통증 안내 보기]를 붙인다 */
      pain: boolean;
      routine: {
        kind: ArmcareKind;
        label: string;
        reason: string;
        notes: string[];
        estimatedMinutes: number;
        items: AppArmcareItem[];
      } | null;
    };

export type AppMyRoutine = {
  id: string;
  name: string;
  items: AppArmcareItem[];
  estimatedMinutes: number;
  hidden: number;
};

export type AppArmcareTodayTab = {
  rehabPaused?: boolean;
  tab: 'today';
  dateKey: string;
  custom: AppArmcareCustom;
  /**
   * '팔이 아프면 · 재활 프로그램' 줄 — 재활 중이 아닐 때만(웹과 같다). 시작 화면이 미리 골라 둘 오늘 체크인의 아픈 자리 · 정도와 나이
   * (웹 armcare-section.tsx 의 RehabStartLine 과 같은 값). 옛 앱은 참 · 거짓으로만 본다.
   */
  rehabStart: { age: number | null; area: ArmcareAreaKey | null; level: 1 | 2 | 3 | null } | null;
  /**
   * 팔 통증 안내 시트(웹 arm-pain-guide.tsx 의 ArmPainView)에 넣을 오늘 아픈 자리 · 정도 · 나이 — '통증 안내 보기'가 앱 시트로 연다.
   * 오늘 아픈 팔이 없으면 null. 옛 앱은 이 칸을 모르고 custom.pain(참 · 거짓)만 본다.
   */
  painView?: { spots: ArmcareAreaKey[]; level: number | null; age: number | null } | null;
  routines: AppMyRoutine[];
  routineMax: number;
  painToday: boolean;
  week: { key: string; done: boolean }[];
};

export type AppArmcareGuideTab = {
  history?: ArmcareHistoryItem[];
  tab: 'guide';
  dateKey: string;
  exercises: ArmcareExerciseView[];
  /** 내 팔 지도의 글 몫 — 3D 그림은 웹 */
  coverage: { gaps: { key: ArmcareAreaKey; label: string }[]; allCovered: boolean; total: number; pain: ArmPainLine | null };
  untagged: number;
  /**
   * '내 루틴에 담기' 창의 루틴 목록(웹 armcare-section.tsx 의 routines 와 같은 값) — 부위 카드의 운동 줄 [담기]. 옛 앱은 안 읽는다.
   */
  routines?: { id: string; name: string; exerciseIds: string[] }[];
  /** 즐겨찾기한 운동 id — 운동 줄의 별 · 머리의 즐겨찾기 모음(앱, 2026-10-20). 옛 앱은 안 읽는다 */
  favoriteIds?: string[];
};

const RESULT_LABEL: Record<RehabResult, string> = { green: '초록', yellow: '노랑', red: '빨강', refer: '진료' };

export async function loadAppArmcareTab(
  user: AppUser,
  tab: 'today' | 'guide',
  today: Date
): Promise<AppArmcareTodayTab | AppArmcareGuideTab> {
  if (tab === 'guide') {
    /* 부위별 보강(armcare-section.tsx 의 guide 가지)과 같은 운동 · 같은 지도 */
    const library = await visibleExercises();
    const armcareLib = library.filter((ex) => ex.category === ARMCARE_CATEGORY);
    const dateKey = toDateKey(today);
    const [exercises, map, mine, favorites, history] = await Promise.all([
      toArmcareViews(armcareLib),
      loadArmcareCoverage(user.id, dateKey, library),
      loadMyRoutines(user.id),
      favoriteExerciseIds(user.id),
      loadArmcareHistory(user.id, dateKey),
    ]);
    return {
      tab: 'guide',
      history,
      dateKey,
      exercises,
      coverage: {
        gaps: map.gaps.map((key) => ({ key, label: ARMCARE_AREAS.find((a) => a.key === key)?.label ?? key })),
        allCovered: map.allCovered,
        total: map.coverage.total,
        pain: map.pain,
      },
      untagged: exercises.filter((ex) => ex.targetMuscles.length === 0).length,
      routines: mine.map((r) => ({ id: r.id, name: r.name, exerciseIds: r.items.map((it) => it.exerciseId) })),
      favoriteIds: exercises.filter((ex) => favorites.has(ex.id)).map((ex) => ex.id),
    };
  }

  const [data, library, mine] = await Promise.all([loadArmcareToday(user, today), visibleExercises(), loadMyRoutines(user.id)]);
  const byId = new Map(library.map((ex) => [ex.id, ex]));

  /* 체크 목록 줄 — 웹 armcare-section.tsx 의 items 만들기와 같다 */
  const toItems = async (
    picks: { exerciseId: string; sets: number; area?: ArmcareAreaKey; note?: string | null }[],
    unsafeOf: (ex: CachedExercise, done: boolean) => boolean,
    doneSet: Set<string>,
    fallbackArea: ArmcareAreaKey
  ): Promise<AppArmcareItem[]> => {
    const usable = picks.filter((p) => byId.has(p.exerciseId));
    const views = await toArmcareViews(
      usable.map((p) => byId.get(p.exerciseId)!),
      new Map(usable.map((p) => [p.exerciseId, p.sets]))
    );
    return usable.map((p, i) => {
      const ex = byId.get(p.exerciseId)!;
      const done = doneSet.has(p.exerciseId);
      const area = p.area ?? primaryArea(ex.targetMuscles ?? [])?.key ?? fallbackArea;
      return {
        exercise: views[i],
        area,
        areaLabel: findArmcareArea(area)?.label ?? null,
        done,
        unsafe: !done && unsafeOf(ex, done),
        note: p.note ?? null,
      };
    });
  };

  let custom: AppArmcareCustom;
  if (data.rehab) {
    custom = { kind: 'rehab', rehab: await rehabSummary(data.rehab, (picks) => toItems(picks, () => false, data.rehab!.doneToday, data.rehab!.program.area), user, data.todayKey) };
  } else if (!data.hasCheckinToday) {
    custom = { kind: 'checkin' };
  } else if (data.decision.kind === 'rest') {
    custom = { kind: 'rest', reason: data.decision.reason, pain: data.armPain != null };
  } else {
    const decision = data.decision;
    const routine = data.routine
      ? {
          kind: data.routine.kind,
          label: ARMCARE_KIND_TEXT[data.routine.kind].label,
          reason: data.routine.reason,
          notes: data.routine.notes,
          estimatedMinutes: data.routine.estimatedMinutes,
          items: await toItems(
            data.routine.items.map((it) => ({ exerciseId: it.exerciseId, sets: it.sets, area: it.area })),
            (ex) => notAdvised(data, ex, false),
            data.doneToday,
            'shoulder-back'
          ),
        }
      : null;
    custom = {
      kind: 'routine',
      decision: { kind: decision.kind, label: ARMCARE_KIND_TEXT[decision.kind].label, reason: decision.reason },
      afterThrowing: decision.afterThrowing ? AFTER_THROWING_TEXT : null,
      pain: data.armPain != null && (decision.kind === 'pain' || data.routine?.kind === 'pain'),
      routine,
    };
  }

  /* 내 루틴 — 숨긴 운동과 암케어가 아닌 것은 빼고, 담은 차례 그대로(웹과 같다) */
  const routines: AppMyRoutine[] = await Promise.all(
    mine.map(async (r) => {
      const usable = r.items.filter((it) => byId.get(it.exerciseId)?.category === ARMCARE_CATEGORY);
      const items = await toItems(usable, (ex) => notAdvised(data, ex, true), data.doneToday, 'shoulder-back');
      const minutes = usable.reduce((sum, it) => {
        const ex = byId.get(it.exerciseId)!;
        return sum + armcareMinutes({ ...ex, targetMuscles: ex.targetMuscles ?? [] }, it.sets);
      }, 0);
      return {
        id: r.id,
        name: r.name,
        items,
        estimatedMinutes: Math.max(1, Math.round(minutes)),
        hidden: r.items.length - usable.length,
      };
    })
  );

  return {
    tab: 'today',
    rehabPaused: !REHAB_ENABLED && data.facts.condition.rehab != null,
    dateKey: data.todayKey,
    custom,
    painView: data.armPain ? { spots: [...data.armPain.spots], level: data.armPain.level ?? null, age: data.facts.profile.age } : null,
    rehabStart:
      REHAB_ENABLED && !data.rehab
        ? {
            age: data.facts.profile.age,
            area: data.armPain?.spots[0] ?? null,
            level: data.armPain?.level === 1 || data.armPain?.level === 2 || data.armPain?.level === 3 ? data.armPain.level : null,
          }
        : null,
    routines,
    routineMax: MY_ROUTINE_MAX,
    painToday: data.decision.kind === 'rest',
    week: data.week,
  };
}

/** 오늘 재활 겉 모습 — 웹 rehab-card.tsx 머리 · 위 한 줄 · 오늘 · 진행(Progress)과 같은 글 */
async function rehabSummary(
  rehab: NonNullable<ArmcareTodayData['rehab']>,
  toItems: (picks: { exerciseId: string; sets: number; note?: string | null }[]) => Promise<AppArmcareItem[]>,
  user: AppUser,
  dateKey: string
): Promise<AppRehabSummary> {
  const { program, status, session } = rehab;
  /* 4단계 — 복귀표에 던진 날(투구 기록의 꼬리표)과 다음 칸(웹 armcare-section.tsx rehabCardView 와 같다) */
  const throws = status.throwing ? await loadRehabThrows(user.id, program.startedOn) : [];
  const recent = status.weekly.last && daysBetween(status.weekly.last.date, dateKey) < WEEKLY_EVERY_DAYS ? status.weekly.last : null;
  const items = await toItems(
    session.items.map((it) => ({ exerciseId: it.exerciseId, sets: it.sets, note: it.note ?? (it.replaces ? `${it.replaces} 대신` : null) }))
  );
  const today = status.today;
  const t = status.throwing;
  const shown = Math.min(status.gate.clean, status.gate.cleanNeeded);
  const progress =
    program.stage === 4
      ? `4단계 ${status.elapsed + 1}일째 · ${
          !t
            ? '던지기 준비'
            : t.openedOn
              ? '투구 복귀표를 열었어요. 자세히에서 봐요'
              : `공 운동 통증 없이 ${Math.min(t.painFreeBallDays, t.needed)}/${t.needed}일`
        }`
      : `깨끗한 세션 ${shown}/${status.gate.cleanNeeded}${
          status.minDays > 0 ? ` · 이 단계 ${Math.min(status.elapsed, status.minDays)}/${status.minDays}일` : ''
        }`;
  return {
    title: `${rehabTitle(program.area, program.condition)} · ${program.stage}단계 ${REHAB_STAGES[program.stage].name} · ${severityLabel(program.severity)}`,
    day: status.day,
    line: status.line,
    rest: status.rest != null && !today,
    today: today
      ? { resultLabel: RESULT_LABEL[today.result], text: sessionResultText(today), warn: today.result === 'red' || today.result === 'refer' }
      : null,
    count: items.length,
    done: items.filter((it) => it.done).length,
    estimatedMinutes: session.estimatedMinutes,
    progress,
    items,
    detail: {
      stage: program.stage,
      goal: REHAB_STAGES[program.stage].goal,
      notes: [...rehabNotes(program.area, program.condition), ...session.notes],
      avoid: rehabAvoid(program.area, program.condition),
      gate: { ready: status.gate.ready, checks: status.gate.checks },
      hasStageTest: stageTestFor(program.area, program.stage) != null,
      stageTest: stageTestFor(program.area, program.stage),
      activities: rehab.activities,
      ckcFirst: firstCkcRecord(rehab.weeklies),
      conditionChoices: program.condition ? [] : conditionsFor(program.area).map((key) => ({ key, label: REHAB_CONDITIONS[key].label })),
      weekly: {
        allowed: status.weekly.allowed,
        last: status.weekly.last ? { date: status.weekly.last.date, normalPct: status.weekly.last.normalPct } : null,
        nextOn: status.weekly.allowed ? null : shiftDateKey(status.weekly.last?.date ?? program.startedOn, WEEKLY_EVERY_DAYS),
      },
      throwing: t
        ? {
            opened: t.openedOn != null,
            painFreeBallDays: t.painFreeBallDays,
            needed: t.needed,
            hasPlyo: hasPlyoBall(user.ownedEquipment),
            severity: program.severity,
            condition: program.condition,
            daysSinceStart: daysBetween(program.startedOn, dateKey),
            throws,
            next: t.openedOn ? throwingNext({ records: throws, severity: program.severity, todayKey: dateKey }) : null,
            todayKey: dateKey,
          }
        : null,
      weeklyRecent: recent ? { normalPct: recent.normalPct, confidence: recent.confidence } : null,
    },
  };
}
