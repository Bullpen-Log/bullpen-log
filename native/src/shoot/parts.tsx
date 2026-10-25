import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { ItemState } from '@/lib/shoot/progress';
import type { Palette } from '~/lib/ui';

/**
 * 촬영 관리자(앱) 공용 조각 — 웹 components/shoot/gauge.tsx · status.ts 와 같은 이름 · 같은 색 규칙(sky 하나, 다시 찍기만 경고색).
 */
export const STATE_LABEL: Record<ItemState, string> = {
  done: '찍음',
  redo: '다시 찍기',
  later: '미룸',
  todo: '대기',
};

/** 상태 알약의 글자 · 바탕 */
export function statePill(state: ItemState, c: Palette): { color: string; bg: string; border?: string } {
  if (state === 'done') return { color: '#fff', bg: c.sky };
  if (state === 'redo') return { color: c.warn, bg: c.warnBg };
  if (state === 'later') return { color: c.muted, bg: c.chip };
  return { color: c.muted, bg: 'transparent', border: c.line };
}

export function StatePill({ state, c }: { state: ItemState; c: Palette }) {
  const p = statePill(state, c);
  return (
    <View style={{ borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: p.bg, borderWidth: p.border ? 1 : 0, borderColor: p.border }}>
      <Text style={{ color: p.color, fontSize: 13, fontWeight: '600' }}>{STATE_LABEL[state]}</Text>
    </View>
  );
}

/** 'M월 D일 HH:mm'(한국 시간) */
const STAMP = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
export const stampText = (iso: string) => STAMP.format(new Date(iso));

/** 찍음 · 다시 · 미룸 · 남음을 한 막대에 */
export function StackBar({ done, redo, later, total, height = 8, c }: { done: number; redo: number; later: number; total: number; height?: number; c: Palette }) {
  const part = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: done }}
      style={{ flexDirection: 'row', height, borderRadius: height / 2, overflow: 'hidden', backgroundColor: c.line }}
    >
      <View style={{ width: `${part(done)}%`, backgroundColor: c.action }} />
      <View style={{ width: `${part(redo)}%`, backgroundColor: c.warn }} />
      <View style={{ width: `${part(later)}%`, backgroundColor: c.muted, opacity: 0.4 }} />
    </View>
  );
}

/** 진행 게이지 — 바깥 고리 = 찍은 비율, 안쪽 고리 = 우리 영상으로 올린 비율(웹 ShootGauge 와 같은 그림) */
export function ShootGauge({ done, uploaded, total, c }: { done: number; uploaded: number; total: number; c: Palette }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const up = total > 0 ? Math.round((uploaded / total) * 100) : 0;
  const ring = (r: number, value: number, opacity: number) => {
    const len = 2 * Math.PI * r;
    return (
      <>
        <Circle cx={32} cy={32} r={r} fill="none" stroke={c.line} strokeWidth={6} />
        {value > 0 ? (
          <Circle
            cx={32}
            cy={32}
            r={r}
            fill="none"
            stroke={c.sky}
            strokeOpacity={opacity}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={`${(len * value) / 100} ${len}`}
            transform="rotate(-90 32 32)"
          />
        ) : null}
      </>
    );
  };
  return (
    <View
      accessible
      accessibilityLabel={`${total}개 가운데 ${done}개 찍음(${pct}%), ${uploaded}개 올림`}
      style={{ width: 168, height: 168, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg viewBox="0 0 64 64" width={168} height={168} style={{ position: 'absolute' }}>
        {ring(27, pct, 1)}
        {ring(19, up, 0.45)}
      </Svg>
      <Text style={{ color: c.ink, fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{pct}%</Text>
      <Text style={{ color: c.muted, fontSize: 13 }}>
        {done} / {total}
      </Text>
    </View>
  );
}
