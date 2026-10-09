'use client';

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui';
import { SPLASH_ATTR, SPLASH_END_EVENT } from '@/components/app-splash';

/**
 * 튜토리얼 창 — 몇 장을 한 장씩 넘기며 무엇을 어떻게 하는지 알려 준다. 불펜 벨로시티의 첫 안내
 * (components/velocity/tutorial.tsx)를 일반화한 것. 기본 투어(tour-gate.tsx)와 탭 튜토리얼(tab-tutorial.tsx)이 같이 쓴다.
 *
 * 봤다는 표시는 여기서 적지 않는다 — 부르는 쪽이 계정(User.tutorialsDone, app/actions/onboarding-state.ts)에 적는다.
 * 계정에 남으므로 '다시 보지 않기' 체크도 없다(벨로시티는 브라우저에 적어서 체크가 있다).
 *
 * 닫는 길은 셋. 마지막 장의 '시작하기'와 머리의 X(건너뛰기)는 onClose(true) — 봤다고 적는다. Esc(안드로이드 뒤로처럼
 * 브라우저가 닫는 것도)는 onClose(false) — 잘못 눌러 닫은 것일 수 있어 적지 않는다. 언제 다시 뜨는지는 부르는 쪽이 정한다.
 *
 * 열려 있을 때만 그린다 — 닫혔다 다시 열리면 첫 장부터. 휴대폰은 화면 전체(막대 · 탭 위), PC 는 바깥을 어둡게 하고
 * 가운데 카드.
 *
 * <dialog> 를 showModal 로 연다(맨 위 칸, top layer). 예전에는 본문 안의 div(z-60)라서 맨 위 칸에 뜬 창 밑에 깔렸다 —
 * 설정 › 정보 '사용 안내 다시 보기'를 누르면 투어가 설정 창의 어두운 배경 뒤에서 열려, 사용자에게는 아무 일도 없는 것처럼
 * 보였다. 맨 위 칸에서는 나중에 연 창이 위에 서므로 설정 창 위에 뜨고, 뒤 화면은 브라우저가 잠근다(초점이 창 밖으로
 * 새지 않고, 화면 낭독기도 뒤를 안 읽고, 뒤 페이지가 굴러가지 않는다 — globals.css html:has(dialog:modal)). 체크인 관문도
 * 맨 위 칸이라 둘이 같이 뜨면 나중 것이 덮는다 — 그래서 관문은 튜토리얼이 끝나기를 기다린다(tour-gate.tsx 의 holdTour).
 */

export type TutorialSlide = {
  key: string;
  title: string;
  body: string;
  /** 본문 아래 짧은 덧말 — 없어도 된다 */
  note?: string;
  /** 위 그림 칸(휴대폰 4:3, 낮은 화면 · PC 16:9)에 들어가는 것 — slides.tsx 의 Art(아이콘 하나) */
  art?: ReactNode;
};

/**
 * 시작 연출(components/app-splash.tsx)이 도는 중이면 걷힐 때까지 — 체크인 관문(components/checkin-gate.tsx)과 같은 방식.
 * 연출이 끝내 안 걷혀도 이때는 연다(연출 3.5초 + 여유). 연출이 없으면(클라이언트 이동) 바로.
 */
const SPLASH_WAIT_MS = 5000;
export function afterSplash(): Promise<void> {
  if (!document.documentElement.hasAttribute(SPLASH_ATTR)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let timer = 0;
    const done = () => {
      window.removeEventListener(SPLASH_END_EVENT, done);
      window.clearTimeout(timer);
      resolve();
    };
    window.addEventListener(SPLASH_END_EVENT, done);
    timer = window.setTimeout(done, SPLASH_WAIT_MS);
  });
}

/** 그림 n 장 뒤 — 화면이 자리 잡은 뒤에 열려고(처음 그릴 때 곧바로 열면 뒤 화면과 같이 떠올라 어수선하다) */
export function nextFrames(n: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const tick = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => tick(left - 1));
    };
    tick(n);
  });
}

/** 리액트가 화면 전환을 돌리는 동안 document 에 달아 두는 손잡이(react-dom 이 붙이고 뗀다) — checkin-gate.tsx 와 같다 */
type ReactViewTransitionDocument = Document & {
  __reactViewTransition?: ViewTransition | null;
};

/** 화면 전환이 끝나기를 기다리는 가장 긴 시간 — 넘기면 그냥 연다(조금 흔들려도 창이 안 뜨는 것보다 낫다) */
const SETTLE_WAIT_MS = 2000;

/**
 * 돌고 있는 화면 전환이 끝날 때까지 — 체크인 관문의 readyToOpen(components/checkin-gate.tsx)에서 글꼴만 뺀 것.
 *
 * 전환 중에는 이름 붙은 것(본문 app-main · 틀 shell-*)이 맨 위 칸의 창보다도 위의 층에 그려진다. 첫 설정을 마치고 탭으로
 * 넘어가는 이동(밀려 들어오는 0.34초)이 도는 사이 창을 열면, 창이 옅게 뜬 뒤 밀려 들어오는 본문 그림에 덮였다가 전환이
 * 끝나는 순간 다시 튀어나온다. 문서가 다 오고(DOMContentLoaded), 돌던 전환과 드러내려고 줄 선 조각($RB)이 없어진 뒤에 연다.
 * 리액트 안쪽 이름이라 바뀌면 이 기다림만 빠진다.
 */
