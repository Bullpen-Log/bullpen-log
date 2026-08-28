import { ClipboardList, Dumbbell, Settings2, Target } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { loadTodayCore } from '@/lib/report/today-data';
import { DEFAULT_WORKOUT_MINUTES } from '@/lib/report/theme';
import { availableParts } from '@/lib/report/today-pick';
import { CHECKIN_PARTS, hasPain, pickCheckinParts } from '@/lib/checkin';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { Card, PageHeading } from '@/components/ui';
import { CheckinForm, type CheckinData } from '@/components/checkin-form';
import { PlanForm, TrainingSettingsForm } from '@/components/training-forms';
import { HomeTile, HomeTileLink, type TileState } from './home-tile';
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
  const [{ plan: planBeforeToday }, todayLog, recentCheckins] = await Promise.all([
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
      },
    }),
    /*
     * 체크인 창이 최근 며칠을 함께 보여준다. 시간대 차이로 서버가 보는
     * '오늘'과 사용자가 보는 '오늘'이 다를 수 있어 넉넉히 가져온다.
     */
    prisma.dailyCheckin.findMany({
      where: {
        userId: user.id,
        date: { gte: new Date(core.midnight.getTime() - 10 * 86400000) },
      },
      orderBy: { date: 'desc' },
      take: 3,
    }),
  ]);

  // 체크인 창이 쓰는 모양으로 바꾼다.
  const checkinData: CheckinData[] = recentCheckins.map((c) => ({
    date: c.date.toISOString().slice(0, 10),
    ...pickCheckinParts(c),
    condition: c.condition,
    sleep: c.sleep,
    preferredParts: c.preferredParts,
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
  const plannedToday = planBeforeToday.days[0] ?? null;
  const showPlannedToday = plannedToday != null && !planBeforeToday.halted;

  const exerciseTotal = shownPicks.length;
  const exerciseDone = shownPicks.filter((p) => doneIds.has(p.exerciseId)).length;

  /* ─────────────────── 상자 넷에 적을 내용 ─────────────────── */

  const settingsSet =
    user.trainingLevel != null &&
    user.trainingGoal != null &&
    user.ownedEquipment.length > 0;

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
          painToday ? `${painParts.join('·')} 통증` : '아픈 곳 없음',
          ...(checkinToday.preferredParts.length > 0
            ? [`하고 싶은 부위 ${checkinToday.preferredParts.join('·')}`]
            : []),
        ]
      : [
          '30초면 됩니다.',
          '오늘 컨디션과 아픈 곳을 남기면, 그에 맞춰 운동을 골라드립니다.',
        ],
  };

  const pitchTile = {
    state: (todayLog ? 'done' : 'todo') as TileState,
    badge: todayLog ? '완료' : '아직',
    lines: [
      showPlannedToday
        ? plannedToday.throwing
          ? `계획 ${plannedToday.maxPitches}구 이하 · 강도 ${plannedToday.maxIntensity} 이하`
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
          `${exerciseTotal}종목 · 약 ${savedPlan.estimatedMinutes}분`,
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
                `최근 투구량${core.hasCheckinToday ? '과 오늘 몸 상태' : ''}에 맞춰 오늘 할 운동을 골라드립니다.`,
              ],
      };

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
      generated={false}
      returnTo="/today"
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
        오늘 할 넷.

        순서는 하루의 순서다 — 몸 상태를 먼저 남기고(체크인), 던진 것을 남기고,
        그 둘을 근거로 운동 일정을 만든다. 설정은 어쩌다 한 번이라 끝에 둔다.
      */}
      <div className="grid gap-4 sm:grid-cols-2">
        <HomeTile
          icon={<ClipboardList className="h-4 w-4" />}
          title="오늘 체크인"
          state={checkinTile.state}
          badge={checkinTile.badge}
          lines={checkinTile.lines}
          action={checkinToday ? '보기 · 고치기' : '체크인하기'}
          modalTitle="오늘 컨디션 체크인"
          modalDescription="30초면 됩니다. 리포트와 운동 추천의 기준이 됩니다."
        >
          <CheckinForm recent={checkinData} parts={libraryParts} />
        </HomeTile>

        <HomeTile
          icon={<Target className="h-4 w-4" />}
          title="오늘 투구"
          state={pitchTile.state}
          badge={pitchTile.badge}
          lines={pitchTile.lines}
          action={todayLog ? '보기 · 고치기' : '기록하기'}
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
              <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wider text-sky">
                  오늘 계획
                </p>
                <p className="mt-1 text-sm font-semibold text-ink">
                  {plannedToday.throwing
                    ? `${plannedToday.maxPitches}구 이하 · 강도 ${plannedToday.maxIntensity} 이하`
                    : '휴식'}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  {plannedToday.reason}
                </p>
              </div>
            )}
            <TodayRecord
              date={core.todayKey}
              log={todayLog}
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
            icon={<Dumbbell className="h-4 w-4" />}
            title="운동 일정"
            state={planTile.state}
            badge={planTile.badge}
            lines={planTile.lines}
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
          icon={<Settings2 className="h-4 w-4" />}
          title="트레이닝 설정"
          state={settingsSet ? 'done' : 'todo'}
          badge={settingsSet ? '완료' : '아직'}
          lines={
            settingsSet
              ? [
                  `경력 ${user.trainingLevel} · 목표 ${user.trainingGoal}`,
                  `가진 장비 ${user.ownedEquipment.length}개`,
                  '한 번 정해두면 그대로 갑니다.',
                ]
              : [
                  `경력 ${user.trainingLevel ?? '미설정'} · 목표 ${user.trainingGoal ?? '미설정'}`,
                  user.ownedEquipment.length > 0
                    ? `가진 장비 ${user.ownedEquipment.length}개`
                    : '가진 장비 미설정',
                  '정해두면 경력에 맞고 실제로 할 수 있는 운동만 골라드립니다.',
                ]
          }
          action={settingsSet ? '고치기' : '설정하기'}
          modalTitle="트레이닝 설정"
          modalDescription="어쩌다 한 번 고치는 것들입니다. 오늘 쓸 장비는 일정을 만들 때 따로 고릅니다."
        >
          <TrainingSettingsForm
            trainingLevel={user.trainingLevel}
            trainingGoal={user.trainingGoal}
            ownedEquipment={user.ownedEquipment}
            returnTo="/today"
          />
        </HomeTile>
      </div>
    </div>
  );
}
