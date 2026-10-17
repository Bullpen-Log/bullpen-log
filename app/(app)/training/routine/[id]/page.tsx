import { notFound } from 'next/navigation';
import { BackLink } from '@/components/ui';
import { requireUser } from '@/lib/dal';
import { loadRoutineBuilder } from '@/lib/armcare/routine-builder-load';
import { RoutineBuilder } from './routine-builder';
import { ArmcareInfoProvider } from '../../armcare-info';
import { throwingSide } from '@/lib/armcare/muscle-map';

/**
 * 내 루틴 만들기 · 고치기 — /training/routine/new, /training/routine/<id>.
 *
 * 창(Modal)이 아니라 화면 하나로 둔다. 운동 백이십 개를 훑으며 고르는 일이라, 창
 * 안에서 굴리면 어디까지 봤는지 놓친다(운동 기록을 창으로 띄웠다가 화면으로 옮긴
 * 것과 같은 까닭 — history 를 옮길 때 적어 둔 말).
 *
 * ?add=<운동 id> 로 들어오면 그 운동을 담은 채로 시작한다 — 부위별 보강에서 '이
 * 운동으로 새 루틴 만들기'를 누른 경우다.
 */
export default async function RoutinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { add } = await searchParams;

  const isNew = id === 'new';
  /* 고르는 목록 · 담은 운동은 앱 화면과 같은 곳에서(lib/armcare/routine-builder-load.ts) */
  const data = await loadRoutineBuilder(user.id, id, add);
  if (!data) notFound();

  return (
    <div className="stack-page">
      <BackLink href="/training?view=armcare">암케어</BackLink>

      <div className="space-y-2 pb-1 desk:border-b desk:border-line desk:pb-6">
        <h1 className="text-heading page-title text-ink">
          {isNew ? '새 루틴 만들기' : '루틴 고치기'}
        </h1>
        <p className="text-sm break-keep text-muted">
          운동을 담고 세트와 차례를 정하세요.
        </p>
      </div>

      {/* 근육 칩을 누르면 그 근육의 3D 그림·설명 창(armcare-info.tsx) */}
      <ArmcareInfoProvider side={throwingSide(user.throwingHand)}>
        <RoutineBuilder
          id={data.id}
          initialName={data.name}
          initialItems={data.items}
          exercises={data.exercises}
          full={data.full}
          droppedHidden={data.droppedHidden}
        />
      </ArmcareInfoProvider>
    </div>
  );
}
