'use server';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { listOwnLabAnalyses, loadLabJob } from '@/lib/pitch-lab';
import { withMechanicsTransaction } from '@/lib/mechanics/store';
import { readProgramState, programStateJson, focusRunId } from '@/lib/mechanics/program';
import { loadAnalysisSnapshot } from '@/lib/mechanics/analysis-load';
import { loadCurrentMechanicsFold } from '@/lib/mechanics/load';
import { skillPainToday } from '@/lib/mechanics/progression';
import { addFollowup, baselineReady, REVIEW_CHOICES, type ComparisonConditions, type ReviewChoice } from '@/lib/mechanics/comparison';

type Result = { ok: true } | { error: string };
export async function loadMechanicsReviewOptions(input: { runId: string }) {
  const user = await requireUser();
  const row = await prisma.mechanicsProgram.findUnique({ where: { userId: user.id } });
  const focus = row ? readProgramState(row.progress).focus : null;
  if (!focus || focusRunId(focus) !== input?.runId) return { error: '처방이 바뀌었어요. 다시 불러와 주세요.' } as const;
  return { options: await listOwnLabAnalyses(user.id) };
}
export async function linkMechanicsAnalysis(input: {
  runId: string;
  reviewId: string | null;
  reportId: string;
  jobId: string;
  mode: 'baseline' | 'followup';
  conditions: ComparisonConditions;
}): Promise<Result> {
  const user = await requireUser();
  if (!input || !['baseline', 'followup'].includes(input.mode) || !['same', 'different', 'unknown'].includes(input.conditions))
    return { error: '연결 방법과 촬영 조건을 확인해 주세요.' };
  const loaded = await loadAnalysisSnapshot(user, input.reportId, input.jobId);
  if ('error' in loaded) return { error: loaded.error ?? '분석을 읽지 못했어요.' };
  return withMechanicsTransaction(user.id, async (tx) => {
    const row = await tx.mechanicsProgram.findUnique({ where: { userId: user.id } });
    const state = row ? readProgramState(row.progress) : null,
      focus = state?.focus;
    if (!state || !focus || focusRunId(focus) !== input.runId || (focus.review?.id ?? null) !== input.reviewId)
      return { error: '처방이나 비교 기준이 바뀌었어요. 다시 불러와 주세요.' };
    if (focus.reviewInvalid) return { error: '저장된 비교 정보를 확인할 수 없어 연결을 보류해요.' };
    const current = await loadLabJob(user.id, loaded.snapshot.reportId);
    if (current?.status !== 'done' || current.jobId !== loaded.snapshot.jobId || current.shownJobId !== loaded.snapshot.jobId)
      return { error: '선택한 분석이 바뀌었어요. 결과를 다시 선택해 주세요.' };
    let review = focus.review;
    let history = focus.reviewHistory ?? [];
    if (input.mode === 'baseline') {
      const c = loaded.snapshot.context;
      if (!c || !baselineReady(loaded.snapshot))
        return { error: '분석 당시 원본과 녹화 시작 시각이 보존된 새 분석을 기준으로 선택해 주세요.' };
      if (review) history = [...history, review];
      review = {
        v: 1,
        id: randomUUID(),
        baseline: loaded.snapshot,
        origin: 'later',
        baselinePractice: focus.done,
        followups: [],
        decisions: [],
      };
    } else {
      if (!review) return { error: '비교 기준을 먼저 등록해 주세요.' };
      const next = addFollowup(review, loaded.snapshot, input.conditions, focus.done, appNow().toISOString());
      if ('error' in next) return next;
      review = next;
    }
    await tx.mechanicsProgram.update({
      where: { userId: user.id },
      data: {
        progress: programStateJson({ ...state, focus: { ...focus, review, reviewHistory: history } }) as unknown as Prisma.InputJsonValue,
      },
    });
    revalidatePath('/training');
    return { ok: true };
  });
}
export async function recordMechanicsReviewDecision(input: {
  runId: string;
  reviewId: string;
  reportId: string;
  jobId: string;
  choice: ReviewChoice;
}): Promise<Result> {
  const user = await requireUser();
  if (!input || !Object.hasOwn(REVIEW_CHOICES, input.choice)) return { error: '처방 검토 방법을 골라 주세요.' };
  return withMechanicsTransaction(user.id, async (tx) => {
    const row = await tx.mechanicsProgram.findUnique({ where: { userId: user.id } });
    const state = row ? readProgramState(row.progress) : null,
      focus = state?.focus,
      review = focus?.review;
    if (!state || !focus || focusRunId(focus) !== input.runId || !review || review.id !== input.reviewId)
      return { error: '처방이나 비교 기준이 바뀌었어요.' };
    const followup = review.followups.find((f) => f.snapshot.reportId === input.reportId && f.snapshot.jobId === input.jobId);
    if (!followup) return { error: '먼저 이 분석을 연결해 주세요.' };
    if (review.decisions.some((d) => d.reportId === input.reportId && d.jobId === input.jobId && d.choice === input.choice))
      return { ok: true };
    if (input.choice === 'new' && !followup.snapshot.hasRx)
      return { error: '이 결과에는 시작할 자동 처방이 없어요. 리포트를 확인해 주세요.' };
    let progression = focus.progression;
    if (input.choice === 'practice') {
      if (!progression) return { error: '이전 진행 방식은 새 진행 기준으로 전환한 뒤 다시 연습해 주세요.' };
      const today = toDateKey(appNow());
      const blocked = await loadCurrentMechanicsFold(user.id, tx);
      if (blocked) return { error: blocked.reason };
      if (skillPainToday(progression, today) || state.practice?.some((p) => p.on === today && p.response === 'pain'))
        return { error: '오늘 통증 반응이 있어 재연습 전환을 보류해요.' };
      if (state.attempt && state.attempt.on === today && !state.attempt.completed && state.attempt.doneIds.length)
        return { error: '진행 중인 세션을 먼저 마쳐 주세요.' };
      progression = {
        ...progression,
        elements: progression.elements.map((e) => ({ ...e, finished: false, reviewFrom: progression!.evidence.length })),
      };
    }
    await tx.mechanicsProgram.update({
      where: { userId: user.id },
      data: {
        progress: programStateJson({
          ...state,
          attempt: input.choice === 'practice' ? null : state.attempt,
          focus: {
            ...focus,
            progression,
            review: {
              ...review,
              decisions: [
                ...review.decisions,
                { reportId: input.reportId, jobId: input.jobId, choice: input.choice, on: appNow().toISOString() },
              ],
            },
          },
        }) as unknown as Prisma.InputJsonValue,
      },
    });
    revalidatePath('/training');
    return { ok: true };
  });
}
