import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireAdmin } from '@/lib/dal';
import { loadVelocityAdminOverview } from '@/lib/velocity-admin-load';
import { calibrationText } from '@/lib/velocity-calibration';
import { Camera } from 'lucide-react';
import { ButtonLink, Card, EmptyState, PageHeading } from '@/components/ui';
import { BiasChart } from './overview-client';
import { FileMeasure } from './file-measure';
import { dayLabel, mb, signed } from './format';

/**
 * 구속 측정 관리자 — 카메라로 잰 값과 스피드건 값을 견줘 정확도를 올리는 자료를 모아 보는 곳.
 *
 * 폰 틀이 아니라 이 저장소의 보통 웹 화면이다(app/(app) 레이아웃이 위 막대 · 도크 · 판을 붙인다).
 * 날짜 하나를 파고드는 화면은 /admin/velocity/<날짜>.
 */
export default async function VelocityAdminPage() {
  await requireAdmin();
  const data = await loadVelocityAdminOverview();
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
    { label: '전체 편향(릴리스 − 건)', value: signed(overall.biasKmh), unit: 'km/h' },
    {
      label: 'p90 |오차|',
      value: overall.p90Kmh == null ? '—' : overall.p90Kmh.toFixed(1),
      unit: 'km/h',
    },
  ];

  return (
    <div className="stack-page">
      <PageHeading
        eyebrow="Bullpen Velocity"
        title="구속 측정 관리자"
        description="카메라로 잰 값과 스피드건 값을 견줘 정확도를 올리는 자료를 관리해요. 측정 자체는 여기서 바로 켤 수 있어요(웹 카메라는 60fps 밑이면 숫자를 내지 않아요 — 폰 앱이나 슬로모션 파일이 정확해요)."
        action={
          <ButtonLink
            href="/velocity/measure"
            className="inline-flex items-center gap-2"
          >
            <Camera aria-hidden className="h-4 w-4" />
            구속 측정 시작
          </ButtonLink>
        }
      />

      {/* 숫자 타일 */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface px-5 py-5">
            <p className="text-xs tracking-normal text-muted">{t.label}</p>
            <p className="text-display mt-2 text-2xl text-ink">
              {t.value}
              <span className="ml-1 font-sans text-xs text-muted">{t.unit}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-block lg:grid-cols-5">
        {/* 최근 30일 편향 */}
        <Card className="lg:col-span-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-ink">최근 30일 편향</h2>
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
          <h2 className="text-lg font-bold text-ink">보정식</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            전체 짝으로 맞춘 “건 ≈ a × 카메라 + b”. 사람마다 저장할 때 쓰는 식은 그 사람
            짝으로 따로 맞춰요(app/actions/velocity.ts).
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
              <div className="flex items-baseline justify-between py-2.5">
                <dt className="text-sm text-muted">오차 표준편차</dt>
                <dd className="text-sm font-semibold tabular-nums text-ink">
                  {overall.sdKmh.toFixed(1)} km/h
                </dd>
              </div>
            )}
          </dl>

          <h3 className="mt-5 text-sm font-bold text-ink">설정별</h3>
          {data.bySetup.length === 0 ? (
            <p className="mt-2 text-xs text-muted">아직 잰 것이 없어요.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {data.bySetup.map((s) => (
                <li
                  key={s.key}
                  className="flex items-baseline justify-between gap-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-ink">{s.label}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
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

      {/* 날짜 목록 */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-ink">날짜별</h2>
          <span className="text-xs text-muted">최근 날짜부터 · 모든 계정</span>
        </div>
        {data.days.length === 0 ? (
          <EmptyState
            title="아직 잰 날이 없어요"
            description="앱에서 구속을 재거나 아래 '영상 파일로 재기'로 첫 자료를 만들어요."
          />
        ) : (
          <div className="space-y-3">
            {data.days.map((d) => (
              <Link
                key={d.date}
                href={`/admin/velocity/${d.date}`}
                className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4 transition-colors duration-75 hover:border-sky-soft hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-bold text-ink">
                      {dayLabel(d.date)}
                    </span>
                    <span className="text-xs text-muted">{d.date}</span>
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    세션 {d.sessions} · 공 {d.pitches} · 짝 {d.pairs} · 클립 {d.clips}
                    {d.users > 1 && ` · ${d.users}명`}
                    {d.maxKmh != null && ` · 최고 ${d.maxKmh} km/h`}
                  </span>
                </span>
                <span className="hidden shrink-0 text-right sm:block">
                  <span className="block text-xs text-muted">편향 · p90</span>
                  <span className="block text-sm font-semibold tabular-nums text-ink">
                    {signed(d.biasKmh)}
                    <span className="mx-1 text-muted">·</span>
                    {d.p90Kmh == null ? '—' : d.p90Kmh.toFixed(1)}
                  </span>
                </span>
                <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 영상 파일로 재기 */}
      <Card>
        <h2 className="text-lg font-bold text-ink">영상 파일로 재기(보정용)</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          폰으로 찍어 둔 슬로모션 영상을 골라 재고, 스피드건 값과 함께 보정용으로
          저장해요. 영상은 클립으로 함께 올라가 날짜 페이지에서 다시 볼 수 있어요.
        </p>
        <div className="mt-5">
          <FileMeasure />
        </div>
      </Card>

      {/* Claude 로 */}
      <Card>
        <h2 className="text-lg font-bold text-ink">데이터를 Claude 로</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
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

function FitRow({ label, text, n }: { label: string; text: string | null; n: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
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
