'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Card, FormError, PageHeading } from '@/components/ui';
import { Modal } from '@/components/modal';
import { usePlaybackUrls } from '@/components/use-playback-urls';
import { isFutureDateKey, toDateKey } from '@/lib/pitch-stats';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import type { SavedAnalysisView } from '@/lib/pose/saved';
import {
  LegendSwatch,
  MonthCalendar,
  type DayMark,
} from '@/components/month-calendar';
import { PlanNote, type PlanNoteData } from '@/components/plan-note';
import { EntryForm } from './entry-form';
import { DayRecord } from './day-record';
import { CompareView, type ClipOption } from './compare-view';

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

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-08-24 → 8월 24일 (월) */
function spokenDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

/**
 * 투구 일지 — 달력 하나.
 *
 * 예전에는 달력이 왼쪽 사이드바로 좁게 눌려 있고, 오른쪽에 그날 기록과 입력
 * 폼이 늘 펼쳐져 있었다. 달력은 작아서 언제 던졌는지 한눈에 안 들어오고,
 * 오른쪽은 아무 날짜나 눌러도 뭔가 잔뜩 나와서 화면이 늘 꽉 차 있었다.
 *
 * 이제 달력만 크게 둔다. 날짜를 누르면 그날 것이 창으로 뜬다 — 기록·영상·
 * 폼 분석·수정·삭제가 전부 거기 있고, 기록이 없는 날이면 '이날 기록하기'가
 * 뜬다. 홈의 상자들과 같은 방식이라 앱 전체가 같은 손놀림으로 돈다.
 *
 * 2분할 비교는 날짜 하나에 매인 것이 아니라(여러 날의 영상을 견준다) 창에
 * 넣을 수 없어, 화면을 통째로 바꾸는 방식을 그대로 둔다.
 */
