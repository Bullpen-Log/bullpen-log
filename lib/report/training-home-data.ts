import 'server-only';
import { prisma } from '@/lib/prisma';
import { loadTodayCoreCached, type UserForToday } from '@/lib/report/today-data';
import { TRAINING_SCREEN_TEXT, trainingScreenOf } from '@/lib/report/training-screen';
import { STATE_NOTICE_TEXT, stateNoticeOf } from '@/lib/report/state-notice';
import { PROGRAMS_ENABLED } from '@/lib/program/program';
import { activeProgram, buildProgramDay, programTodayOf } from '@/lib/program/load';
import { loadArmcareToday, type UserForArmcare } from '@/lib/armcare/today';
import { ARMCARE_KIND_TEXT } from '@/lib/armcare/routine';
import { ARMCARE_AREAS } from '@/lib/armcare/anatomy';
import { loadArmcareCoverage } from '@/lib/armcare/coverage-load';
import { visibleExercises } from '@/lib/library-cache';
import { loadMechanicsProgram } from '@/lib/mechanics/load';
import { mechanicsLevel } from '@/lib/mechanics/levels';
import { MECHANICS_FOLD_TEXT, foldSession, type DrillThrowNote } from '@/lib/mechanics/program';
import { toDateKey } from '@/lib/pitch-stats';
import { withJosa } from '@/lib/korean';
import type { TrainingPart } from '@/lib/training-part';

/**
 * 트레이닝 홈 앱 카드 셋(오늘 운동 · 암케어 · 메커니즘)의 내용 — 웹 트레이닝 홈(app/(app)/training/training-home.tsx)과 아이폰 앱
 * (native/, app.loadAppTraining)이 같은 판정을 그린다. 그리기는 각자. 판정 차례 · 까닭은 각 함수 머리 주석.
 */
export type HomeUser = UserForToday & UserForArmcare & { id: string };

export type CardAction =
  /** 운동 판 열기 — program 이면 근력 프로그램 판(startProgramWorkout), 아니면 매일 일정(startWorkout) */
  | { kind: 'workout'; program: boolean; resume: boolean }
  /** 따라 하기 화면으로(암케어 · 메커니즘) */
  | { kind: 'link'; href: string; label: string }
  /** 체크인 흐름을 연다 */
  | { kind: 'checkin'; label: string };

export type TrainingCard = {
  app: TrainingPart;
  /** 오늘 할 것 한 줄 */
  status: string;
  tone: 'normal' | 'done' | 'warn';
  /** 오른쪽 단추 — 없으면 › (카드를 누르면 그 앱) */
  action: CardAction | null;
  /** 암케어 — 내 팔 지도의 '2주째 안 한 곳' 한 줄(누르면 부위별 보강) */
  gap?: { text: string; href: string } | null;
  /** 메커니즘 — 수준의 세션 칸(마친 수 · 모두) */
  bars?: { index: number; total: number; label: string } | null;
  /** 메커니즘 — 드릴로 던진 공을 투구 기록에 남기라는 한 줄 */
  throwNote?: DrillThrowNote | null;
};

const card = (app: TrainingPart, status: string, rest: Partial<TrainingCard> = {}): TrainingCard => ({
  app,
  status,
  tone: 'normal',
  action: null,
  ...rest,
});

/**
 * 트레이닝 — 오늘 일정 한 줄과 [시작](운동 판으로 곧장).
 *
 * 차례(2판 P6-4 · P6-6): 마침 > 멈춤 > 근력 프로그램 날 > 일정 없음 > 상태 바뀜 > 남은 운동 없음 > 보통. 프로그램이 오늘
 * 주인이면(트레이닝 화면과 같은 판정 — lib/report/training-screen.ts) 그날 운동은 프로그램이라 프로그램 이름 · 일차와 프로그램 [시작]을 낸다
 * (사용자 결정 D6). 마침 · 멈춤이 먼저인 까닭: 마친 날은 무엇이든 마친 것이고, 멈춘 날은 프로그램도 기다린다(painWait).
 */
