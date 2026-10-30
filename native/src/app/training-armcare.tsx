import { ARMCARE_PURPOSE_TEXT } from '@/lib/pitching-content';
import { SymbolView } from 'expo-symbols';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { toDateKey } from '@/lib/pitch-stats';
import type { ArmcareAreaKey } from '@/lib/armcare/anatomy';
import type { AppArmcareGuideTab, AppArmcareItem, AppArmcareTodayTab } from '@/lib/armcare/today-load';
import { drainChecks, onCheckResult } from '~/armcare/outbox';
import { PainGuideButton } from '~/armcare/pain-guide-sheet';
import { MyRoutinesProvider } from '~/armcare/add-to-routine';
import { sendCheck } from '~/armcare/send';
import { act, leave, offlineAs } from '~/mechanics/parts';
import { rpc } from '~/lib/rpc';
import { usePalette, type Palette } from '~/lib/ui';
import { leaveWhenShown, openCheckin } from '~/shell/web-nav';
import { AREAS_BY_JOINT, AreaCard, Checklist, ExerciseRow, PainNote, RehabCard, RoutineCard, WeekDots, doneWith, openPlay, useCheckIntents } from '~/training/armcare-parts';
import { isFav, useFavVersion } from '~/training/favorites';
import { FavButton } from '~/training/fav-button';
import { Fold, Screen, SectionHead, s, useJump, useScreenData } from '~/training/screen';
import { Sheet } from '~/workout/sheets';
import { useRememberPart } from '~/training/remember';
import { Press } from '~/shell/press';
import { Icon } from '~/shell/icon';

/**
 * 암케어(앱 화면) — 웹 /training?view=armcare(&tab=guide)(app/(app)/training/training-page.tsx 의 armcare 칸 · armcare-section.tsx)를 옮겼다.
 * 자료는 웹과 같은 함수로 모은다(app/actions/app-training-parts.ts → lib/armcare/today-load.ts). 트레이닝 탭의 암케어 카드에서 들어온다.
 *
 * [루틴] 맞춤 루틴(재활 중이면 오늘 재활) · 내 루틴 · 이번 주, [부위별 보강] 빈 곳 보강 · 부위 카드. 따라 하기는 앱 화면(/armcare/<id>?d=…),
 * 루틴 만들기 · 고치기도 앱 화면(/training/routine/<id>), 체크는 웹 목록과 같은 기록. 팔 통증 안내는 앱 시트(~/armcare/pain-guide-sheet — 웹 arm-pain-guide-body 와 같은 글), 루틴에 담기는 앱 창(~/armcare/add-to-routine), 3D 근육 지도는 웹으로 보낸다(leave).
 */
const TABS = [
  { value: 'today', label: '루틴' },
  { value: 'guide', label: '부위별 보강' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export default function TrainingArmcareScreen() {
  useRememberPart('armcare');
  const c = usePalette();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'guide' ? 'guide' : 'today');
  const state = useScreenData<AppArmcareTodayTab | AppArmcareGuideTab>('app-training-parts.loadAppArmcare', tab, `training-armcare:${tab}`);
  const scroll = useRef<ScrollViewInstance>(null);
  const { load } = state;

  /*
   * 따라 하기에서 신호가 없어 폰에 남은 체크를 이어 보낸다(웹 SendPendingChecks) — 하나라도 남겼으면 다시 받아 체크가 보이게.
   * 껍데기(앱을 켤 때 · 앞에 올 때)가 보낸 것도 듣는다.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onCheckResult((_p, r) => {
      if (r && typeof r === 'object' && 'error' in r) return;
      /* 여러 개를 이어 보내면 다 보낸 뒤 한 번만 */
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 400);
    });
    void drainChecks(sendCheck, () => undefined);
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [load]);

  const pick = (t: Tab) => {
    setTab(t);
    router.setParams({ tab: t });
  };

  const data = state.data && state.data.tab === tab ? state.data : null;
  const [favOpen, setFavOpen] = useState(false);
  return (
    <Screen
      title="암케어"
      tabs={TABS}
      tab={tab}
      onTab={pick}
      state={{ ...state, data }}
      scrollRef={scroll}
      right={<FavButton onPress={() => setFavOpen(true)} c={c} />}
    >
      {data?.tab === 'today' ? (
        <TodayTab data={data} fresh={state.fresh} failed={state.failed != null} reload={load} c={c} />
      ) : data?.tab === 'guide' ? (
        <GuideTab data={data} scroll={scroll} c={c} />
      ) : null}
      {favOpen ? <FavSheet guide={data?.tab === 'guide' ? data : null} onClose={() => setFavOpen(false)} c={c} /> : null}
    </Screen>
  );
}

