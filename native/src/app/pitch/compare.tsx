import { useEventListener } from 'expo';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, Stack, useIsFocused, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useVideoPlayer, VideoView, type VideoPlayer, type VideoPlayerStatus } from 'expo-video';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActionSheetIOS,
  ActivityIndicator,
  AppState,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { dateKeyOf } from '~/pitch/api';
import { thumbSource, useAllLogs, usePathThumbs } from '~/pitch/store';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';
import { useScreenSettled } from '~/shell/transition';
import {
  bothMarked,
  clampTo,
  clockText,
  commonRange,
  DRIFT_FIX_SEC,
  driftOf,
  navBack,
  navCompare,
  navOpenPick,
  navPickNext,
  navRealign,
  navRestore,
  navStart,
  navSwipeOk,
  relText,
  sceneStep,
  type CompareNav,
  type Marks,
} from '~/videos/compare-math';
import { startPickUi } from '~/videos/filters';
import { VideoGallery } from '~/videos/gallery';
import { RATES, Scrubber, ScrubLabels, playerCall, rateText, useDisplayAspect, useVideoSource } from '~/videos/player-parts';
import { useMyVideos } from '~/videos/store';
import { videoCaption, videoDateText } from '~/videos/text';

/**
 * 두 영상 비교(2026-10-29 시안) — 영상 A 를 두고 B 하나를 골라(pick) → 두 영상에서 같은 동작을 기준 장면으로 짚고(align) → 그 자리를 0 으로 함께 본다(compare).
 *
 * 들어오는 길 셋:
 * - 내 영상 상세(?a=&src=my-videos) — B 고르기부터. 뒤로는 상세로.
 * - 투구 기록의 2분할 비교(?a=&b=) — 둘이 정해져 있어 장면 맞추기부터. 뒤로는 그 목록으로.
 * - 인자 없음(메카닉 화면) — 예전처럼 기록 영상 둘을 고르는 목록 → 장면 맞추기. 맞추기 · 비교의 뒤로는 그 목록.
 *
 * 단계는 한 주소 안에서 바꾼다 — B 를 다시 고를 때마다 고르기 화면을 쌓지 않게(비교 → 고르기 → 비교로 상세에 못 돌아가는 고리가 생기지 않게).
 * 뒤로: 처음 고르기 → 들어온 곳, 처음 맞추기 → 고르기, 비교 → 들어온 곳, 비교에서 연 다시 맞추기 · B 바꾸기 → 직전 비교(두 기준 그대로).
 * 기준 장면은 이 화면에서만 산다(저장 · 비교 이력 없음). 자동 동작 분석 없음 — 장면은 사람이 짚는다.
 */
export default function PitchCompareScreen() {
  const params = useLocalSearchParams<{ a?: string; al?: string; b?: string; bl?: string; src?: string }>();
  const [listPick, setListPick] = useState<{ a: string; al: string; b: string; bl: string } | null>(null);
  if (params.a) {
    return (
      <CompareFlow
        aPath={params.a}
        initialB={params.b ?? null}
        labels={{ a: params.al, b: params.bl }}
        pickStarted={!params.b}
        onExit={() => router.back()}
        exitIsBack
      />
    );
  }
  if (listPick)
    return (
      <CompareFlow
        key={`${listPick.a}|${listPick.b}`}
        aPath={listPick.a}
        initialB={listPick.b}
        labels={{ a: listPick.al, b: listPick.bl }}
        pickStarted={false}
        onExit={() => setListPick(null)}
        exitIsBack={false}
      />
    );
  return <LogPicker onPick={(a, b) => setListPick({ a: a.path, al: a.label, b: b.path, bl: b.label })} />;
}

type SideKey = 'a' | 'b';
/** 직전 비교 — 다시 맞추기 · B 바꾸기를 취소하면 이대로 돌아온다 */
type Snap = { b: string; marks: { a: number; b: number }; rel: number };
type SideErr = { kind: 'missing' | 'server' | 'gone' | 'player'; message: string };
type SideInfo = { player: VideoPlayer; ready: boolean; duration: number | null; fps: number | null; aspect: number | null; error: SideErr | null };
/** idle 멈춤 · seeking 두 영상을 같은 자리로 옮기는 중 · playing 함께 재생 · buffering 한쪽이 받는 중이라 둘 다 기다림 */
type Phase = 'idle' | 'seeking' | 'playing' | 'buffering';

/** 공통 구간 끝으로 보는 여유(초) — 시간 알림이 0.1초마다라 끝 장면 바로 앞에서 멈춘다 */
const END_EPS = 0.03;
/* 화면 그리기 밖(재생기 알림)에서만 부른다 */
const nowMs = () => Date.now();

/**
 * 두 재생기가 요청한 자리에 닿고 둘 다 재생 준비가 됐는지 확인한다(최대 1.5초). expo-video 에는 '옮기기 끝' 알림이 없어
 * 위치 · 상태를 장면마다 읽어 본다 — 시간이 지났다고 성공으로 치지 않는다.
 */
async function waitSeek(pa: VideoPlayer, pb: VideoPlayer, ta: number, tb: number, alive: () => boolean): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < 1500) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    if (!alive()) return false;
    try {
      if (pa.status === 'readyToPlay' && pb.status === 'readyToPlay' && Math.abs(pa.currentTime - ta) < 0.08 && Math.abs(pb.currentTime - tb) < 0.08) return true;
    } catch {
      return false;
    }
  }
  return false;
}

