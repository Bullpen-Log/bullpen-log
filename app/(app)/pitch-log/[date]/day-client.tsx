'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { quietRefresh } from '@/lib/quiet-refresh';
import { ArrowLeft, House, Plus, type LucideIcon } from 'lucide-react';
import { Baseball } from '@/components/baseball-icon';
import { FormError } from '@/components/ui';
import { usePlaybackUrls } from '@/components/use-playback-urls';
import { isFutureDateKey } from '@/lib/pitch-stats';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { PlanNote, type PlanNoteData } from '@/components/plan-note';
import type { SavedAnalysisView } from '@/lib/pose/saved';
import { EntryForm } from '../entry-form';
import { DayRecord } from '../day-record';
import type { Log } from '../types';
import { useDayModal } from './day-modal';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-08-28 → 8월 28일 (금) */
function spokenDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
}

/**
 * 돌아갈 곳 하나 — '홈 달력' 또는 '투구 기록'.
 *
 * 팝업 안이고 그 화면에서 팝업을 열었으면(from 이 같으면) 새로 옮겨 가지 않고 창만
 * 닫는다 — 보던 달 · 고른 날이 그대로 남는다. 그 쪽에는 ← 를 붙여 '돌아가기'임을 보인다.
 * 아니면 그 화면으로 옮겨 가며 이 날을 펴 둔다(?date=).
 */
function BackLink({
  href,
  from,
  icon: Icon,
  children,
}: {
  href: string;
  /** 이 링크가 가리키는 화면의 경로 — 팝업을 연 화면과 견준다 */
  from: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  const modal = useDayModal();
  const back = modal != null && modal.origin === from;
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (!back) return;
        e.preventDefault();
        modal.close();
      }}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
        back
          ? 'border-sky-soft bg-sky-tint text-sky-strong hover:bg-sky-tint/70'
          : 'border-line text-muted hover:border-sky-soft hover:text-ink'
      }`}
    >
      {back ? (
        <ArrowLeft aria-hidden className="h-4 w-4" />
      ) : (
        <Icon aria-hidden className="h-4 w-4" />
      )}
      {children}
    </Link>
  );
}

/**
 * 하루치 투구 기록 화면.
 *
 * 앱 안에서 날짜를 누르면 보던 화면 위의 넓은 팝업으로 뜨고(day-modal.tsx), 주소로 곧장
 * 들어오면 한 페이지로 뜬다. 둘 다 이 화면이다 — 팝업 안이면 날짜 제목은 창 머리가 맡는다.
 *
 * 저장·삭제 뒤에는 서버에서 다시 읽는다(quietRefresh — 본문이 깜빡이지 않게). 화면에서만 지우고
 * 넘어가면 새로고침했을 때 지운 것이 되살아난 것처럼 보인다.
 */
export function DayClient({
  date,
  todayKey,
  heightCm,
  todayPlan,
  todayLimits,
  initialLogs,
  saved,
  earlier,
}: {
  date: string;
  todayKey: string;
  heightCm: number | null;
  /** 오늘 날짜일 때만 들어온다 */
  todayPlan: PlanNoteData | null;
  /** 오늘 계획의 상한 — 남긴 기록이 넘었는지 견준다. 오늘 날짜일 때만 들어온다 */
  todayLimits: {
    throwing: boolean;
    maxPitches: number | null;
    maxIntensity: number | null;
  } | null;
  initialLogs: Log[];
  /** 이 날 기록에 저장해 둔 폼 분석 */
  saved: SavedAnalysisView[];
  /** 이 날보다 앞선 분석들 — 변화를 견주는 기준 */
  earlier: SavedAnalysisView[];
}) {
  const router = useRouter();
  const modal = useDayModal();
  const [error, setError] = useState<string>();
  const [editingId, setEditingId] = useState<string | null>(null);
  /* 기록이 없는 날은 폼이 처음부터 열려 있다 — 그러려고 들어온 것이다. */
  const [formOpen, setFormOpen] = useState(initialLogs.length === 0);

  const future = isFutureDateKey(date);
  const logs = initialLogs;

  /*
   * 계획을 넘겼는지 본다 — 오늘 남긴 기록을 모두 합쳐서(쉰 날 표시는 빼고).
   *
   * 계획만 세워주고 지켰는지 아무도 안 보면 그 계획은 장식이다. 저장을 막지는
   * 않는다 — 이미 던진 것을 못 적게 하면 기록이 사라질 뿐이다. 예전에는 홈의 '오늘
   * 투구' 상자가 견줬는데 그 상자가 알림(종)으로 옮겨 가서 여기서 견준다.
   */
  const thrown = logs.filter((l) => l.sessionType !== REST_SESSION_TYPE);
  const overText = (() => {
    if (!todayLimits || thrown.length === 0) return null;
    if (!todayLimits.throwing) return '오늘은 쉬는 것이 계획이었습니다.';
    const total = thrown.reduce((sum, l) => sum + l.pitchCount, 0);
    const topIntensity = Math.max(...thrown.map((l) => l.intensity));
    const parts = [
      todayLimits.maxPitches != null && total > todayLimits.maxPitches
        ? `계획보다 ${total - todayLimits.maxPitches}구 많습니다`
        : null,
      todayLimits.maxIntensity != null && topIntensity > todayLimits.maxIntensity
        ? `계획 강도(${todayLimits.maxIntensity})를 넘었습니다`
        : null,
    ].filter(Boolean);
    return parts.length ? `${parts.join(' · ')}.` : null;
  })();

  const videoPaths = useMemo(() => logs.flatMap((l) => l.videoPaths), [logs]);
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
    quietRefresh(router);
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
      quietRefresh(router);
    },
    [router, editingId]
  );

  return (
    <div className="space-y-6">
      {/*
        돌아갈 곳을 맨 위에 둔다 — 홈 달력과 투구 기록 둘 다. 예전에는 홈 달력 하나라,
        투구 기록 탭에서 들어온 사람도 홈으로 떨어졌다. 팝업이면 연 화면 쪽이 '돌아가기'다.
      */}
      <nav aria-label="돌아갈 곳" className="flex flex-wrap items-center gap-2">
        <BackLink href={`/today?date=${date}`} from="/today" icon={House}>
          홈 달력
        </BackLink>
        <BackLink href={`/videos?date=${date}`} from="/videos" icon={Baseball}>
          투구 기록
        </BackLink>
      </nav>

      <div className={modal ? '' : 'border-b border-line pb-6'}>
        {/* 팝업이면 날짜는 창 머리가 보여 준다 — 두 번 적지 않는다 */}
        {!modal && (
          <h1 className="text-heading text-[1.75rem] leading-[1.15] text-ink sm:text-[2.25rem]">
            {spokenDate(date)}
          </h1>
        )}
        <p className={`text-sm text-muted ${modal ? '' : 'mt-2'}`}>
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

      {/* 계획을 넘겼으면 알린다. 막지는 않고 알리기만 한다. */}
      {overText && (
        <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-xs leading-relaxed text-warn">
          {overText} 내일 계획에 반영됩니다. 어깨나 팔꿈치가 무거우면 체크인에
          남겨주세요.
        </p>
      )}

      {logs.map((log) =>
        editingId === log.id ? (
          <div
            key={log.id}
            className="space-y-4 rounded-2xl border border-line bg-surface-2 p-4 sm:p-5"
          >
            <div>
              <h2 className="font-bold text-ink">기록 수정</h2>
              <p className="mt-1 text-sm text-muted">영상도 함께 바꿀 수 있습니다</p>
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
