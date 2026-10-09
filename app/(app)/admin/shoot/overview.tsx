import Link from 'next/link';
import { ArrowRight, Clapperboard, ChevronRight } from 'lucide-react';
import { BackLink, ButtonLink, Card, PageHeading } from '@/components/ui';
import { ShootGauge, StackBar } from '@/components/shoot/gauge';
import { STATE_LABEL, STATE_PILL, dayText, stampText } from '@/components/shoot/status';
import { SHOOT_PLAN } from '@/lib/shoot/plan';
import { loadShootChecks, loadShootExercises } from '@/lib/shoot/load';
import {
  BUCKET_LABEL,
  clockText,
  countOf,
  cursorOf,
  groupCounts,
  plannedPerVideo,
  planItems,
  sessionsOf,
  stateOf,
  weekItems,
  type Count,
  type ShootCheckView,
} from '@/lib/shoot/progress';
import { SESSION_MINUTES, STATIONS, WRAP_MINUTES } from '@/lib/shoot/schedule';
import { toDateKey } from '@/lib/pitch-stats';

/**
 * 트레이닝 영상 촬영 — 관리자 메인.
 *
 * 2026-10-09 사용자: "메인에서 게이지 형태로 어느 정도 진행했는지 · 웹에서는 더 정보를 많이". 휴대폰(앱)은 게이지 · 이어 찍기 ·
 * 주차 카드까지, PC 는 그 밑에 자리 · 부위 · 카테고리별 진행, 날별 촬영 속도, 최근 체크, 올릴 차례를 더 편다.
 * 계획은 lib/shoot/plan-data.json(고정), 체크는 DB ShootCheck.
 */