function CompareFlow({
  aPath,
  initialB,
  labels,
  pickStarted,
  onExit,
  exitIsBack,
}: {
  aPath: string;
  initialB: string | null;
  labels: { a?: string; b?: string };
  /** B 고르기의 조건을 들어온 화면이 이미 열었나(내 영상) — 아니면 처음 고를 때 내 영상 목록의 조건으로 연다 */
  pickStarted: boolean;
  onExit: () => void;
  /** 들어온 곳으로 가는 길이 화면 뒤로(밀어 뒤로)와 같나 */
  exitIsBack: boolean;
}) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { width: winW, height: winH, fontScale } = useWindowDimensions();
  const { items } = useMyVideos();
  const itemOf = (p: string | null) => (p ? (items?.find((v) => v.path === p) ?? null) : null);
  const aItem = itemOf(aPath);

  const [nav, setNav] = useState<CompareNav>(() => navStart(!!initialB));
  const stage = nav.stage;
  const [b, setB] = useState<string | null>(initialB);
  const bItem = itemOf(b);
  const [selected, setSelected] = useState<string | null>(initialB);
  const [marks, setMarks] = useState<Marks>({ a: null, b: null });
  const [times, setTimes] = useState({ a: 0, b: 0 });
  const [focus, setFocus] = useState<SideKey>('a');
  const [snap, setSnap] = useState<Snap | null>(null);
  const [layout, setLayout] = useState<'side' | 'stack'>('side');
  const [rate, setRate] = useState(0.5);
  const [expand, setExpand] = useState<SideKey | null>(null);
  const [ended, setEnded] = useState(false);
  /* 이 기기에 없다고 확인된 영상 — B 고르기에서 고를 수 없게 */
  const [missing, setMissing] = useState<ReadonlySet<string>>(() => new Set());
  const [pickOpened, setPickOpened] = useState(pickStarted);

  const [sides, setSides] = useState<{ a: SideInfo | null; b: SideInfo | null }>({ a: null, b: null });
  const infoA = useCallback((s: SideInfo | null) => setSides((x) => ({ ...x, a: s })), []);
  const infoB = useCallback((s: SideInfo | null) => setSides((x) => ({ ...x, b: s })), []);
  const pa = sides.a?.player ?? null;
  const pb = sides.b?.player ?? null;
  const readyA = !!sides.a?.ready;
  const readyB = !!sides.b?.ready;
  const errA = sides.a?.error ?? null;
  const errB = sides.b?.error ?? null;
  const goneA = errA?.kind === 'missing' || errA?.kind === 'gone';
  const goneB = errB?.kind === 'missing' || errB?.kind === 'gone';
  /* 다시 받아도 안 생기는 영상은 고르기에서 막는다 — 서버 확인 뒤에 달라졌을 수 있어 재생 준비에서 알아낸 것까지 */
  const goneKey = `${goneA ? aPath : ''}|${goneB ? b : ''}`;
  const [seenGone, setSeenGone] = useState('');
  if (goneKey !== seenGone) {
    setSeenGone(goneKey);
    const add = [goneA ? aPath : null, goneB ? b : null].filter((x): x is string => !!x && !missing.has(x));
    if (add.length) setMissing(new Set([...missing, ...add]));
  }

  const ma = marks.a;
  const mb = marks.b;
  const range = ma != null && mb != null ? commonRange(ma, mb, sides.a?.duration ?? null, sides.b?.duration ?? null) : null;
  const rel = ma != null && range ? clampTo(times.a - ma, range) : 0;
  const canSync = stage === 'compare' && readyA && readyB && !!range;

  /* ---- 함께 재생 ---- */
  const intent = useRef(false);
  const phaseRef = useRef<Phase>('idle');
  const [phase, setPhaseState] = useState<Phase>('idle');
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const token = useRef(0);
  const lastFix = useRef(0);

  const stopBoth = () => {
    token.current++;
    intent.current = false;
    playerCall.pause(pa);
    playerCall.pause(pb);
    if (phaseRef.current !== 'idle') setPhase('idle');
    if (pa && pb) setTimes({ a: playerCall.time(pa), b: playerCall.time(pb) });
  };
  const seekBoth = (r: number) => {
    if (ma == null || mb == null || !range) return;
    const t = clampTo(r, range);
    playerCall.seek(pa, ma + t);
    playerCall.seek(pb, mb + t);
    setTimes({ a: ma + t, b: mb + t });
    setEnded(false);
  };
  const endBoth = () => {
    stopBoth();
    if (range) seekBoth(range.max);
    setEnded(true);
    AccessibilityInfo.announceForAccessibility('함께 볼 수 있는 구간이 끝났어요.');
  };
  const playBoth = async () => {
    if (!pa || !pb || ma == null || mb == null || !range || !readyA || !readyB) return;
    let r = clampTo(playerCall.time(pa) - ma, range);
    /* 끝에서 다시 재생하면 구간 처음부터 */
    if (r >= range.max - END_EPS) r = range.min;
    const tok = ++token.current;
    intent.current = true;
    setEnded(false);
    setPhase('seeking');
    playerCall.pause(pa);
    playerCall.pause(pb);
    playerCall.seek(pa, ma + r);
    playerCall.seek(pb, mb + r);
    setTimes({ a: ma + r, b: mb + r });
    const ok = await waitSeek(pa, pb, ma + r, mb + r, () => tok === token.current);
    if (tok !== token.current) return;
    if (!ok) {
      stopBoth();
      toast('두 영상을 같은 자리로 맞추지 못했어요. 다시 눌러 주세요.', 'error');
      return;
    }
    playerCall.rate(pa, rate);
    playerCall.rate(pb, rate);
    setPhase('playing');
    playerCall.play(pa);
    playerCall.play(pb);
  };

  const onTimeA = useEffectEvent((ta: number) => {
    if (stage !== 'compare' || phaseRef.current !== 'playing' || !pb || ma == null || mb == null || !range) return;
    const tb = playerCall.time(pb);
    if (ta - ma >= range.max - END_EPS || tb - mb >= range.max - END_EPS) return endBoth();
    /* 두 재생기는 따로 돈다 — 어긋남이 쌓이면 B 를 A 에 다시 붙인다(시간 알림마다, 장면마다 다시 그리지 않음) */
    if (Math.abs(driftOf(ta, tb, ma, mb)) > DRIFT_FIX_SEC) {
      lastFix.current = nowMs();
      playerCall.seek(pb, mb + (ta - ma));
    }
    setTimes({ a: ta, b: tb });
  });
  const onPlaying = useEffectEvent((p: VideoPlayer, isPlaying: boolean) => {
    if (isPlaying || phaseRef.current !== 'playing') return;
    /* 우리가 멈추지 않았는데 한쪽이 섰다 — 받는 중이면 다른 쪽도 기다리고, 아니면(끝 · 시스템이 멈춤) 둘 다 멈춘다 */
    if (p.status === 'loading') {
      setPhase('buffering');
      playerCall.pause(pa);
      playerCall.pause(pb);
      return;
    }
    if (range && ma != null && pa && playerCall.time(pa) - ma >= range.max - 0.2) endBoth();
    else stopBoth();
  });
  const onStatus = useEffectEvent((s: VideoPlayerStatus) => {
    if (s === 'error' && phaseRef.current !== 'idle') return stopBoth();
    if (s === 'loading' && phaseRef.current === 'playing' && nowMs() - lastFix.current > 500) {
      setPhase('buffering');
      playerCall.pause(pa);
      playerCall.pause(pb);
      return;
    }
    if (phaseRef.current === 'buffering' && intent.current && pa?.status === 'readyToPlay' && pb?.status === 'readyToPlay') void playBoth();
  });
  const onEnd = useEffectEvent(() => {
    if (phaseRef.current === 'playing') endBoth();
  });
  useEffect(() => {
    if (!pa || !pb) return;
    const subs = [
      pa.addListener('timeUpdate', ({ currentTime }) => onTimeA(currentTime)),
      pa.addListener('playingChange', ({ isPlaying }) => onPlaying(pa, isPlaying)),
      pb.addListener('playingChange', ({ isPlaying }) => onPlaying(pb, isPlaying)),
      pa.addListener('statusChange', ({ status }) => onStatus(status)),
      pb.addListener('statusChange', ({ status }) => onStatus(status)),
      pa.addListener('playToEnd', () => onEnd()),
      pb.addListener('playToEnd', () => onEnd()),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [pa, pb]);

  /* 화면을 떠나거나 앱이 뒤로 가면 둘 다 멈춘다 — 돌아와도 저절로 다시 틀지 않는다 */
  const focused = useIsFocused();
  const onHide = useEffectEvent(() => {
    if (phaseRef.current !== 'idle') stopBoth();
  });
  useEffect(() => {
    if (!focused) onHide();
  }, [focused]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s !== 'active' && onHide());
    return () => sub.remove();
  }, []);

  /* ---- 단계 오가기(갈 곳은 compare-math 의 nav* — 셀프테스트가 고리 없음을 본다) ---- */
  const leaveCompare = () => {
    stopBoth();
    setExpand(null);
  };
  const restoreSnap = (s: Snap) => {
    setB(s.b);
    setSelected(s.b);
    setMarks(s.marks);
    setTimes({ a: s.marks.a + s.rel, b: s.marks.b + s.rel });
    setSnap(null);
    setNav(navRestore);
  };
  const snapNow = (): Snap | null => (b && ma != null && mb != null ? { b, marks: { a: ma, b: mb }, rel } : null);

  const openPick = () => {
    if (stage === 'compare') {
      leaveCompare();
      setSnap(snapNow());
    }
    if (!pickOpened) {
      setPickOpened(true);
      startPickUi();
    }
    setSelected(b);
    setNav(navOpenPick(nav));
  };
  const pickNext = () => {
    if (!selected || selected === aPath || missing.has(selected)) return;
    /* 비교에서 B 바꾸기를 열고 같은 B 를 다시 골랐으면 맞춘 그대로 돌아간다 */
    if (snap && selected === snap.b) return restoreSnap(snap);
    if (selected !== b) {
      setB(selected);
      setMarks((m) => ({ a: m.a, b: null }));
      setTimes((t) => ({ a: ma ?? t.a, b: 0 }));
      setFocus(ma == null ? 'a' : 'b');
    } else setFocus(ma == null ? 'a' : mb == null ? 'b' : focus);
    setNav(navPickNext(nav));
  };
  const realign = () => {
    const s = snapNow();
    leaveCompare();
    setSnap(s);
    if (ma != null && mb != null) {
      playerCall.seek(pa, ma);
      playerCall.seek(pb, mb);
      setTimes({ a: ma, b: mb });
    }
    setFocus('a');
    setNav(navRealign(nav));
  };
  const startCompare = () => {
    if (!bothMarked(marks) || !readyA || !readyB || errA || errB) return;
    setSnap(null);
    setEnded(false);
    playerCall.seek(pa, marks.a);
    playerCall.seek(pb, marks.b);
    setTimes({ a: marks.a, b: marks.b });
    setNav(navCompare(nav));
  };
  const back = () => {
    const r = navBack(nav, !!snap);
    if (r.to === 'restore' && snap) return restoreSnap(snap);
    if (r.to === 'stage') {
      setSelected(b);
      return setNav(r.nav);
    }
    leaveCompare();
    onExit();
  };
  const onHardwareBack = useEffectEvent(() => {
    back();
    return true;
  });
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => onHardwareBack());
    return () => sub.remove();
  }, []);
  /* 밀어서 뒤로는 화면째 닫는다 — 그 길이 '들어온 곳으로'와 같을 때만 켠다 */
  const swipeOk = exitIsBack && navSwipeOk(nav);

  /* ---- 장면 맞추기 ---- */
  const playerOf = (s: SideKey) => (s === 'a' ? pa : pb);
  const infoOf = (s: SideKey) => (s === 'a' ? sides.a : sides.b);
  const seekSide = (s: SideKey, t: number) => {
    const d = infoOf(s)?.duration ?? null;
    const v = Math.max(0, d != null ? Math.min(d, t) : t);
    playerCall.seek(playerOf(s), v);
    setTimes((x) => ({ ...x, [s]: v }));
  };
  const nudgeSide = (dir: 1 | -1) => {
    const p = playerOf(focus);
    playerCall.pause(p);
    seekSide(focus, (p ? playerCall.time(p) : times[focus]) + dir * sceneStep(infoOf(focus)?.fps));
  };
  const markSide = () => {
    const p = playerOf(focus);
    if (!p || !infoOf(focus)?.ready) return;
    const t = playerCall.time(p);
    const next = { ...marks, [focus]: t };
    setMarks(next);
    setTimes((x) => ({ ...x, [focus]: t }));
    void Haptics.selectionAsync();
    AccessibilityInfo.announceForAccessibility(bothMarked(next) ? '두 영상의 기준 장면을 지정했어요.' : `${focus.toUpperCase()} 기준 장면을 지정했어요.`);
    /* 한쪽을 짚으면 아직 안 짚은 쪽으로 */
    const other: SideKey = focus === 'a' ? 'b' : 'a';
    if (next[other] == null && !infoOf(other)?.error) setFocus(other);
  };

  /* ---- 비교 조작 ---- */
  const nudgeRel = (dir: 1 | -1) => {
    if (!pa || ma == null) return;
    stopBoth();
    seekBoth(playerCall.time(pa) - ma + dir * sceneStep(sides.a?.fps));
  };
  const toMarks = () => {
    stopBoth();
    seekBoth(0);
  };
  const pickRate = () => {
    const options = [...RATES.map(rateText), '취소'];
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1, title: '재생 속도' }, (i) => {
      const r = RATES[i];
      if (r == null) return;
      setRate(r);
      playerCall.rate(pa, r);
      playerCall.rate(pb, r);
    });
  };
  const togglePlay = () => (phase === 'idle' ? void playBoth() : stopBoth());

  /* ---- 배치 · 크기 ---- */
  const big = fontScale >= 1.3;
  const shape = big ? 'stack' : layout;
  const W = Math.min(winW, 900) - 32;
  /* 두 칸은 같은 크기 — 더 세로로 긴 쪽 비율에 맞추고, 영상은 칸 안에 잘림 없이(contain) */
  const boxAspect = Math.min(2, Math.max(0.45, Math.min(sides.a?.aspect ?? 4 / 5, sides.b?.aspect ?? 4 / 5)));
  const colW = shape === 'side' ? (W - 12) / 2 : W;
  const boxH = Math.round(Math.min(colW / boxAspect, shape === 'side' ? winH * 0.42 : winH * 0.28));
  const box = { w: Math.round(shape === 'side' ? colW : Math.min(W, boxH * Math.max(boxAspect, 1.2))), h: boxH };

  const sideProps = (s: SideKey) => {
    const item = s === 'a' ? aItem : bItem;
    return {
      side: s,
      path: s === 'a' ? aPath : (b ?? ''),
      rate,
      time: times[s],
      box,
      width: colW,
      title: item ? videoDateText(item.date) : ((s === 'a' ? labels.a : labels.b) ?? '영상'),
      note: item ? (item.note ?? videoCaption(item)) : null,
      mark: marks[s],
      aligning: stage === 'align',
      focused: stage === 'align' && focus === s,
      onFocus: () => setFocus(s),
      onInfo: s === 'a' ? infoA : infoB,
      onExpand: () => setExpand(s),
      onExit,
    };
  };

  if (stage === 'pick') {
    return (
      <>
        <Stack.Screen options={{ gestureEnabled: swipeOk }} />
        <VideoGallery
          pick={{
            a: aItem,
            aPath,
            selected,
            onSelect: (v) => setSelected((s) => (s === v.path ? null : v.path)),
            onBack: back,
            next: { label: snap && selected === snap.b ? '비교로 돌아가기' : '기준 장면 맞추기', onPress: pickNext },
            knownMissing: missing,
          }}
        />
      </>
    );
  }

  const bothReady = readyA && readyB;
  const alignHint = errB
    ? 'B 영상을 확인하면 비교할 수 있어요.'
    : errA
      ? 'A 영상을 확인하면 비교할 수 있어요.'
      : bothMarked(marks)
        ? '두 영상의 기준 장면을 지정했어요.'
        : ma == null && mb == null
          ? 'A와 B의 기준 장면을 지정해 주세요.'
          : ma == null
            ? 'A의 기준 장면도 지정해 주세요.'
            : 'B의 기준 장면도 지정해 주세요.';
  const canStart = bothMarked(marks) && bothReady && !errA && !errB;
  const focusReady = !!infoOf(focus)?.ready;
  const focusDur = infoOf(focus)?.duration ?? null;
  const F = focus.toUpperCase();
  const playLabel = phase === 'playing' ? '함께 멈춤' : phase === 'seeking' ? '맞추는 중' : phase === 'buffering' ? '불러오는 중' : '함께 재생';
  const expandPlayer = expand === 'a' ? pa : expand === 'b' ? pb : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Stack.Screen options={{ gestureEnabled: swipeOk }} />
      <View style={[st.bar, { paddingTop: inset.top + 4 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={back} hitSlop={6} style={st.barButton}>
          <Icon name="back" size={22} color={c.link} />
        </Pressable>
        <View style={st.barMid} accessible accessibilityRole="header">
          <Text numberOfLines={1} maxFontSizeMultiplier={1.6} style={[st.barTitle, { color: c.ink }]}>
            영상 비교
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={[{ paddingHorizontal: 16, paddingTop: 4, gap: 14, paddingBottom: inset.bottom + (stage === 'align' ? 190 : 32) }, READABLE]}>
        <View style={st.subhead}>
          <Text maxFontSizeMultiplier={1.6} style={[TYPE.section, { color: c.ink, flex: 1 }]} accessibilityRole="header">
            {stage === 'align' ? '같은 동작에 맞추기' : '맞춘 장면'}
          </Text>
          {big ? (
            <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
              위아래 보기
            </Text>
          ) : (
            <Press
              accessibilityRole="button"
              accessibilityLabel={layout === 'side' ? '위아래로 보기' : '나란히 보기'}
              onPress={() => setLayout((l) => (l === 'side' ? 'stack' : 'side'))}
              style={[st.chip, { backgroundColor: withAlpha(c.ink, 0.06) }]}
            >
              <Icon name={layout === 'side' ? 'arrow-up-down' : 'arrow-left-right'} size={16} color={c.link} />
              <Text maxFontSizeMultiplier={1.4} style={[TYPE.buttonCompact, { color: c.link }]}>
                {layout === 'side' ? '위아래' : '나란히'}
              </Text>
            </Press>
          )}
        </View>
        <View style={shape === 'side' ? { flexDirection: 'row', gap: 12 } : { gap: 14 }}>
          <SideView key={aPath} {...sideProps('a')} />
          {b ? <SideView key={b} {...sideProps('b')} onReplace={openPick} /> : null}
        </View>

        {stage === 'align' ? (
          <View style={[st.panel, { backgroundColor: c.card }]}>
            <View accessibilityRole="radiogroup" accessibilityLabel="장면을 맞출 영상" style={[st.segment, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
              {(['a', 'b'] as const).map((s) => {
                const on = focus === s;
                const off = !!infoOf(s)?.error;
                return (
                  <Press
                    key={s}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on, disabled: off }}
                    disabled={off}
                    onPress={() => setFocus(s)}
                    style={[st.segItem, on && { backgroundColor: c.card }, off && { opacity: 0.4 }]}
                  >
                    <Text maxFontSizeMultiplier={1.4} style={[TYPE.buttonCompact, { color: on ? c.ink : c.muted }]}>
                      {s.toUpperCase()} 장면 맞추기
                    </Text>
                  </Press>
                );
              })}
            </View>
            <Text maxFontSizeMultiplier={1.6} style={[TYPE.card, { color: c.ink, fontVariant: ['tabular-nums'] }]}>
              {F} {clockText(times[focus])}
            </Text>
            <Scrubber
              value={times[focus]}
              max={focusDur ?? 1}
              disabled={!focusReady}
              onStart={() => playerCall.pause(playerOf(focus))}
              onSeek={(t) => seekSide(focus, t)}
              step={sceneStep(infoOf(focus)?.fps)}
              label={`${F} 영상 장면 선택`}
              valueText={clockText(times[focus])}
            />
            <ScrubLabels left="0:00" right={clockText(focusDur)} />
            <View style={st.row}>
              <Press accessibilityRole="button" accessibilityLabel={`${F} 이전 장면`} disabled={!focusReady} onPress={() => nudgeSide(-1)} style={st.iconBtn}>
                <Icon name="chevron-left" size={24} color={focusReady ? c.link : c.muted} />
              </Press>
              <Press
                accessibilityRole="button"
                accessibilityState={{ disabled: !focusReady }}
                disabled={!focusReady}
                onPress={markSide}
                style={[st.primary, { flex: 1, backgroundColor: c.action }, !focusReady && { opacity: 0.4 }]}
              >
                <Text maxFontSizeMultiplier={1.4} numberOfLines={2} style={[TYPE.button, { color: c.onAction, textAlign: 'center' }]}>
                  {F} 기준 장면으로 지정
                </Text>
              </Press>
              <Press accessibilityRole="button" accessibilityLabel={`${F} 다음 장면`} disabled={!focusReady} onPress={() => nudgeSide(1)} style={st.iconBtn}>
                <Icon name="chevron-right" size={24} color={focusReady ? c.link : c.muted} />
              </Press>
            </View>
            <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
              앞발 착지처럼 두 영상에서 같은 동작을 골라 주세요. 이전 · 다음 장면은 영상이 알린 장면 간격만큼 움직여요.
            </Text>
          </View>
        ) : (
          <View style={[st.panel, { backgroundColor: c.card }]}>
            <View style={st.row}>
              <Text maxFontSizeMultiplier={1.6} style={[TYPE.card, { color: c.ink, flex: 1, fontVariant: ['tabular-nums'] }]}>
                기준 장면 {relText(rel)}
              </Text>
              <Press
                accessibilityRole="button"
                accessibilityLabel={`재생 속도 ${rateText(rate)}, 바꾸기`}
                disabled={!canSync}
                onPress={pickRate}
                style={[st.chip, { backgroundColor: withAlpha(c.ink, 0.06) }, !canSync && { opacity: 0.4 }]}
              >
                <Text maxFontSizeMultiplier={1.4} style={[TYPE.buttonCompact, { color: c.link }]}>
                  {rateText(rate)}
                </Text>
                <Icon name="chevron-down" size={14} color={c.link} />
              </Press>
            </View>
            <Scrubber
              value={rel}
              min={range?.min ?? 0}
              max={range?.max ?? 1}
              disabled={!canSync}
              onStart={stopBoth}
              onSeek={seekBoth}
              step={sceneStep(sides.a?.fps)}
              label="함께 재생할 위치"
              valueText={`기준 장면 ${relText(rel)}`}
            />
            <ScrubLabels left={range ? relText(range.min) : '—'} right={range ? relText(range.max) : '—'} />
            <View style={st.row}>
              <Press accessibilityRole="button" accessibilityLabel="두 영상 이전 장면" disabled={!canSync} onPress={() => nudgeRel(-1)} style={st.iconBtn}>
                <Icon name="chevron-left" size={24} color={canSync ? c.link : c.muted} />
              </Press>
              <Press
                accessibilityRole="button"
                accessibilityLabel={playLabel}
                accessibilityState={{ disabled: !canSync, busy: phase === 'seeking' || phase === 'buffering' }}
                disabled={!canSync}
                onPress={togglePlay}
                style={[st.primary, { flex: 1, flexDirection: 'row', gap: 8, backgroundColor: c.action }, !canSync && { opacity: 0.4 }]}
              >
                {phase === 'seeking' || phase === 'buffering' ? (
                  <ActivityIndicator color={c.onAction} />
                ) : (
                  <Icon name={phase === 'playing' ? 'pause' : 'play'} size={20} color={c.onAction} />
                )}
                <Text maxFontSizeMultiplier={1.4} style={[TYPE.button, { color: c.onAction }]}>
                  {playLabel}
                </Text>
              </Press>
              <Press accessibilityRole="button" accessibilityLabel="두 영상 다음 장면" disabled={!canSync} onPress={() => nudgeRel(1)} style={st.iconBtn}>
                <Icon name="chevron-right" size={24} color={canSync ? c.link : c.muted} />
              </Press>
            </View>
            <View style={[st.row, { flexWrap: 'wrap' }]}>
              <Press accessibilityRole="button" disabled={!canSync} onPress={toMarks} style={[st.textBtn, !canSync && { opacity: 0.4 }]}>
                <Icon name="flag" size={16} color={c.link} />
                <Text maxFontSizeMultiplier={1.4} style={[TYPE.buttonCompact, { color: c.link }]}>
                  맞춘 장면으로
                </Text>
              </Press>
              <Press accessibilityRole="button" onPress={realign} style={st.textBtn}>
                <Text maxFontSizeMultiplier={1.4} style={[TYPE.buttonCompact, { color: c.link }]}>
                  장면 다시 맞추기
                </Text>
              </Press>
            </View>
            <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
              {errB
                ? 'B 영상을 확인하면 함께 재생할 수 있어요.'
                : errA
                  ? 'A 영상을 확인하면 함께 재생할 수 있어요.'
                  : !bothReady
                    ? '두 영상을 불러오는 중이에요.'
                    : ended
                      ? '함께 볼 수 있는 구간이 끝났어요. 다시 재생하면 구간 처음부터 재생해요.'
                      : '두 영상이 함께 재생 가능한 구간만 표시해요.'}
            </Text>
          </View>
        )}
      </ScrollView>

      {stage === 'align' ? (
        <View style={[st.foot, { paddingBottom: inset.bottom + 12, backgroundColor: c.page, borderTopColor: c.line }]}>
          <Text maxFontSizeMultiplier={1.6} numberOfLines={2} style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]}>
            {alignHint}
          </Text>
          <Press
            accessibilityRole="button"
            accessibilityState={{ disabled: !canStart }}
            accessibilityHint={canStart ? undefined : bothMarked(marks) ? '두 영상이 준비되면 비교할 수 있어요' : alignHint}
            disabled={!canStart}
            onPress={startCompare}
            style={[st.primary, { backgroundColor: c.action }, !canStart && { opacity: 0.4 }]}
          >
            <Text maxFontSizeMultiplier={1.4} style={[TYPE.button, { color: c.onAction }]}>
              맞춘 장면으로 비교
            </Text>
          </Press>
        </View>
      ) : null}

      {expand && expandPlayer ? (
        <ExpandView
          player={expandPlayer}
          side={expand}
          aspect={infoOf(expand)?.aspect ?? boxAspect}
          time={times[expand]}
          playLabel={stage === 'compare' ? playLabel : null}
          canPlay={canSync}
          onToggle={togglePlay}
          onClose={() => setExpand(null)}
        />
      ) : null}
    </View>
  );
}

