'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { Activity } from 'lucide-react';
import { OPEN_POPUP_TYPES } from '@/lib/transition-types';
import { speedLabel, toSpeed, type SpeedUnit } from '@/lib/units';
import { PITCH_TYPES, pitchTypeLabel } from '@/lib/velocity-meta';
import { Panel, SectionLabel, StatRow } from './kit';
import type { VelocityHistoryItem } from './session-types';

/**
 * 지난 세션 — 구속 측정 메인 화면(/velocity)에서 "과거 세션들의 구속 변화"를 한눈에.
 *
 *   숫자 줄(세션 수 · 전체 최고 · 최근 최고 · 최근 평균) → 구속 변화 그래프 → 최근 세션 목록
 *
 * 세션은 서버가 날짜 · createdAt 오름차순으로 넘긴다(lib/velocity-load.ts loadVelocityHistory).
 * 값은 km/h 로 오고 단위 바꾸기는 여기서 한다 — 세션 요약(session-summary.tsx)과 같은 셈.
 * 줄을 누르면 그날 투구 기록 팝업으로 간다(공마다 값 · 영상은 거기서).
 */

/** 그래프에 올리는 세션 수. 더 많으면 점이 뭉쳐 읽히지 않는다 */
const GRAPH_POINTS = 20;
/** 목록에 보이는 최근 세션 수 */
const LIST_ROWS = 8;
/** 그래프 높이(px) — 폭은 칸에 맞추고 세로만 못박는다 */
const GRAPH_H = 140;

