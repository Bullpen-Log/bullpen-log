'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, ChevronRight, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/modal';

/**
 * 홈에 놓이는 큰 상자 하나.
 *
 * 처음에는 접었다 펴는 방식이었는데, 넷을 다 접어두면 제목 네 줄만 남아 화면이
 * 텅 비어 보였다. 그렇다고 펴 두면 예전처럼 한없이 길어진다.
 *
 * 그래서 상자는 크게 두고, 안에 지금 상태를 두세 줄 적는다. 누르면 창이 뜨고
 * 거기서 실제로 입력한다. 화면을 열었을 때 오늘이 어떤 상태인지 네 상자만
 * 훑으면 알 수 있고, 손댈 것이 있을 때만 창을 연다.
 */

export type TileState = 'done' | 'todo' | 'warn';

const STATE_STYLE: Record<TileState, { chip: string; box: string }> = {
  done: {
    chip: 'border-sky-soft/60 bg-sky/10 text-sky-strong',
    box: 'border-line hover:border-sky-soft',
  },
  todo: {
    chip: 'border-line-strong bg-surface-2 text-muted',
    box: 'border-line hover:border-sky-soft',
  },
  warn: {
    chip: 'border-danger-line bg-danger-bg text-danger',
    box: 'border-danger-line hover:border-danger-line',
  },
};

function TileFace({
  icon,
  title,
  state,
  badge,
  lines,
  action,
  asLink,
}: {
  icon: ReactNode;
  title: string;
  state: TileState;
  /** 오른쪽 위 표시 — '완료', '통증' 같은 짧은 말 */
  badge: string;
  /** 상자 안에 적는 지금 상태. 두세 줄이 알맞다. */
  lines: string[];
  /** 아래에 적는 할 일 — '체크인하기', '고치기' */
  action: string;
  asLink: boolean;
}) {
  const style = STATE_STYLE[state];

  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line-strong text-sky">
          {icon}
        </span>
        <span className="min-w-0 flex-1 text-[15px] font-bold text-ink">{title}</span>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${style.chip}`}
        >
          {state === 'done' && <Check className="h-3 w-3" strokeWidth={3} />}
          {state === 'warn' && <AlertTriangle className="h-3 w-3" />}
          {badge}
        </span>
      </div>

      {/* 지금 상태 — 창을 열지 않고도 읽을 수 있어야 한다 */}
      <ul className="mt-3 flex-1 space-y-1">
        {lines.map((line) => (
          <li key={line} className="text-[13px] leading-relaxed text-muted">
            {line}
          </li>
        ))}
      </ul>

      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky">
        {action}
        {asLink ? (
          <ArrowRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </span>
    </>
  );
}

const BOX_BASE =
  'flex min-h-[10.5rem] w-full flex-col rounded-2xl border bg-surface px-5 py-4 text-left transition-colors';

/** 누르면 창이 뜨는 상자. */
export function HomeTile({
  icon,
  title,
  state,
  badge,
  lines,
  action,
  modalTitle,
  modalDescription,
  children,
}: {
  icon: ReactNode;
  title: string;
  state: TileState;
  badge: string;
  lines: string[];
  action: string;
  /** 창 제목. 안 주면 상자 제목을 그대로 쓴다. */
  modalTitle?: string;
  modalDescription?: string;
  /** 창 안에 들어갈 내용 */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${BOX_BASE} ${STATE_STYLE[state].box}`}
      >
        <TileFace
          icon={icon}
          title={title}
          state={state}
          badge={badge}
          lines={lines}
          action={action}
          asLink={false}
        />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={modalTitle ?? title}
        description={modalDescription}
      >
        {children}
      </Modal>
    </>
  );
}

/**
 * 누르면 다른 화면으로 가는 상자.
 *
 * 운동 일정을 이미 만든 날에 쓴다. 그때 할 일은 '운동하기'인데, 창을 한 번
 * 거쳐서 다시 버튼을 누르게 하면 한 번 더 눌러야 할 이유가 없다.
 */
export function HomeTileLink({
  href,
  icon,
  title,
  state,
  badge,
  lines,
  action,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  state: TileState;
  badge: string;
  lines: string[];
  action: string;
}) {
  return (
    <Link href={href} className={`${BOX_BASE} ${STATE_STYLE[state].box}`}>
      <TileFace
        icon={icon}
        title={title}
        state={state}
        badge={badge}
        lines={lines}
        action={action}
        asLink
      />
    </Link>
  );
}
