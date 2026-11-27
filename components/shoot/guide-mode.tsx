'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { fetchShootChecks } from '@/app/actions/shoot';
import { ChevronLeft, ChevronRight } from '@/components/icon';
import { Modal, useModalState } from '@/components/modal';
import { ShootExerciseDetail } from '@/components/shoot/exercise-detail';
import { STATE_LABEL } from '@/components/shoot/status';
import { ButtonLink } from '@/components/ui';
import { useWakeLock } from '@/components/use-wake-lock';
import { splitInstagramReference } from '@/lib/mechanics/reference-draft';
import { guideStart, shootRunHref } from '@/lib/shoot/guide';
import type { ShootWeekData } from '@/lib/shoot/load';
import { stateOf, weekItems } from '@/lib/shoot/progress';
import { weekLabel } from '@/lib/shoot/schedule';

const noSubscribe = () => () => {};

export function ShootGuideMode({ data, crew, startAt }: {
  data: ShootWeekData;
  crew: string | null;
  startAt: string | null;
}) {
  const { week, carried, infos } = data;
  const ready = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [queue] = useState(() => [...weekItems(week), ...carried.map(({ item }) => item)]);
  const [checks, setChecks] = useState(data.checks);
  const map = useMemo(() => new Map(checks.map((check) => [check.exerciseId, check])), [checks]);
  const [index, setIndex] = useState(() => guideStart(queue, map, startAt, !!week.deferred));
  const current = queue[index];
  const next = queue[index + 1];
  const info = current && infos[current.exerciseId];
  const hasVideo = info?.youtube || info?.own || splitInstagramReference(info?.description ?? '').url;
  const check = current && map.get(current.exerciseId);
  const list = useModalState<boolean>();
  const heading = useRef<HTMLHeadingElement>(null);
  const focusOnMove = useRef(false);
  const backHref = `/admin/shoot/${week.week}`;
  useWakeLock(!!current);

  useEffect(() => {
    if (!focusOnMove.current) return;
    focusOnMove.current = false;
    heading.current?.focus({ preventScroll: true });
    /* 제목이 아니라 맨 위로 — 제목으로 굴리면 위의 '운동 순서 N / 89 · 상태' 줄이 가려졌다 */
    heading.current?.parentElement?.scrollTo({ top: 0, behavior: 'instant' });
  }, [index]);

  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const result = await fetchShootChecks();
        if (active && result.ok) setChecks(result.checks);
      } catch {
        // The guide stays usable with the last known checks when offline.
      } finally {
        pending = false;
      }
    };
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  function move(to: number) {
    const item = queue[to];
    if (!ready || to === index || !item) return;
    focusOnMove.current = true;
    setIndex(to);
    // Keep this phone's position if the page is restored or refreshed.
    try {
      window.history.replaceState(null, '', shootRunHref(week.week, crew, item.no, 'guide'));
    } catch {
      // The local cursor still works in a browser that rejects a history update.
    }
  }

  return (
    <main className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col bg-page text-ink">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link href={backHref} className="flex min-h-11 items-center gap-1 text-sm font-semibold"><ChevronLeft aria-hidden className="h-4 w-4" />주차</Link>
        <div className="text-center">
          <p className="font-bold">촬영지원</p>
          <p className="text-xs text-muted">{weekLabel(week)}{crew ? ` · ${crew}조` : ''}</p>
        </div>
        <button type="button" onClick={(event) => list.show(true, event)} disabled={!ready || !current} className="min-h-11 rounded-xl px-2 text-sm font-semibold disabled:opacity-40">목록</button>
      </header>
      {current ? (
        <>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5">
            <p className="text-sm text-muted">운동 순서 {index + 1} / {queue.length} · {current.no} · {STATE_LABEL[stateOf(current, map)]}</p>
            <h1 ref={heading} tabIndex={-1} className="scroll-mt-3 text-2xl font-bold break-keep focus:outline-none">{current.title}</h1>
            {check?.status === 'later' && check.note && <p className="whitespace-pre-wrap break-words text-sm text-muted">미룸 사유 · {check.note}</p>}
            {!hasVideo && <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">등록된 시범 영상이 없어요. 아래 시범 방법을 확인해 주세요.</p>}
            <ShootExerciseDetail key={current.exerciseId} item={current} info={info} />
          </div>
          <footer className="shrink-0 space-y-2 border-t border-line bg-page px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <p className="text-sm break-keep text-muted">{next ? `다음 · ${next.no} ${next.title}` : '마지막 운동이에요'}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => move(index - 1)} disabled={!ready || index === 0} className="min-h-13 rounded-2xl bg-ink/6 px-5 font-semibold disabled:opacity-40">이전</button>
              {next ? (
                <button type="button" onClick={() => move(index + 1)} disabled={!ready} className="flex min-h-13 flex-1 items-center justify-center gap-2 rounded-2xl bg-sky px-4 font-bold text-white disabled:opacity-50">다음 <ChevronRight aria-hidden className="h-5 w-5" /></button>
              ) : <ButtonLink href={backHref} className="min-h-13 flex-1">시간표로 돌아가기</ButtonLink>}
            </div>
          </footer>
        </>
      ) : <p className="p-5 text-sm text-muted">이 주차에는 확인할 운동이 없어요.</p>}
      <Modal open={list.open} onClose={list.close} title="운동 순서" origin={list.origin}>
        <ol className="divide-y divide-line">
          {queue.map((item, i) => (
            <li key={item.exerciseId}>
              <button type="button" aria-current={i === index ? 'step' : undefined} onClick={() => { list.close(); move(i); }} className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left text-sm aria-[current=step]:font-bold">
                <span>{item.no} {item.title}</span><span className="shrink-0 text-xs text-muted">{STATE_LABEL[stateOf(item, map)]}</span>
              </button>
            </li>
          ))}
        </ol>
      </Modal>
    </main>
  );
}
