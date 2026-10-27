import { Alert, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { REHAB_PAUSED_TEXT } from '@/lib/armcare/rehab-regions';
import type { AppArmcareTodayTab } from '@/lib/armcare/today-load';
import { Bar } from '~/community/parts';
import { usePalette } from '~/lib/ui';
import { act } from '~/mechanics/parts';
import { Press } from '~/shell/press';
import { useScreenData } from '~/training/screen';

/** 옛 북마크·직접 주소에서도 검토 전 자동 재활·복귀 안내를 열지 않는다. */
export function RehabPausedScreen() {
  const c = usePalette();
  const state = useScreenData<AppArmcareTodayTab>(
    'app-training-parts.loadAppArmcare',
    'today',
    'training-armcare:today'
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = () =>
    Alert.alert(
      '프로그램 사용을 중단할까요?',
      '지난 기록은 남아요. 사용 중단은 완치 판정이나 투구 복귀 승인이 아니에요. 담당 의사·치료사의 지시를 따라 주세요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '사용 중단',
          onPress: async () => {
            setBusy(true);
            const result = await act<{ ok: true }>('rehab.endRehab', 'stopped');
            setBusy(false);
            if ('error' in result) setError(result.error);
            else router.replace('/training-armcare');
          },
        },
      ]
    );
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="암케어" title="재활 안내" c={c} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text style={{ color: c.ink, fontSize: 18, fontWeight: '700' }}>
          자동 재활·투구 복귀 안내를 준비하고 있어요
        </Text>
        <Text style={{ color: c.muted, fontSize: 15, lineHeight: 23 }}>
          {REHAB_PAUSED_TEXT}
        </Text>
        {state.data?.rehabPaused ? (
          <>
            <Text style={{ color: c.ink }}>
              기존 프로그램의 운동 제한은 유지돼요. 프로그램 사용을 중단하려면 아래에서
              정리할 수 있어요.
            </Text>
            <Press
              disabled={busy}
              onPress={stop}
              accessibilityRole="button"
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text style={{ color: c.link, fontWeight: '600' }}>
                기존 프로그램 사용 중단
              </Text>
            </Press>
          </>
        ) : null}
        {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
        <Press
          onPress={() => router.replace('/training-armcare')}
          accessibilityRole="button"
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text style={{ color: c.link, fontWeight: '600' }}>암케어로 돌아가기</Text>
        </Press>
      </ScrollView>
    </View>
  );
}
