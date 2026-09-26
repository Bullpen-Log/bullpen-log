'use client';

import { useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { Bell, CheckCircle2, ChevronRight, ClipboardList, Target } from 'lucide-react';
import { OPEN_POPUP_TYPES } from '@/lib/transition-types';

/**
 * 오른쪽 위 알림(종) — 오늘 아직 안 한 것을 알려 준다.
 *
 * 예전에는 홈 한가운데 '오늘 할 일' 상자 넷(체크인·투구·운동 일정·트레이닝 설정)이
 * 있었다. 홈에서만 보여서 다른 탭에 있으면 몰랐고, 다 끝낸 날에도 상자 넷이 홈의
 * 절반을 차지했다. 이제 어느 화면에서나 오른쪽 위 종이 알려 준다 — 할 일이 있으면
 * 종에 작은 점이 붙고, 누르면 밑에 작은 창이 떠서 무엇을 해야 하는지와 거기로 가는
 * 길을 보여 준다. 다 했으면 '알림이 없어요'.
 *
 * 할 일은 둘이다 — 오늘 체크인과 오늘 투구 기록. 운동 일정과 트레이닝 설정은 빼서
 * 트레이닝 탭과 설정 창에 맡겼다. 일정은 통증·기록 부족으로 앱이 만들지 않는 날이
 * 있어서, 종에 넣으면 할 수 없는 일로 점을 켜 두게 된다.
 *
 * 메뉴(격자)에 속하지 않는다. 메뉴는 '어디로 갈까'이고 이것은 '무엇이 남았나'라
 * 설정 왼쪽에 조금 작게 따로 선다.
 */

/**
 * 어느 화면에서든 오늘 체크인 창을 여는 신호. 창은 알림(종)이 쥐고 있어서
 * (components/app-shell.tsx 가 듣는다) 다른 화면은 이 신호만 보낸다.
 */
export const OPEN_CHECKIN_EVENT = 'bullpen:open-checkin';

/**
 * '오늘 체크인 고치기' 같은 글 속 단추 — 누르면 그 자리에서 체크인 창이 뜬다.
 *
 * 예전에는 '홈의 오늘 체크인'으로 가는 링크였다. 홈의 체크인 상자가 알림(종)으로
 * 옮겨 가면서 갈 곳이 없어졌고, 가서 다시 누르게 할 까닭도 없어 바로 연다.
 */
export function OpenCheckinButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={(e) =>
        window.dispatchEvent(new CustomEvent(OPEN_CHECKIN_EVENT, { detail: e.currentTarget }))
      }
      className={className}
    >
      {children}
    </button>
  );
}

/** 무엇이 남았나 — 체크인·투구 기록 */
export type NoticeState = {
  /** 오늘(YYYY-MM-DD, 한국 시각) */
  day: string;
  checkinDone: boolean;
  pitchDone: boolean;
};

export const pendingCount = (s: NoticeState) =>
  (s.checkinDone ? 0 : 1) + (s.pitchDone ? 0 : 1);

/**
 * 종 단추. 설정 톱니보다 한 단계 작다 — 메뉴 줄의 식구가 아니라 곁에 붙은 것이라.
 *
 * 할 일이 있으면 오른쪽 위에 작은 점. 빨강은 통증에만 쓰는 색이라(globals.css) 주의
 * 색(warn)을 쓴다.
 */
