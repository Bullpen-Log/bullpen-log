import * as Haptics from 'expo-haptics';
import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppLabListItem, loadAppLabList } from '@/app/actions/pitch-lab';
import { groupLabSamples, labSideBase, LAB_SUBJECT_FOLDERS, type LabHand } from '@/lib/pitch-lab-meta';
import { Bar, BarButton, LoadState, useLoad } from '~/community/parts';
import { SampleGroup, SampleRow } from '~/lab/parts';
import { READABLE } from '~/lib/layout';
import { rpc } from '~/lib/rpc';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { PitcherMark } from '~/pitch/dock-art';
import { Icon } from '~/shell/icon';
import { toast } from '~/shell/toast';

/**
 * 3D 동작 분석 첫 화면(2026-10-29 확정 시안 analysis-home) — 투구 탭의 '3D 동작 분석' 칸으로 들어온다.
 * 위는 한 장(옆 · 뒤 원본 두 개로 한 투구 · 주 행동 [새 분석] · 보조 [촬영 방법]), 밑은 최근 분석(실제 날짜 · 던진 곳 · 손 · 작업 상태).
 * 완료 · 실패 · 분석 전은 그 투구 화면으로(결과 또는 진행 — app/lab/[id].tsx 가 작업 번호로 상태를 이어 묻는다), 분석 중은 진행 화면으로.
 * 처음 이용 · 이력 있음 · 진행 중 · 목록 조회 실패를 가른다(조회 실패를 빈 기록으로 보이지 않는다, 예시 기록으로 채우지 않는다).
 * 관리자는 머리 '샘플'로 관리자 샘플 화면(app/lab/samples.tsx), 이 화면은 관리자도 자기 투구만(서버 loadAppLabList('mine')).
 */
type Loaded = Awaited<ReturnType<typeof loadAppLabList>>;
const RECENT = 3;

export default function LabHomeScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<Loaded>('pitch-lab.loadAppLabList', 'mine');
  const [all, setAll] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar
        back="투구"
        title="3D 동작 분석"
        right={data?.isAdmin ? <BarButton label="샘플" onPress={() => router.push('/lab/samples' as Href)} c={c} /> : undefined}
        c={c}
      />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView
          contentContainerStyle={[{ padding: 16, gap: 20, paddingBottom: inset.bottom + 32 }, READABLE]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
        >
          <Hero hand={data.hand} c={c} />
          {error ? (
            /* 받아 둔 목록 위에 — 새로 받지 못했다는 사실(빈 목록으로 바꾸지 않는다) */
            <Pressable accessibilityRole="button" onPress={() => void reload()} style={[s.notice, { backgroundColor: c.warnBg }]}>
              <Text style={[TYPE.sub, { color: c.ink, flex: 1 }]}>최근 분석을 새로 받지 못했어요. 지난번에 받은 목록이에요.</Text>
              <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>다시 받기</Text>
            </Pressable>
          ) : null}
          <Recent data={data} all={all} setAll={setAll} onChanged={() => void reload()} c={c} />
        </ScrollView>
      )}
    </View>
  );
}

