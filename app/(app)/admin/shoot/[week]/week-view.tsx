'use client';

import { useMemo, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clapperboard, Clock3, Coffee, RotateCcw, Wrench } from 'lucide-react';
import { ButtonLink, PageHeading } from '@/components/ui';
import { Modal, useModalState } from '@/components/modal';
import { Segmented } from '@/components/segmented';
import { StackBar } from '@/components/shoot/gauge';
import { ShootExerciseDetail } from '@/components/shoot/exercise-detail';
import { STATE_LABEL, STATE_PILL, stampText } from '@/components/shoot/status';
import { ShootUndoToast } from '@/components/shoot/undo-toast';
import { ClipPickButtons } from '@/components/shoot/clip-pick-buttons';
import { PendingClips } from '@/components/shoot/pending-clips';
import { useClipFlow, type ClipTarget } from '@/components/shoot/use-clip-flow';
import { useShootChecks } from '@/components/shoot/use-shoot-checks';
import { haptic } from '@/lib/haptics';
import type { ShootWeekData } from '@/lib/shoot/load';
import {
  BUCKET_LABEL,
  clockText,
  countOf,
  cursorOfList,
  stateOf,
  weekItems,
  type ItemState,
  type ShootCheckView,
  type ShootStatus,
} from '@/lib/shoot/progress';
import type { PlanItem } from '@/lib/shoot/schedule';

type Filter = 'all' | 'open' | 'done';

/**
 * 주차 시간표(관리자) — 휴대폰은 한 줄에 번호 · 운동 · 시범 방법, PC 는 시각 · 부위 · 기구 · 누가 찍었나까지 한 줄에.
 * 왼쪽 동그라미를 누르면 찍음 ↔ 대기, 줄을 누르면 자세히(영상 · 진행 방법 · 상태 네 가지 · 메모).
 */
