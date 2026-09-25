'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, FormError } from '@/components/ui';
import { toDateKey } from '@/lib/pitch-stats';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { LegendSwatch, MonthCalendar, type DayMark } from '@/components/month-calendar';
import { Segmented } from '@/components/segmented';
import { LogList } from '@/app/(app)/pitch-log/log-list';
import type { Log } from '@/app/(app)/pitch-log/types';
import type { PlanDaySummary, TrainingDaySummary } from '@/lib/report/training-history';
import { DaySummary } from './day-summary';

/** [캘린더 | 목록] — 같은 기록을 다르게 보는 두 방식 */
const VIEW_OPTIONS = [
  { value: 'calendar', label: '캘린더' },
  { value: 'list', label: '목록' },
] as const;

/**
 * 투구 일지 — 홈의 가운데 자리.
 *
 * 예전에는 따로 '투구 일지' 탭이 있었다. 그런데 이 앱에서 매일 하는 일은
 * 결국 '오늘 던진 것을 남기고, 요즘 어떻게 던졌는지 본다'는 하나인데
 * 그것이 홈과 투구 일지로 갈라져 있었다. 홈에는 오늘 것만, 일지에는 지난
 * 것만 있어서 하루를 마치려면 두 화면을 오갔다.
 *
 * 달력을 홈 맨 앞으로 올린다. 열면 이번 달이 한눈에 보이고, 날짜를 누르면
 * /pitch-log/<날짜> 로 넘어간다. 그날의 수치·영상·폼 분석·수정은 전부 거기 있다.
 *
 * 달력과 목록을 한 화면에 같이 두지 않고 오가게 하는 것은 그대로 뒀다.
 * 달력은 '그 날짜'를 알 때, 목록은 '요즘 뭐 했더라'를 볼 때 쓴다 — 같은 기록을
 * 다르게 보는 것이라 나란히 둘 이유가 없다.
 */
