import { SymbolView } from 'expo-symbols';
import { type Href, router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FAQ, INQUIRY_STATUS } from '@/lib/support';
import { CONTACT } from '@/lib/site-info';
import type { loadAppSupport } from '@/app/actions/support';
import {
  Bar,
  BarButton,
  NoticeRows,
  s,
  useLoad,
  useTitleCollapse,
} from '~/community/parts';
import { usePalette, withAlpha, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';

/** 최근 문의 상태 → 주제별 FAQ → 공지. FAQ와 메일은 읽기 실패 중에도 볼 수 있다. */
type Loaded = Awaited<ReturnType<typeof loadAppSupport>>;
type SupportData = Extract<Loaded, { ok: true }>;
type Inquiry = SupportData['inquiries'][number];

const newInquiry = () => router.push('/support/inquiries/new' as Href);
const allInquiries = () => router.push('/support/inquiries' as Href);
const allNotices = () => router.push('/support/notices' as Href);

export default function SupportScreen() {
  const c = usePalette();
  const { shown, scroll } = useTitleCollapse();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<Loaded>('support.loadAppSupport');
  const latest = data?.inquiries[0];
  const contact = data?.contact ?? CONTACT;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar
        back="뒤로"
        title="고객센터"
        right={<BarButton label="문의하기" onPress={newInquiry} c={c} />}
        shown={shown}
        c={c}
      />
      <ScrollView
        {...scroll}
        contentContainerStyle={[
          { padding: 16, gap: 20, paddingBottom: inset.bottom + 32 },
          READABLE,
        ]}
      >
        <View style={styles.intro}>
          <Text
            accessibilityRole="header"
            style={{
              color: c.ink,
              fontSize: 25,
              fontWeight: '800',
              letterSpacing: -0.6,
            }}
          >
            어떤 도움이 필요하세요?
          </Text>
          <Text style={{ color: c.muted, fontSize: 15, lineHeight: 22 }}>
            답을 찾아보고, 필요한 내용은 직접 문의해 주세요.
          </Text>
        </View>

        {error ? (
          <View style={[styles.loadNote, { backgroundColor: c.card }]}>
            <Text style={{ color: c.ink, fontSize: 15, lineHeight: 22, flex: 1 }}>
              {data
                ? '최근 공지와 문의를 새로 확인하지 못했어요. 이전 내용을 보여드려요.'
                : '공지와 문의 내역을 불러오지 못했어요.'}
            </Text>
            <Press
              accessibilityRole="button"
              onPress={() => void reload()}
              hitSlop={8}
              style={styles.retry}
            >
              <Text style={{ color: c.link, fontSize: 14, fontWeight: '700' }}>
                다시 시도
              </Text>
            </Press>
          </View>
        ) : !data ? (
          <View
            style={styles.loading}
            accessibilityLabel="공지와 문의 내역 불러오는 중"
          >
            <ActivityIndicator color={c.link} />
            <Text style={{ color: c.muted, fontSize: 13 }}>
              공지와 문의를 불러오는 중이에요.
            </Text>
          </View>
        ) : null}

        {latest ? <RecentInquiry inquiry={latest} c={c} /> : null}

        <Section title="자주 묻는 질문" c={c}>
          <Faq c={c} />
        </Section>

        <Section title="공지" more="전체 보기" onMore={allNotices} c={c}>
          {data?.notices[0] ? (
            <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
              <NoticeRows rows={data.notices.slice(0, 1)} c={c} />
            </View>
          ) : data ? (
            <Text style={[styles.smallNote, { color: c.muted }]}>
              아직 올라온 공지가 없어요.
            </Text>
          ) : (
            <Text style={[styles.smallNote, { color: c.muted }]}>
              공지를 확인할 수 없어요.
            </Text>
          )}
        </Section>

        {data && data.inquiryCount > 0 ? (
          <Press
            accessibilityRole="button"
            onPress={allInquiries}
            hitSlop={8}
            style={styles.allInquiries}
          >
            <Text style={{ color: c.link, fontSize: 15, fontWeight: '700' }}>
              내 문의 모두 보기
            </Text>
            <SymbolView name="arrow.right" size={15} tintColor={c.link} />
          </Press>
        ) : data && !latest ? (
          <Press
            accessibilityRole="button"
            onPress={newInquiry}
            style={[s.primary, { backgroundColor: c.action, marginTop: 0 }]}
          >
            <Text style={s.primaryText}>찾는 답이 없나요? 문의하기</Text>
          </Press>
        ) : null}

        <View style={styles.mail}>
          <Text style={{ color: c.muted, fontSize: 13 }}>로그인이 안 되나요?</Text>
          <Press
            accessibilityRole="link"
            accessibilityLabel={'고객센터에 메일 보내기, ' + contact}
            onPress={() =>
              void Linking.openURL('mailto:' + contact).catch(() => undefined)
            }
            style={styles.mailLink}
          >
            <SymbolView name="envelope" size={16} tintColor={c.link} />
            <Text
              style={{ color: c.link, fontSize: 15, fontWeight: '600', flexShrink: 1 }}
            >
              {contact}
            </Text>
          </Press>
        </View>
      </ScrollView>
    </View>
  );
}

