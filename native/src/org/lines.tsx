import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EventDetail, PlanView } from '@/app/actions/app-team';
import type { WorkLine } from '@/lib/org/team-session';
import { TYPE, type Palette } from '~/lib/ui';
import { Card, Empty } from '~/org/parts';
import { Num, type Pick } from '~/org/picker';

/**
 * 처방 줄 고치기(팀 훈련 실제 확인 — 조 실제 · 선수 예외가 같이 쓴다). 줄마다 세트 · 횟수 · 초, 예외 줄은 무게까지(조 공통 무게는 없다, 계약 11-10 3).
 * 보낼 때 toLines 로 lib/org/team-session.ts WorkLine 모양으로.
 */
export type LineDraft = { id: string; kind: 'exercise' | 'drill'; name: string; sets: string; reps: string; sec: string; kg: string };

const str = (n: number | undefined) => (n == null ? '' : String(n));
const num = (s: string) => (s.trim() ? Number(s) : undefined);

export function fromLines(lines: readonly WorkLine[], names: Readonly<Record<string, string>>): LineDraft[] {
  return lines.flatMap((l) => {
    const id = l.exerciseId ?? l.guideId;
    if (!id) return [];
    return [{ id, kind: l.exerciseId ? 'exercise' : 'drill', name: names[id] ?? '지운 운동', sets: str(l.sets), reps: str(l.reps), sec: str(l.holdSec), kg: str(l.weightKg) }];
  });
}

export function toLines(drafts: readonly LineDraft[], weight: boolean): WorkLine[] {
  return drafts.map((d) => ({
    ...(d.kind === 'exercise' ? { exerciseId: d.id } : { guideId: d.id }),
    sets: num(d.sets),
    reps: num(d.reps),
    holdSec: num(d.sec),
    ...(weight ? { weightKg: num(d.kg) } : {}),
  }));
}

/** 고르개(LibraryBrowser)의 고른 것 ↔ 줄 — 새로 고른 것만 빈 줄로 붙인다 */
export function picksOf(drafts: readonly LineDraft[]): Pick[] {
  return drafts.map((d) => ({ id: d.id, kind: d.kind, name: d.name, sets: '', reps: '' }));
}
export function withPicks(drafts: readonly LineDraft[], picks: readonly Pick[]): LineDraft[] {
  return picks.map((p) => drafts.find((d) => d.id === p.id) ?? { id: p.id, kind: p.kind, name: p.name, sets: '', reps: '', sec: '', kg: '' });
}

/** 이 선수가 할 활동 — 대상인 활동에서 그 선수의 개인 '바꾸기'가 대신하는 조 활동을 뺀다(서버 memberPlans 와 같은 규칙) */
export function plansOfMember(d: EventDetail, memberId: string): PlanView[] {
  const mine = d.plans.filter((p) => p.targets.includes(memberId));
  const replaced = new Set(mine.filter((p) => p.scope === 'member' && p.replacesPlanId).map((p) => p.replacesPlanId!));
  return mine.filter((p) => !replaced.has(p.id));
}

export function LineEditor({ lines, onChange, weight, empty, c }: { lines: LineDraft[]; onChange: (next: LineDraft[]) => void; weight: boolean; empty: string; c: Palette }) {
  const patch = (i: number, v: Partial<LineDraft>) => onChange(lines.map((x, n) => (n === i ? { ...x, ...v } : x)));
  return (
    <Card c={c} style={{ paddingVertical: 4 }}>
      {lines.length === 0 ? <Empty text={empty} c={c} /> : null}
      {lines.map((x, i) => (
        <View key={`${x.id}-${i}`} style={[st.row, i < lines.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[TYPE.body, { color: c.ink, flex: 1 }]} numberOfLines={2}>
              {x.name}
              {x.kind === 'drill' ? ' · 드릴' : ''}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`${x.name} 빼기`} onPress={() => onChange(lines.filter((_, n) => n !== i))} hitSlop={8}>
              <Text style={{ color: c.danger, fontSize: 20 }}>×</Text>
            </Pressable>
          </View>
          {x.kind === 'exercise' ? (
            <View style={st.nums}>
              <Num value={x.sets} onChange={(sets) => patch(i, { sets })} unit="세트" max={2} c={c} />
              <Num value={x.reps} onChange={(reps) => patch(i, { reps })} unit="회" max={3} c={c} />
              <Num value={x.sec} onChange={(sec) => patch(i, { sec })} unit="초" max={3} c={c} />
              {weight ? <Num value={x.kg} onChange={(kg) => patch(i, { kg })} unit="kg" max={5} decimal c={c} /> : null}
            </View>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

const st = StyleSheet.create({
  row: { gap: 4, paddingVertical: 8 },
  nums: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
});
