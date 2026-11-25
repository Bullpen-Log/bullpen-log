import { type Href } from 'expo-router';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RecordItem } from '@/lib/records/day-records';
import { shiftDateKey } from '@/lib/pitch-stats';
import { READABLE_WIDE } from '~/lib/layout';
import { SPACE, TYPE, usePalette, withAlpha, type Palette } from '~/lib/ui';
import { PageHead } from '~/shell/heading';
import { Icon } from '~/shell/icon';
import { MenuButton } from '~/shell/menu-button';
import { Pulse } from '~/shell/motion';
import { Press } from '~/shell/press';
import { canOpen, pushOpen, useRelease } from '~/shell/release';
import { useFocusRefresh, useOnTabActive, useRetapTop } from '~/shell/tab-pager';
import { useRecordsIntent } from '~/shell/tab-intent';
import { weekdayKo } from '~/home/plan-model';
import { PitchSeg } from '~/pitch/seg';
import { FILTERS, CATEGORY_LABEL, dayRecords, kindsOn, korDay, monthCells, rowOf, sameDayIn, searchRecords, shiftMonth, timeText, weekOf, type RecordFilter } from './model';
import { dateOfRecord, pitchLogIdOf, RECORDS_PATH, resolveRecentDate, type RecordsIntent } from './intent';
import { loadOlderMonth, reloadRecords, resetRecordsStore, useRecords } from './store';

export { RECORDS_PATH };

export const resetRecordsCache = () => resetRecordsStore();

/** 날짜를 안 준 부탁(최근 · 기록 하나)이 목록을 기다리는 동안 — 목록이 오면 그날로 */
type Waiting = Pick<RecordsIntent, 'category' | 'recordId' | 'recent'>;

/**
 * 기록 탭(앱 화면, PITCH-RECORDS-MINIMAL01 R2 — 2026-11-25 사용자 확정) — 투구 · 트레이닝(운동 · 암케어 · 메커니즘) · 컨디션 기록을 한곳에서 본다.
 *   '기록' · 찾기 → 달 · 이전 · 오늘 · 다음 → 이번 주(달을 누르면 달 전체) → 전체 · 투구 · 트레이닝 · 컨디션 → 고른 날 · '+ 투구 기록' → 시간순 줄.
 * 줄은 작은 묶음 이름 · 제목 · 실제 값 하나('불펜 · 35구', '근력 · 42분') · 시각(있을 때만). 해석 · 변화는 AI 코치 몫이라 여기 두지 않는다.
 * 다른 탭에서 연 날짜 · 묶음 · 기록 하나는 shell/tab-intent.ts 의 기록 탭 부탁으로 받는다(붙어 있으면 바로, 아니면 붙을 때).
 * 기록을 누르면 그 기록의 화면 — 투구는 고치기 창(한 장), 휴식은 그날 투구 화면, 운동 · 암케어 · 드릴은 그날 운동 기록, 체크인은 그날 자세히.
 * 자료는 이미 남은 기록을 읽기만 한다(app.loadAppRecords). 위에 쌓인 화면에서 돌아오면 날짜 · 묶음 · 자리를 그대로 두고 새로 받는다.
 */
