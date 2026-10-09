'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Camera,
  Check,
  CircleCheck,
  Coffee,
  Images,
  ListOrdered,
  MapPin,
  PauseCircle,
  X,
} from 'lucide-react';
import { Modal, useModalState } from '@/components/modal';
import { ShootExerciseDetail } from '@/components/shoot/exercise-detail';
import { STATE_LABEL, STATE_PILL } from '@/components/shoot/status';
import { ShootUndoToast } from '@/components/shoot/undo-toast';
import { PendingClips } from '@/components/shoot/pending-clips';
import { useClipFlow } from '@/components/shoot/use-clip-flow';
import { useShootChecks } from '@/components/shoot/use-shoot-checks';
import { useWakeLock } from '@/components/use-wake-lock';
import { haptic } from '@/lib/haptics';
import type { ShootWeekData } from '@/lib/shoot/load';
import {
  BUCKET_LABEL,
  clockText,
  countOf,
  cursorOfList,
  paceMinutes,
  stateOf,
  weekItems,
} from '@/lib/shoot/progress';
import { toDateKey } from '@/lib/pitch-stats';

/**
 * 촬영 모드 — 찍는 동안 휴대폰 한 손으로.
 *
 *   위    닫기 · N주차 · 23/66 막대 · 계획 대비(늦음 · 빠름) · 목록
 *   가운데 지금 운동 — 번호(누르면 카메라에 비출 큰 번호판) · 자리 · 시범 방법(크게) · 기구 · 참고 영상 · 진행 방법
 *         그 뒤에 무엇이 오나(자리 옮김 · 쉬기), 다음 운동 카드, 그다음 셋
 *   아래  [영상 찍기] — 앱 카메라(아이폰 기본 카메라 화면, 1080p) → 컷 편집(소리 빼기) → 올려 이 운동의 영상으로 붙이고 '찍음' · 다음.
 *         [찍음](영상 없이 체크만 — 다른 카메라로 찍을 때) · [미루기]. 바꿀 때마다 '되돌리기' 알림.
 *         앱 카메라가 없으면(웹 · 옛 앱) 찍기 단추 없이 [찍음 · 다음으로]와 까닭 한 줄 — 웹 카메라는 쓰지 않는다.
 *         다른 폰 · 카메라 앱으로 찍었으면 운동 카드 밑 '앨범에서 고르기'. 올리지 못한 영상은 위에 '다시 올리기'.
 *
 * 줄은 그 주 운동 뒤에 앞 주에서 못 찍은 것을 이어 붙인다. 두 사람이 폰 두 대로 찍으면 15초 안에 서로 맞춰진다.
 * 화면은 켜 둔다(찍는 동안 꺼지면 안 된다).
 */
