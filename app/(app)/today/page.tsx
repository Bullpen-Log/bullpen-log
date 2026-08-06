import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { createPlaybackUrls } from '@/lib/storage';
import { toDateKey } from '@/lib/pitch-stats';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { selectCandidates, MIN_CANDIDATES } from '@/lib/report/prescription';
import { pickForToday } from '@/lib/report/today-pick';
import { Card, EmptyState, PageHeading } from '@/components/ui';
import type { AiReportBody } from '@/lib/ai/report-prompt';
import { Sparkles } from 'lucide-react';
import { TodayList, type TodayExercise } from './today-client';

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다. */
function now() {
  return new Date();
}

export default async function TodayPage() {
  const user = await requireUser();
  const today = now();
  const todayKey = toDateKey(today);

  const { facts, plan, hasLogs } = await gatherFactsAndPlan(user, today);

  const [library, doneLogs, todayReport] = await Promise.all([
    prisma.exerciseVideo.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.userExerciseLog.findMany({
      where: {
        userId: user.id,
        date: new Date(`${todayKey}T00:00:00.000Z`),
        completed: true,
      },
      select: { exerciseId: true },
    }),
    /*
     * 오늘 만든 리포트가 있으면 거기에 훈련 설명이 들어 있다.
     * 여기서 AI를 새로 부르지는 않는다 — 저장된 것을 읽을 뿐이라
     * 화면을 열 때마다 돈이 나가지 않는다.
     */
    prisma.aiReport.findUnique({
      where: {
        userId_asOf: {
          userId: user.id,
          asOf: new Date(`${todayKey}T00:00:00.000Z`),
        },
      },
      select: { halted: true, body: true },
    }),
  ]);

  const picked = selectCandidates({ facts, plan, library });

  /*
   * 리포트를 만든 뒤에 통증을 입력했다면 처방이 멈춘다.
   * 그때는 예전 설명을 보여주면 안 되므로 함께 감춘다.
   */
  const aiTraining =
    !todayReport?.halted && !picked.halted
      ? ((todayReport?.body as AiReportBody | null)?.training ?? null)
      : null;
  const doneIds = new Set(doneLogs.map((d) => d.exerciseId));
  const todayPlan = plan.days[0] ?? null;

  // 후보에는 화면에 필요한 필드(설명·썸네일)가 없으므로 원본에서 다시 찾는다.
  const byId = new Map(library.map((ex) => [ex.id, ex]));

  // 오늘 고른 부위가 있으면 그쪽부터 채운다. (규칙은 lib/report/today-pick.ts)
  const preferredParts = facts.condition.today?.preferredParts ?? [];
  const chosen = pickForToday({
    candidates: picked.candidates,
    doneIds,
    preferredParts,
  });

  const full = chosen.map((c) => byId.get(c.id)).filter((ex) => ex != null);

  const thumbUrls = await createPlaybackUrls(
    full.map((ex) => ex.thumbPath).filter((p): p is string => !!p)
  );

  const exercises: TodayExercise[] = full.map((ex) => ({
    id: ex.id,
    title: ex.title,
    category: ex.category,
    description: ex.description,
    bodyParts: ex.bodyParts,
    intensity: ex.intensity,
    difficulty: ex.difficulty,
    equipment: ex.equipment,
    thumbUrl: ex.thumbPath ? (thumbUrls[ex.thumbPath] ?? null) : null,
    done: doneIds.has(ex.id),
  }));

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="AI Training"
        title="AI 개인맞춤 트레이닝"
        description="오늘 몸 상태와 최근 투구량에 맞춰 고른 운동입니다. 마친 것은 눌러서 표시해주세요."
      />

      {/* 오늘의 투구 계획 — 운동과 같은 근거에서 나온다 */}
      {todayPlan && !plan.halted && (
        <Card className="flex flex-wrap items-center gap-x-3 gap-y-1 py-4">
          <span className="text-xs font-medium uppercase tracking-wider text-sky">
            오늘 투구
          </span>
          <span className="text-sm font-semibold text-ink">
            {todayPlan.throwing
              ? `${todayPlan.maxPitches}구 이하 · 강도 ${todayPlan.maxIntensity} 이하`
              : '휴식'}
          </span>
          <span className="text-xs text-muted">{todayPlan.reason}</span>
        </Card>
      )}

      {/* 왜 오늘 이런 구성인지 — 고르는 건 코드, 설명은 AI가 한다 */}
      {aiTraining && (
        <Card className="space-y-2 border-sky-soft/60 bg-sky-tint">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-strong">
            <Sparkles className="h-3.5 w-3.5" />
            오늘의 훈련
          </p>
          <p className="text-base font-bold leading-snug text-ink">
            {aiTraining.focus}
          </p>
          <p className="text-sm leading-relaxed text-ink/80">{aiTraining.why}</p>
        </Card>
      )}

      {picked.halted ? (
        <Card className="space-y-2 border-warn-line bg-warn-bg">
          <p className="text-sm font-bold text-warn">
            오늘은 운동을 처방하지 않았습니다
          </p>
          <p className="text-sm leading-relaxed text-warn">
            {picked.haltReason ??
              '통증 신호가 있어 훈련 조언을 만들지 않았습니다.'}{' '}
            통증이 있는 날은 쉬는 것이 가장 좋은 훈련입니다. 통증이 아니라면{' '}
            <Link href="/dashboard" className="font-semibold underline">
              오늘 체크인
            </Link>
            에서 상태를 고쳐주세요.
          </p>
        </Card>
      ) : !hasLogs ? (
        <EmptyState
          title="투구 기록이 있어야 운동을 고를 수 있습니다"
          description="최근 투구량과 몸 상태를 봐야 오늘 무리가 안 되는 운동을 고를 수 있습니다."
          action={
            <Link
              href="/pitch-log"
              className="rounded-xl bg-sky px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
            >
              투구 기록하러 가기
            </Link>
          }
        />
      ) : exercises.length === 0 ? (
        <EmptyState
          title="지금 조건에 맞는 운동이 없습니다"
          description="오늘 상태에서 안전하게 할 수 있는 운동이 라이브러리에 아직 없습니다. 낮은 강도의 회복·가동성 운동이 채워지면 이곳에 표시됩니다."
        />
      ) : (
        <>
          <TodayList exercises={exercises} />

          {/* 후보가 빠듯하면 숨기지 않고 알린다. */}
          {picked.tooFew && (
            <p className="rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-[13px] leading-relaxed text-warn">
              오늘 조건을 통과한 운동이 {picked.candidates.length}개뿐입니다(권장{' '}
              {MIN_CANDIDATES}개 이상). 낮은 강도 운동이 더 채워지면 더 알맞게 고를 수
              있습니다.
            </p>
          )}

          {/* 왜 이 운동들인지 — 숫자와 규칙을 그대로 보여준다 */}
          <details className="rounded-2xl border border-line bg-surface px-5 py-4">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              왜 이 운동인가요?
            </summary>
            <ul className="mt-3 space-y-1.5">
              {picked.basis.map((b) => (
                <li key={b} className="flex gap-2 text-[13px] leading-relaxed text-muted">
                  <span aria-hidden className="text-sky">—</span>
                  {b}
                </li>
              ))}
            </ul>
            {picked.excluded.length > 0 && (
              <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">
                제외:{' '}
                {picked.excluded.map((e) => `${e.rule} ${e.count}개`).join(' · ')}
              </p>
            )}
          </details>
        </>
      )}
    </div>
  );
}
