import { type Href, router } from 'expo-router';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RecordItem } from '@/lib/records/day-records';
import { shiftDateKey } from '@/lib/pitch-stats';
import { round1, speedLabel, toSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { rpc } from '~/lib/rpc';
import { cacheEpoch } from '~/lib/store';
import { READABLE_WIDE } from '~/lib/layout';
import { SPACE, TYPE, usePalette, withAlpha, type Palette } from '~/lib/ui';
import { PageHead, Segmented } from '~/shell/heading';
import { Icon, type IconName } from '~/shell/icon';
import { MenuButton } from '~/shell/menu-button';
import { Pulse } from '~/shell/motion';
import { Press } from '~/shell/press';
import { useFocusRefresh, useOnTabActive, useRetapTop } from '~/shell/tab-pager';
import { useTabIntent } from '~/shell/tab-intent';
import { homeSnapshot } from '~/home/tab';
import { weekdayKo } from '~/home/plan-model';
import { useMyVideos } from '~/videos/store';
import { FILTERS, KIND_LABEL, dayRecords, filterOf, kindsOn, korDay, monthCells, noteOf, sameDayIn, searchRecords, shiftMonth, timeText, titleOf, valueOf, weekOf, type RecordFilter } from './model';
import { loadOlderMonth, reloadRecords, resetRecordsStore, useRecords } from './store';

/** 기록 탭의 껍데기 주소(웹에는 없다 — 앱 화면만, app/index.tsx pressTab) */
export const RECORDS_PATH = '/records';

let labCount: { epoch: number; n: number } | null = null;
export const resetRecordsCache = () => {
  resetRecordsStore();
  labCount = null;
};

/**
 * 기록 탭(앱 화면) — 2026-10-29 확정 디자인(처음 날짜 중심 구성을 다듬은 판).
 *   제목 · 메뉴 → [날짜별 | 변화] → 달 · 이전 · 오늘 · 다음 → 이번 주 칸(달을 누르면 달 전체) → 전체 · 투구 · 트레이닝 · 컨디션 + 찾기 → 고른 날 →
 *   시간순 기록(최근 위, 많은 날은 둘 + '나머지 N개 보기') → 내 영상 · 3D 분석 결과.
 * 날짜별 위의 '이달의 기록' 합계와 첫 사용 설명 줄은 넣지 않는다(확정 디자인). 첫 사용 빈 화면은 '아직 남긴 기록이 없어요' 하나, 고른 날이 빈 날 ·
 * 찾기 결과 없음 · 불러오기 실패는 따로 말한다. 변화는 기존 전문 분석(투구 · 트레이닝 분석 화면)으로 가는 문 — 여기서 그래프를 줄여 다시 그리지 않는다.
 * 자료는 이미 남은 기록을 읽기만 한다(app.loadAppRecords). 카드를 누르면 그 기록의 화면(고치기 · 지우기는 거기서).
 */
export function RecordsTab({ today, bottom }: { today: string; bottom: number }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const s = useRecords(today);
  const [seg, setSeg] = useState<'log' | 'trends'>('log');
  const [selected, setSelected] = useState(today);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<RecordFilter>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const month = selected.slice(0, 7);
  /* 자정을 넘기면(껍데기가 오늘을 다시 물음) 오늘을 보던 사람은 새 오늘로 */
  const seenToday = useRef(today);
  useEffect(() => {
    if (seenToday.current === today) return;
    const was = seenToday.current;
    seenToday.current = today;
    setSelected((cur) => (cur === was ? today : cur));
  }, [today]);

  /* 옛 달을 고르면 그 달만 더 받는다 */
  useEffect(() => loadOlderMonth(month), [month, s.from]);
  /* 다른 탭 · 위에 쌓인 화면(투구 기록 · 운동 · 체크인)에서 돌아오면 새로 받는다 */
  useOnTabActive(() => void reloadRecords(today));
  useFocusRefresh(() => void reloadRecords(today));
  /* 홈 '이번 주'의 날짜 · 오늘 — 그날을 고른 날짜별로 */
  useTabIntent('records', (d) => {
    setSeg('log');
    setSelected(d);
    setExpanded(false);
    setSearchOpen(false);
    setQuery('');
    setShowAll(false);
  });
  const scroll = useRef<ScrollViewInstance>(null);
  useRetapTop(() => scroll.current?.scrollTo({ y: 0, animated: true }));

  const items = useMemo(() => {
    const byId = new Map<string, RecordItem>();
    for (const r of [...(s.items ?? []), ...Object.values(s.older).flat()]) byId.set(r.id, r);
    return [...byId.values()];
  }, [s.items, s.older]);
  const searching = searchOpen && query.trim().length > 0;
  const list = searching ? searchRecords(items, query, filter) : dayRecords(items, selected, filter);
  const shown = searching || showAll ? list : list.slice(0, 2);
  const firstUse = s.items != null && s.items.length === 0 && Object.values(s.older).every((x) => x.length === 0);

  const pick = (d: string) => {
    setSelected(d);
    setShowAll(false);
  };
  const step = (dir: -1 | 1) => pick(expanded ? sameDayIn(shiftMonth(month, dir), selected) : shiftDateKey(selected, dir * 7));

  return (
    <ScrollView
      ref={scroll}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={[{ paddingTop: inset.top + 12, paddingBottom: bottom + 24, paddingHorizontal: SPACE.side, gap: 14 }, READABLE_WIDE]}
    >
      <PageHead title="기록">
        <MenuButton />
      </PageHead>
      <Segmented<'log' | 'trends'>
        label="기록 보기 방식"
        options={[
          { value: 'log', label: '날짜별' },
          { value: 'trends', label: '변화' },
        ]}
        value={seg}
        onChange={setSeg}
      />

      {seg === 'trends' ? (
        <Trends items={items} today={today} c={c} />
      ) : (
        <>
          {/* 달 · 이전 · 오늘 · 다음 — 달을 누르면 달 전체를 펴고 접는다(편 동안 이전 · 다음은 달 단위) */}
          <View style={styles.monthRow}>
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
          <View style={[styles.calendar, { backgroundColor: c.card, boxShadow: c.float }]}>
            {expanded ? (
              <View style={styles.grid}>
                {['월', '화', '수', '목', '금', '토', '일'].map((w) => (
                  <Text key={w} style={[styles.weekHead, { color: c.muted }]}>
                    {w}
                  </Text>
                ))}
                {monthCells(month).map((d, i) =>
                  d ? (
                    <DayButton key={d} date={d} small today={today} selected={selected === d} marks={kindsOn(items, d)} onPress={() => pick(d)} c={c} />
                  ) : (
                    <View key={`b${i}`} style={styles.cell} />
                  )
                )}
              </View>
            ) : (
              <View style={styles.week}>
                {weekOf(selected).map((d) => (
                  <DayButton key={d} date={d} today={today} selected={selected === d} marks={kindsOn(items, d)} onPress={() => pick(d)} c={c} />
                ))}
              </View>
            )}
          </View>

          {/* 거르기 넷 + 찾기 — 찾는 동안에도 거르기가 같이 돈다, 고른 날은 그대로 남는다 */}
          <View style={styles.filters}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ flex: 1 }}>
              {FILTERS.map((f) => {
                const on = filter === f.value;
                return (
                  <Press
                    key={f.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      setFilter(f.value);
                      setShowAll(false);
                    }}
                    style={[styles.chip, { backgroundColor: on ? c.ink : 'transparent' }]}
                  >
                    <Text style={{ color: on ? c.page : c.muted, fontSize: 14, fontWeight: on ? '700' : '500' }}>{f.label}</Text>
                  </Press>
                );
              })}
            </ScrollView>
            <Press
              accessibilityRole="button"
              accessibilityLabel="기록 찾기"
              accessibilityState={{ expanded: searchOpen }}
              onPress={() => {
                setSearchOpen((o) => !o);
                if (searchOpen) setQuery('');
              }}
              style={[styles.searchBtn, { backgroundColor: searchOpen ? withAlpha(c.link, 0.14) : c.card, boxShadow: searchOpen ? undefined : c.float }]}
            >
              <Icon name="search" size={18} color={searchOpen ? c.link : c.ink} />
            </Press>
          </View>
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

          {/* 고른 날(찾는 중이면 '찾은 기록') */}
          <View style={styles.dayTitle}>
            <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink }]}>
              {searching ? '찾은 기록' : `${korDay(selected)} · ${weekdayKo(selected)}`}
            </Text>
            {s.items ? (
              <View style={[styles.count, { backgroundColor: withAlpha(c.link, 0.12) }]}>
                <Text style={{ color: c.link, fontSize: 12, fontWeight: '700' }}>{list.length}개</Text>
              </View>
            ) : null}
          </View>

          {s.items == null ? (
            s.error ? (
              <Empty c={c} icon="circle-alert" title={s.error} action="다시 불러오기" onAction={() => void reloadRecords(today)} />
            ) : (
              <View style={{ gap: 10 }}>
                <Pulse style={[styles.skel, { backgroundColor: c.line }]} />
                <Pulse style={[styles.skel, { backgroundColor: c.line, height: 96 }]} />
              </View>
            )
          ) : firstUse ? (
            <Empty c={c} icon="pencil" title="아직 남긴 기록이 없어요" />
          ) : list.length === 0 ? (
            searching ? (
              <Empty c={c} icon="search" title="찾는 기록이 없어요" sub={filter === 'all' ? '다른 말로 찾아보세요.' : '기록 종류를 전체로 바꿔 보세요.'} />
            ) : (
              <Empty c={c} icon="calendar-days" title="이날은 기록이 없어요" sub={filter === 'all' ? '다른 날짜를 골라 보세요.' : '기록 종류를 바꿔 보세요.'} />
            )
          ) : (
            <View>
              {shown.map((r, i) => (
                <Fragment key={r.id}>
                  {searching && (i === 0 || shown[i - 1].date !== r.date) ? (
                    <Text style={[styles.searchDate, { color: c.muted }]}>{`${korDay(r.date)} · ${weekdayKo(r.date)}`}</Text>
                  ) : null}
                  <Animated.View entering={FadeInDown.duration(280).delay(Math.min(i * 35, 80))}>
                    <EventRow r={r} last={i === shown.length - 1} c={c} />
                  </Animated.View>
                </Fragment>
              ))}
            </View>
          )}
          {s.items && s.error ? <Text style={{ color: c.muted, fontSize: 13 }}>{s.error} 받아 둔 기록이에요.</Text> : null}
          {!searching && list.length > 2 ? (
            <Press accessibilityRole="button" accessibilityState={{ expanded: showAll }} onPress={() => setShowAll((x) => !x)} style={styles.more}>
              <Text style={{ color: c.link, fontSize: 14, fontWeight: '600' }}>{showAll ? '접기' : `나머지 ${list.length - 2}개 보기`}</Text>
              <Icon name={showAll ? 'chevron-up' : 'chevron-down'} size={15} color={c.link} />
            </Press>
          ) : null}
          {/* 그날의 자세한 칸(투구 · 운동 · 영양 · 체크인 · 일정) — 일정 만들기 · 고치기도 거기서 */}
          {!searching && s.items && !firstUse ? (
            <Press accessibilityRole="link" onPress={() => router.push(`/calendar?date=${selected}` as Href)} style={styles.more}>
              <Text style={{ color: c.muted, fontSize: 13 }}>그날 자세히 · 일정</Text>
              <Icon name="chevron-right" size={14} color={c.muted} />
            </Press>
          ) : null}
        </>
      )}

      <Shortcuts c={c} />
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
      <Text style={[TYPE.num, { color: selected ? c.onAction : c.ink, fontSize: small ? 15 : 19 }]}>{Number(date.slice(8, 10))}</Text>
      <View style={styles.marks}>
        {Array.from({ length: Math.min(3, marks) }, (_, i) => (
          <View key={i} style={[styles.mark, { backgroundColor: selected ? c.onAction : c.link }]} />
        ))}
      </View>
    </Press>
  );
}