export async function workoutCardData(user: HomeUser, today: Date): Promise<TrainingCard> {
  /*
   * 오늘 판 · 진행 중인 프로그램을 오늘 셈과 같이 읽는다 — 예전엔 오늘 셈을 기다린 뒤에 읽어 왕복이 하나 더 쌓였다(2026-10-15 탭 전환
   * 속도). 오늘 판은 지난 판 닫기와 상관없는 오늘 줄이다. 프로그램은 오늘 셈이 지난 판을 닫으며 차례를 넘겼을 수 있어, 닫은 판이
   * 있었으면(드묾) 한 번 더 읽는다.
   */
  const [core, session, programFirst] = await Promise.all([
    /* 홈 탭(@home)과 같은 요청에서 같은 셈이 두 번 돌지 않게 캐시 함수로(2026-10-16 점검 13번 — 탭 판 넷이 늘 함께 그려진다) */
    loadTodayCoreCached(user),
    prisma.trainingSession.findUnique({
      where: {
        userId_date: { userId: user.id, date: new Date(`${toDateKey(today)}T00:00:00.000Z`) },
      },
      select: { status: true },
    }),
    PROGRAMS_ENABLED ? activeProgram(user.id) : Promise.resolve(null),
  ]);
  const programRow = PROGRAMS_ENABLED && core.closedSessions > 0 ? await activeProgram(user.id) : programFirst;
  const count = core.shownPicks.length;

  if (session?.status === 'FINISHED') return card('today', '오늘 운동을 마쳤어요', { tone: 'done' });
  if (core.picked.halted) return card('today', '오늘은 운동을 처방하지 않았어요', { tone: 'warn' });

  /* 프로그램 날은 트레이닝 화면의 프로그램 카드와 같은 길(buildProgramDay — 판정 · 오늘 판 · 중재) */
  const programView = programRow ? await buildProgramDay(core, programRow, user) : null;
  const screen = trainingScreenOf({
    halted: core.picked.halted,
    daily: programView?.arbitration.daily,
    savedPlan: core.savedPlan,
    shownCount: count,
    /* 할 프로그램 운동이 없는 날(다 빠짐)은 일정 만들기가 매일 일정을 짠다 — 프로그램 날로 보지 않는다(트레이닝 화면과 같은 값, 2판 P6 검토) */
    programWork: programView ? programTodayOf(programView) != null : false,
  });
  if (programView && screen.programOwns) {
    const active = programView.todayState === 'active';
    /* 하는 날인데 그날 운동이 하나도 없으면(모두 빠짐) 프로그램 시작이 트레이닝으로 되돌려 보낸다 — 단추 대신 › 로 프로그램 카드에 가게 */
    const canStart = active || (programView.decision.kind === 'go' && programView.rows.length > 0);
    const dayLabel = programView.arbitration.program?.today?.label ?? programView.dayLabel;
    return card('today', `${programView.plan.def.name} · ${dayLabel}`, {
      action: canStart ? { kind: 'workout', program: true, resume: active } : null,
    });
  }
  if (!screen.usesPlan || !core.savedPlan) {
    return card('today', screen.stalePlan ? TRAINING_SCREEN_TEXT.stalePlanHome : '오늘 일정을 아직 안 만들었어요');
  }
  /*
   * 상태 바뀜(2판 P6-6) — 트레이닝 화면의 띠와 같은 함수(lib/report/state-notice.ts). 한 번 눌러 다시 만들 수 있는 날만 주의 색 한 줄로 알리고
   * (운동 중 · 체크인 없는 날은 홈에서 할 것이 없어 보통 카드), 카드를 누르면 띠가 있는 트레이닝 화면으로 간다. [시작]은 그대로 둔다 — 알림은
   * 다시 만들기를 권할 뿐이고, 무리인 운동은 안전 재검사가 이미 뺐다. '일정 없음' 뒤인 까닭: 바뀜은 저장한 일정이 있어야 견준다.
   */
  const notice = stateNoticeOf(core.stateChanges, {
    programOwns: screen.programOwns,
    droppedForSafety: core.droppedForSafety,
    session: session?.status === 'ACTIVE' ? 'active' : 'none',
    checkedIn: core.hasCheckinToday,
  });
  if (notice.kind === 'remake' && notice.canRemake) {
    return card('today', STATE_NOTICE_TEXT.home, {
      tone: 'warn',
      action: count > 0 ? { kind: 'workout', program: false, resume: false } : null,
    });
  }
  if (count === 0) return card('today', '일정에 남은 운동이 없어요');
  return card('today', `${core.savedPlan.theme.label} · ${count}종목 · 약 ${core.shownMinutes}분`, {
    action: { kind: 'workout', program: false, resume: session?.status === 'ACTIVE' },
  });
}

/**
 * 암케어 — 오늘 루틴(재활 중이면 재활) 한 줄과 [시작](따라 하기로 곧장). 밑에 내 팔 지도의 '2주째 안 한 곳'을 한 줄
 * 띄우고 누르면 부위별 보강(내 팔 지도)으로 간다(lib/armcare/coverage-load.ts — 아픈 곳은 뺀다).
 */
export async function armcareCardData(user: HomeUser, today: Date): Promise<TrainingCard> {
  /* 오늘 루틴과 내 팔 지도를 같이 읽는다(예전엔 루틴을 기다린 뒤 지도를 읽었다 — 2026-10-15 탭 전환 속도) */
  const [data, map] = await Promise.all([
    loadArmcareToday(user, today),
    visibleExercises().then((lib) => loadArmcareCoverage(user.id, toDateKey(today), lib)),
  ]);
  const gap =
    map.gaps.length > 0 && data.decision.kind !== 'rest'
      ? {
          text: `${map.coverage.total === 0 ? '여기부터 해 보세요' : '2주째 안 한 곳'}: ${map.gaps
            .map((key) => ARMCARE_AREAS.find((a) => a.key === key)?.label ?? key)
            .join(' · ')}`,
          href: '/training?view=armcare&tab=guide',
        }
      : null;

  if (data.rehab) return card('armcare', '재활 중이에요 · 오늘 재활 보기');
  if (!data.hasCheckinToday) {
    return card('armcare', '체크인을 남기면 오늘 루틴을 짜요', {
      action: { kind: 'checkin', label: '체크인' },
      gap,
    });
  }
  if (data.decision.kind === 'rest') return card('armcare', '오늘은 팔을 쉬는 날이에요', { tone: 'warn' });
  if (!data.routine) return card('armcare', '오늘 루틴을 아직 안 만들었어요', { gap });
  const items = data.routine.items;
  const done = items.filter((it) => data.doneToday.has(it.exerciseId)).length;
  const label = ARMCARE_KIND_TEXT[data.routine.kind].label;
  if (items.length > 0 && done >= items.length) {
    return card('armcare', `오늘 ${withJosa(label, '을/를')} 마쳤어요`, { tone: 'done', gap });
  }
  return card('armcare', `${label} · ${items.length}개 · 약 ${data.routine.estimatedMinutes}분`, {
    action: { kind: 'link', href: `/armcare/play/today?d=${data.todayKey}`, label: done > 0 ? '이어서' : '시작' },
    gap,
  });
}