/** 위 한 장 — 승인 관절 추적 투수 + 옆 · 뒤 카드가 선으로 이어지는 짧은 입장(동작 줄이기면 바로 끝 모습) */
function Hero({ hand, c }: { hand: LabHand; c: Palette }) {
  const calm = useReducedMotion();
  const k = useSharedValue(calm ? 1 : 0);
  useEffect(() => {
    if (!calm) k.set(withDelay(80, withTiming(1, { duration: 520 })));
  }, [calm, k]);
  const left = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * k.get(), transform: [{ translateX: (1 - k.get()) * -18 }, { rotate: '-8deg' }] }));
  const right = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * k.get(), transform: [{ translateX: (1 - k.get()) * 18 }, { rotate: '7deg' }] }));
  const joints = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * k.get() }));
  return (
    <View style={[s.hero, { backgroundColor: c.card, boxShadow: c.floatHero }]}>
      <View style={s.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[s.link, { left: 70, top: 92, backgroundColor: c.skyTint }]} />
        <View style={[s.link, { right: 70, top: 118, backgroundColor: c.skyTint }]} />
        <Animated.View style={[s.viewCard, { left: 4, top: 30, backgroundColor: c.skyTint }, left]}>
          <Icon name="video" size={16} color={c.sky} />
          <Text style={[s.viewText, { color: c.sky }]}>옆 영상</Text>
        </Animated.View>
        <Animated.View style={[s.viewCard, { right: 4, top: 74, backgroundColor: c.skyTint }, right]}>
          <Icon name="video" size={16} color={c.sky} />
          <Text style={[s.viewText, { color: c.sky }]}>뒤 영상</Text>
        </Animated.View>
        <View style={[s.figure, { backgroundColor: c.card, boxShadow: c.float }]}>
          <PitcherMark size={124} layer="body" />
          <Animated.View style={[StyleSheet.absoluteFill, s.center, joints]}>
            <PitcherMark size={124} layer="joints" />
          </Animated.View>
        </View>
      </View>
      <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink, fontSize: 24, lineHeight: 32 }]}>
        옆 · 뒤 영상으로{'\n'}투구 동작을 확인해요.
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <View style={[s.chip, { backgroundColor: c.skyTint }]}>
          <Text style={[TYPE.sub, { color: c.skyStrong, fontWeight: '700' }]}>원본 영상 2개</Text>
        </View>
        <Text style={[TYPE.sub, { color: c.muted }]}>같은 투구 · 동시 촬영</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void Haptics.selectionAsync();
          router.push('/lab/new' as Href);
        }}
        style={({ pressed }) => [s.cta, { backgroundColor: c.action, opacity: pressed ? 0.85 : 1 }]}
      >
        <Icon name="plus" size={18} color="#fff" />
        <Text style={[TYPE.button, { color: '#fff' }]}>새 분석</Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityHint={`옆은 ${labSideBase(hand)} 쪽, 뒤는 2루 쪽에서 찍어요`}
        onPress={() => router.push(`/lab/guide?hand=${hand}` as Href)}
        hitSlop={6}
        style={s.guide}
      >
        <Text style={[TYPE.buttonCompact, { color: c.muted }]}>촬영 방법</Text>
        <Icon name="chevron-right" size={14} color={c.muted} />
      </Pressable>
    </View>
  );
}

const PHASE_TEXT: Record<NonNullable<AppLabListItem['phase']>, string> = {
  active: '분석 중',
  done: '완료',
  failed: '실패',
  none: '분석 전',
  broken: '올리다 멈춤',
};

function Recent({ data, all, setAll, onChanged, c }: { data: Extract<Loaded, { ok: true }>; all: boolean; setAll: (v: boolean) => void; onChanged: () => void; c: Palette }) {
  const items = data.samples;
  const running = items.filter((x) => x.phase === 'active');
  if (items.length === 0)
    return (
      <View style={{ gap: 6, alignItems: 'center', paddingVertical: 20 }}>
        <Text style={[TYPE.card, { color: c.ink }]}>아직 분석한 투구가 없어요</Text>
        <Text style={[TYPE.body, { color: c.muted, textAlign: 'center' }]}>
          같은 투구를 옆({labSideBase(data.hand)} 쪽)과 뒤(2루 쪽)에서 동시에 찍어 시작해 보세요.
        </Text>
      </View>
    );
  if (all)
    return (
      <View style={{ gap: 8 }}>
        <View style={s.secHead}>
          <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink, flex: 1 }]}>
            모든 분석
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setAll(false)} hitSlop={6} style={s.secLink}>
            <Text style={[TYPE.buttonCompact, { color: c.link }]}>접기</Text>
          </Pressable>
        </View>
        {data.isAdmin ? (
          /* 관리자는 여러 사람 투구를 올린다 — 사람 폴더(2026-10-22 김민). 번호는 묶기 전 전체 차례 그대로 */
          <View style={{ gap: 10 }}>
            {groupLabSamples(items, (x) => x.subject, LAB_SUBJECT_FOLDERS).map((g) => (
              <SampleGroup key={g.name} name={g.name} count={g.items.length} c={c}>
                {g.items.map((x, i) => (
                  <SampleRow key={x.id} item={x} name={`투구 ${items.length - items.indexOf(x)}`} last={i === g.items.length - 1} onRemoved={onChanged} c={c} />
                ))}
              </SampleGroup>
            ))}
          </View>
        ) : (
          <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
            {items.map((x, i) => (
              <RecentRow key={x.id} item={x} last={i === items.length - 1} onChanged={onChanged} c={c} />
            ))}
          </View>
        )}
      </View>
    );
  const recent = [...running, ...items.filter((x) => x.phase !== 'active')].slice(0, RECENT);
  return (
    <View style={{ gap: 8 }}>
      <View style={s.secHead}>
        <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink, flex: 1 }]}>
          최근 분석
        </Text>
        {items.length > RECENT || data.isAdmin ? (
          <Pressable accessibilityRole="button" onPress={() => setAll(true)} hitSlop={6} style={s.secLink}>
            <Text style={[TYPE.buttonCompact, { color: c.link }]}>전체 보기</Text>
            <Icon name="chevron-right" size={14} color={c.link} />
          </Pressable>
        ) : null}
      </View>
      <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
        {recent.map((x, i) => (
          <RecentRow key={x.id} item={x} last={i === recent.length - 1} onChanged={onChanged} c={c} />
        ))}
      </View>
    </View>
  );
}

