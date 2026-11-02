import { type Href, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isCalendarDate } from '@/lib/calendar-month';
import { sortEvents, type CalendarEventView } from '@/lib/calendar-event';
import type { RecordItem } from '@/lib/records/day-records';
import { sleepQualityWord } from '@/lib/checkin';
import { toDateKey } from '@/lib/pitch-stats';
import { formatSpeed } from '@/lib/units';
import { Bar } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { usePrefs } from '~/lib/prefs';
import { usePalette, withAlpha, type Palette } from '~/lib/ui';
import { homeSnapshot } from '~/home/tab';
import { EventForm, forgetCalendarEvent, rememberCalendarEvent } from '~/home/events';
import { dayRecords } from '~/records/model';
import { openTabAt } from '~/shell/tab-intent';
import { Icon, type IconName } from '~/shell/icon';
import { leaveTo } from '~/shell/web-nav';
import { Press } from '~/shell/press';
import { Sheet } from '~/workout/sheets';
import { CalendarGrid, calendarDateLabel } from './parts';
import { invalidateCalendar, loadCalendarMonth, useCalendarMonth } from './store';

const LABEL: Record<RecordItem['kind'], string> = {
  pitch: '투구',
  training: '운동',
  armcare: '암케어',
  drill: '메커니즘',
  checkin: '체크인',
};
const GLYPH: Record<RecordItem['kind'], IconName> = {
  pitch: 'circle-dot',
  training: 'dumbbell',
  armcare: 'shield-plus',
  drill: 'activity',
  checkin: 'heart-pulse',
};

