'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, FormError, PageHeading } from '@/components/ui';
import { toDateKey } from '@/lib/pitch-stats';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import {
  LegendSwatch,
  MonthCalendar,
  type DayMark,
} from '@/components/month-calendar';
import { LogList } from './log-list';

export type Log = {
  id: string;
  date: string;
  sessionType: string;
  pitchCount: number;
  intensity: number;
  maxVelocity: number | null;
  avgVelocity: number | null;
  memo: string | null;
  videoPaths: string[];
};

/**
 * 투구 일지 — 달력 하나.
 *
 * 예전에는 달력이 왼쪽 사이드바로 좁게 눌려 있고, 오른쪽에 그날 기록과 입력
 * 폼이 늘 펼쳐져 있었다. 달력은 작아서 언제 던졌는지 한눈에 안 들어오고,
 * 오른쪽은 아무 날짜나 눌러도 뭔가 잔뜩 나와서 화면이 늘 꽉 차 있었다.
 *
 * 이제 달력만 크게 둔다. 날짜를 누르면 /pitch-log/<날짜> 로 넘어가고,
 * 기록·영상·폼 분석·수정·삭제는 전부 거기 있다.
 *
 * 한때 그것을 작은 창으로 띄웠는데, 영상 하나만 있어도 창 안에서 몇 판을
 * 굴려야 했고 그날 적어둔 글은 맨 아래에 묻혔다. 창은 잠깐 확인하고 닫는
 * 그릇이지 되짚어 읽는 그릇이 아니다.
 *
 * 영상과 2분할 비교는 '투구 영상'(/videos)으로 나갔다. 날짜 하나에 매인 것이
 * 아니라 여러 날을 가로질러 보는 것이라, 날짜를 고르는 이 화면의 탭으로
 * 두기에는 결이 달랐다.
 */
