'use client';

import { useCallback, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Card, FormError, PageHeading } from '@/components/ui';
import { Modal } from '@/components/modal';
import { usePlaybackUrls } from '@/components/use-playback-urls';
import { toDateKey } from '@/lib/pitch-stats';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import type { SavedAnalysisView } from '@/lib/pose/saved';
import { PitchCalendar, type DaySummary } from './calendar';
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
}: {
  initialLogs: Log[];
  /** 다른 화면에서 날짜를 지정해 들어온 경우. 그 날짜 창을 바로 연다. */
  initialDate: string | null;
  heightCm: number | null;
  savedAnalyses: SavedAnalysisView[];
}) {
  const [logs, setLogs] = useState<Log[]>(initialLogs);
  const [error, setError] = useState<string>();
  const [comparing, setComparing] = useState(false);

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

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/pitch-log');
      if (!res.ok) throw new Error();
      setLogs(await res.json());
      setError(undefined);
    } catch {
      setError('기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  }, []);

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

  const summaries = useMemo(() => {
    return logs.reduce<Record<string, DaySummary>>((acc, log) => {
      const key = log.date.slice(0, 10);
      const prev = acc[key] ?? {
        pitches: 0,
        maxIntensity: 0,
        hasVideo: false,
        rested: true,
      };
      acc[key] = {
        pitches: prev.pitches + log.pitchCount,
        maxIntensity: Math.max(prev.maxIntensity, log.intensity),
        hasVideo: prev.hasVideo || log.videoPaths.length > 0,
        // 하루에 여러 건이면, 한 건이라도 던졌으면 던진 날이다.
        rested: prev.rested && log.sessionType === REST_SESSION_TYPE,
      };
      return acc;
    }, {});
  }, [logs]);

  const selectedLogs = useMemo(
    () => logs.filter((l) => l.date.slice(0, 10) === selectedDate),
    [logs, selectedDate]
  );

  const showForm = formOpen ?? selectedLogs.length === 0;

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

      <Card>
        <PitchCalendar
          month={month}
          onMonthChange={setMonth}
          selected={dayOpen ? selectedDate : null}
          onSelect={openDay}
          summaries={summaries}
        />
      </Card>

      <Modal
        open={dayOpen}
        onClose={() => setDayOpen(false)}
        title={spokenDate(selectedDate)}
        description={
          selectedLogs.length > 0
            ? `${selectedLogs.length}건의 기록`
            : '이 날은 아직 기록이 없습니다'
        }
        size="wide"
      >
        <div className="space-y-5">
          <FormError>{error}</FormError>

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
          ) : (
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
