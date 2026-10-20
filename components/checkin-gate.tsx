'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CheckinFlow } from '@/components/checkin-flow/flow';
import type { CheckinFlowContext } from '@/components/checkin-flow/types';
import {
  readCheckinSkip,
  subscribeCheckinSkip,
  writeCheckinSkip,
} from '@/components/checkin-skip';
import { SPLASH_ATTR, SPLASH_END_EVENT } from '@/components/app-splash';
import { TOUR_ATTR, TOUR_END_EVENT } from '@/components/tutorial/tour-gate';
import { useTodayKey } from '@/components/use-today-key';
import { DESK_MEDIA, sportOf } from '@/lib/nav';
import { isSetupPath } from '@/lib/feature-locks';

/**
 * 체크인 관문 — 그날 체크인을 안 했으면 앱에 들어오자마자 먼저 뜬다.
 *
 * 체크인은 이 앱이 오늘에 맞춘 운동을 고르고 리포트를 쓰는 재료다. 안 하면 추천도
 * 기록도 어제 기준으로 멈춰 있다. 그래서 홈 구석의 상자로 두지 않고, 그날 처음
 * 들어올 때 앞을 막고 묻는다.
 *
 * 3판(2026-10-13)부터 묻는 것은 한 화면 흐름(components/checkin-flow/flow.tsx)이다:
 *   휴대폰  전체 화면(app/(session)/checkin)으로 보낸다 — 탭 막대 없이 한 질문씩
 *   PC      같은 흐름을 이 창(dialog) 안에 띄운다
 * 둘을 가르는 기준은 CSS 의 desk: 와 같은 DESK_MEDIA(lib/nav.ts).
 *
 * 다만 막아 두기만 하면 급한 날 앱을 못 쓴다. 흐름의 첫 화면에 '오늘은 건너뛰기'가 있다. 건너뛰면
 * 그날은 다시 묻지 않는다(components/checkin-skip.ts). 예전엔 이번 접속 동안만이었는데(한 번 건너뛴 날은 끝내 체크인을 안 하게
 * 될까 봐), 아이폰 앱은 켤 때마다 새 접속이라 앱을 열 때마다 다시 물어 2026-10-18 김민이 하루로 바꿨다.
 *
 * 건너뛰어도 체크인은 아직 안 한 것이다. 오른쪽 위 알림(종)에 남아 있고, 거기서
 * 언제든 하거나 고친다(components/notice-bell.tsx — 같은 흐름을 연다).
 *
 * 모든 화면의 틀((app)/layout.tsx)에 들어 있어서, 어느 화면으로 들어오든 뜬다.
 */

/*
 * 창을 열기 전에 글꼴 조각도 같이 받아 둘 글 — 흐름의 글자(아래 readyToOpen).
 */
const PRELOAD_TEXT =
  '다시 돌아오신 걸 환영해요 오늘 몸 상태를 20초만 적어요 시작 오늘은 건너뛰기 처음으로 이전 다음 완료 ' +
  '오늘 컨디션은 어때요? 아파요 보통이에요 좋아요 몸에 불편한 곳이 있어요 어디가 불편해요? 어젯밤 잠은요? ' +
  '거의 못 잠 뒤척임 보통 잘 잠 푹 잠 남길 말이 있나요? 체크인 완료! 일째 체크인 0123456789';

/**
 * 창을 열기 전에 기다리는 가장 긴 시간(아래 readyToOpen). 처음 접속한 날 보통 망에서
 * 홈의 나머지 조각과 창의 글꼴 조각(하나 34KB, 열 개 남짓)은 이 안에 온다. 넘기면
 * 더 기다리지 않고 연다 — 조금 흔들리더라도 창이 안 뜨는 것보다는 낫다.
 */
const GATE_WAIT_MS = 2000;

/**
 * 관문이 떠 있는 동안 <html> 에 다는 표시 — globals.css 가 이것을 보고 화면 전환이
 * 아무것도 창 위의 층으로 빼지 못하게 막는다.
 *
 * [open] 이 아니라 따로 다는 까닭: 닫을 때도 창은 0.24초 동안 가라앉으며 남아 있다.
 * 저장하면 서버가 새 화면을 보내고 리액트가 그 화면으로 전환을 거는데, 그 한가운데에서
 * 창이 닫힌다. [open] 만 보면 그 순간 막이 풀려, 가라앉는 창 위로 본문과 상단바가 환하게
 * 올라왔다. 표시는 열기 직전에 달고, 닫는 움직임이 끝난 뒤(CLOSE_MS)에 뗀다.
 */