/** 최근 분석 한 줄 — 날짜 · 시간, 던진 곳 · 손 · 상태. ⋯ 은 지우기(확인을 거친다 — 서버 removeLabSample 이 본인 · 관리자 범위를 본다) */
function RecentRow({ item, last, onChanged, c }: { item: AppLabListItem; last: boolean; onChanged: () => void; c: Palette }) {
  const [busy, setBusy] = useState(false);
  const phase = item.phase ?? (item.broken ? 'broken' : item.status?.tone === 'sky' ? 'active' : item.report ? 'done' : 'none');
  const tone = phase === 'active' ? c.sky : phase === 'failed' || phase === 'broken' ? c.warn : phase === 'done' ? c.ok : c.muted;
  const name = item.when ?? '날짜 모름';
  const meta = [item.ground ? (item.ground === 'flat' ? '평지' : '마운드') : null, item.hand ? (item.hand === 'L' ? '왼손' : '오른손') : null].filter(Boolean).join(' · ');
  const remove = () =>
    Alert.alert(`${name} 분석을 지울까요?`, '옆 · 뒤 영상과 3D 결과가 함께 지워져요. 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void rpc<{ ok: true } | { error: string }>('pitch-lab.removeLabSample', { id: item.id })
            .then(
              (r) => {
                if ('error' in r) return toast(`지우지 못했어요. ${r.error}`, 'error');
                onChanged();
              },
              () => toast('신호가 약해 지우지 못했어요. 다시 해 주세요.', 'error')
            )
            .then(() => setBusy(false));
        },
      },
    ]);
  const menu = () =>
    Alert.alert(name, undefined, [
      ...(item.broken ? [] : [{ text: phase === 'active' ? '진행 보기' : '열기', onPress: () => router.push(`/lab/${item.id}` as Href) }]),
      { text: '지우기', style: 'destructive' as const, onPress: remove },
      { text: '닫기', style: 'cancel' as const },
    ]);
  return (
    <View style={[s.row, { opacity: busy ? 0.5 : 1 }, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${meta}, ${PHASE_TEXT[phase]}`}
        disabled={item.broken}
        onPress={() => router.push(`/lab/${item.id}` as Href)}
        style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.6 : 1 }]}
      >
        <View style={[s.rowIcon, { backgroundColor: c.skyTint }]}>
          <PitcherMark size={40} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[TYPE.card, { color: c.ink }]} numberOfLines={1}>
            {name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {meta ? <Text style={[TYPE.sub, { color: c.muted }]}>{meta}</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Icon name={phase === 'done' ? 'circle-check' : phase === 'active' ? 'ellipsis' : phase === 'failed' || phase === 'broken' ? 'circle-alert' : 'circle'} size={13} color={tone} />
              <Text style={[TYPE.sub, { color: tone, fontWeight: '600' }]}>{PHASE_TEXT[phase]}</Text>
            </View>
            {phase === 'done' && item.report ? <Text style={[TYPE.sub, { color: c.muted }]}>· {item.report.text}</Text> : null}
          </View>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${name} 더보기`} disabled={busy} onPress={menu} hitSlop={6} style={s.more}>
        <Icon name="ellipsis" size={20} color={c.muted} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 28, padding: 20, gap: 14 },
  art: { height: 176, alignItems: 'center', justifyContent: 'center' },
  figure: { width: 148, height: 148, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  viewCard: { position: 'absolute', width: 66, height: 72, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 6 },
  viewText: { fontSize: 12, fontWeight: '700' },
  link: { position: 'absolute', width: 34, height: 2, borderRadius: 1 },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  cta: { minHeight: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  guide: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 12 },
  secHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  secLink: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  group: { borderRadius: 22, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 72, paddingLeft: 14, paddingRight: 4, paddingVertical: 10 },
  rowIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
