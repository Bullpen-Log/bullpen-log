import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { loadCoachToday } from '@/app/actions/coach';
import { loadMe } from '~/pitch/api';
import { rpc } from '~/lib/rpc';
import { SURFACE, TYPE, usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { useFocusRefresh } from '~/shell/tab-pager';

type Coach = NonNullable<Extract<Awaited<ReturnType<typeof loadCoachToday>>, { ok: true }>['coach']>;

/**
 * 홈의 '오늘의 코치 계획' 카드(docs/designs/ai-coach.md 10-5) — 유료 · 코치 진행 중일 때만 한 장. 누르면 코치 탭(시작 단추는 거기에).
 * 아니면 아무것도 안 그린다(홈 그대로).
 */
export function CoachHomeCard({ onOpen }: { onOpen: () => void }) {
  const c = usePalette();
  const [coach, setCoach] = useState<Coach | null>(null);
  const load = useCallback(() => {
    loadMe()
      .then((me) => (me.coachPaid ? rpc<Awaited<ReturnType<typeof loadCoachToday>>>('coach.loadCoachToday') : null))
      .then((r) => setCoach(r?.coach ?? null), () => undefined);
  }, []);
  useEffect(load, [load]);
  useFocusRefresh(load);
  if (!coach) return null;
  return (
    <Press accessibilityRole="button" onPress={onOpen} style={[SURFACE.card, st.row, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Icon name="clipboard-list" size={22} color={c.link} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[TYPE.sub, { color: c.muted }]}>오늘의 코치 계획</Text>
        <Text style={[TYPE.card, { color: c.ink }]}>{coach.owner === 'user' ? '오늘은 직접 하는 날' : coach.line}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={c.muted} />
    </Press>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
