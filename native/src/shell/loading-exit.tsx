import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { TYPE, usePalette } from '~/lib/ui';
import { Press } from './press';

/** Pending start requests may already have created a session. Leaving never retries or cancels that write. */
export function LoadingExit({ label = '불러오는 중' }: { label?: string }) {
  const c = usePalette();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 12_000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={{ alignItems: 'center', gap: 16, paddingHorizontal: 24 }}>
      <ActivityIndicator accessibilityLabel={label} />
      <Text
        accessibilityLiveRegion="polite"
        style={[TYPE.body, { color: c.muted, textAlign: 'center' }]}
      >
        {slow
          ? '연결이 늦어지고 있어요. 화면을 닫고 나중에 다시 확인할 수 있어요.'
          : label}
      </Text>
      <Press
        accessibilityRole="button"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={{ minHeight: 44, padding: 12 }}
      >
        <Text style={[TYPE.button, { color: c.link }]}>닫기</Text>
      </Press>
    </View>
  );
}
