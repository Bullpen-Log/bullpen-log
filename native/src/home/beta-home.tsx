import { type Href, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppLabListItem } from '@/app/actions/pitch-lab';
import { BETA_LOCK_BODY } from '@/lib/release-access';
import { useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { SPACE, TYPE, usePalette } from '~/lib/ui';
import { ActionButton } from '~/shell/action-button';
import { Icon } from '~/shell/icon';
import { MenuButton } from '~/shell/menu-button';
import { Press } from '~/shell/press';
import { noticeLocked } from '~/shell/release';
import { Wordmark } from '~/shell/wordmark';

/**
 * 출시 전 베타 홈(앱, 2026-10-29) — 일반 · 준관리자에게 홈 판 대신. 지금 열린 것은 투구 3D 분석 하나라 그것만 크게, 잠긴 기능은 작게 한 묶음.
 * 생김새는 지금 홈 그대로(위 막대 로고 · 메뉴 단추, 카드 · 글꼴 · 색 토큰). 예전 홈의 통계 · 플랜 · 알림 · 체크인은 부르지 않는다(app.loadAppHome 은 서버도 잠금).
 * 웹은 같은 내용을 components/beta/beta-home.tsx 로 그린다.
 */
type LabList = { ok: true; samples: AppLabListItem[] } | { ok: false; to: string };

const LOCKED = ['투구 기록', '트레이닝', '기록', '덕아웃'];
const PHASE: Record<NonNullable<AppLabListItem['phase']>, string> = {
  active: '분석 중',
  done: '결과 보기',
  failed: '분석 실패',
  none: '분석 전',
  broken: '올리다 멈춤',
};

export function BetaHome({ bottom }: { bottom: number }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<LabList>('pitch-lab.loadAppLabList', 'mine');
  const samples = data?.ok ? data.samples : [];
  const running = samples.find((s) => s.phase === 'active');
  const recent = samples.slice(0, 3);
  const go = (to: string) => router.push(to as Href);
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[{ paddingTop: inset.top + BAR_H + 12, paddingBottom: bottom + 24, paddingHorizontal: SPACE.side }, READABLE]}
      >
        <View style={{ gap: SPACE.section }}>
          <View style={{ gap: 8 }}>
            <View style={[s.badge, { backgroundColor: c.skyTint }]}>
              <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>베타 체험</Text>
            </View>
            <Text style={[TYPE.body, { color: c.muted }]}>지금은 투구 3D 분석을 체험할 수 있어요.</Text>
          </View>

          <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Text accessibilityRole="header" style={[TYPE.card, { color: c.ink, fontSize: 20 }]}>
              투구 3D 분석
            </Text>
            <Text style={[TYPE.body, { color: c.muted }]}>옆 · 뒤에서 동시에 찍은 영상 두 개로 투구 동작을 3D 로 살펴봐요.</Text>
            {running ? (
              /* 분석 중이면 그것부터 — 새 분석을 또 걸게 부추기지 않는다 */
              <Press
                accessibilityRole="button"
                accessibilityLabel={`분석 중인 투구, ${running.when ?? ''}, 진행 상황 보기`}
                onPress={() => go(`/lab/${running.id}`)}
                style={[s.row, { backgroundColor: c.page }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[TYPE.buttonCompact, { color: c.ink }]}>분석 중이에요</Text>
                  <Text style={[TYPE.sub, { color: c.muted }]}>끝날 때까지 새 분석을 걸지 않아도 돼요.</Text>
                </View>
                <Text style={[s.chev, { color: c.muted }]}>›</Text>
              </Press>
            ) : null}
            <ActionButton label="새 분석 시작" tone={running ? 'secondary' : 'primary'} onPress={() => go('/lab/new')} />
            <ActionButton label="촬영 방법" tone="secondary" compact onPress={() => go('/lab/guide')} />
          </View>

          <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, gap: 4 }]}>
            <View style={s.head}>
              <Text accessibilityRole="header" style={[TYPE.card, { color: c.ink }]}>
                내 분석
              </Text>
              <Pressable accessibilityRole="link" onPress={() => go('/lab')} hitSlop={8} style={s.more}>
                <Text style={[TYPE.buttonCompact, { color: c.link }]}>전체 보기 ›</Text>
              </Pressable>
            </View>
            {error && !data ? (
              <Press accessibilityRole="button" onPress={() => reload()} style={s.line}>
                <Text style={[TYPE.body, { color: c.muted, flex: 1 }]}>내 분석을 불러오지 못했어요.</Text>
                <Text style={[TYPE.buttonCompact, { color: c.link }]}>다시</Text>
              </Press>
            ) : !data ? (
              <Text style={[TYPE.body, { color: c.muted, paddingVertical: 10 }]}>불러오는 중…</Text>
            ) : recent.length === 0 ? (
              <Text style={[TYPE.body, { color: c.muted, paddingVertical: 10 }]}>아직 분석한 투구가 없어요.</Text>
            ) : (
              recent.map((it, i) => (
                <Press
                  key={it.id}
                  accessibilityRole="button"
                  onPress={() => go(`/lab/${it.id}`)}
                  style={[s.line, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
                >
                  <Text numberOfLines={1} style={[TYPE.body, { color: c.ink, flex: 1 }]}>
                    {it.memo || it.when || '투구'}
                  </Text>
                  <Text style={[TYPE.sub, { color: it.phase === 'failed' ? c.danger : c.muted }]}>{PHASE[it.phase ?? 'none']}</Text>
                </Press>
              ))
            )}
          </View>

          {/* 준비 중인 기능 — 작게 한 묶음(큰 잠금 카드로 홈을 채우지 않는다). 누르면 안내만 */}
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="header" style={[TYPE.sub, { color: c.muted, fontWeight: '600' }]}>
              준비 중인 기능
            </Text>
            <View style={s.chips}>
              {LOCKED.map((label) => (
                <Pressable
                  key={label}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}, 준비 중`}
                  accessibilityHint="아직 열리지 않은 기능이에요. 누르면 안내가 나와요."
                  onPress={noticeLocked}
                  style={({ pressed }) => [s.chip, { backgroundColor: c.chip, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Icon name="lock" size={13} color={c.muted} />
                  <Text style={[TYPE.sub, { color: c.muted }]}>{label} · 준비 중</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[TYPE.sub, { color: c.muted }]}>{BETA_LOCK_BODY}</Text>
          </View>
        </View>
      </ScrollView>

      {/* 위 막대 — 지금 홈과 같은 자리 · 로고, 오른쪽은 메뉴(계정 · 고객센터 · 로그아웃 · 관리 업무). 알림 종은 베타에 없다 */}
      <View pointerEvents="none" style={[s.clock, { height: inset.top, backgroundColor: c.page }]} />
      <View style={[s.bar, { top: inset.top, backgroundColor: c.page }]}>
        <Wordmark color={c.ink} />
        <MenuButton style={s.menu} />
      </View>
    </View>
  );
}

const BAR_H = 56;
const s = StyleSheet.create({
  clock: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3 },
  bar: { position: 'absolute', left: 0, right: 0, height: BAR_H, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  menu: { position: 'absolute', right: 14 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  card: { borderRadius: 20, padding: SPACE.pad, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderRadius: 14, paddingHorizontal: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  more: { minHeight: 44, justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  chev: { fontSize: 22, fontWeight: '300' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, borderRadius: 999, paddingHorizontal: 12 },
});