const GLYPH: Record<RecordItem['kind'], IconName> = { pitch: 'circle-dot', training: 'dumbbell', armcare: 'shield-plus', drill: 'focus', checkin: 'heart-pulse' };

/** 시간순 줄 — 왼쪽 종류 동그라미 · 이어지는 선, 오른쪽 카드(종류 · 시각 · 이름 · 값). 투구는 투구량을 가장 크게, 구속은 따로 */
function EventRow({ r, last, c }: { r: RecordItem; last: boolean; c: Palette }) {
  const speed = usePrefs().speed;
  const time = timeText(r.at);
  const go = () => {
    if (r.kind === 'pitch') return router.push(`/pitch/${r.date}` as Href);
    if (r.kind === 'checkin') return router.push(`/calendar?date=${r.date}` as Href);
    router.push(`/training/day/${r.date}` as Href);
  };
  const pitch = r.kind === 'pitch' && !r.rested ? r : null;
  const value = valueOf(r);
  const note = noteOf(r);
  const spoken = [KIND_LABEL[r.kind], time, titleOf(r), pitch ? `${pitch.pitches}구` : null, pitch?.maxKmh != null ? `최고 ${round1(toSpeed(pitch.maxKmh, speed))} ${speedLabel(speed)}` : null, value ? `${value.n}${value.unit}` : null, note]
    .filter(Boolean)
    .join(', ');
  return (
    <View style={styles.event}>
      <View style={styles.rail} accessible={false}>
        <View style={[styles.railDot, { backgroundColor: withAlpha(c.link, 0.14) }]}>
          <Icon name={GLYPH[r.kind]} size={15} color={c.link} />
        </View>
        {last ? null : <View style={[styles.railLine, { backgroundColor: c.line }]} />}
      </View>
      <Press card accessibilityRole="button" accessibilityLabel={spoken} onPress={go} style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }, pitch && { borderLeftWidth: 3, borderLeftColor: c.link }]}>
        <View style={styles.cardTop}>
          <View style={[styles.badge, { backgroundColor: withAlpha(c.link, 0.12) }]}>
            <Text style={{ color: c.link, fontSize: 12, fontWeight: '700' }}>{KIND_LABEL[r.kind]}</Text>
          </View>
          {time ? <Text style={{ color: c.muted, fontSize: 13, fontVariant: ['tabular-nums'] }}>{time}</Text> : null}
        </View>
        {pitch ? (
          <>
            <Text style={[TYPE.section, { color: c.ink }]}>{pitch.title}</Text>
            <View style={styles.metrics}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[TYPE.num, { color: c.ink, fontSize: 40, lineHeight: 44 }]}>
                  {pitch.pitches}
                  <Text style={{ color: c.muted, fontSize: 15, fontWeight: '500' }}> 구</Text>
                </Text>
                <Text style={{ color: c.muted, fontSize: 13 }}>투구량</Text>
              </View>
              <View style={[styles.metricLine, { backgroundColor: c.line }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[TYPE.num, { color: pitch.maxKmh != null ? c.ink : c.muted, fontSize: 28, lineHeight: 44 }]}>
                  {pitch.maxKmh != null ? round1(toSpeed(pitch.maxKmh, speed)) : '—'}
                </Text>
                <Text style={{ color: c.muted, fontSize: 13 }}>
                  최고 구속 <Text style={{ fontSize: 11 }}>{speedLabel(speed)}</Text>
                </Text>
              </View>
            </View>
            <View style={[styles.foot, { borderTopColor: c.line }]}>
              {pitch.videos ? <Icon name="film" size={15} color={c.muted} /> : null}
              <Text style={{ flex: 1, color: c.muted, fontSize: 13 }}>
                {[pitch.videos ? `영상 ${pitch.videos}개` : '투구 기록', pitch.memo ? '메모' : null].filter(Boolean).join(' · ')}
              </Text>
              <Icon name="chevron-right" size={15} color={c.muted} />
            </View>
          </>
        ) : (
          <>
            <View style={styles.compact}>
              <Text numberOfLines={1} style={[TYPE.card, { color: c.ink, flex: 1 }]}>
                {titleOf(r)}
              </Text>
              {value ? (
                <Text style={[TYPE.num, { color: c.ink, fontSize: value.unit ? 26 : 15 }]}>
                  {value.n}
                  {value.unit ? <Text style={{ color: c.muted, fontSize: 13, fontWeight: '500' }}> {value.unit}</Text> : null}
                </Text>
              ) : null}
            </View>
            {note ? <Text style={{ color: c.muted, fontSize: 13 }}>{note}</Text> : null}
          </>
        )}
      </Press>
    </View>
  );
}

