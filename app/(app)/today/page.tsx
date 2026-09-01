import { ClipboardList, Dumbbell, Settings2, Target } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import {
  intensityRangeText,
  pitchRangeText,
} from '@/lib/report/plan';
import { loadTodayCore } from '@/lib/report/today-data';
import { DEFAULT_WORKOUT_MINUTES } from '@/lib/report/theme';
import { availableParts } from '@/lib/report/today-pick';
import { CHECKIN_PARTS, hasPain, pickCheckinParts } from '@/lib/checkin';
import { formatShortDate, shiftDateKey } from '@/lib/pitch-stats';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { Card, PageHeading } from '@/components/ui';
import { PlanNote } from '@/components/plan-note';
import { CheckinForm, type CheckinData } from '@/components/checkin-form';
import { PlanForm, TrainingSettingsForm } from '@/components/training-forms';
import { trainingLoad } from '@/lib/report/training-acwr';
import { HomeTile, HomeTileLink, MiniBars, type TileState } from './home-tile';
import { SummaryPanel, type RecentLog } from './summary-panel';
import { TodayRecord } from './today-record';

/**
 * 홈 — 오늘 남길 것.
 *
 * 예전에는 이 화면 하나가 체크인·투구 기록·운동 목록·근거 패널을 다 들고 있었다.
 * 631줄이었고, 운동 하나를 체크하려면 스크롤을 한참 내려야 했다.
 *
 * '남기는 것'과 '하는 것'으로 갈랐다. 여기서는 오늘 무엇을 남겼는지 보여주고,
 * 실제 운동 목록과 체크는 트레이닝으로 옮겼다.
 *
 * 남은 넷은 큰 상자 넷으로 두고, 누르면 창이 뜬다. 접었다 펴는 방식도 해봤는데
 * 넷을 다 접으면 제목 네 줄만 남아 화면이 텅 비고, 펴 두면 예전처럼 길어졌다.
 * 상자 안에 지금 상태를 두세 줄 적어 두면, 창을 열지 않고도 오늘이 어떤
 * 상태인지 알 수 있다.
 */

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다. */
function now() {
  return new Date();
}

