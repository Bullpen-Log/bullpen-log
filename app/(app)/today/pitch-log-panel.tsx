'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ChartLine } from 'lucide-react';
import { Card, FormError } from '@/components/ui';
import { toDateKey } from '@/lib/pitch-stats';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { LegendSwatch, MonthCalendar, type DayMark } from '@/components/month-calendar';
import { Segmented } from '@/components/segmented';
import { LogList } from '@/app/(app)/pitch-log/log-list';
import type { Log } from '@/app/(app)/pitch-log/types';
import type { PlanDaySummary, TrainingDaySummary } from '@/lib/report/training-history';
import type { DayDetail } from '@/lib/day-detail';
import {
  DaySummary,
  firstFocus,
  type CheckinDay,
  type DayFacts,
  type DayFocus,
  type NutritionDay,
} from './day-summary';
import { DayDetailBlock } from './day-detail';
import { AnalysisBlock } from './analysis-block';
import type { AnalysisTab } from './analysis-tabs';

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
 * 달력을 홈 맨 앞으로 올린다. 열면 이번 달이 한눈에 보인다. 그날의 수치·영상·
 * 폼 분석·수정은 전부 /pitch-log/<날짜> 에 있다.
 *
 * 달력과 목록을 한 화면에 같이 두지 않고 오가게 하는 것은 그대로 뒀다.
 * 달력은 '그 날짜'를 알 때, 목록은 '요즘 뭐 했더라'를 볼 때 쓴다 — 같은 기록을
 * 다르게 보는 것이라 나란히 둘 이유가 없다.
 *
 * 날짜를 누르면 그날 칸이 달력 오른쪽에서 폭을 넓히며 들어오고, 달력은 그만큼
 * 좁아지며 위아래로도 줄어든다(좁은 화면에서는 달력 밑에서 펴진다). 아무 날도 안
 * 골랐을 때는 달력이 제 크기를 다 쓴다 — 칸을 늘 띄워 두었더니 달력이 너무 작아졌다.
 *
 * 그날 칸은 요약이다 — 줄마다 그날의 숫자를 보여 준다. 줄을 누르면 달력 밑에 그 줄의
 * 조금 더 자세한 요약이 펴지고, 그 칸 위쪽에서 투구·트레이닝·영양·영상·분석 탭으로
 * 그 날짜 그대로 넘어간다 — 달력이 앱 전체로 들어가는 문이 된다.
 */
