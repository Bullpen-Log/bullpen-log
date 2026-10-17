import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  EVENT_MEMO_MAX,
  EVENT_TITLE_MAX,
  REMIND_OPTIONS,
  defaultRemind,
  remindAt,
  sortEvents,
  timeLabel,
  type CalendarEventView,
} from '@/lib/calendar-event';
import { BullpenNative } from '../../modules/bullpen-native';
import { rpc } from '~/lib/rpc';
import { usePalette } from '~/lib/ui';

/**
 * 홈 그날 칸의 일정 — 웹 홈 달력의 일정(app/(app)/today/day-schedule.tsx)과 같은 자료 · 같은 서버 동작(calendar-event.*). 다른 관리자의 일정은
 * 보기만. 알림은 앱이 바로 건다(웹 event-alarms.ts 와 같은 이름 'event-<id>' — 웹 홈이 다시 그려지면 같은 이름이라 덮어쓴다).
 */
const days = new Map<string, CalendarEventView[]>();
export const resetEventsCache = () => days.clear();

type SaveResult = { ok: true; event: CalendarEventView } | { ok: false; error: string };

function syncAlarm(e: CalendarEventView) {
  const at = remindAt(e);
  const id = `event-${e.id}`;
  if (at == null || at <= Date.now()) return void BullpenNative.cancelAlarm(id).catch(() => undefined);
  const body = [timeLabel(e.time), e.memo?.split('\n')[0]].filter(Boolean).join(' · ');
  void BullpenNative.scheduleAlarm(id, at, e.title, body).catch(() => undefined);
}