function RecentInquiry({ inquiry, c }: { inquiry: Inquiry; c: Palette }) {
  const answered = inquiry.status === 'ANSWERED';
  const description = answered
    ? '운영자의 답변을 확인해 보세요.'
    : inquiry.status === 'CLOSED'
      ? '종료된 문의예요. 필요하면 다시 열 수 있어요.'
      : '운영자가 확인 중이에요.';
  const tone = answered ? c.ok : inquiry.status === 'OPEN' ? c.link : c.muted;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={
        '최근 문의, ' +
        inquiry.title +
        ', ' +
        INQUIRY_STATUS[inquiry.status].label +
        ', 문의 보기'
      }
      card
      onPress={() => router.push(('/support/inquiries/' + inquiry.id) as Href)}
      style={[styles.recent, { backgroundColor: c.card, boxShadow: c.float }]}
    >
      <View style={styles.recentTop}>
        <Text style={{ color: c.muted, fontSize: 13 }}>최근 문의</Text>
        <Text
          style={[
            styles.status,
            { color: tone, backgroundColor: withAlpha(tone, 0.12) },
          ]}
        >
          {INQUIRY_STATUS[inquiry.status].label}
        </Text>
      </View>
      <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }} numberOfLines={2}>
        {inquiry.title}
      </Text>
      <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19 }}>
        {description}
      </Text>
      <View style={styles.detailLink}>
        <Text style={{ color: c.link, fontSize: 14, fontWeight: '700' }}>
          {answered ? '답변 보기' : '문의 보기'}
        </Text>
        <SymbolView name="arrow.right" size={14} tintColor={c.link} />
      </View>
    </Press>
  );
}

function Section({
  title,
  more,
  onMore,
  children,
  c,
}: {
  title: string;
  more?: string;
  onMore?: () => void;
  children: ReactNode;
  c: Palette;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text
          accessibilityRole="header"
          style={{ color: c.muted, fontSize: 13, fontWeight: '700', flex: 1 }}
        >
          {title}
        </Text>
        {more && onMore ? (
          <Press
            accessibilityRole="button"
            onPress={onMore}
            hitSlop={8}
            style={styles.more}
          >
            <Text style={{ color: c.link, fontSize: 14, fontWeight: '700' }}>
              {more}
            </Text>
          </Press>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Faq({ c }: { c: Palette }) {
  const [topic, setTopic] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const group = FAQ[topic];
  return (
    <View style={{ gap: 8 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.topics}
        accessibilityRole="radiogroup"
        accessibilityLabel="자주 묻는 질문 주제"
      >
        {FAQ.map((item, index) => {
          const selected = topic === index;
          return (
            <Press
              key={item.group}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              select
              selected={selected}
              onPress={() => {
                setTopic(index);
                setOpen(null);
              }}
              style={[
                styles.topic,
                {
                  backgroundColor: selected ? c.action : c.card,
                  borderColor: selected ? c.action : c.line,
                },
              ]}
            >
              <Text
                style={{
                  color: selected ? c.onAction : c.muted,
                  fontSize: 13,
                  fontWeight: '700',
                }}
              >
                {item.group}
              </Text>
            </Press>
          );
        })}
      </ScrollView>
      <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
        {group.items.map((item, index) => {
          const expanded = open === item.q;
          return (
            <View
              key={item.q}
              style={
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: c.line,
                }
              }
            >
              <Press
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setOpen(expanded ? null : item.q)}
                style={styles.question}
              >
                <Text style={{ flex: 1, color: c.ink, fontSize: 15, lineHeight: 21 }}>
                  {item.q}
                </Text>
                <SymbolView
                  name={expanded ? 'chevron.up' : 'chevron.down'}
                  size={13}
                  tintColor={c.muted}
                />
              </Press>
              {expanded ? (
                <Text style={[styles.answer, { color: c.muted }]}>{item.a}</Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 5, paddingHorizontal: 2 },
  section: { gap: 7 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 27,
    paddingHorizontal: 3,
  },
  more: { minHeight: 35, justifyContent: 'center', paddingHorizontal: 5 },
  loadNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderRadius: 13,
  },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 6,
  },
  recent: { borderRadius: 16, padding: 16, gap: 6 },
  recentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 3,
  },
  status: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '700',
  },
  detailLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 7,
    minHeight: 28,
  },
  topics: { gap: 7, paddingVertical: 1, paddingRight: 16 },
  topic: {
    minHeight: 37,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  question: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  answer: { fontSize: 15, lineHeight: 23, paddingHorizontal: 15, paddingBottom: 15 },
  smallNote: { fontSize: 13, paddingVertical: 8, paddingHorizontal: 3 },
  allInquiries: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 3,
  },
  mail: { paddingHorizontal: 3, paddingBottom: 6, gap: 1 },
  mailLink: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44 },
});
