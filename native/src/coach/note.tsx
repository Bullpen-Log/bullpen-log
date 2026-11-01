import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { loadCoachToday } from '@/app/actions/coach';
import { loadMe } from '~/pitch/api';
import { rpc } from '~/lib/rpc';
import { TYPE, usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';

type Coach = NonNullable<Extract<Awaited<ReturnType<typeof loadCoachToday>>, { ok: true }>['coach']>;

/**
 * 트레이닝 운동 화면 위 코치 한 줄(docs/designs/ai-coach.md 10-5 U38) — 유료 · 코치 진행 중일 때만. 운동 목록은 그대로 엔진이 만들고,
 * 코치 운동 날이면 만들기가 코치 시간을 기본으로 쓴다(app/actions/training-setup.ts). 코치가 쉬라고 한 날에 만들면 그날은 내 것이 된다.
 */
export function CoachNote() {
  const c = usePalette();
  const [coach, setCoach] = useState<Coach | null>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadMe()
        .then((me) => (me.coachPaid ? rpc<Awaited<ReturnType<typeof loadCoachToday>>>('coach.loadCoachToday') : null))
        .then(
          (r) => alive && setCoach(r?.coach ?? null),
          () => undefined
        );
      return () => {
        alive = false;
      };
    }, [])
  );
  if (!coach) return null;
  const text =
    coach.owner === 'user'
      ? '오늘은 직접 만든 운동으로 해요. 코치는 내일부터 다시 맞춰요.'
      : coach.work
        ? `코치 계획 · ${coach.line}. 만들면 이 시간에 맞춰요.`
        : `코치 계획 · ${coach.line}. 그래도 만들면 오늘은 직접 하는 날이 돼요.`;
  return (
    <View style={[st.band, { backgroundColor: c.skyTint }]}>
      <Icon name="clipboard-list" size={18} color={c.link} />
      <Text style={[TYPE.sub, { flex: 1, color: c.ink }]}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  band: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
});