export function PitchLogPanel({
  today,
  initialLogs,
  initialDate,
  loadedFrom,
  trainingByDay,
  planByDay,
  featuredByDay,
  nutritionByDay,
  checkinByDay,
  reportDays,
  analysisSlot,
  initialAnalysisTab,
}: {
  /** 서비스 기준 오늘(YYYY-MM-DD) — 그날 칸이 '오늘'·'어제'를 가르는 데 쓴다 */
  today: string;
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
  /** 날짜별로 먹은 칼로리·단백질 합 */
  nutritionByDay: Record<string, NutritionDay>;
  /** 날짜별 체크인 — 컨디션과 통증 여부 */
  checkinByDay: Record<string, CheckinDay>;
  /** AI 리포트가 있는 날들 — 캘린더 칸 왼쪽 위에 그래프 표시를 붙인다 */
  reportDays: string[];
  /** 오늘의 리포트 — 서버가 함께 그려 보낸다(밑의 분석 칸이 오늘·리포트일 때 쓴다) */
  analysisSlot: ReactNode;
  /** 분석 칸이 처음 펼 칸 — ?analysis= 로 들어온 경우 */
  initialAnalysisTab: AnalysisTab;
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
  /*
   * 그날 칸이 보여 주는 날. 닫는 동안(칸이 좁아지며 빠지는 0.3초)에도 칸이 비지
   * 않게 마지막으로 고른 날을 들고 있는다 — 그리는 동안 맞추는 방식(이펙트 없이).
   */
  const [shownDate, setShownDate] = useState(initialDate ?? today);
  if (selectedDate && selectedDate !== shownDate) setShownDate(selectedDate);
  const panelOpen = selectedDate != null;
  const panelRef = useRef<HTMLDivElement>(null);

  /*
   * 캘린더 밑 칸에 펴 둔 줄(투구·트레이닝·영양…). 날짜를 새로 열 때는 그날 남긴 것
   * 가운데 가장 앞 줄로, 열린 채 다른 날로 옮길 때는 보던 줄 그대로 둔다 — 영양을
   * 보다가 옆 날을 누르면 그날 영양이 보여야 며칠을 견줄 수 있다.
   */
  const [focus, setFocus] = useState<DayFocus>('pitch');

  /*
   * 밑 칸에 쓸 그날 요약(트레이닝·영양·컨디션·분석). 날짜를 고를 때 그날 것만 받아
   * 날짜별로 들고 있는다 — 같은 날을 다시 눌러도 다시 받지 않는다.
   */
  const [details, setDetails] = useState<Record<string, DayDetail>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  /*
   * 체크인이 바뀐 날은 들고 있던 요약을 버리고 다시 받는다.
   *
   * 이 칸의 '지금 체크인하기'를 눌러 알림(종)의 체크인 창에서 저장하면, 서버가 새
   * 체크인 목록(checkinByDay)을 보내 준다. 그런데 요약은 날짜마다 한 번만 받아 두어서
   * 바로 위 줄은 '7/10'인데 이 칸은 여전히 '체크인이 없어요'라고 했다. 목록이 새로
   * 오면(그리는 도중에 앞 값과 견주는 방법) 달라진 날만 골라 버린다 — 다른 날 요약은
   * 그대로 두어 괜히 다시 받느라 깜빡이지 않게.
   */
  const [seenCheckins, setSeenCheckins] = useState(checkinByDay);
  if (seenCheckins !== checkinByDay) {
    setSeenCheckins(checkinByDay);
    const changed = new Set(
      [...Object.keys(seenCheckins), ...Object.keys(checkinByDay)].filter(
        (d) => JSON.stringify(seenCheckins[d]) !== JSON.stringify(checkinByDay[d])
      )
    );
    if (changed.size > 0) {
      setDetails((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([d]) => !changed.has(d)))
      );
    }
  }

  useEffect(() => {
    if (!selectedDate || details[selectedDate] || failed[selectedDate]) return;
    const date = selectedDate;
    let cancelled = false;
    fetch(`/api/day-detail?date=${date}`)
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status)))
      )
      .then((detail: DayDetail) => {
        if (!cancelled) setDetails((prev) => ({ ...prev, [date]: detail }));
      })
      .catch(() => {
        if (!cancelled) setFailed((prev) => ({ ...prev, [date]: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate, details, failed]);

  /*
   * 좁은 화면에서는 그날 칸이 달력 밑에서 펴진다. 달력이 화면을 거의 채우고 있어서,
   * 펴진 칸이 화면 밖이면 거기까지만 살짝 굴려 보여 준다(이미 보이면 가만히 둔다).
   */
  useEffect(() => {
    if (!selectedDate || window.matchMedia('(min-width: 1024px)').matches) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => {
      const el = panelRef.current;
      if (el && el.getBoundingClientRect().bottom > window.innerHeight) {
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
      }
    }, 320);
    return () => window.clearTimeout(timer);
  }, [selectedDate]);

  // 넘어온 날짜가 지난달이면 달력도 그 달을 펴야 한다.
  const [month, setMonth] = useState(() => {
    const [y, m] = (initialDate ?? toDateKey(new Date())).split('-').map(Number);
    return new Date(y, m - 1, 1);
  });

  /** 한 날에 대해 캘린더가 이미 들고 있는 한 줄 요약들 */
  const factsOf = useCallback(
    (date: string): DayFacts => ({
      logs: logs.filter((l) => l.date.slice(0, 10) === date),
      training: trainingByDay[date],
      plan: planByDay[date],
      nutrition: nutritionByDay[date],
      checkin: checkinByDay[date],
    }),
    [logs, trainingByDay, planByDay, nutritionByDay, checkinByDay]
  );

  /*
   * 날짜를 누르면 옆 칸이 그날로 열린다(이미 열려 있으면 그날로 바뀐다).
   *
   * 예전에는 곧바로 그날 화면으로 넘어갔다. 그런데 달력은 이 칸 저 칸 눌러보며
   * 훑는 물건이라, 뭐가 있었는지 잠깐 보려던 것뿐인데 매번 화면이 통째로 바뀌고
   * 다시 뒤로 와야 했다. 넘어가는 길은 밑 칸 위쪽의 링크가 맡는다.
   *
   * 고른 칸을 다시 누르면 닫는다 — 같은 것을 누르면 닫히는 것이 여닫이의 기본이다.
   * 칸이 빠지면 달력이 다시 제 폭과 높이로 돌아간다.
   */
  const openDay = useCallback(
    (date: string) => {
      if (selectedDate === date) {
        setSelectedDate(null);
        return;
      }
      /* 닫혀 있다가 열 때만 줄을 새로 고른다 */
      if (selectedDate === null) setFocus(firstFocus(factsOf(date)));
      /* 받아 오다 실패한 날은 다시 누르면 다시 받는다 */
      setFailed((prev) => (prev[date] ? { ...prev, [date]: false } : prev));
      setSelectedDate(date);
    },
    [selectedDate, factsOf]
  );

  /*
   * 밑의 분석 칸에서 날짜로 건너뛸 때('가장 가까운 이전 리포트', 지난 리포트 목록).
   *
   * 캘린더가 그날을 고른다 — 분석 칸은 고른 날을 따르므로 함께 그날로 바뀐다. 다른 달이면
   * 달도 넘긴다. 이미 고른 날이어도 닫지 않는다(누른 것이 날짜 칸이 아니다). 목록으로
   * 보고 있었으면 캘린더로 돌린다 — 고른 날이 보여야 한다.
   */
  const jumpTo = useCallback(
    (date: string) => {
      const [y, m] = date.split('-').map(Number);
      setMonth((prev) =>
        prev.getFullYear() === y && prev.getMonth() === m - 1
          ? prev
          : new Date(y, m - 1, 1)
      );
      setView('calendar');
      if (selectedDate === date) return;
      if (selectedDate === null) setFocus(firstFocus(factsOf(date)));
      setSelectedDate(date);
    },
    [selectedDate, factsOf]
  );

  /* 리포트가 있는 날 — 캘린더 칸 왼쪽 위의 그래프 표시(화면 낭독기는 이 말을 덧붙여 읽는다) */
  const reportFlags = useMemo(
    () => Object.fromEntries(reportDays.map((d) => [d, '분석 리포트 있음'])),
    [reportDays]
  );

  /*
   * 그날 칸의 줄을 누르면 밑 칸이 그 줄로 바뀐다.
   *
   * 좁은 화면에서는 밑 칸이 그날 칸 밑, 화면 밖에 있기 쉽다. 눌렀는데 아무것도
   * 바뀌지 않은 것처럼 보이지 않게, 밑 칸의 머리가 안 보이면 거기까지 굴려 준다.
   */
  const detailRef = useRef<HTMLDivElement>(null);
  const pickFocus = useCallback((next: DayFocus) => {
    setFocus(next);
    if (window.matchMedia('(min-width: 1024px)').matches) return;
    const el = detailRef.current;
    if (!el || el.getBoundingClientRect().top < window.innerHeight - 96) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
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
   * 고른 날에 대해 이미 아는 것 — 옆 칸과 밑 칸이 같이 쓴다.
   *
   * 투구 기록은 달력이 이미 열세 달치를 들고 있어서 DB 를 다시 묻지 않는다. 하루에
   * 여러 번 던진 날이 있으므로 하나만 찾지 않고 전부 모은다(factsOf).
   */
  const shownFacts = useMemo(() => factsOf(shownDate), [factsOf, shownDate]);

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
        <div>
          {/*
            lg:items-stretch — 캘린더와 옆 그날 칸의 위아래 끝을 맞춘다. 캘린더가 줄어들면
            (compact) 그날 칸도 함께 줄어든다.
          */}
          <div className="flex flex-col lg:flex-row lg:items-stretch">
            <Card className="min-w-0 lg:flex-1">
              {/*
                날짜를 고르면 칸 높이도 줄어든다(compact) — 옆 칸이 폭을, 밑 칸이
                높이를 가져가며 캘린더가 자리를 내준다.
              */}
              <MonthCalendar
                month={month}
                onMonthChange={setMonth}
                selected={selectedDate}
                onSelect={openDay}
                marks={marks}
                compact={panelOpen}
                flags={reportFlags}
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
                <span className="flex items-center gap-1.5">
                  <ChartLine aria-hidden className="h-3 w-3 text-cat-core" />
                  분석
                </span>
              </MonthCalendar>
            </Card>

            {/*
              그날 칸.

              넓은 화면: 오른쪽에서 폭이 0 → 32rem 으로 넓어지며 들어온다. 달력은 남는
              폭을 쓰므로(flex-1) 칸이 넓어지는 만큼 같이 좁아진다 — 칸이 달력을 밀고
              들어오는 것으로 보인다. 칸 안의 글은 처음부터 제 폭(32rem)으로 그려 두고
              바깥 틀만 넓어지게 해서, 들어오는 동안 글이 접혔다 펴지며 흔들리지 않는다.

              좁은 화면: 달력 밑에서 높이가 펴진다(grid-rows 0fr → 1fr). 위에 두면
              달력이 아래로 밀려 내려가, 방금 누른 칸이 화면 밖으로 나간다.
            */}
            <div
              ref={panelRef}
              aria-hidden={!panelOpen}
              inert={!panelOpen}
              className={`grid overflow-hidden transition-[grid-template-rows,width,margin,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:block lg:shrink-0 ${
                panelOpen
                  ? 'mt-4 grid-rows-[1fr] opacity-100 lg:ml-4 lg:mt-0 lg:w-[32rem]'
                  : 'mt-0 grid-rows-[0fr] opacity-0 lg:ml-0 lg:w-0'
              }`}
            >
              <div className="min-h-0 lg:h-full lg:w-[32rem]">
                <div
                  className={`transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:h-full ${
                    panelOpen ? 'translate-x-0' : 'lg:translate-x-8'
                  }`}
                >
                  <DaySummary
                    date={shownDate}
                    today={today}
                    facts={shownFacts}
                    focus={focus}
                    onFocus={pickFocus}
                    onClose={() => setSelectedDate(null)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/*
            밑 칸 — 오른쪽에서 누른 줄을 조금 더 자세히. 캘린더와 옆 칸 밑에서 높이가
            펴지며 나타나고(grid-rows 0fr → 1fr), 닫을 때는 거꾸로 접힌다.

            scroll-mt-20: 좁은 화면에서 여기까지 굴릴 때 위쪽 고정 막대(h-14)에 머리가
            가리지 않게.
          */}
          <div
            ref={detailRef}
            aria-hidden={!panelOpen}
            inert={!panelOpen}
            className={`grid scroll-mt-20 transition-[grid-template-rows,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              panelOpen
                ? 'mt-4 grid-rows-[1fr] opacity-100'
                : 'mt-0 grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <DayDetailBlock
                date={shownDate}
                today={today}
                focus={focus}
                facts={shownFacts}
                featuredVideo={featuredByDay[shownDate]}
                detail={details[shownDate] ?? null}
                failed={failed[shownDate] ?? false}
                onRetry={() => setFailed((prev) => ({ ...prev, [shownDate]: false }))}
              />
            </div>
          </div>
        </div>
      )}

      {/*
        분석 칸 — 늘 떠 있다(예전의 분석 탭). 고른 날을 따라 그날 분석으로 바뀌고,
        아무 날도 안 골랐으면 오늘이다. 목록으로 보고 있을 때도 남는다.
      */}
      <AnalysisBlock
        date={selectedDate ?? today}
        today={today}
        initialTab={initialAnalysisTab}
        todayReport={analysisSlot}
        onJump={jumpTo}
      />
    </div>
  );
}