function Empty({ c, icon, title, sub, action, onAction }: { c: Palette; icon: IconName; title: string; sub?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={[styles.empty, { backgroundColor: c.card }]}>
      <Icon name={icon} size={22} color={c.link} />
      <Text style={[TYPE.card, { color: c.ink, textAlign: 'center' }]}>{title}</Text>
      {sub ? <Text style={{ color: c.muted, fontSize: 13, textAlign: 'center' }}>{sub}</Text> : null}
      {action && onAction ? (
        <Press accessibilityRole="button" onPress={onAction} style={[styles.retry, { backgroundColor: c.action }]}>
          <Text style={{ color: c.onAction, fontSize: 15, fontWeight: '600' }}>{action}</Text>
        </Press>
      ) : null}
    </View>
  );
}

/**
 * 변화 — 투구 · 트레이닝 분석(부하 · 구속 · 투구량 · 운동 이력, app/analysis.tsx)으로 가는 문 둘. 숫자는 홈이 마지막으로 받은 실제 값 ·
 * 기록 탭이 쥔 기록에서만 — 없으면 '기록이 쌓이면 보여요'.
 */
function Trends({ items, today, c }: { items: RecordItem[]; today: string; c: Palette }) {
  const speed = usePrefs().speed;
  const board = homeSnapshot()?.board;
  const since = shiftDateKey(today, -27);
  const pitchDays = new Set(items.filter((r) => r.kind === 'pitch' && !r.rested && r.date >= since).map((r) => r.date)).size;
  const trainDays = new Set(items.filter((r) => filterOf(r) === 'training' && r.date >= since).map((r) => r.date)).size;
  const v = board?.bestVelocity;
  const load = board?.load;
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: c.muted, fontSize: 13 }}>최근 4주 · 같은 날 여러 기록은 하루로 셈</Text>
      <TrendCard
        c={c}
        icon="gauge"
        title="투구 분석"
        lines={[
          ['던진 날', pitchDays ? `${pitchDays}일` : '기록 없음'],
          /* 홈이 아직 못 받은 값은 '—'(없다고 말하지 않는다) */
          [v?.scope === 'all' ? '최고 구속 · 전체' : '최고 구속 · 최근 6주', v ? `${round1(toSpeed(v.kmh, speed))} ${speedLabel(speed)}` : board ? '측정 기록 없음' : '—'],
          ['부하 지수', load ? `${load.ratio.toFixed(2)} · ${load.label}` : board ? '기록이 쌓이면 보여요' : '—'],
        ]}
        onPress={() => router.push('/analysis?view=pitch' as Href)}
      />
      <TrendCard
        c={c}
        icon="dumbbell"
        title="트레이닝 분석"
        lines={[['운동한 날', trainDays ? `${trainDays}일` : '기록 없음']]}
        onPress={() => router.push('/analysis?view=training' as Href)}
      />
    </View>
  );
}

