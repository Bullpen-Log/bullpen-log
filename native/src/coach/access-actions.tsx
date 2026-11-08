import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { cacheEpoch } from '~/lib/store';
import { TYPE, usePalette } from '~/lib/ui';
import { loadMe, resetMe } from '~/pitch/api';
import { Press } from '~/shell/press';

/** Admin-granted access. Opening the inquiry never sends it or grants an entitlement. */
export function CoachAccessActions({ onGranted }: { onGranted?: () => void }) {
  const c = usePalette();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const check = async () => {
    if (pending.current) return;
    pending.current = true;
    const epoch = cacheEpoch();
    const current = () => mounted.current && epoch === cacheEpoch();
    setBusy(true);
    setMessage(null);
    try {
      resetMe();
      const me = await loadMe();
      if (!current()) return;
      if (me.coachPaid) {
        if (onGranted) onGranted();
        else router.push('/coach-start' as Href);
      } else
        setMessage('아직 이용 권한이 없어요. 문의 답변에서 승인 여부를 확인해 주세요.');
    } catch {
      if (current())
        setMessage('이용 권한을 확인하지 못했어요. 연결을 확인하고 다시 눌러 주세요.');
    } finally {
      pending.current = false;
      if (current()) setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <Text style={[TYPE.body, { color: c.muted }]}>
        현재는 관리자가 이용 권한을 승인한 계정에서 사용할 수 있어요. 문의를 보낸 뒤
        고객센터에서 답변을 확인해 주세요.
      </Text>
      <Press
        accessibilityRole="button"
        onPress={() => router.push('/support/inquiries/new?topic=coach' as Href)}
        style={{
          minHeight: 44,
          padding: 12,
          borderRadius: 14,
          backgroundColor: c.action,
        }}
      >
        <Text style={[TYPE.button, { color: c.onAction, textAlign: 'center' }]}>
          코치 이용 문의
        </Text>
      </Press>
      <Press
        accessibilityRole="button"
        disabled={busy}
        accessibilityState={{ disabled: busy }}
        onPress={() => void check()}
        style={{ minHeight: 44, padding: 12 }}
      >
        <Text style={[TYPE.buttonCompact, { color: c.link, textAlign: 'center' }]}>
          {busy ? '확인 중…' : '권한 다시 확인'}
        </Text>
      </Press>
      <Press
        accessibilityRole="link"
        onPress={() => router.push('/support/inquiries' as Href)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={[TYPE.sub, { color: c.link, textAlign: 'center' }]}>
          내 문의와 답변 보기
        </Text>
      </Press>
      {message ? (
        <Text accessibilityLiveRegion="polite" style={[TYPE.sub, { color: c.muted }]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}
