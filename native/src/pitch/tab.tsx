import { type Href, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRESSED, SPACE, TYPE, usePalette } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { AnalysisPill, PageHead, Segmented } from '~/shell/heading';
import { ComparePickBar, LogList } from './log-list';
import { MonthGrid } from './month-grid';
import { PitchDayPanel } from './day-panel';
import { PitchTodayCard } from './today-card';
import { monthOf, reloadFeatured, reloadNoteDays, useAllLogs, useDayThumbs, useMonth, useNoteDays } from './store';

import { READABLE_WIDE, TwoColumns } from '~/lib/layout';
import { useOnTabActive, useRetapTop } from '~/shell/tab-pager';
import { useTabIntent } from '~/shell/tab-intent';
import { useMenu } from '~/shell/menu-store';
import { round1, speedLabel, toSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import type { PitchLog } from './api';
import { weekStartKey } from '@/lib/pitch-stats';

/**
 * 투구 탭(앱 화면) — 종목 바의 두 칸이 이 판 하나를 나눠 쓴다(2026-10-20 김민: 종목 홈 추가).
 * 홈('투구', /videos): 구속 측정 · ABS · 3D 문 · 운동 영상 · 투구 드릴 · 오늘 카드 · 이번 주 요약.
 * 기록(/videos?view=log): 찾기 · 달력(그날 공 수 · 영상 점) + 목록 · 지난 영상 가져오기. 날짜를 누르면 그날 화면(/pitch/[date]).
 * 웹 투구 탭(app/(app)/videos)과 같은 규칙.
 */
export function PitchTab({ today, bottom, onWeb, log = false }: { today: string; bottom: number; onWeb: (href: string) => void; log?: boolean }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  /* [캘린더 | 목록] — 웹 투구 탭 고르개(pitch-log-heading.tsx PITCH_VIEW_OPTIONS). 찾기는 목록에만(웹 video-gallery 와 같다) */
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  /*
   * 관리자 칸은 사이트가 보낸 메뉴로 — 웹 visibleGroups 가 역할 · 권한(lib/permissions.ts)으로 거른 항목이 있으면 보인다(준관리자도, 2026-10-20).
   * 옛 사이트(메뉴에 없음)면 isAdmin 으로
   */
  const menu = useMenu();
  const hasMenu = (href: string) => menu.groups.some((g) => g.items.some((i) => i.href === href));
  const canAbs = hasMenu('/abs') || menu.isAdmin === true;
  const canVelocityAdmin = hasMenu('/admin/velocity') || menu.isAdmin === true;
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
  const all = useAllLogs((log && view === 'list') || needLatest);
  if (!monthSettled && logs?.length) setMonthSettled(true);
  if (needLatest && all.logs) {
    setMonthSettled(true);
    const latest = all.logs.reduce((m, l) => (l.date > m ? l.date : m), '');
    if (latest && monthOf(latest.slice(0, 10)) !== month) setMonth(monthOf(latest.slice(0, 10)));
  }
  /* 지금 탭(투구)을 다시 누르면 맨 위로 */
  const scrollRef = useRef<ScrollViewInstance>(null);
  useRetapTop(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  /* 홈 ↔ 기록을 바꾸면 맨 위부터(같은 판이라 굴린 자리가 남는다) */
  useEffect(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), [log]);
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
      {log ? (
        <>
          {/* 지난 영상 가져오기는 드물게 쓰여 머리 오른쪽 작은 알약으로(2026-10-21 김민: 달력 위 큰 칸이 첫 시야를 차지했다) */}
          <PageHead title="투구 기록">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="지난 영상 가져오기"
              onPress={() => router.push('/pitch/import' as Href)}
              style={({ pressed }) => [styles.importBtn, { backgroundColor: c.chip }, pressed && PRESSED]}
            >
              <Icon name="film" size={16} color={c.sky} />
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>가져오기</Text>
            </Pressable>
          </PageHead>
          {/* 관리자는 셋째 칸 '구속 측정 관리자'(웹 videos-client VELOCITY_ADMIN_OPTION) — 누르면 그 화면으로 가고 고른 보기는 그대로 */}
          <Segmented<'calendar' | 'list' | 'velocity'>
            label="기록 보기 방식"
            options={[
              { value: 'calendar', label: '캘린더' },
              { value: 'list', label: '목록' },
              ...(canVelocityAdmin ? [{ value: 'velocity' as const, label: '구속 측정 관리자' }] : []),
            ]}
            value={view}
            onChange={(v) => (v === 'velocity' ? router.push('/admin/velocity?from=pitch' as Href) : setView(v))}
          />
          {view === 'calendar' ? (
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
          )}
        </>
      ) : (
        <>
          <PageHead title="투구">
            <AnalysisPill view="pitch" />
          </PageHead>
          {/*
            매일 보는 것 먼저 — 오늘 카드(팔 상태 · 기록 남기기) · 이번 주, 그 밑에 찍으러 가는 문(2026-10-21 김민: 가독성 · 시야 검토).
            아이패드 가로(~/lib/layout TwoColumns)는 왼쪽 오늘 카드, 오른쪽 이번 주. 좁으면 위아래 그대로
          */}
          <TwoColumns ratio={[1, 1]} gap={16} left={<PitchTodayCard today={today} />} right={<PitchWeekCard today={today} onOpen={() => onWeb('/videos?view=log')} />} />
          {/*
            찍으러 가는 문 셋 — 한 줄 같은 폭. 구속 측정 · ABS 는 같은 카메라 화면의 두 모드라 그 모드로 바로 연다(모드 고르기 시트를 건너뜀).
            ABS 는 관리자만(lib/camera-mode.ts adminOnly)
          */}
          <View style={styles.tools}>
            <ToolTile icon="radar" label="구속 측정" onPress={() => router.push('/velocity?mode=speed' as Href)} />
            {canAbs ? <ToolTile icon="zone" label="ABS 판정" onPress={() => router.push('/velocity?mode=abs' as Href)} /> : null}
            <ToolTile icon="pitcher" label="3D 동작 분석" onPress={() => router.push('/lab' as Href)} />
          </View>
          {/* 보는 것(운동 영상 · 투구 드릴)은 찍는 문과 무게를 달리해 목록 줄로(2026-10-21 더보기에서 옮겨 온 둘) */}
          <View style={[styles.links, { backgroundColor: c.card, boxShadow: c.float }]}>
            <LinkRow icon="film" label="운동 영상" onPress={() => router.push('/library/training' as Href)} />
            <View style={[styles.linkLine, { backgroundColor: c.line }]} />
            <LinkRow icon="book-open" label="투구 드릴" onPress={() => router.push('/library/mechanics' as Href)} />
          </View>
        </>
      )}
    </ScrollView>
    {/* 2분할 비교 고르는 중 — 하단 탭 위에 뜬 막대(웹 video-gallery) */}
    {log && view === 'list' ? <ComparePickBar bottom={Math.max(inset.bottom - 13, 12) + 62 + 12} /> : null}
    </View>
  );
}

