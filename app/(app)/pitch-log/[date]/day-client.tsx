'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { FormError } from '@/components/ui';
import { usePlaybackUrls } from '@/components/use-playback-urls';
import { isFutureDateKey } from '@/lib/pitch-stats';
import { PlanNote, type PlanNoteData } from '@/components/plan-note';
import type { SavedAnalysisView } from '@/lib/pose/saved';
import { EntryForm } from '../entry-form';
import { DayRecord } from '../day-record';
import type { Log } from '../pitch-log-client';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-08-28 → 8월 28일 (금) */
function spokenDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
}

/** 2026-08-28 → 2026년 8월 */
function spokenMonth(key: string) {
  const [y, m] = key.split('-').map(Number);
  return `${y}년 ${m}월`;
}

/**
 * 하루치 투구 기록 화면.
 *
 * 창이 아니라 페이지다. 창에 넣었을 때는 그 안에서만 굴러가느라 영상 하나에
 * 화면이 잠겼는데, 페이지가 되니 그냥 아래로 읽어 내려가면 된다.
 *
 * 저장·삭제 뒤에는 router.refresh() 로 서버에서 다시 읽는다. 화면에서만 지우고
 * 넘어가면 새로고침했을 때 지운 것이 되살아난 것처럼 보인다.
 */
export function DayClient({
  date,
  todayKey,
  heightCm,
  todayPlan,
  initialLogs,
  saved,
  earlier,
}: {
  date: string;
  todayKey: string;
  heightCm: number | null;
  /** 오늘 날짜일 때만 들어온다 */
  todayPlan: PlanNoteData | null;
  initialLogs: Log[];
  /** 이 날 기록에 저장해 둔 폼 분석 */
  saved: SavedAnalysisView[];
  /** 이 날보다 앞선 분석들 — 변화를 견주는 기준 */
  earlier: SavedAnalysisView[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [editingId, setEditingId] = useState<string | null>(null);
  /* 기록이 없는 날은 폼이 처음부터 열려 있다 — 그러려고 들어온 것이다. */
  const [formOpen, setFormOpen] = useState(initialLogs.length === 0);

  const future = isFutureDateKey(date);
  const logs = initialLogs;

  const videoPaths = useMemo(
    () => logs.flatMap((l) => l.videoPaths),
    [logs]
  );
  const {
    urls: playbackUrls,
    loading: urlsLoading,
    ready: urlsReady,
  } = usePlaybackUrls(videoPaths);

  const savedByPath = useMemo(
    () => new Map(saved.map((a) => [a.videoPath, a])),
    [saved]
  );
  const savedFor = useCallback(
    (videoPath: string) => savedByPath.get(videoPath) ?? null,
    [savedByPath]
  );

  /** 이 영상보다 앞선 날짜의 가장 최근 저장 분석 — 변화 비교의 기준 */
  const previousFor = useCallback(
    (_date: string, videoPath: string): SavedAnalysisView | null => {
      let best: SavedAnalysisView | null = null;
      for (const a of earlier) {
        if (a.videoPath === videoPath) continue;
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
    [earlier]
  );

  const handleSaved = useCallback(() => {
    setEditingId(null);
    setFormOpen(false);
    setError(undefined);
    router.refresh();
  }, [router]);

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await fetch('/api/pitch-log', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        setError('기록을 지우지 못했습니다. 잠시 뒤에 다시 시도해주세요.');
        return;
      }
      if (editingId === id) setEditingId(null);
      router.refresh();
    },
    [router, editingId]
  );

  return (
    <div className="space-y-6">
      {/*
        돌아갈 곳을 맨 위에 둔다. 달력에서 들어온 사람이 대부분이라, 브라우저
        뒤로가기를 찾기 전에 눈에 보여야 한다. 그 달로 돌아간다.
      */}
      <Link
        href={`/pitch-log?date=${date}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-sky"
      >
        <ArrowLeft className="h-4 w-4" />
        {spokenMonth(date)} 달력
      </Link>

      <div className="border-b border-line pb-6">
        <h1 className="text-heading text-[1.75rem] leading-[1.15] text-ink sm:text-[2.25rem]">
          {spokenDate(date)}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {future
            ? '아직 오지 않은 날입니다'
            : logs.length > 0
              ? `${logs.length}건의 기록`
              : '이 날은 아직 기록이 없습니다'}
        </p>
      </div>

      <FormError>{error}</FormError>

      {future && (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm leading-relaxed text-muted">
          앞으로 올 날짜에는 기록할 수 없습니다.
          <br />
          던지고 나서 그날 또는 그 뒤에 남겨주세요.
        </p>
      )}

      {date === todayKey && todayPlan && <PlanNote plan={todayPlan} />}

      {logs.map((log) =>
        editingId === log.id ? (
          <div
            key={log.id}
            className="space-y-4 rounded-2xl border border-line bg-surface-2 p-4 sm:p-5"
          >
            <div>
              <h2 className="font-bold text-ink">기록 수정</h2>
              <p className="mt-1 text-sm text-muted">
                영상도 함께 바꿀 수 있습니다
              </p>
            </div>
            <EntryForm
              date={date}
              initial={log}
              onSaved={handleSaved}
              onError={setError}
              onCancel={() => setEditingId(null)}
              /* 폼 분석이 붙은 영상은 뺄 때 알려주려고 넘긴다 */
              analyzedPaths={saved.map((a) => a.videoPath)}
            />
          </div>
        ) : (
          <DayRecord
            key={log.id}
            log={log}
            date={date}
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

      {/* 기록 추가 — 기록이 없는 날은 처음부터 열려 있다 */}
      {!future &&
        (formOpen ? (
          <div className="space-y-4 rounded-2xl border border-line bg-surface-2 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-bold text-ink">
                {logs.length > 0 ? '기록 추가' : '이날 기록하기'}
              </h2>
              {logs.length > 0 && (
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
              key={date}
              date={date}
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
        ))}
    </div>
  );
}
