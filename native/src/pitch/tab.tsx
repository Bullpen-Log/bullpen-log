import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRESSED, SPACE, TYPE, usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { PageHead, Segmented } from '~/shell/heading';
import { ComparePickBar, LogList } from './log-list';
import { MonthGrid } from './month-grid';
import { PitchDayPanel } from './day-panel';
import { ArmStatusChip, ArmStatusPanel, PitchTodayCard, usePitchTodayState } from './today-card';
import { GaugeMark, PitcherMark, ZoneMark } from './dock-art';
import { RecentPitches } from './recent-rows';
import { weekdayKo } from '~/home/plan-model';
import { monthOf, reloadFeatured, reloadNoteDays, useAllLogs, useDayThumbs, useMonth, useNoteDays } from './store';

import { READABLE_WIDE, TwoColumns, columnCell, columnRow, useColumns } from '~/lib/layout';
import { useOnTabActive, useRetapTop } from '~/shell/tab-pager';
import { useTabIntent } from '~/shell/tab-intent';
import { useMenu } from '~/shell/menu-store';
import { MenuButton } from '~/shell/menu-button';
import { LOCKED_HINT, LockedGlyph, LockedRow, lockedColors } from '~/shell/locked';
import { noticeLocked } from '~/shell/release';

/**
 * 투구 탭(앱 화면) — 첫 화면과 투구 기록이 이 판 하나를 나눠 쓴다(2026-10-20 김민: 종목 홈 추가).
 * 홈('투구', /videos): 2026-10-29 확정 디자인 '소프트 솔리드 툴 도크' — 제목 · 메뉴, 오늘 날짜 · 팔 상태, 도구 도크(3D 동작 분석 · 구속 측정 · ABS),
 * 오늘 투구 카드(투구 · 휴식 기록), 최근 투구. 트레이닝 · 암케어 · 메카닉은 트레이닝 탭, 운동 영상 · 투구 드릴은 트레이닝 탭 · 더보기로 옮겼다.
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
  /* 오늘 투구 · 팔 상태(같은 값) — 팔 상태 칸은 주의 · 위험이면 처음부터 편다(안전 문장을 숨기지 않는다), 알약으로 접고 편다 */
  const todayState = usePitchTodayState(today);
  const armLevel = todayState.current?.status.level;
  const armKey = `${today}:${armLevel ?? ''}:${todayState.current?.status.headline ?? ''}`;
  const [armView, setArmView] = useState<{ key: string; open: boolean } | null>(null);
  const armOpen = armView?.key === armKey ? armView.open : armLevel === 'danger' || armLevel === 'caution';
  const [month, setMonth] = useState(monthOf(today));
  const [monthSettled, setMonthSettled] = useState(false);
  /* 고른 날 — 밑에 그날 칸(웹 video-calendar). 펴지면 320ms 뒤 화면 밖이면 굴려 보인다 */
  const [selected, setSelected] = useState<string | null>(null);
  const panelY = useRef(0);
  /*
   * 넓은 창(아이패드 가로)의 기록 — 왼쪽 달력 · 목록, 오른쪽 고른 날 칸(목록에서 줄을 누르면 그날 화면을 덮어 열지 않고 오른쪽에). 좁으면 예전처럼
   * 달력 밑에 그날 칸 · 목록 줄은 그날 화면(2026-10-26 아이패드 점검). 고른 날은 창 크기를 바꿔도 남는다.
   */
  const cols = useColumns();
  const rowY = useRef(0);
  const viewH = useRef(0);
  const scrollY = useRef(0);
  // 홈은 달력에서 고른 과거 달과 별개로 오늘의 달을 읽으며 같은 달을 중복 요청하지 않는다.
  const { logs, error, reload } = useMonth(log ? month : monthOf(today));
  const home = { logs, error, reload };
  // 홈에는 영상 썸네일이 없다. 달력에 들어갔을 때만 장면을 준비한다.
  const thumbs = useDayThumbs(log ? logs : null);
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
  // 이번 달 기록이 없을 때만 과거에서 최근 한 건을 찾는다. 매 진입마다 전체 영상을 받지 않는다.
  const needHomeHistory = !log && home.logs !== null && !home.logs.some((l) => l.date.slice(0, 10) <= today);
  const all = useAllLogs((log && view === 'list') || needLatest || needHomeHistory);
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
      /* 넓으면 그날 칸이 오른쪽 위라 굴릴 것 없다 */
      if (cols.two) return;
      const top = rowY.current + panelY.current;
      if (top + 160 > scrollY.current + viewH.current) scrollRef.current?.scrollTo({ y: Math.max(0, top - 80), animated: true });
    }, 320);
    return () => clearTimeout(t);
  }, [selected, cols.two]);
  const dayLogs = (day: string) => ((view === 'list' ? all.logs : logs) ?? []).filter((l) => l.date.slice(0, 10) === day);

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
          {/* 투구 첫 화면으로 — 하단바가 종목 바(‹)였을 때의 돌아가는 길(2026-10-27 HIG 검토 A안). 하단바 투구를 다시 눌러도 된다 */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="투구로 돌아가기"
            onPress={() => onWeb('/videos')}
            hitSlop={6}
            style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
          >
            <Icon name="back" size={22} color={c.link} />
            <Text style={{ color: c.link, fontSize: 17 }}>투구</Text>
          </Pressable>
          {/* 지난 영상 가져오기는 드물게 쓰여 머리 오른쪽 작은 알약으로(2026-10-21 김민: 달력 위 큰 칸이 첫 시야를 차지했다) */}
          <PageHead title="투구 기록">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="지난 영상 가져오기"
              onPress={() => router.push('/pitch/import' as Href)}
              style={({ pressed }) => [styles.importBtn, { backgroundColor: c.chip }, pressed && PRESSED]}
            >
              <Icon name="film" size={16} color={c.link} />
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
          <View
            onLayout={(e) => {
              cols.onLayout(e);
              rowY.current = e.nativeEvent.layout.y;
            }}
            style={columnRow(cols.two, SPACE.section)}
          >
          <View style={columnCell(cols.two, 3, SPACE.gap)}>
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
              {selected && !cols.two ? (
                <View onLayout={(e) => (panelY.current = e.nativeEvent.layout.y)}>
                  <PitchDayPanel key={selected} date={selected} logs={dayLogs(selected)} />
                </View>
              ) : null}
            </>
          ) : (
            <LogList
              logs={all.logs}
              today={today}
              onReveal={(y) => scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + y - inset.top - 72), animated: true })}
              openDate={cols.two ? selected : null}
              onOpenDate={cols.two ? setSelected : undefined}
            />
          )}
          </View>
          {/* 오른쪽 칸 — 넓을 때만 고른 날(View 는 늘 둔다 — 창 크기를 바꿔도 달력 · 목록이 새로 붙지 않게) */}
          <View style={columnCell(cols.two, 2, SPACE.gap)}>
            {!cols.two ? null : selected ? (
              <PitchDayPanel key={selected} date={selected} logs={dayLogs(selected)} full />
            ) : (
              <View style={[styles.pickHint, { backgroundColor: c.card }]}>
                <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center' }}>{view === 'list' ? '목록에서 줄을 고르면' : '달력에서 날을 고르면'} 그날 기록이 여기 보여요.</Text>
              </View>
            )}
          </View>
          </View>
        </>
      ) : (
        <>
          {/* 머리 — 제목 · 전체 메뉴(☰), 그 밑 오늘 날짜 · 팔 상태 알약(2026-10-29 확정 디자인) */}
          <View style={styles.title}>
            <Text accessibilityRole="header" style={[TYPE.title, { flex: 1, color: c.ink, lineHeight: 40 }]}>투구</Text>
            <MenuButton />
          </View>
          <View style={styles.dateRow}>
            <View style={styles.date} accessible accessibilityLabel={`오늘 ${Number(today.slice(5, 7))}월 ${Number(today.slice(8, 10))}일 ${weekdayKo(today)}요일`}>
              <Text style={[TYPE.num, { color: c.ink, fontSize: 28, lineHeight: 32 }]}>{Number(today.slice(8, 10))}</Text>
              <Text style={{ color: c.muted, fontSize: 12 }}>{`${Number(today.slice(5, 7))}월 · ${weekdayKo(today)}요일`}</Text>
            </View>
            <ArmStatusChip state={todayState} open={armOpen} onPress={() => setArmView({ key: armKey, open: !armOpen })} />
          </View>
          {armOpen ? <ArmStatusPanel state={todayState} /> : null}
          {/*
            도구 도크 — 왼쪽 큰 3D 동작 분석(기능으로 들어가는 문, 탭이 3D 뷰어가 되지 않는다), 오른쪽 위 구속 측정 · 아래 ABS.
            아이패드에서는 도크 · 오늘 투구와 최근 투구를 두 열로, 휴대폰은 같은 읽기 순서로 잇는다.
          */}
          <TwoColumns ratio={[1, 1]} gap={20} left={
            <View style={{ gap: 14 }}>
              <ToolDock canAbs={canAbs} />
              <PitchTodayCard today={today} logs={home.logs} state={todayState} />
            </View>
          } right={
            <RecentPitches
              today={today}
              logs={[...(home.logs ?? []), ...(all.logs ?? [])]}
              loading={home.logs === null || (needHomeHistory && all.logs === null)}
              error={home.error || (needHomeHistory ? all.error : null)}
              onAll={() => onWeb('/videos?view=log')}
              onRetry={() => void home.reload()}
            />
          } />
        </>
      )}
    </ScrollView>
    {/* 2분할 비교 고르는 중 — 하단 탭 위에 뜬 막대(웹 video-gallery) */}
    {log && view === 'list' ? <ComparePickBar bottom={bottom + 12} /> : null}
    </View>
  );
}