async function afterTransitions(): Promise<void> {
  if (document.readyState === 'loading') {
    await new Promise<void>((resolve) =>
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
    );
  }
  const doc = document as ReactViewTransitionDocument;
  const queued = () => ((window as { $RB?: unknown[] }).$RB?.length ?? 0) > 0;
  for (let i = 0; i < 40; i++) {
    const vt = doc.__reactViewTransition;
    if (vt) await vt.finished.catch(() => undefined);
    else if (queued()) await new Promise((resolve) => window.setTimeout(resolve, 50));
    else return;
  }
}

/** 창을 열어도 될 때 — 시작 연출이 걷히고, 돌던 화면 전환이 끝나고, 그림 두 장 뒤 */
export async function readyToShow(): Promise<void> {
  await afterSplash();
  await Promise.race([
    afterTransitions().catch(() => undefined),
    new Promise((resolve) => window.setTimeout(resolve, SETTLE_WAIT_MS)),
  ]);
  await nextFrames(2);
}

export function TutorialDialog({
  open,
  label,
  slides,
  onClose,
  finishLabel = '시작하기',
}: {
  open: boolean;
  /** 머리의 작은 이름 — '투구 기록 · 처음 안내' */
  label: string;
  slides: TutorialSlide[];
  /** done — 시작하기 · 건너뛰기(true), Esc(false) */
  onClose: (done: boolean) => void;
  /** 마지막 장 단추 글 */
  finishLabel?: string;
}) {
  if (!open) return null;
  return (
    <Dialog label={label} slides={slides} onClose={onClose} finishLabel={finishLabel} />
  );
}

