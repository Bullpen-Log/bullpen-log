'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BackLink, Button, PageHeading } from '@/components/ui';
import { NavTitle } from '@/components/nav-title';
import { Modal } from '@/components/modal';
import { MonthCalendar, type DayMark } from '@/components/month-calendar';
import { EffortChips } from '@/components/effort-chips';
import { ErrorLine } from '@/components/error-line';
import { ConfirmDelete } from '@/components/confirm-delete';
import { orOffline } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import { haptic } from '@/lib/haptics';
import { toast } from '@/components/toast';
import { dateKeyLabel, weekStartKey } from '@/lib/pitch-stats';
import { SPORT_LOG_VIEW } from '@/lib/nav';
import { Dumbbell, Film, Target } from '@/components/icon';
import { RoundBatter } from '@/components/round-icon';
import { HITTING_TYPES, hittingLine, type HittingType } from '@/lib/hitting-log';
import { deleteHittingLog, saveHittingLog, deleteHittingSession, saveHittingSession } from '@/app/actions/hitting-log';
import { BattingHero } from './batting-hero';
import styles from './batting-home.module.css';

export type HittingRow = {
  id: string;
  date: string;
  sessionType: string;
  swings: number | null;
  source: 'legacy' | 'session';
  effortPct: number | null;
  memo: string | null;
  satisfaction: number | null;
};

type Draft = {
  id?: string;
  requestId: string;
  source: 'legacy' | 'session';
  date: string;
  sessionType: HittingType | null;
  swings: string;
  effortPct: number | null;
  memo: string;
  satisfaction: number | null;
};

const OFFLINE = { ok: false as const, error: '신호가 약해 저장하지 못했어요. 신호가 잡히면 다시 눌러 주세요.' };

/**
 * 타격 탭 화면 — 종목 바의 두 칸이 한 화면을 나눠 쓴다(2026-10-20 김민: 종목 홈 추가, lib/nav.ts SPORT_BARS).
 * 홈('타격', /hitting): 오늘 · 이번 주 · 최근 기록. 기록(/hitting?view=log): 달력(그날 스윙 수) · 고른 날 기록.
 * 기록 남기기 시트는 둘 다 같다(2026-10-20 타격 1단계 T5). 투구 기록과 같은 꼴을 작게: 종류 · 스윙 수 · 체감 강도(1~10) · 메모.
 */
