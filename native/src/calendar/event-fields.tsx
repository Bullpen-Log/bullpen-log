import { DatePicker, Host } from '@expo/ui/swift-ui';
import { datePickerStyle } from '@expo/ui/swift-ui/modifiers';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { REMIND_OPTIONS, timeLabel } from '@/lib/calendar-event';
import { toDateKey } from '@/lib/pitch-stats';
import { useTheme, type Palette } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';
import { calendarDateLabel } from './parts';
import {
  alarmForDraft,
  eventInput,
  toggleAllDay,
  type EventDraft,
} from './event-model';

export const eventDateLabel = (date: string) =>
  `${date.slice(0, 4)}년 ${calendarDateLabel(date)}`;
export type EventPicker = 'date' | 'time' | 'reminder';
export function EventGroup({ children, c }: { children: ReactNode; c: Palette }) {
  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: 24,
        padding: 18,
        gap: 14,
        boxShadow: c.float,
      }}
    >
      {children}
    </View>
  );
}
export function EventButton({
  label,
  onPress,
  disabled,
  secondary,
  c,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  c: Palette;
}) {
  return (
    <Press
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 54,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        backgroundColor: secondary ? c.card : c.action,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text
        style={{
          color: secondary ? c.link : c.onAction,
          fontSize: 16,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Press>
  );
}
export function EventNotice({
  text,
  action,
  onPress,
  c,
}: {
  text: string;
  action?: string;
  onPress?: () => void;
  c: Palette;
}) {
  return (
    <View
      accessibilityRole="alert"
      style={{ borderRadius: 18, padding: 15, backgroundColor: c.warnBg, gap: 4 }}
    >
      <Text style={{ color: c.warn, fontSize: 14, lineHeight: 21 }}>{text}</Text>
      {action && onPress ? (
        <Press
          accessibilityRole="button"
          onPress={onPress}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ color: c.warn, fontSize: 14, fontWeight: '600' }}>
            {action}
          </Text>
        </Press>
      ) : null}
    </View>
  );
}
export function EventRow({
  icon,
  label,
  value,
  onPress,
  c,
}: {
  icon: IconName;
  label: string;
  value: string;
  onPress?: () => void;
  c: Palette;
}) {
  const body = (
    <>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: c.skyTint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={18} color={c.link} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 12, color: c.muted }}>{label}</Text>
        <Text
          style={{ fontSize: 16, color: onPress ? c.link : c.ink, fontWeight: '600' }}
        >
          {value}
        </Text>
      </View>
      {onPress ? <Icon name="chevron-right" size={14} color={c.muted} /> : null}
    </>
  );
  return onPress ? (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      onPress={onPress}
      style={s.row}
    >
      {body}
    </Press>
  ) : (
    <View style={s.row}>{body}</View>
  );
}
export const reminderLabel = (d: EventDraft) => {
  const option = REMIND_OPTIONS.find((o) => o.value === eventInput(d).remindMin);
  return option ? (d.allDay ? option.allDayLabel : option.label) : '없음';
};
export const reminderDateLabel = (d: EventDraft) => {
  const at = alarmForDraft(d);
  return at == null || (!d.allDay && !d.time)
    ? null
    : `${calendarDateLabel(toDateKey(new Date(at)))} ${timeLabel(`${String(new Date(at).getHours()).padStart(2, '0')}:${String(new Date(at).getMinutes()).padStart(2, '0')}`)}`;
};

