import { type Href, router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppInquiries } from '@/app/actions/support';
import { Bar, BarButton, InquiryRows, LoadState, s, useLoad } from '~/community/parts';
import { usePalette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';

/** 내 1:1 문의 전체(앱 화면) — 웹 app/(app)/support/inquiries/page.tsx. 새 것부터, 다른 사람의 문의는 없다(관리자는 웹 /admin/support) */
type Loaded = Awaited<ReturnType<typeof loadAppInquiries>>;

export default function InquiriesScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<Loaded>('support.loadAppInquiries');
  const ask = () => router.push('/support/inquiries/new' as Href);

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="고객센터" title="1:1 문의" right={<BarButton label="문의하기" onPress={ask} c={c} />} c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
          {data.inquiries.length === 0 ? (
            <View style={{ padding: 24, gap: 12, alignItems: 'center' }}>
              <Text style={[s.title, { color: c.ink }]}>아직 문의한 게 없어요</Text>
              <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', lineHeight: 21 }}>
                오류 · 계정 · 기능 제안 무엇이든 물어 주세요. 답이 오면 여기에서 볼 수 있어요.
              </Text>
              <Press accessibilityRole="button" onPress={ask} style={[s.pill, { backgroundColor: c.sky }]}>
                <Text style={s.primaryText}>첫 문의 보내기</Text>
              </Press>
            </View>
          ) : (
            <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
              <InquiryRows rows={data.inquiries} c={c} />
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