/**
 * 한 쪽 칸 — 자기 재생기를 갖는다(영상이 바뀌면 key 로 새로 만든다). 머리(A · B, 날짜, B 는 바꾸기)는 두 칸이 같은 높이라 B 의 단추 때문에
 * B 영상만 내려가지 않는다. 재생 준비 · 길이 · 장면 간격 · 화면 비율 · 오류는 onInfo 로 위에 알린다(함께 재생은 위가 맡는다).
 */
function SideView({
  side,
  path,
  rate,
  time,
  box,
  width,
  title,
  note,
  mark,
  aligning,
  focused,
  onFocus,
  onInfo,
  onReplace,
  onExpand,
  onExit,
}: {
  side: SideKey;
  path: string;
  rate: number;
  time: number;
  box: { w: number; h: number };
  width: number;
  title: string;
  note: string | null;
  mark: number | null;
  aligning: boolean;
  focused: boolean;
  onFocus: () => void;
  onInfo: (s: SideInfo | null) => void;
  onReplace?: () => void;
  onExpand: () => void;
  onExit: () => void;
}) {
  const c = usePalette();
  const L = side.toUpperCase();
  const settled = useScreenSettled();
  const [attempt, setAttempt] = useState(0);
  const src = useVideoSource(settled ? path : null, attempt);
  const [rate0] = useState(rate);
  const player = useVideoPlayer(src.uri, (p) => playerCall.setup(p, rate0));
  const [status, setStatus] = useState<VideoPlayerStatus>('idle');
  const [meta, setMeta] = useState<{ duration: number | null; fps: number | null }>({ duration: null, fps: null });
  useEventListener(player, 'statusChange', ({ status: s }) => {
    setStatus(s);
    if (s === 'readyToPlay') setMeta({ duration: player.duration > 0 ? player.duration : null, fps: player.videoTrack?.frameRate ?? null });
  });
  const ready = !!src.uri && status === 'readyToPlay';
  const aspect = useDisplayAspect(player, ready);
  const errKind: SideErr['kind'] | null = src.error?.kind ?? (status === 'error' ? 'player' : null);
  const errMessage = src.error?.message ?? '영상을 재생하지 못했어요. 다시 시도해 주세요.';
  const error = useMemo<SideErr | null>(() => (errKind ? { kind: errKind, message: errMessage } : null), [errKind, errMessage]);
  useEffect(() => {
    onInfo({ player, ready, duration: meta.duration, fps: meta.fps, aspect, error });
  }, [onInfo, player, ready, meta, aspect, error]);
  useEffect(() => () => onInfo(null), [onInfo]);
  /* 준비되면(처음 · 다시 시도 · 비교로 돌아옴) 위가 정한 자리로 */
  const toTime = useEffectEvent(() => playerCall.seek(player, time));
  useEffect(() => {
    if (ready) toTime();
  }, [ready]);

  const thumbs = usePathThumbs([path]);
  const thumb = thumbs[path];
  const marked = mark != null;
  const errText = !error
    ? null
    : error.kind === 'missing'
      ? '이 기기에 영상이 없어요'
      : error.kind === 'gone'
        ? '영상 파일을 찾지 못했어요'
        : error.kind === 'player'
          ? '영상을 재생하지 못했어요'
          : '영상을 불러오지 못했어요';
  /* 이 기기에 없음 · 지워짐은 다시 받아도 안 생긴다 — B 는 다른 영상, A 는 돌아가기 */
  const errAction = !error
    ? null
    : error.kind === 'missing' || error.kind === 'gone'
      ? side === 'b' && onReplace
        ? { label: '다른 영상', run: onReplace }
        : { label: '돌아가기', run: onExit }
      : { label: '다시 시도', run: () => setAttempt((n) => n + 1) };

  return (
    <View style={{ width, gap: 6 }}>
      <View style={st.sideHead}>
        <View style={[st.badge, { backgroundColor: side === 'a' ? c.ink : c.action }]}>
          <Text style={[st.badgeText, { color: side === 'a' ? c.page : c.onAction }]}>{L}</Text>
        </View>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[TYPE.buttonCompact, { color: c.ink, flex: 1 }]}>
          {title}
        </Text>
        {onReplace ? (
          <Press accessibilityRole="button" accessibilityLabel="B 영상 바꾸기" onPress={onReplace} style={st.replace}>
            <Text maxFontSizeMultiplier={1.3} style={[TYPE.buttonCompact, { color: c.link }]}>
              바꾸기
            </Text>
          </Press>
        ) : null}
      </View>
      <Pressable
        accessibilityRole={aligning ? 'button' : undefined}
        accessibilityLabel={`${L} 영상${aligning ? ', 장면 맞출 영상으로 고르기' : ''}${error ? `, ${errText}` : ready ? '' : ', 불러오는 중'}`}
        accessibilityState={aligning ? { selected: focused } : undefined}
        disabled={!aligning}
        onPress={onFocus}
        style={[st.media, { width: box.w, height: box.h, alignSelf: 'center', borderColor: focused ? c.action : 'transparent' }]}
      >
        {thumb && !ready && !error ? <Image source={thumbSource(thumb)} style={StyleSheet.absoluteFill} contentFit="contain" /> : null}
        {ready ? <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} pointerEvents="none" /> : null}
        {error ? (
          <View style={[StyleSheet.absoluteFill, st.center]}>
            <Icon name={error.kind === 'missing' ? 'film' : 'circle-alert'} size={22} color="rgba(255,255,255,0.8)" />
            <Text maxFontSizeMultiplier={1.4} style={st.errText}>
              {errText}
            </Text>
            {errAction ? (
              <Press accessibilityRole="button" accessibilityLabel={`${L} ${errAction.label}`} onPress={errAction.run} style={st.errBtn}>
                <Text maxFontSizeMultiplier={1.3} style={[TYPE.buttonCompact, { color: '#fff' }]}>
                  {errAction.label}
                </Text>
              </Press>
            ) : null}
          </View>
        ) : !ready ? (
          <View style={[StyleSheet.absoluteFill, st.center]}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
        {ready ? (
          <>
            <Text style={st.timeChip} maxFontSizeMultiplier={1.2} accessibilityElementsHidden importantForAccessibility="no">
              {clockText(time)}
            </Text>
            <Press accessibilityRole="button" accessibilityLabel={`${L} 영상 크게 보기`} onPress={onExpand} style={st.expand}>
              <Icon name="focus" size={18} color="#fff" />
            </Press>
          </>
        ) : null}
      </Pressable>
      {note ? (
        <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[TYPE.sub, { color: c.muted }]}>
          {note}
        </Text>
      ) : null}
      <View style={st.markRow} accessible accessibilityLabel={`${L} ${marked ? `기준 장면 ${clockText(mark)}` : '기준 장면 지정 전'}`}>
        <Icon name={marked ? 'circle-check' : 'circle'} size={16} color={marked ? c.link : c.muted} />
        <Text maxFontSizeMultiplier={1.4} style={[TYPE.sub, { color: marked ? c.ink : c.muted, fontVariant: ['tabular-nums'] }]}>
          {marked ? `기준 ${clockText(mark)}` : '기준 장면 지정 전'}
        </Text>
      </View>
    </View>
  );
}