export function EventFields({
  draft: d,
  setDraft,
  onPicker,
  disabled,
  c,
}: {
  draft: EventDraft;
  setDraft: (d: EventDraft) => void;
  onPicker: (p: EventPicker) => void;
  disabled: boolean;
  c: Palette;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const at = alarmForDraft(d);
  return (
    <View
      pointerEvents={disabled ? 'none' : 'auto'}
      style={{ gap: 16, opacity: disabled ? 0.65 : 1 }}
    >
      <EventGroup c={c}>
        <Text style={{ color: c.muted, fontSize: 13 }}>일정 이름</Text>
        <TextInput
          accessibilityLabel="일정 이름"
          placeholder="어떤 일정인가요?"
          placeholderTextColor={c.muted}
          value={d.title}
          onChangeText={(title) => setDraft({ ...d, title })}
          maxLength={40}
          editable={!disabled}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          style={{
            color: c.ink,
            fontSize: 24,
            fontWeight: '700',
            padding: 0,
            minHeight: 40,
          }}
        />
        <Text style={{ color: c.muted, fontSize: 11, textAlign: 'right' }}>
          {d.title.length}/40
        </Text>
      </EventGroup>
      <EventGroup c={c}>
        <EventRow
          icon="calendar-days"
          label="날짜"
          value={eventDateLabel(d.date)}
          onPress={() => onPicker('date')}
          c={c}
        />
        <View style={[s.line, { backgroundColor: c.line }]} />
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.ink, fontSize: 16, fontWeight: '600' }}>종일</Text>
          </View>
          <Switch
            accessibilityLabel="종일"
            value={d.allDay}
            disabled={disabled}
            onValueChange={(v) => setDraft(toggleAllDay(d, v))}
            trackColor={{ true: c.action }}
          />
        </View>
        {!d.allDay ? (
          <>
            <View style={[s.line, { backgroundColor: c.line }]} />
            <EventRow
              icon="clock-3"
              label="시간"
              value={d.time ? timeLabel(d.time) : '시간 선택'}
              onPress={() => onPicker('time')}
              c={c}
            />
          </>
        ) : null}
      </EventGroup>
      <EventGroup c={c}>
        <EventRow
          icon="bell"
          label="알림"
          value={reminderLabel(d)}
          onPress={() => onPicker('reminder')}
          c={c}
        />
        {!d.allDay && reminderDateLabel(d) ? (
          <Text style={{ color: c.muted, fontSize: 12, lineHeight: 19 }}>
            {reminderDateLabel(d)}
          </Text>
        ) : null}
        {at != null && at <= now && (d.allDay || d.time) ? (
          <Text style={{ color: c.warn, fontSize: 13, lineHeight: 20 }}>
            알림 시간이 지났어요. 일정은 저장할 수 있어요.
          </Text>
        ) : null}
      </EventGroup>
      <EventGroup c={c}>
        <Text style={{ color: c.muted, fontSize: 13 }}>
          메모 <Text style={{ fontSize: 11 }}>선택</Text>
        </Text>
        <TextInput
          accessibilityLabel="메모"
          placeholder="장소나 준비물"
          placeholderTextColor={c.muted}
          value={d.memo}
          onChangeText={(memo) => setDraft({ ...d, memo })}
          maxLength={300}
          multiline
          editable={!disabled}
          textAlignVertical="top"
          style={{
            minHeight: 90,
            padding: 0,
            color: c.ink,
            fontSize: 16,
            lineHeight: 25,
          }}
        />
        <Text style={{ color: c.muted, fontSize: 11, textAlign: 'right' }}>
          {d.memo.length}/300
        </Text>
      </EventGroup>
    </View>
  );
}

