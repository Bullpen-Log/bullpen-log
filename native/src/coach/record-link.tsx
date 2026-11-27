import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Text } from 'react-native';
import { rpc } from '~/lib/rpc';
import { usePalette } from '~/lib/ui';
import { canOpen, pushOpen, useRelease } from '~/shell/release';
import { Press } from '~/shell/press';

export function useRecordCoach(enabled: boolean) {
  const allowed = canOpen('/coach-chat', useRelease());
  const [active, setActive] = useState(false);
  useFocusEffect(useCallback(() => {
    let live = true;
    setActive(false);
    if (enabled && allowed) void rpc<{ active: boolean }>('coach-chat.loadCoachInboxStatus')
      .then(status => { if (live) setActive(status.active); }).catch(() => {});
    return () => { live = false; };
  }, [allowed, enabled]));
  return active && enabled && allowed;
}

export function RecordCoachLink({ kind, id, label, jobId }: { kind: 'velocity' | 'report' | 'week'; id: string; label: string; jobId?: string }) {
  const c = usePalette();
  const title = { velocity: '이 구속 기록', report: '이 리포트', week: '이번 주 계획' }[kind] + ' 코치에게 묻기';
  return <Press accessibilityRole="button" onPress={() => pushOpen({ pathname: '/coach-chat', params: { kind, id, label, ...(jobId ? { jobId } : {}) } })}
    style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}>
    <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>{title}</Text>
  </Press>;
}
