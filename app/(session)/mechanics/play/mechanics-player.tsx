'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { ChevronDown, Info, X } from 'lucide-react';
import { LibraryVideo } from '@/components/library-video';
import { ErrorLine } from '@/components/error-line';
import { useWakeLock } from '@/components/use-wake-lock';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { DRILL_STAGES } from '@/lib/exercise-meta';
import { mechanicsElement } from '@/lib/mechanics/elements';
import { FEELS, type DrillFeel, type DrillStage } from '@/lib/mechanics/program';
import type { SessionDrillView } from '@/lib/mechanics/load';
import { finishMechanicsSession, recordMechanicsDrill } from '@/app/actions/mechanics';
import { guideDescription } from '@/app/actions/content';
import { josa } from '@/lib/korean';

/**
 * 메커니즘 세션 따라 하기 — 한 드릴씩(2026-10-04, page.tsx).
 *
 * 드릴에는 시계가 없다(횟수 · 공 수로 한다). 그래서 암케어처럼 쉬는 시계 대신, 마치면 느낌 하나를 누르는 것이 '다음'이다.
 * 느낌은 그 요소의 진행에 들어간다 — '쉬움'이 세 번이면 다음 단계(lib/mechanics/program.ts). 화면이 꺼지지 않게 잡아 둔다.
 */
