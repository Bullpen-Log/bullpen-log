'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { Check, ChevronDown, Info, Shuffle, X } from 'lucide-react';
import { LibraryVideo } from '@/components/library-video';
import { ErrorLine } from '@/components/error-line';
import { useWakeLock } from '@/components/use-wake-lock';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { mechanicsElement } from '@/lib/mechanics/elements';
import { mechanicsLevel } from '@/lib/mechanics/levels';
import { FEELS, doseFields, filmPrompt, levelAdvice, type DrillFeel } from '@/lib/mechanics/program';
import type { PlayerVariant, SessionDrillView } from '@/lib/mechanics/load';
import {
  finishMechanicsSession,
  recordMechanicsDrill,
  startMechanicsProgram,
} from '@/app/actions/mechanics';
import { guideDescription } from '@/app/actions/content';
import { FilmVerdictButtons } from '@/app/(app)/training/film-verdict';
import { josa } from '@/lib/korean';

/**
 * 메커니즘 세션 따라 하기 — 한 드릴씩(2026-10-04, page.tsx).
 *
 * 드릴에는 시계가 없다(횟수 · 공 수로 한다). 그래서 암케어처럼 쉬는 시계 대신, 마치면 느낌 하나를 누르는 것이 '다음'이다.
 * 느낌은 그 요소에 쌓이고, 수준은 저절로 바꾸지 않는다 — 세션을 마치면 끝 화면이 다음 · 아래 수준을 권한다
 * (lib/mechanics/program.ts levelAdvice). 화면이 꺼지지 않게 잡아 둔다.
 */