const GATE_UP = 'data-gate-up';
/** 시작 연출이 끝내 안 걷혀도 이때는 연다(연출 3.5초 + 여유) */
const SPLASH_WAIT_MS = 5000;
/** 닫는 움직임(globals.css 의 dialog[data-gate] 0.24초)이 다 끝나는 때 */
const CLOSE_MS = 300;
/** 투어가 떠 있는 동안 표시(<html data-tour>)가 걷혔는지 다시 보는 간격 — 끝 신호를 놓쳐도 관문이 영영 안 뜨지는 않게 */
const TOUR_POLL_MS = 500;

/**
 * 앱 기본 사용법 투어(components/tutorial/tour-gate.tsx)가 떠 있으면 그것이 끝날 때까지 — 차례는 시작 연출 → 투어 →
 * 관문(2026-10-09). 투어는 읽는 데 얼마나 걸릴지 모르니 시작 연출처럼 시간을 정해 두고 열지는 않는다. 다만 투어가
 * 신호 없이 사라지면(다른 틀로 옮겨 가며 걷히는 경우) 표시가 없어진 것을 보고 연다.
 */
function afterTour() {
  const root = document.documentElement;
  if (!root.hasAttribute(TOUR_ATTR)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      window.removeEventListener(TOUR_END_EVENT, done);
      window.clearInterval(poll);
      resolve();
    };
    const poll = window.setInterval(() => {
      if (!root.hasAttribute(TOUR_ATTR)) done();
    }, TOUR_POLL_MS);
    window.addEventListener(TOUR_END_EVENT, done);
  });
}

/** 시작 연출(components/app-splash.tsx)이 도는 중이면 그것이 걷힌 뒤에 — 창은 맨 위 칸(top layer)이라 연출을 덮는다 */
function afterSplash() {
  if (!document.documentElement.hasAttribute(SPLASH_ATTR)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      window.removeEventListener(SPLASH_END_EVENT, done);
      resolve();
    };
    window.addEventListener(SPLASH_END_EVENT, done);
    window.setTimeout(done, SPLASH_WAIT_MS);
  });
}

/** 리액트가 화면 전환을 돌리는 동안 document 에 달아 두는 손잡이(react-dom 이 붙이고 뗀다) */
type ReactViewTransitionDocument = Document & {
  __reactViewTransition?: ViewTransition | null;
};

/**
 * 관문을 열어도 될 때 — 뒤 화면이 자리를 잡고, 창 글자의 글꼴이 온 뒤.
 *
 * 1. 창 글자의 글꼴 조각. 글꼴은 92조각으로 나뉘어 화면에 실제로 쓰인 글자의 조각만
 *    내려온다(app/layout.tsx). 이 창의 글자(체크인 · 컨디션 · 수면 …)는 뒤 화면에 없던
 *    것이 많아 창이 열린 뒤에야 받기 시작했고, 처음 접속한 날은 다른 글꼴로 그렸다가
 *    떠오르는 도중에 바꿔 그렸다. 글꼴마다 줄 높이가 달라 창 높이가 21px 달라지며
 *    가운데에 선 창이 10px 튀었다. 흐름의 글자(PRELOAD_TEXT)로 필요한 조각만 골라 받는다.
 *
 * 2. 홈의 나머지 조각. 홈은 Suspense 로 나뉘어 차례로 도착하고, 리액트는 조각을 드러낼
 *    때마다 화면 전환을 건다. 창이 그 한가운데에 열리면 전환이 찍어 둔 옛 모습이 창
 *    위로 잠깐 올라온다. 글이 다 도착하고(DOMContentLoaded) 돌던 전환이 끝나기를
 *    기다린다. 연 뒤에 시작되는 전환은 CSS 가 막는다(globals.css 의 관문 규칙).
 */
async function readyToOpen(el: HTMLDialogElement) {
  const fonts = document.fonts
    ?.load(`1em ${getComputedStyle(el).fontFamily}`, PRELOAD_TEXT)
    .catch(() => undefined);

  if (document.readyState === 'loading') {
    await new Promise<void>((resolve) =>
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
    );
  }
  await fonts;

  /*
   * 돌고 있는 전환과, 드러내려고 줄 서 있는 조각($RB — 리액트가 조각을 0.3초 간격으로
   * 모아 드러낸다)이 없어질 때까지. 끝나자마자 다음 것이 이어지면 그것도 기다린다.
   * 리액트 안쪽 이름이라 바뀌면 이 기다림만 빠지고, 연 뒤의 전환은 CSS 가 여전히 막는다.
   *
   * 오른쪽 위 메뉴도 제 손으로 전환을 건다(app-shell.tsx 의 AppNav — 그동안 <html> 에
   * data-nav-choreo 를 단다). 기다리는 사이 마우스가 메뉴에 닿아 그것이 돌고 있으면
   * 그것도 끝나기를 기다린다.
   */
  const doc = document as ReactViewTransitionDocument;
  const busy = () =>
    ((window as { $RB?: unknown[] }).$RB?.length ?? 0) > 0 ||
    document.documentElement.hasAttribute('data-nav-choreo');
  for (let i = 0; i < 40; i++) {
    const vt = doc.__reactViewTransition;
    if (vt) await vt.finished.catch(() => undefined);
    else if (busy()) await new Promise((resolve) => window.setTimeout(resolve, 50));
    else break;
  }
}