export function PitchLogClient({
  initialLogs,
  initialDate,
  heightCm,
  savedAnalyses,
  todayKey,
  todayPlan,
  loadedFrom,
}: {
  initialLogs: Log[];
  /** 다른 화면에서 날짜를 지정해 들어온 경우. 그 날짜 창을 바로 연다. */
  initialDate: string | null;
  heightCm: number | null;
  savedAnalyses: SavedAnalysisView[];
  /** 서버가 정한 오늘. 계획을 오늘 창에만 띄우는 데 쓴다. */
  todayKey: string;
  /** 오늘 던질 양. 통증 등으로 계획을 안 낸 날은 null */
  todayPlan: PlanNoteData | null;
  /**
   * 처음에 받아 온 가장 오래된 달 (YYYY-MM).
   *
   * 이보다 옛날 달로 넘기면 그때 그 달만 따로 받아 온다. 처음부터 전부 읽으면
   * 몇 년 쓴 사람에게는 열 때마다 천 건이 넘어온다.
   */
  loadedFrom: string;
}) {
  const [logs, setLogs] = useState<Log[]>(initialLogs);
  const [error, setError] = useState<string>();
  const [comparing, setComparing] = useState(false);
  /*
   * 이미 받아 온 달들. 처음 받아 온 범위(loadedFrom 이후)는 통째로 있는 것으로
   * 친다. 같은 달을 두 번 받지 않으려고 둔다.
   */
  const loadedMonths = useRef(new Set<string>());
  const [loadingMonth, setLoadingMonth] = useState(false);

  const [selectedDate, setSelectedDate] = useState(
    () => initialDate ?? toDateKey(new Date())
  );
  /** 날짜 창이 열려 있는가. 날짜를 지정해 들어왔으면 바로 연다. */
  const [dayOpen, setDayOpen] = useState(() => initialDate != null);

  // 넘어온 날짜가 지난달이면 달력도 그 달을 펴야 한다.
  const [month, setMonth] = useState(() => {
    const [y, m] = (initialDate ?? toDateKey(new Date())).split('-').map(Number);
    return new Date(y, m - 1, 1);
  });

  /**
   * 창 안에서 입력 폼을 펼쳐 둘지. null 이면 "알아서" —
   * 기록이 없는 날은 열고, 있는 날은 접는다.
   */
  const [formOpen, setFormOpen] = useState<boolean | null>(null);

  /** 지금 고치고 있는 기록의 id. 그 카드만 입력 폼으로 바뀐다. */
  const [editingId, setEditingId] = useState<string | null>(null);

  const openDay = useCallback((date: string) => {
    setSelectedDate(date);
    setFormOpen(null);
    setEditingId(null);
    setError(undefined);
    setDayOpen(true);
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
        setError('그 달 기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      })
      .finally(() => {
        if (!cancelled) setLoadingMonth(false);
      });

    return () => {
      cancelled = true;
    };
  }, [monthKey, loadedFrom]);

  const refresh = useCallback(async () => {
    try {
      /*
       * 지금 보고 있는 달만 다시 받아 그 달만 갈아 끼운다. 전부 다시 받으면
       * 옛날 달을 보다가 저장했을 때 그 달이 목록에서 사라진다.
       */
      const res = await fetch(`/api/pitch-log?month=${monthKey}`);
      if (!res.ok) throw new Error();
      const fresh: Log[] = await res.json();
      setLogs((prev) => [
        ...prev.filter((l) => l.date.slice(0, 7) !== monthKey),
        ...fresh,
      ]);
      setError(undefined);
    } catch {
      setError('기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  }, [monthKey]);

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await fetch('/api/pitch-log', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        if (editingId === id) setEditingId(null);
        refresh();
      }
    },
    [refresh, editingId]
  );

  /** 저장이 끝나면 목록을 새로 받고 폼을 닫는다. 창은 열어 둔다. */
  const handleSaved = useCallback(async () => {
    await refresh();
    setEditingId(null);
    setFormOpen(false);
  }, [refresh]);

  /**
   * 달력에 칠할 것.
   *
   * '안 던진 날'과 '아직 아무것도 안 남긴 날'은 전혀 다른 뜻인데 둘 다 빈칸이면
   * 구별이 안 된다. 쉬는 날은 색을 채우지 않고 점선으로 표시한다(intensity null).
   */
  const marks = useMemo(() => {
    type Acc = { pitches: number; intensity: number; video: boolean; rested: boolean };
    const byDay = logs.reduce<Record<string, Acc>>((acc, log) => {
      const key = log.date.slice(0, 10);
      const prev = acc[key] ?? { pitches: 0, intensity: 0, video: false, rested: true };
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
        spoken: [d.rested ? '쉬는 날로 남김' : `${d.pitches}구`, d.video ? '영상 있음' : null]
          .filter(Boolean)
          .join(', '),
      };
    }
    return out;
  }, [logs]);

  const selectedLogs = useMemo(
    () => logs.filter((l) => l.date.slice(0, 10) === selectedDate),
    [logs, selectedDate]
  );

  /*
   * 앞으로 올 날짜에는 남길 수 없다. 던진 것을 적는 곳이지 계획을 적는 곳이
   * 아니다 — 미리 적어두면 "최근 7일 부하"에 아직 던지지 않은 것이 들어간다.
   *
   * 날짜는 서버가 정한 오늘이 아니라 브라우저 기준으로 본다. 이 판단은 무엇을
   * 보여줄지만 정하고, 실제로 막는 것은 서버가 다시 한다.
   */
  const future = isFutureDateKey(selectedDate);
  const showForm = !future && (formOpen ?? selectedLogs.length === 0);

  /* ---------------------------- 영상 ---------------------------- */

  const withVideo = useMemo(
    () => logs.filter((l) => l.videoPaths.length > 0),
    [logs]
  );

  /*
   * 선택한 날짜의 영상 주소만 받아온다. 기록이 많아지면 전부 발급하기엔 느리다.
   * 창이 닫혀 있으면 아무것도 안 받는다 — 달력만 보는 동안에는 필요 없다.
   */
  const selectedPaths = useMemo(
    () => (dayOpen ? selectedLogs.flatMap((l) => l.videoPaths) : []),
    [dayOpen, selectedLogs]
  );
  const { urls: playbackUrls, loading: urlsLoading, ready: urlsReady } =
    usePlaybackUrls(selectedPaths);

  const savedByPath = useMemo(
    () => new Map(savedAnalyses.map((a) => [a.videoPath, a])),
    [savedAnalyses]
  );

  const savedFor = useCallback(
    (videoPath: string) => savedByPath.get(videoPath) ?? null,
    [savedByPath]
  );

  /** 이 영상보다 앞선 날짜의 가장 최근 저장 분석 — 변화 비교의 기준 */
  const previousFor = useCallback(
    (date: string, videoPath: string): SavedAnalysisView | null => {
      let best: SavedAnalysisView | null = null;
      for (const a of savedAnalyses) {
        if (a.videoPath === videoPath || a.date >= date) continue;
        if (
          !best ||
          a.date > best.date ||
          (a.date === best.date && a.updatedAt > best.updatedAt)
        ) {
          best = a;
        }
      }
      return best;
    },
    [savedAnalyses]
  );

  /** 비교 화면에서 고를 수 있는 영상 목록 (오래된 순) */
  const clips = useMemo<ClipOption[]>(
    () =>
      withVideo.flatMap((log) =>
        log.videoPaths.map((path, i) => ({
          id: `${log.id}-${i}`,
          date: log.date.slice(0, 10),
          path,
          label: log.videoPaths.length > 1 ? `영상 ${i + 1}` : '영상',
          summary: [
            log.maxVelocity != null ? `${log.maxVelocity}km/h` : null,
            `${log.pitchCount}구`,
            `강도 ${log.intensity}/10`,
          ]
            .filter(Boolean)
            .join(' · '),
        }))
      ),
    [withVideo]
  );

  if (comparing) {
    return (
      <div className="space-y-6">
        <PageHeading
          eyebrow="Pitch Log"
          title="2분할 비교"
          description="서로 다른 날의 투구 영상을 나란히 놓고 봅니다."
          action={
            <button
              type="button"
              onClick={() => setComparing(false)}
              className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-sky hover:text-sky"
            >
              달력으로 돌아가기
            </button>
          }
        />
        <CompareView clips={clips} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Pitch Log"
        title="투구 일지"
        description="날짜를 누르면 그날의 기록·영상·느낀점이 열립니다. 기록이 없는 날도 눌러서 남길 수 있습니다."
        action={
          // 2분할 비교는 영상이 두 개 이상 있어야 뜻이 있다.
          clips.length >= 2 ? (
            <button
              type="button"
              onClick={() => setComparing(true)}
              className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-sky hover:text-sky"
            >
              2분할 비교
            </button>
          ) : undefined
        }
      />

      <FormError>{error}</FormError>

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
          selected={dayOpen ? selectedDate : null}
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

      <Modal
        open={dayOpen}
        onClose={() => setDayOpen(false)}
        title={spokenDate(selectedDate)}
        description={
          future
            ? '아직 오지 않은 날입니다'
            : selectedLogs.length > 0
              ? `${selectedLogs.length}건의 기록`
              : '이 날은 아직 기록이 없습니다'
        }
        size="wide"
      >
        <div className="space-y-5">
          <FormError>{error}</FormError>

          {future && (
            <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm leading-relaxed text-muted">
              앞으로 올 날짜에는 기록할 수 없습니다.
              <br />
              던지고 나서 그날 또는 그 뒤에 남겨주세요.
            </p>
          )}

          {/*
            오늘 던질 양.
            지난 날짜에는 안 띄운다 — 그날 아침에 무엇이 계획이었는지는 남겨두지
            않아서, 지금 다시 계산한 값을 그때 계획인 양 보여줄 수는 없다.
          */}
          {selectedDate === todayKey && todayPlan && <PlanNote plan={todayPlan} />}

          {/* 기록 추가 — 기록이 없는 날은 바로 열려 있다. */}
          {showForm ? (
            <div className="space-y-4 rounded-2xl border border-line bg-surface-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-bold text-ink">
                  {selectedLogs.length > 0 ? '기록 추가' : '이날 기록하기'}
                </h3>
                {selectedLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="text-xs text-muted transition-colors hover:text-ink"
                  >
                    취소
                  </button>
                )}
              </div>
              <EntryForm
                key={selectedDate}
                date={selectedDate}
                onSaved={handleSaved}
                onError={setError}
              />
            </div>
          ) : future ? null : (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-sky-soft bg-sky-tint px-4 py-3.5 text-sm font-medium text-sky-strong transition-colors hover:bg-sky-tint/70"
            >
              <Plus className="h-4 w-4" />이 날짜에 기록 추가
            </button>
          )}

          {selectedLogs.map((log) =>
            editingId === log.id ? (
              // 고치는 동안에는 그 카드 자리에 입력 폼을 띄운다.
              <div
                key={log.id}
                className="space-y-4 rounded-2xl border border-line bg-surface-2 p-4"
              >
                <div>
                  <h3 className="font-bold text-ink">기록 수정</h3>
                  <p className="mt-1 text-sm text-muted">영상은 그대로 유지됩니다</p>
                </div>
                <EntryForm
                  date={selectedDate}
                  initial={log}
                  onSaved={handleSaved}
                  onError={setError}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            ) : (
              <DayRecord
                key={log.id}
                log={log}
                date={selectedDate}
                heightCm={heightCm}
                playbackUrls={playbackUrls}
                urlsPending={urlsLoading || !urlsReady}
                savedFor={savedFor}
                previousFor={previousFor}
                onEdit={(l) => {
                  setEditingId(l.id);
                  setError(undefined);
                }}
                onDelete={handleDelete}
              />
            )
          )}
        </div>
      </Modal>
    </div>
  );
}