export function HittingClient({ today, rows }: { today: string; rows: HittingRow[] }) {
  const router = useRouter();
  const log = useSearchParams().get('view') === SPORT_LOG_VIEW;
  const [month, setMonth] = useState(() => new Date(`${today}T00:00:00`));
  const [selected, setSelected] = useState<string | null>(today);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [countOpen, setCountOpen] = useState(false);
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
      const efforts = list.map((r) => r.effortPct).filter((e): e is number => e != null);
      out[date] = {
        effortPct: efforts.length ? Math.max(...efforts) : null,
        label: `${list.length}건`,
        dot: list.some((r) => r.memo),
        spoken: `${dateKeyLabel(date)} 타격 기록 ${list.length}건`,
      };
    }
    return out;
  }, [byDate]);

  const dayRows = selected ? (byDate.get(selected) ?? []) : [];

  /* 기록 수가 아니라 실제로 기록을 남긴 날짜 수를 보여준다. */
  const week = useMemo(() => {
    const start = weekStartKey(today);
    const days = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(`${start}T12:00:00Z`);
      day.setUTCDate(day.getUTCDate() + i);
      return day.toISOString().slice(0, 10);
    });
    return { days, recorded: days.filter((d) => d <= today && byDate.has(d)).length };
  }, [byDate, today]);
  const recent = rows.slice(0, 3);
  const todayRows = byDate.get(today) ?? [];

  /* 홈에서 남기는 기록은 늘 오늘 — 기록 칸에서 고른 날이 남아 있어도 */
  const openNew = (date = log ? (selected ?? today) : today) => {
    setError(null);
    setCountOpen(false);
    setDraft({ requestId: crypto.randomUUID(), source: 'session', date, sessionType: null, swings: '', effortPct: null, memo: '', satisfaction: null });
  };
  const openEdit = (r: HittingRow) => {
    setError(null);
    setCountOpen(r.swings !== null);
    setDraft({
      id: r.id,
      requestId: r.id,
      source: r.source,
      date: r.date,
      sessionType: (HITTING_TYPES as readonly string[]).includes(r.sessionType)
        ? (r.sessionType as HittingType)
        : null,
      swings: r.swings === null ? '' : String(r.swings),
      effortPct: r.effortPct,
      memo: r.memo ?? '',
      satisfaction: r.satisfaction,
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
      const input = { date: draft.date, sessionType: draft.sessionType ?? '', swings: draft.swings, effortPct: draft.effortPct, memo: draft.memo, satisfaction: draft.satisfaction };
      const request = draft.source === 'legacy'
        ? saveHittingLog({ ...input, id: draft.id })
        : saveHittingSession({ ...input, id: draft.requestId, editing: !!draft.id });
      const r = await orOffline(request, OFFLINE);
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
      const r = await orOffline(draft?.source === 'legacy' ? deleteHittingLog(id) : deleteHittingSession(id), { ok: false, error: OFFLINE.error });
      if (!r.ok) {
        setError(r.error ?? OFFLINE.error);
        return;
      }
      toast('지웠어요');
      setDraft(null);
      quietRefresh(router);
    });
  };

  const rowList = (list: HittingRow[], withDate = false) => (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {list.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => openEdit(r)}
            className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-subhead font-medium text-ink">
                {withDate ? `${dateKeyLabel(r.date)} · ${hittingLine(r)}` : hittingLine(r)}
              </span>
              {r.memo && <span className="block truncate text-footnote text-muted">{r.memo}</span>}
            </span>
            <span aria-hidden className="text-muted">
              ›
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={log ? 'stack-page' : styles.home} data-sport-home={log ? undefined : 'hit'}>
      {/*
        기록에서 타격 첫 화면으로 — 휴대폰(앱) 위 막대에만 선다(본문엔 안 보임). 앱 하단바가 종목 바(‹ · 기록 · 트레이닝)였을 때의 길을
        2026-10-27 HIG 검토 A안(김민)으로 걷어 여기 둔다. 하단바 타격을 다시 눌러도 돌아온다.
      */}
      {log ? (
        <div className="desk:hidden">
          <BackLink href="/hitting">타격</BackLink>
        </div>
      ) : null}
      {log ? <PageHeading
        title="타격 기록"
        inlineAction
        action={
          <Button size="sm" onClick={() => openNew()}>
            기록 남기기
          </Button>
        }
      /> : <header className={styles.homeHeading}>
        <h1>타격</h1>
        <NavTitle title="타격" />
      </header>}

      {log ? (
        <>
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
                      onClick={() => openNew()}
                      className="mt-2 min-h-10 text-sm font-semibold text-sky-strong"
                    >
                      이날 기록 남기기
                    </button>
                  )}
                </div>
              ) : (
                rowList(dayRows)
              )}
            </section>
          )}
        </>
      ) : (
        <div className={styles.columns}>
          <div className={styles.primary}>
          <BattingHero today={today} count={todayRows.length} types={[...new Set(todayRows.map((r) => r.sessionType))]} onRecord={() => openNew(today)} />

          {/*
            타격의 영상 — 더보기에서 옮겨 옴(2026-10-21 김민: "타격은 운동 영상 + 타격 드릴"). 운동 영상은 앱에선 앱 화면으로 열린다.
            3D 스윙 분석(2026-10-21 금윤호 — 투구 탭의 '3D 동작 분석' 칸과 같은 자리)은 앱(판 11~)이면 앱 화면 /swing 으로 넘어간다.
          */}
          <Link
            href="/hitting/read"
            className="flex min-h-22 items-center gap-3 rounded-2xl border border-line bg-surface px-(--block-pad) py-4"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sky-tint">
              <Target aria-hidden className="size-5.5 text-sky" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-base font-semibold text-ink">
                선구안 훈련
              </strong>
              <span className="mt-1 block text-sm break-keep text-muted">
                다가오는 공의 구종과 스트라이크·볼을 읽어보세요.
              </span>
            </span>
            <span aria-hidden className="text-xl text-muted">
              ›
            </span>
          </Link>
          </div>

          <div className={styles.secondary}>
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">이번 주 기록</h2>
              <Link href={`/hitting?view=${SPORT_LOG_VIEW}`} className="min-h-11 flex items-center text-sm font-medium text-sky-strong">달력 보기</Link>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-(--block-pad)">
              <div className="flex items-baseline gap-2"><strong className="text-xl text-ink">{week.recorded}일</strong><span className="text-xs text-muted">기록한 날</span></div>
              <div className={styles.weekDays} aria-label="이번 주 기록한 날">
                {week.days.map((day, i) => <button type="button" key={day} disabled={day > today} onClick={() => { setSelected(day); setMonth(new Date(`${day}T00:00:00`)); router.push(`/hitting?view=${SPORT_LOG_VIEW}`); }} className={styles.weekDay} aria-label={`${dateKeyLabel(day)} ${day > today ? '아직 오지 않은 날' : byDate.has(day) ? '기록 있음' : '기록 없음'}`}>
                  <span>{['월','화','수','목','금','토','일'][i]}</span>
                  <span className={styles.weekMark} data-recorded={byDate.has(day)} data-today={day === today}>{day > today ? '—' : byDate.has(day) ? '✓' : ''}</span>
                  <span>{Number(day.slice(8))}</span>
                </button>)}
              </div>
            </div>
          </section>

          {/* 기존 기능의 주소는 유지하고, 타격 홈에 두 칸으로 읽기 쉽게 배치한다. */}
          <section className="space-y-3">
          <h2 className="text-base font-semibold text-ink">타격 도구</h2>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/training?sport=hit" className="flex min-h-28 flex-col items-start justify-center gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3">
              <Dumbbell aria-hidden className="size-5.5 text-sky" />
              <span className="text-sm font-semibold text-ink">트레이닝</span><span className="text-xs text-muted">타격을 위한 운동</span>
            </Link>
            <Link href="/hitting/videos" className="flex min-h-28 flex-col items-start justify-center gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3">
              <Film aria-hidden className="size-5.5 text-sky" />
              <span className="text-sm font-semibold text-ink">운동 영상</span><span className="text-xs text-muted">동작 보고 따라하기</span>
            </Link>
            <Link href="/hitting/lab" className="flex min-h-28 flex-col items-start justify-center gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3">
              <RoundBatter aria-hidden className="size-5.5 text-sky" />
              <span className="text-sm font-semibold text-ink">3D 스윙 분석 <span className="text-xs text-sky-strong">베타</span></span><span className="text-xs text-muted">촬영 안내 · 리포트 준비 중</span>
            </Link>
            <Link href="/hitting/drills" className="flex min-h-28 flex-col items-start justify-center gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3">
              <Target aria-hidden className="size-5.5 text-sky" />
              <span className="text-sm font-semibold text-ink">타격 드릴 <span className="text-xs text-sky-strong">준비 중</span></span><span className="text-xs text-muted">스윙 · 타이밍 · 컨택</span>
            </Link>
          </div>
          </section>

          {recent.length > 0 && (
            <section className="space-y-2">
              <p className="text-sm font-semibold text-ink">최근 기록</p>
              {rowList(recent, true)}
            </section>
          )}
          </div>
        </div>
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

            <div className="space-y-2">
              <button type="button" className="flex min-h-11 w-full items-center justify-between rounded-xl border border-line px-3 text-left text-sm font-medium text-ink" aria-expanded={countOpen} onClick={() => setCountOpen((v) => !v)}>
                <span>스윙 수 {draft.source === 'legacy' ? '· 이전 기록' : '· 선택'}</span><span aria-hidden>{countOpen ? '−' : '+'}</span>
              </button>
              {countOpen && <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted">{draft.sessionType === '경기' ? '타석 · 스윙 수' : '스윙 수'}</span>
                <input inputMode="numeric" value={draft.swings} onChange={(e) => setDraft({ ...draft, swings: e.target.value.replace(/[^0-9]/g, '') })} placeholder={draft.source === 'legacy' ? '기존 기록의 수를 입력해 주세요' : '모르면 비워두세요'} className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-subhead text-ink" />
                <span className="block text-xs text-muted">{draft.source === 'legacy' ? '이전 방식으로 저장된 기록은 스윙 수가 필요해요.' : '알고 있을 때만 적어 주세요. 0~1,000회'}</span>
              </label>}
            </div>

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