/**
 * 출시 전 베타의 투구 탭(2026-10-29 금윤호: "3D 분석만 쓰고 나머지는 아이콘 위 자물쇠 · 회색, 누르면 '준비 중인 기능입니다'") — 일반 · 준관리자.
 * 생김새는 투구 첫 화면 그대로(제목 · 날짜 · 도구 도크)이고, 3D 동작 분석만 열린다. 구속 측정 · ABS · 오늘 투구 기록 · 최근 투구는 회색 + 자물쇠.
 * 투구 기록 · 팔 상태 조회(서버가 막는 것)는 부르지 않는다 — 그래서 PitchTab 과 따로 둔다(훅 차례가 다르다).
 */
export function BetaPitchTab({ today, bottom }: { today: string; bottom: number }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);
  useRetapTop(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={[{ paddingTop: inset.top + SPACE.section, paddingBottom: bottom + 24, paddingHorizontal: SPACE.side, gap: SPACE.gap }, READABLE_WIDE]}
    >
      <View style={styles.title}>
        <Text accessibilityRole="header" style={[TYPE.title, { flex: 1, color: c.ink, lineHeight: 40 }]}>투구</Text>
        <MenuButton />
      </View>
      <View style={styles.dateRow}>
        <View style={styles.date} accessible accessibilityLabel={`오늘 ${Number(today.slice(5, 7))}월 ${Number(today.slice(8, 10))}일 ${weekdayKo(today)}요일`}>
          <Text style={[TYPE.num, { color: c.ink, fontSize: 28, lineHeight: 32 }]}>{Number(today.slice(8, 10))}</Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>{`${Number(today.slice(5, 7))}월 · ${weekdayKo(today)}요일`}</Text>
        </View>
      </View>
      <ToolDock canAbs={false} beta />
      <View style={{ gap: 10 }}>
        <LockedRow icon="log" label="오늘 투구 기록" />
        <LockedRow icon="calendar-days" label="최근 투구 · 투구 기록" />
      </View>
    </ScrollView>
  );
}

