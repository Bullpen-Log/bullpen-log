'use client';

import { useState, useTransition } from 'react';
import { Check, ChevronRight, Info } from 'lucide-react';
import { LibraryVideo } from '@/components/library-video';
import { useWakeLock } from '@/components/use-wake-lock';
import { finishWarmup } from '@/app/actions/workout';

export type WarmupItem = {
  id: string;
  title: string;
  /** '10회 × 2세트' 같은 한 줄. 루틴에 적어 둔 안내가 있으면 그것이 온다. */
  note: string | null;
  description: string;
  videoPath: string | null;
  referenceVideoId: string | null;
  aspectRatio: number | null;
  thumbUrl: string | null;
};

export type WarmupCard = {
  id: string;
  name: string;
  description: string;
  /** 오늘 목적에 맞춰 붙은 루틴인가. 아니면 전신 루틴이다. */
  forToday: boolean;
  items: WarmupItem[];
};

/**
 * 본운동 앞에 한 번 지나는 화면.
 *
 * 체크는 서버로 그때그때 보내지 않는다. 워밍업은 부하 계산에 안 들어가므로
 * (스키마의 warmupDoneIds 주석 참고) 한 번에 보내도 잃을 것이 없고, 누를
 * 때마다 화면이 다시 그려지면 스크롤 자리를 잃는다.
 *
 * 건너뛰기를 눈에 띄게 둔다. 시간이 없거나 이미 몸을 푼 날에 빠져나갈 길이
 * 없으면, 다음부터는 아예 [운동 시작]을 안 누르게 된다.
 */
