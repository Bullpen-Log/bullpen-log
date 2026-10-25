import { ActivityIndicator, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { CONTROL, RADIUS, TYPE, usePalette } from '~/lib/ui';
import { Icon, type IconName } from './icon';
import { Press } from './press';

/** 주요 행동은 색·글자·누름 영역을 공유한다. 긴 문구와 큰 글씨는 높이가 늘어난다. */
export function ActionButton({
  label,
  onPress,
  icon,
  compact = false,
  tone = 'primary',
  disabled = false,
  busy = false,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  compact?: boolean;
  tone?: 'primary' | 'secondary';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = usePalette();
  const blocked = disabled || busy;
  const color = tone === 'primary' ? c.onAction : c.link;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy }}
      disabled={blocked}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={[
        styles.button,
        { minHeight: compact ? CONTROL.compact : CONTROL.height, backgroundColor: tone === 'primary' ? c.action : c.chip },
        style,
        blocked && { opacity: 0.55 },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={color} /> : icon ? <Icon name={icon} size={16} color={color} /> : null}
      <Text style={[compact ? TYPE.buttonCompact : TYPE.button, styles.label, { color }]}>{label}</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: CONTROL.gap, borderRadius: RADIUS.pill, paddingHorizontal: 20, paddingVertical: 10 },
  label: { flexShrink: 1, textAlign: 'center' },
});