export function PitchLogClient({
  initialLogs,
  initialDate,
  loadedFrom,
}: {
  initialLogs: Log[];
  /** 다른 화면에서 날짜를 지정해 들어온 경우. 그 칸을 짚어 둔다. */
  initialDate: string | null;
  /**
   * 처음에 받아 온 가장 오래된 달 (YYYY-MM).
   *
   * 이보다 옛날 달로 넘기면 그때 그 달만 따로 받아 온다. 처음부터 전부 읽으면
   * 몇 년 쓴 사람에게는 열 때마다 천 건이 넘어온다.
   */
  loadedFrom: string;
}) {
  const [logs, setLogs] = useState<Log[]>(initialLogs);
  /*
   * 달력으로 볼지 목록으로 볼지.
   *
   * 다른 화면에서 날짜를 지정해 들어오면 달력으로 연다 — 그 날짜를 짚어
   * 보여주려고 온 것이기 때문이다.
   */
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [error, setError] = useState<string>();
  /*
   * 이미 받아 온 달들. 처음 받아 온 범위(loadedFrom 이후)는 통째로 있는 것으로
   * 친다. 같은 달을 두 번 받지 않으려고 둔다.
   */
  const router = useRouter();

  const loadedMonths = useRef(new Set<string>());
  const [loadingMonth, setLoadingMonth] = useState(false);

  /*
   * 달력에서 짚어 둔 날. 어느 칸이 눌린 것으로 보일지에만 쓴다 —
   * 그날 기록은 /pitch-log/<날짜> 로 넘어가서 본다.
   */
  const selectedDate = initialDate;

  // 넘어온 날짜가 지난달이면 달력도 그 달을 펴야 한다.
  const [month, setMonth] = useState(() => {
    const [y, m] = (initialDate ?? toDateKey(new Date()))
      .split('-')
      .map(Number);
    return new Date(y, m - 1, 1);
  });

  /*
   * 날짜를 누르면 그날 페이지로 간다.
   *
   * 예전에는 작은 창을 열었다. 그 안에 수치·느낀점·영상·폼 분석·수정 폼이 전부
   * 들어가니 영상 하나만 있어도 창 안에서 몇 판을 굴려야 했고, 정작 그날 적어둔
   * 글은 맨 아래에 묻혔다. 창은 잠깐 확인하고 닫는 그릇인데 지난 기록을 되짚는
   * 일은 그렇지 않다.
   */
  const openDay = useCallback(
    (date: string) => {
      router.push(`/pitch-log/${date}`);
    },
    [router],
  );

  /** 달력이 보고 있는 달 (YYYY-MM) */
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;

  /*
   * 처음 받아 온 범위보다 옛날 달로 넘어가면 그 달만 따로 받아 온다.
   * 한 번 받은 달은 다시 받지 않는다.
   */
  useEffect(() => {
    if (monthKey >= loadedFrom || loadedMonths.current.has(monthKey)) return;
    loadedMonths.current.add(monthKey);
    let cancelled = false;

    setLoadingMonth(true);
    fetch(`/api/pitch-log?month=${monthKey}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((older: Log[]) => {
        if (cancelled) return;
        // 이미 가진 것과 겹칠 수 있어(영상 있는 기록) id 로 합친다.
        setLogs((prev) => {
          const seen = new Set(prev.map((l) => l.id));
          return [...prev, ...older.filter((l) => !seen.has(l.id))];
        });
      })
      .catch(() => {
        if (cancelled) return;
        // 다시 넘어오면 한 번 더 받아볼 수 있게 표시를 지운다.
        loadedMonths.current.delete(monthKey);
        setError(
          '그 달 기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingMonth(false);
      });

    return () => {
      cancelled = true;
    };
  }, [monthKey, loadedFrom]);

  /**
   * 달력에 칠할 것.
   *
   * '안 던진 날'과 '아직 아무것도 안 남긴 날'은 전혀 다른 뜻인데 둘 다 빈칸이면
   * 구별이 안 된다. 쉬는 날은 색을 채우지 않고 점선으로 표시한다(intensity null).
   */
  const marks = useMemo(() => {
    type Acc = {
      pitches: number;
      intensity: number;
      video: boolean;
      rested: boolean;
    };
    const byDay = logs.reduce<Record<string, Acc>>((acc, log) => {
      const key = log.date.slice(0, 10);
      const prev = acc[key] ?? {
        pitches: 0,
        intensity: 0,
        video: false,
        rested: true,
      };
      acc[key] = {
        pitches: prev.pitches + log.pitchCount,
        intensity: Math.max(prev.intensity, log.intensity),
        video: prev.video || log.videoPaths.length > 0,
        // 하루에 여러 건이면, 한 건이라도 던졌으면 던진 날이다.
        rested: prev.rested && log.sessionType === REST_SESSION_TYPE,
      };
      return acc;
    }, {});

    const out: Record<string, DayMark> = {};
    for (const [key, d] of Object.entries(byDay)) {
      out[key] = {
        intensity: d.rested ? null : d.intensity,
        label: d.rested ? '휴식' : `${d.pitches}구`,
        dot: d.video,
        spoken: [
          d.rested ? '쉬는 날로 남김' : `${d.pitches}구`,
          d.video ? '영상 있음' : null,
        ]
          .filter(Boolean)
          .join(', '),
      };
    }
    return out;
  }, [logs]);

  /* ---------------------------- 영상 ---------------------------- */

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Pitch Log"
        title="투구 일지"
        description={
          view === 'calendar'
            ? '날짜를 누르면 그날 화면으로 넘어갑니다. 기록이 없는 날도 눌러서 남길 수 있습니다.'
            : '최근 기록부터 봅니다. 위에서 걸러 영상 있는 날이나 경기 날만 볼 수 있습니다.'
        }
      />

      <FormError>{error}</FormError>

      {/*
        달력과 목록.

        달력은 '그 날짜'를 알 때, 목록은 '요즘 뭐 했더라'를 볼 때 쓴다. 둘은
        같은 기록을 다르게 보는 것이라 한 화면에 같이 두지 않고 오가게 한다 —
        트레이닝의 '오늘 | 기록'과 같은 방식이다.
      */}
      <nav className="inline-flex overflow-hidden rounded-xl border border-line-strong bg-surface">
        {(
          [
            ['calendar', '달력'],
            ['list', '목록'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={`px-4 py-2 text-xs font-semibold transition-colors ${
              view === key ? 'bg-sky text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {view === 'list' && <LogList logs={logs} />}

      {view === 'calendar' && (
        <Card className="relative">
          {/* 옛날 달을 받아 오는 동안. 달력이 빈 채로 있으면 기록이 없는 줄 안다. */}
          {loadingMonth && (
            <p
              aria-live="polite"
              className="absolute right-5 top-5 rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-muted"
            >
              지난 기록 불러오는 중…
            </p>
          )}
          <MonthCalendar
            month={month}
            onMonthChange={setMonth}
            selected={selectedDate}
            onSelect={openDay}
            marks={marks}
          >
            <span>강도</span>
            <LegendSwatch className="h-3 w-5 rounded bg-sky/15">
              낮음
            </LegendSwatch>
            <LegendSwatch className="h-3 w-5 rounded bg-sky/40">
              보통
            </LegendSwatch>
            <LegendSwatch className="h-3 w-5 rounded bg-sky/70">
              높음
            </LegendSwatch>
            <LegendSwatch className="h-3 w-5 rounded border border-dashed border-line-strong">
              쉬는 날
            </LegendSwatch>
            <LegendSwatch className="h-1.5 w-1.5 rounded-full bg-sky-strong">
              영상
            </LegendSwatch>
          </MonthCalendar>
        </Card>
      )}
    </div>
  );
}