export function WarmupClient({
  themeLabel,
  cards,
}: {
  themeLabel: string;
  cards: WarmupCard[];
}) {
  /* 바닥에서 몸을 푸는 동안에도 화면이 꺼지면 안 된다 — 본운동과 같은 이유 */
  useWakeLock();

  const [done, setDone] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const total = cards.reduce((n, c) => n + c.items.length, 0);

  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const go = (skipped: boolean) => {
    setError(null);
    startSaving(async () => {
      const res = await finishWarmup({ skipped, doneIds: [...done] });
      /* 성공하면 서버가 본운동으로 보낸다 — 여기로 돌아오면 실패한 것이다 */
      if (res && 'error' in res) setError(res.error);
    });
  };

  return (
    <>
      {/* ─────────── 위: 보는 곳 ─────────── */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-5">
        <p className="text-xs text-muted">{themeLabel}</p>
        <h1 className="mt-1 text-xl font-bold text-ink">워밍업</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          본운동 전에 몸을 풉니다. 운동 시간은 여기를 지난 뒤부터 셉니다.
          {total > 0 && (
            <>
              {' '}
              <span className="tabular-nums text-sky-strong">
                {done.size}/{total}
              </span>
            </>
          )}
        </p>

        {total === 0 && (
          <p className="mt-5 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-xs leading-relaxed text-muted">
            아직 루틴에 담긴 운동이 없습니다.
            <br />
            영상이 올라오면 여기에 나옵니다.
          </p>
        )}

        <div className="mt-4 space-y-4">
          {cards.map((card) => (
            <section key={card.id}>
              <div className="flex flex-wrap items-baseline gap-x-2 px-1">
                <h2 className="text-heading text-[15px] text-ink">{card.name}</h2>
                {card.forToday ? (
                  <span className="rounded-md bg-sky/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-strong">
                    오늘 맞춤
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-muted">전신</span>
                )}
              </div>
              {card.description && (
                <p className="mt-0.5 px-1 text-xs text-muted">{card.description}</p>
              )}

              <ul className="mt-2 space-y-2">
                {card.items.map((ex) => {
                  const checked = done.has(ex.id);
                  const showing = open === ex.id;
                  return (
                    <li
                      key={ex.id}
                      className={`overflow-hidden rounded-2xl border transition-colors ${
                        checked ? 'border-sky bg-sky-tint' : 'border-line bg-surface'
                      }`}
                    >
                      {/* 줄 전체가 체크 단추다 — 엄지 하나로 누르게 */}
                      <button
                        type="button"
                        onClick={() => toggle(ex.id)}
                        aria-pressed={checked}
                        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
                      >
                        <span
                          aria-hidden
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            checked
                              ? 'border-sky bg-sky text-white'
                              : 'border-line-strong'
                          }`}
                        >
                          {checked && <Check className="h-4 w-4" strokeWidth={3} />}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span
                            className={`block text-[15px] font-bold break-keep ${
                              checked ? 'text-sky-strong' : 'text-ink'
                            }`}
                          >
                            {ex.title}
                          </span>
                          {ex.note && (
                            <span
                              className={`block text-xs ${
                                checked ? 'text-sky-strong' : 'text-muted'
                              }`}
                            >
                              {ex.note}
                            </span>
                          )}
                        </span>

                        {ex.thumbUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={ex.thumbUrl}
                            alt=""
                            className="h-12 w-[4.5rem] shrink-0 rounded-lg object-cover ring-1 ring-line"
                          />
                        )}
                      </button>

                      {/*
                        자세 보기.

                        처음 하는 동작이면 이름만 봐서는 무엇을 하라는 것인지
                        알 수 없다. 한 번에 하나만 펼친다 — 워밍업은 훑고
                        지나가는 자리라, 다 펼쳐 두면 목록이 사라진다.
                      */}
                      {(ex.description || ex.videoPath || ex.referenceVideoId) && (
                        <div className="border-t border-line/70">
                          <button
                            type="button"
                            onClick={() => setOpen(showing ? null : ex.id)}
                            aria-expanded={showing}
                            className="flex w-full items-center justify-center gap-1.5 py-2 text-[11px] font-semibold text-muted transition-colors active:text-sky"
                          >
                            <Info className="h-3.5 w-3.5" />
                            {showing ? '접기' : '자세·영상 보기'}
                          </button>

                          {showing && (
                            <div className="space-y-3 px-3.5 pb-3.5">
                              {(ex.videoPath || ex.referenceVideoId) && (
                                <LibraryVideo
                                  path={ex.videoPath}
                                  referenceVideoId={ex.referenceVideoId}
                                  title={ex.title}
                                  thumbUrl={ex.thumbUrl}
                                  aspectRatio={ex.aspectRatio}
                                />
                              )}
                              {ex.description && (
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
                                  {ex.description}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>

      {/* ─────────── 아래: 누르는 곳 ─────────── */}
      <div className="shrink-0 space-y-2 border-t-2 border-sky bg-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {error && (
          <p className="rounded-lg bg-warn-bg px-3 py-2 text-center text-xs text-warn">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => go(false)}
          disabled={saving}
          className="flex h-[72px] w-full items-center justify-center gap-1.5 rounded-2xl bg-sky text-base font-bold text-white transition-transform disabled:opacity-60 motion-safe:active:scale-[0.98]"
        >
          {saving ? '여는 중' : '본운동 시작'}
          {!saving && <ChevronRight className="h-5 w-5" />}
        </button>

        {/*
          건너뛰기는 숨기지 않는다.

          이미 몸을 풀고 온 날이나 시간이 없는 날에 빠져나갈 길이 없으면,
          다음부터는 [운동 시작] 자체를 안 누르게 된다. 다만 본운동 단추보다는
          작게 둔다 — 권하는 쪽이 어느 쪽인지는 보여야 한다.
        */}
        <button
          type="button"
          onClick={() => go(true)}
          disabled={saving}
          className="w-full rounded-xl py-2.5 text-xs font-semibold text-muted transition-colors disabled:opacity-40 active:text-ink"
        >
          워밍업 건너뛰기
        </button>
      </div>
    </>
  );
}
