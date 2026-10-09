'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Check } from 'lucide-react';
import { CheckinForm, type CheckinData } from '@/components/checkin-form';
import { SPLASH_ATTR, SPLASH_END_EVENT } from '@/components/app-splash';
import { TOUR_ATTR, TOUR_END_EVENT } from '@/components/tutorial/tour-gate';
import { useTodayKey } from '@/components/use-today-key';
import { buzz } from '@/lib/haptics';

/**
 * 체크인 관문 — 그날 체크인을 안 했으면 앱에 들어오자마자 먼저 뜬다.
 *
 * 체크인은 이 앱이 오늘에 맞춘 운동을 고르고 리포트를 쓰는 재료다. 안 하면 추천도
 * 기록도 어제 기준으로 멈춰 있다. 그래서 홈 구석의 상자로 두지 않고, 그날 처음
 * 들어올 때 앞을 막고 묻는다.
 *
 * 다만 막아 두기만 하면 급한 날 앱을 못 쓴다. '오늘은 건너뛰기'를 둔다. 건너뛰면
 * 이번 접속 동안만 안 묻고, 다음에 접속하면 다시 묻는다 — 건너뛴 것을 하루 종일
 * 기억하면 한 번 건너뛴 날은 끝내 체크인을 안 하게 된다.
 *
 *   이번 접속 = 이 탭(앱)이 열려 있는 동안. sessionStorage 에 적어 두므로 새로 고침은
 *   같은 접속으로 치고, 탭을 닫았다 다시 열거나 앱을 새로 켜면 새 접속이다.
 *
 * 건너뛰어도 체크인은 아직 안 한 것이다. 오른쪽 위 알림(종)에 남아 있고, 거기서
 * 언제든 하거나 고치고 상세를 더 적는다(components/notice-bell.tsx).
 *
 * 모든 화면의 틀((app)/layout.tsx)에 들어 있어서, 어느 화면으로 들어오든 뜬다.
 */

const SKIP_KEY = 'bullpen-checkin-skip';