export function SessionHistory({
  items,
  unit,
  today,
}: {
  /** 날짜 · createdAt 오름차순 */
  items: VelocityHistoryItem[];
  unit: SpeedUnit;
  /** YYYY-MM-DD — 목록의 '오늘' 표시 */
  today: string;
}) {
  const unitText = speedLabel(unit);
  /* km/h → 보는 단위, 소수 1자리. 측정 화면 · 세션 요약의 speedNum 과 같은 셈 */
  const speedNum = (kmh: number) => Math.round(toSpeed(kmh, unit) * 10) / 10;

  if (items.length === 0) return <EmptyState />;

  const last = items[items.length - 1];
  const best = Math.max(...items.map((s) => s.maxKmh));

  const graph = items.slice(-GRAPH_POINTS).map((s) => ({
    id: s.id,
    date: s.date,
    max: speedNum(s.maxKmh),
    avg: speedNum(s.avgKmh),
  }));
  /* 목록은 최신 것부터 */
  const recent = items.slice(-LIST_ROWS).reverse();
  /* 같은 날 세션이 여럿이면 시각을 붙여 가른다 */
  const dayCount = new Map<string, number>();
  for (const s of items) dayCount.set(s.date, (dayCount.get(s.date) ?? 0) + 1);

  return (
    <div className="space-y-4 motion-safe:animate-fade-in">
      {/* (1) 숫자 줄 */}
      <Panel>
        <StatRow
          items={[
            { label: '세션', value: items.length, unit: '번' },
            { label: '전체 최고', value: speedNum(best), unit: unitText },
            { label: '최근 최고', value: speedNum(last.maxKmh), unit: unitText },
            { label: '최근 평균', value: speedNum(last.avgKmh), unit: unitText },
          ]}
        />
      </Panel>

      {/* (2) 구속 변화 그래프 */}
      <section>
        <SectionLabel
          action={
            <span className="flex items-center gap-2.5 text-xs text-muted">
              <span className="flex items-center gap-1">
                <span aria-hidden className="h-2 w-2 rounded-full bg-sky" />
                최고
              </span>
              <span className="flex items-center gap-1">
                <span aria-hidden className="h-2 w-2 rounded-full bg-sky/40" />
                평균
              </span>
            </span>
          }
        >
          구속 변화
          {items.length > GRAPH_POINTS && (
            <span className="ml-1 font-normal">— 최근 {GRAPH_POINTS}세션</span>
          )}
        </SectionLabel>
        <Panel className="px-3 pb-3 pt-3">
          <TrendChart points={graph} unitText={unitText} />
        </Panel>
      </section>

      {/* (3) 최근 세션 목록 */}
      <section>
        <SectionLabel
          action={<span className="text-xs text-muted">누르면 그날 기록으로</span>}
        >
          최근 세션
        </SectionLabel>
        <Panel>
          <ul className="divide-y divide-line">
            {recent.map((s) => {
              const types = typesText(s.byType);
              const when =
                (dayCount.get(s.date) ?? 0) > 1
                  ? `${dayLabel(s.date, today)} ${timeLabel(s.createdAt)}`
                  : dayLabel(s.date, today);
              return (
                <li key={s.id}>
                  <Link
                    href={`/pitch-log/${s.date}`}
                    transitionTypes={OPEN_POPUP_TYPES}
                    className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2/60 active:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                        <span className="text-sm font-semibold text-ink">{when}</span>
                        <span className="text-xs text-muted">
                          {s.sessionType ?? '종류 —'} · {s.n}구
                        </span>
                      </span>
                      {types && (
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {types}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="text-display block text-xl leading-none tabular-nums text-ink">
                        {speedNum(s.maxKmh)}
                        <span className="ml-0.5 font-sans text-xs text-muted">
                          {unitText}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs tabular-nums text-muted">
                        평균 {speedNum(s.avgKmh)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {items.length > LIST_ROWS && (
            <p className="border-t border-line px-4 py-2.5 text-center text-xs text-muted">
              더 있어요 — 투구 기록 캘린더에서
            </p>
          )}
        </Panel>
      </section>
    </div>
  );
}

/* ───────────────────────── 조각 ───────────────────────── */

/** 잰 세션이 없을 때 — 숫자 · 그래프 · 목록 대신 카드 하나 */
function EmptyState() {
  return (
    <Panel className="flex flex-col items-center px-5 py-8 text-center motion-safe:animate-fade-in">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Activity aria-hidden className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-ink">아직 잰 세션이 없어요</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        아래 측정 시작을 누르면 여기에 구속 변화가 쌓여요
      </p>
    </Panel>
  );
}

type TrendPoint = { id: string; date: string; max: number; avg: number };

/** 왼쪽 눈금 글자 자리 · 오른쪽 여유 · 위(마지막 값 글자) · 아래 */
const PAD = { l: 40, r: 14, t: 18, b: 10 } as const;

/**
 * 구속 변화 — 세션 차례대로 최고(굵게) · 평균(가늘게) 두 선.
 *
 * x 는 차례라 같은 날 세션이 여럿이어도 점이 겹치지 않는다. y 는 값의 최소~최대에
 * 위아래 5% 여유 — 바닥을 0 에 두면 130 과 140 이 한 줄로 보인다.
 * 화면 픽셀 그대로 그린다(칸 폭을 재서 viewBox 로) — 늘려 그리면 점이 찌그러지고
 * 글자 크기가 칸마다 달라진다.
 */
function TrendChart({ points, unitText }: { points: TrendPoint[]; unitText: string }) {
  const box = useRef<HTMLDivElement>(null);
  const W = useBoxWidth(box);
  const H = GRAPH_H;
  const n = points.length;
  const first = points[0];
  const last = points[n - 1];

  const values = points.flatMap((p) => [p.max, p.avg]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  /* 값이 다 같으면(세션 하나) ±1 로 벌려 점이 가운데 오게 */
  const margin = span < 1 ? 1 : span * 0.05;
  const bottom = lo - margin;
  const top = hi + margin;

  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const x = (i: number) => (n === 1 ? PAD.l + plotW / 2 : PAD.l + (i * plotW) / (n - 1));
  const y = (v: number) => PAD.t + ((top - v) / (top - bottom)) * plotH;
  const ticks = ticksFor(bottom, top);

  return (
    <div>
      <div ref={box} className="w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="block"
          role="img"
          aria-label={`구속 변화 — ${n}세션, 첫 세션 최고 ${first.max} ${unitText}, 마지막 세션 최고 ${last.max} ${unitText}`}
        >
          {/* 가로 눈금 3줄 + 왼쪽 값 글자 */}
          {ticks.map((t) => (
            <g key={t.label}>
              <line
                x1={PAD.l}
                y1={y(t.v)}
                x2={W - PAD.r}
                y2={y(t.v)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text
                x={PAD.l - 6}
                y={y(t.v)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted text-xs tabular-nums"
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* 평균 — 가늘게 */}
          {n > 1 && (
            <polyline
              points={points.map((p, i) => `${x(i)},${y(p.avg)}`).join(' ')}
              fill="none"
              className="stroke-sky/40"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {points.map((p, i) => (
            <circle key={`a-${p.id}`} cx={x(i)} cy={y(p.avg)} r={2} className="fill-sky/40" />
          ))}

          {/* 최고 — 굵게 */}
          {n > 1 && (
            <polyline
              points={points.map((p, i) => `${x(i)},${y(p.max)}`).join(' ')}
              fill="none"
              className="stroke-sky"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {points.map((p, i) =>
            i === n - 1 ? null : (
              <circle key={`m-${p.id}`} cx={x(i)} cy={y(p.max)} r={3} className="fill-sky" />
            )
          )}

          {/* 마지막 세션 — 크게 + 값 글자 */}
          <circle
            cx={x(n - 1)}
            cy={y(last.max)}
            r={5}
            className="fill-sky stroke-surface"
            strokeWidth={2}
          />
          <text
            x={x(n - 1)}
            y={y(last.max) - 10}
            textAnchor={n === 1 ? 'middle' : 'end'}
            className="fill-ink text-xs font-semibold tabular-nums"
          >
            {last.max}
          </text>
        </svg>
      </div>

      {/* 아래 — 첫 · 마지막 날짜. 세션이 하나면 가운데 하나 */}
      <div
        className={`mt-1 flex text-xs tabular-nums text-muted ${
          n === 1 ? 'justify-center' : 'justify-between'
        }`}
        style={{ paddingLeft: n === 1 ? 0 : PAD.l, paddingRight: n === 1 ? 0 : PAD.r }}
      >
        <span>{shortDate(first.date)}</span>
        {n > 1 && <span>{shortDate(last.date)}</span>}
      </div>
      {n === 1 && (
        <p className="mt-1.5 text-center text-xs text-muted">세션이 쌓이면 선이 그려져요</p>
      )}
    </div>
  );
}

/* ───────────────────────── 셈 ───────────────────────── */

/**
 * 그래프 칸의 실제 폭(px). 처음 폭은 그리기 전에 바로 재고(칸이 비어 보이는 틈이 없다),
 * 그 뒤로는 칸이 달라질 때마다(창 크기 · 폰 틀) 다시 잰다. 서버에서는 320 으로 그린다.
 */
function useBoxWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = Math.round(el.clientWidth);
      if (w > 0) setWidth((prev) => (prev === w ? prev : w));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * 가로 눈금 3줄 — 범위 안쪽의 딱 떨어지는 값(아래 · 가운데 · 위). 범위가 좁으면(4 미만) 소수 1자리.
 * 눈금 값을 반올림하므로 줄과 글자가 같은 값을 가리킨다.
 */
function ticksFor(bottom: number, top: number) {
  const decimal = top - bottom < 4;
  const step = decimal ? 0.1 : 1;
  const snap = (v: number) => Math.round(v / step) * step;
  const lo = snap(Math.ceil(bottom / step) * step);
  const hi = snap(Math.floor(top / step) * step);
  const mid = snap((lo + hi) / 2);
  const seen = new Set<string>();
  return [lo, mid, hi]
    .map((v) => ({ v, label: decimal ? v.toFixed(1) : String(Math.round(v)) }))
    .filter((t) => (seen.has(t.label) ? false : (seen.add(t.label), true)));
}

/** 구종별 공 수 — '직구 6 · 슬라이더 4'. PITCH_TYPES 차례, 모르는 키는 뺀다 */
function typesText(byType: Record<string, number>) {
  const parts: string[] = [];
  for (const t of PITCH_TYPES) {
    const n = byType[t.key];
    const label = pitchTypeLabel(t.key);
    if (n > 0 && label) parts.push(`${label} ${n}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** 'YYYY-MM-DD' → [y, m, d]. new Date('YYYY-MM-DD') 는 UTC 자정이라 시간대에 따라 하루 어긋나 직접 쪼갠다 */
function ymd(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return [y || 0, m || 0, d || 0] as const;
}

/** 목록 날짜 — 오늘이면 '오늘', 올해면 '9월 28일', 아니면 해를 붙인다 */
function dayLabel(date: string, today: string) {
  if (date === today) return '오늘';
  const [y, m, d] = ymd(date);
  const [ty] = ymd(today);
  if (!y || !m || !d) return date;
  return y === ty ? `${m}월 ${d}일` : `${y}년 ${m}월 ${d}일`;
}

/** 그래프 아래 날짜 — '9/28' */
function shortDate(date: string) {
  const [, m, d] = ymd(date);
  return m && d ? `${m}/${d}` : date;
}

/*
 * 같은 날 세션을 가르는 시각 — '15:20'. 한국 시간으로 적는다: 이 부품은 서버(UTC)에서도 그려져, 기기 시각(getHours)을
 * 쓰면 서버가 그린 글자(UTC)와 폰이 그린 글자가 달라 맞추기(hydration)가 어긋났다.
 */
const TIME_KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
function timeLabel(iso: string) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  return TIME_KST.format(t);
}
