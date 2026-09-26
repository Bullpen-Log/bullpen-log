'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { CheckCircle2 } from 'lucide-react';
import { CheckinForm, type CheckinData } from '@/components/checkin-form';
import { useTodayKey } from '@/components/use-today-key';

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

/** 저장한 뒤 '체크인 완료'를 보여 주는 시간. 너무 짧으면 된 건지 모르고, 길면 기다리게 된다. */
const DONE_MS = 900;

export function CheckinGate({
  checkedDays,
  recent,
  parts,
}: {
  /** 체크인한 날들(YYYY-MM-DD). 서버와 사용자의 '오늘'이 다를 수 있어 며칠치를 받는다. */
  checkedDays: string[];
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
  const open = needed || showDone;

  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
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
    }
    if (!open && el.open) el.close();
  }, [open]);

  const skip = () => {
    if (!today) return;
    setSkippedHere(today);
    writeSkip(today);
  };

  /* 폼이 저장에 성공하면 — 잠깐 '완료'를 보여 준 뒤 닫는다 */
  const onSaved = useCallback((day: string) => {
    setSavedDay(day);
    setShowDone(true);
    window.setTimeout(() => setShowDone(false), DONE_MS);
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
      className="m-auto flex max-h-[min(92dvh,56rem)] w-[min(40rem,calc(100vw-1.5rem))] flex-col overflow-clip rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl outline-none backdrop:bg-shade/60"
    >
      <div className="shrink-0 border-b border-line px-5 py-4">
        {today && (
          <p className="text-[11px] font-semibold text-sky">{spokenDay(today)}</p>
        )}
        <h2 id="checkin-gate-title" className="mt-0.5 text-lg font-bold text-ink">
          오늘 몸 상태부터 남겨주세요
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          체크인을 해야 오늘에 맞춘 운동 추천과 리포트가 나옵니다. 간편 체크인은 몇 초면
          끝나고, 더 적고 싶으면 상세 체크인으로 바꾸면 됩니다.
        </p>
      </div>

      {/*
        relative 가 꼭 있어야 한다. 칩 속에 숨긴 라디오(sr-only)는 위치를 잡는 기준이
        가장 가까운 '자리 잡힌' 조상인데, 이것이 없으면 그 기준이 창 전체가 된다. 그러면
        아래쪽 라디오들이 창의 스크롤 길이를 늘리고, 초점이 거기로 가는 순간 창
        전체가 위로 밀려 올라가 제목이 화면 밖으로 사라진다(실제로 400px 넘게 밀렸다).
      */}
      <div className="no-scrollbar relative min-h-0 flex-auto overflow-y-auto px-5 py-5">
        {showDone ? (
          <div className="motion-safe:animate-fade-in flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 aria-hidden className="h-10 w-10 text-ok" />
            <p className="text-base font-bold text-ink">체크인 완료</p>
            <p className="text-xs text-muted">
              오늘 기록에 맞춰 준비할게요. 오른쪽 위 알림(종)에서 언제든 고치거나 더
              적을 수 있어요.
            </p>
          </div>
        ) : (
          /* 창이 열릴 때만 그린다 — 닫혀 있는 동안 폼이 상태를 들고 있을 까닭이 없다 */
          open && <CheckinForm recent={recent} parts={parts} onSaved={onSaved} />
        )}
      </div>

      {!showDone && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line px-5 py-3">
          <p className="text-[11px] text-muted">
            건너뛰면 다음에 접속할 때 다시 묻습니다.
          </p>
          <button
            type="button"
            onClick={skip}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            오늘은 건너뛰기
          </button>
        </div>
      )}
    </dialog>
  );
}
