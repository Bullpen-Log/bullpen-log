import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isRestSession } from '@/lib/session-type';
import { effortText } from '@/lib/pitch-effort';
import { formatSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { EMPTY_FIND, filterLogs, isFindActive, type FindQuery } from '@/lib/pitch-find';
import { PRESSED, SPACE, usePalette } from '~/lib/ui';
import { AnalysisPill, PageHead, Segmented, ToolCircle } from '~/shell/heading';
import { dateKeyOf } from './api';
import { MonthGrid } from './month-grid';
import { FindBar } from './find-bar';
import { PitchTodayCard } from './today-card';
import { monthOf, useAllLogs, useMonth } from './store';

import { READABLE_WIDE, TwoColumns } from '~/lib/layout';

/** 강도 글 1~10(웹 effortText — 옛 기록은 intensity 로) */
const effortOf = (l: { intensity: number | null; effortPct: number | null }) =>
  effortText({ intensity: l.intensity ?? 0, effortPct: l.effortPct });

/**
 * 투구 탭(앱 화면) — 찾기 · 달력(그날 공 수 · 영상 점) + 그달 기록 목록 · 지난 영상 가져오기. 날짜를 누르면 그날 화면(/pitch/[date]).
 * 웹 투구 탭(app/(app)/videos)과 같은 규칙.
 */
export function PitchTab({ today, bottom, onWeb }: { today: string; bottom: number; onWeb: (href: string) => void }) {
  void onWeb;
  const c = usePalette();
  const speed = usePrefs().speed;
  const inset = useSafeAreaInsets();
  /* [캘린더 | 목록] — 웹 투구 탭 고르개(pitch-log-heading.tsx PITCH_VIEW_OPTIONS). 찾기는 목록에만(웹 video-gallery 와 같다) */
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [month, setMonth] = useState(monthOf(today));
  const { logs, error } = useMonth(month);
  const [q, setQ] = useState<FindQuery>(EMPTY_FIND);
  const all = useAllLogs(view === 'list');
  const finding = isFindActive(q);
  const allLogs = [...(all.logs ?? [])].reverse();
  const list = finding ? filterLogs(allLogs, q) : allLogs;
  const thisYear = today.slice(0, 4);
  /* 달 묶음 — 웹 목록처럼 '2026년 10월' 머리 밑에 그달 기록(새것 먼저) */
  const groups: { key: string; items: typeof list }[] = [];
  for (const l of list) {
    const key = l.date.slice(0, 7);
    const g = groups[groups.length - 1];
    if (g?.key === key) g.items.push(l);
    else groups.push({ key, items: [l] });
  }

  const row = (l: (typeof list)[number]) => (
    <Pressable
      key={l.id}
      onPress={() => router.push(`/pitch/${dateKeyOf(l.date)}` as Href)}
      style={({ pressed }) => [styles.row, { backgroundColor: c.card, boxShadow: c.float }, pressed && PRESSED]}
    >
      <Text style={[styles.rowDate, { color: c.muted }]}>
        {l.date.slice(0, 4) !== thisYear ? `${l.date.slice(2, 4)}.` : ''}
        {Number(l.date.slice(5, 7))}/{Number(l.date.slice(8, 10))}
      </Text>
      <Text style={[styles.rowMain, { color: c.ink }]} numberOfLines={1}>
        {l.sessionType}
        {isRestSession(l.sessionType) ? '' : ` · ${l.pitchCount}구`}
        {effortOf(l) ? ` · 강도 ${effortOf(l)}` : ''}
        {l.maxVelocity ? ` · ${formatSpeed(l.maxVelocity, speed)}` : ''}
      </Text>
      {l.videoPaths.length ? <SymbolView name="video.fill" size={14} tintColor={c.sky} /> : null}
      <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={[
        { paddingTop: inset.top + SPACE.section, paddingBottom: bottom + 24, paddingHorizontal: SPACE.side, gap: SPACE.gap },
        READABLE_WIDE,
      ]}
    >
      <PageHead title="투구">
        <ToolCircle icon="speedometer" label="구속 측정" onPress={() => router.push('/velocity')} />
        <ToolCircle icon="rotate.3d" label="3D 동작 분석" onPress={() => router.push('/lab' as Href)} />
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
              style={({ pressed }) => [styles.row, { backgroundColor: c.card, boxShadow: c.float }, pressed && PRESSED]}
            >
              <SymbolView name="photo.on.rectangle" size={17} tintColor={c.sky} />
              <Text style={[styles.rowMain, { color: c.ink }]}>지난 영상 가져오기</Text>
              <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
            </Pressable>
          </>
        }
        right={
          view === 'calendar' ? (
            <>
              {error && !logs ? <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text> : null}
              <MonthGrid month={month} today={today} logs={logs} onMonth={setMonth} onDay={(day) => router.push(`/pitch/${day}` as Href)} />
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, color: c.muted, fontSize: 13 }}>
                  {all.logs ? (finding ? `맞는 기록 ${list.length}건` : `투구 기록 ${list.length}건`) : '기록을 불러오는 중…'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/pitch/compare' as Href)}
                  style={({ pressed }) => [styles.link, { backgroundColor: c.chip }, pressed && { opacity: 0.6 }]}
                >
                  <Text style={[styles.linkText, { color: c.ink }]}>2분할 비교</Text>
                </Pressable>
              </View>
              <FindBar q={q} onChange={setQ} />
              {groups.map((g) => (
                <View key={g.key} style={{ gap: 8 }}>
                  <Text style={{ color: c.ink, fontSize: 15, fontWeight: '700', marginTop: 4 }}>
                    {g.key.slice(0, 4)}년 {Number(g.key.slice(5, 7))}월 <Text style={{ color: c.muted, fontWeight: '500' }}>{g.items.length}건</Text>
                  </Text>
                  {g.items.map(row)}
                </View>
              ))}
              {all.logs && list.length === 0 ? (
                <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', paddingVertical: 24 }}>
                  {finding ? '맞는 기록이 없어요' : '아직 투구 기록이 없어요'}
                </Text>
              ) : null}
            </>
          )
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  link: { height: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  linkText: { fontSize: 14, fontWeight: '600' },
  week: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, paddingBottom: 4 },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 4,
    minHeight: 58,
  },
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
