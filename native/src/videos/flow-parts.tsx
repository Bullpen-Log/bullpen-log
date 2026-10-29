import { Image } from 'expo-image';
import { useEffect, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { thumbSource, usePathThumbs, type Thumb } from '~/pitch/store';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 영상 추가 · 덕아웃 공유 화면이 같이 쓰는 조각(2026-10-29 확정 시안 01-add · 02-share) — 위 막대 · 결과 판 · 아래 단추 줄 · 영상 요약 카드.
 * 상태는 부모가 실제 값으로 정한다 — 여기엔 시계도 가짜 퍼센트도 없다.
 */
export function FlowBar({
  title,
  onBack,
  backLabel = '뒤로',
  backDisabled,
  right,
}: {
  title: string;
  onBack: () => void;
  backLabel?: string;
  backDisabled?: boolean;
  right?: { label: string; onPress: () => void; disabled?: boolean } | null;
}) {
  const c = usePalette();
  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        accessibilityState={{ disabled: !!backDisabled }}
        disabled={backDisabled}
        onPress={onBack}
        hitSlop={6}
        style={styles.barButton}
      >
        <Icon name="back" size={22} color={backDisabled ? c.muted : c.link} />
      </Pressable>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        maxFontSizeMultiplier={1.6}
        style={[TYPE.card, styles.barTitle, { color: c.ink }]}
      >
        {title}
      </Text>
      {right ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !!right.disabled }}
          disabled={right.disabled}
          onPress={right.onPress}
          hitSlop={6}
          style={[styles.barButton, styles.barText]}
        >
          <Text
            maxFontSizeMultiplier={1.6}
            style={[
              TYPE.body,
              { color: right.disabled ? c.muted : c.link, fontWeight: '600' },
            ]}
          >
            {right.label}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.barButton} />
      )}
    </View>
  );
}

/** 결과 판 — 둥근 표식 · 제목 · 짧은 설명 · 그 밑 내용. 바뀌면 화면 읽기에 제목을 알린다 */
export function Outcome({
  icon,
  tone = 'action',
  busy,
  title,
  text,
  children,
}: {
  icon: IconName;
  tone?: 'action' | 'good' | 'warn' | 'danger';
  /** 끝을 모르는 처리 중 — 표식 대신 돌개 */
  busy?: boolean;
  title: string;
  text?: string | null;
  children?: ReactNode;
}) {
  const c = usePalette();
  const color =
    tone === 'good'
      ? c.action
      : tone === 'warn'
        ? c.warn
        : tone === 'danger'
          ? c.danger
          : c.action;
  const reduced = useReducedMotion();
  const pop = useSharedValue(reduced ? 1 : 0.85);
  useEffect(() => {
    pop.set(reduced ? 1 : withSpring(1, { damping: 14, stiffness: 220 }));
    AccessibilityInfo.announceForAccessibility(title);
  }, [title, reduced, pop]);
  const markStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  return (
    <View style={styles.outcome}>
      <Animated.View
        style={[styles.mark, { backgroundColor: withAlpha(color, 0.12) }, markStyle]}
      >
        {busy ? (
          <ActivityIndicator color={color} />
        ) : (
          <Icon name={icon} size={28} color={color} />
        )}
      </Animated.View>
      <Text
        accessibilityRole="header"
        style={[TYPE.section, { color: c.ink, textAlign: 'center' }]}
      >
        {title}
      </Text>
      {text ? (
        <Text style={[TYPE.body, { color: c.muted, textAlign: 'center' }]}>{text}</Text>
      ) : null}
      {children ? <View style={styles.outcomeBody}>{children}</View> : null}
    </View>
  );
}

export type FooterAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  icon?: IconName;
  danger?: boolean;
};