export function RunClient({
  data,
  me,
  startAt,
}: {
  data: ShootWeekData;
  me: string;
  startAt: string | null;
}) {
  const { week, carried, infos } = data;
  const { map, set, adopt, toast, undo, closeToast, error, clearError } = useShootChecks(
    data.checks,
    { me }
  );
  const items = useMemo(() => weekItems(week), [week]);
  const queue = useMemo(
    () => [...items, ...carried.map((c) => c.item)],
    [items, carried]
  );
  const fromWeek = useMemo(
    () => new Map(carried.map((c) => [c.item.exerciseId, c.week])),
    [carried]
  );
  const [pickId, setPickId] = useState<string | null>(
    () => queue.find((it) => it.no === startAt)?.exerciseId ?? null
  );
  const [slate, setSlate] = useState(false);
  const list = useModalState<'list'>();
  useWakeLock(true);

  const { current, next } = cursorOfList(queue, map, pickId);
  const count = countOf(items, map);
  /* 다음 뒤로 셋 — '그다음' 줄 */
  const after = current
    ? queue
        .filter((it) => {
          const st = stateOf(it, map);
          return it !== current && (st === 'todo' || st === 'redo');
        })
        .slice(1, 4)
    : [];

  /* 계획 대비 — 30초마다 다시 셈한다 */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const pace =
    current && !fromWeek.has(current.exerciseId)
      ? paceMinutes(week, map, current, new Date(now), toDateKey)
      : null;

  const move =
    current && next && next.station !== current.station ? next.station : null;
  /* 앞 주에서 넘어온 운동은 그 주 시각 · 쉬는 때가 맞지 않는다 */
  const carriedNow = current ? fromWeek.has(current.exerciseId) : false;
  const rest = current ? current.breakAfter && !carriedNow : false;

  /* 운동이 바뀌면 본문을 맨 위로 — 아래 단추로 넘겨도 번호 · 이름부터 보이게 */
  const bodyRef = useRef<HTMLDivElement>(null);
  const currentId = current?.exerciseId ?? null;
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || el.scrollTop === 0) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, [currentId]);

  /* 목록을 열면 지금 운동이 가운데 오게 — 찍은 것이 위에 쌓여 있어도 바로 보인다 */
  const listOpen = list.open;
  useEffect(() => {
    if (!listOpen) return;
    const id = window.requestAnimationFrame(() =>
      document
        .querySelector('[data-shoot-current]')
        ?.scrollIntoView({ block: 'center' })
    );
    return () => window.cancelAnimationFrame(id);
  }, [listOpen]);

  const errorBox = error && (
    <p
      role="alert"
      className="motion-safe:animate-fade-in rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger"
    >
      {error}{' '}
      <button type="button" onClick={clearError} className="ml-1 underline">
        닫기
      </button>
    </p>
  );

  // 붙인 운동이 목록에서 고른 운동이었을 때만 고른 것을 푼다(다시 올리기로 다른 운동이 붙어도 지금 운동은 그대로)
  const clips = useClipFlow({
    adopt,
    onAttached: (id) => setPickId((p) => (p === id ? null : p)),
  });
  const clipTarget = current
    ? {
        exerciseId: current.exerciseId,
        no: current.no,
        title: current.title,
        cue: current.cue,
      }
    : null;

  function shoot() {
    if (!current) return;
    haptic('success');
    setPickId(null);
    void set(current.exerciseId, 'done', { label: `${current.no} 찍음` });
  }
  function postpone() {
    if (!current) return;
    haptic('light');
    setPickId(null);
    void set(current.exerciseId, 'later', {
      label: `${current.no} 미룸 — 목록 끝 '미룬 것'에서 다시`,
    });
  }

  const laters = queue.filter((it) => stateOf(it, map) === 'later');
  const progress = count.total ? count.done / count.total : 0;

  return (
    <>
      {/* ── 위 ── */}
      <header className="shrink-0 border-b border-line bg-surface px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/shoot/${week.week}`}
            aria-label="촬영 모드 닫기"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink hover:bg-ink/6"
          >
            <X aria-hidden className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
              {week.week}주차 촬영
              <span className="text-xs font-medium tabular-nums text-muted">
                {count.done} / {count.total}
              </span>
              {pace !== null && <PaceChip minutes={pace} />}
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/8">
              <div
                className="h-full rounded-full bg-sky transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => list.show('list', e)}
            aria-label="전체 목록"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink hover:bg-ink/6"
          >
            <ListOrdered aria-hidden className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* ── 가운데 ── */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-4">
          {!current && errorBox}

          <PendingClips clips={clips} isUploaded={(id) => !!infos[id]?.uploaded} />

          {current ? (
            <article
              key={current.exerciseId}
              className="motion-safe:animate-step-next space-y-4"
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSlate(true)}
                  className="text-numeric rounded-xl bg-ink px-3 py-1.5 text-xl text-page motion-safe:active:scale-95"
                  aria-label={`번호판 크게 보기 ${current.no}`}
                >
                  {current.no}
                </button>
                <span className="inline-flex items-center gap-1 rounded-full bg-ink/6 px-2.5 py-1 text-xs font-medium text-ink">
                  <MapPin aria-hidden className="h-3.5 w-3.5 text-muted" />
                  {current.station}
                </span>
                {infos[current.exerciseId]?.uploaded && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky/12 px-2.5 py-1 text-xs font-bold text-sky-strong">
                    <CircleCheck aria-hidden className="h-3.5 w-3.5" />
                    올림
                  </span>
                )}
                {!carriedNow && (
                  <span className="ml-auto text-xs tabular-nums text-muted">
                    계획 {clockText(current.at)}
                  </span>
                )}
              </div>
              {fromWeek.has(current.exerciseId) && (
                <p className="text-xs font-semibold text-muted">
                  {fromWeek.get(current.exerciseId)}주차에서 넘어온 운동
                </p>
              )}
              {stateOf(current, map) === 'redo' && (
                <p className="rounded-xl bg-warn/12 px-3 py-2 text-sm font-semibold text-warn">
                  다시 찍기
                  {map.get(current.exerciseId)?.note
                    ? ` · ${map.get(current.exerciseId)?.note}`
                    : ''}
                </p>
              )}
              <h1 className="text-heading text-[1.75rem] leading-tight text-ink break-keep">
                {current.title}
              </h1>
              <div className="rounded-2xl bg-sky/10 px-4 py-3">
                <p className="text-xs font-semibold text-sky-strong">시범</p>
                <p className="mt-0.5 text-xl font-bold break-keep text-ink">
                  {current.cue}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {BUCKET_LABEL[current.bucket]}
                  {current.group ? ` · ${current.group}` : ''}
                  {current.kind === 'drill'
                    ? ' · 자세가 보이게, 세게 말고'
                    : current.load >= 2
                      ? ' · 부하 높음 — 무게는 평소의 절반쯤'
                      : ' · 가볍게, 자세가 보이게'}
                </p>
              </div>
              <ShootExerciseDetail
                item={current}
                info={infos[current.exerciseId]}
                compact
              />
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                다른 폰 · 카메라 앱으로 찍었으면
                <button
                  type="button"
                  onClick={() => clipTarget && clips.startAlbum(clipTarget)}
                  className="inline-flex min-h-10 items-center gap-1 rounded-full px-1 font-semibold text-sky-strong"
                >
                  <Images aria-hidden className="h-4 w-4" />
                  앨범에서 고르기
                </button>
              </p>

              {(rest || move) && (
                <p className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-ink">
                  {rest ? (
                    <>
                      <Coffee
                        aria-hidden
                        className="h-4 w-4 shrink-0 text-sky-strong"
                      />
                      이 운동 뒤 5분 쉬기
                      {move ? ` · 그다음 ${move}로 옮겨요` : ''}
                    </>
                  ) : (
                    <>
                      <ArrowRight
                        aria-hidden
                        className="h-4 w-4 shrink-0 text-sky-strong"
                      />
                      다음은 자리 옮김 · {current.station} → {move}
                    </>
                  )}
                </p>
              )}

              {next && (
                <section className="space-y-2">
                  <h2 className="text-xs font-semibold text-muted">다음</h2>
                  <button
                    type="button"
                    onClick={() => setPickId(next.exerciseId)}
                    className="flex w-full flex-col gap-1 rounded-2xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-sky-soft"
                  >
                    <span className="flex items-center gap-2 text-xs text-muted">
                      <span className="text-numeric text-ink">{next.no}</span>
                      {next.station !== current.station && (
                        <span>· {next.station}</span>
                      )}
                      {fromWeek.has(next.exerciseId) && (
                        <span>· {fromWeek.get(next.exerciseId)}주차에서</span>
                      )}
                    </span>
                    <span className="text-base font-bold break-keep text-ink">
                      {next.title}
                    </span>
                    <span className="text-xs text-muted">
                      {next.cue} · {next.equipment.join(' · ')}
                    </span>
                  </button>
                  {after.length > 0 && (
                    <ol className="space-y-1 px-1">
                      {after.map((it) => (
                        <li
                          key={it.exerciseId}
                          className="flex gap-2 truncate text-xs text-muted"
                        >
                          <span className="text-numeric w-9 shrink-0">{it.no}</span>
                          <span className="truncate">{it.title}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              )}
            </article>
          ) : (
            <section className="rise-in space-y-4 py-6 text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sky text-white">
                <Check aria-hidden className="h-8 w-8" strokeWidth={2.6} />
              </span>
              <h1 className="text-heading text-2xl text-ink">
                이 주 계획을 다 찍었어요
              </h1>
              <p className="text-sm text-muted">
                {count.done}개 찍음
                {laters.length ? ` · 미룬 것 ${laters.length}개` : ''}
              </p>
              {laters.length > 0 && (
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface text-left">
                  {laters.map((it) => (
                    <li
                      key={it.exerciseId}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <span className="text-numeric w-9 shrink-0 text-xs text-muted">
                        {it.no}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        {it.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPickId(it.exerciseId)}
                        className="min-h-10 shrink-0 rounded-full bg-sky/12 px-3 text-xs font-semibold text-sky-strong"
                      >
                        지금 찍기
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/admin/shoot"
                className="inline-flex min-h-11 items-center gap-1 rounded-full px-4 text-sm font-semibold text-sky-strong hover:bg-sky/10"
              >
                촬영 관리로
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            </section>
          )}
        </div>
      </div>

      {/* ── 아래 ── */}
      {current && (
        <div className="shrink-0 border-t border-line bg-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {errorBox && <div className="mx-auto mb-2 w-full max-w-2xl">{errorBox}</div>}
          {(clips.cameraNotice || clips.cameraMissingText) && (
            <p
              role={clips.cameraNotice ? 'alert' : undefined}
              className="motion-safe:animate-fade-in mx-auto mb-2 flex w-full max-w-2xl items-start gap-2 text-xs break-keep text-muted"
            >
              <Camera aria-hidden className="mt-px h-4 w-4 shrink-0" />
              <span className={clips.cameraNotice ? 'font-semibold text-warn' : ''}>
                {clips.cameraNotice ?? clips.cameraMissingText}
              </span>
            </p>
          )}
          <div className="mx-auto flex w-full max-w-2xl items-center gap-2">
            <button
              type="button"
              onClick={postpone}
              className="flex h-[72px] w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-3xl bg-ink/6 text-xs font-semibold text-ink motion-safe:active:scale-95"
            >
              <PauseCircle aria-hidden className="h-5 w-5" />
              미루기
            </button>
            {clips.appCamera ? (
              <>
                <button
                  type="button"
                  onClick={shoot}
                  aria-label="영상 없이 찍음으로 체크하고 다음으로"
                  className="flex h-[72px] w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-3xl bg-ink/6 text-xs font-semibold text-ink motion-safe:active:scale-95"
                >
                  <Check aria-hidden className="h-5 w-5" strokeWidth={2.6} />
                  찍음
                </button>
                <button
                  type="button"
                  onClick={() => clipTarget && void clips.startCamera(clipTarget)}
                  className="flex h-[72px] min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-sky text-lg font-bold text-white motion-safe:active:scale-[0.98]"
                >
                  <Camera aria-hidden className="h-6 w-6" strokeWidth={2.4} />
                  {infos[current.exerciseId]?.uploaded ? '다시 찍기' : '영상 찍기'}
                </button>
              </>
            ) : (
              /* 앱 카메라가 없으면(웹 · 옛 앱) 찍기 단추 대신 체크만 — 웹 카메라는 쓰지 않는다 */
              <button
                type="button"
                onClick={shoot}
                className="flex h-[72px] min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-sky text-lg font-bold text-white motion-safe:active:scale-[0.98]"
              >
                <Check aria-hidden className="h-6 w-6" strokeWidth={2.8} />
                찍음 · 다음으로
              </button>
            )}
          </div>
        </div>
      )}

      {clips.elements}

      <ShootUndoToast
        toast={toast}
        onUndo={undo}
        onClose={closeToast}
        className="bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+6rem)]"
      />

      {/* ── 번호판 — 카메라에 비춰 파일 이름 대신 ── */}
      {slate && current && (
        <button
          type="button"
          onClick={() => setSlate(false)}
          className="motion-safe:animate-fade-in fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-page px-6 text-center"
        >
          <span className="text-numeric text-[28vw] leading-none text-ink desk:text-[12rem]">
            {current.no}
          </span>
          <span className="text-2xl font-bold break-keep text-ink">
            {current.title}
          </span>
          <span className="text-sm text-muted">카메라에 1초 비추고 눌러서 닫기</span>
        </button>
      )}

      {/* ── 전체 목록 ── */}
      <Modal
        open={list.open}
        onClose={list.close}
        title={`${week.week}주차 목록`}
        description="누르면 그 운동을 먼저 찍어요"
        origin={list.origin}
      >
        <ol className="-mx-2 divide-y divide-line">
          {queue.map((it) => {
            const st = stateOf(it, map);
            return (
              <li
                key={it.exerciseId}
                data-shoot-current={it === current ? '' : undefined}
              >
                <button
                  type="button"
                  onClick={() => {
                    setPickId(it.exerciseId);
                    list.close();
                  }}
                  disabled={st === 'done'}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-ink/4 disabled:opacity-60 ${
                    it === current ? 'bg-sky/8' : ''
                  }`}
                >
                  <span className="text-numeric w-9 shrink-0 text-xs text-muted">
                    {it.no}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm ${st === 'done' ? 'text-muted line-through' : 'font-semibold text-ink'}`}
                    >
                      {it.title}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {it.station}
                    </span>
                  </span>
                  {it === current ? (
                    <span className="shrink-0 rounded-full bg-sky px-2 py-0.5 text-[11px] font-bold text-white">
                      지금
                    </span>
                  ) : (
                    st !== 'todo' && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE_PILL[st]}`}
                      >
                        {STATE_LABEL[st]}
                      </span>
                    )
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </Modal>
    </>
  );
}

function PaceChip({ minutes }: { minutes: number }) {
  const late = minutes > 2;
  const early = minutes < -2;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
        late ? 'bg-warn/15 text-warn' : 'bg-sky/12 text-sky-strong'
      }`}
    >
      {late ? `계획보다 ${minutes}분 늦음` : early ? `${-minutes}분 빠름` : '계획대로'}
    </span>
  );
}