export function DayEvents({ date }: { date: string }) {
  const c = usePalette();
  const [state, setState] = useState<{ date: string; list: CalendarEventView[] | null }>(() => ({
    date,
    list: days.get(date) ?? null,
  }));
  const [sheet, setSheet] = useState<{ event: CalendarEventView | null } | null>(null);

  useEffect(() => {
    let alive = true;
    rpc<{ ok: true; events: CalendarEventView[] } | { ok: false; error: string }>('app.loadAppDayEvents', date).then(
      (r) => {
        if (!r.ok || !alive) return;
        days.set(date, r.events);
        setState({ date, list: r.events });
      },
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [date]);

  const list = state.date === date ? state.list ?? days.get(date) ?? null : days.get(date) ?? null;
  const put = (next: CalendarEventView[]) => {
    const sorted = sortEvents(next);
    days.set(date, sorted);
    setState({ date, list: sorted });
  };

  return (
    <View style={{ gap: 4 }}>
      <View style={styles.head}>
        <Text style={[styles.label, { color: c.muted }]}>일정</Text>
        <Text style={{ flex: 1, color: c.ink, fontSize: 15 }}>{list && list.length === 0 ? '일정 없음' : ''}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="일정 더하기" onPress={() => setSheet({ event: null })} hitSlop={8}>
          <Text style={{ color: c.sky, fontSize: 14, fontWeight: '600' }}>+ 일정</Text>
        </Pressable>
      </View>
      {(list ?? []).map((e) => (
        <Pressable
          key={e.id}
          accessibilityRole="button"
          disabled={!!e.owner}
          onPress={() => setSheet({ event: e })}
          style={styles.item}
        >
          <Text style={{ width: 52, color: c.sky, fontSize: 14, fontWeight: '600' }}>{timeLabel(e.time)}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.ink, fontSize: 15 }} numberOfLines={1}>
              {e.title}
              {e.owner ? ` · ${e.owner}` : ''}
            </Text>
            {e.memo ? (
              <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={2}>
                {e.memo}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
      {sheet ? (
        <EventSheet
          date={date}
          event={sheet.event}
          onClose={() => setSheet(null)}
          onSaved={(e) => {
            put([...(list ?? []).filter((x) => x.id !== e.id), e]);
            syncAlarm(e);
            setSheet(null);
          }}
          onDeleted={(id) => {
            put((list ?? []).filter((x) => x.id !== id));
            void BullpenNative.cancelAlarm(`event-${id}`).catch(() => undefined);
            setSheet(null);
          }}
        />
      ) : null}
    </View>
  );
}

function EventSheet({
  date,
  event,
  onClose,
  onSaved,
  onDeleted,
}: {
  date: string;
  event: CalendarEventView | null;
  onClose: () => void;
  onSaved: (e: CalendarEventView) => void;
  onDeleted: (id: string) => void;
}) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [title, setTitle] = useState(event?.title ?? '');
  const [time, setTime] = useState(event?.time ?? '');
  const [memo, setMemo] = useState(event?.memo ?? '');
  const [remind, setRemind] = useState<number | null>(event ? event.remindMin : defaultRemind(null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allDay = !time.trim();

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await rpc<SaveResult>('calendar-event.saveCalendarEvent', event?.id ?? null, {
        date,
        title,
        time: time.trim() || null,
        memo: memo.trim() || null,
        remindMin: remind,
      });
      if (!res.ok) return setError(res.error);
      onSaved(res.event);
    } catch {
      setError('신호가 약해 저장하지 못했어요. 적은 것은 그대로 있어요.');
    } finally {
      setBusy(false);
    }
  };
  const remove = () =>
    event &&
    Alert.alert('이 일정을 지울까요?', event.title, [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const res = await rpc<{ ok: true } | { ok: false; error: string }>('calendar-event.deleteCalendarEvent', event.id);
            if (!res.ok) setError(res.error);
            else onDeleted(event.id);
          } catch {
            setError('신호가 약해 지우지 못했어요.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  const [, m, d] = date.split('-').map(Number);
  const input = [styles.input, { backgroundColor: c.card, color: c.ink }];
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
        <View style={styles.bar}>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10}>
            <Text style={{ color: c.sky, fontSize: 17 }}>취소</Text>
          </Pressable>
          <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>
            {m}월 {d}일 {event ? '일정 고치기' : '새 일정'}
          </Text>
          <Pressable accessibilityRole="button" onPress={save} disabled={busy} hitSlop={10}>
            <Text style={{ color: c.sky, fontSize: 17, fontWeight: '700', opacity: busy ? 0.4 : 1 }}>저장</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: inset.bottom + 24 }} keyboardShouldPersistTaps="handled">
          <Text style={[styles.sheetLabel, { color: c.muted }]}>제목</Text>
          <TextInput value={title} onChangeText={setTitle} maxLength={EVENT_TITLE_MAX} placeholder="예: 연습 경기" placeholderTextColor={c.muted} style={input} />
          <Text style={[styles.sheetLabel, { color: c.muted }]}>시각(비우면 하루 종일)</Text>
          <TextInput
            value={time}
            onChangeText={(v) => {
              /* 19:30 꼴 — 숫자만 치면 쌍점을 넣어 준다 */
              const digits = v.replace(/\D/g, '').slice(0, 4);
              setTime(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
            }}
            keyboardType="number-pad"
            placeholder="예: 19:30"
            placeholderTextColor={c.muted}
            style={input}
          />
          <Text style={[styles.sheetLabel, { color: c.muted }]}>알림</Text>
          <View style={styles.chips}>
            {REMIND_OPTIONS.map((o) => {
              const on = remind === o.value;
              return (
                <Pressable
                  key={String(o.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setRemind(o.value)}
                  style={[styles.chip, { backgroundColor: on ? c.sky : c.chip }]}
                >
                  <Text style={{ color: on ? '#fff' : c.ink, fontSize: 14, fontWeight: '600' }}>{allDay ? o.allDayLabel : o.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.sheetLabel, { color: c.muted }]}>메모</Text>
          <TextInput
            value={memo}
            onChangeText={setMemo}
            maxLength={EVENT_MEMO_MAX}
            multiline
            placeholder="선택"
            placeholderTextColor={c.muted}
            style={[input, { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' }]}
          />
          {error ? <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text> : null}
          {event ? (
            <Pressable accessibilityRole="button" onPress={remove} disabled={busy} style={[styles.delete, { backgroundColor: c.card }]}>
              <Text style={{ color: c.danger, fontSize: 17, fontWeight: '600' }}>일정 지우기</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  label: { width: 52, fontSize: 14, fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  sheetLabel: { fontSize: 13, fontWeight: '600', marginTop: 10 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center' },
  delete: { marginTop: 16, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