/**
 * 도구 도크(2026-10-29 확정 디자인 '소프트 솔리드 툴 도크') — 왼쪽 세로 카드 3D 동작 분석(V6 관절 추적 투수), 오른쪽 위 구속 측정(계기판) · 아래 ABS(3×3 존).
 * 높이는 시안의 154 · 128 · 틈 12(≈294)를 바닥으로만 — 큰 글씨면 글이 늘어난 만큼 커진다. 그림과 이름을 카드 가운데에 맞춘다.
 * ABS 는 권한(사이트 메뉴 · 관리자)이 있을 때만 연다 — 없으면 같은 자리에 '준비 중'으로 흐리게(눌리지 않음).
 * beta(출시 전 베타): 구속 측정 · ABS 를 회색 판 · 회색 그림 + 자물쇠로, 누르면 안내만(들어가지 않음). 3D 동작 분석은 그대로 열린다.
 */
function ToolDock({ canAbs, beta = false }: { canAbs: boolean; beta?: boolean }) {
  const c = usePalette();
  const { width } = useWindowDimensions();
  /* 3D 카드 폭 ≈ (화면 − 옆 여백 − 틈) / 2 — 그림은 그 82%(시안 V6 · 여백 줄인 판), 넓은 화면에서는 168 에서 멈춘다 */
  const art = Math.min(168, Math.max(110, ((Math.min(width, 520) - SPACE.side * 2 - 12) / 2) * 0.82));
  if (beta) {
    const k = lockedColors(c);
    return (
      <View style={styles.dock}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="3D 동작 분석"
          onPress={() => router.push('/lab' as Href)}
          style={({ pressed }) => [styles.tool3d, { backgroundColor: c.skyTint, boxShadow: c.float }, pressed && PRESSED]}
        >
          <PitcherMark size={art} />
          <Text lineBreakStrategyIOS="hangul-word" style={[styles.toolBig, { color: c.ink }]}>
            3D 동작 분석
          </Text>
        </Pressable>
        <View style={styles.dockSide}>
          {(
            [
              { label: '구속 측정', icon: 'gauge', size: 54, minHeight: 154 },
              { label: 'ABS', icon: 'zone', size: 44, minHeight: 128 },
            ] as const
          ).map((t) => (
            <Pressable
              key={t.label}
              accessibilityRole="button"
              accessibilityLabel={`${t.label}, 준비 중`}
              accessibilityHint={LOCKED_HINT}
              accessibilityState={{ disabled: true }}
              onPress={noticeLocked}
              style={({ pressed }) => [styles.toolSmall, { minHeight: t.minHeight, backgroundColor: k.fill }, pressed && { opacity: 0.8 }]}
            >
              <LockedGlyph locked badge={22} ring={k.fill}>
                <Icon name={t.icon} size={t.size} color={k.glyph} />
              </LockedGlyph>
              <Text lineBreakStrategyIOS="hangul-word" style={[styles.toolLabel, { color: k.label }]}>
                {t.label}
              </Text>
              <Text style={{ color: k.label, fontSize: 11, marginTop: -8 }}>준비 중</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.dock}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="3D 동작 분석"
        onPress={() => router.push('/lab' as Href)}
        style={({ pressed }) => [styles.tool3d, { backgroundColor: c.skyTint, boxShadow: c.float }, pressed && PRESSED]}
      >
        <PitcherMark size={art} />
        <Text lineBreakStrategyIOS="hangul-word" style={[styles.toolBig, { color: c.ink }]}>
          3D 동작 분석
        </Text>
      </Pressable>
      <View style={styles.dockSide}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="구속 측정"
          onPress={() => router.push('/velocity?mode=speed' as Href)}
          style={({ pressed }) => [styles.toolSmall, { minHeight: 154, backgroundColor: c.card, boxShadow: c.float }, pressed && PRESSED]}
        >
          <GaugeMark size={66} c={c} />
          <Text lineBreakStrategyIOS="hangul-word" style={[styles.toolLabel, { color: c.ink }]}>
            구속 측정
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={canAbs ? 'ABS' : 'ABS, 준비 중'}
          accessibilityState={{ disabled: !canAbs }}
          disabled={!canAbs}
          onPress={() => router.push('/velocity?mode=abs' as Href)}
          style={({ pressed }) => [styles.toolSmall, { minHeight: 128, backgroundColor: c.card, boxShadow: c.float }, pressed && PRESSED]}
        >
          <View style={{ opacity: canAbs ? 1 : 0.45 }}>
            <ZoneMark size={46} c={c} />
          </View>
          <Text style={[styles.toolLabel, { color: canAbs ? c.ink : c.muted }]}>ABS</Text>
          {canAbs ? null : <Text style={{ color: c.muted, fontSize: 11, marginTop: -6 }}>준비 중</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pickHint: { borderRadius: 20, paddingHorizontal: 20, paddingVertical: 28 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 44, marginLeft: -6, marginBottom: -8 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: -4 },
  date: { flexDirection: 'row', alignItems: 'baseline', gap: 9, flexShrink: 1 },
  dock: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  dockSide: { flex: 1, gap: 12 },
  /* 3D — 위 · 아래 두 칸(154 + 12 + 128)을 합친 높이가 바닥 */
  tool3d: { flex: 1, minHeight: 294, borderRadius: 26, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 18 },
  toolSmall: { borderRadius: 24, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 16 },
  toolBig: { fontSize: 20, fontWeight: '700', letterSpacing: -0.6, textAlign: 'center' },
  toolLabel: { fontSize: 15, fontWeight: '600', letterSpacing: -0.3, textAlign: 'center' },
  /* 머리 오른쪽 '가져오기' 알약 — '분석' 알약(AnalysisPill)과 같은 44 */
  importBtn: { minHeight: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 },
});
