import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActionSheetIOS, Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
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
import { cacheEpoch } from '~/lib/store';
import { usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { fadeIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';

/**
 * 홈 달력의 일정 — 웹 홈(home-page.tsx 의 일정 전부 · pitch-log-panel eventCounts · day-schedule.tsx)과 같다.
 * - 일정은 한 번에 다 받는다(app.loadAppEvents, 웹과 같은 범위 · 상한) — 달력 칸 밑 막대 · 그날 칸 · 알림이 같이 쓴다.
 * - 받을 때마다 내 일정의 알림을 다시 건다(웹 useEventAlarms — 웹 · 다른 기기에서 만든 일정도 울리게).
 * - 그날 칸: 일정 줄(파란 막대 · 제목 · 다른 관리자 칩 · 시각 + 알림 종 · 메모 다), 누르면 그 자리에서 고치기,
 *   일정이 없으면 새 일정 폼이 펴진 채(제목에 커서), 있으면 '일정 추가' 단추.
 */
type Store = { list: CalendarEventView[] | null };
let store: Store = { list: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
let loading: Promise<void> | null = null;

export const resetEventsCache = () => {
  store = { list: null };
  /* 로그아웃 전에 떠난 받기가 끝나 앞사람 일정 · 알림을 다시 넣지 않게(reloadEvents 의 세대 확인과 같이) */
  loading = null;
  emit();
};

function syncAlarm(e: CalendarEventView) {
  const id = `event-${e.id}`;
  const at = e.owner ? null : remindAt(e);
  if (at == null || at <= Date.now()) return void BullpenNative.cancelAlarm(id).catch(() => undefined);
  const body = [timeLabel(e.time), e.memo?.split('\n')[0]].filter(Boolean).join(' · ');
  void BullpenNative.scheduleAlarm(id, at, e.title, body).catch(() => undefined);
}

/** 일정을 (다시) 받는다 — 홈이 보일 때마다. 알림도 다시 건다 */
export function reloadEvents(): Promise<void> {
  const epoch = cacheEpoch();
  loading ??= rpc<{ ok: true; events: CalendarEventView[] } | { ok: false; error: string }>('app.loadAppEvents')
    .then((r) => {
      if (!r.ok || epoch !== cacheEpoch()) return;
      store = { list: r.events };
      emit();
      for (const e of r.events) if (!e.owner) syncAlarm(e);
    })
    .catch(() => undefined)
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** 지금 목록에서 고쳐 넣는다 — 그린 때 쥔 목록으로 덮으면 그새 받은 일정 · 다른 저장이 사라진다 */
const put = (edit: (list: CalendarEventView[]) => CalendarEventView[]) => {
  store = { list: sortEvents(edit(store.list ?? [])) };
  emit();
};

export function useEvents(): CalendarEventView[] | null {
  return useSyncExternalStore(subscribe, () => store).list;
}

/** 날짜 → 일정 수(달력 칸 밑 막대) */
export function useEventCounts(): Record<string, number> {
  const list = useEvents();
  const out: Record<string, number> = {};
  for (const e of list ?? []) out[e.date] = (out[e.date] ?? 0) + 1;
  return out;
}

/** 그날 일정 수 — 받기 전이면 null */
export function useDayEventCount(date: string): number | null {
  const list = useEvents();
  return list ? list.filter((e) => e.date === date).length : null;
}

function remindText(e: CalendarEventView) {
  const o = REMIND_OPTIONS.find((x) => x.value === e.remindMin);
  if (!o || o.value == null) return null;
  return e.time ? o.label : o.allDayLabel;
}

export function DayEvents({ date }: { date: string }) {
  const c = usePalette();
  const all = useEvents();
  useEffect(() => {
    if (!store.list) void reloadEvents();
  }, []);
  const list = (all ?? []).filter((e) => e.date === date);
  const [editing, setEditing] = useState<{ date: string; id: 'new' | string | null } | null>(null);
  /* 일정이 없는 날은 새 일정 폼이 펴진 채(웹 DaySchedule) — 날을 바꾸면 다시 정한다 */
  const id = editing && editing.date === date ? editing.id : all && list.length === 0 ? 'new' : null;
  const set = (v: 'new' | string | null) => setEditing({ date, id: v });

  if (!all) return <Text style={{ color: c.muted, fontSize: 13 }}>불러오는 중…</Text>;
  return (
    <View style={{ gap: 12 }}>
      {list.length ? (
        <View>
          {list.map((e, i) => (
            <View key={e.id} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line }}>
              {id === e.id ? (
                <View style={{ paddingVertical: 12 }}>
                  <EventForm
                    date={date}
                    event={e}
                    onDone={(saved) => {
                      put((list) => [...list.filter((x) => x.id !== saved.id), saved]);
                      syncAlarm(saved);
                      set(null);
                    }}
                    onCancel={() => set(null)}
                    onDeleted={() => {
                      put((list) => list.filter((x) => x.id !== e.id));
                      void BullpenNative.cancelAlarm(`event-${e.id}`).catch(() => undefined);
                      set(null);
                    }}
                  />
                </View>
              ) : (
                <Press
                  accessibilityRole="button"
                  accessibilityLabel={`${e.title}, ${timeLabel(e.time)}${e.owner ? '' : ', 고치기'}`}
                  disabled={!!e.owner}
                  onPress={() => set(e.id)}
                  style={styles.line}
                >
                  <View style={[styles.bar, { backgroundColor: e.owner ? withAlpha(c.muted, 0.5) : c.sky }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text numberOfLines={1} style={{ flexShrink: 1, color: c.ink, fontSize: 15, fontWeight: '600' }}>
                        {e.title}
                      </Text>
                      {e.owner ? (
                        <Text style={[styles.owner, { color: c.muted, backgroundColor: withAlpha(c.chip, 0.6) }]}>{e.owner}</Text>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                      <Text style={{ color: c.muted, fontSize: 13 }}>{timeLabel(e.time)}</Text>
                      {!e.owner && remindText(e) ? (
                        <>
                          <View style={{ marginLeft: 4 }}>
                            <Icon name="bell" size={12} color={c.muted} />
                          </View>
                          <Text style={{ color: c.muted, fontSize: 13 }}>{remindText(e)}</Text>
                        </>
                      ) : null}
                    </View>
                    {e.memo ? <Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>{e.memo}</Text> : null}
                  </View>
                </Press>
              )}
            </View>
          ))}
        </View>
      ) : null}
      {id === 'new' ? (
        <Animated.View entering={fadeIn}>
          <EventForm
            date={date}
            event={null}
            onDone={(saved) => {
              put((list) => [...list, saved]);
              syncAlarm(saved);
              set(null);
            }}
            onCancel={list.length === 0 ? undefined : () => set(null)}
          />
        </Animated.View>
      ) : id == null ? (
        <Press accessibilityRole="button" onPress={() => set('new')} style={[styles.secondary, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
          <Icon name="plus" size={16} color={c.ink} />
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>일정 추가</Text>
        </Press>
      ) : null}
    </View>
  );
}

function EventForm({
  date,
  event,
  onDone,
  onCancel,
  onDeleted,
}: {
  date: string;
  event: CalendarEventView | null;
  onDone: (saved: CalendarEventView) => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}) {
  const c = usePalette();
  const [title, setTitle] = useState(event?.title ?? '');
  const [time, setTime] = useState(event?.time ?? '');
  const [memo, setMemo] = useState(event?.memo ?? '');
  const [remindPick, setRemindPick] = useState<number | null | 'auto'>(event ? event.remindMin : 'auto');
  const remind = remindPick === 'auto' ? defaultRemind(time.trim() || null) : remindPick;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy || !title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await rpc<{ ok: true; event: CalendarEventView } | { ok: false; error: string }>(
        'calendar-event.saveCalendarEvent',
        event?.id ?? null,
        { date, title, time: time.trim() || null, memo: memo.trim() || null, remindMin: remind }
      );
      if (!res.ok) return setError(res.error);
      toast(event ? '고쳤어요' : '일정을 더했어요');
      if (!event) {
        setTitle('');
        setTime('');
        setMemo('');
        setRemindPick('auto');
      }
      onDone(res.event);
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
            if (!res.ok) return setError(res.error);
            toast('지웠어요');
            onDeleted?.();
          } catch {
            setError('신호가 약해 지우지 못했어요.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  const allDay = !time.trim();
  const pickRemind = () => {
    const opts = REMIND_OPTIONS.map((o) => (allDay ? o.allDayLabel : o.label));
    ActionSheetIOS.showActionSheetWithOptions({ options: [...opts, '취소'], cancelButtonIndex: opts.length, title: '알림' }, (i) => {
      if (i < opts.length) setRemindPick(REMIND_OPTIONS[i].value);
    });
  };
  const remindLabel = (() => {
    const o = REMIND_OPTIONS.find((x) => x.value === remind);
    return o ? (allDay ? o.allDayLabel : o.label) : '없음';
  })();
  const input = [styles.input, { backgroundColor: withAlpha(c.ink, 0.05), color: c.ink }];

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text style={[styles.label, { color: c.ink }]}>일정</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          maxLength={EVENT_TITLE_MAX}
          placeholder="예: 연습 경기, 병원"
          placeholderTextColor={c.muted}
          autoFocus={event === null}
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          style={input}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.label, { color: c.ink }]}>
            시각{allDay ? <Text style={{ color: c.muted, fontWeight: '400' }}>  비우면 하루 종일</Text> : null}
          </Text>
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
        </View>
        {time ? (
          <Press accessibilityRole="button" onPress={() => setTime('')} style={styles.ghost}>
            <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>하루 종일</Text>
          </Press>
        ) : null}
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[styles.label, { color: c.ink }]}>알림</Text>
        <Press accessibilityRole="button" accessibilityLabel={`알림 ${remindLabel}, 바꾸기`} onPress={pickRemind} style={[input, styles.select]}>
          <Text style={{ flex: 1, color: c.ink, fontSize: 15 }}>{remindLabel}</Text>
          <Icon name="chevrons-up-down" size={16} color={c.muted} />
        </Press>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[styles.label, { color: c.ink }]}>메모</Text>
        <TextInput
          value={memo}
          onChangeText={setMemo}
          maxLength={EVENT_MEMO_MAX}
          multiline
          placeholder="선택"
          placeholderTextColor={c.muted}
          style={[input, { minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }]}
        />
      </View>
      {error ? <Text style={{ color: c.danger, fontSize: 13 }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {event && onDeleted ? (
          <Press accessibilityRole="button" accessibilityLabel="일정 지우기" onPress={remove} disabled={busy} style={styles.trash}>
            <Icon name="trash2" size={16} color={c.danger} />
          </Press>
        ) : null}
        <View style={{ flex: 1 }} />
        {onCancel ? (
          <Press accessibilityRole="button" onPress={onCancel} style={styles.ghost}>
            <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>취소</Text>
          </Press>
        ) : null}
        <Press
          accessibilityRole="button"
          disabled={busy || !title.trim()}
          onPress={() => void save()}
          style={[styles.primary, { backgroundColor: c.sky }, (busy || !title.trim()) && { opacity: 0.4 }]}
        >
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{busy ? '저장하는 중…' : event ? '저장' : '추가'}</Text>
        </Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 56, paddingVertical: 10 },
  bar: { width: 4, height: 16, borderRadius: 2, marginTop: 3 },
  owner: { fontSize: 13, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 22 },
  label: { fontSize: 13, fontWeight: '600' },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 16, fontSize: 17 },
  select: { flexDirection: 'row', alignItems: 'center' },
  ghost: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  primary: { minHeight: 44, paddingHorizontal: 20, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  trash: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