export function MechanicsPlayer({
  backHref,
  items,
  startAt,
  label,
  sessionNumber,
  isAdmin,
}: {
  backHref: string;
  items: SessionDrillView[];
  startAt: number;
  /** 머리에 쓰는 이름 — '입문 1주차 2번째' */
  label: string;
  /** 수준과 상관없이 몇 번째 세션인가 — 여섯 번째마다 찍어서 견주라고 한다 */
  sessionNumber: number;
  isAdmin: boolean;
}) {
  const [index, setIndex] = useState(startAt);
  const [done, setDone] = useState<boolean[]>(() => items.map((_, i) => i < startAt));
  /* 세션을 마친 뒤 서버가 돌려준 권하기 — 끝 화면이 단추와 함께 보인다 */
  const [advice, setAdvice] = useState<ReturnType<typeof levelAdvice>>(null);
  const [finished, setFinished] = useState(false);
  /* 마치기 저장이 실패했나 — 끝 화면 대신 다시 저장 단추를 둔다(안 그러면 세션 수가 안 올라 같은 세션이 또 나왔다) */
  const [finishFailed, setFinishFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  useWakeLock(!finished);
  /* 드릴마다 고른 동작(alternatives 의 몇 번째) · 도구 — 장비가 없거나 자리가 좁으면 바꿔 한다(2026-10-04 검토) */
  const [choices, setChoices] = useState(() => items.map((it) => ({ alt: 0, variantId: it.guideId })));
  /* 지금 드릴에서 마친 세트 수 — 화면 안에서만 센다(드릴을 옮기면 처음부터) */
  const [setsDone, setSetsDone] = useState(0);

  const item = items[index];
  const view = viewOf(item, choices[index]);
  const counted = Math.min(setsDone, view.sets);
  const choose = (next: { alt: number; variantId: string }) =>
    setChoices((c) => c.map((v, i) => (i === index ? next : v)));

  const record = (feel: DrillFeel) =>
    startTransition(async () => {
      setError(null);
      const res = await orOffline(
        recordMechanicsDrill({ guideId: view.guideId, element: item.element, feel }),
        { error: OFFLINE_MESSAGE }
      );
      if ('error' in res) {
        setError(res.error);
        return;
      }
      setDone((d) => d.map((v, i) => (i === index ? true : v)));
      if (index + 1 < items.length) {
        setIndex(index + 1);
        setSetsDone(0);
        scroller.current?.scrollTo({ top: 0 });
      } else {
        await finish();
      }
    });

  /** 세션을 마친다 — 실패하면 끝 화면으로 넘어가지 않고 다시 저장하게 한다 */
  const finish = async () => {
    const res = await orOffline(finishMechanicsSession(), { error: OFFLINE_MESSAGE });
    if ('error' in res) {
      setError(res.error);
      setFinishFailed(true);
      return;
    }
    setFinishFailed(false);
    setAdvice(res.advice);
    setFinished(true);
  };

  /* 건너뛰기 — 마지막 드릴이면 건너뛰고 마친다(예전엔 마지막 드릴은 건너뛸 수 없었다) */
  const skip = () => {
    if (index + 1 < items.length) {
      setIndex(index + 1);
      setSetsDone(0);
      scroller.current?.scrollTo({ top: 0 });
    } else {
      startTransition(async () => {
        setError(null);
        await finish();
      });
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
            메커니즘 · {label}
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
        <FinishView
          advice={advice}
          sessionNumber={sessionNumber}
          backHref={backHref}
          count={done.filter(Boolean).length}
        />
      ) : (
        <>
          <div ref={scroller} className="flex-1 overflow-y-auto">
            <DrillView
              key={item.guideId}
              item={item}
              view={view}
              alt={choices[index].alt}
              onChoose={choose}
              isAdmin={isAdmin}
            />
          </div>

          <div className="border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto max-w-xl space-y-2.5">
              {/* 세트 세기 — 한 세트를 마칠 때마다 누른다. 다시 누르면 그 앞까지로 */}
              <div className="flex items-center gap-2" role="group" aria-label="마친 세트">
                {Array.from({ length: view.sets }, (_, i) => {
                  const on = i < counted;
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSetsDone(counted === i + 1 ? i : i + 1)}
                      className={`flex min-h-10 flex-1 items-center justify-center gap-1 rounded-full border text-sm font-semibold transition-colors ${
                        on ? 'border-sky bg-sky-tint text-sky-strong' : 'border-line text-muted'
                      }`}
                    >
                      {on && <Check aria-hidden className="h-3.5 w-3.5" />}
                      {i + 1}세트
                    </button>
                  );
                })}
              </div>
              <p className="text-center text-sm font-semibold text-ink">
                {counted === view.sets ? '다 했어요. 어땠어요?' : '마쳤으면, 어땠어요?'}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {FEELS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    disabled={pending}
                    onClick={() => record(f.value)}
                    /*
                      셋 다 같은 모양 — 예전엔 '쉬움'만 파랗게 칠해 무심코 누르기 쉬웠고, 그만큼 단계가 부풀어 올랐다
                      (2026-10-04 검토). 정직하게 고른 느낌이 진도의 전부다.
                    */
                    className="flex min-h-14 flex-col items-center justify-center rounded-2xl bg-surface-2 px-1 text-ink transition-colors hover:bg-sky-tint active:bg-sky-tint disabled:opacity-60"
                  >
                    <span className="text-base font-bold">{f.label}</span>
                    <span className="text-xs leading-tight break-keep text-muted">{f.hint}</span>
                  </button>
                ))}
              </div>
              {error && <ErrorLine>{error}</ErrorLine>}
              {finishFailed ? (
                <button
                  type="button"
                  onClick={() =>
                    startTransition(async () => {
                      setError(null);
                      await finish();
                    })
                  }
                  disabled={pending}
                  className="mx-auto flex min-h-11 items-center px-3 text-sm font-semibold text-sky-strong"
                >
                  세션 마치기 다시 저장
                </button>
              ) : (
                <button
                  type="button"
                  onClick={skip}
                  disabled={pending}
                  className="mx-auto flex min-h-11 items-center px-3 text-xs font-semibold text-muted hover:text-ink"
                >
                  {index + 1 < items.length ? '이번 드릴은 건너뛰기' : '건너뛰고 세션 마치기'}
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
/** 지금 보이는 드릴 — 고른 동작 · 도구의 것(바꾸지 않았으면 세션이 고른 그대로) */
type DrillChoiceView = {
  title: string;
  guideId: string;
  tool: string;
  dose: string;
  sets: number;
  tempo: string;
  variant: PlayerVariant;
  variants: PlayerVariant[];
};

function viewOf(item: SessionDrillView, choice: { alt: number; variantId: string }): DrillChoiceView {
  const alt = item.alternatives[choice.alt] ?? item.alternatives[0];
  const variants = alt?.variants ?? [{ ...item.variant, owned: true }];
  const variant = variants.find((v) => v.id === choice.variantId) ?? variants[0];
  return {
    title: alt?.title ?? item.title,
    guideId: variant.id,
    tool: variant.tool,
    ...doseFields(variant.category, item.stage),
    variant,
    variants,
  };
}

function DrillView({
  item,
  view,
  alt,
  onChoose,
  isAdmin,
}: {
  item: SessionDrillView;
  view: DrillChoiceView;
  alt: number;
  onChoose: (next: { alt: number; variantId: string }) => void;
  isAdmin: boolean;
}) {
  const element = mechanicsElement(item.element);
  const alts = item.alternatives.length;
  const note = item.gearNote;

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-5">
      <div className="space-y-1.5">
        <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <span className="rounded-full bg-sky-tint px-2.5 py-0.5 text-sky-strong">{item.element}</span>
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-ink">{item.stage}</span>
          {view.variants.length < 2 && <span className="text-muted">{view.tool}</span>}
        </p>
        <h1 className="text-xl font-bold break-keep text-ink">{view.title}</h1>
        <div className="flex min-h-10 items-center justify-between gap-2">
          <p className="text-base font-semibold text-sky-strong">{view.dose}</p>
          {alts > 1 && (
            <button
              type="button"
              onClick={() => {
                const next = (alt + 1) % alts;
                onChoose({ alt: next, variantId: item.alternatives[next].guideId });
              }}
              className="-mr-3 flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-sky-strong"
            >
              <Shuffle aria-hidden className="h-4 w-4" />
              다른 드릴
              <span className="text-xs font-medium text-muted tabular-nums">
                {alt + 1}/{alts}
              </span>
            </button>
          )}
        </div>
        <p className="text-xs break-keep text-muted">{view.tempo}</p>
      </div>

      {view.variants.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="도구">
          {view.variants.map((v) => {
            const on = v.id === view.guideId;
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChoose({ alt, variantId: v.id })}
                /* 가진 장비에 없는 도구는 점선 — 골라도 되지만(오늘 빌린 공) 처음엔 안 고른다 */
                className={`min-h-10 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                  on
                    ? 'bg-sky text-white'
                    : v.owned
                      ? 'bg-surface text-ink'
                      : 'border border-dashed border-line text-muted'
                }`}
              >
                {v.tool}
              </button>
            );
          })}
        </div>
      )}

      {!view.variant.owned ? (
        <p className="text-xs break-keep text-muted">이 도구는 가진 장비에 없어요. 있으면 그대로 해도 돼요.</p>
      ) : (
        note?.replaced &&
        alt === 0 && (
          <p className="text-xs break-keep text-muted">
            프로그램의 ‘{note.replaced}’에는 {note.need}
            {josa(note.need, '이/가')} 있어야 해서, 같은 단계의 이 드릴로 바꿨어요.
          </p>
        )
      )}

      {item.cue && (
        <p className="rounded-2xl bg-sky-tint/60 px-4 py-3 text-sm font-semibold break-keep text-sky-strong">
          “{item.cue}”
        </p>
      )}

      {(view.variant.videoPath || view.variant.referenceVideoId) && (
        <LibraryVideo
          key={`video-${view.guideId}`}
          path={view.variant.videoPath}
          referenceVideoId={view.variant.referenceVideoId}
          title={view.title}
          thumbUrl={view.variant.thumbUrl}
          aspectRatio={view.variant.aspectRatio}
          isAdmin={isAdmin}
        />
      )}

      <Description key={`desc-${view.guideId}`} guideId={view.guideId} />

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