/** Choosing a calendar date only reads records: no keyboard, generated plan or implicit write. */
export default function CalendarScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { fontScale } = useWindowDimensions();
  const { speed } = usePrefs();
  const params = useLocalSearchParams<{ date?: string }>();
  const today = homeSnapshot()?.today ?? toDateKey(new Date());
  const requested = isCalendarDate(params.date) ? params.date : null;
  const [selected, setSelected] = useState(requested ?? today);
  const [month, setMonth] = useState((requested ?? today).slice(0, 7));
  const [expandedEvents, setExpandedEvents] = useState(false);
  const [expandedRecords, setExpandedRecords] = useState(false);
  const [detail, setDetail] = useState<CalendarEventView | null>(null);
  const [checkin, setCheckin] = useState<Extract<
    RecordItem,
    { kind: 'checkin' }
  > | null>(null);
  const [editor, setEditor] = useState<CalendarEventView | 'new' | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const state = useCalendarMonth(month);
  const pick = (date: string) => {
    setSelected(date);
    setMonth(date.slice(0, 7));
    setExpandedEvents(false);
    setExpandedRecords(false);
  };
  const [seenRequest, setSeenRequest] = useState(requested);
  if (seenRequest !== requested) {
    setSeenRequest(requested);
    if (requested) {
      setSelected(requested);
      setMonth(requested.slice(0, 7));
      setExpandedEvents(false);
      setExpandedRecords(false);
    }
  }
  useFocusEffect(
    useCallback(() => {
      void loadCalendarMonth(month);
    }, [month])
  );
  const reload = () => loadCalendarMonth(month, true);
  const events =
    state.events == null
      ? null
      : sortEvents(state.events.filter((e) => e.date === selected));
  const records =
    state.records == null ? null : dayRecords(state.records, selected, 'all');
  const stale =
    (state.recordError && state.records != null) ||
    (state.eventError && state.events != null);
  const startEditor = (event: CalendarEventView | 'new') => {
    setDirty(false);
    setBusy(false);
    setDetail(null);
    setEditor(event);
  };
  const closeEditor = () => {
    if (busy) return;
    if (!dirty) return setEditor(null);
    Alert.alert('일정 작성을 그만둘까요?', '작성한 내용은 저장되지 않아요.', [
      { text: '계속 작성', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: () => setEditor(null) },
    ]);
  };
  const afterEdit = () => {
    setEditor(null);
    setDirty(false);
    invalidateCalendar();
    void reload();
  };
  const openRecord = (r: RecordItem) => {
    if (r.kind === 'checkin') return setCheckin(r);
    router.push(
      (r.kind === 'pitch'
        ? `/pitch/${r.date}`
        : `/training/day/${r.date}?kind=${r.kind}`) as Href
    );
  };
  const summary = (r: RecordItem) => {
    if (r.kind === 'pitch')
      return r.rested
        ? '투구 휴식'
        : [`${r.pitches}구`, r.maxKmh == null ? null : formatSpeed(r.maxKmh, speed)]
            .filter(Boolean)
            .join(' · ');
    if (r.kind === 'training')
      return (
        [
          r.active ? '진행 중' : null,
          r.count ? `${r.count}종목 완료` : null,
          r.minutes == null ? null : `${r.minutes}분`,
        ]
          .filter(Boolean)
          .join(' · ') || '운동 기록'
      );
    if (r.kind === 'checkin') return `컨디션 ${r.condition}/10`;
    return `${r.count}개 완료`;
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar
        back="이전"
        title="캘린더"
        c={c}
        onBack={() => (router.canGoBack() ? router.back() : leaveTo('/today'))}
        right={
          <Press
            accessibilityRole="button"
            accessibilityLabel={`${calendarDateLabel(selected)} 일정 추가`}
            onPress={() => startEditor('new')}
            style={s.iconButton}
          >
            <Icon name="plus" size={24} color={c.link} />
          </Press>
        }
      />
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={() => void reload()}
            tintColor={c.link}
          />
        }
        contentContainerStyle={[
          {
            padding: 16,
            paddingTop: 12,
            paddingBottom: Math.max(32, inset.bottom + 20),
          },
          READABLE,
        ]}
      >
        <CalendarGrid
          month={month}
          today={today}
          selected={selected}
          records={state.records}
          events={state.events}
          onDay={pick}
          onMonth={(m) => pick(`${m}-01`)}
          onToday={() => pick(today)}
          c={c}
        />
        <View style={s.dateHeading}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              flex: 1,
              gap: 7,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{
                color: c.ink,
                fontSize: 20,
                fontWeight: '700',
                letterSpacing: -0.5,
              }}
            >
              {calendarDateLabel(selected)}
            </Text>
            {selected === today ? (
              <Text style={[s.todayTag, { color: c.link, backgroundColor: c.skyTint }]}>
                오늘
              </Text>
            ) : null}
          </View>
          <Press
            accessibilityRole="button"
            accessibilityLabel="선택 날짜 새로고침"
            disabled={state.refreshing}
            onPress={() => void reload()}
            style={s.iconButton}
          >
            {state.refreshing ? (
              <ActivityIndicator size="small" color={c.link} />
            ) : (
              <Icon name="rotate-cw" size={18} color={c.muted} />
            )}
          </Press>
        </View>
        {stale ? (
          <View
            accessibilityRole="alert"
            style={[s.notice, { backgroundColor: c.warnBg }]}
          >
            <Icon name="info" size={17} color={c.warn} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.warn, fontSize: 13, lineHeight: 20 }}>
                새로 불러오지 못했어요.{'\n'}이전에 확인한 내용을 보여드려요.
              </Text>
              <Press
                accessibilityRole="button"
                onPress={() => void reload()}
                style={s.smallLink}
              >
                <Text style={{ color: c.warn, fontSize: 13, fontWeight: '600' }}>
                  다시 시도
                </Text>
              </Press>
            </View>
          </View>
        ) : null}
        <Animated.View
          key={selected}
          entering={reduce ? undefined : FadeIn.duration(120)}
          style={[s.panel, { backgroundColor: c.card, boxShadow: c.float }]}
        >
          <SectionHeading text="일정" count={events?.length} c={c} />
          {events == null ? (
            <SourcePending error={state.eventError} label="일정" retry={reload} c={c} />
          ) : events.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ color: c.muted, fontSize: 15 }}>일정 없음</Text>
              <Press
                accessibilityRole="button"
                onPress={() => startEditor('new')}
                style={s.smallLink}
              >
                <Text style={{ color: c.link, fontSize: 13, fontWeight: '600' }}>
                  일정 추가
                </Text>
              </Press>
            </View>
          ) : (
            <>
              {events.slice(0, expandedEvents ? events.length : 2).map((e, i) => (
                <Press
                  key={e.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${e.time ?? '종일'}, ${e.title}${e.owner !== undefined ? `, ${e.owner}, 읽기 전용` : ''}`}
                  onPress={() => setDetail(e)}
                  style={[
                    s.event,
                    i > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: c.line,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: c.link,
                      fontWeight: '600',
                      fontSize: 14,
                      width: fontScale > 1.2 ? 64 : 52,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {e.time ?? '종일'}
                  </Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: c.ink, fontWeight: '600', fontSize: 16 }}>
                      {e.title}
                    </Text>
                    {e.owner !== undefined ? (
                      <Text style={{ color: c.muted, fontSize: 12, marginTop: 4 }}>
                        {e.owner || '다른 관리자'} · 읽기 전용
                      </Text>
                    ) : null}
                  </View>
                  <Icon name="chevron-right" size={14} color={c.muted} />
                </Press>
              ))}
              {events.length > 2 ? (
                <More
                  text={expandedEvents ? '접기' : `일정 ${events.length - 2}개 더 보기`}
                  expanded={expandedEvents}
                  onPress={() => setExpandedEvents((v) => !v)}
                  c={c}
                />
              ) : null}
            </>
          )}
          <View style={[s.divider, { backgroundColor: c.line }]} />
          <SectionHeading text="남긴 기록" count={records?.length} c={c} />
          {records == null ? (
            <SourcePending
              error={state.recordError}
              label="기록"
              retry={reload}
              c={c}
            />
          ) : records.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ color: c.muted, fontSize: 15 }}>남긴 기록 없음</Text>
            </View>
          ) : (
            <>
              {records.slice(0, expandedRecords ? records.length : 2).map((r, i) => (
                <Press
                  key={r.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${LABEL[r.kind]}, ${summary(r)}, 기록 보기`}
                  onPress={() => openRecord(r)}
                  style={[
                    s.record,
                    i > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: c.line,
                    },
                  ]}
                >
                  <View style={[s.recordIcon, { backgroundColor: c.skyTint }]}>
                    <Icon name={GLYPH[r.kind]} size={20} color={c.link} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: c.ink, fontSize: 16, fontWeight: '600' }}>
                      {LABEL[r.kind]}
                    </Text>
                    <Text style={{ color: c.muted, fontSize: 13, marginTop: 4 }}>
                      {summary(r)}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={14} color={c.muted} />
                </Press>
              ))}
              {records.length > 2 ? (
                <More
                  text={
                    expandedRecords ? '접기' : `기록 ${records.length - 2}개 더 보기`
                  }
                  expanded={expandedRecords}
                  onPress={() => setExpandedRecords((v) => !v)}
                  c={c}
                />
              ) : null}
            </>
          )}
        </Animated.View>
        <Press
          accessibilityRole="button"
          onPress={() => {
            openTabAt('records', selected);
            leaveTo('/records');
          }}
          style={[s.more, { marginTop: 10 }]}
        >
          <Text style={{ color: c.link, fontSize: 13 }}>기록에서 보기</Text>
          <Icon name="arrow-up-right" size={14} color={c.link} />
        </Press>
      </ScrollView>
      {detail ? (
        <Sheet
          open
          fit
          title="개인 일정"
          description={`${calendarDateLabel(detail.date)} · ${detail.time ?? '종일'}`}
          onClose={() => setDetail(null)}
          c={c}
        >
          <Text
            style={{ color: c.ink, fontSize: 23, fontWeight: '700', marginBottom: 14 }}
          >
            {detail.title}
          </Text>
          {detail.owner !== undefined ? (
            <Text style={{ color: c.muted, fontSize: 14, marginBottom: 12 }}>
              {detail.owner || '다른 관리자'} · 읽기 전용
            </Text>
          ) : null}
          {detail.memo ? (
            <Text
              style={{ color: c.ink, fontSize: 16, lineHeight: 25, marginBottom: 14 }}
            >
              {detail.memo}
            </Text>
          ) : null}
          {detail.owner === undefined ? (
            <Press
              accessibilityRole="button"
              onPress={() => startEditor(detail)}
              style={[s.primary, { backgroundColor: c.action }]}
            >
              <Text style={{ color: c.onAction, fontSize: 16, fontWeight: '600' }}>
                일정 수정
              </Text>
            </Press>
          ) : null}
        </Sheet>
      ) : null}
      {checkin ? (
        <Sheet
          open
          fit
          title="체크인 기록"
          description={calendarDateLabel(checkin.date)}
          onClose={() => setCheckin(null)}
          c={c}
        >
          <Text
            style={{ color: c.ink, fontSize: 23, fontWeight: '700', marginBottom: 14 }}
          >
            컨디션 {checkin.condition}/10
          </Text>
          {sleepQualityWord(checkin.sleepQuality) ? (
            <Text style={{ color: c.muted, fontSize: 15, marginBottom: 12 }}>
              수면 {sleepQualityWord(checkin.sleepQuality)}
            </Text>
          ) : null}
          {checkin.note ? (
            <Text style={{ color: c.ink, fontSize: 16, lineHeight: 25 }}>
              {checkin.note}
            </Text>
          ) : null}
        </Sheet>
      ) : null}
      {editor ? (
        <Sheet
          open
          title={editor === 'new' ? '일정 추가' : '일정 수정'}
          description={calendarDateLabel(editor === 'new' ? selected : editor.date)}
          onClose={closeEditor}
          c={c}
        >
          <EventForm
            key={editor === 'new' ? selected : editor.id}
            date={editor === 'new' ? selected : editor.date}
            event={editor === 'new' ? null : editor}
            autoFocus={false}
            onDirtyChange={setDirty}
            onBusyChange={setBusy}
            onCancel={closeEditor}
            onDone={(e) => {
              rememberCalendarEvent(e);
              afterEdit();
            }}
            onDeleted={
              editor === 'new'
                ? undefined
                : () => {
                    forgetCalendarEvent(editor.id);
                    afterEdit();
                  }
            }
          />
        </Sheet>
      ) : null}
    </View>
  );
}

