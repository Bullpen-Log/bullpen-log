import { SymbolView } from 'expo-symbols';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppAdminSupport } from '@/app/actions/app-admin';
import { Badge, Bar, BarButton, Chip, InquiryMeta, LoadState, Row, s, useLoad, useTitleCollapse } from '~/community/parts';
import { PageHead } from '~/shell/heading';
import { usePalette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 소통 관리(앱 화면, 관리자) — 웹 app/(app)/admin/support/page.tsx: 상태별 1:1 문의(누르면 앱 문의 화면 — 관리자도 답하고 닫는다) ·
 * 공지 관리(누르면 앱 공지 화면, '공지 쓰기'는 앱 쓰기 화면) · 커뮤니티 신고 처리로 가는 줄.
 */
type Loaded = Awaited<ReturnType<typeof loadAppAdminSupport>>;

export default function AdminSupportScreen() {
  const c = usePalette();
  const { shown, scroll } = useTitleCollapse();
  const inset = useSafeAreaInsets();
  const [filter, setFilter] = useState('OPEN');
  const { data, error, reload } = useLoad<Loaded>('app-admin.loadAppAdminSupport', filter);
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="관리자" title="소통 관리" right={<BarButton label="공지 쓰기" onPress={() => router.push('/admin/notice' as Href)} c={c} />} shown={!data || shown} c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView {...scroll}
          contentContainerStyle={[{ padding: 16, gap: 20, paddingBottom: inset.bottom + 32 }, READABLE]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
        >
          <PageHead title="소통 관리" />
          <View style={{ gap: 10 }}>
            <Text style={[s.title, { color: c.ink, paddingHorizontal: 4 }]}>1:1 문의</Text>
            <View accessibilityRole="radiogroup" style={s.chips}>
              {data.filters.map((f) => (
                <Chip key={f.key} label={`${f.label} ${f.count}`} on={filter === f.key} onPress={() => setFilter(f.key)} c={c} />
              ))}
            </View>
            {data.inquiries.length === 0 ? (
              <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', padding: 20 }}>
                {data.filter === 'OPEN' ? '답을 기다리는 문의가 없어요.' : '이 상태의 문의가 없어요.'}
              </Text>
            ) : (
              <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
                {data.inquiries.map((q, i) => (
                  <Row key={q.id} onPress={() => router.push(`/support/inquiries/${q.id}` as Href)} last={i === data.inquiries.length - 1} c={c}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <Text style={{ flex: 1, color: c.ink, fontSize: 16, fontWeight: '600' }} numberOfLines={2}>
                        {q.title}
                      </Text>
                      <Badge text={q.status} color={q.open ? c.sky : undefined} c={c} />
                    </View>
                    {/* 옛 서버(종류 칸 없음)면 '기타' 배지 대신 예전 글 줄 */}
                    {q.category ? (
                      <InquiryMeta category={q.category} nickname={q.nickname} date={q.date} replies={q.replies} c={c} />
                    ) : (
                      <Text style={[s.meta, { color: c.muted }]}>{[q.nickname, q.date, q.replies > 0 ? `답글 ${q.replies}` : null].filter(Boolean).join(' · ')}</Text>
                    )}
                  </Row>
                ))}
              </View>
            )}
            {data.capped ? <Text style={[s.meta, { color: c.muted, paddingHorizontal: 4 }]}>100건만 보여요. 처리하면 다음 것이 올라와요.</Text> : null}
          </View>

          <View style={{ gap: 10 }}>
            <Text style={[s.title, { color: c.ink, paddingHorizontal: 4 }]}>공지 관리</Text>
            {data.notices.length === 0 ? (
              <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', padding: 20 }}>아직 올린 공지가 없어요.</Text>
            ) : (
              <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
                {data.notices.map((n, i) => (
                  <Row key={n.id} onPress={() => router.push(`/support/notices/${n.id}` as Href)} last={i === data.notices.length - 1} c={c}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {n.pinned ? <SymbolView name="pin.fill" size={13} tintColor={c.sky} /> : null}
                      <Text style={{ flex: 1, color: c.ink, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
                        {n.title}
                      </Text>
                    </View>
                    <Text style={[s.meta, { color: c.muted }]}>{n.date}</Text>
                  </Row>
                ))}
              </View>
            )}
          </View>

          <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Row onPress={() => router.push('/admin/community' as Href)} last c={c}>
              <Text style={{ color: c.ink, fontSize: 16, fontWeight: '600' }}>커뮤니티 신고 처리</Text>
              <Text style={[s.meta, { color: c.muted }]}>신고된 글 · 댓글을 보고 가리거나 풀어요.</Text>
            </Row>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
