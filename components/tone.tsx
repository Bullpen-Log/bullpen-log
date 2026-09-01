import type { ReactNode } from 'react';

/**
 * 상태를 나타내는 색과 칩.
 *
 * 분석 화면에만 있던 것을 옮겨왔다. 홈에도 부하 상태를 보여주게 되면서 두 화면이
 * 같은 색을 써야 했는데, 한쪽에만 두면 다른 쪽이 비슷한 색을 새로 만들게 된다.
 * 같은 뜻(적정·주의·위험)에 다른 색이 붙으면 그때부터 색이 뜻을 잃는다.
 */

export type Tone = 'good' | 'info' | 'warn' | 'bad' | 'neutral';

/**
 * 상태별 색. 문자열을 그대로 써야 Tailwind가 클래스를 찾아낸다.
 *
 * dot 과 fill 을 나눠 둔 이유: dot 은 배경색(bg-*)이라 <span> 에는 되지만
 * SVG 도형에는 아무 일도 안 일어난다. 그림에 색을 넣으려면 fill-* 이 필요하다.
 * 실제로 흐름 그래프의 끝점에 dot 을 줬다가 새까맣게 나왔다.
 *
 * 글자는 테마 토큰(ok·warn·danger·sky-strong)을 쓴다 — 라이트에서는
 * 진하게, 다크에서는 밝게 뒤집혀 두 모드 모두에서 읽힌다.
 * 점은 같은 토큰의 채움색, 반투명 워시(chip 배경·bar)는 두 모드에서
 * 모두 무난해 원색을 그대로 둔다.
 */
export const TONE: Record<
  Tone,
  { text: string; dot: string; fill: string; chip: string; bar: string }
> = {
  good: {
    text: 'text-ok',
    dot: 'bg-ok',
    fill: 'fill-ok',
    chip: 'border-emerald-500/30 bg-emerald-500/10 text-ok',
    bar: 'bg-emerald-500/70',
  },
  info: {
    text: 'text-sky-strong',
    dot: 'bg-sky',
    fill: 'fill-sky',
    chip: 'border-sky-500/30 bg-sky-500/10 text-sky-strong',
    bar: 'bg-sky-500/70',
  },
  warn: {
    text: 'text-warn',
    dot: 'bg-warn',
    fill: 'fill-warn',
    chip: 'border-amber-500/30 bg-amber-500/10 text-warn',
    bar: 'bg-amber-500/70',
  },
  bad: {
    text: 'text-danger',
    dot: 'bg-danger',
    fill: 'fill-danger',
    chip: 'border-red-500/40 bg-red-500/10 text-danger',
    bar: 'bg-red-500/70',
  },
  neutral: {
    text: 'text-muted',
    dot: 'bg-line-strong',
    fill: 'fill-line-strong',
    chip: 'border-line-strong bg-surface-2 text-muted',
    bar: 'bg-line-strong',
  },
};

export function StatusChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${TONE[tone].chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${TONE[tone].dot}`} />
      {children}
    </span>
  );
}