function SectionHeading({
  text,
  count,
  c,
}: {
  text: string;
  count?: number;
  c: Palette;
}) {
  return (
    <View style={s.sectionHeading}>
      <Text
        accessibilityRole="header"
        style={{ color: c.muted, fontSize: 13, fontWeight: '600' }}
      >
        {text}
      </Text>
      {count ? <Text style={{ color: c.muted, fontSize: 11 }}>{count}개</Text> : null}
    </View>
  );
}
function More({
  text,
  expanded,
  onPress,
  c,
}: {
  text: string;
  expanded: boolean;
  onPress: () => void;
  c: Palette;
}) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={s.more}
    >
      <Text style={{ color: c.link, fontSize: 13 }}>{text}</Text>
      <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={c.link} />
    </Press>
  );
}
function SourcePending({
  error,
  label,
  retry,
  c,
}: {
  error: string | null;
  label: string;
  retry: () => Promise<unknown>;
  c: Palette;
}) {
  if (error)
    return (
      <View style={{ paddingTop: 12 }}>
        <Text accessibilityRole="alert" style={{ color: c.muted, fontSize: 15 }}>
          {error}
        </Text>
        <Press
          accessibilityRole="button"
          onPress={() => void retry()}
          style={s.smallLink}
        >
          <Text style={{ color: c.link, fontSize: 13, fontWeight: '600' }}>
            다시 시도
          </Text>
        </Press>
      </View>
    );
  return (
    <View
      accessibilityLabel={`${label}을 불러오는 중`}
      accessibilityState={{ busy: true }}
      style={{ paddingVertical: 12, gap: 10 }}
    >
      <Text style={{ color: c.muted, fontSize: 13 }}>{label}을 불러오는 중</Text>
      <View
        style={{
          height: 48,
          borderRadius: 13,
          backgroundColor: withAlpha(c.muted, 0.08),
        }}
      />
    </View>
  );
}
const s = StyleSheet.create({
  iconButton: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 3,
    marginTop: 16,
    marginBottom: 7,
  },
  todayTag: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
  },
  panel: { borderRadius: 26, paddingHorizontal: 17, paddingTop: 16, paddingBottom: 6 },
  sectionHeading: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  event: {
    minHeight: 62,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  record: {
    minHeight: 70,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recordIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    minHeight: 64,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 12, marginBottom: 16 },
  more: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  smallLink: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  notice: {
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    marginBottom: 11,
  },
  primary: {
    borderRadius: 17,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