/** An in-modal overlay avoids a second native presentation and requires an explicit selection. */
export function EventPickerOverlay({
  kind,
  draft,
  today,
  onApply,
  onClose,
  c,
}: {
  kind: EventPicker;
  draft: EventDraft;
  today: string;
  onApply: (patch: Partial<EventDraft>) => void;
  onClose: () => void;
  c: Palette;
}) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const [date, setDate] = useState(
    () => new Date(`${draft.date}T${draft.time || '09:00'}:00`)
  );
  const [raw, setRaw] = useState(kind === 'date' ? draft.date : draft.time || '09:00');
  const [remind, setRemind] = useState(eventInput(draft).remindMin ?? null);
  const year = Number(today.slice(0, 4));
  const validRaw =
    kind === 'time'
      ? /^([01]\d|2[0-3]):[0-5]\d$/.test(raw)
      : /^\d{4}-\d{2}-\d{2}$/.test(raw) &&
        Number(raw.slice(0, 4)) >= year - 5 &&
        Number(raw.slice(0, 4)) <= year + 5 &&
        !Number.isNaN(new Date(`${raw}T12:00:00`).getTime()) &&
        toDateKey(new Date(`${raw}T12:00:00`)) === raw;
  const apply = () => {
    if (kind === 'reminder') onApply({ remind });
    else if (Platform.OS === 'ios')
      onApply(
        kind === 'date'
          ? { date: toDateKey(date) }
          : {
              time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
              lastTime: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
            }
      );
    else if (validRaw)
      onApply(kind === 'date' ? { date: raw } : { time: raw, lastTime: raw });
  };
  return (
    <View
      accessibilityViewIsModal
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: 'rgba(0,0,0,0.36)',
          justifyContent: 'flex-end',
          alignItems: 'center',
        },
      ]}
    >
      <Animated.View
        entering={reduce ? undefined : FadeIn.duration(180)}
        style={{
          backgroundColor: c.page,
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          padding: 20,
          paddingBottom: 30,
          width: '100%',
          maxWidth: 540,
          gap: 14,
          maxHeight: '90%',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{ fontSize: 21, fontWeight: '700', color: c.ink }}
          >
            {kind === 'date' ? '날짜 선택' : kind === 'time' ? '시간 선택' : '알림'}
          </Text>
          <Press
            accessibilityRole="button"
            accessibilityLabel="선택 취소"
            onPress={onClose}
            style={{
              minWidth: 44,
              minHeight: 44,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Icon name="x" size={20} color={c.muted} />
          </Press>
        </View>
        {kind === 'reminder' ? (
          <ScrollView>
            {REMIND_OPTIONS.map((o) => (
              <Press
                key={String(o.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: remind === o.value }}
                onPress={() => setRemind(o.value)}
                style={[
                  s.row,
                  {
                    minHeight: 56,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: c.line,
                  },
                ]}
              >
                <Text style={{ flex: 1, color: c.ink, fontSize: 16 }}>
                  {draft.allDay ? o.allDayLabel : o.label}
                </Text>
                {remind === o.value ? (
                  <Icon name="check" size={19} color={c.link} />
                ) : null}
              </Press>
            ))}
          </ScrollView>
        ) : Platform.OS === 'ios' ? (
          <Host
            colorScheme={theme === 'light' ? 'light' : 'dark'}
            seedColor={c.action}
            style={{ height: kind === 'date' ? 345 : 210, width: '100%' }}
          >
            <DatePicker
              title={kind === 'date' ? '날짜' : '시간'}
              selection={date}
              range={
                kind === 'date'
                  ? {
                      start: new Date(year - 5, 0, 1),
                      end: new Date(year + 5, 11, 31, 23, 59),
                    }
                  : undefined
              }
              displayedComponents={[kind === 'date' ? 'date' : 'hourAndMinute']}
              onDateChange={setDate}
              modifiers={[datePickerStyle(kind === 'date' ? 'graphical' : 'wheel')]}
            />
          </Host>
        ) : (
          <TextInput
            accessibilityLabel={kind === 'date' ? '날짜 입력' : '시간 입력'}
            value={raw}
            onChangeText={setRaw}
            placeholder={kind === 'date' ? 'YYYY-MM-DD' : 'HH:MM'}
            style={{
              backgroundColor: c.card,
              padding: 18,
              borderRadius: 16,
              color: c.ink,
              fontSize: 22,
            }}
          />
        )}
        <EventButton
          label="선택 완료"
          disabled={kind !== 'reminder' && Platform.OS !== 'ios' && !validRaw}
          onPress={apply}
          c={c}
        />
      </Animated.View>
    </View>
  );
}
const s = StyleSheet.create({
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { height: StyleSheet.hairlineWidth },
});