export function RecordsTab({
  today,
  bottom,
  onTab,
  standalone = false,
  pitchSetup = false,
}: {
  today: string;
  bottom: number;
  onTab: (href: string) => void;
  /** 하단 탭에 기록이 따로 있는가(판 15 사이트 탭) — 아니면 옛 [투구 | 기록] 고르개를 보인다 */
  standalone?: boolean;
  /** 투구 첫 설정 전 — 투구 기록 남기기는 투구 탭의 첫 설정부터 */
  pitchSetup?: boolean;
}) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const stackMonth = width < 360 || fontScale >= 1.3;
  const release = useRelease();
  const s = useRecords(today);
  const [selected, setSelected] = useState(today);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<RecordFilter>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  /* 가리킨 기록 하나 — 그 줄로 굴려 잠시 칠한다(n 은 같은 기록을 다시 가리킬 때도 다시 굴리게) */
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  /* 자정을 넘기면(껍데기가 오늘을 다시 물음) 오늘을 보던 사람은 새 오늘로 */
  const seenToday = useRef(today);
  useEffect(() => {
    if (seenToday.current === today) return;
    const was = seenToday.current;
    seenToday.current = today;
    setSelected((cur) => (cur === was ? today : cur));
  }, [today]);

  const items = useMemo(() => {
    const byId = new Map<string, RecordItem>();
    for (const r of [...(s.items ?? []), ...Object.values(s.older).flat()]) byId.set(r.id, r);
    return [...byId.values()];
  }, [s.items, s.older]);

  /* 날짜를 안 준 부탁의 날 — 목록이 있어야 안다. 없으면(아직 받는 중) 기다린다 */
  const dayFor = (w: Waiting, list: readonly RecordItem[] | null): string | null => {
    if (!list) return null;
    if (w.recordId) {
      const d = dateOfRecord(list, w.recordId);
      if (d) return d;
    }
    return w.recent ? resolveRecentDate(list, w.category, today) : today;
  };
  /* 기다리던 부탁의 날 — 목록이 오면 그날, 못 받았으면(받아 둔 것도 없음) 오늘. 사람이 날 · 묶음을 고르면 그 날로 굳힌다(commit) */
  const resolved = waiting ? (s.items ? dayFor(waiting, items) : s.error ? today : null) : null;
  const day = waiting && resolved ? resolved : selected;
  const commit = () => {
    if (!waiting) return;
    setWaiting(null);
    if (resolved) setSelected(resolved);
  };
  const month = day.slice(0, 7);

  /* 옛 달을 고르면 그 달만 더 받는다 */
  useEffect(() => loadOlderMonth(month), [month, s.from]);
  /* 다른 탭 · 위에 쌓인 화면(투구 기록 · 운동 · 체크인)에서 돌아오면 새로 받는다 — 날짜 · 묶음 · 자리는 그대로 */
  useOnTabActive(() => void reloadRecords(today));
  useFocusRefresh(() => void reloadRecords(today));
  const scroll = useRef<ScrollViewInstance>(null);
  useRetapTop(() => scroll.current?.scrollTo({ y: 0, animated: true }));

  useRecordsIntent((i) => {
    setExpanded(false);
    setSearchOpen(false);
    setQuery('');
    setFilter(i.category);
    setFocus(i.recordId ? { id: i.recordId, n: Date.now() } : null);
    if (i.date) {
      setWaiting(null);
      setSelected(i.date);
    } else if (i.recordId || i.recent) {
      const d = dayFor(i, s.items ? items : null);
      if (d) {
        setWaiting(null);
        setSelected(d);
      } else setWaiting({ category: i.category, recordId: i.recordId, recent: i.recent });
    } else {
      setWaiting(null);
      setSelected(today);
    }
    if (!i.recordId) scroll.current?.scrollTo({ y: 0, animated: false });
  });
  const searching = searchOpen && query.trim().length > 0;
  const list = searching ? searchRecords(items, query, filter) : dayRecords(items, day, filter);
  const loading = s.items == null || (waiting != null && resolved == null);
  const firstUse = s.items != null && s.items.length === 0 && Object.values(s.older).every((x) => x.length === 0);

  /* 가리킨 줄로 굴리기 — 목록 칸의 자리와 그 줄의 자리를 다 안 뒤에 한 번 */
  const listY = useRef<number | null>(null);
  const rowY = useRef(new Map<string, number>());
  const scrolledFor = useRef(0);
  const tryScroll = () => {
    if (!focus || scrolledFor.current === focus.n || listY.current == null) return;
    const y = rowY.current.get(focus.id);
    if (y == null) return;
    scrolledFor.current = focus.n;
    scroll.current?.scrollTo({ y: Math.max(0, listY.current + y - 120), animated: true });
    setFlash(focus.id);
  };
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2400);
    return () => clearTimeout(t);
  }, [flash]);

  const pick = (d: string) => {
    setWaiting(null);
    setSelected(d);
    setFocus(null);
  };
  const step = (dir: -1 | 1) => pick(expanded ? sameDayIn(shiftMonth(month, dir), day) : shiftDateKey(day, dir * 7));

  /* '+ 투구 기록' — 한 날만 보일 때(찾는 중이 아님) · 전체 · 투구 묶음 · 오늘까지 · 투구 기록을 열 수 있을 때(출시 정책 · 첫 설정) */
  const canAddPitch = !searching && !loading && (filter === 'all' || filter === 'pitch') && day <= today && !pitchSetup && canOpen('/pitch/edit', release);
  const editHref = (date: string, id?: string) => {
    const q = [`date=${date}`, id ? `id=${encodeURIComponent(id)}` : null, 'compact=1', searching ? null : `cat=${filter}`].filter(Boolean).join('&');
    return `/pitch/edit?${q}`;
  };
  const openRow = (r: RecordItem) => {
    if (r.kind === 'pitch') {
      const id = pitchLogIdOf(r.id);
      return pushOpen((r.rested || !id ? `/pitch/${r.date}` : editHref(r.date, id)) as Href);
    }
    if (r.kind === 'checkin') return pushOpen(`/calendar?date=${r.date}` as Href);
    pushOpen(`/training/day/${r.date}?kind=${r.kind}` as Href);
  };
  const dayHasPitch = !searching && list.some((r) => r.kind === 'pitch');

  return (
    <ScrollView
      ref={scroll}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={[{ paddingTop: inset.top + 12, paddingBottom: bottom + 24, paddingHorizontal: SPACE.side, gap: 14 }, READABLE_WIDE]}
    >
      <PageHead title="기록">
        <Press
          accessibilityRole="button"
          accessibilityLabel={searchOpen ? '찾기 닫기' : '기록 찾기'}
          accessibilityState={{ expanded: searchOpen }}
          onPress={() => {
            if (searchOpen) setQuery('');
            setSearchOpen((o) => !o);
          }}
          style={[styles.iconBtn, searchOpen && { backgroundColor: withAlpha(c.link, 0.14) }]}
        >
          <Icon name={searchOpen ? 'x' : 'search'} size={20} color={searchOpen ? c.link : c.ink} />
        </Press>
        <MenuButton />
      </PageHead>
      {standalone ? null : <PitchSeg value={RECORDS_PATH} onTab={onTab} />}
      {searchOpen ? (
        <View style={[styles.search, { backgroundColor: c.card, borderColor: c.line }]}>
          <Icon name="search" size={16} color={c.muted} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="날짜 · 종류 · 메모로 찾기"
            placeholderTextColor={c.muted}
            accessibilityLabel="기록 찾기 글"
            returnKeyType="search"
            style={[styles.searchInput, { color: c.ink }]}
          />
          {query ? (
            <Press accessibilityRole="button" accessibilityLabel="찾는 글 지우기" onPress={() => setQuery('')} style={styles.clear}>
              <Icon name="x" size={16} color={c.muted} />
            </Press>
          ) : null}
        </View>
      ) : null}

      {/* 달 · 이전 · 오늘 · 다음 — 달을 누르면 달 전체를 펴고 접는다(편 동안 이전 · 다음은 달 단위) */}
      <View style={[styles.monthRow, stackMonth && styles.monthStack]}>
        <Press
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월, ${expanded ? '달 접기' : '달 전체 보기'}`}
          onPress={() => setExpanded((x) => !x)}
          style={styles.monthBtn}
        >
          <Text style={[TYPE.card, { color: c.ink, fontSize: 18 }]}>{`${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`}</Text>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={c.muted} />
        </Press>
        <View style={styles.tools}>
          <Press accessibilityRole="button" accessibilityLabel={expanded ? '이전 달' : '이전 주'} onPress={() => step(-1)} style={styles.navBtn}>
            <Icon name="chevron-left" size={18} color={c.link} />
          </Press>
          <Press accessibilityRole="button" accessibilityLabel="오늘로" onPress={() => pick(today)} style={styles.todayBtn}>
            <Text style={{ color: c.link, fontSize: 14, fontWeight: '600' }}>오늘</Text>
          </Press>
          <Press accessibilityRole="button" accessibilityLabel={expanded ? '다음 달' : '다음 주'} onPress={() => step(1)} style={styles.navBtn}>
            <Icon name="chevron-right" size={18} color={c.link} />
          </Press>
        </View>
      </View>
      <View style={[styles.calendar, { backgroundColor: c.card }]}>
        {expanded ? (
          <View style={styles.grid}>
            {['월', '화', '수', '목', '금', '토', '일'].map((w) => (
              <Text key={w} style={[styles.weekHead, { color: c.muted }]}>
                {w}
              </Text>
            ))}
            {monthCells(month).map((d, i) =>
              d ? <DayButton key={d} date={d} small today={today} selected={day === d} marks={kindsOn(items, d)} onPress={() => pick(d)} c={c} /> : <View key={`b${i}`} style={styles.cell} />
            )}
          </View>
        ) : (
          <View style={styles.week}>
            {weekOf(day).map((d) => (
              <DayButton key={d} date={d} today={today} selected={day === d} marks={kindsOn(items, d)} onPress={() => pick(d)} c={c} />
            ))}
          </View>
        )}
      </View>

      {/* 묶음 넷 — 찾는 동안에도 같이 돈다, 고른 날은 그대로 남는다 */}
      <View accessibilityRole="tablist" style={styles.filters}>
        {FILTERS.map((f) => {
          const on = filter === f.value;
          return (
            <Press
              key={f.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => {
                commit();
                setFilter(f.value);
                setFocus(null);
              }}
              style={[styles.chip, { backgroundColor: on ? c.ink : 'transparent' }]}
            >
              <Text style={{ color: on ? c.page : c.muted, fontSize: 15, fontWeight: on ? '700' : '500' }}>{f.label}</Text>
            </Press>
          );
        })}
      </View>

      {/* 고른 날(찾는 중이면 '찾은 기록') · 그날 투구 남기기 */}
      <View style={styles.dayTitle}>
        <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink, flexShrink: 1 }]}>
          {searching ? '찾은 기록' : `${korDay(day)} · ${weekdayKo(day)}`}
        </Text>
        {canAddPitch ? (
          <Press
            accessibilityRole="button"
            accessibilityLabel={`${korDay(day)} 투구 기록 남기기`}
            onPress={() => pushOpen(editHref(day) as Href)}
            style={[styles.add, { backgroundColor: c.action }]}
          >
            <Icon name="plus" size={16} color={c.onAction} />
            <Text style={{ color: c.onAction, fontSize: 15, fontWeight: '600' }}>투구 기록</Text>
          </Press>
        ) : null}
      </View>

      <View
        onLayout={(e) => {
          listY.current = e.nativeEvent.layout.y;
          tryScroll();
        }}
        style={[styles.list, { backgroundColor: c.card }]}
      >
        {loading ? (
          s.items == null && s.error ? (
            <View style={styles.state}>
              <Icon name="circle-alert" size={20} color={c.danger} />
              <Text style={[TYPE.body, { color: c.ink, textAlign: 'center' }]}>{s.error}</Text>
              <Press accessibilityRole="button" onPress={() => void reloadRecords(today)} style={[styles.retry, { backgroundColor: c.action }]}>
                <Text style={{ color: c.onAction, fontSize: 15, fontWeight: '600' }}>다시 불러오기</Text>
              </Press>
            </View>
          ) : (
            <View accessibilityLabel="기록을 불러오는 중이에요" style={{ gap: 12, padding: 16 }}>
              <Pulse style={[styles.skel, { backgroundColor: c.line }]} />
              <Pulse style={[styles.skel, { backgroundColor: c.line, width: '60%' }]} />
            </View>
          )
        ) : firstUse ? (
          <EmptyLine c={c} text="아직 남긴 기록이 없어요" />
        ) : list.length === 0 ? (
          <EmptyLine c={c} text={searching ? '찾는 기록이 없어요' : filter === 'all' ? '기록 없음' : `${CATEGORY_LABEL[filter]} 기록 없음`} />
        ) : (
          list.map((r, i) => (
            <Fragment key={r.id}>
              {searching && (i === 0 || list[i - 1].date !== r.date) ? (
                <Text style={[styles.searchDate, { color: c.muted }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>{`${korDay(r.date)} · ${weekdayKo(r.date)}`}</Text>
              ) : null}
              <Row
                r={r}
                first={i === 0 || (searching && list[i - 1].date !== r.date)}
                lit={flash === r.id}
                onPress={() => openRow(r)}
                onLayout={(y) => {
                  rowY.current.set(r.id, y);
                  if (focus?.id === r.id) tryScroll();
                }}
                c={c}
              />
            </Fragment>
          ))
        )}
      </View>
      {s.items && s.error ? <Text style={{ color: c.muted, fontSize: 13 }}>{s.error} 받아 둔 기록이에요.</Text> : null}

      {/* 그날의 자세한 칸 — 낮은 강조(투구 영상 · 비교는 그날 투구 화면, 일정은 그날 자세히) */}
      {!searching && !loading && !firstUse ? (
        <View style={styles.links}>
          {dayHasPitch ? (
            <Press accessibilityRole="link" accessibilityLabel={`${korDay(day)} 투구 자세히 · 영상`} onPress={() => pushOpen(`/pitch/${day}` as Href)} style={styles.more}>
              <Text style={{ color: c.muted, fontSize: 13 }}>투구 자세히</Text>
              <Icon name="chevron-right" size={14} color={c.muted} />
            </Press>
          ) : null}
          <Press accessibilityRole="link" accessibilityLabel={`${korDay(day)} 그날 자세히 · 일정`} onPress={() => pushOpen(`/calendar?date=${day}` as Href)} style={styles.more}>
            <Text style={{ color: c.muted, fontSize: 13 }}>그날 자세히 · 일정</Text>
            <Icon name="chevron-right" size={14} color={c.muted} />
          </Press>
        </View>
      ) : null}
    </ScrollView>
  );
}

function DayButton({ date, today, selected, marks, small = false, onPress, c }: { date: string; today: string; selected: boolean; marks: number; small?: boolean; onPress: () => void; c: Palette }) {
  const isToday = date === today;
  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${korDay(date)} ${weekdayKo(date)}요일${isToday ? ', 오늘' : ''}, ${marks ? `기록 ${marks}종류` : '기록 없음'}`}
      onPress={onPress}
      style={[small ? styles.cell : styles.day, selected && { backgroundColor: c.action }, !selected && isToday && { borderWidth: 1.5, borderColor: withAlpha(c.link, 0.5) }]}
    >
      {small ? null : <Text style={{ color: selected ? withAlpha(c.onAction, 0.85) : c.muted, fontSize: 12 }}>{weekdayKo(date)}</Text>}
      <Text style={[TYPE.num, { color: selected ? c.onAction : c.ink, fontSize: small ? 15 : 18 }]}>{Number(date.slice(8, 10))}</Text>
      <View style={styles.marks}>
        {Array.from({ length: Math.min(3, marks) }, (_, i) => (
          <View key={i} style={[styles.mark, { backgroundColor: selected ? c.onAction : c.link }]} />
        ))}
      </View>
    </Press>
  );
}