/**
 * 즐겨찾기 모음 — 별을 단 암케어 운동만(2026-10-20 김민: "즐겨찾기한 운동을 빨리 찾는 입구"). 부위별 보강 칸의 자료(운동 · 별 · 내 루틴)를 쓰고,
 * 루틴 칸에서 열면 그 자료를 한 번 받는다. 별을 끄면 목록에서 빠진다.
 */
function FavSheet({ guide, onClose, c }: { guide: AppArmcareGuideTab | null; onClose: () => void; c: Palette }) {
  const [got, setGot] = useState<AppArmcareGuideTab | null>(null);
  const [failed, setFailed] = useState(false);
  const data = guide ?? got;
  useFavVersion();
  useEffect(() => {
    if (guide) return;
    let alive = true;
    rpc<({ ok: true } & AppArmcareGuideTab) | { ok: false; to: string }>('app-training-parts.loadAppArmcare', 'guide').then(
      (r) => {
        if (!alive) return;
        if (!r.ok) return leave(r.to);
        setGot(r);
      },
      () => alive && setFailed(true)
    );
    return () => {
      alive = false;
    };
  }, [guide]);
  const favIds = data?.favoriteIds ?? [];
  const list = data ? data.exercises.filter((ex) => isFav('exercise', ex.id, favIds.includes(ex.id))) : [];
  return (
    <Sheet fit open onClose={onClose} title="즐겨찾기" description="별을 단 암케어 운동" c={c}>
      {!data ? (
        failed ? (
          <Text style={[s.small, { color: c.muted }]}>신호가 약해 불러오지 못했어요.</Text>
        ) : (
          <ActivityIndicator style={{ paddingVertical: 24 }} />
        )
      ) : list.length === 0 ? (
        <Text style={[s.body, s.box, { color: c.muted, backgroundColor: c.card }]}>
          아직 즐겨찾기한 운동이 없어요. 부위별 보강에서 운동 옆 별을 눌러 담아요.
        </Text>
      ) : (
        <MyRoutinesProvider routines={data.routines ?? null}>
          <View style={{ gap: 10 }}>
            {list.map((ex) => (
              <ExerciseRow key={ex.id} ex={ex} fav={favIds.includes(ex.id)} c={c} />
            ))}
          </View>
        </MyRoutinesProvider>
      )}
    </Sheet>
  );
}

/* ----------------------------- 루틴 칸 ----------------------------- */

/*
 * 2026-10-30 시안 01 — 오늘 할 행동이 먼저: 오늘 루틴 카드 하나(상태마다 주 단추 하나) → 접힌 구성 → 내 루틴 → 최근 7일 → 암케어 안내.
 * 열기만으로는 읽기다 — 루틴 만들기 · 다시 만들기 · 체크는 누를 때만. 받아 둔 값(fresh 아님)이거나 다른 날 것이면 시작 · 만들기 · 체크를 막는다.
 */