export default async function HomePage() {
  const user = await requireUser();
  const today = now();
  const savedMinutes = user.dailyWorkoutMinutes ?? DEFAULT_WORKOUT_MINUTES;

  const core = await loadTodayCore(user, today);
  const { facts, plan, savedPlan, picked, shownPicks, doneIds } = core;

  /*
   * "오늘 계획대로 던졌나"를 견주기 위한, 오늘 기록을 빼고 낸 계획.
   *
   * core.plan 은 오늘 던진 것까지 넣고 계산한 것이라 45구를 남기는 순간
   * 오늘이 '휴식'으로 바뀐다(이미 던졌으니 더 쉬라는 뜻이다). 그걸 아침에
   * 본 계획인 양 견주면 "오늘은 쉬는 게 계획이었습니다"라는 엉뚱한 말이 나온다.
   */
  const [
    { plan: planBeforeToday },
    todayLog,
    recentCheckins,
    training,
    recentLogs,
    weekLogs,
    analyzedPaths,
  ] = await Promise.all([
    gatherFactsAndPlan(user, today, { excludeToday: true }),
    /*
     * 오늘 남긴 투구 기록. 지난 날짜는 투구 일지에서 다루므로 오늘 것만 본다.
     * 하루에 여러 번 던진 날은 첫 기록을 보여주고, 나머지는 일지에서 본다.
     */
    prisma.pitchLog.findFirst({
      where: { userId: user.id, date: core.midnight },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        sessionType: true,
        pitchCount: true,
        intensity: true,
        maxVelocity: true,
        avgVelocity: true,
        memo: true,
        /* 고치는 폼이 영상도 다루므로 함께 읽는다 — 없으면 고칠 때 다 빠진다 */
        videoPaths: true,
      },
    }),
    /*
     * 최근 열흘치 체크인. 두 곳에 쓴다 — 상자 안의 7일 컨디션 막대와, 체크인
     * 창이 오늘 것을 찾아 채워 넣는 데.
     *
     * 열흘을 보는 것은 시간대 차이 때문이다. 서버가 보는 '오늘'과 사용자가 보는
     * '오늘'이 다를 수 있어 넉넉히 가져온다.
     */
    prisma.dailyCheckin.findMany({
      where: {
        userId: user.id,
        date: { gte: new Date(core.midnight.getTime() - 10 * 86400000) },
      },
      orderBy: { date: 'desc' },
      take: 10,
    }),
    /*
     * 오른쪽 요약 칸에 쓸 것 둘.
     *
     * 운동 부하는 분석 화면과 같은 계산기를 쓴다 — 같은 이름의 값이 화면마다
     * 다르면 안 된다.
     */
    trainingLoad(user.id, today),
    /*
     * 최근 기록 몇 건 — 요약 칸에 "마지막으로 뭘 했나"로 쓴다.
     *
     * 기간을 걸지 않는다. 두 주로 잘랐더니 한 달 쉰 사람에게는 빈칸이 됐는데,
     * 그 사람에게야말로 마지막이 언제였는지가 필요하다.
     */
    prisma.pitchLog.findMany({
      where: { userId: user.id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 4,
      select: {
        id: true,
        date: true,
        sessionType: true,
        pitchCount: true,
        intensity: true,
      },
    }),
    /* 상자 안 7일 막대용. 이쪽은 최근 7일만 있으면 된다. */
    prisma.pitchLog.findMany({
      where: {
        userId: user.id,
        date: { gte: new Date(core.midnight.getTime() - 6 * 86400000) },
      },
      select: { date: true, pitchCount: true },
    }),
    /*
     * 오늘 기록의 영상 중 폼 분석이 저장된 것.
     *
     * 고치는 폼이 "이 영상을 빼면 분석도 지워집니다"라고 알려주는 데 쓴다.
     * 이 값이 없으면 그 말을 못 하고, 사용자는 모른 채 분석을 잃는다.
     */
    prisma.poseAnalysis.findMany({
      where: { userId: user.id, pitchLog: { date: core.midnight } },
      select: { videoPath: true },
    }),
  ]);

  // 체크인 창이 쓰는 모양으로 바꾼다.
  const checkinData: CheckinData[] = recentCheckins.map((c) => ({
    date: c.date.toISOString().slice(0, 10),
    ...pickCheckinParts(c),
    condition: c.condition,
    sleep: c.sleep,
    preferredParts: c.preferredParts,
    preferredWorkout: c.preferredWorkout,
  }));
  /*
   * 체크인에서 '오늘 하고 싶은 부위'로 고를 수 있는 목록.
   * 코드에 적어두지 않고 라이브러리에 실제로 있는 것만 보여준다.
   */
  const libraryParts = availableParts(core.library);

  /**
   * 오늘의 투구 계획. 오늘 기록을 넣기 전 기준이다.
   *
   * 넣은 뒤로 계산하면 던진 그 순간 '휴식'으로 바뀌어, 방금 남긴 기록과
   * 나란히 놓였을 때 서로 어긋나 보인다.
   */
  const plannedToday = planBeforeToday.today;
  const showPlannedToday = plannedToday != null && !planBeforeToday.halted;

  const exerciseTotal = shownPicks.length;
  const exerciseDone = shownPicks.filter((p) => doneIds.has(p.exerciseId)).length;

  /* ─────────────────── 상자 넷에 적을 내용 ─────────────────── */

  /*
   * 목표는 여기 세지 않는다. 일정을 만들 때 그날그날 고르는 값이라 설정에
   * 남아 있지 않아도 '아직 안 한 것'이 아니다.
   */
  const settingsSet =
    user.trainingLevel != null && user.ownedEquipment.length > 0;

  /*
   * 서버가 보는 '오늘'로 오늘 체크인을 찾는다.
   *
   * 체크인 창 안에서는 사용자 시간을 쓰는데(시간대가 다를 수 있다), 상자에
   * 적는 요약까지 그렇게 하면 화면이 뜬 뒤에 글자가 바뀐다. 여기서는 안전
   * 규칙이 이미 쓰고 있는 기준(core.hasCheckinToday)과 같은 것을 쓴다.
   */
  const checkinToday = checkinData.find((c) => c.date === core.todayKey) ?? null;
  const painToday = checkinToday ? hasPain(checkinToday) : false;
  const painParts = checkinToday
    ? CHECKIN_PARTS.filter((p) => checkinToday[p.key] === '통증').map((p) => p.label)
    : [];

  const restedToday = todayLog?.sessionType === REST_SESSION_TYPE;

  const checkinTile = {
    state: (painToday ? 'warn' : checkinToday ? 'done' : 'todo') as TileState,
    badge: painToday ? '통증' : checkinToday ? '완료' : '아직',
    lines: checkinToday
      ? [
          `컨디션 ${checkinToday.condition}/10 · 수면 ${checkinToday.sleep}`,
          /*
            예전에는 '아픈 곳 없음'이었다. 체크인은 다섯 부위를 정상·뻐근·통증
            셋으로 묻는데, 뻐근한 것은 아픈 것이 아니라서 그 말로는 절반이
            빠진다. 실제로 이 줄이 뜨는 조건도 '전부 정상'일 때다.
          */
          painToday ? `${painParts.join('·')} 통증` : '불편한 곳 없음',
          ...(checkinToday.preferredParts.length > 0
            ? [`하고 싶은 부위 ${checkinToday.preferredParts.join('·')}`]
            : []),
        ]
      : [
          '30초면 됩니다.',
          '오늘 컨디션과 몸 상태를 남기면, 그에 맞춰 운동을 골라드립니다.',
        ],
  };

  const pitchTile = {
    state: (todayLog ? 'done' : 'todo') as TileState,
    badge: todayLog ? '완료' : '아직',
    lines: [
      showPlannedToday
        ? plannedToday.throwing
          ? `계획 ${pitchRangeText(plannedToday)} · ${intensityRangeText(plannedToday)}`
          : '계획 휴식'
        : '계획을 낼 만큼 기록이 쌓이지 않았습니다',
      todayLog
        ? restedToday
          ? '기록 오늘은 쉬는 날'
          : `기록 ${todayLog.sessionType} ${todayLog.pitchCount}구 · 강도 ${todayLog.intensity}`
        : '기록 아직 없음 — 남기지 않으면 안 던진 날로 봅니다',
    ],
  };

  const planTile = savedPlan
    ? {
        state: (exerciseTotal > 0 && exerciseDone >= exerciseTotal
          ? 'done'
          : 'todo') as TileState,
        badge:
          exerciseTotal > 0 && exerciseDone >= exerciseTotal
            ? '완료'
            : `${exerciseDone}/${exerciseTotal}`,
        lines: [
          savedPlan.theme.label,
          /*
           * 시간은 만들 때 찍어 둔 값이 아니라 지금 목록에서 센다.
           * 트레이닝에서 운동을 빼도 홈의 숫자가 그대로면 서로 어긋난다.
           */
          `${exerciseTotal}종목 · 약 ${core.shownMinutes}분`,
          savedPlan.theme.reason,
        ],
      }
    : {
        state: 'todo' as TileState,
        badge: '아직',
        lines: picked.halted
          ? [
              '오늘은 운동을 만들지 않습니다.',
              picked.haltReason ?? '통증 신호가 있어 훈련 조언을 만들지 않았습니다.',
            ]
          : !core.hasLogs
            ? [
                '투구 기록이 있어야 운동을 고를 수 있습니다.',
                '최근 투구량을 봐야 오늘 무리가 안 되는 운동을 고를 수 있습니다.',
              ]
            : [
                '아직 만들지 않았습니다.',
                /*
                  고르는 데 쓰는 것을 다 적는다. 투구량과 몸 상태만 적어 두었는데
                  실제로는 그날 고른 목표(균형·파워·부상 방지·근력)도 함께 본다.
                  체크인 전이면 '오늘 몸 상태'는 저절로 빠진다 — 아직 모르는 것을
                  봤다고 할 수는 없다.
                */
                `최근 투구량${core.hasCheckinToday ? ' · 오늘 몸 상태' : ''} · 오늘 목표에 맞춰 골라드립니다.`,
              ],
      };

  const summaryRecent: RecentLog[] = recentLogs.map((l) => ({
    id: l.id,
    date: l.date.toISOString().slice(0, 10),
    sessionType: l.sessionType,
    pitchCount: l.pitchCount,
    intensity: l.intensity,
  }));

  /*
   * 최근 7일 투구수 막대.
   *
   * 숫자 한 줄보다 막대가 빨리 읽힌다 — 몰아 던졌는지 고르게 던졌는지가
   * "이번 주 240구"에는 안 담긴다.
   */
  const pitchesByDay = new Map<string, number>();
  for (const log of weekLogs) {
    const key = log.date.toISOString().slice(0, 10);
    pitchesByDay.set(key, (pitchesByDay.get(key) ?? 0) + log.pitchCount);
  }
  const weekBars = Array.from({ length: 7 }, (_, i) => {
    const key = shiftDateKey(core.todayKey, i - 6);
    const value = pitchesByDay.get(key) ?? 0;
    return {
      key,
      value,
      title: `${formatShortDate(key)} ${value}구`,
    };
  });

  /*
   * 최근 7일 컨디션 막대. 기준은 10점이다 — 위가 열린 투구수와 달리 상한이
   * 정해진 값이라, 가장 높은 날에 맞춰 그리면 매일 5인 사람도 꽉 차 보인다.
   */
  const conditionByDay = new Map(checkinData.map((c) => [c.date, c.condition]));
  const conditionBars = Array.from({ length: 7 }, (_, i) => {
    const key = shiftDateKey(core.todayKey, i - 6);
    const value = conditionByDay.get(key) ?? 0;
    return {
      key,
      value,
      title: value > 0 ? `${formatShortDate(key)} 컨디션 ${value}/10` : `${formatShortDate(key)} 체크인 없음`,
    };
  });

  const planFormEl = (
    <PlanForm
      owned={user.ownedEquipment}
      availableToday={
        core.todaySetup?.availableEquipment.length
          ? core.todaySetup.availableEquipment
          : null
      }
      minutes={savedMinutes}
      defaultMinutes={savedMinutes}
      goal={user.trainingGoal}
      generated={false}
      returnTo="/today"
      clash={core.workoutClash}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Home"
        title={`${user.nickname}님, 오늘도 던져볼까요`}
        description="오늘 몸 상태와 던진 것을 남겨주세요. 운동은 트레이닝에서 합니다."
      />

      {/*
        최근 메모에 통증 같은 표현이 있었던 경우.
        상자 안에 넣기에는 긴 이야기라, 상자 위에 그대로 둔다.
      */}
      {plan.needsPainCheck && !picked.halted && (
        <Card className="space-y-2 border-warn-line bg-warn-bg py-4">
          <p className="text-sm font-bold text-warn">지금 통증이 있으신가요?</p>
          <p className="text-sm leading-relaxed text-warn">
            최근 투구 일지 메모에{' '}
            <strong>{facts.condition.painWordsInMemo.join(', ')}</strong> 같은 표현이
            있었습니다. 실제로 통증이 있는지 알 수 없어, 확인될 때까지 투구는 휴식으로
            두고 운동은 회복·가동성 수준만 골랐습니다.
          </p>
          <p className="text-sm leading-relaxed text-warn">
            통증이 있다면 던지지 말고 전문의와 상담하세요. 통증이 아니라면 오늘
            체크인을 남겨주시면 바로 평소 계획으로 돌아갑니다.
          </p>
        </Card>
      )}

      {/* 최근 체크인에 통증이 있었던 경우. */}
      {plan.recovering && !plan.needsPainCheck && !picked.halted && (
        <Card className="space-y-1 border-warn-line bg-warn-bg py-4">
          <p className="text-sm font-bold text-warn">회복 수준으로 낮춰 배정했습니다</p>
          <p className="text-sm leading-relaxed text-warn">
            최근 체크인에 통증 기록이 있어, 오늘은 무게를 다루는 운동을 빼고 회복·가동성
            운동만 골랐습니다. 통증이 다시 느껴지면 오늘 체크인에 그대로 남겨주세요.
          </p>
        </Card>
      )}

      {/*
        처음 온 사람에게 어디부터인지 알려준다.

        상자 넷이 다 '아직'인 화면에서는 무엇을 먼저 눌러야 하는지가 안 보인다.
        각 상자가 자기 할 말은 하지만, 그걸 읽으려면 이미 눌러본 뒤다.

        투구 기록이 하나도 없을 때만 낸다. 한 번이라도 남긴 사람에게는 잔소리가
        되고, 매일 뜨는 안내는 곧 안 읽게 된다.
      */}
      {!core.hasLogs && (
        <div className="rounded-2xl border border-sky-soft/60 bg-sky-tint px-5 py-4">
          <p className="text-sm font-bold text-sky-strong">
            여기부터 시작하세요
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink/80">
            <strong className="text-ink">오늘 투구</strong>를 먼저 남겨주세요. 던진
            양을 알아야 부하를 재고 무리가 안 되는 운동을 고를 수 있습니다. 오늘 안
            던지셨다면 <strong className="text-ink">‘오늘 안 던졌어요’</strong>를
            눌러주시면 됩니다.
          </p>
        </div>
      )}

      {/*
        넓은 화면에서는 오른쪽에 요약 칸을 둔다.

        상자 넷만 두면 1440px 화면에서 가로가 절반 남고 아래 300px 이 통째로
        빈다. 좁은 화면에서는 요약이 상자 아래로 내려간다 — 폰에서는 오늘 할
        일이 먼저다.
      */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      {/*
        오늘 할 넷.

        순서는 하루의 순서다 — 몸 상태를 먼저 남기고(체크인), 던진 것을 남기고,
        그 둘을 근거로 운동 일정을 만든다. 설정은 어쩌다 한 번이라 끝에 둔다.
      */}
      {/*
        sm:auto-rows-fr — 넓은 화면에서 네 상자를 같은 높이로 맞춘다.

        내용에 맡겨두면 윗줄 274px, 아랫줄 211px 처럼 들쭉날쭉해진다. 높이를
        맞추면 '할 일'을 알리는 아래 글귀도 네 개가 한 줄에 서서 눈이 덜 튄다.

        폰에서는 걸지 않는다. 한 줄에 하나씩 놓이는데 높이를 맞추면 두 줄짜리
        상자가 제일 긴 상자만큼 늘어나, 스크롤만 길어진다.
      */}
      <div className="space-y-3">
        {/*
          제목을 세워 두 덩이를 가른다.

          예전에는 상자 일곱 개가 그냥 이어져 있었다. 앞의 넷은 오늘 해야 하는
          것이고 뒤의 셋은 지나간 것을 보는 자리인데, 경계가 없으니 아래로
          내려가다 어디서 성격이 바뀌는지 알 수 없었다.
        */}
        <h2 className="text-heading px-1 text-xl text-ink">오늘 할 일</h2>

      <div className="grid gap-4 sm:auto-rows-fr sm:grid-cols-2">
        <HomeTile
          tone="mobility"
          icon={<ClipboardList className="h-4 w-4" />}
          title="오늘 체크인"
          state={checkinTile.state}
          badge={checkinTile.badge}
          lines={checkinTile.lines}
          extra={<MiniBars bars={conditionBars} label="최근 7일 컨디션" max={10} />}
          action={checkinToday ? '보기 · 고치기' : '체크인하기'}
          modalTitle="오늘 컨디션 체크인"
          modalDescription="30초면 됩니다. 리포트와 운동 추천의 기준이 됩니다."
        >
          <CheckinForm recent={checkinData} parts={libraryParts} />
        </HomeTile>

        <HomeTile
          tone="core"
          icon={<Target className="h-4 w-4" />}
          title="오늘 투구"
          state={pitchTile.state}
          badge={pitchTile.badge}
          lines={pitchTile.lines}
          action={todayLog ? '보기 · 고치기' : '기록하기'}
          extra={<MiniBars bars={weekBars} label="최근 7일 투구수" />}
          modalTitle="오늘 투구 기록"
          modalDescription="계획과 나란히 두어 지켰는지 바로 보이게 합니다."
        >
          <div className="space-y-3">
            {/*
              계획은 오늘 기록을 넣기 전 기준으로 보여준다.

              넣고 나면 '휴식'으로 바뀌는데(이미 던졌으니 더 쉬라는 뜻이다),
              바로 아래 "45구 기록" 옆에 "오늘 계획: 휴식"이 있으면 서로 어긋나
              보인다. 아침에 본 계획을 그대로 두고, 넘겼으면 아래에서 알린다.
            */}
            {showPlannedToday && (
              <PlanNote
                plan={{
                  throwing: plannedToday.throwing,
                  pitches: pitchRangeText(plannedToday),
                  intensity: intensityRangeText(plannedToday),
                  reason: plannedToday.reason,
                }}
              />
            )}
            <TodayRecord
              date={core.todayKey}
              log={todayLog}
              analyzedPaths={analyzedPaths.map((a) => a.videoPath)}
              plan={
                showPlannedToday
                  ? {
                      throwing: plannedToday.throwing,
                      maxPitches: plannedToday.maxPitches,
                      maxIntensity: plannedToday.maxIntensity,
                    }
                  : null
              }
            />
          </div>
        </HomeTile>

        {/*
          일정을 이미 만든 날에는 창을 거치지 않고 바로 트레이닝으로 보낸다.
          그날 할 일은 '운동하기'인데, 창을 한 번 지나 다시 누르게 할 이유가 없다.
          다시 만드는 것은 트레이닝 화면에서 할 수 있다.
        */}
        {savedPlan ? (
          <HomeTileLink
            href="/training"
            tone="power"
          icon={<Dumbbell className="h-4 w-4" />}
            title="운동 일정"
            state={planTile.state}
            badge={planTile.badge}
            lines={planTile.lines}
            extra={
              /* 얼마나 했는지 — 숫자만 있으면 남은 양이 잘 안 와닿는다 */
              <span className="mt-3 block">
                <span className="block h-2 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full bg-sky/60"
                    style={{
                      width: `${
                        exerciseTotal > 0 ? (exerciseDone / exerciseTotal) * 100 : 0
                      }%`,
                    }}
                  />
                </span>
                <span className="mt-1.5 block text-[10px] text-muted/70">
                  {exerciseDone}/{exerciseTotal} 완료
                </span>
              </span>
            }
            action="트레이닝에서 운동하기"
          />
        ) : (
          <HomeTile
            icon={<Dumbbell className="h-4 w-4" />}
            title="운동 일정"
            state={planTile.state}
            badge={planTile.badge}
            lines={planTile.lines}
            action={picked.halted || !core.hasLogs ? '자세히 보기' : '일정 만들기'}
            modalTitle="오늘 운동 일정 만들기"
            modalDescription="만든 일정은 오늘 하루 그대로 남고, 내일이 되면 다시 만들 수 있습니다."
          >
            {picked.halted ? (
              <div className="space-y-2">
                <p className="text-sm font-bold text-warn">
                  오늘은 운동을 처방하지 않았습니다
                </p>
                <p className="text-sm leading-relaxed text-warn">
                  {picked.haltReason ??
                    '통증 신호가 있어 훈련 조언을 만들지 않았습니다.'}{' '}
                  통증이 있는 날은 쉬는 것이 가장 좋은 훈련입니다. 통증이 아니라면
                  오늘 체크인에서 상태를 고쳐주세요.
                </p>
              </div>
            ) : !core.hasLogs ? (
              <div className="space-y-2">
                <p className="text-sm font-bold text-ink">
                  투구 기록이 있어야 운동을 고를 수 있습니다
                </p>
                <p className="text-sm leading-relaxed text-muted">
                  최근 투구량과 몸 상태를 봐야 오늘 무리가 안 되는 운동을 고를 수
                  있습니다. ‘오늘 투구’에 먼저 남겨주세요. 안 던진 날이라면 그것도
                  한 번 눌러 남기면 됩니다.
                </p>
              </div>
            ) : (
              planFormEl
            )}
          </HomeTile>
        )}

        <HomeTile
          tone="recovery"
          icon={<Settings2 className="h-4 w-4" />}
          title="트레이닝 설정"
          state={settingsSet ? 'done' : 'todo'}
          badge={settingsSet ? '완료' : '아직'}
          lines={
            settingsSet
              ? [
                  `경력 ${user.trainingLevel}`,
                  `가진 장비 ${user.ownedEquipment.length}개`,
                  '한 번 정해두면 그대로 갑니다.',
                ]
              : [
                  `경력 ${user.trainingLevel ?? '미설정'}`,
                  user.ownedEquipment.length > 0
                    ? `가진 장비 ${user.ownedEquipment.length}개`
                    : '가진 장비 미설정',
                  '정해두면 경력에 맞고 실제로 할 수 있는 운동만 골라드립니다.',
                ]
          }
          extra={
            /*
             * 가진 장비를 이름으로 보여준다. '8개'만 적어두면 무엇을 가졌다고
             * 해뒀는지 창을 열어야 알 수 있는데, 운동이 이상하게 골라졌을 때
             * 제일 먼저 의심하는 것이 여기다.
             */
            user.ownedEquipment.length > 0 ? (
              <span className="mt-3 flex flex-wrap gap-1">
                {user.ownedEquipment.slice(0, 8).map((eq) => (
                  <span
                    key={eq}
                    className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted"
                  >
                    {eq}
                  </span>
                ))}
                {user.ownedEquipment.length > 8 && (
                  <span className="px-1 py-0.5 text-[10px] text-muted/70">
                    외 {user.ownedEquipment.length - 8}개
                  </span>
                )}
              </span>
            ) : undefined
          }
          action={settingsSet ? '고치기' : '설정하기'}
          modalTitle="트레이닝 설정"
          modalDescription="어쩌다 한 번 고치는 것들입니다. 오늘 쓸 장비는 일정을 만들 때 따로 고릅니다."
        >
          <TrainingSettingsForm
            trainingLevel={user.trainingLevel}
            ownedEquipment={user.ownedEquipment}
            returnTo="/today"
          />
        </HomeTile>
      </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-heading px-1 text-xl text-ink">돌아보기</h2>
        <SummaryPanel
        pitching={{
          ratio: facts.load.ratio,
          zone: facts.load.zone,
          waiting: core.hasLogs ? '기록을 쌓는 중' : '기록하면 나옵니다',
        }}
        training={{
          ratio: training.ratio,
          zone: training.zone,
          waiting:
            training.historyDays > 0 ? '기록을 쌓는 중' : '운동을 체크하면 나옵니다',
        }}
        week={{
          pitches: facts.volume.current.totalPitches,
          throwDays: facts.volume.current.activeDays,
          workoutDays: training.recentDays,
          workoutMinutes: training.recentMinutes,
        }}
        recent={summaryRecent}
        />
      </div>
      </div>
    </div>
  );
}