/** 한 줄 — 작은 묶음 이름, '제목 · 값'(값은 크게), 오른쪽에 실제 시각(있을 때만) */
function Row({ r, first, lit, onPress, onLayout, c }: { r: RecordItem; first: boolean; lit: boolean; onPress: () => void; onLayout: (y: number) => void; c: Palette }) {
  const row = rowOf(r);
  const time = timeText(r.at);
  const spoken = [row.label, row.title, row.metric, time ? `${time} 기록` : null].filter(Boolean).join(', ');
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={r.kind === 'pitch' && !r.rested ? '누르면 고칠 수 있어요' : undefined}
      onLayout={(e) => onLayout(e.nativeEvent.layout.y)}
      onPress={onPress}
      style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }, lit && { backgroundColor: withAlpha(c.link, 0.1) }]}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600' }}>{row.label}</Text>
        <Text style={[TYPE.card, { color: c.ink, fontSize: 18 }]}>
          {row.title}
          {row.metric ? <Text style={{ color: c.muted, fontWeight: '400' }}> · </Text> : null}
          {row.metric ? <Text style={[TYPE.num, { color: c.ink, fontSize: 20 }]}>{row.metric}</Text> : null}
        </Text>
      </View>
      {time ? <Text style={{ color: c.muted, fontSize: 13, fontVariant: ['tabular-nums'] }}>{time}</Text> : null}
      <Icon name="chevron-right" size={15} color={c.lineStrong} />
    </Press>
  );
}

