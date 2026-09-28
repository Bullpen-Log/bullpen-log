import { Camera } from 'lucide-react';
import type {
  AdminCalibRunView,
  AdminDay,
  AdminOverview,
} from '@/lib/velocity-admin-load';
import { calibrationText } from '@/lib/velocity-calibration';
import { Badge, ButtonLink, Card } from '@/components/ui';
import { PitchLogHeading, VelocityAdminViewSwitch } from '@/app/(app)/videos/pitch-log-heading';
import { BiasChart } from './overview-client';
import { FileMeasureButton } from './file-measure-button';
import { VelocityExplorer } from './explorer';
import { explorerHref, type ExplorerPath } from './explorer-path';
import type { FolderStat } from './explorer-panels';
import { mb, signed } from './format';

/**
 * 구속 측정 관리자 화면(자료를 받아 그리기만 한다). 읽기 · 권한 · 주소 읽기는 page.tsx.
 *
 *   머리 줄 — 투구 기록과 같은 머리(제목 · [캘린더 | 목록 | 구속 측정 관리자] 고르개) + 지금 모델
 *             버전 배지 · 영상 파일로 재기 · 구속 측정 시작. 투구 기록의 한 보기로 읽힌다(2026-09-28
 *             사용자) — 고르개의 캘린더 · 목록을 누르면 투구 기록으로 돌아간다.
 *   숫자 타일 — 모든 자료의 세션 · 공 · 짝 · 클립 · 편향 · p90
 *   탐색기 — [원본] · [보정] › 연도 › 월 › 날짜(› N차 보정) 폴더, 그 안의 공 파일(explorer.tsx)
 *   종합 분석 — 최근 30일 편향 · 보정식 · 설정별
 *   Claude 로 — 자료를 엔진에 되먹이는 법
 */
