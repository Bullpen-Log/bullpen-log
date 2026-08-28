import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { loadTodayCore } from '@/lib/report/today-data';
import { DEFAULT_WORKOUT_MINUTES } from '@/lib/report/theme';
import { availableParts } from '@/lib/report/today-pick';
import { pickCheckinParts } from '@/lib/checkin';
import { Card, PageHeading } from '@/components/ui';
import { CheckinCard, type CheckinData } from '@/components/checkin-card';
import { PlanForm, TrainingSettings } from '@/components/training-forms';
import { TodayChecklist } from './today-checklist';
import { TodayRecord } from './today-record';

/**
 * 홈 — 오늘 남길 것.
 *
 * 예전에는 이 화면 하나가 체크인·투구 기록·운동 목록·근거 패널을 다 들고 있었다.
 * 631줄이었고, 운동 하나를 체크하려면 스크롤을 한참 내려야 했다.
 *
 * '남기는 것'과 '하는 것'으로 갈랐다. 여기서는 오늘 무엇을 남겼는지 보여주고,
 * 실제 운동 목록과 체크는 트레이닝으로 옮겼다. 일정 만들기만 양쪽에 다 둔다 —
 * 하루를 시작하며 만들 수도 있고, 운동하러 들어가서 만들 수도 있어야 한다.
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
     * 체크인 카드가 최근 며칠을 함께 보여준다. 시간대 차이로 서버가 보는
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

  // 체크인 카드가 쓰는 모양으로 바꾼다.
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

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Home"
        title={`${user.nickname}님, 오늘도 던져볼까요`}
        description="오늘 몸 상태와 던진 것을 남겨주세요. 운동은 트레이닝에서 합니다."
      />

      {/* 무엇이 남았는지 먼저 보여준다. 이 화면의 목차 노릇도 한다. */}
      <TodayChecklist
        checkedIn={core.hasCheckinToday}
        recorded={todayLog != null}
        exerciseTotal={exerciseTotal}
        exerciseDone={exerciseDone}
      />

      <TrainingSettings
        trainingLevel={user.trainingLevel}
        trainingGoal={user.trainingGoal}
        ownedEquipment={user.ownedEquipment}
        returnTo="/today"
      />

      {/*
        최근 메모에 통증 같은 표현이 있었던 경우.
        운동이 왜 가벼운 것만 나오는지 모르면 고장으로 보인다.
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
            통증이 있다면 던지지 말고 전문의와 상담하세요. 통증이 아니라면 아래 체크인을
            남겨주시면 바로 평소 계획으로 돌아갑니다.
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
        오늘 컨디션 체크인.
        오늘 무엇을 고를지 정하는 입력이라 투구 기록보다 앞에 둔다.
      */}
      <CheckinCard recent={checkinData} parts={libraryParts} />

      {/*
        오늘의 투구 — 계획과 기록을 한 카드에 둔다.

        계획만 세워주고 지켰는지 아무도 안 보면 그 계획은 장식이다.
        나란히 두면 넘겼는지 바로 보인다.
      */}
      <Card className="space-y-3 py-4">
        {/*
          계획은 오늘 기록을 넣기 전 기준으로 보여준다.

          넣고 나면 '휴식'으로 바뀌는데(이미 던졌으니 더 쉬라는 뜻이다),
          바로 아래 "45구 기록" 옆에 "오늘 계획: 휴식"이 있으면 서로 어긋나
          보인다. 아침에 본 계획을 그대로 두고, 넘겼으면 아래에서 알린다.
        */}
        {showPlannedToday && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-sky">
              오늘 투구
            </span>
            <span className="text-sm font-semibold text-ink">
              {plannedToday.throwing
                ? `${plannedToday.maxPitches}구 이하 · 강도 ${plannedToday.maxIntensity} 이하`
                : '휴식'}
            </span>
            <span className="text-xs text-muted">{plannedToday.reason}</span>
          </div>
        )}
        <div className={showPlannedToday ? 'border-t border-line pt-3' : ''}>
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
      </Card>

      {/*
        운동 일정 만들기.

        여기서는 만들기만 한다. 만들고 나면 트레이닝으로 가라고 말한다 —
        목록을 여기에도 그리면 화면이 다시 둘로 나누기 전으로 돌아간다.
      */}
      <Card className="space-y-4 py-4">
        {picked.halted ? (
          <>
            <p className="text-sm font-bold text-warn">
              오늘은 운동을 처방하지 않았습니다
            </p>
            <p className="text-sm leading-relaxed text-warn">
              {picked.haltReason ??
                '통증 신호가 있어 훈련 조언을 만들지 않았습니다.'}{' '}
              통증이 있는 날은 쉬는 것이 가장 좋은 훈련입니다. 통증이 아니라면 위
              체크인에서 상태를 고쳐주세요.
            </p>
          </>
        ) : !core.hasLogs ? (
          <>
            <p className="text-sm font-bold text-ink">
              투구 기록이 있어야 운동을 고를 수 있습니다
            </p>
            <p className="text-sm leading-relaxed text-muted">
              최근 투구량과 몸 상태를 봐야 오늘 무리가 안 되는 운동을 고를 수 있습니다.
              위에 오늘 투구를 먼저 남겨주세요.
            </p>
          </>
        ) : savedPlan == null ? (
          <>
            <div className="space-y-1">
              <p className="text-lg font-bold text-ink">오늘 운동 일정을 만들어보세요</p>
              <p className="text-sm leading-relaxed text-muted">
                최근 투구량{core.hasCheckinToday ? '과 오늘 몸 상태' : ''}에 맞춰 오늘
                할 운동을 골라드립니다. 만든 일정은 오늘 하루 그대로 남고, 내일이
                되면 다시 만들 수 있습니다.
              </p>
            </div>
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
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-lg font-bold text-ink">오늘은 {savedPlan.theme.label}</p>
              <p className="text-sm text-muted">
                {exerciseTotal}종목 · 약 {savedPlan.estimatedMinutes}분
                {exerciseDone > 0 && ` · ${exerciseDone}개 완료`}
              </p>
            </div>
            <p className="text-sm leading-relaxed text-muted">{savedPlan.theme.reason}</p>
            <Link
              href="/training"
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
            >
              트레이닝에서 운동하기
              <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
