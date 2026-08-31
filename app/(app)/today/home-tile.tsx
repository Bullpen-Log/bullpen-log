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

/**
 * 상자 안에 넣는 작은 막대 그림.
 *
 * 글만 두세 줄 있으면 상자가 헐렁해 보인다. 넓은 화면에서 특히 그렇다.
 * 크기를 키워 봐야 안쪽 여백만 늘어나므로, 볼 값어치가 있는 것으로 채운다 —
 * 최근 며칠이 어땠는지는 숫자 한 줄보다 막대가 빨리 읽힌다.
 */
export function MiniBars({
  bars,
  label,
  max,
}: {
  /** 왼쪽이 오래된 날. 값이 0이면 빈 칸으로 둔다. */
  bars: { key: string; value: number; title: string }[];
  label: string;
  /**
   * 막대 높이의 기준. 안 주면 그중 가장 큰 값에 맞춘다.
   *
   * 투구수처럼 위가 열려 있는 값은 가장 큰 날을 꽉 채우는 게 맞다. 반대로
   * 컨디션(1~10)처럼 상한이 정해진 값은 10을 기준으로 그려야 한다 — 매일 5인
   * 사람도 막대가 꽉 차면 "괜찮다"로 잘못 읽힌다.
   */
  max?: number;
}) {
  const peak = max ?? Math.max(...bars.map((b) => b.value), 1);
  /*
   * 이레 내내 0인 경우.
   *
   * 지우지는 않는다 — '한 주 내내 안 했다'도 읽을 값어치가 있다. 다만 높이까지
   * 그대로 두면 56px 짜리 빈 띠 아래에 실선 몇 개만 남아, 뭔가 깨진 것처럼 보인다.
   */
  const empty = bars.every((b) => b.value === 0);

  return (
    <span className="mt-3 block">
      {/*
        바닥선을 하나 깔아 둔다. 없으면 막대가 허공에 떠 있는 네모 몇 개로 보였다.
        오늘(맨 오른쪽)은 진하게 — 어제까지의 흐름과 지금을 가르는 선이다.
      */}
      <span
        className={`flex items-end gap-1 border-b border-line ${empty ? 'h-5' : 'h-14'}`}
        aria-hidden
      >
        {bars.map((b, i) => {
          const isToday = i === bars.length - 1;
          return (
            <span
              key={b.key}
              title={b.title}
              className="flex h-full flex-1 flex-col justify-end"
            >
              {b.value > 0 ? (
                <span
                  className={`block rounded-t-[3px] bg-gradient-to-t ${
                    isToday ? 'from-sky/60 to-sky' : 'from-sky/25 to-sky/60'
                  }`}
                  style={{ height: `${Math.max(12, (b.value / peak) * 100)}%` }}
                />
              ) : (
                <span className="block h-[2px] rounded-full bg-line-strong/50" />
              )}
            </span>
          );
        })}
      </span>
      <span className="mt-2 block text-[10px] text-muted/70">{label}</span>
    </span>
  );
}

/**
 * 아이콘 배경색.
 *
 * 라이브러리 카테고리와 같은 토큰(--color-cat-*)을 쓴다. 색이 서로 다르면
 * 상자 넷을 훑을 때 제목을 읽기 전에 어느 것인지 알아본다. 넓은 면이 아니라
 * 44px 짜리 사각형에만 칠하므로 화면이 알록달록해지지는 않는다.
 *
 * 표로 적어 두는 이유 — Tailwind 는 소스에 그대로 적힌 클래스만 찾아 넣는다.
 */
export type TileTone = 'mobility' | 'core' | 'power' | 'recovery' | 'armcare';

const TONE_CLASS: Record<TileTone, string> = {
  mobility: 'bg-cat-mobility/10 text-cat-mobility',
  core: 'bg-cat-core/10 text-cat-core',
  power: 'bg-cat-power/10 text-cat-power',
  recovery: 'bg-cat-recovery/10 text-cat-recovery',
  armcare: 'bg-cat-armcare/10 text-cat-armcare',
};

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
  tone,
  title,
  state,
  badge,
  lines,
  extra,
  action,
  asLink,
}: {
  icon: ReactNode;
  tone?: TileTone;
  title: string;
  state: TileState;
  /** 오른쪽 위 표시 — '완료', '통증' 같은 짧은 말 */
  badge: string;
  /** 상자 안에 적는 지금 상태. 두세 줄이 알맞다. */
  lines: string[];
  /** 글 아래에 붙는 작은 그림. 없으면 안 그린다. */
  extra?: ReactNode;
  /** 아래에 적는 할 일 — '체크인하기', '고치기' */
  action: string;
  asLink: boolean;
}) {
  const style = STATE_STYLE[state];

  return (
    <>
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
            tone ? TONE_CLASS[tone] : 'border border-line-strong text-sky'
          }`}
        >
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
      <ul className="mt-3 space-y-1">
        {lines.map((line) => (
          <li key={line} className="text-[13px] leading-relaxed text-muted">
            {line}
          </li>
        ))}
      </ul>

      <span className="flex-1">{extra}</span>

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
  'flex min-h-[13rem] w-full flex-col rounded-2xl border bg-surface px-5 py-5 text-left transition-colors';

/** 누르면 창이 뜨는 상자. */
export function HomeTile({
  icon,
  tone,
  title,
  state,
  badge,
  lines,
  extra,
  action,
  modalTitle,
  modalDescription,
  children,
}: {
  icon: ReactNode;
  tone?: TileTone;
  title: string;
  state: TileState;
  badge: string;
  lines: string[];
  extra?: ReactNode;
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
          tone={tone}
          title={title}
          state={state}
          badge={badge}
          lines={lines}
          extra={extra}
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
  tone,
  title,
  state,
  badge,
  lines,
  extra,
  action,
}: {
  href: string;
  icon: ReactNode;
  tone?: TileTone;
  title: string;
  state: TileState;
  badge: string;
  lines: string[];
  extra?: ReactNode;
  action: string;
}) {
  return (
    <Link href={href} className={`${BOX_BASE} ${STATE_STYLE[state].box}`}>
      <TileFace
        icon={icon}
        tone={tone}
        title={title}
        state={state}
        badge={badge}
        lines={lines}
        extra={extra}
        action={action}
        asLink
      />
    </Link>
  );
}