export function MechanicsPlayer({
  backHref,
  items,
  startAt,
  sessionNumber,
  isAdmin,
}: {
  backHref: string;
  items: SessionDrillView[];
  startAt: number;
  sessionNumber: number;
  isAdmin: boolean;
}) {
  const [index, setIndex] = useState(startAt);
  const [done, setDone] = useState<boolean[]>(() => items.map((_, i) => i < startAt));
  const [leveled, setLeveled] = useState<{ element: string; stage: DrillStage }[]>([]);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  useWakeLock(!finished);

  const item = items[index];

  const record = (feel: DrillFeel) =>
    startTransition(async () => {
      setError(null);
      const res = await orOffline(
        recordMechanicsDrill({ guideId: item.guideId, element: item.element, feel }),
        { error: OFFLINE_MESSAGE }
      );
      if ('error' in res) {
        setError(res.error);
        return;
      }
      const up = res.leveled;
      if (up) setLeveled((l) => [...l, { element: item.element, stage: up }]);
      setDone((d) => d.map((v, i) => (i === index ? true : v)));
      if (index + 1 < items.length) {
        setIndex(index + 1);
        scroller.current?.scrollTo({ top: 0 });
      } else {
        await orOffline(finishMechanicsSession(), { error: OFFLINE_MESSAGE });
        setFinished(true);
      }
    });

  const skip = () => {
    if (index + 1 < items.length) {
      setIndex(index + 1);
      scroller.current?.scrollTo({ top: 0 });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line bg-surface px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <Link
            href={backHref}
            aria-label="따라 하기 닫기"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-5 w-5" />
          </Link>
          <p className="min-w-0 flex-1 truncate text-base font-bold text-ink">
            메커니즘 {sessionNumber}번째 세션
          </p>
          <span className="shrink-0 text-sm font-semibold text-muted tabular-nums">
            {finished ? items.length : index + 1} / {items.length}
          </span>
        </div>
        <div className="mx-auto mt-2.5 flex max-w-xl gap-1" aria-hidden>
          {items.map((it, i) => (
            <span
              key={it.guideId}
              className={`h-1.5 flex-1 rounded-full ${
                done[i] ? 'bg-sky' : i === index && !finished ? 'bg-sky/40' : 'bg-surface-2'
              }`}
            />
          ))}
        </div>
      </header>

      {finished ? (
        <FinishView leveled={leveled} backHref={backHref} count={items.length} />
      ) : (
        <>
          <div ref={scroller} className="flex-1 overflow-y-auto">
            <DrillView key={item.guideId} item={item} isAdmin={isAdmin} />
          </div>

          <div className="border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto max-w-xl space-y-2.5">
              <p className="text-center text-sm font-semibold text-ink">마쳤으면, 어땠어요?</p>
              <div className="grid grid-cols-3 gap-2">
                {FEELS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    disabled={pending}
                    onClick={() => record(f.value)}
                    className={`flex min-h-14 flex-col items-center justify-center rounded-2xl px-1 transition-colors disabled:opacity-60 ${
                      f.value === 'easy'
                        ? 'bg-sky text-white hover:bg-sky-strong'
                        : 'bg-surface-2 text-ink hover:bg-sky-tint'
                    }`}
                  >
                    <span className="text-base font-bold">{f.label}</span>
                    <span
                      className={`text-xs leading-tight break-keep ${
                        f.value === 'easy' ? 'text-white/85' : 'text-muted'
                      }`}
                    >
                      {f.hint}
                    </span>
                  </button>
                ))}
              </div>
              {error && <ErrorLine>{error}</ErrorLine>}
              {index + 1 < items.length && (
                <button
                  type="button"
                  onClick={skip}
                  disabled={pending}
                  className="mx-auto flex min-h-11 items-center px-3 text-xs font-semibold text-muted hover:text-ink"
                >
                  이번 드릴은 건너뛰기
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** 드릴 하나 — 요소 · 단계, 이름, 몇 번, 느낌 신호, 영상, 설명(펼치면 받음) */
function DrillView({ item, isAdmin }: { item: SessionDrillView; isAdmin: boolean }) {
  const element = mechanicsElement(item.element);
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-5">
      <div className="space-y-1.5">
        <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <span className="rounded-full bg-sky-tint px-2.5 py-0.5 text-sky-strong">{item.element}</span>
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-ink">{item.stage}</span>
          <span className="text-muted">{item.tool}</span>
        </p>
        <h1 className="text-xl font-bold break-keep text-ink">{item.title}</h1>
        <p className="text-base font-semibold text-sky-strong">{item.dose}</p>
      </div>

      {item.cue && (
        <p className="rounded-2xl bg-sky-tint/60 px-4 py-3 text-sm font-semibold break-keep text-sky-strong">
          “{item.cue}”
        </p>
      )}

      {(item.variant.videoPath || item.variant.referenceVideoId) && (
        <LibraryVideo
          path={item.variant.videoPath}
          referenceVideoId={item.variant.referenceVideoId}
          title={item.title}
          thumbUrl={item.variant.thumbUrl}
          aspectRatio={item.variant.aspectRatio}
          isAdmin={isAdmin}
        />
      )}

      <Description guideId={item.guideId} />

      {element && (
        <p className="text-xs leading-relaxed break-keep text-muted">
          {item.element} · {element.line}
        </p>
      )}
    </div>
  );
}

/** 자세 설명 — 펼칠 때 받는다(app/actions/content.ts guideDescription). 끊겨도 화면 오류로 번지지 않게 */
function Description({ guideId }: { guideId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();

  const load = () =>
    startLoading(async () => {
      try {
        const t = await guideDescription(guideId);
        setText(t);
        setFailed(t == null);
      } catch (err) {
        unstable_rethrow(err);
        setFailed(true);
      }
    });

  return (
    <div className="rounded-2xl bg-surface">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && text == null) load();
        }}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm font-semibold text-ink"
      >
        <Info aria-hidden className="h-4 w-4 text-muted" />
        <span className="flex-1">자세 설명</span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4">
          {loading ? (
            <p className="text-xs text-muted">설명을 불러오는 중…</p>
          ) : failed ? (
            <p className="text-xs text-muted">
              설명을 불러오지 못했어요.{' '}
              <button
                type="button"
                onClick={load}
                className="font-semibold text-sky-strong"
              >
                다시 받기
              </button>
            </p>
          ) : (
            <p className="whitespace-pre-wrap break-keep text-sm leading-relaxed text-ink/85">{text}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** 세션 끝 — 오른 단계가 있으면 그 단계 설명 한 장씩 */
function FinishView({
  leveled,
  backHref,
  count,
}: {
  leveled: { element: string; stage: DrillStage }[];
  backHref: string;
  count: number;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-xl space-y-5 px-4 py-8">
        <div className="space-y-2 text-center">
          <span className="done-ring mx-auto grid h-16 w-16 place-items-center rounded-full bg-sky text-white">
            <span className="done-check text-2xl font-bold">✓</span>
          </span>
          <h1 ref={ref} tabIndex={-1} className="text-2xl font-bold text-ink outline-none">
            세션을 마쳤어요
          </h1>
          <p className="text-sm text-muted">드릴 {count}개를 했어요.</p>
        </div>

        {leveled.map(({ element, stage }) => {
          const el = mechanicsElement(element);
          const desc = DRILL_STAGES.find((s) => s.name === stage)?.desc;
          return (
            <div key={`${element}-${stage}`} className="rise-in space-y-2 rounded-2xl bg-surface px-4 py-4">
              <p className="text-base font-bold break-keep text-ink">
                {element}
                {josa(element, '이/가')} <span className="text-sky-strong">{stage}</span> 단계로 올라갔어요
              </p>
              {desc && (
                <p className="text-sm break-keep text-muted">
                  다음 세션부터 {stage} 드릴이 나와요({desc}).
                </p>
              )}
              {el && el.cues[0] && (
                <p className="rounded-xl bg-sky-tint/60 px-3.5 py-2 text-sm font-semibold break-keep text-sky-strong">
                  “{el.cues[0]}”
                </p>
              )}
            </div>
          );
        })}

        <Link
          href={backHref}
          className="flex min-h-12 w-full items-center justify-center rounded-full bg-sky text-base font-bold text-white transition-colors hover:bg-sky-strong"
        >
          완료
        </Link>
      </div>
    </div>
  );
}
