import { type Href, router } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isRestSession } from '@/lib/session-type';
import { effortText } from '@/lib/pitch-effort';
import { formatSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { EMPTY_FIND, filterLogs, isFindActive, type FindQuery } from '@/lib/pitch-find';
import { usePalette } from '~/lib/ui';
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
  const c = usePalette();
  const speed = usePrefs().speed;
  const inset = useSafeAreaInsets();
  const [month, setMonth] = useState(monthOf(today));
  const { logs, loading, error, reload } = useMonth(month);
  /* 찾기 — 조건이 켜지면 모든 기록에서 거른다(달 대신) */
  const [q, setQ] = useState<FindQuery>(EMPTY_FIND);
  const finding = isFindActive(q);
  const all = useAllLogs(finding);

  const list = finding
    ? filterLogs([...(all.logs ?? [])].reverse(), q)
    : [...(logs ?? [])].reverse();
  const thisYear = today.slice(0, 4);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={[{
        paddingTop: inset.top + 12,
        paddingBottom: bottom + 24,
        paddingHorizontal: 16,
        gap: 16,
      }, READABLE_WIDE]}
      refreshControl={
        <RefreshControl refreshing={loading && logs != null} onRefresh={reload} />
      }
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: c.ink }]}>투구 기록</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/velocity')}
          style={[styles.add, { backgroundColor: c.chip }]}
        >
          <Text style={[styles.addText, { color: c.ink }]}>구속 측정</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: '/pitch/edit' as Href as never,
              params: { date: today },
            })
          }
          style={[styles.add, { backgroundColor: c.sky }]}
        >
          <Text style={styles.addText}>오늘 기록</Text>
        </Pressable>
      </View>

      {/* 아이패드 가로(~/lib/layout TwoColumns) — 왼쪽 오늘 · 찾기 · 달력, 오른쪽 그달 기록 목록. 좁으면 위아래 그대로 */}
      <TwoColumns ratio={[1, 1]} gap={16}
        left={
          <>
            {!finding ? <PitchTodayCard today={today} /> : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(
                [
                  ['2분할 비교', () => router.push('/pitch/compare' as Href)],
                  ['투구 분석', () => router.push('/analysis?view=pitch' as Href)],
                  ['3D 동작 분석', () => router.push('/lab' as Href)],
                ] as const
              ).map(([label, go]) => (
                <Pressable key={label} accessibilityRole="button" onPress={go} style={[styles.link, { backgroundColor: c.card }]}>
                  <Text style={[styles.linkText, { color: c.ink }]}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <FindBar q={q} onChange={setQ} />

            {finding ? (
              <Text style={{ color: c.muted, fontSize: 13 }}>
                {all.logs ? `맞는 기록 ${list.length}건` : '모든 기록을 불러오는 중…'}
              </Text>
            ) : (
              <MonthGrid
                month={month}
                today={today}
                logs={logs}
                onMonth={setMonth}
                onDay={(day) => router.push(`/pitch/${day}` as Href)}
              />
            )}
          </>
        }
        right={
          <>
            {error && !logs ? (
              <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text>
            ) : null}

            <View style={{ gap: 8 }}>
              {list.map((l) => (
                <Pressable
                  key={l.id}
                  onPress={() => router.push(`/pitch/${dateKeyOf(l.date)}` as Href)}
                  style={[styles.row, { backgroundColor: c.card }]}
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
                  {l.videoPaths.length ? (
                    <Text style={{ color: c.sky, fontSize: 13 }}>
                      영상 {l.videoPaths.length}
                    </Text>
                  ) : null}
                  <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
                </Pressable>
              ))}
              {!finding ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/pitch/import' as Href)}
                  style={[styles.row, { backgroundColor: c.card }]}
                >
                  <Text style={[styles.rowMain, { color: c.sky }]}>지난 영상 가져오기</Text>
                  <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
                </Pressable>
              ) : null}
              {(finding ? all.logs : logs) && list.length === 0 ? (
                <Text
                  style={{
                    color: c.muted,
                    fontSize: 15,
                    textAlign: 'center',
                    paddingVertical: 24,
                  }}
                >
                  {finding ? '맞는 기록이 없어요.' : '이 달은 기록이 없어요.'}
                </Text>
              ) : null}
            </View>
          </>
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 34, fontWeight: '700' },
  add: {
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addText: { color: '#fff', fontSize: 15, fontWeight: '600' },
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
