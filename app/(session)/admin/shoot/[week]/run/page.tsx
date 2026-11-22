import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/dal';
import { loadShootExercises, loadShootWeek } from '@/lib/shoot/load';
import { crewWeek, crewsOf } from '@/lib/shoot/crews';
import { ShootGuideMode } from '@/components/shoot/guide-mode';
import { ButtonLink } from '@/components/ui';
import { shootRunHref } from '@/lib/shoot/guide';
import { itemOf, weekOf } from '@/lib/shoot/plan';
import { weekItems } from '@/lib/shoot/progress';
import { RunClient } from './run-client';

/**
 * 촬영 모드 — 휴대폰(앱) 한 화면. 지금 찍을 운동(번호 · 시범 방법 · 기구 · 참고 영상 · 진행 방법)과 다음 운동,
 * 자리 옮김 · 쉬기 알림, 계획 대비, [찍음 · 다음으로]. (session) 껍데기라 탭 막대 · 사이드바가 없다.
 * ?at=1-23 — 주차 화면의 '이 운동부터'. ?crew=A — 두 사람이 나눠 찍는 주에서 그 사람 몫만(lib/shoot/crews.ts).
 */
export default async function ShootRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ week: string }>;
  searchParams: Promise<{
    at?: string | string[];
    crew?: string | string[];
    mode?: string | string[];
    retake?: string | string[];
    exercise?: string | string[];
    resume?: string | string[];
  }>;
}) {
  const me = await requirePermission('shoot');
  const n = Number((await params).week);
  const data = Number.isInteger(n) ? await loadShootWeek(n) : null;
  if (!data) notFound();
  const { at, crew, mode, retake, exercise, resume } = await searchParams;
  const mine = typeof crew === 'string' && crewsOf(data.week).includes(crew) ? crew : null;
  const scoped = mine ? { ...data, week: crewWeek(data.week, mine) } : data;
  const startAt = typeof at === 'string' ? at : null;
  if (mode === 'guide') {
    return <ShootGuideMode key={`${n}:${mine}:${startAt}`} data={scoped} crew={mine} startAt={startAt} />;
  }
  const resumeAt = typeof resume === 'string' ? resume : null;
  if (retake === '1') {
    const queue = [...weekItems(scoped.week), ...scoped.carried.map(({ item }) => item)];
    let item = typeof exercise === 'string' ? queue.find((it) => it.exerciseId === exercise) : undefined;
    // 완료 체크를 받으면 앞 주에서 넘어온 줄이 사라질 수 있다. 고른 ID로만 계속 연다.
    if (!item && typeof exercise === 'string' && !scoped.week.session) {
      const planned = itemOf(exercise);
      const from = planned && weekOf(planned.week);
      if (planned && from && from.week !== n &&
          (scoped.week.deferred || (from.week < n && !from.session && !!from.outdoor === !!scoped.week.outdoor))) {
        item = planned.item;
      }
    }
    if (!item) {
      return (
        <section className="space-y-4 p-5 text-ink">
          <p role="alert" className="font-semibold">다시 찍을 운동을 찾지 못했어요. 목록에서 다시 골라 주세요.</p>
          <ButtonLink href={shootRunHref(n, mine, resumeAt)}>촬영으로 돌아가기</ButtonLink>
        </section>
      );
    }
    const info = scoped.infos[item.exerciseId] ?? (await loadShootExercises([item.exerciseId])).get(item.exerciseId);
    return (
      <RunClient
        key={`${n}:${mine}:retake:${item.exerciseId}:${resumeAt}`}
        data={scoped}
        crew={mine}
        me={me.nickname}
        startAt={resumeAt}
        initialRetake={{ item, info }}
      />
    );
  }
  return (
    <RunClient
      /* ?at= 만 바뀌어도 새로 — Next 는 같은 쪽을 다시 쓰고 고른 운동(state)이 남아 앱의 '이 운동부터'가 안 먹었다 */
      key={`${n}:${mine}:${startAt}`}
      data={scoped}
      crew={mine}
      me={me.nickname}
      startAt={startAt}
    />
  );
}