export function WeekView({ data, me }: { data: ShootWeekData; me: string }) {
  const router = useRouter();
  const { week, carried, infos, weeks } = data;
  const { map, set, adopt, toast, undo, closeToast, error, clearError } = useShootChecks(
    data.checks,
    { me }
  );
  const clips = useClipFlow({ adopt });
  const [filter, setFilter] = useState<Filter>('all');
  const detail = useModalState<string>();

  const items = useMemo(() => weekItems(week), [week]);
  const queue = useMemo(
    () => [...items, ...carried.map((c) => c.item)],
    [items, carried]
  );
  const carriedWeek = useMemo(
    () => new Map(carried.map((c) => [c.item.exerciseId, c.week])),
    [carried]
  );
  const count = countOf(items, map);
  const { current, next } = cursorOfList(queue, map);
  const equipment = useMemo(
    () => [...new Set(items.flatMap((it) => it.equipment))].filter((e) => e !== '맨몸'),
    [items]
  );

  const show = (it: PlanItem) => {
    const st = stateOf(it, map);
    if (filter === 'open') return st !== 'done';
    if (filter === 'done') return st === 'done';
    return true;
  };

  function toggle(it: PlanItem) {
    const st = stateOf(it, map);
    if (st === 'done') {
      haptic('light');
      void set(it.exerciseId, null, { label: `${it.no} 대기로 되돌림` });
    } else {
      haptic('success');
      void set(it.exerciseId, 'done', { label: `${it.no} 찍음` });
    }
  }

  const open = detail.content
    ? queue.find((it) => it.exerciseId === detail.content)
    : undefined;

  return (
    <>
      <PageHeading
        title={`${week.week}주차 촬영`}
        description={`${items.length}개 · 계획 0:15~${clockText(week.end)} · 자리 ${week.stations.length}곳${carried.length ? ` · 앞 주에서 넘어온 것 ${carried.length}개` : ''}`}
        action={
          /* 휴대폰은 진행 칸의 큰 [이어 찍기] 하나만 — ButtonLink 의 inline-flex 가 hidden 을 이겨서 감싼다 */
          <div className="hidden desk:block">
            <ButtonLink href={`/admin/shoot/${week.week}/run`}>
              <Clapperboard aria-hidden className="h-4 w-4" />
              촬영 모드
            </ButtonLink>
          </div>
        }
      />

      <Segmented
        label="주차"
        role="navigation"
        value={String(week.week)}
        onChange={(v) => router.push(`/admin/shoot/${v}`)}
        options={weeks.map((w) => ({
          value: String(w),
          label: `${w}주차`,
          href: `/admin/shoot/${w}`,
        }))}
        size="md"
        settleKey={week.week}
      />

      <PendingClips clips={clips} isUploaded={(id) => !!infos[id]?.own} />

      {/* ── 진행 · 지금 · 다음 ── */}
      <section className="space-y-4 rounded-2xl border border-line bg-surface p-(--block-pad)">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-muted">
            <b className="text-numeric text-2xl text-ink">{count.done}</b> /{' '}
            {count.total} 찍음
            {count.redo > 0 && (
              <span className="ml-2 text-warn">다시 {count.redo}</span>
            )}
            {count.later > 0 && <span className="ml-2">미룸 {count.later}</span>}
          </p>
          <p className="text-xs tabular-nums text-muted">
            {Math.round(count.total ? (count.done / count.total) * 100 : 0)}%
          </p>
        </div>
        <StackBar
          done={count.done}
          redo={count.redo}
          later={count.later}
          total={count.total}
          className="h-2.5"
        />
        {current ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <NowCard
              tag="지금"
              it={current}
              fromWeek={carriedWeek.get(current.exerciseId)}
              onOpen={(e) => detail.show(current.exerciseId, e)}
              strong
            />
            {next && (
              <NowCard
                tag="다음"
                it={next}
                fromWeek={carriedWeek.get(next.exerciseId)}
                onOpen={(e) => detail.show(next.exerciseId, e)}
              />
            )}
          </div>
        ) : (
          <p className="rounded-xl bg-sky/8 px-4 py-3 text-sm font-semibold text-sky-strong">
            이 주 계획을 다 찍었어요
            {count.later ? ` · 미룬 것 ${count.later}개가 남아 있어요` : ''}.
          </p>
        )}
        <ButtonLink
          href={`/admin/shoot/${week.week}/run`}
          className="h-14 w-full text-base desk:hidden"
        >
          <Clapperboard aria-hidden className="h-5 w-5" />
          {count.done > 0 ? '이어 찍기' : '촬영 모드로 시작'}
        </ButtonLink>
      </section>

      {/* ── 챙길 기구 · 자리 순서 ── */}
      <section className="space-y-2 rounded-2xl border border-line bg-surface p-(--block-pad)">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <Wrench aria-hidden className="h-4 w-4 text-muted" />
          챙길 기구
        </h2>
        <p className="flex flex-wrap gap-1.5">
          {equipment.map((e) => (
            <span
              key={e}
              className="rounded-full bg-ink/6 px-2.5 py-1 text-xs font-medium text-ink"
            >
              {e}
            </span>
          ))}
        </p>
        <p className="text-xs leading-relaxed text-muted">
          자리 순서 · {week.stations.map((s) => s.station).join(' → ')}. 시범은 가볍게
          3회 · 버티기 10초 · 천천히 내리기는 1~2회 · 좌우는 한쪽만.
        </p>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger"
        >
          {error}{' '}
          <button type="button" onClick={clearError} className="ml-2 underline">
            닫기
          </button>
        </p>
      )}

      <Segmented
        label="보기"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: '전체' },
          { value: 'open', label: '남음' },
          { value: 'done', label: '찍음' },
        ]}
        size="md"
        className="max-w-sm"
      />

      {/* ── 자리별 시간표 ── */}
      <div className="stack-block">
        {week.stations.map((s) => {
          const list = s.items.filter(show);
          if (list.length === 0) return null;
          const c = countOf(s.items, map);
          return (
            <section
              key={s.station}
              className="overflow-hidden rounded-2xl border border-line bg-surface"
            >
              <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-3">
                <h3 className="text-sm font-bold text-ink">{s.station}</h3>
                <p className="flex items-center gap-3 text-xs tabular-nums text-muted">
                  <span>
                    {clockText(s.start)}–{clockText(s.end)}
                  </span>
                  <span>
                    <b className="font-semibold text-ink">{c.done}</b> / {c.total}
                  </span>
                </p>
              </header>
              <ol className="divide-y divide-line">
                {list.map((it, i) => (
                  <Row
                    key={it.exerciseId}
                    it={it}
                    index={i}
                    state={stateOf(it, map)}
                    check={map.get(it.exerciseId)}
                    uploaded={infos[it.exerciseId]?.source === 'OWN'}
                    mark={it === current ? '지금' : it === next ? '다음' : null}
                    onToggle={() => toggle(it)}
                    onOpen={(e) => detail.show(it.exerciseId, e)}
                  />
                ))}
              </ol>
            </section>
          );
        })}

        {carried.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface">
            <header className="border-b border-line px-4 py-3">
              <h3 className="text-sm font-bold text-ink">
                앞 주에서 넘어온 것 {carried.length}개
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                이 주 계획을 다 찍은 뒤 이어 찍어요. 번호는 원래 주차 번호예요.
              </p>
            </header>
            <ol className="divide-y divide-line">
              {carried
                .map((c) => c.item)
                .filter(show)
                .map((it, i) => (
                  <Row
                    key={it.exerciseId}
                    it={it}
                    index={i}
                    state={stateOf(it, map)}
                    check={map.get(it.exerciseId)}
                    uploaded={infos[it.exerciseId]?.source === 'OWN'}
                    mark={it === current ? '지금' : it === next ? '다음' : null}
                    carried
                    onToggle={() => toggle(it)}
                    onOpen={(e) => detail.show(it.exerciseId, e)}
                  />
                ))}
            </ol>
          </section>
        )}
      </div>

      <Modal
        open={detail.open}
        onClose={detail.close}
        title={open ? `${open.no} ${open.title}` : ''}
        description={
          open
            ? `${open.station} · ${BUCKET_LABEL[open.bucket]} · 계획 ${clockText(open.at)}`
            : undefined
        }
        origin={detail.origin}
      >
        {open && (
          <DetailBody
            key={open.exerciseId}
            it={open}
            info={infos[open.exerciseId]}
            check={map.get(open.exerciseId)}
            runHref={`/admin/shoot/${week.week}/run?at=${open.no}`}
            onSet={(status, note) =>
              set(open.exerciseId, status, {
                note,
                label: `${open.no} ${status ? STATE_LABEL[status] : '대기로 되돌림'}`,
              })
            }
            onPick={clips.edit}
          />
        )}
      </Modal>

      {clips.elements}

      <ShootUndoToast toast={toast} onUndo={undo} onClose={closeToast} />
    </>
  );
}