/** 세션 끝 — 권할 것이 있으면 다음 · 아래 수준 카드, 여섯 번째마다 찍어서 견주기 */
function FinishView({
  advice,
  sessionNumber,
  backHref,
  count,
}: {
  advice: ReturnType<typeof levelAdvice>;
  /** 방금 마친 세션이 몇 번째인가(수준과 상관없이) — 여섯 번째마다 찍어서 견주라고 한다 */
  sessionNumber: number;
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

        {advice?.to && <LevelOffer kind={advice.kind} to={advice.to} />}

        {filmPrompt(sessionNumber) === 'compare' && (
          <div className="space-y-3 rounded-2xl bg-surface px-4 py-4">
            <p className="text-base font-bold break-keep text-ink">세션 {sessionNumber}번 — 찍어서 견줘 볼 때예요</p>
            <p className="text-sm break-keep text-muted">
              같은 자리에서 다시 찍어 투구 기록에 남기고, 처음 영상과 2분할 비교로 나란히 놓아 보세요. 구속도 같이
              재 두면 바뀐 것이 효과가 있었는지 알 수 있어요.
            </p>
            <Link
              href="/videos?compare=1"
              className="flex min-h-11 w-full items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-ink"
            >
              2분할 비교 열기
            </Link>
            {/* 견준 결과 — 지금 못 견줬으면 '아직'을 누르거나 프로그램 칸에서 나중에 남긴다 */}
            <div className="border-t border-line/70 pt-3">
              <FilmVerdictButtons session={sessionNumber} current={null} />
            </div>
          </div>
        )}

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

/**
 * 다음 · 아래 수준 권하기 — 저절로 바꾸지 않는다(2026-10-04 사용자분). 누르면 그 수준의 1주차 1번째부터.
 * done: 12세션을 다 마침 · up: 여러 요소에서 '쉬움'이 쌓임 · down: '어려움'이 이어짐.
 */
function LevelOffer({ kind, to }: { kind: 'done' | 'up' | 'down'; to: Parameters<typeof mechanicsLevel>[0] }) {
  const [state, setState] = useState<'ask' | 'changed' | 'keep'>('ask');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (state === 'keep') return null;
  const level = mechanicsLevel(to);
  const title =
    kind === 'done'
      ? `이 수준을 다 마쳤어요. ${level.name}${josa(level.name, '으로/로')} 가 볼까요?`
      : kind === 'up'
        ? `${level.name}${josa(level.name, '으로/로')} 올라가 볼까요?`
        : `${level.name}${josa(level.name, '으로/로')} 낮춰 볼까요?`;
  const detail =
    kind === 'down'
      ? '‘어려움’이 이어지는 요소가 있어요. 한 단계 낮은 수준에서 자세를 다지고 다시 올라와도 돼요.'
      : kind === 'up'
        ? '여러 요소에서 ‘쉬움’이 서로 다른 날 쌓였어요. 드릴이 편해졌다면 다음 수준이 더 맞을 수 있어요.'
        : '4주 동안 12번을 다 했어요. 편하지 않았다면 프로그램 칸에서 같은 수준을 한 번 더 해도 돼요.';
  return (
    <div className="space-y-3 rounded-2xl bg-surface px-4 py-4">
      {state === 'changed' ? (
        <p className="text-sm font-semibold break-keep text-ink">
          {level.name} 프로그램으로 바꿨어요. 다음 세션부터 {level.name} 1주차예요.
        </p>
      ) : (
        <>
          <p className="text-base font-bold break-keep text-ink">{title}</p>
          <p className="text-sm break-keep text-muted">{detail}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const res = await orOffline(startMechanicsProgram(to), { error: OFFLINE_MESSAGE });
                  if ('error' in res) setError(res.error);
                  else setState('changed');
                })
              }
              className="min-h-11 rounded-full bg-sky text-sm font-bold text-white disabled:opacity-60"
            >
              {pending ? '바꾸는 중…' : `${level.name} 시작`}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setState('keep')}
              className="min-h-11 rounded-full bg-surface-2 text-sm font-semibold text-ink"
            >
              나중에
            </button>
          </div>
          {error && <ErrorLine>{error}</ErrorLine>}
        </>
      )}
    </div>
  );
}