function Dialog({
  label,
  slides,
  onClose,
  finishLabel,
}: {
  label: string;
  slides: TutorialSlide[];
  onClose: (done: boolean) => void;
  finishLabel: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  /* 부르는 쪽이 닫아(open 끔) 거두는 중 — 그때 브라우저가 늦게 보내는 close 를 Esc 로 읽지 않게 */
  const unmounting = useRef(false);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<'next' | 'back'>('next');
  const titleId = useId();

  const total = slides.length;
  const last = index === total - 1;
  const slide = slides[index];

  /*
   * 그리자마자 맨 위 칸에 올린다(닫힌 <dialog> 는 globals.css 가 display:none 으로 숨겨 두므로 그 사이 번쩍이지 않는다).
   *
   * 첫 초점은 창 자체에 둔다 — 체크인 관문(components/checkin-gate.tsx)과 같은 까닭. 투어는 처음 불러온 홈에서 아무것도
   * 누르기 전에 저절로 뜨는데, 그때 스크립트로 단추에 초점을 옮기면 크롬은 키보드로 옮긴 초점으로 보고 '다음' 둘레에
   * 파란 테두리(:focus-visible)를 그렸다. showModal 이 안의 첫 단추(X)에 주는 초점도 같아서, 곧바로 창으로 옮긴다.
   * 창은 테두리가 없다(outline-none). 키보드로 쓰는 사람은 좌우 화살표로 넘기고, Tab 으로 단추에 들어간다.
   *
   * 거둘 때는 close() 로 내린다 — 그래야 브라우저가 열기 전 초점(설정 창의 '사용 안내 다시 보기' 등)으로 되돌린다. 떼어
   * 내기만 하면 초점이 body 로 떨어진다.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    unmounting.current = false;
    if (!el.open) el.showModal();
    el.focus({ preventScroll: true });
    return () => {
      unmounting.current = true;
      if (el.open) el.close();
    };
  }, []);

  const go = (to: number) => {
    setDir(to > index ? 'next' : 'back');
    setIndex(Math.min(total - 1, Math.max(0, to)));
  };

  /* 첫 장으로 돌아가면 '이전'이 사라진다 — 그 단추에 있던 초점이 body 로 떨어지지 않게 창으로 옮긴다 */
  const back = () => {
    if (index - 1 <= 0) ref.current?.focus({ preventScroll: true });
    go(index - 1);
  };

  return (
    /*
     * 휴대폰: 창이 곧 화면 전체(bg-page) — 뒤를 어둡게 할 것이 없어 ::backdrop 은 투명. PC: 창은 투명한 화면 전체 틀이고
     * 바깥 어둠은 ::backdrop, 안의 카드가 가운데에 선다.
     *
     * 옅어지기만 한다(160ms). 앱의 창은 globals.css 의 dialog[open] 이 조금 올라오며 커지는 움직임(dialog-in)을 거는데,
     * 그 규칙은 @layer 밖이라 클래스로는 못 이긴다 — 그래서 !(important)로 덮는다. 움직임을 줄인 사람에게는 globals.css 가
     * 아예 끈다.
     */
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      /* 열릴 때 창 자체가 초점을 받는다(위 효과) — 그러려면 초점을 받을 수 있어야 한다 */
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          /* 브라우저가 스스로 닫지 않게 막고 직접 닫는다(components/modal.tsx 와 같은 까닭). 밑의 창(설정)까지 닫히지 않게 */
          e.preventDefault();
          e.stopPropagation();
          onClose(false);
        } else if (e.key === 'ArrowRight' && !last) {
          e.preventDefault();
          go(index + 1);
        } else if (e.key === 'ArrowLeft' && index > 0) {
          e.preventDefault();
          back();
        }
      }}
      /* 안드로이드 뒤로 같은 닫기 요청 — Esc 와 같다 */
      onCancel={(e) => {
        e.preventDefault();
        onClose(false);
      }}
      /* 그래도 브라우저가 끝내 닫아 버렸으면(Esc 를 거듭 누르면 크롬은 닫는다) Esc 로 친다 — 다시 열린 뒤 늦게 온 것은 무시 */
      onClose={(e) => {
        if (e.target !== e.currentTarget || e.currentTarget.open || unmounting.current)
          return;
        onClose(false);
      }}
      className="fixed inset-0 m-0 flex h-dvh max-h-none w-full max-w-none flex-col overflow-hidden border-0 bg-page p-0 text-ink outline-none backdrop:bg-transparent motion-safe:!animate-fade-in desk:items-center desk:justify-center desk:bg-transparent desk:p-6 desk:backdrop:bg-black/40"
    >
      <div className="mx-auto flex h-full w-full max-w-md flex-col px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] desk:h-auto desk:max-h-full desk:rounded-3xl desk:border desk:border-line desk:bg-page desk:px-5 desk:pb-5 desk:pt-2 desk:shadow-2xl">
        {/* 머리 — 이름 · 건너뛰기 */}
        <div className="flex h-12 shrink-0 items-center justify-between">
          <span className="text-xs font-medium text-muted">{label}</span>
          <button
            type="button"
            onClick={() => onClose(true)}
            aria-label="건너뛰기"
            title="건너뛰기"
            className="-mr-2 flex h-12 w-12 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        {/*
          본문 — 그림 · 제목 · 글. 카드가 남는 높이의 가운데에 서되(my-auto), 낮은 화면에서 넘치면 위부터 굴린다 —
          justify-center 는 넘칠 때 위가 잘린다.
        */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain py-2">
          <section
            key={slide.key}
            className={`my-auto overflow-hidden rounded-2xl border border-line bg-surface ${
              dir === 'next'
                ? 'motion-safe:animate-step-next'
                : 'motion-safe:animate-step-back'
            }`}
          >
            {/*
              그림 칸 — 휴대폰은 4:3, 세로가 낮은 화면(short, 700px 이하)과 PC 는 16:9. 4:3 이면 375×667(아이폰 SE)에서 덧말이
              있는 장이 700px 남짓이라 본문이 굴렀다. 16:9 로 낮추면 60px 남짓 줄어 한 화면에 든다.
            */}
            <div className="flex aspect-[4/3] items-center justify-center bg-sky-tint/60 px-6 text-sky short:aspect-[16/9] desk:aspect-[16/9]">
              {slide.art}
            </div>
            <div className="px-5 pb-5 pt-4">
              <span className="mb-2 block text-xs font-medium text-muted">
                {index + 1} / {total}
              </span>
              <h2 id={titleId} className="text-heading text-lg break-keep">
                {slide.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed break-keep text-ink">
                {slide.body}
              </p>
              {slide.note && (
                <p className="mt-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-relaxed break-keep text-muted">
                  {slide.note}
                </p>
              )}
            </div>
          </section>
        </div>

        {/* 발 — 점 · 이전/다음 */}
        <div className="shrink-0 space-y-3 pt-2">
          {/*
            점 — 누르면 그 장으로 가는 단추 묶음. 탭(role=tab)이 아니다: 탭이면 화살표 이동과 가리키는 칸(tabpanel)이
            따라야 하는데, 여기 화살표는 창 전체가 받는다(위 onKeyDown). 지금 장은 aria-current 로 알린다.
          */}
          <div
            role="group"
            aria-label="안내 순서"
            className="flex items-center justify-center gap-1.5"
          >
            {slides.map((s, i) => (
              <button
                key={s.key}
                type="button"
                aria-current={i === index ? 'step' : undefined}
                aria-label={`${i + 1}번째: ${s.title}`}
                onClick={() => go(i)}
                className="flex h-6 w-6 items-center justify-center"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all ${
                    i === index ? 'w-5 bg-sky' : 'w-1.5 bg-line-strong'
                  }`}
                />
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="secondary" className="h-12 flex-1" onClick={back}>
                이전
              </Button>
            )}
            {last ? (
              <Button className="h-12 flex-1" onClick={() => onClose(true)}>
                {finishLabel}
              </Button>
            ) : (
              <Button className="h-12 flex-1" onClick={() => go(index + 1)}>
                다음
              </Button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