/** 아래 단추 줄 — 큰 단추 하나 + 글자 단추(있으면). 안전 영역 위에 붙는다 */
export function FooterActions({
  primary,
  secondary,
  note,
}: {
  primary?: FooterAction | null;
  secondary?: FooterAction | null;
  note?: string | null;
}) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.footer,
        {
          paddingBottom: Math.max(inset.bottom, 12),
          backgroundColor: c.page,
          borderTopColor: c.line,
        },
        READABLE,
      ]}
    >
      {note ? (
        <Text style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]}>{note}</Text>
      ) : null}
      {primary ? (
        <Press
          accessibilityRole="button"
          accessibilityState={{
            disabled: !!primary.disabled || !!primary.busy,
            busy: !!primary.busy,
          }}
          disabled={primary.disabled || primary.busy}
          onPress={primary.onPress}
          style={[
            styles.primary,
            {
              backgroundColor: primary.disabled
                ? withAlpha(c.ink, 0.1)
                : primary.danger
                  ? c.danger
                  : c.action,
            },
          ]}
        >
          {primary.busy ? (
            <ActivityIndicator color={c.onAction} />
          ) : primary.icon ? (
            <Icon
              name={primary.icon}
              size={18}
              color={primary.disabled ? c.muted : c.onAction}
            />
          ) : null}
          <Text
            maxFontSizeMultiplier={1.6}
            style={[TYPE.button, { color: primary.disabled ? c.muted : c.onAction }]}
          >
            {primary.label}
          </Text>
        </Press>
      ) : null}
      {secondary ? (
        <Press
          accessibilityRole="button"
          accessibilityState={{ disabled: !!secondary.disabled }}
          disabled={secondary.disabled}
          onPress={secondary.onPress}
          style={styles.secondary}
        >
          {secondary.icon ? (
            <Icon
              name={secondary.icon}
              size={16}
              color={secondary.disabled ? c.muted : c.link}
            />
          ) : null}
          <Text
            maxFontSizeMultiplier={1.6}
            style={[
              TYPE.buttonCompact,
              {
                color: secondary.disabled
                  ? c.muted
                  : secondary.danger
                    ? c.danger
                    : c.link,
              },
            ]}
          >
            {secondary.label}
          </Text>
        </Press>
      ) : null}
    </View>
  );
}

/** 영상 한 줄 요약 — 장면 그림(실제 파일에서) · 제목 · 아래 글 · 배지 */
export function VideoSummary({
  path,
  title,
  sub,
  badge,
}: {
  path: string;
  title: string;
  sub: string;
  badge?: { icon: IconName; label: string } | null;
}) {
  const c = usePalette();
  const thumbs = usePathThumbs([path]);
  const t = thumbs[path];
  return (
    <View
      style={[styles.summary, { backgroundColor: c.card, boxShadow: c.float }]}
      accessible
      accessibilityLabel={[title, sub, badge?.label].filter(Boolean).join(', ')}
    >
      <View style={styles.thumb}>
        {t ? (
          <Image
            source={thumbSource(t as Thumb)}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
          />
        ) : (
          <Icon name="film" size={20} color="rgba(255,255,255,0.6)" />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2} style={[TYPE.card, { color: c.ink }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[TYPE.sub, { color: c.muted }]}>
          {sub}
        </Text>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: withAlpha(c.action, 0.1) }]}>
            <Icon name={badge.icon} size={13} color={c.link} />
            <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>
              {badge.label}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** 막대 — 실제 바이트 진행률만(모르면 그리지 않는다) */
export function ProgressLine({ percent, label }: { percent: number; label: string }) {
  const c = usePalette();
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <View
      style={{ gap: 6, alignSelf: 'stretch' }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: p }}
    >
      <View style={[styles.track, { backgroundColor: withAlpha(c.ink, 0.08) }]}>
        <View style={[styles.fill, { width: `${p}%`, backgroundColor: c.action }]} />
      </View>
      <Text
        style={[
          TYPE.sub,
          { color: c.muted, textAlign: 'center', fontVariant: ['tabular-nums'] },
        ]}
      >
        {p}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 6,
    minHeight: 52,
  },
  barButton: {
    minWidth: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barText: { paddingHorizontal: 8 },
  barTitle: { flex: 1, textAlign: 'center' },
  outcome: { alignItems: 'center', gap: 10, paddingTop: 32, paddingHorizontal: 8 },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  outcomeBody: { alignSelf: 'stretch', marginTop: 12, gap: 12 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    width: '100%',
    alignSelf: 'center',
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 26,
    paddingHorizontal: 20,
  },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
  },
  thumb: {
    width: 56,
    height: 70,
    borderRadius: 10,
    backgroundColor: '#11151c',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 4,
  },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