/** 크게 보기 — 같은 재생기를 화면 가득 한 번 더 붙인다. 보는 동안만 가로로 돌릴 수 있게(닫으면 세로 — app/_layout.tsx) */
function ExpandView({
  player,
  side,
  aspect,
  time,
  playLabel,
  canPlay,
  onToggle,
  onClose,
}: {
  player: VideoPlayer;
  side: SideKey;
  aspect: number;
  time: number;
  playLabel: string | null;
  canPlay: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  useEffect(() => {
    void ScreenOrientation.unlockAsync().catch(() => undefined);
    return () => void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
  }, []);
  const availH = height - inset.top - inset.bottom - 130;
  const availW = width - inset.left - inset.right - 24;
  const boxH = Math.max(120, Math.min(availH, availW / aspect));
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" supportedOrientations={['portrait', 'landscape-left', 'landscape-right']} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000', paddingTop: inset.top, paddingBottom: inset.bottom + 8, paddingHorizontal: 12 }}>
        <View style={st.fullBar}>
          <Text style={st.fullTitle}>
            {side.toUpperCase()} 영상 · {clockText(time)}
          </Text>
          <Press accessibilityRole="button" accessibilityLabel="크게 보기 닫기" onPress={onClose} style={st.fullClose}>
            <Icon name="x" size={20} color="#fff" />
          </Press>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: boxH * aspect, height: boxH }}>
            <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} pointerEvents="none" />
          </View>
        </View>
        {playLabel ? (
          <Press
            accessibilityRole="button"
            accessibilityLabel={playLabel}
            disabled={!canPlay}
            onPress={onToggle}
            style={[st.primary, { backgroundColor: 'rgba(255,255,255,0.16)', alignSelf: 'center', paddingHorizontal: 28 }, !canPlay && { opacity: 0.4 }]}
          >
            <Text maxFontSizeMultiplier={1.4} style={[TYPE.button, { color: '#fff' }]}>
              {playLabel}
            </Text>
          </Press>
        ) : null}
      </View>
    </Modal>
  );
}

