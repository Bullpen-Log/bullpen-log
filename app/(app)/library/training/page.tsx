import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { loadExerciseLibrary } from '@/lib/library-load';
import { TrainingClient, type ExerciseItem } from './training-client';
import { BodyPartsProvider } from '@/components/body-parts';
import { throwingSide } from '@/lib/armcare/muscle-map';
import { ArmcareInfoProvider } from '@/app/(app)/training/armcare-info';

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ web?: string }> }) {
  const user = await requireUser();

  /* 새 아이폰 앱(Expo)이 라이브러리를 아는 판(BullpenNative/7 부터)이면 앱 화면으로 연다(native/src/app/library/training.tsx) */
  /* ?web=1 — 앱 관리자가 '편집'으로 웹 화면을 연다(운동 · 드릴 고치기는 웹에만 있다, 2026-10-20 대조 검토) */
  if ((await searchParams).web !== '1' && expoLevel((await headers()).get('user-agent')) >= 7) return <OpenNative path="/library/training" cover={false} />;

  const isAdmin = user.role === 'ADMIN';

  /*
   * 지우기 전에 보여줄 '이 운동을 한 기록 수'.
   *
   * 예전에는 405줄마다 따로 세게 했다(include: { _count }). 관리자만 지울 수
   * 있는데 모든 사람의 화면에 그 값이 실려 나갔다. 관리자일 때만, 그것도
   * 한 번의 집계로 센다.
   */
  const [{ exercises, warmupFolders }, counted] = await Promise.all([
    /* 목록 · 별 · 내 메모 · 워밍업 폴더 — 앱(app-library.ts)과 같은 함수 */
    loadExerciseLibrary(user.id, isAdmin),
    isAdmin
      ? prisma.userExerciseLog.groupBy({ by: ['exerciseId'], _count: { _all: true } })
      : Promise.resolve([]),
  ]);
  const usedCounts = new Map(counted.map((row) => [row.exerciseId, row._count._all]));
  const items: ExerciseItem[] = exercises.map((ex) => ({ ...ex, usedCount: usedCounts.get(ex.id) ?? 0 }));

  // 제목과 탭은 라이브러리 레이아웃이 그린다.
  /*
   * 부위 태그를 누르면 전신 3D(components/body-parts.tsx), 암케어 운동의 근육 칩을 누르면
   * 그 근육의 3D 그림·설명(armcare-info.tsx) — 2026-09-26 사용자분: 모든 운동 영상에.
   */
  return (
    <BodyPartsProvider>
      <ArmcareInfoProvider side={throwingSide(user.throwingHand)}>
        <TrainingClient exercises={items} isAdmin={isAdmin} warmupFolders={warmupFolders} />
      </ArmcareInfoProvider>
    </BodyPartsProvider>
  );
}
