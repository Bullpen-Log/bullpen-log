import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { restoreAccount } from './session';
import { hideSplashUnlessIntro } from '~/shell/intro';
import { usePalette } from '~/lib/ui';

/** Both app roots (including cold deep links) wait before mounting account consumers. */
export function SessionGate({ children }: { children: ReactNode }) {
  const c = usePalette();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'waiting' | 'ready' | 'error'>('waiting');
  useEffect(() => {
    let alive = true;
    void (async () => {
      await restoreAccount();
      if (alive) setStatus('ready');
    })().catch(() => {
      if (alive) {
        setStatus('error');
        void hideSplashUnlessIntro();
      }
    });
    return () => { alive = false; };
  }, [attempt]);
  if (status === 'ready') return children;
  return (
    <View style={{ flex: 1, backgroundColor: c.page, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      {status === 'waiting' ? <ActivityIndicator accessibilityLabel="로그인 확인 중" /> : <>
        <Text style={{ color: c.ink }}>로그인을 확인하지 못했어요. 연결 후 다시 시도해 주세요.</Text>
        <Pressable accessibilityRole="button" onPress={() => { setStatus('waiting'); setAttempt((n) => n + 1); }} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 20 }}>
          <Text style={{ color: c.link }}>다시 시도</Text>
        </Pressable>
      </>}
    </View>
  );
}