export function VelocityAdminView({
  data,
  path,
  day,
  run,
  pick,
}: {
  data: AdminOverview;
  path: ExplorerPath;
  /** 날짜 · 차수 폴더일 때 그날 자료(세션 · 공 · 클립 주소) */
  day: AdminDay | null;
  /** [보정] 차수 폴더일 때 그 차수(요약 + 결과 줄) */
  run: AdminCalibRunView | null;
  pick: string | null;
}) {
  const { totals, overall, fit } = data;

  const tiles = [
    { label: '세션', value: String(totals.sessions), unit: '개' },
    { label: '공', value: String(totals.pitches), unit: '구' },
    { label: '스피드건 짝', value: String(totals.pairs), unit: '개' },
    {
      label: '클립',
      value: String(totals.clips),
      unit: totals.clips ? `개 · ${mb(totals.clipBytes)}` : '개',
    },
    { label: '편향(릴리스 − 건)', value: signed(overall.biasKmh), unit: 'km/h' },
    {
      label: 'p90 |오차|',
      value: overall.p90Kmh == null ? '—' : overall.p90Kmh.toFixed(1),
      unit: 'km/h',
    },
  ];

  const rootStat: FolderStat = {
    sessions: totals.sessions,
    users: totals.users,
    pitches: totals.pitches,
    pairs: totals.pairs,
    clips: totals.clips,
    biasKmh: overall.biasKmh,
    p90Kmh: overall.p90Kmh,
    sdKmh: overall.sdKmh,
    maxKmh: data.days.reduce<number | null>(
      (m, d) => (d.maxKmh != null && (m == null || d.maxKmh > m) ? d.maxKmh : m),
      null
    ),
  };

  return (
    <div className="stack-page">
      <PitchLogHeading
        controls={
          <>
            {/* 투구 기록의 '2분할 비교' 자리 — 비워 고르개를 오른쪽에 둔다 */}
            <span />
            <VelocityAdminViewSwitch />
          </>
        }
        action={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* 지금 배포된 구속 측정 모델 — 잰 값 · 보정 차수의 버전과 견준다(Badge 는 title 을 안 받아 감싼다) */}
            <span
              title="구속 측정 모델 버전 — lib/velocity-engine/version.ts"
              className="inline-flex self-start sm:self-auto"
            >
              <Badge className="tabular-nums">모델 v{data.engineVersion}</Badge>
            </span>
            <FileMeasureButton />
            <ButtonLink
              href="/velocity/measure"
              className="inline-flex w-full items-center gap-2 sm:w-auto"
            >
              <Camera aria-hidden className="h-4 w-4" />
              구속 측정 시작
            </ButtonLink>
          </div>
        }
      />

      <StatTiles tiles={tiles} />

      {/* 폴더가 바뀌면 새로 만든다 — 고른 파일 · 정렬 · 찾기가 초기화된다 */}
      <VelocityExplorer
        key={explorerHref(path)}
        tree={data.tree}
        calibTree={data.calibTree}
        rootStat={rootStat}
        engineVersion={data.engineVersion}
        path={path}
        day={day}
        run={run}
        initialPick={pick}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink">종합 분석</h2>
        <div className="grid gap-block lg:grid-cols-5">
          {/* 최근 30일 편향 */}
          <Card className="lg:col-span-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-base font-bold text-ink">최근 30일 편향</h3>
              <span className="text-xs text-muted">
                릴리스 추정 − 스피드건 · 날짜별 평균
              </span>
            </div>
            <div className="mt-4">
              <BiasChart points={data.recent} />
            </div>
          </Card>

          {/* 보정식 */}
          <Card className="lg:col-span-2">
            <h3 className="text-base font-bold text-ink">보정식</h3>
            <p className="mt-1 break-keep text-xs leading-relaxed text-muted">
              전체 짝으로 맞춘 “건 ≈ a × 카메라 + b”. 사람마다 저장할 때 쓰는 식은 그
              사람 짝으로 따로 맞춰요.
            </p>
            <dl className="mt-4 divide-y divide-line">
              <FitRow
                label="보정 전(raw) 기준"
                text={calibrationText(fit.raw)}
                n={fit.raw.n}
              />
              <FitRow
                label="릴리스 추정 기준"
                text={calibrationText(fit.release)}
                n={fit.release.n}
              />
              {overall.sdKmh != null && (
                <div className="flex items-baseline justify-between gap-3 py-2.5">
                  <dt className="text-sm text-muted">오차 표준편차</dt>
                  <dd className="text-sm font-semibold tabular-nums text-ink">
                    {overall.sdKmh.toFixed(1)} km/h
                  </dd>
                </div>
              )}
            </dl>

            <h4 className="mt-5 text-sm font-bold text-ink">설정별</h4>
            {data.bySetup.length === 0 ? (
              <p className="mt-2 text-xs text-muted">아직 잰 것이 없어요.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {data.bySetup.map((s) => (
                  <li
                    key={s.key}
                    className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
                  >
                    <span className="min-w-0 text-sm text-ink sm:truncate">
                      {s.label}
                    </span>
                    <span className="text-xs tabular-nums text-muted sm:shrink-0">
                      {s.pitches}구 · 짝 {s.pairs}
                      {s.biasKmh != null && (
                        <>
                          {' '}
                          · 편향 <span className="text-ink">{signed(s.biasKmh)}</span> ·
                          p90 {s.p90Kmh?.toFixed(1)}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>

      {/* Claude 로 */}
      <Card>
        <h2 className="text-lg font-bold text-ink">데이터를 Claude 로</h2>
        <p className="mt-1 break-keep text-sm leading-relaxed text-muted">
          여기 쌓인 자료(공마다 카메라 값 · 릴리스 추정 · 스피드건 값 · 분석 자료)를
          엔진에 되먹여 정확도를 올려요. 터미널에서{' '}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink">
            npm run velocity:review
          </code>{' '}
          를 돌리면 이 자료를 표 · JSON 으로 뽑아 주고, 그 결과를 Claude 에게 보여 주면
          감지 문턱값 · 공기저항 · 렌즈 가정을 다시 맞출 수 있어요. 그 과정을 되풀이하며
          편향과 p90 이 줄어드는지 이 화면에서 봐요.
        </p>
      </Card>
    </div>
  );
}

/**
 * 숫자 타일 — 휴대폰은 2칸 · 좁은 여백 · 한 단계 작은 숫자, 넓어지면 3칸 · 6칸.
 */
export function StatTiles({
  tiles,
}: {
  tiles: { label: string; value: string; unit: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="min-w-0 bg-surface px-4 py-3 sm:px-5 sm:py-5">
          <p className="truncate text-xs tracking-normal text-muted">{t.label}</p>
          <p className="text-display mt-1 text-xl text-ink sm:mt-2 sm:text-2xl">
            {t.value}
            <span className="ml-1 font-sans text-xs text-muted">{t.unit}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

function FitRow({ label, text, n }: { label: string; text: string | null; n: number }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-ink">
        {text ?? <span className="font-normal text-muted">짝 없음</span>}
        {text && n > 0 && n < 3 && (
          <span className="ml-1 text-xs font-normal text-warn">
            · 셋 미만이라 평균 차만
          </span>
        )}
      </dd>
    </div>
  );
}
