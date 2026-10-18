import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRESSED, SPACE, usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { AnalysisPill, PageHead, Segmented, ToolCircle } from '~/shell/heading';
import { ComparePickBar, LogList } from './log-list';
import { MonthGrid } from './month-grid';
import { PitchDayPanel } from './day-panel';
import { PitchTodayCard } from './today-card';
import { monthOf, reloadFeatured, reloadNoteDays, useAllLogs, useDayThumbs, useMonth, useNoteDays } from './store';

import { READABLE_WIDE, TwoColumns } from '~/lib/layout';
import { useOnTabActive, useRetapTop } from '~/shell/tab-pager';
import { useTabIntent } from '~/shell/tab-intent';

/**
 * 투구 탭(앱 화면) — 찾기 · 달력(그날 공 수 · 영상 점) + 그달 기록 목록 · 지난 영상 가져오기. 날짜를 누르면 그날 화면(/pitch/[date]).
 * 웹 투구 탭(app/(app)/videos)과 같은 규칙.
 */
export function PitchTab({ today, bottom, onWeb }: { today: string; bottom: number; onWeb: (href: string) => void }) {
  void onWeb;
  const c = usePalette();
  const inset = useSafeAreaInsets();
  /* [캘린더 | 목록] — 웹 투구 탭 고르개(pitch-log-heading.tsx PITCH_VIEW_OPTIONS). 찾기는 목록에만(웹 video-gallery 와 같다) */
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [month, setMonth] = useState(monthOf(today));
  const [monthSettled, setMonthSettled] = useState(false);
  /* 고른 날 — 밑에 그날 칸(웹 video-calendar). 펴지면 320ms 뒤 화면 밖이면 굴려 보인다 */
  const [selected, setSelected] = useState<string | null>(null);
  const panelY = useRef(0);
  const viewH = useRef(0);
  const scrollY = useRef(0);
  const { logs, error, reload } = useMonth(month);
  const thumbs = useDayThumbs(logs);
  /* 탭을 옮겼다 돌아오면 새로 받는다(판은 붙어 있다) */
  useOnTabActive(() => void Promise.all([reload(), reloadFeatured(), reloadNoteDays()]));
  const notes = useNoteDays();
  /* 홈 그날 칸의 '투구 탭에서 보기' — 달력이 그날을 연 채로(웹 /videos?date=) */
  useTabIntent('pitch', (d) => {
    setView('calendar');
    setMonthSettled(true);
    setMonth(monthOf(d));
    setSelected(d);
  });
  /* 처음 펼 달 — 이번 달에 기록이 없으면 가장 최근에 기록을 남긴 달(웹 video-calendar). 한 번 정했거나 달을 직접 옮겼으면 안 건드린다 */
  const needLatest = !monthSettled && logs?.length === 0;
  const all = useAllLogs(view === 'list' || needLatest);
  if (!monthSettled && logs?.length) setMonthSettled(true);
  if (needLatest && all.logs) {
    setMonthSettled(true);
    const latest = all.logs.reduce((m, l) => (l.date > m ? l.date : m), '');
    if (latest && monthOf(latest.slice(0, 10)) !== month) setMonth(monthOf(latest.slice(0, 10)));
  }
  /* 지금 탭(투구)을 다시 누르면 맨 위로 */
  const scrollRef = useRef<ScrollViewInstance>(null);
  useRetapTop(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  useEffect(() => {
    if (!selected) return;
    const t = setTimeout(() => {
      /* 칸 위치는 오른쪽 열 기준이라 대략 — 밑으로 잘리면 그 칸 머리가 화면 위쪽에 오게 */
      const top = panelY.current;
      if (top + 160 > scrollY.current + viewH.current) scrollRef.current?.scrollTo({ y: Math.max(0, top - 80), animated: true });
    }, 320);
    return () => clearTimeout(t);
  }, [selected]);

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      ref={scrollRef}
      onLayout={(e) => (viewH.current = e.nativeEvent.layout.height)}
      onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
      scrollEventThrottle={32}
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={[
        { paddingTop: inset.top + SPACE.section, paddingBottom: bottom + 24, paddingHorizontal: SPACE.side, gap: SPACE.gap },
        READABLE_WIDE,
      ]}
    >
      <PageHead title="투구">
        <ToolCircle icon="radar" label="구속 측정" onPress={() => router.push('/velocity')} />
        <ToolCircle icon="rotate3d" label="3D 동작 분석" onPress={() => router.push('/lab' as Href)} />
        <AnalysisPill view="pitch" />
      </PageHead>
      <Segmented
        label="기록 보기 방식"
        options={[
          { value: 'calendar', label: '캘린더' },
          { value: 'list', label: '목록' },
        ]}
        value={view}
        onChange={setView}
      />

      {/* 아이패드 가로(~/lib/layout TwoColumns) — 왼쪽 오늘 카드 · 가져오기, 오른쪽 캘린더나 목록. 좁으면 위아래 그대로 */}
      <TwoColumns
        ratio={[1, 1]}
        gap={16}
        left={
          <>
            <PitchTodayCard today={today} />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/pitch/import' as Href)}
              style={({ pressed }) => [styles.importBtn, { backgroundColor: withAlpha(c.ink, 0.06) }, pressed && PRESSED]}
            >
              <Icon name="film" size={16} color={c.ink} />
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '500' }}>지난 영상 가져오기</Text>
            </Pressable>
          </>
        }
        right={
          view === 'calendar' ? (
            <>
              {error && !logs ? <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text> : null}
              <MonthGrid
                video
                thumbs={thumbs}
                notes={notes}
                month={month}
                today={today}
                logs={logs}
                selected={selected}
                onMonth={(m) => {
                  setMonthSettled(true);
                  setMonth(m);
                  setSelected(null);
                }}
                onDay={(day) => setSelected((cur) => (cur === day ? null : day))}
              />
              {/* 날을 누르면 밑에 그날 칸이 펴진다(웹 video-calendar DayPanel) — 같은 날을 다시 누르면 닫힘 */}
              {selected ? (
                <View onLayout={(e) => (panelY.current = e.nativeEvent.layout.y)}>
                  <PitchDayPanel key={selected} date={selected} logs={(logs ?? []).filter((l) => l.date.slice(0, 10) === selected)} />
                </View>
              ) : null}
            </>
          ) : (
            <LogList
              logs={all.logs}
              today={today}
              onReveal={(y) => scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + y - inset.top - 72), animated: true })}
            />
          )
        }
      />
    </ScrollView>
    {/* 2분할 비교 고르는 중 — 하단 탭 위에 뜬 막대(웹 video-gallery) */}
    {view === 'list' ? <ComparePickBar bottom={Math.max(inset.bottom - 13, 12) + 62 + 12} /> : null}
    </View>
  );
}

/* 한 주 일곱 칸 — 100/7% 로 두면 소수점 반올림이 쌓여 일곱째 칸(토)이 다음 줄로 넘어갔다(날짜와 요일이 어긋남) */
const SEVENTH = '14.28%';
const styles = StyleSheet.create({
  link: { height: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  linkText: { fontSize: 14, fontWeight: '600' },
  week: { width: SEVENTH, textAlign: 'center', fontSize: 12, paddingBottom: 4 },
  cell: {
    width: SEVENTH,
    alignItems: 'center',
    paddingVertical: 4,
    minHeight: 58,
  },
  /* 웹 import-sheet ImportEntry — 회색 알약, 가운데 필름 그림 + 글 */
  importBtn: { minHeight: 40, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  rowDate: { fontSize: 13, minWidth: 40, fontVariant: ['tabular-nums'] },
  rowMain: { flex: 1, fontSize: 15, fontWeight: '600' },
});
