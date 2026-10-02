import { requireAdmin } from '@/lib/dal';
import {
  loadVelocityAdminCalibRun,
  loadVelocityAdminDay,
  loadVelocityAdminOverview,
} from '@/lib/velocity-admin-load';
import { countVelocityRecordings } from '@/lib/velocity-recording-load';
import { parseExplorerPath, type ExplorerPath } from './explorer-path';
import { VelocityAdminView } from './overview-view';

/**
 * 구속 측정 관리자 — 잰 값을 PC 파일 탐색기처럼 폴더로 찾는다.
 *
 *   [원본] › 연도 › 월 › 날짜 › 공 파일(세션 상관없이, 스피드건 10km/h 그룹으로)
 *   [보정] › 연도 › 월 › 날짜 › N차 보정 › 결과 파일(그날 영상을 나중 모델로 다시 잰 것)
 *
 * 폴더는 주소로 고른다(?area=orig|calib&at=2026-09-28&run=<차수>&pick=<공>, explorer-path.ts).
 * 옛 주소의 &s=<세션> 은 이제 세션 폴더가 없어 무시한다. 폰 틀이 아니라 이 저장소의 보통 웹
 * 화면이다(app/(app) 레이아웃이 위 막대 · 도크 · 판을 붙인다). 그리는 것은 overview-view.tsx · explorer.tsx.
 */
export default async function VelocityAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null);
  let path: ExplorerPath = parseExplorerPath(one(sp.area), one(sp.at), one(sp.run));

  /* 날짜 폴더(원본 · 보정)와 차수 폴더는 그날 자료가 있어야 한다 — 보정 재측정 단추가 그날 클립을 쓴다 */
  const dayDate = path.level === 'day' || path.level === 'run' ? path.date : null;
  const [data, day, run, recordings] = await Promise.all([
    loadVelocityAdminOverview(),
    dayDate ? loadVelocityAdminDay(dayDate) : Promise.resolve(null),
    path.level === 'run' ? loadVelocityAdminCalibRun(path.runId) : Promise.resolve(null),
    countVelocityRecordings(),
  ]);

  /* 지워졌거나 다른 날짜의 차수를 가리키는 주소면 그 날짜의 [보정] 폴더로 */
  if (path.level === 'run' && (!run || run.date !== path.date)) {
    path = {
      level: 'day',
      area: 'calib',
      year: path.year,
      month: path.month,
      date: path.date,
    };
  }

  return (
    <VelocityAdminView
      data={data}
      path={path}
      day={day}
      run={path.level === 'run' ? run : null}
      pick={one(sp.pick)}
      recordings={recordings}
    />
  );
}