export function NoticeBellButton({
  state,
  open,
  onToggle,
  buttonRef,
  panelId,
  touch = false,
}: {
  state: NoticeState;
  open: boolean;
  onToggle: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
  panelId: string;
  /** 휴대폰 위 막대 — 누를 때 색이 바뀐다(마우스 올림이 없다) */
  touch?: boolean;
}) {
  const count = pendingCount(state);
  const idle = touch
    ? 'text-muted active:bg-surface-2 active:text-ink'
    : 'text-muted hover:bg-ink/6 hover:text-ink';

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onToggle}
      aria-haspopup="dialog"
      aria-expanded={open}
      /* 창이 열려 있을 때만 가리킨다 — 닫혀 있으면 그 이름의 창이 없다 */
      aria-controls={open ? panelId : undefined}
      aria-label={count > 0 ? `알림 — 오늘 할 일 ${count}개` : '알림'}
      className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-75 ${
        open ? 'bg-sky/15 text-sky' : idle
      }`}
    >
      <Bell
        aria-hidden
        className="h-[1.05rem] w-[1.05rem]"
        strokeWidth={open ? 2.4 : 1.9}
      />
      {count > 0 && (
        <span
          aria-hidden
          className="motion-safe:animate-fade-in absolute right-1 top-1 h-2 w-2 rounded-full bg-warn ring-2 ring-surface"
        />
      )}
    </button>
  );
}

/**
 * 종 밑에 뜨는 작은 창.
 *
 * 뒤를 흐리지 않고 불투명하게 둔다. PC 막대(shell-topnav)와 휴대폰 위 막대(shell-topbar)는
 * 화면을 옮길 때 이름표를 달고 따로 그려지는 조각이라, 그 안의 요소는 바깥을 흐릴 수 없다.
 */
export function NoticePanel({
  id,
  state,
  onCheckin,
  onRest,
  resting,
  restError,
  onNavigate,
  className,
}: {
  id: string;
  state: NoticeState;
  /** 체크인 창을 연다 — 누른 단추에서 창이 튀어나오게 그 단추를 준다 */
  onCheckin: (el: HTMLElement) => void;
  /**
   * '오늘 안 던졌어요'를 남긴다 — 남기는 일은 창 바깥(app-shell)이 쥔다. 창을 닫았다
   * 열거나 PC·휴대폰 틀이 바뀌어도 '남기는 중'을 잊지 않게. 남겼으면 true.
   */
  onRest: () => Promise<boolean>;
  resting: boolean;
  restError?: string;
  /** 다른 화면으로 간다 — 창을 닫는다 */
  onNavigate: () => void;
  /** 자리(PC·휴대폰마다 다르다) */
  className: string;
}) {
  const { day, checkinDone, pitchDone } = state;
  const allDone = checkinDone && pitchDone;
  const root = useRef<HTMLDivElement>(null);
  /* 남긴 뒤 화면 읽기 프로그램에 알리는 말 */
  const [said, setSaid] = useState('');

  /** 안 던진 날을 한 번에 남긴다 — 홈의 투구 상자에 있던 단추를 그대로 옮겼다 */
  const rest = async () => {
    setSaid('');
    if (!(await onRest())) return;
    setSaid('오늘은 안 던진 날로 남겼어요.');
    /*
     * 누른 단추는 곧 사라진다(할 일이 줄어서). 초점이 문서 맨 위로 떨어지지 않게
     * 창으로 옮긴다 — 키보드로 쓰던 사람이 그 자리에서 이어 간다.
     */
    root.current?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={root}
      id={id}
      role="dialog"
      aria-label="오늘 할 일"
      tabIndex={-1}
      className={`motion-safe:animate-fade-in z-50 origin-top-right rounded-2xl border border-line bg-surface p-3 text-ink shadow-lg outline-none ${className}`}
    >
      <p role="status" className="sr-only">
        {said}
      </p>
      <p className="px-1 text-[11px] font-semibold text-ink/65">{spokenDay(day)} · 오늘 할 일</p>

      {allDone ? (
        <div className="flex items-center gap-2.5 px-1 py-3">
          <CheckCircle2 aria-hidden className="h-5 w-5 shrink-0 text-ok" />
          <div>
            <p className="text-sm font-semibold text-ink">지금은 알림이 없어요</p>
            <p className="mt-0.5 text-xs text-muted">오늘 체크인과 투구 기록을 다 남겼어요.</p>
          </div>
        </div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {!checkinDone && (
            <li className="rounded-xl border border-line p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ClipboardList aria-hidden className="h-4 w-4 shrink-0 text-sky" />
                오늘 체크인을 아직 안 했어요
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                몇 초면 끝나요. 오늘 운동 추천과 리포트가 이걸로 맞춰져요.
              </p>
              <button
                type="button"
                onClick={(e) => onCheckin(e.currentTarget)}
                className="mt-2.5 inline-flex min-h-9 items-center gap-1 rounded-lg bg-sky px-3 text-xs font-semibold text-white transition-colors hover:bg-sky-strong"
              >
                체크인하기
                <ChevronRight aria-hidden className="h-3.5 w-3.5" />
              </button>
            </li>
          )}

          {!pitchDone && (
            <li className="rounded-xl border border-line p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Target aria-hidden className="h-4 w-4 shrink-0 text-sky" />
                오늘 투구 기록이 아직 없어요
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                남기지 않으면 안 던진 날로 봐요. 쉬었으면 한 번만 눌러 두세요.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Link
                  href={`/pitch-log/${day}`}
                  transitionTypes={OPEN_POPUP_TYPES}
                  onClick={onNavigate}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-sky px-3 text-xs font-semibold text-white transition-colors hover:bg-sky-strong"
                >
                  기록하기
                  <ChevronRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={rest}
                  disabled={resting}
                  className="inline-flex min-h-9 items-center rounded-lg border border-line-strong px-3 text-xs font-medium text-ink transition-colors hover:bg-surface-2 disabled:opacity-50"
                >
                  {resting ? '남기는 중…' : '오늘 안 던졌어요'}
                </button>
              </div>
              {restError && (
                <p role="alert" className="mt-2 text-xs text-danger">
                  {restError}
                </p>
              )}
            </li>
          )}
        </ul>
      )}

      {/*
        다 한 것도 여기서 고친다. 홈의 체크인 상자가 오늘 체크인을 고치는 유일한 곳이었다 —
        잘못 누른 '통증' 하나가 오늘 운동을 막으니, 고칠 길이 늘 있어야 한다.
      */}
      {(checkinDone || pitchDone) && (
        <div className="mt-2 flex flex-wrap gap-x-1 border-t border-line pt-2">
          {checkinDone && (
            <button
              type="button"
              onClick={(e) => onCheckin(e.currentTarget)}
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-ink/6 hover:text-ink"
            >
              체크인 고치기
            </button>
          )}
          {pitchDone && (
            <Link
              href={`/pitch-log/${day}`}
              transitionTypes={OPEN_POPUP_TYPES}
              onClick={onNavigate}
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-ink/6 hover:text-ink"
            >
              오늘 투구 기록 보기
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** '9월 26일 (토)' */
function spokenDay(day: string) {
  const d = new Date(`${day}T00:00:00.000Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}