function TodayTab({ data, fresh, failed, reload, c }: { data: AppArmcareTodayTab; fresh: boolean; failed: boolean; reload: () => Promise<void>; c: Palette }) {
  const [open, setOpen] = useState<string | null>(null);
  const { custom } = data;
  /* 이 폰의 오늘과 다른 날의 값(밤새 열어 둔 화면 · 어제 받아 둔 값) — 새로 받기 전에는 오늘 것으로 확정하지 않는다 */
  const oldDay = data.dateKey !== toDateKey(new Date());
  const ready = fresh && !oldDay;
  return (
    <View style={{ gap: 16 }}>
      {custom.kind === 'rehab' ? (
        <RehabCard rehab={custom.rehab} dateKey={data.dateKey} c={c} />
      ) : (
        <TodayCard data={data} ready={ready} oldDay={oldDay} failed={failed} reload={reload} c={c} />
      )}
      {data.rehabStart ? <RehabStartRow start={data.rehabStart} c={c} /> : null}

      <View style={{ gap: 10 }}>
        <SectionHead title="내 루틴" c={c} />
        {data.painToday && data.routines.length > 0 ? (
          <Text style={[s.small, s.box, { color: c.warn, backgroundColor: c.warnBg }]}>오늘 통증을 남기셨어요. 쉬는 걸 권해요.</Text>
        ) : null}
        {data.routines.map((r) => (
          <RoutineCard
            key={r.id}
            routine={r}
            dateKey={data.dateKey}
            fresh={ready}
            open={open === r.id}
            onToggle={() => setOpen(open === r.id ? null : r.id)}
            onChanged={() => void reload()}
            c={c}
          />
        ))}
        {data.routines.length < data.routineMax ? (
          <Press onPress={() => router.push('/training/routine/new' as Href)} accessibilityRole="button" style={[s.webRow, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Text style={[s.body, { color: c.link, flex: 1 }]}>{data.routines.length === 0 ? '내 루틴 만들기' : '새 루틴 만들기'}</Text>
            <SymbolView name="plus" size={14} weight="semibold" tintColor={c.link} />
          </Press>
        ) : (
          <Text style={[s.tiny, { color: c.muted, paddingHorizontal: 4 }]}>루틴은 {data.routineMax}개까지 둘 수 있어요.</Text>
        )}
      </View>

      <WeekDots week={data.week} c={c} />
      <ArmcareGuideNote c={c} />
    </View>
  );
}

/** 암케어 안내 — 목적과 던지기 전 워밍업 길(작은 진입, 펴서 본다) */
function ArmcareGuideNote({ c }: { c: Palette }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Press onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={[s.textBtn, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
        <Text style={[s.smallBold, { color: c.link }]}>암케어 안내</Text>
        <Icon name="info" size={14} color={c.link} />
      </Press>
      {open ? (
        <View style={[s.card, { backgroundColor: c.card, alignSelf: 'stretch', gap: 8 }]}>
          <Text style={[s.bodyBold, { color: c.ink }]}>준비 · 정리 · 강화</Text>
          <Text style={[s.small, { color: c.muted }]}>{ARMCARE_PURPOSE_TEXT.cooldown}</Text>
          <Text style={[s.small, { color: c.muted }]}>{ARMCARE_PURPOSE_TEXT.strength}</Text>
          <Press onPress={() => router.push('/library/warmup' as Href)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={[s.bodyBold, { color: c.link }]}>던지기 전 워밍업 보기 ›</Text>
          </Press>
        </View>
      ) : null}
    </View>
  );
}

/* 오늘 루틴 카드 — 남색 판(라이트 · 다크 · 네이비 같게, 흰 글자 대비 12:1 넘음) */
const HERO_BG = '#16314f';
const HERO_SUB = '#c9d7e8';
const HERO_BTN = '#3d8fe0';

/**
 * 오늘 루틴 카드 — 상태마다 주 단추 하나:
 *   체크인 전 → 체크인하기 · 만들기 전 → 오늘 루틴 만들기(운동 수 · 시간 없음) · 준비 → 시작하기 · 일부 → 이어하기 · 모두 → 기록 확인 ·
 *   쉬는 날 → 시작 단추 없음 · 구성 바뀜 → 바뀐 구성 확인(구성을 펴서 다시 만들기 · 이대로 시작) · 다른 날 값 → 다시 불러오기.
 * 수행 수는 서버 값 + 폰 대기열의 의도(대기는 '전송 대기'로 가른다). 시작은 루틴 만들기 · 일반 운동 시작이 아니다(따라 하기 화면이 서버 조건을 다시 본다).
 */
function TodayCard({
  data,
  ready,
  oldDay,
  failed,
  reload,
  c,
}: {
  data: AppArmcareTodayTab;
  ready: boolean;
  oldDay: boolean;
  failed: boolean;
  reload: () => Promise<void>;
  c: Palette;
}) {
  const custom = data.custom;
  const dateKey = data.dateKey;
  const [making, setMaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const intents = useCheckIntents(dateKey);
  const make = async () => {
    if (making || !ready) return;
    setMaking(true);
    setError(null);
    const res = await act<{ ok: true }>('armcare.makeArmcareRoutine');
    /* 실패하면 지금 루틴 · 체크는 그대로(서버가 아무것도 안 바꿨다) */
    if ('error' in res) setError(offlineAs(res.error, '루틴을 만들지 못했어요.'));
    else await reload();
    setMaking(false);
  };

  const shell = (body: ReactNode, tone: 'hero' | 'warn' = 'hero') => (
    <View style={[st.today, tone === 'hero' ? { backgroundColor: HERO_BG } : { backgroundColor: c.warnBg }]}>
      <Text style={[s.smallBold, { color: tone === 'hero' ? HERO_SUB : c.warn }]}>오늘 루틴</Text>
      {body}
    </View>
  );
  const main = (label: string, onPress: () => void, disabled = false, symbol: 'play.fill' | 'chevron.right' = 'chevron.right') => (
    <Press onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} style={[st.mainBtn, { backgroundColor: HERO_BTN, opacity: disabled ? 0.55 : 1 }]}>
      <Text style={[s.bodyBold, { color: '#fff', flex: 1 }]}>{label}</Text>
      <SymbolView name={symbol} size={15} weight="bold" tintColor="#fff" />
    </Press>
  );
  const title = (t: string) => (
    <Text style={[st.todayTitle, { color: '#fff' }]} accessibilityRole="header">
      {t}
    </Text>
  );
  const sub = (t: string) => <Text style={[s.body, { color: HERO_SUB }]}>{t}</Text>;
  /* 받아 둔 값 — 새로 받기 전에는 시작 · 만들기를 막고 까닭을 한 줄 */
  const staleLine = !ready ? (
    <Text style={[s.small, { color: HERO_SUB }]}>
      {oldDay ? '이전 날짜의 루틴이에요. 새로 불러온 뒤 시작해요.' : failed ? '최신 상태를 확인하지 못했어요. 다시 불러온 뒤 시작해요.' : '최신 상태를 확인하는 중이에요.'}
    </Text>
  ) : null;

  if (oldDay)
    return shell(
      <>
        {title('새로 불러와 주세요')}
        {staleLine}
        {main('다시 불러오기', () => void reload())}
      </>
    );

  if (custom.kind === 'checkin')
    return shell(
      <>
        {title('오늘 상태부터')}
        {sub('체크인을 남기면 오늘 루틴을 정해요.')}
        {main('체크인하기', () => openCheckin('/training?view=home'))}
      </>
    );

  if (custom.kind === 'rest')
    return shell(
      <>
        <Text style={[st.todayTitle, { color: c.warn }]} accessibilityRole="header">
          오늘은 팔 쉬기
        </Text>
        <Text style={[s.body, { color: c.ink }]}>{custom.reason}</Text>
        {custom.pain ? (
          data.painView ? (
            <PainGuideButton pain={data.painView} tone="warn" c={c} />
          ) : (
            <Press onPress={() => leave('/training?view=armcare')} accessibilityRole="link" style={[s.chip, { backgroundColor: c.card, alignSelf: 'flex-start' }]}>
              <Text style={[s.smallBold, { color: c.warn }]}>통증 안내 보기 ›</Text>
            </Press>
          )
        ) : null}
        <Text style={[s.small, { color: c.muted }]}>오늘 시작할 수 있는 루틴은 없어요.</Text>
        <Press onPress={() => openCheckin('/training?view=home')} accessibilityRole="button" style={[s.textBtn, { paddingHorizontal: 0, alignSelf: 'flex-start' }]}>
          <Text style={[s.smallBold, { color: c.link }]}>체크인 확인하기</Text>
        </Press>
      </>,
      'warn'
    );

  if (custom.kind !== 'routine') return null;
  const { decision, routine } = custom;
  const extras = (
    <>
      {custom.afterThrowing ? <Text style={[s.small, { color: '#fff' }]}>{custom.afterThrowing}</Text> : null}
      {custom.pain && data.painView ? <PainGuideButton pain={data.painView} tone="sky" c={c} /> : null}
    </>
  );
  const errorLine = error ? <Text style={[s.small, st.errorBox, { color: c.danger, backgroundColor: c.dangerBg }]}>{error}</Text> : null;

  if (!routine)
    return shell(
      <>
        {title(decision.label)}
        {sub(decision.reason)}
        {extras}
        {staleLine}
        {main(making ? '만드는 중…' : '오늘 루틴 만들기', () => void make(), making || !ready)}
        {errorLine}
      </>
    );

  const n = routine.items.length;
  const done = routine.items.filter((it) => doneWith(it, intents)).length;
  const waiting = routine.items.filter((it) => intents.get(it.exercise.id) === 'done').length;
  const allDone = n > 0 && done === n;
  const unsafeCount = routine.items.filter((it) => it.unsafe && !doneWith(it, intents)).length;
  const changed = !allDone && (routine.kind !== decision.kind || unsafeCount > 0);
  const startQuery = `d=${dateKey}`;
  const start = () => openPlay('today', startQuery);

  return (
    <View style={{ gap: 10 }}>
      {shell(
        <>
          {title(allDone ? '오늘 루틴 끝' : routine.label)}
          {allDone ? sub(routine.label) : changed ? sub(routine.kind !== decision.kind ? `체크인이 바뀌어 구성을 다시 확인해요. ${decision.reason}` : `몸 상태가 바뀌어 지금은 권하지 않는 운동이 ${unsafeCount}개 있어요.`) : sub(routine.reason)}
          {extras}
          <View style={st.stats}>
            <Text style={[s.small, { color: HERO_SUB }]}>
              <Text style={st.statNum}>{n}</Text>개 운동
            </Text>
            {!allDone ? (
              <Text style={[s.small, { color: HERO_SUB }]}>
                약 <Text style={st.statNum}>{routine.estimatedMinutes}</Text>분
              </Text>
            ) : null}
          </View>
          <View style={{ gap: 6 }} accessible accessibilityLabel={`${n}개 중 ${done}개 수행${waiting ? `, ${waiting}개 전송 대기` : ''}`}>
            <View style={s.between}>
              <Text style={[s.smallBold, { color: '#fff' }]}>
                {allDone ? '모두 수행' : `${done}개 수행`}
                {waiting ? <Text style={{ color: HERO_SUB, fontWeight: '400' }}>{` · ${waiting}개 전송 대기`}</Text> : null}
              </Text>
              <Text style={[s.small, { color: HERO_SUB, fontVariant: ['tabular-nums'] }]}>
                {done} / {n}
              </Text>
            </View>
            <View style={st.bars}>
              {routine.items.map((it) => (
                <View key={it.exercise.id} style={[st.barSeg, { backgroundColor: doneWith(it, intents) ? '#ffffff' : 'rgba(255,255,255,0.22)' }]} />
              ))}
            </View>
          </View>
          {staleLine}
          {allDone
            ? main('기록 확인', start, !ready)
            : changed
              ? main(showList ? '구성을 확인하고 있어요' : '바뀐 구성 확인', () => setShowList(true), showList)
              : main(done > 0 ? '이어하기' : '시작하기', start, !ready, 'play.fill')}
          {changed ? <Text style={[s.small, { color: HERO_SUB }]}>이미 수행한 {done}개 운동은 그대로 남아요. 바뀐 구성은 다시 만든 뒤 적용돼요.</Text> : null}
          {errorLine}
        </>
      )}
      <Composition
        items={routine.items}
        notes={routine.notes}
        dateKey={dateKey}
        ready={ready}
        open={showList}
        onOpen={setShowList}
        allDone={allDone}
        changed={changed}
        making={making}
        onMake={() => void make()}
        onStart={start}
        reload={reload}
        c={c}
      />
    </View>
  );
}

/**
 * 운동 구성 — 접혀서 시작, 펴면 운동 이름 · 처방 · 수동 체크 · 자세 · 영상. 다시 만들기는 여기 보조 행동이다(모두 수행한 날은 막는다 — 완료가 먼저).
 * 구성이 바뀐 날은 여기서 다시 만들거나 이대로 시작한다(따라 하기는 지금 권하지 않는 운동을 빼고 연다).
 */
function Composition({
  items,
  notes,
  dateKey,
  ready,
  open,
  onOpen,
  allDone,
  changed,
  making,
  onMake,
  onStart,
  reload,
  c,
}: {
  items: AppArmcareItem[];
  notes: string[];
  dateKey: string;
  ready: boolean;
  open: boolean;
  onOpen: (v: boolean) => void;
  allDone: boolean;
  changed: boolean;
  making: boolean;
  onMake: () => void;
  onStart: () => void;
  reload: () => Promise<void>;
  c: Palette;
}) {
  return (
    <View style={[st.compo, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Press onPress={() => onOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={st.compoHead}>
        <Text style={[s.bodyBold, { color: c.ink, flex: 1 }]}>운동 구성</Text>
        <Text style={[s.small, { color: c.muted }]}>{items.length}개</Text>
        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={12} tintColor={c.muted} />
      </Press>
      {open ? (
        <View style={{ gap: 12, paddingBottom: 14 }}>
          {notes.length > 0 ? (
            <Fold label={`안내 ${notes.length}개`} c={c}>
              {notes.map((t) => (
                <Text key={t} style={[s.small, { color: c.muted }]}>
                  {t}
                </Text>
              ))}
            </Fold>
          ) : null}
          <Checklist items={items} dateKey={dateKey} fresh={ready} compact onChanged={() => void reload()} c={c} />
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            {changed ? (
              <Press onPress={onMake} disabled={making || !ready} accessibilityRole="button" style={[s.smallPill, { backgroundColor: c.action, opacity: making || !ready ? 0.6 : 1 }]}>
                <SymbolView name="arrow.clockwise" size={12} tintColor={c.onAction} />
                <Text style={[s.smallBold, { color: c.onAction }]}>{making ? '만드는 중…' : '구성 다시 만들기'}</Text>
              </Press>
            ) : null}
            {changed ? (
              <Press onPress={onStart} disabled={!ready} accessibilityRole="button" style={[s.smallPill, { backgroundColor: c.chip, opacity: ready ? 1 : 0.6 }]}>
                <Text style={[s.smallBold, { color: c.ink }]}>이대로 시작하기</Text>
              </Press>
            ) : (
              <Press
                onPress={onMake}
                disabled={making || !ready || allDone}
                accessibilityRole="button"
                accessibilityHint={allDone ? '오늘 루틴을 모두 수행해 다시 만들지 않아요' : undefined}
                style={[s.smallPill, { backgroundColor: c.chip, opacity: making || !ready || allDone ? 0.5 : 1 }]}
              >
                <SymbolView name="arrow.clockwise" size={12} tintColor={c.ink} />
                <Text style={[s.smallBold, { color: c.ink }]}>{making ? '만드는 중…' : '다시 만들기'}</Text>
              </Press>
            )}
          </View>
          {changed ? <Text style={[s.small, { color: c.muted }]}>이대로 시작하면 지금 권하지 않는 운동은 빼고 열어요. 다시 만들어도 체크한 운동은 남아요.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/* ----------------------------- 부위별 보강 칸 ----------------------------- */

function GuideTab({ data, scroll, c }: { data: AppArmcareGuideTab; scroll: RefObject<ScrollViewInstance | null>; c: Palette }) {
  const [open, setOpen] = useState<ArmcareAreaKey | null>(null);
  /* 통증 칩을 누르면 그 부위 카드를 펴고 그리로 내려간다 — 카드는 이 칸 바로 밑에 둔다(useJump) */
  const jump = useJump(scroll);
  const showArea = (key: ArmcareAreaKey) => {
    setOpen(key);
    jump.jump(key);
  };
  return (
    <MyRoutinesProvider routines={data.routines ?? null}>
      <View onLayout={jump.onRoot} style={{ gap: 12 }}>
        <Text style={[s.small, { color: c.muted }]}>근육을 누르거나 부위를 펼쳐 보세요.</Text>
        {data.coverage.pain ? <PainNote pain={data.coverage.pain} onArea={showArea} c={c} /> : null}
        {/* 3D 근육 지도(웹) — 큰 단추로(2026-10-20 김민). 웹이 지도를 그린 뒤에 이 화면을 걷는다(leaveWhenShown — 트레이닝 첫 화면이 비치지 않게) */}
        <Pressable
          onPress={() => leaveWhenShown('/training?view=armcare&tab=guide')}
          accessibilityRole="link"
          style={({ pressed }) => [s.card, { backgroundColor: c.card, boxShadow: c.float, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 84 }, pressed && { opacity: 0.7 }]}
        >
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.sky + '1a', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="armcare" size={28} color={c.sky} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.bodyBold, { color: c.ink, fontSize: 17 }]}>3D 근육 지도 보기</Text>
            <Text style={[s.small, { color: c.muted }]}>근육을 눌러 운동을 찾아요. 근력·회복 상태를 측정한 지도는 아니에요</Text>
          </View>
          <SymbolView name="chevron.right" size={14} weight="semibold" tintColor={c.muted} />
        </Pressable>
        <View style={[s.card, { backgroundColor: c.card }]}>
          <Fold label="최근 2주 수행 기록 · 최근 20개" c={c}>
            <Text style={[s.small, { color: c.muted }]}>{ARMCARE_PURPOSE_TEXT.record}</Text>
            {(data.history ?? []).length === 0 ? <Text style={[s.small, { color: c.muted }]}>남긴 수행 기록이 없어요.</Text> : (data.history ?? []).map((r, i) => <View key={`${r.on}:${i}`} style={{ paddingVertical: 6 }}><Text style={[s.bodyBold, { color: c.ink }]}>{r.title}</Text><Text style={[s.small, { color: c.muted }]}>{r.on} · {r.amount}</Text></View>)}
          </Fold>
        </View>
        {AREAS_BY_JOINT.flatMap(({ joint, areas }) => [
          <Text key={joint} accessibilityRole="header" style={[s.section, { color: c.ink, paddingHorizontal: 4, paddingTop: 8 }]}>
            {joint}
          </Text>,
          ...areas.map((area) => (
            <AreaCard
              key={area.key}
              area={area}
              exercises={data.exercises}
              open={open === area.key}
              onToggle={() => setOpen(open === area.key ? null : area.key)}
              onLayout={jump.onItem(area.key)}
              favIds={data.favoriteIds}
              c={c}
            />
          )),
        ])}
        <Text style={[s.tiny, { color: c.muted }]}>운동이 부상을 막아 준다는 보장은 없어요. 아프면 쉬고 진료를 받으세요.</Text>
        {data.untagged > 0 ? (
          <Text style={[s.tiny, { color: c.muted }]}>근육을 아직 적지 않은 암케어 운동 {data.untagged}개는 여기 나오지 않아요.</Text>
        ) : null}
      </View>
    </MyRoutinesProvider>
  );
}

/** '팔이 아프면 · 재활 프로그램' 줄 — 앱 시작 화면(rehab-start.tsx)으로. 오늘 체크인의 아픈 자리 · 정도 · 나이를 미리 넘긴다 */
function RehabStartRow({ start, c }: { start: NonNullable<AppArmcareTodayTab['rehabStart']>; c: Palette }) {
  const q = new URLSearchParams();
  if (start.age != null) q.set('age', String(start.age));
  if (start.area) q.set('area', start.area);
  if (start.level) q.set('level', String(start.level));
  return (
    <Press onPress={() => router.push(`/rehab-start?${q}` as Href)} accessibilityRole="button" style={[s.webRow, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[s.body, { color: c.ink, flex: 1 }]}>
        팔이 아프면 · <Text style={{ color: c.link, fontWeight: '600' }}>재활 프로그램</Text>
      </Text>
      <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={c.muted} />
    </Press>
  );
}

const st = StyleSheet.create({
  today: { borderRadius: 24, padding: 20, gap: 10 },
  todayTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, lineHeight: 32 },
  mainBtn: { minHeight: 52, borderRadius: 18, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  stats: { flexDirection: 'row', alignItems: 'baseline', gap: 14, paddingTop: 4 },
  statNum: { color: '#fff', fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  bars: { flexDirection: 'row', gap: 4 },
  barSeg: { flex: 1, height: 5, borderRadius: 3 },
  errorBox: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden' },
  compo: { borderRadius: 20, paddingHorizontal: 16 },
  compoHead: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
