'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { ChartLine, Loader2, RotateCcw } from 'lucide-react';
import { Segmented } from '@/components/segmented';
import { Skeleton } from '@/components/fallback';
import { analysisFor } from '@/app/actions/analysis';
import { agoText, spokenDay } from './day-summary';
import type { AnalysisTab } from './analysis-tabs';

/**
 * 홈의 분석 칸 — 캘린더 밑에 늘 떠 있다.
 *
 * 예전에는 '분석' 탭이 따로 있었다. 그런데 분석은 결국 '그날 어땠나'를 보는 일이고,
 * 날짜는 홈 캘린더가 이미 쥐고 있었다. 지난 리포트를 보려면 분석 탭의 목록(최근 셋)을
 * 뒤져야 했고, 그보다 옛날 것은 볼 길이 없었다.
 *
 * 이제 분석은 홈 캘린더를 따른다. 아무 날도 안 고르면 오늘, 날짜를 누르면 그날 분석이다.
 * 리포트가 있는 날은 캘린더 칸 왼쪽 위에 그래프 표시가 붙어 있어 지난 분석을 달력에서 찾는다.
 *
 * 세 칸은 분석 탭의 것을 그대로 옮겼다 — 리포트(그날 쓴 코멘트와 투구 계획), 투구(부하
 * 지수·28일 추이·기간별 기록), 트레이닝(운동 부하·4주 돌아보기). 투구·트레이닝은 고른 날
 * 기준으로 다시 셈한다(그날까지의 기록으로 — 그때 어땠는지).
 *
 * 내용은 서버가 그려 보낸다(app/actions/analysis.tsx). 분석 화면의 부품들이 서버에서
 * 셈하도록 짜여 있어서다. 한 번 받은 날·칸은 들고 있다가 다시 누르면 바로 보인다.
 */

const TABS = [
  { value: 'report', label: '리포트' },
  { value: 'pitch', label: '투구' },
  { value: 'training', label: '트레이닝' },
] as const;

/*
 * 분석 안에서 날짜로 건너뛰기 — '가장 가까운 리포트' 같은 단추가 캘린더의 날짜를 고른다.
 * 분석 내용은 서버가 그리지만, 누르는 단추는 화면 쪽이라 여기서 길을 이어 준다.
 */
const JumpContext = createContext<((date: string) => void) | null>(null);

/** 누르면 캘린더가 그날을 고른다(분석 칸도 그날로 바뀐다) */
export function JumpToDate({
  date,
  className,
  children,
}: {
  date: string;
  className?: string;
  children: ReactNode;
}) {
  const jump = useContext(JumpContext);
  return (
    <button type="button" onClick={() => jump?.(date)} className={className}>
      {children}
    </button>
  );
}

/** 기다리는 동안의 자리 — 리포트 카드와 비슷한 틀 */
export function AnalysisSkeleton() {
  return (
    <div aria-busy="true" className="space-y-4">
      <span className="sr-only">분석을 불러오는 중입니다</span>
      <Skeleton className="h-16 rounded-2xl" />
      <Skeleton className="h-56 rounded-2xl" />
    </div>
  );
}