/**
 * 메커니즘 — 고른 수준의 다음 세션과 12칸 진행(수준을 안 골랐으면 고르라고).
 *
 * 어깨 · 팔꿈치가 아픈 날(2판 P6-5, D5) · 팔을 다 쓴 날 · 통증 확인 전(2판 P6 검토, lib/mechanics/fold.ts) — 프로그램 칸처럼 팔에 싣는 드릴은
 * 접고 무브먼트만 권한다. 까닭 머리말은 fold.cause. 펼치기('그래도 하기' — 성인의 통증 날만)는 프로그램 칸에 있어서, 할 드릴이 없으면 단추 없이
 * 카드를 누르면 그리로 간다. 다 마친 수준 · 오늘 마친 날은 예전 줄 그대로.
 */
export async function mechanicsCardData(userId: string): Promise<TrainingCard> {
  const { program, session, doneToday, painFold, throwNote } = await loadMechanicsProgram(userId);
  if (!program?.level) {
    return card('mechanics', '수준을 골라 투구 메커니즘 프로그램을 시작해 보세요');
  }
  const level = mechanicsLevel(program.level);
  const done = new Set(program.finishedToday ? [] : doneToday);
  /* 3D 리포트 처방이 남았으면 수준 12세션을 마쳐도 세션이 있다(lib/mechanics/program.ts buildProgramSession) */
  const rx = program.focus && !program.focus.finished ? program.focus : null;
  const completed = program.week == null && !rx;
  const bars = { index: program.index, total: program.total, label: `${level.name} ${program.total}번 중 ${program.index}번 마침` };

  if (program.canFinalize)
    return card('mechanics', '필수 드릴 수행을 저장했어요. 세션 완료를 확인해 주세요.', {
      action: { kind: 'link', href: '/mechanics/play', label: '완료 확인' },
      bars,
      throwNote,
    });
  if (program.blockers.length)
    return card('mechanics', program.blockers[0], {
      tone: 'warn',
      action: { kind: 'link', href: '/training?view=mechanics', label: '필수 드릴·장비 확인' },
      bars,
      throwNote,
    });
  const fold = painFold && !completed && !program.finishedToday ? painFold : null;
  const { open } = foldSession(session, fold);
  if (fold) {
    const openLeft = open.filter((s) => !done.has(s.guideId));
    /* 무브먼트만 하고 마친 날은 세션 수가 그대로라 finishedToday 가 아니다 — 그래서 여기서 '마쳤어요'를 따로 말한다 */
    const openDone = open.length > 0 && openLeft.length === 0;
    return card(
      'mechanics',
      openLeft.length > 0
        ? MECHANICS_FOLD_TEXT.homeOpen(fold.cause, open.length)
        : openDone
          ? MECHANICS_FOLD_TEXT.homeOpenDone
          : MECHANICS_FOLD_TEXT.homeAllFolded,
      {
        tone: openDone ? 'done' : 'warn',
        action:
          openLeft.length > 0
            ? { kind: 'link', href: '/mechanics/play', label: open.some((s) => done.has(s.guideId)) ? '이어서' : '시작' }
            : null,
        bars,
        throwNote,
      }
    );
  }
  const started = session.some((s) => done.has(s.guideId));
  return card(
    'mechanics',
    completed
      ? `${level.name} 프로그램을 마쳤어요`
      : program.finishedToday
        ? '오늘 세션을 마쳤어요'
        : rx
          ? rx.skill
            ? `${rx.stage} 연습 · ${rx.rx[0].element} · 드릴 ${session.length}개`
            : `처방 ${rx.done + 1}/${rx.total} · ${rx.rx[0].element} · 드릴 ${session.length}개`
          : `${level.name} ${program.index + 1}번 세션 · 드릴 ${session.length}개 · 15~20분`,
    {
      tone: program.finishedToday || completed ? 'done' : 'normal',
      action:
        session.length > 0
          ? { kind: 'link', href: '/mechanics/play', label: program.finishedToday ? '하나 더' : started ? '이어서' : '시작' }
          : null,
      bars,
      throwNote,
    }
  );
}