/** 투구 홈 '이번 주' — 던진 날 · 공 수 · 최고 구속(투구 기록 기준). 주가 지난달에 걸치면 그달 기록도 읽는다. 누르면 기록(달력) */
function PitchWeekCard({ today, onOpen }: { today: string; onOpen: () => void }) {
  const c = usePalette();
  const speed = usePrefs().speed;
  const start = weekStartKey(today);
  const prev = useMonth(monthOf(start)).logs;
  const cur = useMonth(monthOf(today)).logs;
  const week = useMemo(() => {
    if (!prev || !cur) return null;
    const byId = new Map<string, PitchLog>();
    for (const l of [...prev, ...cur]) {
      const d = l.date.slice(0, 10);
      if (d >= start && d <= today) byId.set(l.id, l);
    }
    const rows = [...byId.values()].filter((l) => l.pitchCount > 0);
    const speeds = rows.map((l) => l.maxVelocity).filter((v): v is number => v != null);
    return {
      pitches: rows.reduce((n, l) => n + l.pitchCount, 0),
      days: new Set(rows.map((l) => l.date.slice(0, 10))).size,
      max: speeds.length ? Math.max(...speeds) : null,
    };
  }, [prev, cur, start, today]);
  /* [이름, 숫자, 단위] — 단위는 숫자 글꼴(TYPE.num) 밖에서 작게(한글이 숫자 글꼴에 섞이면 기기 기본 글꼴로 그려진다) */
  const stats: [string, string, string][] = [
    ['투구', week ? String(week.pitches) : '–', week ? '구' : ''],
    ['던진 날', week ? String(week.days) : '–', week ? '일' : ''],
    ['최고 구속', week?.max != null ? String(round1(toSpeed(week.max, speed))) : '–', week?.max != null ? speedLabel(speed) : ''],
  ];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="투구 기록 달력을 열어요"
      onPress={onOpen}
      style={({ pressed }) => [styles.week, { backgroundColor: c.card, boxShadow: c.float }, pressed && PRESSED]}
    >
      <View style={styles.weekHead}>
        <Text style={{ flex: 1, color: c.ink, fontSize: 17, fontWeight: '700' }}>이번 주</Text>
        <Icon name="chevron-right" size={18} color={c.muted} />
      </View>
      <View style={styles.weekRow}>
        {stats.map(([label, value, unit]) => (
          <View key={label} style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
            <Text numberOfLines={1} style={[TYPE.num, { color: c.ink, fontSize: 22 }]}>
              {value}
              {unit ? <Text style={{ color: c.muted, fontSize: 15 }}> {unit}</Text> : null}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

/** 찍으러 가는 문 하나 — 그림 + 이름, 같은 폭으로 나눠 선다 */
function ToolTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.tool, { backgroundColor: c.card, boxShadow: c.float }, pressed && PRESSED]}
    >
      <Icon name={icon} size={24} color={c.sky} />
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** 보는 곳으로 가는 줄 — 그림 · 이름 · › (설정 목록 줄 모양) */
function LinkRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.linkRow, pressed && PRESSED]}>
      <Icon name={icon} size={20} color={c.sky} />
      <Text style={{ flex: 1, color: c.ink, fontSize: 17 }}>{label}</Text>
      <Icon name="chevron-right" size={18} color={c.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  links: { borderRadius: 20, overflow: 'hidden' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 20 },
  linkLine: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
  tools: { flexDirection: 'row', gap: 8 },
  /* 오늘 카드와 같은 판(둥글기 20 · 안쪽 20) */
  week: { borderRadius: 20, padding: 20, gap: 12 },
  weekHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weekRow: { flexDirection: 'row', gap: 12 },
  tool: { flex: 1, minHeight: 80, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  /* 머리 오른쪽 '가져오기' 알약 — '분석' 알약(AnalysisPill)과 같은 44 */
  importBtn: { height: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 },
});
