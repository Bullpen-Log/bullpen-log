import Link from 'next/link';
import { Activity, Dumbbell, FileText } from 'lucide-react';

/**
 * 분석 화면의 세 칸.
 *
 * 예전에는 투구·트레이닝·리포트가 한 화면에 이어 붙어 있었다. 운동 얘기를
 * 보려면 투구 그래프를 지나쳐야 했고, 투구 추이를 보려면 부위별 세트를
 * 넘겨야 했다. 주제가 다른 것을 세로로 쌓아둔 셈이다.
 *
 * 주소로 나눈다(?view=training). 트레이닝의 '오늘 | 기록', 라이브러리의 두
 * 칸과 같은 방식이다 — 같은 앱 안에서 나누는 방법이 여러 가지일 이유가 없다.
 * 주소로 나누면 보는 쪽만 그려 내려보낸다.
 *
 * 부하 지수도 칸 안으로 들어간다. 처음에는 둘을 이 줄 위에 남겨 나란히 보게
 * 했는데, 칸을 골라 들어왔더니 그 위에 다른 칸 숫자가 같이 있는 것이 오히려
 * 어수선했다. 투구 지수는 투구 칸, 운동 지수는 트레이닝 칸이 크게 보여준다.
 */
export type CoachView = 'pitch' | 'training' | 'report';

export const COACH_VIEWS = [
  {
    key: 'pitch',
    label: '투구',
    desc: '추이 · 기간별 기록',
    icon: Activity,
    href: '/coach',
  },
  {
    key: 'training',
    label: '트레이닝',
    desc: '운동량 · 부위별 세트',
    icon: Dumbbell,
    href: '/coach?view=training',
  },
  {
    key: 'report',
    label: '리포트',
    desc: '기록을 읽고 쓴 코멘트',
    icon: FileText,
    href: '/coach?view=report',
  },
] as const;

/** 주소에서 온 값을 세 칸 중 하나로 못박는다. 모르는 값은 투구로 본다. */
export function readCoachView(raw: string | string[] | undefined): CoachView {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'training' || value === 'report' ? value : 'pitch';
}

export function CoachTabs({ current }: { current: CoachView }) {
  return (
    <nav className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
      {COACH_VIEWS.map(({ key, label, desc, icon: Icon, href }) => {
        const active = key === current;
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${
              active ? 'bg-surface-2' : 'bg-surface hover:bg-surface-2/60'
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                active
                  ? 'border-sky-soft/60 bg-sky/10 text-sky'
                  : 'border-line-strong text-muted'
              }`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span
                className={`block text-sm font-bold ${active ? 'text-sky' : 'text-ink'}`}
              >
                {label}
              </span>
              <span className="mt-0.5 block text-xs break-keep text-muted">
                {desc}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
