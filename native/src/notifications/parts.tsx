import { type ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withAlpha, type Palette } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';
export const INBOX_WIDTH = {
  width: '100%',
  maxWidth: 540,
  alignSelf: 'center',
} as const;
export function InboxTile({
  name,
  c,
  large = false,
}: {
  name: IconName;
  c: Palette;
  large?: boolean;
}) {
  return (
    <View
      style={{
        width: large ? 64 : 38,
        height: large ? 66 : 40,
        flexShrink: 0,
        borderRadius: large ? 23 : 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.skyTint,
        boxShadow: c.float,
      }}
    >
      <Icon name={name} size={large ? 30 : 21} color={c.link} />
    </View>
  );
}
export function InboxLink({
  label,
  onPress,
  c,
  disabled,
}: {
  label: string;
  onPress: () => void;
  c: Palette;
  disabled?: boolean;
}) {
  return (
    <Press
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 44,
        justifyContent: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 2,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ fontSize: 13, color: c.link, fontWeight: '600' }}>{label}</Text>
    </Press>
  );
}
export function InboxNotice({
  text,
  action,
  onPress,
  c,
  busy,
  info = false,
}: {
  text: string;
  action?: string;
  onPress?: () => void;
  c: Palette;
  busy?: boolean;
  info?: boolean;
}) {
  const color = info ? c.link : c.warn;
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: 9,
        padding: 14,
        borderRadius: 18,
        backgroundColor: info ? c.skyTint : c.warnBg,
        marginBottom: 12,
      }}
    >
      <Icon name="info" color={color} size={17} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color, fontSize: 13, lineHeight: 21 }}>{text}</Text>
        {action && onPress ? (
          <Press
            accessibilityRole="button"
            disabled={busy}
            onPress={onPress}
            style={{
              minHeight: 44,
              justifyContent: 'center',
              alignSelf: 'flex-start',
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Text style={{ color, fontSize: 13, fontWeight: '600' }}>{action}</Text>
          </Press>
        ) : null}
      </View>
    </View>
  );
}
export function InboxSheet({
  title,
  onClose,
  children,
  c,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  c: Palette;
}) {
  const reduce = useReducedMotion(),
    inset = useSafeAreaInsets();
  return (
    <Modal
      visible
      transparent
      animationType={reduce ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingTop: inset.top + 20,
        }}
      >
        <Press
          accessibilityRole="button"
          accessibilityLabel="창 닫기"
          onPress={onClose}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: withAlpha('#000000', 0.35) },
          ]}
        />
        <View
          accessibilityViewIsModal
          style={{
            width: '100%',
            maxWidth: 540,
            maxHeight: '90%',
            backgroundColor: c.card,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 20,
            paddingBottom: Math.max(20, inset.bottom),
            gap: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text
              accessibilityRole="header"
              style={{ flex: 1, color: c.ink, fontSize: 21, fontWeight: '700' }}
            >
              {title}
            </Text>
            <Press
              accessibilityRole="button"
              accessibilityLabel="닫기"
              onPress={onClose}
              style={{
                width: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.page,
                borderRadius: 22,
              }}
            >
              <Icon name="x" color={c.muted} size={20} />
            </Press>
          </View>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
