'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { quietRefresh } from '@/lib/quiet-refresh';
import { ArrowLeft, House, Plus, type LucideIcon } from '@/components/icon';
import { Baseball } from '@/components/baseball-icon';
import { Button, FormError } from '@/components/ui';
import { usePlaybackUrls } from '@/components/use-playback-urls';
import { isFutureDateKey } from '@/lib/pitch-stats';
import { ArmStatusNote } from '@/components/arm-status-note';
import { NutritionLineNote } from '@/components/nutrition-line';
import type { NutritionLine } from '@/lib/nutrition/nudge';
import type { ArmStatus } from '@/lib/report/arm-status';
import { EntryForm, type DrillPrefill } from '../entry-form';
import { DayRecord } from '../day-record';
import type { Log } from '../types';
import { VelocitySection } from '../velocity-section';
import type { LogPrefill, VelocitySessionView } from '@/lib/velocity-meta';
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
  todayStatus,
  nutritionLine = null,
  initialLogs,
  velocity,
  velocityPrefill = null,
  drillPrefill = null,
  isAdmin = false,
}: {
  date: string;
  todayKey: string;
  /** 지금 팔 상태(위험 · 주의 · 안전) — 오늘 날짜일 때만 들어온다 */
  todayStatus: ArmStatus | null;
  /** 던진 뒤 회복식 한 줄 — 오늘 던진 기록이 있을 때만 */
  nutritionLine?: NutritionLine | null;
  initialLogs: Log[];
  /** 카메라로 잰 구속 — 세션과 공 하나하나. 없으면 빈 배열 */
  velocity: VelocitySessionView[];
  /** 아직 투구 기록으로 안 남긴 구속 측정 값 — 있으면 새 기록 폼이 이 값으로 채워져 열린다 */
  velocityPrefill?: LogPrefill | null;
  /**
   * 메커니즘 드릴로 던진 공(트레이닝의 '드릴로 공 N회 던졌어요' 카드에서 왔을 때) — 오늘 캐치볼 기록이 있으면 더할지 새로 남길지
   * 묻고, 없으면 새 기록 폼을 그 값으로 채워 연다. 구속 측정 값이 있으면 그쪽이 먼저.
   */
  drillPrefill?: DrillPrefill | null;
  /** 관리자 — 구속 공 고치기에 스피드건 값 칸 */
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const modal = useDayModal();
  const [error, setError] = useState<string>();
  const [editingId, setEditingId] = useState<string | null>(null);
  /* 기록이 없는 날은 폼이 처음부터 열려 있다 — 그러려고 들어온 것이다. */
  const [formOpen, setFormOpen] = useState(initialLogs.length === 0);

  const future = isFutureDateKey(date);
  /* 아직 안 남긴 구속 측정이 있으면 폼을 그 값으로 펴 둔다(그러려고 들어온 것이다) */
  const fromVelocity = !future && velocityPrefill != null;
  const logs = initialLogs;

  /*
   * 드릴 공: 저장하면(drillDone) 다시 권하지 않는다 — 새로 읽어도 서버가 카드가 닫혔으면 안 보내지만, 그 전에 두 번 남기지 않게.
   * 오늘 캐치볼 기록이 있으면 먼저 고르게 한다(같은 캐치볼을 두 줄로 나누지 않게) — 'add' 는 그 기록의 수정 폼에 공 수 · 메모를 더해 연다.
   */
  const [drillDone, setDrillDone] = useState(false);
  const [drillMode, setDrillMode] = useState<'new' | 'add' | null>(null);
  const fromDrill = !future && drillPrefill != null && !drillDone && !fromVelocity;
  const catchLog = logs.find((l) => l.sessionType === '캐치볼') ?? null;
  const drillChoosing = fromDrill && catchLog != null && drillMode == null;
  const drillNew = fromDrill && (catchLog == null || drillMode === 'new');
  const drillAddId = fromDrill && drillMode === 'add' ? (catchLog?.id ?? null) : null;

  const videoPaths = useMemo(() => logs.flatMap((l) => l.videoPaths), [logs]);
  const {
    urls: playbackUrls,
    loading: urlsLoading,
    ready: urlsReady,
  } = usePlaybackUrls(videoPaths);

  /*
   * 저장한 폼만 닫는다. 하나로 묶었더니 다른 기록을 고쳐 저장할 때 적던 '기록 추가' 폼까지 닫혀, 적던 값 · 올리던 영상이
   * 사라졌다(2026-10-16).
   */
  const afterSave = () => {
    setError(undefined);
    quietRefresh(router);
  };
  const handleEditSaved = () => {
    setEditingId(null);
    afterSave();
  };
  /* 드릴 공을 캐치볼 기록에 더해 저장 */
  const handleDrillAddSaved = () => {
    setDrillDone(true);
    setDrillMode(null);
    afterSave();
  };
  const handleAddSaved = () => {
    setFormOpen(false);
    setDrillDone(true);
    setDrillMode(null);
    afterSave();
  };

  const handleDelete = useCallback(
    async (id: string) => {
      let res: Response;
      try {
        res = await fetch('/api/pitch-log', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
      } catch {
        /* 신호가 끊겨 요청 자체가 실패 — 예전에는 확인 창이 아무 말 없이 떠 있었다(잡지 않은 오류) */
        setError(
          '신호가 약해 기록을 지우지 못했어요. 신호가 잡히면 다시 시도해 주세요.'
        );
        return;
      }
      if (!res.ok) {
        setError('기록을 지우지 못했어요. 잠시 뒤에 다시 시도해 주세요.');
        return;
      }
      if (editingId === id) setEditingId(null);
      quietRefresh(router);
    },
    [router, editingId]
  );

  return (
    <div className="stack-page">
      {/*
        돌아갈 곳을 맨 위에 둔다 — 홈 달력과 투구 기록 둘 다. 예전에는 홈 달력 하나라,
        투구 기록 탭에서 들어온 사람도 홈으로 떨어졌다. 팝업이면 연 화면 쪽이 '돌아가기'다.
      */}
      {/* 팝업이면 창의 닫기가 '돌아가기'라 두지 않는다(2026-10-15 — 창 머리 밑 칩 줄이 한 줄을 차지했다). 주소로 곧장 들어온 쪽만 */}
      {!modal && (
        <nav aria-label="돌아갈 곳" className="flex flex-wrap items-center gap-2">
          <BackLink href={`/today?date=${date}`} from="/today" icon={House}>
            홈 달력
          </BackLink>
          <BackLink href={`/videos?date=${date}`} from="/videos" icon={Baseball}>
            투구 기록
          </BackLink>
        </nav>
      )}

      <div className={modal ? '' : 'border-b border-line pb-6'}>
        {/* 팝업이면 날짜는 창 머리가 보여 준다 — 두 번 적지 않는다 */}
        {!modal && (
          <h1 className="text-heading page-title text-ink">{spokenDate(date)}</h1>
        )}
        <p className={`text-sm text-muted ${modal ? '' : 'mt-2'}`}>
          {future
            ? '아직 오지 않은 날이에요'
            : logs.length > 0
              ? `${logs.length}건의 기록`
              : '이 날은 아직 기록이 없어요'}
        </p>
      </div>

      <FormError>{error}</FormError>

      {future && (
        <p className="rounded-xl empty-well px-4 py-8 text-center text-sm leading-relaxed text-muted">
          앞으로 올 날짜에는 기록할 수 없어요.
          <br />
          던지고 나서 그날 또는 그 뒤에 남겨주세요.
        </p>
      )}

      {date === todayKey && todayStatus && (
        <ArmStatusNote status={todayStatus} compact />
      )}

      {date === todayKey && nutritionLine && <NutritionLineNote line={nutritionLine} />}

      {/* 카메라 구속 측정 — 공마다 구종 · 코스 · 결과를 고치고 지운다 */}
      <VelocitySection sessions={velocity} isAdmin={isAdmin} />

      {logs.map((log) =>
        drillAddId === log.id && drillPrefill ? (
          <div
            key={log.id}
            className="space-y-4 rounded-2xl border border-line bg-surface-2 p-(--block-pad)"
          >
            <div>
              <h2 className="font-bold text-ink">캐치볼 기록에 드릴 공 더하기</h2>
              <p className="mt-1 text-sm text-muted">
                {`투구수 ${log.pitchCount} → ${log.pitchCount + drillPrefill.pitchCount}구로 채웠어요`}
              </p>
            </div>
            <EntryForm
              isAdmin={isAdmin}
              date={date}
              initial={{
                ...log,
                pitchCount: log.pitchCount + drillPrefill.pitchCount,
                memo: log.memo ? `${log.memo} · ${drillPrefill.memo}` : drillPrefill.memo,
              }}
              onSaved={handleDrillAddSaved}
              onError={setError}
              onCancel={() => setDrillMode(null)}
            />
          </div>
        ) : editingId === log.id ? (
          <div
            key={log.id}
            className="space-y-4 rounded-2xl border border-line bg-surface-2 p-(--block-pad)"
          >
            <div>
              <h2 className="font-bold text-ink">기록 수정</h2>
              <p className="mt-1 text-sm text-muted">영상도 함께 바꿀 수 있어요</p>
            </div>
            <EntryForm
              isAdmin={isAdmin}
              date={date}
              initial={log}
              onSaved={handleEditSaved}
              onError={setError}
              onCancel={() => setEditingId(null)}
            />
          </div>
        ) : (
          <DayRecord
            key={log.id}
            log={log}
            date={date}
            playbackUrls={playbackUrls}
            urlsPending={urlsLoading || !urlsReady}
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
        (drillChoosing && drillPrefill ? (
          <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-(--block-pad)">
            <div>
              <h2 className="font-bold text-ink">
                {`메커니즘 드릴 공 ${drillPrefill.pitchCount}회`}
              </h2>
              <p className="mt-1 text-sm text-muted">오늘 캐치볼 기록이 있어요. 어떻게 남길까요?</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setDrillMode('add')}>
                캐치볼 기록에 더하기
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDrillMode('new')}>
                새 기록으로
              </Button>
            </div>
          </div>
        ) : formOpen || fromVelocity || drillNew ? (
          <div className="space-y-4 rounded-2xl border border-line bg-surface-2 p-(--block-pad)">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-bold text-ink">
                {fromVelocity
                  ? `구속 측정 ${velocityPrefill.pitchCount}구 기록하기`
                  : drillNew && drillPrefill
                    ? `드릴 공 ${drillPrefill.pitchCount}회 기록하기`
                    : logs.length > 0
                    ? '기록 추가'
                    : '이날 기록하기'}
              </h2>
              {logs.length > 0 && !fromVelocity && (
                <button
                  type="button"
                  onClick={() => {
                    /* 드릴 공 폼을 닫으면: 캐치볼이 있으면 고르기로 돌아가고, 없으면 이번엔 안 남기는 것 */
                    if (drillNew) {
                      if (catchLog) setDrillMode(null);
                      else setDrillDone(true);
                    }
                    setFormOpen(false);
                  }}
                  className="-my-2 inline-flex min-h-10 items-center px-3 text-xs text-muted transition-colors hover:text-ink"
                >
                  취소
                </button>
              )}
            </div>
            <EntryForm
              isAdmin={isAdmin}
              /* 측정을 남기면 채울 값이 바뀌어(없어져) 폼을 새로 연다 */
              key={`${date}:${velocityPrefill?.sessionIds.join(',') ?? ''}:${drillNew ? 'drill' : ''}`}
              date={date}
              prefill={fromVelocity ? velocityPrefill : null}
              drillPrefill={drillNew ? drillPrefill : null}
              onSaved={handleAddSaved}
              onError={setError}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-sky-tint desk:rounded-xl desk:border desk:border-dashed desk:border-sky-soft px-4 py-3.5 text-sm font-medium text-sky-strong transition-colors hover:bg-sky-tint/70"
          >
            <Plus className="h-4 w-4" />이 날짜에 기록 추가
          </button>
        ))}
    </div>
  );
}