function NowCard({
  tag,
  it,
  fromWeek,
  onOpen,
  strong = false,
}: {
  tag: string;
  it: PlanItem;
  fromWeek?: number;
  onOpen: (e: MouseEvent<HTMLButtonElement>) => void;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex min-w-0 flex-col gap-1 rounded-xl px-4 py-3 text-left transition-colors ${
        strong ? 'bg-sky/10 hover:bg-sky/15' : 'bg-ink/4 hover:bg-ink/8'
      }`}
    >
      <span
        className={`text-xs font-semibold ${strong ? 'text-sky-strong' : 'text-muted'}`}
      >
        {tag} · {it.no}
        {fromWeek ? ` · ${fromWeek}주차에서` : ''} · 계획 {clockText(it.at)}
      </span>
      <span className="truncate text-base font-bold text-ink">{it.title}</span>
      <span className="truncate text-xs text-muted">
        {it.cue} · {it.equipment.join(' · ')}
      </span>
    </button>
  );
}

const STATE_ICON: Record<ItemState, typeof Check | null> = {
  done: Check,
  redo: RotateCcw,
  later: Clock3,
  todo: null,
};

function Row({
  it,
  index,
  state,
  check,
  uploaded,
  mark,
  carried = false,
  onToggle,
  onOpen,
}: {
  it: PlanItem;
  index: number;
  state: ItemState;
  check: ShootCheckView | undefined;
  uploaded: boolean;
  mark: '지금' | '다음' | null;
  /** 앞 주에서 넘어온 줄 — 그 주 시각 · 쉬기 대신 자리를 보인다 */
  carried?: boolean;
  onToggle: () => void;
  onOpen: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const Icon = STATE_ICON[state];
  return (
    <li
      id={it.no}
      style={{ '--row': index } as React.CSSProperties}
      className={`motion-safe:animate-row-in scroll-mt-24 ${mark === '지금' ? 'bg-sky/6' : ''}`}
    >
      <div className="flex items-center gap-2 px-2 desk:px-3">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={state === 'done'}
          aria-label={
            state === 'done' ? `${it.no} 대기로 되돌리기` : `${it.no} 찍음으로 표시`
          }
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
        >
          <span
            className={`grid h-7 w-7 place-items-center rounded-full transition-[background-color,box-shadow,transform] duration-200 motion-safe:active:scale-90 ${STATE_PILL[state]}`}
          >
            {Icon && <Icon aria-hidden className="h-4 w-4" strokeWidth={2.6} />}
          </span>
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left"
        >
          <span className="hidden w-10 shrink-0 text-xs tabular-nums text-muted desk:block">
            {carried ? '' : clockText(it.at)}
          </span>
          <span className="text-numeric w-9 shrink-0 text-xs text-muted">{it.no}</span>
          <span className="min-w-0 flex-1">
            <span
              className={`flex flex-wrap items-center gap-x-1.5 text-sm font-semibold break-keep ${
                state === 'done'
                  ? 'text-muted line-through decoration-ink/25'
                  : 'text-ink'
              }`}
            >
              {it.title}
              {it.load >= 2 && (
                <b className="rounded bg-warn/15 px-1 text-[10px] font-bold text-warn no-underline">
                  높음
                </b>
              )}
              {uploaded && (
                <b className="rounded bg-sky/12 px-1 text-[10px] font-bold text-sky-strong">
                  올림
                </b>
              )}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted">
              {it.cue}
              <span className="hidden desk:inline"> · {it.equipment.join(' · ')}</span>
              {check?.note && <span className="text-warn"> · {check.note}</span>}
            </span>
          </span>
          <span className="hidden w-24 shrink-0 truncate text-xs text-muted desk:block">
            {carried ? it.station : BUCKET_LABEL[it.bucket]}
          </span>
          <span className="hidden w-28 shrink-0 text-right text-[11px] text-muted lg:block">
            {check ? `${check.by ?? ''} ${stampText(check.at)}` : ''}
          </span>
          {mark ? (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                mark === '지금' ? 'bg-sky text-white' : 'bg-sky/12 text-sky-strong'
              }`}
            >
              {mark}
            </span>
          ) : (
            state !== 'todo' &&
            state !== 'done' && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE_PILL[state]}`}
              >
                {STATE_LABEL[state]}
              </span>
            )
          )}
        </button>
      </div>
      {it.breakAfter && !carried && (
        <p className="flex items-center gap-2 border-t border-line bg-sky/6 px-4 py-2 text-xs font-semibold text-sky-strong">
          <Coffee aria-hidden className="h-3.5 w-3.5" />
          쉬기 5분 · 모델은 물 마시고 다음 운동 영상 보기
        </p>
      )}
    </li>
  );
}

function DetailBody({
  it,
  info,
  check,
  runHref,
  onSet,
  onPick,
}: {
  it: PlanItem;
  info: ShootWeekData['infos'][string] | undefined;
  check: ShootCheckView | undefined;
  runHref: string;
  onSet: (status: ShootStatus | null, note?: string | null) => Promise<boolean>;
  /** 영상을 고르면 컷 편집 창으로(useClipFlow().edit) */
  onPick: (target: ClipTarget, file: File, from: 'camera' | 'album') => void;
}) {
  const state: ItemState = check?.status ?? 'todo';
  const [note, setNote] = useState(check?.note ?? '');
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-5">
      <Segmented
        label="상태"
        value={state}
        onChange={(v) => {
          haptic(v === 'done' ? 'success' : 'light');
          void onSet(v === 'todo' ? null : v);
        }}
        options={(['todo', 'done', 'redo', 'later'] as const).map((v) => ({
          value: v,
          label: STATE_LABEL[v],
        }))}
        size="md"
      />
      {check && (
        <p className="-mt-3 text-xs text-muted">
          {check.by ?? '누군가'} · {stampText(check.at)}
        </p>
      )}
      <ClipPickButtons
        target={{ exerciseId: it.exerciseId, no: it.no, title: it.title, cue: it.cue }}
        uploaded={!!info?.own}
        onPick={onPick}
      />
      <ShootExerciseDetail item={it} info={info} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await onSet(state === 'todo' ? 'redo' : state, note);
          if (ok) setSaved(true);
        }}
        className="space-y-2"
      >
        <label
          htmlFor={`note-${it.exerciseId}`}
          className="block text-xs font-medium text-muted"
        >
          메모{state === 'todo' ? ' — 저장하면 다시 찍기로 표시돼요' : ''}
        </label>
        <div className="flex gap-2">
          <input
            id={`note-${it.exerciseId}`}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setSaved(false);
            }}
            maxLength={200}
            placeholder="초점 나감 · 무게 바꿔서 다시"
            className="min-w-0 flex-1 rounded-xl border border-transparent bg-ink/5 px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-sky focus:bg-surface focus:outline-none desk:border-line desk:bg-surface-2"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-ink/8 px-4 text-sm font-semibold text-ink hover:bg-ink/12"
          >
            {saved ? '저장됨' : '저장'}
          </button>
        </div>
      </form>
      <ButtonLink href={runHref} variant="secondary" className="w-full">
        <Clapperboard aria-hidden className="h-4 w-4" />
        촬영 모드에서 이 운동부터
      </ButtonLink>
    </div>
  );
}