/** 화면 본문 — 체크를 넘기면 DB 대신 그것으로 그린다(모양 확인용) */
export async function ShootOverview({
  checksOverride,
}: {
  checksOverride?: ShootCheckView[];
} = {}) {
  const plan = SHOOT_PLAN;
  const items = planItems(plan);
  const [checkList, info] = await Promise.all([
    checksOverride ?? loadShootChecks(),
    loadShootExercises(
      items.map((i) => i.exerciseId),
      { withMedia: false }
    ),
  ]);
  const checks = new Map(checkList.map((c) => [c.exerciseId, c]));
  const all = countOf(items, checks);
  const uploadedItems = items.filter((i) => info.get(i.exerciseId)?.source === 'OWN');
  const toUpload = items.filter(
    (i) => stateOf(i, checks) === 'done' && info.get(i.exerciseId)?.source !== 'OWN'
  );
  const attention = items.filter((i) => {
    const s = stateOf(i, checks);
    return s === 'redo' || s === 'later';
  });
  const weeks = plan.weeks.map((w) => {
    const its = weekItems(w);
    const count = countOf(its, checks);
    const cur = cursorOf(w, checks);
    return { w, count, cur, total: its.length };
  });
  const nextWeek = weeks.find((x) => x.cur.current) ?? null;
  const sessions = sessionsOf(checkList, toDateKey);
  const realPer =
    sessions
      .filter((s) => s.perVideo != null)
      .reduce((a, s) => a + s.perVideo! * (s.count - 1), 0) /
    Math.max(
      1,
      sessions.filter((s) => s.perVideo != null).reduce((a, s) => a + s.count - 1, 0)
    );
  const plannedPer = plannedPerVideo(items);
  const byNo = new Map(
    plan.weeks.flatMap((w) =>
      weekItems(w).map((it) => [it.exerciseId, { it, week: w.week }])
    )
  );
  const recent = [...checkList].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 14);

  const stations = groupCounts(items, checks, (i) => i.station).sort(
    (a, b) => STATIONS.indexOf(a.key) - STATIONS.indexOf(b.key)
  );
  const buckets = groupCounts(items, checks, (i) => BUCKET_LABEL[i.bucket]).sort(
    (a, b) => b.count.total - a.count.total
  );
  const categories = groupCounts(
    items,
    checks,
    (i) => info.get(i.exerciseId)?.category ?? '기타'
  ).sort((a, b) => b.count.total - a.count.total);

  return (
    <div className="stack-page">
      <BackLink href="/admin">관리자</BackLink>
      <PageHeading
        title="트레이닝 영상 촬영"
        description={`유튜브 참고 영상으로 대신하던 운동 ${all.total}개를 우리 영상으로 바꿔요. 주 1회 3시간 · ${plan.weeks.length}주 계획.`}
      />

      {/* ── 게이지 + 이어 찍기 ── */}
      <Card className="grid items-center gap-6 desk:grid-cols-[auto_minmax(0,1fr)] desk:gap-10">
        <div className="flex justify-center">
          <ShootGauge
            done={all.done}
            uploaded={uploadedItems.length}
            total={all.total}
          />
        </div>
        <div className="min-w-0 space-y-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Legend dot="bg-sky" label="찍음" value={all.done} />
            <Legend
              dot="bg-sky/45"
              label="올림"
              value={uploadedItems.length}
              hint="우리 영상으로 바뀐 것"
            />
            <Legend dot="bg-warn/70" label="다시 · 미룸" value={all.redo + all.later} />
            <Legend dot="bg-ink/15" label="남음" value={all.todo} />
          </dl>
          {nextWeek?.cur.current ? (
            <div className="space-y-3 rounded-2xl bg-sky/8 p-4">
              <p className="text-xs font-semibold text-sky-strong">
                다음 촬영 · {nextWeek.w.week}주차 {nextWeek.count.done}/{nextWeek.total}
              </p>
              <p className="text-base font-bold break-keep text-ink">
                <span className="text-numeric mr-2 text-muted">
                  {nextWeek.cur.current.no}
                </span>
                {nextWeek.cur.current.title}
              </p>
              <div className="flex flex-wrap gap-2">
                <ButtonLink
                  href={`/admin/shoot/${nextWeek.w.week}/run`}
                  className="min-w-40"
                >
                  <Clapperboard aria-hidden className="h-4 w-4" />
                  {nextWeek.count.done > 0 ? '이어 찍기' : '촬영 시작'}
                </ButtonLink>
                <ButtonLink
                  href={`/admin/shoot/${nextWeek.w.week}`}
                  variant="secondary"
                >
                  {nextWeek.w.week}주차 시간표
                </ButtonLink>
              </div>
            </div>
          ) : (
            <p className="rounded-2xl bg-sky/8 p-4 text-sm font-semibold text-sky-strong">
              계획한 운동을 모두 찍었어요.{' '}
              {toUpload.length > 0 &&
                `이제 ${toUpload.length}개를 편집해 올릴 차례예요.`}
            </p>
          )}
        </div>
      </Card>

      {/* ── 주차 ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">주차별</h2>
        <ul className="grid gap-block sm:grid-cols-2 desk:grid-cols-3 xl:grid-cols-5">
          {weeks.map(({ w, count, cur, total }, i) => {
            const state =
              count.done === total
                ? '다 찍음'
                : count.done + count.redo + count.later > 0
                  ? '진행 중'
                  : '예정';
            return (
              <li
                key={w.week}
                style={{ '--row': i } as React.CSSProperties}
                className="motion-safe:animate-row-in"
              >
                <Link
                  href={`/admin/shoot/${w.week}`}
                  className="group flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-(--block-pad) transition-colors duration-75 hover:border-sky-soft hover:bg-surface-2"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-base font-bold text-ink">{w.week}주차</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        state === '다 찍음'
                          ? 'bg-sky text-white'
                          : state === '진행 중'
                            ? 'bg-sky/12 text-sky-strong'
                            : 'bg-ink/6 text-muted'
                      }`}
                    >
                      {state}
                    </span>
                  </span>
                  <StackBar
                    done={count.done}
                    redo={count.redo}
                    later={count.later}
                    total={total}
                    label={`${w.week}주차 진행`}
                  />
                  <span className="flex items-baseline justify-between text-xs text-muted">
                    <span>
                      <b className="text-numeric text-base text-ink">{count.done}</b> /{' '}
                      {total}
                    </span>
                    <span className="tabular-nums">
                      계획 {clockText(w.end)} · 자리 {w.stations.length}곳
                    </span>
                  </span>
                  {cur.current && count.done > 0 && (
                    <span className="truncate text-xs text-ink/80">
                      지금 <b className="font-semibold">{cur.current.no}</b>{' '}
                      {cur.current.title}
                    </span>
                  )}
                  <span className="mt-auto flex items-center gap-1 text-xs font-semibold text-sky-strong">
                    시간표 보기
                    <ChevronRight
                      aria-hidden
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── 손볼 것(휴대폰에도) ── */}
      {attention.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-ink">
            다시 찍기 · 미룬 것 {attention.length}개
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {attention.slice(0, 12).map((it) => {
              const c = checks.get(it.exerciseId)!;
              const week = byNo.get(it.exerciseId)!.week;
              return (
                <li key={it.exerciseId}>
                  <Link
                    href={`/admin/shoot/${week}#${it.no}`}
                    className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-surface-2 active:bg-ink/5"
                  >
                    <span className="text-numeric w-10 shrink-0 text-xs text-muted">
                      {it.no}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {it.title}
                      {c.note && (
                        <span className="ml-2 text-xs text-muted">· {c.note}</span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE_PILL[c.status]}`}
                    >
                      {STATE_LABEL[c.status]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── 여기부터 PC 만: 더 자세히 ── */}
      <div className="hidden stack-page desk:block">
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-6">
          <Tile label="찍음" value={all.done} unit={`/ ${all.total}`} />
          <Tile label="남음" value={all.todo} unit="개" />
          <Tile label="다시 찍기" value={all.redo} unit="개" />
          <Tile label="미룸" value={all.later} unit="개" />
          <Tile
            label="올릴 차례"
            value={toUpload.length}
            unit="개"
            hint="찍었고 아직 참고 영상"
          />
          <Tile
            label="영상 1개(실제)"
            value={
              Number.isFinite(realPer) && sessions.some((s) => s.perVideo != null)
                ? realPer.toFixed(1)
                : '—'
            }
            unit={`분 · 계획 ${plannedPer}`}
          />
        </section>

        <section className="grid items-start gap-block lg:grid-cols-3">
          <Breakdown title="자리별" rows={stations} />
          <Breakdown title="부위별" rows={buckets} />
          <Breakdown title="카테고리별" rows={categories} />
        </section>

        <section className="grid items-start gap-block lg:grid-cols-5">
          <Card className="space-y-3 lg:col-span-2">
            <h2 className="text-sm font-bold text-ink">촬영한 날</h2>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted">
                아직 찍은 날이 없어요. 체크한 시각으로 날마다 몇 개를 몇 분에 찍었는지
                셈해요.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="pb-2 font-medium">날짜</th>
                    <th className="pb-2 text-right font-medium">찍음</th>
                    <th className="pb-2 text-right font-medium">걸린 시간</th>
                    <th className="pb-2 text-right font-medium">1개당</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {sessions.map((s) => (
                    <tr key={s.day}>
                      <td className="py-2 text-ink">{dayText(s.day)}</td>
                      <td className="py-2 text-right text-ink">{s.count}개</td>
                      <td className="py-2 text-right text-ink">
                        {clockText(s.spanMinutes)}
                      </td>
                      <td className="py-2 text-right text-ink">
                        {s.perVideo != null ? `${s.perVideo}분` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-xs leading-relaxed text-muted">
              계획은 영상 1개 {plannedPer}분(자리 옮김 · 쉬기 포함하면 더), 한 회{' '}
              {SESSION_MINUTES / 60}시간 가운데 마지막 {WRAP_MINUTES}분은 백업이에요.
            </p>
          </Card>

          <Card className="space-y-3 lg:col-span-3">
            <h2 className="text-sm font-bold text-ink">최근 체크</h2>
            {recent.length === 0 ? (
              <p className="text-sm text-muted">
                아직 체크가 없어요. 촬영 모드에서 찍을 때마다 여기에 쌓여요.
              </p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {recent.map((c) => {
                    const hit = byNo.get(c.exerciseId);
                    return (
                      <tr key={c.exerciseId}>
                        <td className="py-2 pr-3 text-xs whitespace-nowrap text-muted tabular-nums">
                          {stampText(c.at)}
                        </td>
                        <td className="text-numeric py-2 pr-3 text-xs whitespace-nowrap text-muted">
                          {hit?.it.no}
                        </td>
                        <td className="w-full max-w-0 truncate py-2 pr-3 text-ink">
                          {hit?.it.title}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE_PILL[c.status]}`}
                          >
                            {STATE_LABEL[c.status]}
                          </span>
                        </td>
                        <td className="py-2 text-xs whitespace-nowrap text-muted">
                          {c.by ?? ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </section>

        {toUpload.length > 0 && (
          <Card className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-bold text-ink">
                올릴 차례 {toUpload.length}개
              </h2>
              <Link
                href="/library/training"
                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-strong hover:underline"
              >
                라이브러리에서 영상 올리기
                <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </Link>
            </div>
            <p className="text-xs text-muted">
              찍었지만 아직 유튜브 참고 영상이 걸려 있는 운동이에요. 라이브러리에서
              운동을 열고 연필 → &lsquo;직접 찍은 영상 올리기&rsquo;.
            </p>
            <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {toUpload.map((it) => (
                <li key={it.exerciseId} className="flex gap-2 truncate">
                  <span className="text-numeric w-10 shrink-0 text-xs text-muted">
                    {it.no}
                  </span>
                  <span className="truncate text-ink">{it.title}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function Legend({
  dot,
  label,
  value,
  hint,
}: {
  dot: string;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="min-w-0" title={hint}>
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </dt>
      <dd className="text-numeric mt-1 text-2xl text-ink">{value}</dd>
    </div>
  );
}

function Tile({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: number | string;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="bg-surface px-5 py-5" title={hint}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2">
        <span className="text-numeric text-3xl text-ink">{value}</span>
        {unit && <span className="ml-1 text-xs text-muted">{unit}</span>}
      </p>
    </div>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; count: Count }[];
}) {
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      <ul className="space-y-2.5">
        {rows.map(({ key, count }) => (
          <li key={key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-ink">{key}</span>
              <span className="shrink-0 tabular-nums text-muted">
                <b className="font-semibold text-ink">{count.done}</b> / {count.total}
              </span>
            </div>
            <StackBar
              done={count.done}
              redo={count.redo}
              later={count.later}
              total={count.total}
              className="h-1.5"
              label={`${key} 진행`}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
