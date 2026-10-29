import { router, type Href, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { useMenu } from '~/shell/menu-store';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';
import { useVideoDraft } from '~/videos/outbox';

/**
 * 내 영상 + → 추가 방법(2026-10-29 확정 시안 01-add '추가 방법 선택') — 내용만큼 올라오는 시스템 시트(_layout formSheet).
 * 앨범에서 가져오기 · 촬영하기가 먼저. 쓰다 만 영상이 있으면 맨 위에 이어서 쓰기. 구속 측정 · ABS 는 지우지 않고 밑에 '측정 도구'로 갈라 둔다
 * (투구 탭 도크와 같은 곳으로 간다 · ABS 는 권한 있는 사람만). 고르면 이 시트를 닫고 그 화면으로 바꾼다(위에 쌓지 않음).
 */
export default function AddVideoSheet() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { sport } = useLocalSearchParams<{ sport?: string }>();
  const draft = useVideoDraft();
  const menu = useMenu();
  const canAbs =
    menu.isAdmin === true ||
    menu.groups.some((g) => g.items.some((i) => i.href === '/abs'));
  const go = (source: 'album' | 'camera' | 'resume') =>
    router.replace({
      pathname: '/my-videos/new' as never,
      params:
        source === 'resume'
          ? { resume: '1' }
          : { source, sport: sport === 'hit' ? 'hit' : 'pitch' },
    });
  const tool = (href: string) => router.replace(href as Href);

  return (
    <View
      style={[
        styles.sheet,
        { paddingBottom: Math.max(inset.bottom, 16), backgroundColor: c.page },
      ]}
    >
      <Text
        accessibilityRole="header"
        style={[TYPE.section, { color: c.ink, paddingHorizontal: 4 }]}
      >
        영상 추가
      </Text>
      {draft ? (
        <Choice
          icon="pencil"
          title="작성 중인 영상 이어서"
          sub={
            draft.input.feelNote?.trim()
              ? draft.input.feelNote.trim()
              : '저장 전 영상이 있어요'
          }
          onPress={() => go('resume')}
          accent
        />
      ) : null}
      <View style={[styles.group, { backgroundColor: c.card, boxShadow: c.float }]}>
        <Choice
          icon="image-plus"
          title="앨범에서 가져오기"
          sub="저장된 영상 선택"
          onPress={() => go('album')}
        />
        <View style={[styles.sep, { backgroundColor: c.line }]} />
        <Choice
          icon="camera"
          title="촬영하기"
          sub="지금 투구 남기기"
          onPress={() => go('camera')}
        />
      </View>
      <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4, marginTop: 4 }]}>
        측정 도구
      </Text>
      <View style={[styles.group, { backgroundColor: c.card, boxShadow: c.float }]}>
        <Choice
          icon="radar"
          title="구속 측정"
          compact
          onPress={() => tool('/velocity?mode=speed')}
        />
        {canAbs ? (
          <>
            <View style={[styles.sep, { backgroundColor: c.line }]} />
            <Choice
              icon="zone"
              title="ABS 판정"
              compact
              onPress={() => tool('/velocity?mode=abs')}
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

function Choice({
  icon,
  title,
  sub,
  onPress,
  compact,
  accent,
}: {
  icon: IconName;
  title: string;
  sub?: string;
  onPress: () => void;
  compact?: boolean;
  accent?: boolean;
}) {
  const c = usePalette();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}, ${sub}` : title}
      onPress={onPress}
      style={[
        styles.choice,
        compact ? styles.compact : null,
        accent ? { backgroundColor: withAlpha(c.action, 0.1), borderRadius: 18 } : null,
      ]}
    >
      <View
        style={[
          compact ? styles.iconSmall : styles.icon,
          { backgroundColor: withAlpha(c.action, accent ? 0.16 : 0.1) },
        ]}
      >
        <Icon name={icon} size={compact ? 18 : 22} color={c.link} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          maxFontSizeMultiplier={1.8}
          style={[compact ? TYPE.body : TYPE.card, { color: c.ink, fontWeight: '600' }]}
        >
          {title}
        </Text>
        {sub ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.8}
            style={[TYPE.sub, { color: c.muted }]}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-right" size={18} color={c.muted} />
    </Press>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 16, paddingTop: 24, gap: 10 },
  group: { borderRadius: 18, overflow: 'hidden' },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 68 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  compact: { minHeight: 52, paddingVertical: 6 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 5,
  },
});
