import { SymbolView } from 'expo-symbols';
import { type Href, router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FAQ } from '@/lib/support';
import type { loadAppSupport } from '@/app/actions/support';
import { Bar, InquiryRows, LoadState, NoticeRows, s, useLoad } from '~/community/parts';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 고객센터(앱 화면) — 웹 app/(app)/support/page.tsx 를 옮겼다. 공지 · 자주 묻는 질문 · 내 1:1 문의 · 메일을 묶음 하나씩, '무슨 일이 있나 →
 * 혹시 아는 답인가 → 아니면 묻기' 순서. 읽기는 웹과 같은 곳(support.loadAppSupport → lib/support-load.ts), 질문 · 답은 lib/support.ts FAQ.
 */
type Loaded = Awaited<ReturnType<typeof loadAppSupport>>;

export default function SupportScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<Loaded>('support.loadAppSupport');

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="고객센터" c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView contentContainerStyle={[{ padding: 16, gap: 22, paddingBottom: inset.bottom + 32 }, READABLE]}>
          <Section title="공지" more={data.notices.length ? () => router.push('/support/notices' as Href) : undefined} c={c}>
            {data.notices.length === 0 ? <Empty text="아직 올라온 공지가 없어요." c={c} /> : <NoticeRows rows={data.notices} c={c} />}
          </Section>

          <Section title="자주 묻는 질문" c={c}>
            <Faq c={c} />
          </Section>

          <Section
            title={data.inquiryCount ? `1:1 문의 ${data.inquiryCount}` : '1:1 문의'}
            more={data.inquiryCount ? () => router.push('/support/inquiries' as Href) : undefined}
            c={c}
          >
            {data.inquiries.length === 0 ? (
              <Empty text="아직 문의한 게 없어요. 오류 · 계정 · 기능 제안 무엇이든 물어 주세요." c={c} />
            ) : (
              <InquiryRows rows={data.inquiries} c={c} />
            )}
          </Section>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/support/inquiries/new' as Href)}
            style={[s.primary, { backgroundColor: c.sky, marginTop: -8 }]}
          >
            <Text style={s.primaryText}>문의하기</Text>
          </Pressable>

          {/* 메일 — 로그인이 안 되는 사람도 닿을 수 있는 길(웹 꼬리말 · 약관과 같은 주소, 서버가 알려 준다) */}
          <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float, padding: 16, gap: 8 }]}>
            <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>더 궁금한 게 있어요?</Text>
            <Text style={{ color: c.muted, fontSize: 15, lineHeight: 21 }}>
              자주 묻는 질문에 없으면 1:1 문의로 물어 주세요. 로그인이 안 될 때는 메일로도 받아요.
            </Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(`mailto:${data.contact}`)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 }}
            >
              <SymbolView name="paperplane" size={15} tintColor={c.sky} />
              <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>{data.contact}</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Section({ title, more, children, c }: { title: string; more?: () => void; children: ReactNode; c: Palette }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.head}>
        <Text style={[s.groupTitle, { color: c.muted, flex: 1 }]}>{title}</Text>
        {more ? (
          <Pressable accessibilityRole="button" onPress={more} hitSlop={8} style={{ paddingHorizontal: 16 }}>
            <Text style={{ color: c.sky, fontSize: 14, fontWeight: '600' }}>모두 보기</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>{children}</View>
    </View>
  );
}

function Empty({ text, c }: { text: string; c: Palette }) {
  return <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', padding: 20, lineHeight: 21 }}>{text}</Text>;
}

/** 자주 묻는 질문 — 묶음마다 질문 줄, 누르면 답이 펼쳐진다(웹 support-faq.tsx 의 details) */
function Faq({ c }: { c: Palette }) {
  const [open, setOpen] = useState<string | null>(null);
  return FAQ.map((g, gi) => (
    <View key={g.group} style={gi > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
      <Text style={[s.meta, { color: c.muted, fontWeight: '600', paddingHorizontal: 16, paddingTop: 12 }]}>{g.group}</Text>
      {g.items.map((it) => {
        const on = open === it.q;
        return (
          <View key={it.q}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: on }}
              onPress={() => setOpen(on ? null : it.q)}
              style={styles.q}
            >
              <Text style={{ flex: 1, color: c.ink, fontSize: 15, fontWeight: '500' }}>{it.q}</Text>
              <SymbolView name={on ? 'chevron.up' : 'chevron.down'} size={12} tintColor={c.muted} />
            </Pressable>
            {on ? <Text style={{ color: c.muted, fontSize: 15, lineHeight: 22, paddingHorizontal: 16, paddingBottom: 14 }}>{it.a}</Text> : null}
          </View>
        );
      })}
    </View>
  ));
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  q: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16, paddingVertical: 10 },
});