export function AnalysisBlock({
  date,
  today,
  initialTab,
  todayReport,
  onJump,
}: {
  /** 보여 줄 날 — 캘린더에서 고른 날, 안 골랐으면 오늘 */
  date: string;
  today: string;
  initialTab: AnalysisTab;
  /**
   * 오늘의 리포트 칸 — 서버가 홈과 함께 그려 보낸다.
   *
   * 여기서 리포트를 만들면 서버가 홈을 새로 그려 보내는데, 이 칸도 그때 같이 바뀐다.
   * 받아 둔 것으로 그리면 만들기를 눌러도 옛 리포트가 남는다.
   */
  todayReport: ReactNode;
  onJump: (date: string) => void;
}) {
  const [tab, setTab] = useState<AnalysisTab>(initialTab);
  const [cache, setCache] = useState<Record<string, ReactNode>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  /*
   * 서버가 홈을 새로 그려 보내면(기록을 남겼거나 리포트를 만들었으면) 받아 둔 분석은
   * 옛것이다 — 버리고 지금 보는 칸부터 다시 받는다.
   */
  const [seen, setSeen] = useState<ReactNode>(todayReport);
  if (seen !== todayReport) {
    setSeen(todayReport);
    setCache({});
  }

  const key = `${date}:${tab}`;
  const fromServer = date === today && tab === 'report';
  const node = fromServer ? todayReport : cache[key];

  useEffect(() => {
    if (node !== undefined || failed[key]) return;
    let cancelled = false;
    startTransition(async () => {
      try {
        const result = await analysisFor(date, tab);
        if (!cancelled) setCache((c) => ({ ...c, [key]: result }));
      } catch {
        if (!cancelled) setFailed((f) => ({ ...f, [key]: true }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key, node, date, tab, failed]);

  /*
   * 받는 동안은 먼저 보던 것을 흐리게 남긴다 — 칸이 비었다 채워지면 아래 내용이 통째로
   * 들썩인다. 새 것이 오면 옅게 떠오르며 바뀐다.
   */
  const [shown, setShown] = useState<{ key: string; node: ReactNode } | null>(
    node !== undefined ? { key, node } : null
  );
  if (node !== undefined && (shown?.key !== key || shown.node !== node)) {
    setShown({ key, node });
  }
  const waiting = node === undefined && !failed[key];

  /*
   * 예전 분석 탭 주소로 들어왔으면(…#analysis) 이 칸까지 내려 준다. 이 칸은 캘린더와
   * 함께 뒤늦게 그려져서, 브라우저가 주소의 #analysis 를 처음에 못 찾고 지나간다.
   */
  useEffect(() => {
    if (window.location.hash !== '#analysis') return;
    const timer = window.setTimeout(() => {
      document.getElementById('analysis')?.scrollIntoView({ block: 'start' });
    }, 300);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <JumpContext value={onJump}>
      <section
        id="analysis"
        aria-labelledby="analysis-title"
        className="scroll-mt-20 space-y-4 pt-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="analysis-title"
              className="text-heading flex items-center gap-2 text-xl text-ink"
            >
              <ChartLine aria-hidden className="h-5 w-5 text-cat-core" />
              분석
            </h2>
            <p className="mt-1 text-sm text-muted">
              {/* 날짜가 바뀔 때마다 살짝 떠오른다 — 무엇이 바뀌었는지 눈이 따라간다 */}
              <b
                key={date}
                className="motion-safe:animate-fade-in inline-block font-semibold text-ink"
              >
                {date === today
                  ? '오늘'
                  : `${spokenDay(date)} · ${agoText(date, today)}`}
              </b>
              <span className="text-muted">
                {' '}
                — 캘린더에서 날짜를 누르면 그날 분석으로 바뀌어요
              </span>
            </p>
          </div>
          <Segmented
            label="분석 보기"
            role="tablist"
            value={tab}
            onChange={setTab}
            options={TABS}
            tone="raised"
            itemClassName="px-4 py-1.5"
          />
        </div>

        <div className="relative" aria-busy={waiting}>
          {waiting && shown && (
            <span className="motion-safe:animate-fade-in absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs text-muted shadow-sm">
              <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
              불러오는 중
            </span>
          )}
          {failed[key] ? (
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-5 py-10 text-sm">
              <p role="alert" className="text-danger">
                이 날 분석을 불러오지 못했어요.
              </p>
              <button
                type="button"
                onClick={() =>
                  setFailed((f) => {
                    const next = { ...f };
                    delete next[key];
                    return next;
                  })
                }
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-sky transition-colors hover:bg-sky-tint"
              >
                <RotateCcw aria-hidden className="h-3.5 w-3.5" />
                다시 불러오기
              </button>
            </div>
          ) : shown ? (
            <div
              key={shown.key}
              className={`motion-safe:animate-fade-in transition-opacity duration-200 ${
                waiting ? 'opacity-50' : ''
              }`}
            >
              {shown.node}
            </div>
          ) : (
            <AnalysisSkeleton />
          )}
        </div>
      </section>
    </JumpContext>
  );
}
