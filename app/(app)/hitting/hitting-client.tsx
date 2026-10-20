'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, PageHeading } from '@/components/ui';
import { Modal } from '@/components/modal';
import { MonthCalendar, type DayMark } from '@/components/month-calendar';
import { EffortChips } from '@/components/effort-chips';
import { ErrorLine } from '@/components/error-line';
import { ConfirmDelete } from '@/components/confirm-delete';
import { orOffline } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import { haptic } from '@/lib/haptics';
import { toast } from '@/components/toast';
import { dateKeyLabel } from '@/lib/pitch-stats';
import { HITTING_TYPES, hittingLine, type HittingType } from '@/lib/hitting-log';
import { deleteHittingLog, saveHittingLog } from '@/app/actions/hitting-log';

export type HittingRow = {
  id: string;
  date: string;
  sessionType: string;
  swings: number;
  effortPct: number | null;
  memo: string | null;
  satisfaction: number | null;
};

type Draft = {
  id?: string;
  date: string;
  sessionType: HittingType | null;
  swings: string;
  effortPct: number | null;
  memo: string;
};

const OFFLINE = { ok: false as const, error: '신호가 약해 저장하지 못했어요. 신호가 잡히면 다시 눌러 주세요.' };

/**
 * 타격 탭 화면 — 달력(그날 스윙 수) · 고른 날 기록 · 기록 남기기 시트(2026-10-20 타격 1단계 T5).
 * 투구 기록과 같은 꼴을 작게: 종류 · 스윙 수 · 체감 강도(1~10) · 메모. 영상 · 만족도는 다음 단계.
 */
export function HittingClient({ today, rows }: { today: string; rows: HittingRow[] }) {
  const router = useRouter();
  const [month, setMonth] = useState(() => new Date(`${today}T00:00:00`));
  const [selected, setSelected] = useState<string | null>(today);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const byDate = useMemo(() => {
    const m = new Map<string, HittingRow[]>();
    for (const r of rows) m.set(r.date, [...(m.get(r.date) ?? []), r]);
    return m;
  }, [rows]);

  const marks = useMemo(() => {
    const out: Record<string, DayMark> = {};
    for (const [date, list] of byDate) {
      const swings = list.reduce((s, r) => s + r.swings, 0);
      const efforts = list.map((r) => r.effortPct).filter((e): e is number => e != null);
      out[date] = {
        effortPct: efforts.length ? Math.max(...efforts) : null,
        label: `${swings}회`,
        dot: list.some((r) => r.memo),
        spoken: `${dateKeyLabel(date)} 스윙 ${swings}회`,
      };
    }
    return out;
  }, [byDate]);

  const dayRows = selected ? (byDate.get(selected) ?? []) : [];

  const openNew = () => {
    setError(null);
    setDraft({ date: selected ?? today, sessionType: null, swings: '', effortPct: null, memo: '' });
  };
  const openEdit = (r: HittingRow) => {
    setError(null);
    setDraft({
      id: r.id,
      date: r.date,
      sessionType: (HITTING_TYPES as readonly string[]).includes(r.sessionType)
        ? (r.sessionType as HittingType)
        : null,
      swings: String(r.swings),
      effortPct: r.effortPct,
      memo: r.memo ?? '',
    });
  };

  const save = () => {
    if (!draft || pending) return;
    if (!draft.sessionType) {
      setError('종류를 골라 주세요.');
      return;
    }
    setError(null);
    start(async () => {
      const r = await orOffline(
        saveHittingLog({
          id: draft.id,
          date: draft.date,
          sessionType: draft.sessionType ?? '',
          swings: draft.swings,
          effortPct: draft.effortPct,
          memo: draft.memo,
        }),
        OFFLINE
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      haptic('success');
      toast(draft.id ? '고쳤어요' : '저장했어요');
      setSelected(draft.date);
      setDraft(null);
      quietRefresh(router);
    });
  };

  const remove = (id: string) => {
    start(async () => {
      const r = await orOffline(deleteHittingLog(id), { ok: false, error: OFFLINE.error });
      if (!r.ok) {
        setError(r.error ?? OFFLINE.error);
        return;
      }
      toast('지웠어요');
      setDraft(null);
      quietRefresh(router);
    });
  };

  return (
    <div className="stack-page">
      <PageHeading
        title="타격"
        inlineAction
        action={
          <Button size="sm" onClick={openNew}>
            기록 남기기
          </Button>
        }
      />

      <MonthCalendar
        month={month}
        onMonthChange={(update) => setMonth(update)}
        selected={selected}
        onSelect={setSelected}
        marks={marks}
      />

      {selected && (
        <section className="space-y-2">
          <p className="text-sm font-semibold text-ink">{dateKeyLabel(selected)}</p>
          {dayRows.length === 0 ? (
            <div className="rounded-2xl empty-well px-4 py-5 text-center">
              <p className="text-sm text-muted">이날 타격 기록이 없어요.</p>
              {selected <= today && (
                <button
                  type="button"
                  onClick={openNew}
                  className="mt-2 min-h-10 text-sm font-semibold text-sky-strong"
                >
                  이날 기록 남기기
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {dayRows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-subhead font-medium text-ink">{hittingLine(r)}</span>
                      {r.memo && <span className="block truncate text-footnote text-muted">{r.memo}</span>}
                    </span>
                    <span aria-hidden className="text-muted">
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? '타격 기록 고치기' : '타격 기록 남기기'}
        footer={
          <Button size="lg" className="w-full" onClick={save} disabled={pending}>
            {pending ? '저장하는 중…' : '저장하기'}
          </Button>
        }
      >
        {draft && (
          <div className="space-y-5">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted">날짜</span>
              <input
                type="date"
                max={today}
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-subhead text-ink"
              />
            </label>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted">종류</span>
              <div role="radiogroup" aria-label="종류" className="flex flex-wrap gap-2">
                {HITTING_TYPES.map((t) => {
                  const on = draft.sessionType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setDraft({ ...draft, sessionType: t })}
                      className={`min-h-10 rounded-full border px-4 text-sm ${
                        on ? 'border-sky bg-sky text-white' : 'border-line bg-surface text-ink'
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted">
                {draft.sessionType === '경기' ? '타석 · 스윙 수' : '스윙 수'}
              </span>
              <input
                inputMode="numeric"
                value={draft.swings}
                onChange={(e) => setDraft({ ...draft, swings: e.target.value.replace(/[^0-9]/g, '') })}
                placeholder="예: 100"
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-subhead text-ink"
              />
            </label>

            <EffortChips value={draft.effortPct} onChange={(pct) => setDraft({ ...draft, effortPct: pct })} />

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted">메모</span>
              <textarea
                rows={3}
                value={draft.memo}
                onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
                placeholder="오늘 타격 느낌"
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-subhead text-ink"
              />
            </label>

            {error && <ErrorLine>{error}</ErrorLine>}

            {draft.id && (
              <ConfirmDelete
                title="이 타격 기록을 지울까요?"
                detail="지우면 되돌릴 수 없어요."
                ariaLabel="이 타격 기록 지우기"
                className="min-h-10 text-sm font-medium text-danger"
                onConfirm={() => {
                  if (draft.id) remove(draft.id);
                }}
              >
                이 기록 지우기
              </ConfirmDelete>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
