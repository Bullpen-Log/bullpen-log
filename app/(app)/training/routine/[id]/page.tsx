import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireUser } from '@/lib/dal';
import { visibleExercises } from '@/lib/library-cache';
import { formatPrescription } from '@/lib/exercise-meta';
import { ARMCARE_CATEGORY, primaryArea } from '@/lib/armcare/anatomy';
import { armcareMinutes } from '@/lib/armcare/routine';
import { methodOf } from '@/lib/armcare/methods';
import { loadMyRoutine, loadMyRoutines } from '@/lib/armcare/my-routines-store';
import {
  MY_ROUTINE_MAX,
  MY_ROUTINE_SETS_MAX,
  MY_ROUTINE_SETS_MIN,
} from '@/lib/armcare/my-routines';
import { toArmcareViews } from '../../armcare-views';
import { RoutineBuilder, type BuilderExercise } from './routine-builder';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clampSets = (n: number) =>
  Math.min(MY_ROUTINE_SETS_MAX, Math.max(MY_ROUTINE_SETS_MIN, Math.round(n)));

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
  const routine = !isNew && UUID.test(id) ? await loadMyRoutine(user.id, id) : null;
  if (!isNew && !routine) notFound();

  const [library, mine] = await Promise.all([
    visibleExercises(),
    isNew ? loadMyRoutines(user.id) : Promise.resolve([]),
  ]);
  const armcare = library.filter((ex) => ex.category === ARMCARE_CATEGORY);
  const views = await toArmcareViews(armcare);

  const exercises: BuilderExercise[] = armcare.map((ex, i) => {
    const muscles = ex.targetMuscles ?? [];
    const one = formatPrescription({ ...ex, sets: 1 });
    return {
      view: views[i],
      defaultSets: clampSets(ex.sets ?? 2),
      area: primaryArea(muscles)?.key ?? null,
      method: methodOf(ex.title).key,
      minutes: [1, 2, 3, 4, 5].map((s) =>
        armcareMinutes({ ...ex, targetMuscles: muscles }, s)
      ),
      /* '1세트 × 10회 …'에서 세트를 뗀 것 — 세트는 이 화면에서 따로 고른다 */
      dose: one ? one.replace(/^1세트 × /, '') : null,
    };
  });
  const known = new Set(armcare.map((ex) => ex.id));

  const initialItems = routine
    ? routine.items.filter((it) => known.has(it.exerciseId))
    : typeof add === 'string' && known.has(add)
      ? [
          {
            exerciseId: add,
            sets: exercises.find((e) => e.view.id === add)!.defaultSets,
          },
        ]
      : [];

  return (
    <div className="space-y-6">
      <Link
        href="/training?view=armcare"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-sky"
      >
        <ArrowLeft className="h-4 w-4" />
        암케어
      </Link>

      <div className="space-y-2 border-b border-line pb-6">
        <h1 className="text-heading text-[1.75rem] leading-[1.15] text-ink sm:text-[2.25rem]">
          {isNew ? '새 루틴 만들기' : '루틴 고치기'}
        </h1>
        <p className="text-sm leading-relaxed break-keep text-muted">
          필요한 운동만 골라 담고 세트와 차례를 정하세요. 만든 루틴은 암케어의 루틴
          칸에서 언제든 열어 체크하며 합니다.
        </p>
      </div>

      <RoutineBuilder
        id={routine?.id ?? null}
        initialName={routine?.name ?? ''}
        initialItems={initialItems}
        exercises={exercises}
        full={isNew && mine.length >= MY_ROUTINE_MAX}
        droppedHidden={routine ? routine.items.length - initialItems.length : 0}
      />
    </div>
  );
}