/* 건너뛴 날 — 이번 접속 동안만 기억한다 */
const skipListeners = new Set<() => void>();
function subscribeSkip(onChange: () => void) {
  skipListeners.add(onChange);
  return () => {
    skipListeners.delete(onChange);
  };
}
function readSkip(): string | null {
  try {
    return sessionStorage.getItem(SKIP_KEY);
  } catch {
    return null;
  }
}
function writeSkip(day: string) {
  try {
    sessionStorage.setItem(SKIP_KEY, day);
  } catch {
    /* 저장을 못 해도 이번 화면에서는 닫힌다 — 아래 skippedHere 가 들고 있다 */
  }
  skipListeners.forEach((fn) => fn());
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** '9월 24일 (목)' */
function spokenDay(day: string) {
  const d = new Date(`${day}T00:00:00.000Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

/**
 * 저장한 뒤 '체크인 완료'를 보여 주는 시간. 너무 짧으면 된 건지 모르고, 길면 기다리게 된다.
 * 링이 그려지고(0.7초) 체크가 뜬 뒤 'N일 연속'을 읽을 틈까지 — 예전 0.9초는 축하 없이 글만 있을 때 값이다.
 */
const DONE_MS = 1800;

/** 'N일 연속' — 오늘부터 하루씩 거슬러 체크인이 이어진 날 수 */
function streakOf(days: readonly string[], today: string) {
  const have = new Set(days);
  const d = new Date(`${today}T00:00:00.000Z`);
  let n = 0;
  while (have.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}

/** 오늘까지 이레 — 완료 화면의 점 일곱(오늘이 맨 오른쪽) */
function lastWeek(today: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${today}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - (6 - i));
    return { key: d.toISOString().slice(0, 10), weekday: WEEKDAYS[d.getUTCDay()] };
  });
}

/*
 * 저장한 뒤 창에 뜨는 말. 창을 열기 전에 이 글자의 글꼴 조각도 같이 받아 둔다 —
 * 안 그러면 '체크인 완료'가 뜨는 순간 다른 글꼴로 한 번 그려졌다 바뀐다.
 */
const DONE_TITLE = '체크인 완료';
const DONE_BODY =
  '오늘 기록에 맞춰 준비할게요. 오른쪽 위 알림(종)에서 언제든 고치거나 더 적을 수 있어요.';
/** 연속 기록 줄 · 요일 점의 글자 — 글꼴 조각을 미리 받아 둔다(DONE_TITLE 과 같은 까닭) */
const DONE_STREAK = '0123456789일 연속이에요 월화수목금토';

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
 *    가운데에 선 창이 10px 튀었다. 닫힌 창 안에도 글자는 그려져 있으므로(폼은 open 이면
 *    그린다) 그 글자로 필요한 조각만 골라 받는다. 입력칸의 안내 글과 저장 뒤의 말도 넣는다.
 *
 * 2. 홈의 나머지 조각. 홈은 Suspense 로 나뉘어 차례로 도착하고, 리액트는 조각을 드러낼
 *    때마다 화면 전환을 건다. 창이 그 한가운데에 열리면 전환이 찍어 둔 옛 모습이 창
 *    위로 잠깐 올라온다. 글이 다 도착하고(DOMContentLoaded) 돌던 전환이 끝나기를
 *    기다린다. 연 뒤에 시작되는 전환은 CSS 가 막는다(globals.css 의 관문 규칙).
 */
async function readyToOpen(el: HTMLDialogElement) {
  const text = [
    el.textContent ?? '',
    ...Array.from(el.querySelectorAll('[placeholder]'), (n) =>
      n.getAttribute('placeholder')
    ),
    DONE_TITLE,
    DONE_BODY,
    DONE_STREAK,
  ].join('');
  const fonts = document.fonts
    ?.load(`1em ${getComputedStyle(el).fontFamily}`, text)
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
  streakDays,
  recent,
  parts,
}: {
  /** 체크인한 날들(YYYY-MM-DD). 서버와 사용자의 '오늘'이 다를 수 있어 며칠치를 받는다. */
  checkedDays: string[];
  /** 두 달치 체크인한 날 — 완료 화면의 'N일 연속' · 이레 점(날짜만) */
  streakDays: string[];
  /** 최근 체크인 — 폼이 오늘 것을 찾아 채울 때 쓴다 */
  recent: CheckinData[];
  /** 상세 체크인에서 고를 수 있는 운동 부위 */
  parts: string[];
}) {
  /*
   * 오늘 날짜 — 앱을 다시 볼 때(다른 앱에 갔다 오거나 자정을 넘긴 뒤)마다 새로 본다.
   * 서버에서는 null: 사용자의 날짜를 알기 전에는 아무것도 띄우지 않는다.
   */
  const today = useTodayKey(null);
  const skippedDay = useSyncExternalStore(subscribeSkip, readSkip, () => null);

  /* 이 화면에서 방금 한 일 — 서버가 새 목록을 주기 전에도 바로 닫히게 */
  const [savedDay, setSavedDay] = useState<string | null>(null);
  const [skippedHere, setSkippedHere] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const needed =
    today !== null &&
    !checkedDays.includes(today) &&
    skippedDay !== today &&
    skippedHere !== today &&
    savedDay !== today;
  /*
   * 방금 체크인했나 — 서버가 오늘이 든 새 목록을 준 그 순간에 안다.
   *
   * 예전에는 폼이 저장 성공을 알려 줄 때(onSaved) '체크인 완료'를 띄웠다. 그런데 저장
   * 결과와 새 목록(checkedDays)은 한 번에 도착한다. 그 순간 needed 가 false 가 되어
   * 창이 닫히기 시작하고 폼이 먼저 사라져서, 폼은 끝내 알려 주지 못했다 — '체크인 완료'
   * 대신 빈 창이 줄어들며 닫혔다. 이제 '찾던 것이 목록에 들어왔다'를 여기서 직접 보고,
   * 닫히기 전에(같은 그림 안에서) 완료 화면으로 바꾼다. 건너뛴 경우는 목록에 오늘이
   * 없으므로 걸리지 않는다. (그리는 도중 상태 보정 — 폼과 같은 방식)
   */
  const [wasNeeded, setWasNeeded] = useState(false);
  if (needed !== wasNeeded) {
    setWasNeeded(needed);
    if (wasNeeded && today !== null && checkedDays.includes(today)) setShowDone(true);
  }
  const open = needed || showDone;

  /*
   * 완료 화면은 잠깐만 — 보여 준 뒤 닫는다. 체크가 뜨는 순간(링이 다 그려질 때) 손에 두 번 떤다
   * (2026-10-01 '애플처럼 감성있게' — 예전에는 초록 체크 아이콘과 글만 0.9초).
   */
  useEffect(() => {
    if (!showDone) return;
    const pop = window.setTimeout(() => buzz([15, 120, 15]), 550);
    const timer = window.setTimeout(() => setShowDone(false), DONE_MS);
    return () => {
      window.clearTimeout(pop);
      window.clearTimeout(timer);
    };
  }, [showDone]);

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
     * 곧바로 열지 않고, 뒤 화면이 자리를 잡고 글꼴이 온 뒤에 연다(readyToOpen).
     * 처음 접속한 날 창이 뜨며 화면이 깜빡이던 두 까닭이 거기 적혀 있다.
     */
    let cancelled = false;
    /* 시작 연출(components/app-splash.tsx)이 도는 중이면 그것이 걷힌 뒤에 — 창은 맨 위 칸(top layer)이라 연출을 덮는다 */
    const afterSplash = document.documentElement.hasAttribute(SPLASH_ATTR)
      ? new Promise<void>((resolve) => {
          const done = () => {
            window.removeEventListener(SPLASH_END_EVENT, done);
            resolve();
          };
          window.addEventListener(SPLASH_END_EVENT, done);
          window.setTimeout(done, SPLASH_WAIT_MS);
        })
      : Promise.resolve();
    afterSplash
      .then(() =>
        Promise.race([
          /* 무슨 일이 있어도 창은 떠야 한다 — 기다리다 실패하면 기다리지 않은 것으로 친다 */
          readyToOpen(el).catch(() => undefined),
          new Promise((resolve) => window.setTimeout(resolve, GATE_WAIT_MS)),
        ])
      )
      /* 처음 한 번 뜨는 기본 사용법 투어가 떠 있으면 그것이 끝난 뒤에 — 열기 직전에 본다(투어도 시작 연출 뒤에 뜬다) */
      .then(afterTour)
      .then(() => {
        if (cancelled || el.open) return;
        root.setAttribute(GATE_UP, '');
        el.showModal();
        /*
         * 첫 초점은 창 자체에 둔다.
         *
         * 창을 열면 브라우저가 안의 첫 '누를 수 있는 것'에 초점을 준다. 여기서는 그것이
         * 굴러가는 본문 칸이었는데, 이 창은 화면을 열자마자(아직 아무것도 누르기 전에)
         * 뜨니 브라우저가 키보드로 옮긴 초점으로 보고 본문 둘레에 흰 테두리를 그렸다.
         * 무엇이든 누르면 사라졌지만 처음부터 떠 있으면 고장 난 것처럼 보인다.
         *
         * 창에 초점을 두면 테두리가 없다(outline-none). 키보드로 쓰는 사람은 Tab 한 번에
         * 첫 칸으로 들어간다.
         */
        el.focus({ preventScroll: true });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const skip = () => {
    if (!today) return;
    setSkippedHere(today);
    writeSkip(today);
  };

  /*
   * 폼이 저장에 성공하면 — 잠깐 '완료'를 보여 준 뒤 닫는다(위 효과가 DONE_MS 뒤에 닫는다).
   * 폼이 살아서 알려 줄 때를 위해 둔다. 보통은 위의 '목록에 들어왔다'가 먼저 알아챈다.
   */
  const onSaved = useCallback((day: string) => {
    setSavedDay(day);
    setShowDone(true);
  }, []);

  return (
    <dialog
      ref={ref}
      data-gate
      aria-labelledby="checkin-gate-title"
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
       * 휴대폰: 화면 바닥에 붙은 시트(폭 전체 · 위 모서리만 둥글게 · 시계 자리 밑 12px 까지, globals.css 의
       * '휴대폰의 체크인 관문'). PC: 가운데 창 그대로 — 아이폰 앱은 시계 · 홈 막대 자리를 뺀다
       * (components/modal.tsx 의 page 창과 같은 까닭).
       */
      className="mx-0 mt-auto mb-0 flex max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)] w-full max-w-none flex-col overflow-clip rounded-t-[28px] rounded-b-none border-0 bg-surface p-0 text-ink shadow-2xl outline-none backdrop:bg-black/40 desk:m-auto desk:max-h-[min(92dvh,56rem,calc(100dvh-2*max(env(safe-area-inset-top),env(safe-area-inset-bottom))-1.5rem))] desk:w-[min(40rem,calc(100vw-1.5rem))] desk:max-w-[calc(100vw-1.5rem)] desk:rounded-2xl desk:border desk:border-line"
    >
      <div className="shrink-0 px-5 pt-6 pb-1 desk:border-b desk:border-line desk:py-4">
        {today && (
          <p className="text-[11px] font-semibold text-sky">{spokenDay(today)}</p>
        )}
        <h2
          id="checkin-gate-title"
          className="mt-0.5 text-xl font-bold text-ink desk:text-lg"
        >
          오늘 몸 상태부터 남겨주세요
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          체크인을 하면 오늘에 맞춘 운동과 리포트가 나와요. 몇 초면 끝나요.
        </p>
      </div>

      {/*
        relative 가 꼭 있어야 한다. 칩 속에 숨긴 라디오(sr-only)는 위치를 잡는 기준이
        가장 가까운 '자리 잡힌' 조상인데, 이것이 없으면 그 기준이 창 전체가 된다. 그러면
        아래쪽 라디오들이 창의 스크롤 길이를 늘리고, 초점이 거기로 가는 순간 창
        전체가 위로 밀려 올라가 제목이 화면 밖으로 사라진다(실제로 400px 넘게 밀렸다).
        overscroll-contain — 끝까지 굴린 뒤 더 밀어도 뒤 화면이 따라 굴러가지 않게(2026-10-03 아이폰 점검).
      */}
      <div className="no-scrollbar relative min-h-0 flex-auto overflow-y-auto overscroll-contain px-5 pt-4 pb-5 desk:py-5">
        {showDone ? (
          <CheckinDone today={today} days={[...streakDays, ...checkedDays]} />
        ) : (
          /* 창이 열릴 때만 그린다 — 닫혀 있는 동안 폼이 상태를 들고 있을 까닭이 없다 */
          open && <CheckinForm recent={recent} parts={parts} onSaved={onSaved} />
        )}
      </div>

      {!showDone && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] desk:border-t desk:border-line desk:py-3">
          <p className="text-[11px] text-muted">건너뛰면 다음에 열 때 다시 물어요.</p>
          <button
            type="button"
            onClick={skip}
            className="-mr-2 min-h-10 rounded-full px-3 text-sm font-semibold text-sky transition-colors desk:mr-0 desk:min-h-0 desk:rounded-lg desk:px-2.5 desk:py-1.5 desk:text-xs desk:font-medium desk:text-muted desk:hover:bg-surface-2 desk:hover:text-ink"
          >
            오늘은 건너뛰기
          </button>
        </div>
      )}
    </dialog>
  );
}

/**
 * 체크인을 마친 순간 — 링이 한 바퀴 그려지고 체크가 톡 뜬다(운동 끝 화면과 같은 움직임, globals.css 'done-ring').
 * 밑에 'N일 연속'과 지난 이레의 점(한 날은 파랑, 오늘이 맨 오른쪽). 연속이 하루뿐이면 줄은 빼고 점만 —
 * '1일 연속'은 축하가 아니다. 아이폰 피트니스의 주간 점처럼(2026-10-01 '감성').
 */
function CheckinDone({ today, days }: { today: string | null; days: string[] }) {
  const streak = today ? streakOf(days, today) : 0;
  const have = new Set(days);
  return (
    <div className="motion-safe:animate-fade-in flex flex-col items-center py-8 text-center">
      <div className="relative h-20 w-20">
        <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            strokeWidth="7"
            className="stroke-sky/15"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            className="done-ring stroke-sky"
          />
        </svg>
        <span
          aria-hidden
          className="finish-pop done-check absolute inset-2.5 grid place-items-center rounded-full bg-sky text-white"
        >
          <Check className="h-8 w-8" strokeWidth={3} />
        </span>
      </div>
      <p className="mt-4 text-lg font-bold text-ink">{DONE_TITLE}</p>
      {streak >= 2 && (
        <p className="rise-in mt-0.5 text-sm font-semibold text-sky [--rise-delay:600ms]">
          {streak}일 연속이에요
        </p>
      )}
      {today && (
        <ol
          aria-label="지난 이레 체크인"
          className="rise-in mt-4 flex gap-2.5 [--rise-delay:700ms]"
        >
          {lastWeek(today).map((d) => (
            <li key={d.key} className="flex flex-col items-center gap-1">
              <span
                aria-label={`${d.weekday}요일 ${have.has(d.key) ? '함' : '안 함'}`}
                className={`h-2.5 w-2.5 rounded-full ${have.has(d.key) ? 'bg-sky' : 'bg-ink/15'}`}
              />
              <span
                className={`text-[11px] ${d.key === today ? 'font-bold text-ink' : 'text-muted'}`}
              >
                {d.weekday}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 max-w-xs break-keep text-xs leading-relaxed text-muted">
        {DONE_BODY}
      </p>
    </div>
  );
}