export function CheckinGate({
  checkedDays,
  flow,
}: {
  /** 체크인한 날들(YYYY-MM-DD). 서버와 사용자의 '오늘'이 다를 수 있어 며칠치를 받는다. */
  checkedDays: string[];
  /** 흐름의 둘레 — 닉네임 · 평소 컨디션 · 최근 체크인(오늘 것 채우기) · 연속 기록 날짜(components/checkin-flow/types.ts) */
  flow: CheckinFlowContext;
}) {
  const router = useRouter();
  /*
   * 오늘 날짜 — 앱을 다시 볼 때(다른 앱에 갔다 오거나 자정을 넘긴 뒤)마다 새로 본다.
   * 서버에서는 null: 사용자의 날짜를 알기 전에는 아무것도 띄우지 않는다.
   */
  const today = useTodayKey(null);
  const skippedDay = useSyncExternalStore(
    subscribeCheckinSkip,
    readCheckinSkip,
    () => null
  );

  /* 이 화면에서 방금 한 일 — 서버가 새 목록을 주기 전에도 바로 닫히게 */
  const [skippedHere, setSkippedHere] = useState<string | null>(null);
  /*
   * 흐름의 완료 화면이 끝난 날 — 서버의 새 목록(checkedDays)이 그 전에 안 오면 needed 가 그대로라 창이 단추 없는 완료 화면으로
   * 남았다(2026-10-16). 흐름이 끝났다고 하면 목록을 기다리지 않고 닫는다.
   */
  const [doneHere, setDoneHere] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  /*
   * 투구 · 타격 화면(그 종목 바 안의 트레이닝 · 암케어 · 메커니즘 포함, lib/nav.ts sportOf)에 들어갈 때만 묻는다(2026-10-21 김민:
   * "체크인을 투구, 타격에 들어갈 때 · 영양 빼고"). 예전엔 앱을 켜면 어디서든 떴다. 하루 한 번 · 건너뛰기 그대로.
   */
  const pathname = usePathname();
  /* 첫 설정 화면(투구 · 트레이닝)은 빼다 — 관문이 설정 화면을 나가게 하면 적던 답이 사라진다(2026-10-21 검토) */
  const inSport = sportOf(pathname, useSearchParams()) !== null && !isSetupPath(pathname);
  const needed =
    inSport &&
    today !== null &&
    !checkedDays.includes(today) &&
    skippedDay !== today &&
    skippedHere !== today &&
    doneHere !== today;
  /*
   * 방금 체크인했나 — 서버가 오늘이 든 새 목록을 준 그 순간에 안다. 그때 needed 가 false 가 되어 창이 닫히기 시작하면
   * 흐름의 완료 화면이 보이기도 전에 사라진다. '찾던 것이 목록에 들어왔다'를 여기서 보고 흐름이 onDone 으로 닫을 때까지 열어 둔다(showDone).
   * 건너뛴 경우는 목록에 오늘이 없으므로 걸리지 않는다. (그리는 도중 상태 보정)
   */
  const [wasNeeded, setWasNeeded] = useState(false);
  if (needed !== wasNeeded) {
    setWasNeeded(needed);
    if (wasNeeded && today !== null && checkedDays.includes(today)) setShowDone(true);
  }
  const open = needed || showDone;

  /*
   * 닫기는 흐름의 onDone 만 — 1.5초 타이머 · 완료 화면 탭 · '홈으로' 어느 길로든 finish 가 부른다. 예전의 2.2초 안전망은 가만히도
   * 아픈 날의 '던지지 말고 쉬어요' 카드(흐름이 붙들어 두는 화면)까지 읽기 전에 닫아 버렸다(2026-10-17). 종의 팝업(app-shell)도 안전망 없이 같다.
   */

  /* 관문이 통째로 사라지면(로그아웃 · 운동 화면) 표시도 뗀다 — 남으면 앱의 화면 전환이 계속 막힌다 */
  useEffect(() => () => document.documentElement.removeAttribute(GATE_UP), []);

  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    if (!open) {
      if (el.open) el.close();
      /* 가라앉는 움직임이 끝날 때까지 막아 둔다(GATE_UP) */
      if (!root.hasAttribute(GATE_UP)) return;
      const timer = window.setTimeout(() => root.removeAttribute(GATE_UP), CLOSE_MS);
      return () => window.clearTimeout(timer);
    }
    if (el.open) return;

    /*
     * 휴대폰(desk 가 아니면)은 창이 아니라 전체 화면 흐름으로 보낸다 — 시작 연출 · 투어가 끝난 뒤에.
     * 완료 화면이 끝나면 흐름이 홈으로 돌려보내고, 그때는 오늘이 목록에 들어 있어 다시 보내지 않는다.
     * 건너뛰면 그날은 안 보낸다(checkin-skip).
     */
    const mobile = !window.matchMedia(DESK_MEDIA).matches;
    let cancelled = false;
    afterSplash()
      .then(() =>
        mobile
          ? undefined
          : Promise.race([
              /* 무슨 일이 있어도 창은 떠야 한다 — 기다리다 실패하면 기다리지 않은 것으로 친다 */
              readyToOpen(el).catch(() => undefined),
              new Promise((resolve) => window.setTimeout(resolve, GATE_WAIT_MS)),
            ])
      )
      /* 처음 한 번 뜨는 기본 사용법 투어가 떠 있으면 그것이 끝난 뒤에 — 열기 직전에 본다(투어도 시작 연출 뒤에 뜬다) */
      .then(afterTour)
      .then(() => {
        if (cancelled) return;
        if (mobile) {
          /* 마치면 들어가려던 투구 · 타격 화면으로 돌아온다(흐름의 ?next=) */
          router.push(`/checkin?next=${encodeURIComponent(location.pathname + location.search)}`);
          return;
        }
        if (el.open) return;
        root.setAttribute(GATE_UP, '');
        el.showModal();
        /*
         * 첫 초점은 창 자체에 둔다.
         *
         * 창을 열면 브라우저가 안의 첫 '누를 수 있는 것'에 초점을 준다. 이 창은 화면을 열자마자(아직 아무것도 누르기 전에)
         * 뜨니 브라우저가 키보드로 옮긴 초점으로 보고 그 둘레에 흰 테두리를 그렸다. 창에 초점을 두면 테두리가 없다
         * (outline-none). 키보드로 쓰는 사람은 Tab 한 번에 첫 단추로 들어간다.
         */
        el.focus({ preventScroll: true });
      });
    return () => {
      cancelled = true;
    };
  }, [open, router]);

  const skip = () => {
    if (!today) return;
    setSkippedHere(today);
    writeCheckinSkip(today);
  };

  return (
    <dialog
      ref={ref}
      data-gate
      aria-label="오늘 체크인"
      /* 열릴 때 창 자체가 초점을 받는다(위 useLayoutEffect) — 그러려면 초점을 받을 수 있어야 한다 */
      tabIndex={-1}
      /*
       * Esc 로는 닫지 않는다. 체크인을 하든 건너뛰든 둘 중 하나를 고르게 한다.
       * 그래도 브라우저가 끝내 닫아 버리면(Esc 를 거듭 누르면 크롬은 닫는다)
       * 건너뛴 것으로 친다 — 안 그러면 닫힌 창을 다음 화면에서 또 연다.
       */
      onCancel={(e) => e.preventDefault()}
      onClose={() => {
        if (needed) skip();
      }}
      /*
       * PC 의 가운데 창(휴대폰은 여기 오지 않고 전체 화면으로 간다 — 그래도 globals.css 의 '휴대폰의 체크인 관문' 시트
       * 규칙은 남겨 둔다). 아이폰 앱은 시계 · 홈 막대 자리를 뺀다(components/modal.tsx 의 page 창과 같은 까닭).
       */
      className="mx-0 mt-auto mb-0 flex max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)] w-full max-w-none flex-col overflow-clip rounded-t-[28px] rounded-b-none border-0 bg-page p-0 text-ink shadow-2xl outline-none backdrop:bg-black/40 desk:m-auto desk:max-h-[min(92dvh,56rem,calc(100dvh-2*max(env(safe-area-inset-top),env(safe-area-inset-bottom))-1.5rem))] desk:w-[min(32rem,calc(100vw-1.5rem))] desk:max-w-[calc(100vw-1.5rem)] desk:rounded-2xl desk:border desk:border-line"
    >
      <div className="min-h-0 flex-auto p-4 desk:p-5">
        {/* 창이 열릴 때만 그린다 — 닫혀 있는 동안 흐름이 상태를 들고 있을 까닭이 없다 */}
        {open && (
          <CheckinFlow
            variant="popup"
            ctx={flow}
            onDone={() => {
              setDoneHere(today);
              setShowDone(false);
            }}
            onSkip={skip}
          />
        )}
      </div>
    </dialog>
  );
}