/**
 * 인자 없이 들어왔을 때(메카닉 화면의 '2분할 비교') — 예전처럼 투구 기록 영상 둘을 고른다. 고르면 장면 맞추기부터.
 */
type LogPick = { key: string; path: string; label: string };
function LogPicker({ onPick }: { onPick: (a: LogPick, b: LogPick) => void }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const all = useAllLogs(true);
  const [picked, setPicked] = useState<LogPick[]>([]);
  const videos = useMemo(
    () =>
      [...(all.logs ?? [])]
        .reverse()
        .flatMap((l) =>
          l.videoPaths.map((path, i) => ({
            key: `${l.id}:${i}`,
            path,
            label: `${Number(dateKeyOf(l.date).slice(5, 7))}/${Number(dateKeyOf(l.date).slice(8))} ${l.sessionType}${
              l.videoPaths.length > 1 ? ` · 영상 ${i + 1}` : ''
            }`,
          }))
        ),
    [all.logs]
  );
  const toggle = (v: LogPick) =>
    setPicked((p) => (p.some((x) => x.key === v.key) ? p.filter((x) => x.key !== v.key) : p.length >= 2 ? [p[1], v] : [...p, v]));

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <View style={[st.bar, { paddingTop: inset.top + 4 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} hitSlop={6} style={st.barButton}>
          <Icon name="back" size={22} color={c.link} />
        </Pressable>
        <View style={st.barMid} accessible accessibilityRole="header">
          <Text numberOfLines={1} maxFontSizeMultiplier={1.6} style={[st.barTitle, { color: c.ink }]}>
            2분할 비교
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 8, paddingBottom: inset.bottom + 110 }, READABLE]}>
        <Text style={[TYPE.body, { color: c.muted }]}>견줄 영상 둘을 골라 주세요.</Text>
        {!all.logs ? <ActivityIndicator style={{ marginTop: 24 }} /> : null}
        {all.logs && videos.length === 0 ? <Text style={[TYPE.body, { color: c.muted, paddingVertical: 24, textAlign: 'center' }]}>영상이 붙은 기록이 없어요.</Text> : null}
        {videos.map((v) => {
          const n = picked.findIndex((x) => x.key === v.key);
          return (
            <Press
              select
              selected={n >= 0}
              key={v.key}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: n >= 0 }}
              onPress={() => toggle(v)}
              style={[st.logRow, { backgroundColor: c.card, boxShadow: c.float }]}
            >
              <View style={[st.check, { borderColor: n >= 0 ? c.action : c.line, backgroundColor: n >= 0 ? c.action : 'transparent' }]}>
                {n >= 0 ? <Text style={st.checkText}>{n === 0 ? 'A' : 'B'}</Text> : null}
              </View>
              <Text style={[TYPE.card, { flex: 1, color: c.ink }]}>{v.label}</Text>
            </Press>
          );
        })}
      </ScrollView>
      <View style={[st.foot, { paddingBottom: inset.bottom + 12, backgroundColor: c.page, borderTopColor: c.line }]}>
        <Press
          accessibilityRole="button"
          accessibilityState={{ disabled: picked.length < 2 }}
          disabled={picked.length < 2}
          onPress={() => picked.length === 2 && onPick(picked[0], picked[1])}
          style={[st.primary, { backgroundColor: c.action }, picked.length < 2 && { opacity: 0.4 }]}
        >
          <Text style={[TYPE.button, { color: c.onAction }]}>{picked.length < 2 ? `${picked.length}/2 골랐어요` : '기준 장면 맞추기'}</Text>
        </Press>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 6, minHeight: 56 },
  barButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  barMid: { position: 'absolute', left: 96, right: 96, bottom: 12, alignItems: 'center' },
  barTitle: { fontSize: 19, fontWeight: '700', letterSpacing: -0.4 },
  subhead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 22 },
  sideHead: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  badge: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 14, fontWeight: '800' },
  replace: { minHeight: 44, minWidth: 44, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  media: { borderRadius: 16, backgroundColor: '#0e1a26', overflow: 'hidden', borderWidth: 2 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 10, gap: 8 },
  errText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  errBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  timeChip: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    color: '#fff',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(16,40,59,0.72)',
  },
  expand: { position: 'absolute', right: 4, bottom: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 22 },
  panel: { borderRadius: 20, padding: 16, gap: 10 },
  segment: { flexDirection: 'row', borderRadius: 14, padding: 3, gap: 3 },
  segItem: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  primary: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  textBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 8 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  fullBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  fullTitle: { color: '#fff', fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'], paddingLeft: 4 },
  fullClose: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderRadius: 14, paddingHorizontal: 14 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