export function PitchLogPanel({
  initialLogs,
  initialDate,
  loadedFrom,
  trainingByDay,
  planByDay,
  featuredByDay,
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
  /** 날짜별 운동 요약 (YYYY-MM-DD). 고른 날 밑에 함께 보여준다. */
  trainingByDay: Record<string, TrainingDaySummary>;
  /** 날짜별로 만들어 둔 운동 일정 — 테마와 대충 무엇을 하는 날인지 */
  planByDay: Record<string, PlanDaySummary>;
  /** 영상 탭에서 고른 날짜별 대표 영상(저장소 경로). 안 고른 날은 없다. */
  featuredByDay: Record<string, string>;
}) {
  /*
   * 처음 범위(loadedFrom)보다 옛날 달에서 따로 받아 온 기록만 들고 있는다.
   *
   * 예전에는 서버가 준 initialLogs 를 통째로 state 에 복사해 썼다. state 는 처음
   * 한 번만 채워지므로, 홈의 '오늘 투구'에서 저장한 뒤 router.refresh() 로 서버가
   * 새 initialLogs 를 보내 줘도 달력은 옛 값을 그렸다 — 저장했는데 오늘 칸이 비어
   * 있고, 눌러 보면 "이 날 남긴 기록이 없습니다"가 떴다. 새로고침해야 보였다.
   *
   * 그래서 서버가 주는 것은 그릴 때마다 그대로 쓰고, 따로 받은 옛 달만 여기 모아
   * 둘을 합친다(아래 logs).
   */
  const [olderLogs, setOlderLogs] = useState<Log[]>([]);
  const logs = useMemo(() => {
    const seen = new Set(initialLogs.map((l) => l.id));
    return [...initialLogs, ...olderLogs.filter((l) => !seen.has(l.id))];
  }, [initialLogs, olderLogs]);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [error, setError] = useState<string>();

  /*
   * 이미 받아 온 달들. 같은 달을 두 번 받지 않으려고 둔다. 처음 받아 온
   * 범위(loadedFrom 이후)는 통째로 있는 것으로 친다.
   */
  const loadedMonths = useRef(new Set<string>());

  /*
   * 달력에서 고른 날.
   *
   * 예전에는 이것이 주소에서 온 값 하나뿐이었다(누르면 바로 넘어갔으니까).
   * 이제는 누른 칸을 여기 담아 두고 달력 밑에 그날 요약을 편다.
   */
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate);

  // 넘어온 날짜가 지난달이면 달력도 그 달을 펴야 한다.
  const [month, setMonth] = useState(() => {
    const [y, m] = (initialDate ?? toDateKey(new Date())).split('-').map(Number);
    return new Date(y, m - 1, 1);
  });

  /*
   * 날짜를 누르면 밑에 그날 요약을 편다.
   *
   * 예전에는 곧바로 그날 화면으로 넘어갔다. 그런데 달력은 이 칸 저 칸 눌러보며
   * 훑는 물건이라, 뭐가 있었는지 잠깐 보려던 것뿐인데 매번 화면이 통째로 바뀌고
   * 다시 뒤로 와야 했다. 며칠을 견주려면 그 왕복을 반복한다.
   *
   * 자세히 보는 길은 요약 안의 '자세히'로 남겨 둔다. 이미 고른 칸을 다시 누르면
   * 접는다 — 같은 것을 누르면 닫히는 것이 여닫이의 기본이다.
   */
  const openDay = useCallback((date: string) => {
    setSelectedDate((prev) => (prev === date ? null : date));
  }, []);

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

    fetch(`/api/pitch-log?month=${monthKey}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((older: Log[]) => {
        if (cancelled) return;
        // 이미 가진 것과 겹칠 수 있어(영상 있는 기록) id 로 합친다.
        setOlderLogs((prev) => {
          const seen = new Set(prev.map((l) => l.id));
          return [...prev, ...older.filter((l) => !seen.has(l.id))];
        });
      })
      .catch(() => {
        if (cancelled) return;
        // 다시 넘어오면 한 번 더 받아볼 수 있게 표시를 지운다.
        loadedMonths.current.delete(monthKey);
        setError('그 달 기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
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

  /*
   * 고른 날의 투구 기록.
   *
   * 달력이 이미 열세 달치를 들고 있어서 DB 를 다시 묻지 않는다. 하루에 여러 번
   * 던진 날이 있으므로 하나만 찾지 않고 전부 모은다.
   */
  const selectedLogs = useMemo(
    () => (selectedDate ? logs.filter((l) => l.date.slice(0, 10) === selectedDate) : []),
    [logs, selectedDate]
  );

  return (
    <div className="space-y-3">
      {/*
        제목을 없앴다. 예전에는 '투구 일지'라는 이름과 그 밑에 설명 글이 있었는데,
        이 덩이가 이미 홈의 맨 앞이라 스스로 무엇인지 보여준다 — 이름표가 없어도
        달력이 뜬 순간 무엇을 하는 곳인지 알 수 있다.

        보기 전환만 남긴다. 오른쪽 끝에 붙여, 있던 자리(카드 위 오른쪽)를 그대로
        지킨다.

        설정 창의 단위 고르개와 같은 것을 쓴다 — 고른 쪽 밑의 하늘색 알약이 옆으로
        미끄러진다. 예전에는 버튼 색만 켜고 꺼서, 같은 모양의 상자인데 여기만
        움직임이 달랐다.
      */}
      <div className="flex justify-end px-1">
        <Segmented
          label="기록 보기 방식"
          value={view}
          onChange={setView}
          options={VIEW_OPTIONS}
          tone="raised"
          itemClassName="px-4 py-1.5"
        />
      </div>

      <FormError>{error}</FormError>

      {view === 'list' && <LogList logs={logs} />}

      {/*
        옛날 달을 받아 오는 동안 '지난 기록 불러오는 중…'을 띄웠었는데 뺐다.
        달을 넘길 때마다 모서리에 글이 떴다 사라지니 캘린더가 넘어가는 움직임을
        가렸다. 기록은 받아지는 대로 칸에 채워진다.
      */}
      {view === 'calendar' && (
        <Card>
          <MonthCalendar
            month={month}
            onMonthChange={setMonth}
            selected={selectedDate}
            onSelect={openDay}
            marks={marks}
          >
            <span>강도</span>
            <LegendSwatch className="h-3 w-5 rounded bg-sky/15">낮음</LegendSwatch>
            <LegendSwatch className="h-3 w-5 rounded bg-sky/40">보통</LegendSwatch>
            <LegendSwatch className="h-3 w-5 rounded bg-sky/70">높음</LegendSwatch>
            <LegendSwatch className="h-3 w-5 rounded border border-dashed border-line-strong">
              쉬는 날
            </LegendSwatch>
            <LegendSwatch className="h-1.5 w-1.5 rounded-full bg-sky-strong">
              영상
            </LegendSwatch>
          </MonthCalendar>
        </Card>
      )}

      {/*
        고른 날 요약은 달력 바로 밑에 둔다. 위에 두면 달력이 아래로 밀려 내려가,
        칸을 누를 때마다 방금 누른 자리가 화면 밖으로 나간다.
      */}
      {view === 'calendar' && selectedDate && (
        <DaySummary
          date={selectedDate}
          logs={selectedLogs}
          training={trainingByDay[selectedDate]}
          plan={planByDay[selectedDate]}
          featuredVideo={featuredByDay[selectedDate]}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