function TrendCard({ c, icon, title, lines, onPress }: { c: Palette; icon: IconName; title: string; lines: [string, string][]; onPress: () => void }) {
  return (
    <Press card accessibilityRole="button" accessibilityLabel={`${title}, ${lines.map((l) => l.join(' ')).join(', ')}`} onPress={onPress} style={[styles.trend, { backgroundColor: c.card, boxShadow: c.float }]}>
      <View style={styles.trendHead}>
        <View style={[styles.trendIcon, { backgroundColor: withAlpha(c.link, 0.12) }]}>
          <Icon name={icon} size={18} color={c.link} />
        </View>
        <Text style={[TYPE.card, { color: c.ink, flex: 1 }]}>{title}</Text>
        <Icon name="chevron-right" size={16} color={c.muted} />
      </View>
      {lines.map(([k, val]) => (
        <View key={k} style={styles.trendLine}>
          <Text style={{ color: c.muted, fontSize: 14 }}>{k}</Text>
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{val}</Text>
        </View>
      ))}
    </Press>
  );
}

/** 내 영상 · 3D 분석 결과 — 실제 목록 수(같은 영상은 한 번 — 내 영상 목록, 리포트는 결과가 있는 내 투구만) */
function Shortcuts({ c }: { c: Palette }) {
  const videos = useMyVideos().items;
  const [lab, setLab] = useState<number | null>(() => (labCount && labCount.epoch === cacheEpoch() ? labCount.n : null));
  const load = useCallback(() => {
    const e = cacheEpoch();
    rpc<{ ok: true; samples: { status: { text: string } | null }[] } | { ok: false }>('pitch-lab.loadAppLabList', 'mine').then(
      (r) => {
        if (!r.ok || e !== cacheEpoch()) return;
        const n = r.samples.filter((x) => x.status?.text === '3D 결과 있음').length;
        labCount = { epoch: e, n };
        setLab(n);
      },
      () => undefined
    );
  }, []);
  useEffect(load, [load]);
  useOnTabActive(load);
  const fav = videos?.filter((v) => v.revisit).length ?? 0;
  return (
    <View style={styles.shortcuts}>
      <Press card accessibilityRole="button" accessibilityLabel={`내 영상${videos ? `, ${videos.length}개, 즐겨찾기 ${fav}개` : ''}`} onPress={() => router.push('/my-videos' as Href)} style={[styles.shortcut, { backgroundColor: c.card, boxShadow: c.float }]}>
        <View style={[styles.trendIcon, { backgroundColor: withAlpha(c.link, 0.12) }]}>
          <Icon name="clapperboard" size={18} color={c.link} />
        </View>
        <Text style={[TYPE.card, { color: c.ink }]}>내 영상</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>{videos ? `${videos.length}개 · 즐겨찾기 ${fav}` : '즐겨찾기'}</Text>
      </Press>
      <Press card accessibilityRole="button" accessibilityLabel={`3D 분석 결과${lab != null ? `, ${lab}개 리포트` : ''}`} onPress={() => router.push('/lab' as Href)} style={[styles.shortcut, { backgroundColor: c.card, boxShadow: c.float }]}>
        <View style={[styles.trendIcon, { backgroundColor: withAlpha(c.link, 0.12) }]}>
          <Icon name="focus" size={18} color={c.link} />
        </View>
        <Text style={[TYPE.card, { color: c.ink }]}>3D 분석 결과</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>{lab != null ? `${lab}개 리포트` : '리포트'}</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  monthBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  tools: { flexDirection: 'row', alignItems: 'center' },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  todayBtn: { minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  calendar: { borderRadius: 22, padding: 8 },
  week: { flexDirection: 'row', gap: 2 },
  day: { flex: 1, minWidth: 0, minHeight: 82, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekHead: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, paddingVertical: 6 },
  cell: { width: `${100 / 7}%`, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 },
  marks: { flexDirection: 'row', gap: 2, height: 4 },
  mark: { width: 4, height: 4, borderRadius: 2 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { minHeight: 40, borderRadius: 20, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  searchBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 14 },
  searchInput: { flex: 1, fontSize: 16, minHeight: 44 },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dayTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  count: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  skel: { height: 150, borderRadius: 22 },
  searchDate: { fontSize: 13, marginTop: 6, marginBottom: 6, marginLeft: 44 },
  event: { flexDirection: 'row', gap: 12 },
  rail: { width: 32, alignItems: 'center' },
  railDot: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  railLine: { flex: 1, width: 1.5, marginTop: 6 },
  card: { flex: 1, minWidth: 0, borderRadius: 22, padding: 16, gap: 8, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  metrics: { flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  metricLine: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 4 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 2 },
  compact: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  more: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  empty: { borderRadius: 22, paddingVertical: 36, paddingHorizontal: 20, alignItems: 'center', gap: 8 },
  retry: { marginTop: 6, minHeight: 44, paddingHorizontal: 20, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  trend: { borderRadius: 22, padding: 16, gap: 8 },
  trendHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  trendIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  trendLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 },
  shortcuts: { flexDirection: 'row', gap: 12, marginTop: 6 },
  shortcut: { flex: 1, minWidth: 0, borderRadius: 22, padding: 16, gap: 8, minHeight: 128 },
});