function EmptyLine({ c, text }: { c: Palette; text: string }) {
  return (
    <View style={styles.state}>
      <Text style={[TYPE.body, { color: c.muted, textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 14 },
  searchInput: { flex: 1, fontSize: 16, minHeight: 44 },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthStack: { flexDirection: 'column', alignItems: 'flex-start', gap: 2 },
  monthBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  tools: { flexDirection: 'row', alignItems: 'center' },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  todayBtn: { minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  calendar: { borderRadius: 20, padding: 6 },
  week: { flexDirection: 'row', gap: 2 },
  day: { flex: 1, minWidth: 0, minHeight: 66, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekHead: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, paddingVertical: 6 },
  cell: { width: `${100 / 7}%`, minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 },
  marks: { flexDirection: 'row', gap: 2, height: 4 },
  mark: { width: 4, height: 4, borderRadius: 2 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { minHeight: 44, borderRadius: 22, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  dayTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  add: { minHeight: 44, borderRadius: 22, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 4 },
  list: { borderRadius: 20, overflow: 'hidden' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  searchDate: { fontSize: 13, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 },
  state: { minHeight: 80, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 18 },
  retry: { marginTop: 4, minHeight: 44, paddingHorizontal: 20, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  skel: { height: 18, borderRadius: 9 },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 },
  more: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
});
