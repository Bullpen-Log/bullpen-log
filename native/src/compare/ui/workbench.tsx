import * as Haptics from 'expo-haptics';
import { Stack, useIsFocused } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { VideoView, type VideoPlayer } from 'expo-video';
import { type ComponentRef, type ReactNode, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActionSheetIOS, ActivityIndicator, Alert, AppState, BackHandler, Keyboard, LayoutAnimation, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MyVideoItem } from '@/lib/my-videos';
import { applyEdit, compareMetric, historyOf, METRIC_LABEL, METRIC_TOOLS, SCENE_TOL, visibleList, VIEW_LABEL, WIDTHS, COLORS, type Annotation, type Geometry, type History, type MetricKey, type ViewKey } from '~/compare/annotations';
import {
  activePair,
  addNote,
  clearTrim,
  duplicate,
  setTrim,
  addSource,
  ANCHOR_LABEL,
  editNote,
  fitLoop,
  makeId,
  moveReview,
  ownedPathsOf,
  presentOf,
  removeNote,
  rename,
  setActive,
  setPresent,
  sourceOf,
  startReview,
  swapActive,
  updatePair,
  updateSource,
  type AnchorSemantic,
  type ComparisonDocument,
  type NewSource,
  type NoteRef,
  type PairState,
  type SourceRef,
} from '~/compare/doc';
import { IDENTITY_REG, IDENTITY_VIEW, nudgeReg, type Pt, type ViewTransform } from '~/compare/geometry';
import { layerMap, overlayTopMap, planImmersive, type DisplayMode, type SplitShape, type StageView } from '~/compare/immersive/geometry';
import { COMPARE_BLACK } from '~/compare/immersive/palette';
import {
  layerOpacity,
  onAnchorsReady,
  OPACITY_PRESETS,
  opacityA11y,
  opacityApplies,
  opacityLabel,
  setDisplay as setPresentDisplay,
  setOpacity as setPresentOpacity,
  setView as setPresentView,
  setWipe as setPresentWipe,
  stepOpacity,
  swapTop,
  wipeNote,
  type Presentation,
} from '~/compare/immersive/presentation';
import { CHROME_SHOWN, chromeA11y, chromeReduce, chromeTransitionMs, type ChromeEvent, type ChromeState } from '~/compare/immersive/visibility';
import { anchorFromEvents, compareInterval, DEFAULT_INTERVALS, EVENT_LABEL, EVENT_SHORT, intervalOf, normalizedAnchors, orderIssues, PITCH_EVENTS, sharedEvents, timeOf, type PitchEvent } from '~/compare/pitch-events';
import { createAutosaver, SAVE_LABEL, type SaveState } from '~/compare/storage';
import { applyPick, beginPick, type PickChoice, type PickSlot } from '~/compare/source-pick';
import { compareDrafts, compareOwner, compareStorage, deleteComparison, discardImported, holdPaths, refreshRecent, releaseHold, useCompareStore } from '~/compare/store';
import { draftKey } from '~/compare/note-drafts';
import { atomicNeed, FS_MAX, fsOf, iconW, inspChrome, inspectorBudget, keyboardOverlap, planEditor, segW, shotLayout, textBtnW, textW } from '~/compare/fit';
import {
  buildNormalized,
  clock,
  COMPARE_RATES,
  durationText,
  EMPTY_FACTS,
  normalizeFacts,
  normalizedOfB,
  normalizedTimes,
  offsetRange,
  rateLabel,
  startRange,
  stepFrom,
  stepInfo,
  syncQuality,
  trimmedRange,
  type MediaFacts,
  type RelRange,
} from '~/compare/timing';
import { phaseLabel, isBusy } from '~/compare/transport';
import type { DrawTool } from '~/compare/ui/annotation-layer';
import { NoteEditor } from '~/compare/ui/note-editor';
import { Pane, type PaneBadge, type PaneDraw, type SideInfo, type SideKey } from '~/compare/ui/pane';
import { DRAW_HINT, DRAW_TOOLS, exportPlanFor, PITCH_TYPES, SPAN_LABEL, TextSheet, type SpanChoice } from '~/compare/ui/panels';
import { SourcePicker } from '~/compare/ui/source-picker';
import { useSidePlayback } from '~/compare/ui/side-playback';
import { ToolBar, type ToolItem } from '~/compare/ui/tool-bar';
import { Timeline, type TimelineMarker } from '~/compare/ui/timeline';
import { useCompareTransport } from '~/compare/ui/transport-hook';
import { btnItem, ctlH, flowRow, headRow, IconBtn, iconItem, Inspector, rowOf, Seg, segRowOf, ShotPair, subRow, TextBtn, type IItem, type IRow } from '~/compare/ui/workspace-parts';
import { backStep, closeInspector, fixTarget, INITIAL_UI, openContext, QUICK_DRAW, TARGET_LABEL, targetsFor, toggleInspector, type Inspector as InspectorName, type PlayTarget, type ToolContext, type WorkspaceUi } from '~/compare/workspace-context';
import { FALLBACK_ASPECT, sideDock } from '~/compare/workspace-layout';
import { TYPE, withAlpha } from '~/lib/ui';
import { useComparePalette } from '~/compare/ui/compare-palette';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';
import { bothMarked, navBack, navCompare, navOpenPick, navPickNext, navRealign, navRestore, navStart, navSwipeOk, relText, type CompareNav } from '~/videos/compare-math';
import { startPickUi } from '~/videos/filters';
import { playerCall } from '~/videos/player-parts';
import { useMyVideos } from '~/videos/store';
import { videoCaption, videoDateText } from '~/videos/text';

/**
 * 투구 영상 분석(2026-11-02 — 설계 docs/designs/sinker-pitch-video-workbench-plan.md). 한 문서(compare/doc.ts)를 고치며 자동으로 저장한다.
 * 단계: 고르기(pick) → 기준 맞추기(align) → 함께 보기(compare). B 가 없으면 한 영상 보기(single — align 단계에서 B 가 없을 때 그린다).
 * 뒤로 길은 compare-math 의 nav*(셀프테스트가 고리 없음을 본다). 짝 상태(기준 · 보기 · 반복)는 문서에 남아 B 를 바꿨다 돌아오면 그대로다.
 *
 * 한 화면(2026-11-02 — docs/designs/sinker-pitch-video-single-screen-plan.md, UI01~UI12): 화면은 굴리지 않는다.
 * 머리(44) · 영상 무대(남는 자리 전부) · 타임라인 · 재생 줄 · 도구 줄이 늘 같은 자리. 도구는 도구 줄을 바꾸거나 무대 위 작은 창 하나(쪽 넘기기)로.
 */

/**
 * 저장할 만한 문서인가(한 영상 정책 — F02 · F08):
 *  - 두 영상 이상 · 그림 · 메모 · 장면 표시가 있으면 저장한다.
 *  - 사진 앱 · 촬영에서 가져온 영상(앱 안 복사본)이 있으면 한 영상이어도 저장한다 — 안 남기면 가져온 것이 사라지고 복사본만 남는다.
 *  - 내 영상 · 기록의 한 영상을 잠깐 본 것만은 남기지 않는다(최근 목록이 지저분해지지 않게 — 그 영상은 원래 자리에 그대로 있다).
 */
export const worthSaving = (d: ComparisonDocument) =>
  d.sources.length >= 2 || d.annotations.length > 0 || d.notes.length > 0 || d.sources.some((s) => s.owned || Object.keys(s.events).length > 0);

/** 이 문서가 다시 열 때 돌아갈 자리 — 짝이면 상대 자리, 한 영상이면 그 영상의 마지막 자리 */
export const restoreTargetOf = (d: ComparisonDocument): number => {
  const p = activePair(d);
  if (p) return p.rel;
  return sourceOf(d, d.active.a)?.lastTime ?? 0;
};
export const pairKeyOf = (d: ComparisonDocument) => `${d.active.a}|${d.active.b ?? ''}`;
/**
 * 복원 단계(F02) — 짝(또는 한 영상)마다: waiting(재생기 준비 · 옮긴 뒤 두 재생기 확인 기다림) → done | failed.
 * done 이 되기 전에는 지금 자리를 문서에 쓰지 않는다(아직 0 에 있는 재생기 자리로 저장된 자리를 덮지 않게).
 * 사용자가 직접 옮기거나 재생하면 그 순간부터 done(사용자가 정한 자리가 이긴다).
 */
export type RestorePhase = 'waiting' | 'done' | 'failed';
export type RestoreState = { key: string; target: number; phase: RestorePhase; nonce: number };

export function sourceFromItem(v: MyVideoItem | null, path: string, label?: string | null): NewSource {
  return {
    path,
    origin: v?.logs.length ? 'log' : 'myVideos',
    owned: false,
    label: label ?? (v ? videoDateText(v.date) : null),
    date: v?.date ?? null,
    facts: v?.durationSec ? normalizeFacts({ durationSec: v.durationSec }) : null,
    sessionType: v?.logs[0]?.type ?? null,
  };
}

const nowIso = () => new Date().toISOString();
const intersect = (x: RelRange, y: RelRange): RelRange | null => {
  const min = Math.max(x.min, y.min);
  const max = Math.min(x.max, y.max);
  return max - min > 0.04 ? { min, max } : null;
};

export function Workbench({
  initial,
  start,
  onExit,
  exitIsBack,
  importHold,
}: {
  initial: ComparisonDocument;
  start: 'pick' | 'align' | 'compare';
  onExit: () => void;
  exitIsBack: boolean;
  /** 처음 고르기에서 가져온 복사본을 붙들던 열쇠 — 이 화면이 제 문서로 붙든 뒤 놓는다 */
  importHold?: string;
}) {
  const c = useComparePalette();
  const screenFocused = useIsFocused();
  const inset = useSafeAreaInsets();
  const { width: winW, height: winH, fontScale } = useWindowDimensions();
  const { items } = useMyVideos();
  const { owner } = useCompareStore();
  const itemOf = useCallback((p: string | null) => (p ? (items?.find((v) => v.path === p) ?? null) : null), [items]);

  /* ---- 문서 · 자동 저장 ---- */
  const [doc, setDocState] = useState(initial);
  const docRef = useRef(doc);
  const [save, setSave] = useState<SaveState>(initial.revision > 0 ? 'saved' : 'idle');
  /* 그림 편집 기록 — 문서의 annotations 와 늘 같은 값(고칠 때 둘 다) */
  const [history, setHistory] = useState<History>(() => historyOf(initial.annotations));
  const [restore, setRestore] = useState<RestoreState>(() => ({ key: pairKeyOf(initial), target: restoreTargetOf(initial), phase: 'waiting', nonce: 0 }));
  const [saver] = useState(() =>
    createAutosaver(
      (d) => {
        const st = compareStorage();
        return st && compareOwner() === d.ownerId ? st.save(d) : Promise.resolve({ ok: false as const, reason: 'owner' as const });
      },
      {
        onState: (s) => setSave(s),
        onSaved: () => {
          everSaved.current = true;
          void refreshRecent();
        },
        onConflict: (cur) => {
          /* 다른 곳에서 바뀌었다 — 이 판은 사본으로 남기고 새 판을 받아들인다(둘 다 잃지 않게) */
          const mine = docRef.current;
          const st = compareStorage();
          if (st) void st.save({ ...mine, id: makeId('c'), revision: 0, title: `${mine.title} (충돌 사본)`.slice(0, 40), sources: mine.sources.map((s) => ({ ...s, owned: false })) }).then(() => refreshRecent());
          docRef.current = cur;
          setDocState(cur);
          setHistory(historyOf(cur.annotations));
          setRestore((r) => ({ key: pairKeyOf(cur), target: restoreTargetOf(cur), phase: 'waiting', nonce: r.nonce + 1 }));
          saverRef.current?.base(cur.revision);
          toast('다른 곳에서 바뀐 비교라 새 판을 열고, 고친 것은 사본으로 남겼어요.', 'info');
        },
      }
    )
  );
  const saverRef = useRef(saver);
  const everSaved = useRef(initial.revision > 0);
  const holdKey = `wb:${initial.id}`;
  useEffect(() => {
    saver.base(initial.revision);
    /*
     * 떠날 때 남은 것을 바로 쓴다(멈추지는 않는다 — 개발 모드의 두 번 붙이기에서도 저장이 이어지게).
     * 다 쓴 뒤 이 화면이 붙들던 경로를 놓는다. 한 번도 저장되지 않은 문서(로그인 확인 전에 닫음 · 저장 실패)의 가져온 복사본은 정리한다.
     */
    return () =>
      void saver.flush().finally(() => {
        releaseHold(holdKey);
        if (!everSaved.current) void discardImported(ownedPathsOf(docRef.current));
      });
  }, [saver, initial.revision, holdKey]);
  /* 이 화면의 문서가 쓰는 영상 경로를 붙든다 — 아직 파일에 안 적힌 고침이어도 다른 비교를 지울 때 지워지지 않게(F01) */
  const pathKey = doc.sources.map((x) => x.path).join('|');
  const holdNow = useEffectEvent(() => {
    holdPaths(holdKey, docRef.current.sources.map((x) => x.path));
    if (importHold) releaseHold(importHold);
  });
  useEffect(() => holdNow(), [pathKey]);
  /* 로그인한 사람을 늦게 알았으면 주인으로 — 다른 사람으로 바뀌면 저장을 멈춘다 */
  const adoptOwner = useEffectEvent((o: string | null) => {
    const d = docRef.current;
    if (!d.ownerId && o) edit({ ...d, ownerId: o });
    else if (d.ownerId && o !== d.ownerId) saver.stop();
  });
  useEffect(() => adoptOwner(owner), [owner]);
  /* 앱이 뒤로 가면 바로 저장 */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s !== 'active' && void saver.flush());
    return () => sub.remove();
  }, [saver]);

  function edit(next: ComparisonDocument) {
    const d = { ...next, updatedAt: nowIso() };
    docRef.current = d;
    setDocState(d);
    if (d.ownerId && worthSaving(d)) saver.schedule(d);
  }

  const aSrc = sourceOf(doc, doc.active.a);
  const bSrc = sourceOf(doc, doc.active.b);
  const pair = activePair(doc);
  const aPath = aSrc?.path ?? '';
  const bPath = bSrc?.path ?? null;
  const marks = pair?.anchors ?? { a: null, b: null };
  const semantic: AnchorSemantic = pair?.semantic ?? 'footContact';
  const rate = doc.transport.rate;

  /* ---- 단계 ---- */
  const [nav, setNav] = useState<CompareNav>(() => (start === 'compare' ? navCompare(navStart(true)) : navStart(start !== 'pick')));
  const stage = nav.stage;
  const single = stage !== 'pick' && !bSrc;
  /* 다시 맞추기 · B 고르기 전의 짝 — 취소하면 기준 · 자리 · 반복 · 보기를 그대로 되돌린다 */
  const [snap, setSnap] = useState<{ a: string; b: string; marks: { a: number | null; b: number | null }; rel: number; loop: PairState['loop']; views: PairState['views'] } | null>(null);
  /* 영상 고르기 — 어느 칸을(B 더하기 · A/B 바꾸기 · 다시 잇기) */
  const [pickTarget, setPickTarget] = useState<{ slot: PickSlot; relink: string | null }>({ slot: 'b', relink: null });
  const [pickOpened, setPickOpened] = useState(start !== 'pick');
  const [missing, setMissing] = useState<ReadonlySet<string>>(() => new Set());
  const [focus, setFocus] = useState<SideKey>('a');
  /* 보이는 시각 — 처음엔 저장된 자리(복원이 끝나면 재생기 값으로 바뀐다) */
  const [times, setTimes] = useState(() => {
    const p = activePair(initial);
    if (!p) return { a: sourceOf(initial, initial.active.a)?.lastTime ?? 0, b: 0 };
    return { a: (p.anchors.a ?? 0) + (p.anchors.a != null ? p.rel : 0), b: (p.anchors.b ?? 0) + (p.anchors.b != null ? p.rel : 0) };
  });
  const [expand, setExpand] = useState<SideKey | null>(null);
  /* 도구 하나 · 작은 창 하나(UI05~UI08 — compare/workspace-context.ts) */
  const [ui, setUi] = useState<WorkspaceUi>(INITIAL_UI);
  const [sheet, setSheet] = useState<null | { kind: 'label'; side: SideKey; p: Pt } | { kind: 'calibrate'; side: SideKey; geom: Geometry } | { kind: 'title' } | { kind: 'time' }>(null);

  /* ---- 두 칸 정보 ---- */
  const [sides, setSides] = useState<{ a: SideInfo | null; b: SideInfo | null }>({ a: null, b: null });
  const infoA = useCallback((s: SideInfo | null) => setSides((x) => ({ ...x, a: s })), []);
  const infoB = useCallback((s: SideInfo | null) => setSides((x) => ({ ...x, b: s })), []);
  const pa = sides.a?.player ?? null;
  const pb = bSrc ? (sides.b?.player ?? null) : null;
  const readyA = !!sides.a?.ready;
  const readyB = !!bSrc && !!sides.b?.ready;
  const errA = sides.a?.error ?? null;
  const errB = bSrc ? (sides.b?.error ?? null) : null;
  /* 다시 받아도 안 생기는 영상은 고르기에서 막는다 */
  const goneKey = `${errA && (errA.kind === 'missing' || errA.kind === 'gone') ? aPath : ''}|${errB && (errB.kind === 'missing' || errB.kind === 'gone') ? bPath : ''}`;
  const [seenGone, setSeenGone] = useState('');
  if (goneKey !== seenGone) {
    setSeenGone(goneKey);
    const add = goneKey.split('|').filter((x) => !!x && !missing.has(x));
    if (add.length) setMissing(new Set([...missing, ...add]));
  }
  /* 재생기가 알린 사실(장면 수 · 길이 · 크기)을 문서에 — 다음에 열 때도 구간 시간을 셈한다. 슬로모션 여부는 재생기가 몰라 모름 그대로 */
  const factKey = `${doc.active.a}:${sides.a?.duration ?? ''}:${sides.a?.fps ?? ''}:${sides.a?.aspect ?? ''}|${doc.active.b}:${sides.b?.duration ?? ''}:${sides.b?.fps ?? ''}:${sides.b?.aspect ?? ''}`;
  const syncFacts = useEffectEvent(() => {
    let d = docRef.current;
    let changed = false;
    for (const [src, info] of [
      [aSrc, sides.a],
      [bSrc, sides.b],
    ] as const) {
      if (!src || !info?.ready) continue;
      const f = src.facts ?? normalizeFacts(null);
      const next = normalizeFacts({ ...f, durationSec: info.duration ?? f.durationSec, nominalFps: info.fps ?? f.nominalFps, displayAspect: info.aspect ?? f.displayAspect, codec: info.codec ?? f.codec, width: info.width ?? f.width, height: info.height ?? f.height });
      if (JSON.stringify(next) !== JSON.stringify(src.facts)) {
        d = updateSource(d, src.id, { facts: next });
        changed = true;
      }
    }
    if (changed) edit(d);
  });
  useEffect(() => syncFacts(), [factKey]);

  /* ---- 시간 축 ---- */
  const ra = trimmedRange(sides.a?.duration ?? aSrc?.facts?.durationSec ?? null, pair?.trims.a ?? null);
  const rb = trimmedRange(sides.b?.duration ?? bSrc?.facts?.durationSec ?? null, pair?.trims.b ?? null);
  const startBased = semantic === 'start';
  const baseRange: RelRange | null = single ? (ra ? { min: ra.start, max: ra.end } : null) : startBased ? startRange(ra, rb) : offsetRange(marks.a, marks.b, ra, rb);
  const normEvents = aSrc && bSrc ? normalizedAnchors(aSrc.events, bSrc.events) : null;
  const normOk = !!normEvents && buildNormalized(normEvents.a, normEvents.b).ok && !startBased && marks.a != null;
  const normalized = pair?.mode === 'normalized' && normOk && normEvents ? { a: normEvents.a, b: normEvents.b } : null;
  const ma = single ? 0 : startBased ? (ra?.start ?? 0) : marks.a;
  const mb = single ? null : startBased ? (rb?.start ?? 0) : marks.b;
  /* 동작 길이 맞춤은 짚은 첫 장면 ~ 마지막 장면 사이만(F08 — 그 밖은 B 가 끝 장면에 멈춘 채 A 만 가서 비교가 아니다) */
  const range: RelRange | null =
    normalized && baseRange && ma != null ? intersect(baseRange, { min: normalized.a[0] - ma, max: normalized.a[normalized.a.length - 1] - ma }) : baseRange;
  /* 반복 구간은 상대 시각 — 지금 공통 구간과 겹치는 만큼만(뜻이 바뀐 반복은 없음으로) */
  const loopSpan = fitLoop(pair?.loop ?? null, range);
  const loop = loopSpan ? { min: loopSpan.start, max: loopSpan.end } : null;
  const canSync = (stage === 'compare' || single) && readyA && (single || readyB) && !!range && ma != null;
  const transport = useCompareTransport({
    pa,
    pb,
    clock: canSync && range && ma != null ? { ma, mb: single ? null : mb, range, loop, normalized } : null,
    rate,
    enabled: canSync,
    onTimes: setTimes,
  });
  const phase = transport.state.phase;
  const rel = ma != null && range ? Math.min(range.max, Math.max(range.min, times.a - ma)) : 0;
  const quality = syncQuality(transport.driftMs, sides.a?.fps ? 1000 / sides.a.fps : null);

  /* ---- 복원(F02) — 짝이 바뀌면(B 바꿈 · A·B 바꿈 · 차례로 보기) 그 짝의 자리로 다시 ---- */
  const pairKey = pairKeyOf(doc);
  if (restore.key !== pairKey) setRestore({ key: pairKey, target: restoreTargetOf(doc), phase: 'waiting', nonce: restore.nonce + 1 });
  /* 재생기가 다시 준비되면(실패한 영상을 다시 불러옴) 실패한 복원을 한 번 더 */
  const [syncSeen, setSyncSeen] = useState(canSync);
  if (syncSeen !== canSync) {
    setSyncSeen(canSync);
    if (canSync && restore.phase === 'failed') setRestore({ ...restore, phase: 'waiting', nonce: restore.nonce + 1 });
  }
  /* 옮기기를 건 복원 번호(같은 복원을 두 번 걸지 않게) — 끝나면 단계를 done · failed 로(비동기로) */
  const restoreInflight = useRef(-1);
  const runRestore = useEffectEvent(() => {
    if (restore.phase !== 'waiting' || restore.key !== pairKey || !canSync || restoreInflight.current === restore.nonce) return;
    const my = restore.nonce;
    restoreInflight.current = my;
    void transport.seekConfirmed(restore.target).then((ok) => setRestore((r) => (r.nonce === my && r.phase === 'waiting' ? { ...r, phase: ok ? 'done' : 'failed' } : r)));
  });
  useEffect(() => runRestore(), [restore.phase, restore.nonce, canSync, pairKey]);
  /** 사용자가 자리를 정했다 — 기다리던 복원은 버리고 지금부터 자리를 저장한다 */
  const takeControl = () => {
    if (restore.phase !== 'done') setRestore((r) => ({ ...r, phase: 'done', nonce: r.nonce + 1 }));
  };
  const userSeek = (r: number) => {
    takeControl();
    transport.seekRel(r);
  };
  /* 마지막 자리를 문서에(다시 열면 여기서 멈춘 채) — 함께 보기(또는 한 영상)에서 · 복원이 끝난 뒤 · 멈췄을 때만 */
  const restoredHere = restore.phase === 'done' && restore.key === pairKey;
  const relKey = restoredHere && canSync && (phase === 'idle' || phase === 'ended') ? Math.round(rel * 100) : null;
  const keepRel = useEffectEvent(() => {
    if (relKey == null) return;
    const d = docRef.current;
    if (single) {
      const src = sourceOf(d, d.active.a);
      if (src && Math.abs((src.lastTime ?? 0) - rel) >= 0.01) edit(updateSource(d, src.id, { lastTime: rel }));
      return;
    }
    const p = activePair(d);
    if (p && Math.abs(p.rel - rel) >= 0.01) edit(updatePair(d, { rel }));
  });
  useEffect(() => keepRel(), [relKey]);

  /* ---- 단계 오가기 ---- */
  const stopAll = () => {
    transport.pause();
    side.stopAll();
    setExpand(null);
  };
  const restoreSnap = (s: NonNullable<typeof snap>) => {
    let d = setActive(docRef.current, s.a, s.b);
    d = updatePair(d, { anchors: s.marks, rel: s.rel, loop: s.loop, views: s.views });
    edit(d);
    setRestore((r) => ({ key: pairKeyOf(d), target: s.rel, phase: 'waiting', nonce: r.nonce + 1 }));
    setSnap(null);
    setNav(navRestore);
  };
  const snapNow = () => (aSrc && bSrc && pair ? { a: aSrc.id, b: bSrc.id, marks: { ...marks }, rel, loop: pair.loop, views: pair.views } : null);
  const openPick = (slot: PickSlot = 'b', relink: string | null = null) => {
    if (stage === 'compare' || stage === 'align') {
      stopAll();
      if (stage === 'compare') setSnap(snapNow());
    }
    if (!pickOpened) {
      setPickOpened(true);
      startPickUi();
    }
    setPickTarget({ slot, relink });
    setNav(navOpenPick(nav));
  };
  const pickHold = `pick:${initial.id}`;
  /* 고른 것을 문서에 — 같은 규칙(compare/source-pick.ts)으로. 고르는 사이 계정이 바뀌었으면 버린다 */
  const onPicked = (choice: PickChoice) => {
    const r = applyPick(beginPick(docRef.current, pickTarget.slot, { relink: pickTarget.relink ?? undefined }), choice, nowIso(), compareOwner());
    if (!r.ok) {
      releaseHold(pickHold);
      if (choice.kind === 'new' && choice.source.owned) void discardImported([choice.source.path]);
      if (r.reason === 'unchanged') return snap ? restoreSnap(snap) : back();
      return toast(r.reason === 'full' ? '한 비교에 영상은 12개까지 넣을 수 있어요.' : r.reason === 'owner' ? '로그인이 바뀌어 고른 영상을 넣지 않았어요.' : '그 영상을 찾지 못했어요.', 'info');
    }
    const relinkedPath = pickTarget.relink ? (sourceOf(docRef.current, pickTarget.relink)?.path ?? null) : null;
    edit(r.doc);
    /* 넘긴 복사본은 이제 이 화면의 문서가 붙든다 */
    holdPaths(holdKey, r.doc.sources.map((x) => x.path));
    releaseHold(pickHold);
    setSnap(null);
    if (pickTarget.relink) {
      if (relinkedPath) setMissing((m) => new Set([...m].filter((p) => p !== relinkedPath)));
      return setNav(navRestore);
    }
    const p = activePair(r.doc);
    setTimes((t) => ({ a: p?.anchors.a ?? t.a, b: p?.anchors.b ?? 0 }));
    setFocus(p?.anchors.a == null ? 'a' : p.anchors.b == null ? 'b' : focus);
    setNav(navPickNext(nav));
  };
  const onPickCancel = () => {
    releaseHold(pickHold);
    back();
  };
  const realign = () => {
    const s = snapNow();
    stopAll();
    setSnap(s);
    if (marks.a != null) playerCall.seek(pa, marks.a);
    if (marks.b != null) playerCall.seek(pb, marks.b);
    setTimes({ a: marks.a ?? times.a, b: marks.b ?? times.b });
    setFocus('a');
    setNav(navRealign(nav));
  };
  /* 기준이 바뀌면 상대 시각의 뜻이 바뀐다 — 반복 구간은 풀고(조용히 다른 장면을 되풀이하지 않게) 자리는 기준 장면으로 */
  const trimHere = (s: SideKey, edge: 'start' | 'end') => {
    const d = setTrim(docRef.current, s, edge, times[s], infoOf(s)?.duration ?? null);
    if (!d) return toast(edge === 'start' ? '기준 장면보다 뒤에서는 시작할 수 없어요.' : '기준 장면보다 앞에서는 끝낼 수 없어요.', 'info');
    edit(d);
  };
  const setMarks = (m: { a: number | null; b: number | null }, sem: AnchorSemantic = semantic === 'start' ? 'footContact' : semantic) => {
    const p = activePair(docRef.current);
    const moved = !p || p.anchors.a !== m.a || p.anchors.b !== m.b;
    edit(updatePair(docRef.current, moved ? { anchors: m, semantic: sem, loop: null, rel: 0 } : { anchors: m, semantic: sem }));
  };
  const startCompare = () => {
    if (!bothMarked(marks) || !readyA || !readyB || errA || errB) return;
    /* 기준을 안 바꾸고 돌아오면 보던 자리로, 바꿨으면 기준 장면으로 */
    const resume = snap && snap.marks.a === marks.a && snap.marks.b === marks.b ? snap.rel : 0;
    setSnap(null);
    playerCall.seek(pa, marks.a + resume);
    playerCall.seek(pb, marks.b + resume);
    setTimes({ a: marks.a + resume, b: marks.b + resume });
    setRestore((r) => ({ ...r, target: resume, phase: 'waiting', nonce: r.nonce + 1 }));
    setNav(navCompare(nav));
  };
  /* 기준 없이 처음끼리 먼저 보기 — '시작점 기준'으로 분명히 적는다(같은 동작으로 맞춘 것이 아님) */
  const startFromBeginning = () => {
    if (!readyA || !readyB) return;
    edit(updatePair(docRef.current, { semantic: 'start', loop: null, rel: 0 }));
    setSnap(null);
    setRestore((r) => ({ ...r, target: 0, phase: 'waiting', nonce: r.nonce + 1 }));
    playerCall.seek(pa, ra?.start ?? 0);
    playerCall.seek(pb, rb?.start ?? 0);
    setTimes({ a: ra?.start ?? 0, b: rb?.start ?? 0 });
    setNav(navCompare(nav));
  };
  /* 뒤로 — 메모 쓰기(쓴 글은 남김) → 작은 창 → 도구 → 단계 → 나가기 */
  const back = () => {
    /* 도구를 숨겼으면 뒤로는 먼저 도구만 되살린다(IM06) — 다음 뒤로부터 예전 차례 */
    if (chrome.hidden && !noteEdit) return void chromeDo({ type: 'back' });
    if (noteEdit) return closeNoteEditor(true);
    const b = backStep(ui);
    if (b) return setUi(b);
    const r = navBack(nav, !!snap);
    if (r.to === 'restore' && snap) return restoreSnap(snap);
    if (r.to === 'stage') return setNav(r.nav);
    stopAll();
    void saver.flush();
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
  const swipeOk = exitIsBack && navSwipeOk(nav);

  /* ---- 장면 맞추기 ---- */
  const playerOf = (s: SideKey) => (s === 'a' ? pa : pb);
  const infoOf = (s: SideKey) => (s === 'a' ? sides.a : sides.b);
  const srcOf = (s: SideKey) => (s === 'a' ? aSrc : bSrc);
  const stepOf = (s: SideKey) => stepInfo({ nominalFps: infoOf(s)?.fps ?? srcOf(s)?.facts?.nominalFps ?? null, constantRate: srcOf(s)?.facts?.constantRate ?? null });
  const seekSide = (s: SideKey, t: number) => {
    const d = infoOf(s)?.duration ?? null;
    const v = Math.max(0, d != null ? Math.min(d, t) : t);
    playerCall.seek(playerOf(s), v);
    setTimes((x) => ({ ...x, [s]: v }));
  };
  const nudgeSide = (s: SideKey, dir: 1 | -1) => {
    const p = playerOf(s);
    playerCall.pause(p);
    const d = infoOf(s)?.duration ?? null;
    seekSide(s, stepFrom(p ? playerCall.time(p) : times[s], dir, stepOf(s), d ? { start: 0, end: d } : null));
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
    const other: SideKey = focus === 'a' ? 'b' : 'a';
    if (next[other] == null && !infoOf(other)?.error) setFocus(other);
  };
  /* 기준 뜻(앞발 착지 · 릴리스) — 두 영상에 그 장면 표시가 있으면 그것으로 바로(짚은 것을 다시 짚지 않게). 짐작은 하지 않는다 */
  const chooseSemantic = (sem: AnchorSemantic) => {
    const ea = aSrc ? anchorFromEvents(aSrc.events, sem) : null;
    const eb = bSrc ? anchorFromEvents(bSrc.events, sem) : null;
    if (ea != null && eb != null) {
      setMarks({ a: ea, b: eb }, sem);
      seekSide('a', ea);
      seekSide('b', eb);
      toast(`표시해 둔 ${ANCHOR_LABEL[sem]} 장면으로 맞췄어요.`, 'info');
    } else edit(updatePair(docRef.current, { semantic: sem }));
  };

  /* ---- 함께 보기 조작 ---- */
  const nudgeRel = (dir: 1 | -1) => {
    if (!range) return;
    userSeek(rel + dir * stepOf('a').step);
  };
  const togglePlay = () => {
    takeControl();
    side.stop();
    return phase === 'playing' || isBusy(phase) ? transport.pause() : transport.play();
  };
  const setLoopHere = (edge: 'start' | 'end') => {
    if (!range) return;
    const cur = loopSpan ?? { start: range.min, end: range.max };
    const raw = edge === 'start' ? { start: Math.min(rel, cur.end - 0.1), end: cur.end } : { start: cur.start, end: Math.max(rel, cur.start + 0.1) };
    const next = fitLoop(raw, range);
    if (!next) return toast('반복 구간이 너무 짧아요.', 'info');
    edit(updatePair(docRef.current, { loop: next }));
  };

  /* ---- 보기(확대 · 반전 · 겹쳐 보기) ---- */
  const views = pair?.views ?? { a: IDENTITY_VIEW, b: IDENTITY_VIEW, linked: false };
  const [singleView, setSingleView] = useState<ViewTransform>(IDENTITY_VIEW);
  const viewOf = (s: SideKey): ViewTransform => (single ? singleView : s === 'a' ? views.a : views.b);
  /* 확대는 손가락을 따라 장면마다 바뀐다 — 화면 상태로 바로, 문서엔 조금 뒤에 */
  /* 손가락을 따라가는 값은 그 짝에만(F08 — 짝 · A·B 를 바꾸면 옛 짝의 확대가 새 짝을 덮지 않게) */
  const [liveViews, setLiveViews] = useState<{ key: string; a: ViewTransform; b: ViewTransform } | null>(null);
  const setView = (s: SideKey, v: ViewTransform) => {
    if (single) return setSingleView(v);
    const base = liveViews && liveViews.key === pairKey ? liveViews : views;
    const both = views.linked ? { a: { ...v, mirror: base.a.mirror }, b: { ...v, mirror: base.b.mirror } } : { a: s === 'a' ? v : base.a, b: s === 'b' ? v : base.b };
    setLiveViews({ key: pairKey, ...both });
    edit(updatePair(docRef.current, { views: { ...both, linked: views.linked } }));
  };
  const shownView = (s: SideKey) => (liveViews && liveViews.key === pairKey ? liveViews[s] : viewOf(s));
  const overlay = pair?.overlay ?? { on: false, opacity: 0.5, wipe: null, reg: { dx: 0, dy: 0, scale: 1 } };
  /*
   * 몰입 보기(IM03 · IM04 · IM09) — 분할/겹침 · 채움/전체 · 위 영상 · 진하기 · 반반. 짝이면 문서의 present(예전 문서는 overlay 칸에서 옮겨 읽음),
   * 한 영상이면 transport.display. 바꾸면 예전 overlay 칸도 같이 맞춘다(setPresent). 원본 · 기준 · 그림 · 재생 자리는 건드리지 않는다.
   */
  const present: Presentation | null = pair ? presentOf(pair) : null;
  const overlayOn = present?.view === 'overlay';
  const display: DisplayMode = present?.display ?? doc.transport.display ?? 'fill';
  const editPresent = (f: (p: Presentation) => Presentation) => {
    const p = activePair(docRef.current);
    if (p) edit(setPresent(docRef.current, f(presentOf(p))));
  };
  const chooseDisplay = (m: DisplayMode) => {
    if (activePair(docRef.current)) return editPresent((p) => setPresentDisplay(p, m));
    edit({ ...docRef.current, transport: { ...docRef.current.transport, display: m } });
  };
  /* 새 비교는 기준을 맞추고 함께 보기에 들어선 첫 순간 한 번만 겹침(위 B 45%) — 사람이 보기를 고른 뒤 · 예전 문서는 그대로 */
  const autoOverlay = useEffectEvent(() => {
    const d = docRef.current;
    const p = activePair(d);
    if (!p || !sourceOf(d, p.b)) return;
    const cur = presentOf(p);
    const next = onAnchorsReady(cur, true);
    if (next === cur) return;
    edit(setPresent(d, next));
    AccessibilityInfo.announceForAccessibility('겹쳐 보기로 열었어요. B 진하기 45퍼센트');
  });
  useEffect(() => {
    if (stage === 'compare' && bSrc) autoOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, pairKey, !!bSrc]);

  /* ---- 그림 ---- */
  const applyHistory = (h: History) => {
    setHistory(h);
    edit({ ...docRef.current, annotations: h.items });
  };
  const [drawTool, setDrawTool] = useState<DrawTool>('line');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [strokeW, setStrokeW] = useState<number>(WIDTHS[1]);
  const [span, setSpan] = useState<SpanChoice>('scene');
  const [metric, setMetric] = useState<MetricKey | null>(null);
  const [drawSide, setDrawSide] = useState<SideKey>('a');
  const [selId, setSelId] = useState<string | null>(null);
  const drawing = ui.context === 'draw' && (stage === 'compare' || single);
  /* 손가락으로 그리는 동안 — 뒤로 쓸기 손짓을 막는다(화면은 원래 굴리지 않는다) */
  const [stroking, setStroking] = useState(false);
  useEffect(() => {
    if (drawing && phase !== 'idle') transport.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing]);
  const spanFor = (s: SideKey): Annotation['span'] => {
    if (span === 'always') return { kind: 'always' };
    if (span === 'loop' && loop && ma != null) {
      const m = s === 'a' ? ma : (mb ?? ma);
      return { kind: 'range', from: m + loop.min, to: m + loop.max };
    }
    return { kind: 'scene', t: times[s], tol: SCENE_TOL };
  };
  const createAnn = (s: SideKey, g: Geometry) => {
    const src = srcOf(s);
    if (!src) return;
    if (pendingCal.current === s) {
      pendingCal.current = null;
      if (g.kind === 'line' || g.kind === 'arrow') return setSheet({ kind: 'calibrate', side: s, geom: g });
    }
    const a: Annotation = { id: makeId('a'), sourceId: src.id, span: spanFor(s), geom: g, color, width: strokeW, metric, createdAt: nowIso() };
    applyHistory(applyEdit(history, { op: 'add', a }));
    setSelId(a.id);
  };
  const pendingCal = useRef<SideKey | null>(null);
  const paneDraw = (s: SideKey): PaneDraw | null => {
    const src = srcOf(s);
    if (!src) return null;
    const on = drawing && (single || drawSide === s);
    return {
      drawing: on,
      tool: drawTool,
      color,
      width: strokeW,
      selectedId: selId,
      items: visibleList(history.items, src.id, times[s]),
      calibration: src.calibration,
      onCreate: (g) => createAnn(s, g),
      onMove: (id, g) => applyHistory(applyEdit(history, { op: 'update', id, patch: { geom: g } })),
      onSelect: setSelId,
      onNeedText: (p) => setSheet({ kind: 'label', side: s, p }),
      onStroke: setStroking,
    };
  };
  const selectedAnn = history.items.find((x) => x.id === selId) ?? null;

  /* ---- 투구 장면 ---- */
  const [eventSide, setEventSide] = useState<SideKey>('a');
  const markEvent = (e: PitchEvent, v: number | 'obscured' | null) => {
    const src = srcOf(single ? 'a' : eventSide);
    if (!src) return;
    const events = { ...src.events };
    if (v == null) delete events[e];
    else events[e] = v;
    edit(updateSource(docRef.current, src.id, { events }));
    void Haptics.selectionAsync();
  };
  const jumpEvent = (e: PitchEvent) => {
    if (!aSrc) return;
    const ta = timeOf(aSrc.events, e);
    if (ta == null || ma == null) return;
    userSeek(ta - ma);
    const tb = bSrc ? timeOf(bSrc.events, e) : null;
    if (tb != null && mb != null && !normalized) {
      const off = tb - mb - (ta - ma);
      if (Math.abs(off) > 0.005) AccessibilityInfo.announceForAccessibility(`B 의 ${EVENT_SHORT[e]}은 이 자리보다 ${off > 0 ? '뒤' : '앞'} ${Math.abs(off).toFixed(2)}초`);
    }
  };
  const anchorAt = (e: PitchEvent) => {
    if (!aSrc || !bSrc) return;
    const ta = timeOf(aSrc.events, e);
    const tb = timeOf(bSrc.events, e);
    if (ta == null || tb == null) return;
    setMarks({ a: ta, b: tb }, e === 'footContact' || e === 'release' ? e : 'manual');
    userSeek(0);
  };
  const metricRows = useMemo(() => {
    const keys = [...new Set(history.items.map((x) => x.metric).filter((m): m is MetricKey => !!m))];
    const last = (srcId: string | undefined, m: MetricKey) => (srcId ? ([...history.items].reverse().find((x) => x.sourceId === srcId && x.metric === m) ?? null) : null);
    return keys.map((m) => ({ metric: m, a: last(aSrc?.id, m), b: last(bSrc?.id, m), aspectA: sides.a?.aspect ?? aSrc?.facts?.displayAspect ?? 1, aspectB: sides.b?.aspect ?? bSrc?.facts?.displayAspect ?? 1 }));
  }, [history.items, aSrc, bSrc, sides.a?.aspect, sides.b?.aspect]);

  /* ---- 메모 ---- */
  const noteSide = single ? 'a' : focus;
  const pairNotes = doc.notes.filter((n) => n.sourceId == null || n.sourceId === aSrc?.id || n.sourceId === bSrc?.id);
  const noteLabel = (n: NoteRef) => {
    const s = n.sourceId === aSrc?.id ? 'A' : n.sourceId === bSrc?.id ? 'B' : '';
    return [s, n.t != null ? clock(n.t) : null].filter(Boolean).join(' ') || '메모';
  };
  const openNote = (n: NoteRef) => {
    if (n.t == null) return;
    const s: SideKey = n.sourceId === bSrc?.id ? 'b' : 'a';
    if (stage === 'compare' && ma != null) userSeek(s === 'a' ? n.t - ma : n.t - (mb ?? 0));
    else seekSide(s, n.t);
  };

  /* ---- 더보기 ---- */
  const more = () => {
    const actions: { label: string; run: () => void; destructive?: boolean }[] = [
      { label: '이름 바꾸기', run: () => setSheet({ kind: 'title' }) },
      {
        label: '이 비교 사본 만들기',
        run: () => {
          const st = compareStorage();
          if (!st || !docRef.current.ownerId) return toast('로그인을 확인한 뒤에 만들 수 있어요.', 'info');
          /* 사본은 영상을 '같이 쓴다'(owned 꺼짐) — 원본을 지워도 사본이 쓰는 영상은 남는다(F01) */
          void st.save(duplicate(docRef.current, nowIso())).then((r) => {
            void refreshRecent();
            toast(r.ok ? '사본을 만들었어요. 최근 비교에서 열 수 있어요.' : '사본을 만들지 못했어요.', r.ok ? 'success' : 'error');
          });
        },
      },
      { label: 'A 영상 정보', run: () => openInfo('a') },
    ];
    actions.push({ label: 'A 영상 바꾸기', run: () => openPick('a') });
    if (bSrc) {
      actions.push({ label: 'B 영상 바꾸기', run: () => openPick('b') });
      actions.push({ label: 'B 영상 정보', run: () => openInfo('b') });
      actions.push({
        label: 'A · B 바꾸기',
        run: () => {
          stopAll();
          const d = swapActive(docRef.current);
          edit(d);
          const p = activePair(d);
          setTimes({ a: p?.anchors.a ?? 0, b: p?.anchors.b ?? 0 });
        },
      });
    }
    actions.push({
      label: '같은 영상을 B 로 한 번 더',
      run: () => {
        if (!aSrc) return;
        const r = addSource(docRef.current, { path: aSrc.path, origin: aSrc.origin, owned: false, label: aSrc.label, date: aSrc.date, facts: aSrc.facts }, nowIso());
        if (!r) return toast('한 비교에 영상은 12개까지 넣을 수 있어요.', 'info');
        stopAll();
        edit(setActive(r.doc, docRef.current.active.a, r.id));
        setNav(navRealign(navStart(true)));
      },
    });
    const others = doc.sources.filter((s) => s.id !== doc.active.a);
    if (others.length >= 2 && !doc.reviewSet) actions.push({ label: '이 비교의 영상들 차례로 보기', run: () => edit(startReview(docRef.current, docRef.current.active.a, others.map((s) => s.id))) });
    if (doc.reviewSet) actions.push({ label: '차례로 보기 끝내기', run: () => edit({ ...docRef.current, reviewSet: null }) });
    if (!single)
      actions.push({
        label: views.linked ? '확대 따로 하기' : '두 영상 확대 같이 하기',
        run: () => edit(updatePair(docRef.current, { views: { ...views, linked: !views.linked } })),
      });
    actions.push({ label: display === 'fill' ? '전체 보기 · 영상 전체' : '채워 보기 · 칸을 다 채움', run: () => chooseDisplay(display === 'fill' ? 'full' : 'fill') });
    actions.push({ label: `${single ? '' : `${focus.toUpperCase()} `}좌우 반전 ${viewOf(single ? 'a' : focus).mirror ? '끄기' : '켜기'}`, run: () => setView(single ? 'a' : focus, { ...viewOf(single ? 'a' : focus), mirror: !viewOf(single ? 'a' : focus).mirror }) });
    if (doc.revision > 0 || save === 'saved')
      actions.push({
        label: '이 비교 지우기',
        destructive: true,
        run: () =>
          Alert.alert('이 비교를 지울까요?', '기준 · 그림 · 메모가 지워져요. 원본 영상(사진 앱 · 기록)은 그대로예요.', [
            { text: '취소', style: 'cancel' },
            {
              text: '지우기',
              style: 'destructive',
              onPress: () => {
                saver.stop();
                everSaved.current = true; /* 지우기가 복사본을 정리한다 — 닫을 때 한 번 더 정리하지 않게 */
                releaseHold(holdKey);
                void deleteComparison(docRef.current.id).then(() => onExit());
              },
            },
          ]),
      });
    const options = [...actions.map((a) => a.label), '취소'];
    const destructiveButtonIndex = actions.findIndex((a) => a.destructive);
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: destructiveButtonIndex >= 0 ? destructiveButtonIndex : undefined }, (i) => actions[i]?.run());
  };

  /* ---- 한 화면 배치(UI01~UI04 — 화면은 굴리지 않는다. 남는 자리를 재서 영상에) ---- */
  /* 글자 크기 — 이 기능의 핵심 글자는 기기 설정을 2배까지 그대로 따른다(SS07). 높이 · 폭 어림도 같은 배율 */
  const fsC = fsOf(fontScale);
  const [rootSize, setRootSize] = useState<{ w: number; h: number }>({ w: winW, h: winH });
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);
  /* 안전 영역을 뺀 폭 — 도구 줄 · 오른쪽 칸은 이 폭으로 셈한다 */
  const contentW = Math.max(0, rootSize.w - inset.left - inset.right);
  const landscape = sideDock(contentW, rootSize.h);
  const sideW = landscape ? Math.round(Math.min(240, Math.max(176, contentW * 0.3))) : 0;
  /* 둘 다 · A 크게 · B 크게 — 살펴보는 동안만(문서엔 안 남김). 기본 비교는 늘 둘 다 보인다 */
  const [focusMode, setFocusMode] = useState<'pair' | 'focusA' | 'focusB'>('pair');
  const aspA = sides.a?.aspect ?? aSrc?.facts?.displayAspect ?? null;
  const aspB = sides.b?.aspect ?? bSrc?.facts?.displayAspect ?? null;
  const drawingNow = ui.context === 'draw';
  /* 그리는 동안은 겹침을 잠깐 나눠 보인다(그림은 한 영상 위에) — 끝나면 겹침으로 돌아간다 */
  const stageView: StageView = single ? 'single' : overlayOn && stage === 'compare' && !drawingNow ? 'overlay' : stage === 'align' ? 'pair' : focusMode;
  const [autoShape, setAutoShape] = useState<SplitShape | null>(null);
  /* 칸(IM03) — 무대를 빈틈없이 나누고(구분선 1pt), 칸 안 영상은 채움/전체(위 붙임). 예전처럼 칸 = 영상 맞춤 사각형 · 아래 붙임이 아니다 */
  const plan = stageSize ? planImmersive({ stage: stageSize, view: stageView, hasB: !!bSrc, aspectA: aspA, aspectB: bSrc ? aspB : null, mode: display, pref: doc.transport.layout, prev: autoShape }) : null;
  if (plan && doc.transport.layout === 'auto' && stageView === 'pair' && plan.shape !== autoShape) setAutoShape(plan.shape);
  const shape: SplitShape = plan?.shape ?? 'stack';
  /* 겹침(IM04 · IM05) — 두 칸이 같은 자리. 위 영상도 아래 영상의 확대 · 이동 · 손 맞춤을 받는 변환 하나(overlayTopMap) */
  const slotA = plan?.slots.a ?? null;
  const overlayMaps =
    stageView === 'overlay' && slotA && present
      ? {
          a: layerMap(slotA, aspA, shownView('a'), display),
          b: overlayTopMap(slotA, { aspect: aspA, view: shownView('a') }, { aspect: aspB, mirror: shownView('b').mirror }, overlay.reg, display),
        }
      : null;
  const opac = present ? layerOpacity(present) : { a: 1, b: 1 };
  const layerOf = (s: SideKey) =>
    overlayMaps && present
      ? { map: overlayMaps[s], opacity: opac[s], clipLeft: present.top === s ? present.wipe : null, role: present.top === s ? ('top' as const) : ('base' as const) }
      : null;

  const labelOf = (s: SideKey) => {
    const src = srcOf(s);
    const item = itemOf(src?.path ?? null);
    return item ? videoDateText(item.date) : (src?.label ?? (src?.date ? videoDateText(src.date) : src?.origin === 'photos' ? '사진 앱에서 가져온 영상' : src?.origin === 'camera' ? '앱에서 찍은 영상' : '영상'));
  };
  const subOf = (s: SideKey) => {
    const src = srcOf(s);
    const item = itemOf(src?.path ?? null);
    const log = item?.logs[0];
    const clip = item?.clip;
    const facts = [log ? `${log.type} ${log.count}구 · 투구 기록` : null, clip ? `구속 측정 ${clip.kmh.toFixed(1)}km/h · 카메라 측정` : null].filter(Boolean).join(' · ');
    return facts || (item ? (item.note ?? videoCaption(item)) : src?.origin === 'photos' ? '사진 앱에서 가져옴' : src?.origin === 'camera' ? '앱에서 촬영' : null);
  };
  const anchorShort = (sem: AnchorSemantic) => (sem === 'footContact' ? '착지' : sem === 'release' ? '릴리스' : sem === 'start' ? '시작점' : '직접');
  const badgeOf = (s: SideKey): PaneBadge => {
    if (single) return { anchor: null, marked: false, title: labelOf(s) };
    if (startBased) return { anchor: '시작점 기준', marked: true, title: labelOf(s) };
    const m = marks[s];
    return { anchor: m != null ? `${anchorShort(semantic)} ${clock(m)}` : `${anchorShort(semantic)} 지정 전`, marked: m != null, title: labelOf(s) };
  };

  /* ---- 재생 대상(함께 · A · B — SS06: 재생 · 한 장면 · 옮기기 모두 같은 대상) ---- */
  const aligning = stage === 'align' && !single;
  const [target, setTarget] = useState<PlayTarget>('both');
  const allowed = targetsFor({ single, aligning, aErr: !!errA, bErr: !!errB });
  const tgt: PlayTarget = aligning ? focus : fixTarget(target, allowed);
  const sideT: SideKey | null = single ? null : tgt === 'both' ? null : tgt;
  /* A 만 · B 만 재생 — 맞추기 · 비교 모두. 뒤로 감 · 떠남 · 닫힘 · 영상 바뀜 · 오류에 두 재생기를 멈춘다(SS05, compare/ui/side-playback.ts) */
  const side = useSidePlayback({ pa, pb, rate, onTime: (s, t) => setTimes((x) => (Math.abs(x[s] - t) < 1e-4 ? x : { ...x, [s]: t })) });
  const stopSide = () => side.stop();
  /** 따로 옮기던 쪽(ref)의 자리를 함께 보기의 상대 자리로 — A 는 A − 기준, B 는 B − 기준(동작 길이 맞춤이면 늘인 축으로 되돌려 A 자리) */
  const relFrom = (ref: SideKey): number | null => {
    if (ma == null || !range) return null;
    if (ref === 'a' || mb == null) return times.a - ma;
    if (normalized) {
      const m = buildNormalized(normalized.a, normalized.b);
      if (!m.ok) return times.a - ma;
      return normalizedTimes(m.map, normalizedOfB(m.map, times.b)).a - ma;
    }
    return times.b - mb;
  };
  const chooseTarget = (t: PlayTarget) => {
    stopSide();
    if (aligning) {
      if (t !== 'both') setFocus(t);
      return;
    }
    if (t === tgt) return;
    transport.pause();
    takeControl();
    if (t === 'both') {
      const ref = sideT;
      setTarget('both');
      /* 따로 옮긴 쪽을 기준으로 다른 쪽을 다시 붙인다 — 기준 장면은 그대로 */
      const r = ref ? relFrom(ref) : rel;
      if (range && r != null) userSeek(Math.min(range.max, Math.max(range.min, r)));
      const msg = ref ? `함께 — ${ref.toUpperCase()} 자리에 맞췄어요.` : '함께 — 두 영상을 같은 자리로 맞췄어요.';
      AccessibilityInfo.announceForAccessibility(msg);
      if (ref) toast(msg, 'info');
      return;
    }
    setTarget(t);
    setFocus(t);
    setEventSide(t);
    setDrawSide(t);
    AccessibilityInfo.announceForAccessibility(`${t.toUpperCase()} 만 따로 재생 · 옮겨요. 기준은 바뀌지 않아요.`);
  };
  const stepPress = (dir: 1 | -1) => {
    if (sideT) {
      stopSide();
      transport.pause();
      return nudgeSide(sideT, dir);
    }
    nudgeRel(dir);
  };
  const playPress = () => {
    if (sideT) {
      /* 고른 쪽만 — 함께로 바꾸지 않는다 */
      transport.pause();
      if (!aligning) takeControl();
      return side.toggle(sideT);
    }
    togglePlay();
  };
  const sideDur = sideT ? (infoOf(sideT)?.duration ?? srcOf(sideT)?.facts?.durationSec ?? null) : null;
  const sideReady = sideT ? !!infoOf(sideT)?.ready : false;
  const sidePlaying = !!sideT && side.playing === sideT;
  const playOk = sideT ? sideReady : canSync;
  const playing = sideT ? sidePlaying : phase === 'playing';
  const playLabel = phaseLabel(phase);
  const playText = sideT ? `${sideT.toUpperCase()} ${sidePlaying ? '멈춤' : '재생'}` : single ? (phase === 'playing' ? '멈춤' : '재생') : playLabel;

  const paneProps = (s: SideKey) => ({
    side: s,
    path: s === 'a' ? aPath : (bPath ?? ''),
    rate,
    time: times[s],
    badge: badgeOf(s),
    aligning,
    focused: (aligning || ui.context !== 'view' || !!sideT) && !single && focus === s,
    muted: doc.transport.audio !== s,
    view: shownView(s),
    onView: (v: ViewTransform) => setView(s, v),
    draw: paneDraw(s),
    display,
    layer: layerOf(s),
    overlayTop: headerH,
    onFocus: () => {
      /* 도구를 숨긴 동안 영상을 일부러 누르면 도구를 되살린다(재생 · 고른 칸은 그대로) */
      if (chrome.hidden) return void chromeDo({ type: 'tapVideo', gesture: { pointers: 1, dx: 0, dy: 0, ms: 0, drawing: false, scrubbing: false } });
      setFocus(s);
      setEventSide(s);
      setDrawSide(s);
      if (!aligning && sideT && sideT !== s) {
        stopSide();
        setTarget(s);
      }
    },
    onInfo: s === 'a' ? infoA : infoB,
    onExpand: () => setExpand(s),
    onExit: back,
  });

  /* ---- 타임라인 ---- */
  const markersOf = (s: SideKey, off: number): TimelineMarker[] => {
    const src = srcOf(s);
    const out: TimelineMarker[] = [];
    if (src)
      for (const e of PITCH_EVENTS) {
        const t = timeOf(src.events, e);
        if (t != null) out.push({ key: `${s}:${e}`, t: t - off, label: `${s.toUpperCase()} ${EVENT_SHORT[e]}`, kind: 'event' });
      }
    if (!single && !startBased && marks[s] != null) out.push({ key: `${s}:anchor`, t: (marks[s] as number) - off, label: `${s.toUpperCase()} 기준`, kind: 'anchor' });
    return out;
  };
  const [loopEdit, setLoopEdit] = useState(false);
  const [handle, setHandle] = useState<'start' | 'end' | null>(null);
  const setLoopEdge = (edge: 'start' | 'end', t: number) => {
    if (!range) return;
    const cur = loopSpan ?? { start: range.min, end: range.max };
    const raw = edge === 'start' ? { start: Math.min(t, cur.end - 0.1), end: cur.end } : { start: cur.start, end: Math.max(t, cur.start + 0.1) };
    const next = fitLoop(raw, range);
    if (next) edit(updatePair(docRef.current, { loop: next }));
  };
  const nudgeHandle = (dir: 1 | -1) => {
    if (!loopSpan || !handle) return;
    const step = stepOf('a').step;
    setLoopEdge(handle, (handle === 'start' ? loopSpan.start : loopSpan.end) + dir * step);
  };
  const [cluster, setCluster] = useState<TimelineMarker[]>([]);
  const jumpMarker = (m: TimelineMarker) => {
    setUi((u) => closeInspector(u));
    if (sideT) return seekSide(sideT, m.t);
    userSeek(m.t);
  };
  const tl = sideT
    ? {
        value: times[sideT],
        min: 0,
        max: sideDur ?? 1,
        disabled: !sideReady,
        step: stepOf(sideT).step,
        label: `${sideT.toUpperCase()} 영상 장면`,
        valueText: clock(times[sideT]),
        left: '0:00',
        right: clock(sideDur),
        markers: markersOf(sideT, 0),
      }
    : {
        value: rel,
        min: range?.min ?? 0,
        max: range?.max ?? 1,
        disabled: !canSync,
        step: stepOf('a').step,
        label: single ? '영상 위치' : startBased ? '처음부터 함께 재생할 위치' : '기준 장면부터 함께 재생할 위치',
        valueText: single ? clock(rel) : relText(rel),
        left: range ? (single ? clock(range.min) : relText(range.min)) : '—',
        right: range ? (single ? clock(range.max) : relText(range.max)) : '—',
        markers: markersOf('a', ma ?? 0),
      };

  /* ---- 도구(한 번에 하나 · 작은 창 하나) ---- */
  const toggle = (name: InspectorName) => setUi((u) => toggleInspector(u, name));
  const enterContext = (ctx: ToolContext) => {
    stopSide();
    if (ctx !== 'view') transport.pause();
    setUi((u) => openContext(u, ctx));
  };
  const [curEvent, setCurEvent] = useState<PitchEvent>('footContact');
  const evSide: SideKey = single ? 'a' : eventSide;
  const evVal = srcOf(evSide)?.events[curEvent];
  const evStatus = (v: number | 'obscured' | undefined) => (v == null ? '안 짚음' : v === 'obscured' ? '가려짐' : clock(v));
  const goEvent = () => {
    const src = srcOf(evSide);
    const t = src ? timeOf(src.events, curEvent) : null;
    if (t == null) return;
    if (sideT || aligning) return seekSide(evSide, t);
    if (evSide === 'a') return jumpEvent(curEvent);
    if (mb != null && !normalized) return userSeek(t - mb);
    seekSide('b', t);
  };
  const stepEvent = (dir: 1 | -1) => {
    const i = PITCH_EVENTS.indexOf(curEvent);
    setCurEvent(PITCH_EVENTS[(i + dir + PITCH_EVENTS.length) % PITCH_EVENTS.length]);
  };
  const [infoSide, setInfoSide] = useState<SideKey>('a');
  const openInfo = (s: SideKey) => {
    setInfoSide(s);
    setUi((u) => ({ ...u, inspector: 'info' }));
  };
  const [compareStart, setCompareStart] = useState<string | null>(null);

  /* ---- 메모 쓰기(UI08 · SS03 · SS04) — 재생 · 도구 줄 자리를 잠시 편집 줄로. 쓰던 글은 닫아도 이 기기에 남는다 ---- */
  /* 초안: 이 계정 폴더의 초안 저장소(앱을 다시 켜도 남음, compare/note-drafts.ts). 로그인 확인 전이면 이 화면 메모리에만 */
  const draftStore = () => {
    const st = compareDrafts();
    return st && st.ownerId === docRef.current.ownerId && compareOwner() === st.ownerId ? st : null;
  };
  const memDrafts = useRef(new Map<string, { text: string; caret: number }>());
  const [draftRev, setDraftRev] = useState(0);
  const bumpDrafts = () => setDraftRev((n) => n + 1);
  useEffect(() => {
    const st = compareDrafts();
    if (!st) return;
    void st.load().then(() => setDraftRev((n) => n + 1));
    return st.subscribe(() => setDraftRev((n) => n + 1));
  }, [owner]);
  const draftList = useMemo(() => (draftStore()?.list(doc.id) ?? []).filter((d) => d.sourceId == null || d.sourceId === aSrc?.id || d.sourceId === bSrc?.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftRev, doc.id, aSrc?.id, bSrc?.id, owner]);
  type NoteEdit = { key: string; edit: NoteRef | null; side: SideKey; t: number; sourceId: string | null };
  const [noteEdit, setNoteEdit] = useState<NoteEdit | null>(null);
  const draftOf = (key: string) => memDrafts.current.get(key) ?? (() => {
    const d = draftStore()?.get(key);
    return d ? { text: d.text, caret: d.caret } : null;
  })();
  const openNoteEditor = (n: NoteRef | null) => {
    stopSide();
    transport.pause();
    const sd: SideKey = n ? (n.sourceId === bSrc?.id ? 'b' : 'a') : noteSide;
    const t = n ? (n.t ?? 0) : times[noteSide];
    const sourceId = n ? (n.sourceId ?? null) : (srcOf(sd)?.id ?? null);
    setUi((u) => closeInspector(u));
    setNoteEdit({ key: draftKey(doc.id, { noteId: n?.id ?? null, sourceId, t }), edit: n, side: sd, t, sourceId });
  };
  /** 남은 초안을 열어 이어 쓰기 — 그 메모(고치던 것) 또는 그 영상 · 시각의 새 메모로 */
  const resumeDraft = (key: string) => {
    const d = draftStore()?.get(key);
    if (!d) return;
    const n = d.noteId ? (doc.notes.find((x) => x.id === d.noteId) ?? null) : null;
    stopSide();
    transport.pause();
    setUi((u) => closeInspector(u));
    setNoteEdit({ key, edit: n, side: d.sourceId === bSrc?.id ? 'b' : 'a', t: d.t ?? 0, sourceId: d.sourceId });
  };
  const closeNoteEditor = (keep: boolean) => {
    if (noteEdit && !keep) {
      memDrafts.current.delete(noteEdit.key);
      draftStore()?.remove(noteEdit.key);
      bumpDrafts();
    } else if (noteEdit && draftOf(noteEdit.key)?.text.trim()) toast('쓰던 메모는 이 기기에 남겨 뒀어요. 메모 목록에서 이어 써요.', 'info');
    setNoteEdit(null);
    Keyboard.dismiss();
  };
  const onDraft = (text: string, caret: number) => {
    if (!noteEdit) return;
    memDrafts.current.set(noteEdit.key, { text, caret });
    draftStore()?.set({ key: noteEdit.key, docId: doc.id, sourceId: noteEdit.sourceId, t: noteEdit.t, noteId: noteEdit.edit?.id ?? null, text, caret, at: nowIso() });
  };
  /* 자판 — 위 · 아래 · 크기 바뀜(예측 줄 · 회전)을 모두 받아 '자판 윗변'만 쥔다. 겹치는 높이는 화면 아래 끝과 견줘 한 번만 뺀다 */
  const [kbTop, setKbTop] = useState<number | null>(null);
  useEffect(() => {
    const on = (e: { endCoordinates: { screenY: number; height: number } }) => setKbTop(e.endCoordinates.height > 0 ? e.endCoordinates.screenY : null);
    const subs = [
      Keyboard.addListener('keyboardWillShow', on),
      Keyboard.addListener('keyboardWillChangeFrame', on),
      Keyboard.addListener('keyboardDidChangeFrame', on),
      Keyboard.addListener('keyboardWillHide', () => setKbTop(null)),
      Keyboard.addListener('keyboardDidHide', () => setKbTop(null)),
    ];
    return () => subs.forEach((x) => x.remove());
  }, []);
  const [rootY, setRootY] = useState(0);
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  /* 가로 폰 오른쪽 칸의 실제 높이(작은 창을 거기 띄울 때) */
  const [sideH, setSideH] = useState<number | null>(null);

  /* ---- 도구 숨김(IM06 · IM07) — 같은 화면 · 같은 재생기. 재생 · 자리 · 고른 칸은 그대로, 숨김은 저장하지 않는다 ---- */
  const [chrome, setChrome] = useState<ChromeState>(CHROME_SHOWN);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled?.().then(setReduceMotion, () => undefined);
  }, []);
  /* 메모 · 창이 열리면 도구를 먼저 되살린다(보이지 않는 조작면을 두지 않는다) */
  if (chrome.hidden && (noteEdit || ui.inspector)) setChrome(CHROME_SHOWN);
  const chromeDo = (e: ChromeEvent): boolean => {
    const r = chromeReduce(chrome, e, { editing: !!noteEdit, inspector: !!ui.inspector, manipulating: stroking });
    if (r.state.hidden !== chrome.hidden) {
      const ms = chromeTransitionMs(reduceMotion);
      if (ms > 0) LayoutAnimation?.configureNext?.(LayoutAnimation.create(ms, 'easeInEaseOut', 'opacity'));
      setChrome(r.state);
    }
    for (const fx of r.effects) if (fx.kind === 'announce') AccessibilityInfo.announceForAccessibility(fx.text);
    if (r.blocked) toast(r.blocked === 'inspector' ? '열린 창을 닫은 뒤 숨길 수 있어요.' : r.blocked === 'editing' ? '메모를 다 쓴 뒤 숨길 수 있어요.' : '그리기를 마친 뒤 숨길 수 있어요.', 'info');
    return r.handled;
  };
  const chromeText = chromeA11y(chrome);
  const toolsHidden = chrome.hidden && !noteEdit && !ui.inspector;
  /* 영상 위에 뜨는 머리(IM02) — 영상 바탕은 화면 맨 위부터, 조작은 안전 영역 안. 칸 위 표시는 이 높이 밑으로 */
  const headerH = noteEdit ? 0 : toolsHidden ? inset.top : inset.top + 44;
  /* 앱이 앞으로 돌아오면 — 뒤로 가느라 끊긴 복원은 다시(멈춘 채 같은 자리로). 저절로 재생하지 않는다 */
  const onActive = useEffectEvent(() => {
    if (restore.phase === 'failed' && canSync) setRestore((r) => ({ ...r, phase: 'waiting', nonce: r.nonce + 1 }));
  });
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') onActive();
      else void compareDrafts()?.flush();
    });
    return () => sub.remove();
  }, []);

  if (stage === 'pick') {
    return (
      <>
        <Stack.Screen options={{ gestureEnabled: swipeOk }} />
        <SourcePicker
          doc={doc}
          slot={pickTarget.slot}
          relink={pickTarget.relink}
          missing={missing}
          itemOf={itemOf}
          labelOf={(id) => {
            const x = sourceOf(doc, id);
            const it = itemOf(x?.path ?? null);
            return it ? videoDateText(it.date) : (x?.label ?? (x?.date ? videoDateText(x.date) : x?.origin === 'photos' ? '사진 앱에서 가져온 영상' : x?.origin === 'camera' ? '앱에서 찍은 영상' : '영상'));
          }}
          holdKey={pickHold}
          onPick={onPicked}
          onCancel={onPickCancel}
        />
      </>
    );
  }

  const bothReady = readyA && readyB;
  const canStart = bothMarked(marks) && bothReady && !errA && !errB;
  const F = focus.toUpperCase();
  const expandPlayer = expand === 'a' ? pa : expand === 'b' ? pb : null;
  const review = doc.reviewSet;
  const syncLabel = single
    ? null
    : startBased
      ? '시작점 기준 · 같은 동작으로 맞추지 않았어요'
      : normalized
        ? '동작 길이 맞춤 · 실제 시간과 다름'
        : `${ANCHOR_LABEL[semantic]} 기준${quality.state === 'measuring' ? '' : quality.state === 'close' ? ' · 대략 맞음' : ' · 대략 맞춤'}`;
  /* 맞춤 정도의 자세한 말 — 재생기 시간 알림으로 어림한 값이다(화면에 실제 보인 장면끼리 잰 것이 아니다). 최대가 아니라 95% */
  const syncDetail =
    single || startBased || normalized || quality.state === 'measuring' || quality.p95 == null
      ? null
      : `재생기 시간 알림으로 어림하면 어긋남의 95%가 ${Math.round(quality.p95)}ms 안이에요. 실제 화면에 보인 장면끼리 잰 값은 아니에요.`;
  const plan2 = exportPlanFor(range, loop, ma, mb, rate, overlayOn ? 'overlay' : shape === 'side' ? 'side' : 'stack', { normalized: !!normalized, approx: quality.state === 'approx', start: startBased });
  const storyRows = PITCH_EVENTS.map((e) => ({ event: e, a: aSrc ? timeOf(aSrc.events, e) : null, b: bSrc ? timeOf(bSrc.events, e) : null })).filter((r) => r.a != null || r.b != null);
  const saveFailed = save === 'failed' || save === 'conflict';
  const saveText = !doc.ownerId ? '로그인 확인 중 · 아직 저장 안 됨' : save === 'idle' ? (worthSaving(doc) ? '저장 기다림' : '저장할 것 없음') : SAVE_LABEL[save];

  /* ---- 작은 창 줄들(SS02 — 단추 하나 · 글 조각 하나 단위로 쪽에 담는다. 가로 폰은 오른쪽 도구 칸 자리에 띄워 영상을 가리지 않는다) ---- */
  const fs = fsC;
  const inspSide = landscape;
  const inspOuterW = Math.max(160, inspSide ? sideW - 12 : (stageSize?.w ?? rootSize.w) - 12);
  const inspW = Math.max(120, inspOuterW - 20);
  const stageH = stageSize?.h ?? 300;
  const sideAvail = Math.max(120, (sideH ?? rootSize.h - inset.top - inset.bottom - ctlH(fs)) - 8);
  /* 영상 가림 한도 안에서 이 창이 받을 수 있는 가장 큰 본문(장면 모음 그림 크기를 고를 때) */
  const bodyCap = inspSide ? sideAvail - inspChrome(fs).head - inspChrome(fs).pad : inspectorBudget({ stageH, fs, needBody: 1e6 }).bodyH;
  const bodyThird = inspSide ? bodyCap : inspectorBudget({ stageH, fs, needBody: 0 }).bodyH;
  const segOf = (key: string, labels: string[], node: ReactNode) => segRowOf(key, labels, inspW, fs, node, bodyCap);
  const btn = (key: string, label: string, node: ReactNode): IItem => btnItem(key, label, fs, node);
  const icon = (key: string, node: ReactNode): IItem => iconItem(key, node);
  const rowsFor = (name: InspectorName): { title: string; rows: IRow[] } => {
    switch (name) {
      case 'compareSet': {
        const rows: IRow[] = [headRow('h1', '기준 · 시간', fs)];
        if (syncLabel) rows.push(subRow('sync', syncLabel, inspW, fs, quality.state === 'approx'));
        if (syncDetail) rows.push(subRow('detail', syncDetail, inspW, fs));
        rows.push(
          flowRow('base', [
            btn('home', '맞춘 장면으로', <TextBtn label="맞춘 장면으로" disabled={!canSync} onPress={() => userSeek(0)} />),
            btn('again', '장면 다시 맞추기', <TextBtn label="장면 다시 맞추기" onPress={() => (setUi(INITIAL_UI), realign())} />),
          ])
        );
        const modeLabels = ['실제 시간', '동작 길이 맞춤'];
        rows.push(
          segOf(
            'mode',
            modeLabels,
            <Seg
              label="시간 맞춤 방식"
              maxW={inspW} maxH={bodyCap}
              value={normalized ? 'normalized' : 'offset'}
              onChange={(v) => edit(updatePair(docRef.current, { mode: v }))}
              options={[
                { value: 'offset', label: modeLabels[0] },
                { value: 'normalized', label: modeLabels[1], disabled: !normOk, a11y: normOk ? '동작 길이 맞춤, 짚은 투구 장면들이 같은 자리에 오게 늘이고 줄여요' : '동작 길이 맞춤, 두 영상에 같은 투구 장면을 둘 이상 짚어야 해요' },
              ]}
            />
          )
        );
        rows.push(
          subRow(
            'norm',
            normalized ? '동작 길이 맞춤 · 실제 시간과 달라요. 짚은 첫 장면부터 마지막 장면까지만 재생하고, 걸린 시간 · 속도는 견주지 않아요.' : '두 영상이 함께 재생되는 구간만 보여요. A 를 주인 시계로 B 를 따라 맞춰요.',
            inspW,
            fs
          )
        );
        rows.push(headRow('h2', '반복 구간', fs));
        rows.push(
          flowRow('loop', [
            btn('ls', '여기서 시작', <TextBtn label="여기서 시작" disabled={!canSync || !!sideT} onPress={() => setLoopHere('start')} />),
            btn('le', '여기서 끝', <TextBtn label="여기서 끝" disabled={!canSync || !!sideT} onPress={() => setLoopHere('end')} />),
            ...(loop ? [btn('lx', '반복 풀기', <TextBtn label="반복 풀기" onPress={() => (setLoopEdit(false), setHandle(null), edit(updatePair(docRef.current, { loop: null })))} />)] : []),
            btn('lh', '손잡이로 고치기', <TextBtn label="손잡이로 고치기" on={loopEdit} disabled={!loop || !!sideT} onPress={() => (setLoopEdit(!loopEdit), setHandle(loopEdit ? null : 'start'))} />),
          ])
        );
        if (loopEdit && loop)
          rows.push(
            flowRow('handle', [
              { key: 'hs', w: segW(['시작', '끝'], fs), node: <Seg label="고칠 손잡이" value={handle ?? 'start'} onChange={setHandle} options={[{ value: 'start', label: '시작' }, { value: 'end', label: '끝' }]} /> },
              icon('h-', <IconBtn icon="chevron-left" label={`${handle === 'end' ? '끝' : '시작'} 손잡이 한 장면 앞으로`} onPress={() => nudgeHandle(-1)} />),
              icon('h+', <IconBtn icon="chevron-right" label={`${handle === 'end' ? '끝' : '시작'} 손잡이 한 장면 뒤로`} onPress={() => nudgeHandle(1)} />),
            ])
          );
        rows.push(headRow('h3', '배치', fs));
        const layoutLabels = ['자동', '위아래', '나란히', '겹쳐'];
        rows.push(
          segOf(
            'layout',
            layoutLabels,
            <Seg
              label="영상 배치"
              maxW={inspW} maxH={bodyCap}
              value={overlayOn ? 'overlay' : doc.transport.layout}
              onChange={(v) => {
                const p = activePair(docRef.current);
                let d = p ? setPresent(docRef.current, setPresentView(presentOf(p), v === 'overlay' ? 'overlay' : 'split')) : docRef.current;
                if (v !== 'overlay') d = { ...d, transport: { ...d.transport, layout: v } };
                edit(d);
                if (v === 'overlay') setFocusMode('pair');
              }}
              options={[
                { value: 'auto', label: layoutLabels[0], a11y: '자동, 영상 비율로 위아래나 나란히' },
                { value: 'stack', label: layoutLabels[1] },
                { value: 'side', label: layoutLabels[2] },
                { value: 'overlay', label: layoutLabels[3], a11y: '겹쳐 보기' },
              ]}
            />
          )
        );
        const focusLabels = ['둘 다', 'A 크게', 'B 크게'];
        rows.push(
          segOf(
            'focus',
            focusLabels,
            <Seg
              label="크게 볼 영상"
              maxW={inspW} maxH={bodyCap}
              value={focusMode}
              onChange={setFocusMode}
              options={[
                { value: 'pair', label: focusLabels[0] },
                { value: 'focusA', label: focusLabels[1], disabled: overlayOn },
                { value: 'focusB', label: focusLabels[2], disabled: overlayOn || !!errB },
              ]}
            />
          )
        );
        /* 표시(IM03) — 채움은 칸을 다 덮고 가장자리가 잘릴 수 있다(일부 잘림 표시). 전체는 다 보이고 위에 붙인다. 언제든 되돌린다 */
        const dispLabels = ['채움', '전체'];
        rows.push(
          segOf(
            'display',
            dispLabels,
            <Seg
              label="영상 표시"
              maxW={inspW} maxH={bodyCap}
              value={display}
              onChange={chooseDisplay}
              options={[
                { value: 'fill', label: dispLabels[0], a11y: '채움, 칸을 다 덮고 가장자리가 잘릴 수 있어요' },
                { value: 'full', label: dispLabels[1], a11y: '전체, 영상 전체가 보여요' },
              ]}
            />
          )
        );
        rows.push(
          flowRow('view', [
            btn('vl', '확대 같이', <TextBtn label="확대 같이" on={views.linked} onPress={() => edit(updatePair(docRef.current, { views: { ...views, linked: !views.linked } }))} a11y={views.linked ? '두 영상 확대 같이 하는 중, 누르면 따로' : '두 영상 확대 같이 하기'} />),
            btn('va', 'A 반전', <TextBtn label="A 반전" on={viewOf('a').mirror} onPress={() => setView('a', { ...shownView('a'), mirror: !shownView('a').mirror })} a11y={`A 좌우 반전 ${viewOf('a').mirror ? '끄기' : '켜기'}`} />),
            btn('vb', 'B 반전', <TextBtn label="B 반전" on={viewOf('b').mirror} onPress={() => setView('b', { ...shownView('b'), mirror: !shownView('b').mirror })} a11y={`B 좌우 반전 ${viewOf('b').mirror ? '끄기' : '켜기'}`} />),
          ])
        );
        if (overlayOn && present) {
          rows.push(headRow('h4', '겹쳐 보기', fs));
          /* 진하기(IM04) — 위 영상 그림 하나만 0~100%(5% 걸음). 조절은 타임라인 위 줄에도 있다 */
          const top = present.top.toUpperCase();
          const opLabels = OPACITY_PRESETS.map((o) => `${top} ${Math.round(o * 100)}%`);
          if (opacityApplies(present))
            rows.push(
              segOf(
                'opacity',
                opLabels,
                <Seg
                  label={`${top} 진하기`}
                  maxW={inspW} maxH={bodyCap}
                  value={OPACITY_PRESETS.find((o) => Math.abs(present.opacity - o) < 0.01) ?? -1}
                  onChange={(o) => editPresent((p) => setPresentOpacity(p, o))}
                  options={OPACITY_PRESETS.map((o, i) => ({ value: o, label: opLabels[i], a11y: `${top} 진하기 ${Math.round(o * 100)}퍼센트` }))}
                />
              )
            );
          else rows.push(subRow('wipeNote', wipeNote));
          rows.push(flowRow('top', [btn('swapTop', `위 ${present.top === 'a' ? 'B' : 'A'}로`, <TextBtn label={`위 ${present.top === 'a' ? 'B' : 'A'}로`} a11y={`위 영상을 ${present.top === 'a' ? 'B' : 'A'}로 바꾸기, 표시만 바뀌어요`} onPress={() => editPresent(swapTop)} />)]));
          /* 공간 맞춤은 나누기 · 방향 넷 · 크기 · 풀기 — 큰 묶음 하나가 아니라 묶음마다 줄(쪽에 맞춰 단추 단위로 나뉜다) */
          const nudge = (k: 'left' | 'right' | 'up' | 'down' | 'bigger' | 'smaller', l: string) =>
            btn(k, l, <TextBtn label={l} a11y={`겹친 B 를 ${l}로 조금`} onPress={() => edit(updatePair(docRef.current, { overlay: { ...overlay, reg: nudgeReg(overlay.reg, k) } }))} />);
          rows.push(flowRow('wipe', [btn('w', present.wipe == null ? '반반 나누기' : '나누기 끄기', <TextBtn label={present.wipe == null ? '반반 나누기' : '나누기 끄기'} onPress={() => editPresent((p) => setPresentWipe(p, p.wipe == null ? 0.5 : null))} />)]));
          rows.push(flowRow('reg', [nudge('left', '왼쪽'), nudge('right', '오른쪽'), nudge('up', '위'), nudge('down', '아래')]));
          rows.push(flowRow('scale', [nudge('bigger', '크게'), nudge('smaller', '작게'), btn('reset', '자리 풀기', <TextBtn label="자리 풀기" onPress={() => edit(updatePair(docRef.current, { overlay: { ...overlay, reg: { ...IDENTITY_REG } } }))} />)]));
        }
        return { title: '맞추기 · 보기', rows };
      }
      case 'playback': {
        const rows: IRow[] = [headRow('h', '재생 속도', fs)];
        const rateLabels = COMPARE_RATES.map((r) => rateLabel(r));
        rows.push(segOf('rate', rateLabels, <Seg label="재생 속도" value={rate} compact maxW={inspW} maxH={bodyCap} onChange={(r) => edit({ ...docRef.current, transport: { ...docRef.current.transport, rate: r } })} options={COMPARE_RATES.map((r) => ({ value: r, label: rateLabel(r) }))} />));
        rows.push(headRow('ha', '소리', fs));
        const audioOpts = [{ value: 'none' as const, label: '없음' }, { value: 'a' as const, label: 'A 소리' }, ...(bSrc ? [{ value: 'b' as const, label: 'B 소리' }] : [])];
        rows.push(segOf('audio', audioOpts.map((o) => o.label), <Seg label="들을 소리" maxW={inspW} maxH={bodyCap} value={doc.transport.audio} onChange={(a) => edit({ ...docRef.current, transport: { ...docRef.current.transport, audio: a } })} options={audioOpts} />));
        rows.push(
          flowRow('more', [
            ...(!single ? [btn('loop', '반복 구간 고치기', <TextBtn label="반복 구간 고치기" onPress={() => (setCompareStart('h2'), setUi((u) => ({ ...u, inspector: 'compareSet' })))} />)] : []),
            btn('time', '시각 넣기', <TextBtn label="시각 넣기" a11y="정확한 시각을 숫자로 넣기" onPress={() => (setUi((u) => closeInspector(u)), setSheet({ kind: 'time' }))} />),
          ])
        );
        return { title: '재생', rows };
      }
      case 'target': {
        const opts = allowed.map((t) => ({ value: t, label: TARGET_LABEL[t], a11y: t === 'both' ? '함께, 두 영상' : `${TARGET_LABEL[t]} 만 따로` }));
        return {
          title: '재생 대상',
          rows: [
            segOf('t', opts.map((o) => o.label), <Seg label="재생 대상" maxW={inspW} maxH={bodyCap} value={tgt} onChange={(t) => (chooseTarget(t), setUi((u) => closeInspector(u)))} options={opts} />),
            subRow('why', aligning ? '고른 영상만 재생 · 한 장면 · 옮기기를 해요. 기준을 지정할 영상이에요.' : '함께는 두 영상을 같은 자리로, A · B 는 그 영상만 재생 · 한 장면 · 옮기기를 해요. 함께로 돌아오면 따로 옮긴 영상 자리에 맞춰요.', inspW, fs),
          ],
        };
      }
      case 'drawTools': {
        const tileW = Math.max(64, Math.ceil(Math.max(...DRAW_TOOLS.map((t) => textW(t.label, 11, fs))) + 12));
        const tileH = Math.max(52, Math.ceil(18 + 2 + 11 * fs * 1.3 + 10));
        const rows: IRow[] = [
          flowRow(
            'tools',
            DRAW_TOOLS.map((t) => ({
              key: t.kind,
              w: tileW,
              node: (
                <ToolTile
                  label={t.label}
                  icon={t.icon}
                  on={drawTool === t.kind}
                  w={tileW}
                  h={tileH}
                  onPress={() => {
                    setDrawTool(t.kind);
                    setSelId(null);
                    setUi((u) => closeInspector(u));
                  }}
                />
              ),
            })),
            tileH
          ),
        ];
        rows.push(subRow('hint', DRAW_HINT[drawTool] ?? '한 손가락으로 그리거나 짚어요. 두 손가락은 확대 · 이동이에요.', inspW, fs));
        return { title: '그리기 도구', rows };
      }
      case 'style':
      case 'color':
      case 'width':
        return {
          title: '선 색 · 굵기',
          rows: [
            headRow('hc', '선 색', fs),
            flowRow(
              'c',
              COLORS.map((col, i) => icon(col, <Swatch color={col} on={color === col} label={`선 색 ${i + 1}`} onPress={() => setColor(col)} />))
            ),
            headRow('hw', '선 굵기', fs),
            segOf('w', WIDTHS.map((_, i) => `굵기 ${i + 1}`), <Seg label="선 굵기" maxW={inspW} maxH={bodyCap} value={strokeW} onChange={(w) => setStrokeW(w)} options={WIDTHS.map((w, i) => ({ value: w, label: `굵기 ${i + 1}` }))} />),
          ],
        };
      case 'drawSet': {
        const metrics = (Object.keys(METRIC_LABEL) as MetricKey[]).filter((m) => METRIC_TOOLS[m].includes(drawTool as never));
        const rows: IRow[] = [headRow('h', '보이는 때', fs)];
        const spans = (['scene', 'loop', 'always'] as SpanChoice[]).map((x) => ({ value: x, label: SPAN_LABEL[x], disabled: x === 'loop' && !loop }));
        rows.push(segOf('span', spans.map((o) => o.label), <Seg label="그림이 보이는 때" maxW={inspW} maxH={bodyCap} value={span} onChange={setSpan} options={spans} />));
        if (metrics.length) {
          rows.push(headRow('hm', '이름표(A · B 견주기)', fs));
          rows.push(flowRow('metric', [btn('none', '없음', <TextBtn label="없음" on={metric == null} onPress={() => setMetric(null)} />), ...metrics.map((m) => btn(m, METRIC_LABEL[m], <TextBtn label={METRIC_LABEL[m]} on={metric === m} onPress={() => setMetric(m)} />))]));
        }
        const calLabel = srcOf(drawSideK)?.calibration ? '길이 보정 다시' : '길이 보정';
        rows.push(
          flowRow('acts', [
            btn('clear', '이 장면 그림 지우기', <TextBtn label="이 장면 그림 지우기" onPress={clearScene} />),
            btn('cal', calLabel, <TextBtn label={calLabel} hint="같은 평면의 아는 길이로 cm 를 셈해요" onPress={startCalibrate} />),
          ])
        );
        return { title: '그리기 설정', rows };
      }
      case 'eventPick':
        return {
          title: `${evSide.toUpperCase()} 투구 장면`,
          rows: [
            flowRow(
              'ev',
              PITCH_EVENTS.map((e) => {
                const l = `${EVENT_SHORT[e]} · ${evStatus(srcOf(evSide)?.events[e])}`;
                return btn(e, l, <TextBtn label={l} a11y={`${EVENT_LABEL[e]}, ${evStatus(srcOf(evSide)?.events[e])}`} on={curEvent === e} onPress={() => (setCurEvent(e), setUi((u) => closeInspector(u)))} />);
              })
            ),
          ],
        };
      case 'eventResults':
        return { title: '장면 결과', rows: eventResultRows({ a: aSrc, b: bSrc, metricRows, w: inspW, fs, onJump: (e) => (setUi((u) => closeInspector(u)), jumpEvent(e)), onAnchor: (e) => (setUi((u) => closeInspector(u)), anchorAt(e)) }) };
      case 'notes': {
        const rows: IRow[] = [];
        const kept = draftList.filter((d) => !pairNotes.some((n) => d.noteId === n.id));
        if (!pairNotes.length && !kept.length) rows.push(subRow('none', '장면마다 글 메모를 남겨요. 목소리 메모는 새 앱 기능이 필요해 아직 없어요.', inspW, fs));
        /* 쓰다 닫은 메모(이 기기에 남은 초안) — 이어 쓰기 · 버리기 */
        for (const d of kept) {
          const lbl = `쓰던 메모 ${d.sourceId === bSrc?.id ? 'B' : 'A'} ${d.t != null ? clock(d.t) : ''}`.trim();
          rows.push(headRow(`${d.key}:h`, lbl, fs));
          rows.push({ key: `${d.key}:t`, h: 0, text: { s: d.text, style: 'body' } });
          rows.push(
            flowRow(`${d.key}:a`, [
              btn('go', '이어 쓰기', <TextBtn label="이어 쓰기" a11y={`${lbl} 이어 쓰기`} onPress={() => resumeDraft(d.key)} />),
              btn('rm', '버리기', <TextBtn label="버리기" a11y={`${lbl} 버리기`} onPress={() => (draftStore()?.remove(d.key), memDrafts.current.delete(d.key), bumpDrafts())} />),
            ])
          );
        }
        for (const n of pairNotes) {
          /* 메모 이름(누르면 그 장면) · 본문(쪽 높이에 맞춰 조각) · 고치기 · 지우기 */
          rows.push(
            rowOf(
              `${n.id}:h`,
              ctlH(fs),
              <Press accessibilityRole="button" accessibilityLabel={`${noteLabel(n)} 메모, 그 장면으로 가기`} onPress={() => openNote(n)} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text maxFontSizeMultiplier={FS_MAX} style={[TYPE.sub, { color: c.link }]}>
                  {noteLabel(n)} ›
                </Text>
              </Press>,
              true
            )
          );
          rows.push({ key: `${n.id}:t`, h: 0, text: { s: n.text, style: 'body' } });
          rows.push(
            flowRow(`${n.id}:a`, [
              btn('ed', '고치기', <TextBtn label="고치기" a11y={`${noteLabel(n)} 메모 고치기`} onPress={() => openNoteEditor(n)} />),
              btn('rm', '지우기', <TextBtn label="지우기" a11y={`${noteLabel(n)} 메모 지우기`} onPress={() => edit(removeNote(docRef.current, n.id))} />),
            ])
          );
        }
        return { title: `메모 ${pairNotes.length}개${kept.length ? ` · 초안 ${kept.length}` : ''}`, rows };
      }
      case 'storyboard': {
        /* 쪽 높이에 맞춰 그림 크기 · A · B 위아래/나란히를 고른다(짧은 가로 화면에서 B 그림이 잘리지 않게) */
        let sl = shotLayout({ bodyH: bodyThird, w: inspW, hasB: !!pb, fs });
        if (sl.h > bodyThird) sl = shotLayout({ bodyH: bodyCap, w: inspW, hasB: !!pb, fs });
        const rows: IRow[] = [];
        if (!storyRows.length) rows.push(subRow('none', '투구 장면을 짚으면 장면 모음이 생겨요.', inspW, fs));
        else
          rows.push(
            flowRow(
              'shots',
              storyRows.map((r) => ({ key: r.event, w: sl.row && pb ? sl.size * 2 + 4 : sl.size, node: <ShotPair pa={pa} pb={pb} ta={r.a} tb={r.b} label={EVENT_SHORT[r.event]} size={sl.size} row={sl.row} /> })),
              sl.h
            )
          );
        if (plan2) rows.push(subRow('plan', `만들 영상 ${plan2.durationSec.toFixed(1)}초 · 약 ${Math.max(1, Math.round(plan2.estimateBytes / 1e6))}MB${plan2.disclosures.length ? ` · ${plan2.disclosures.join(' · ')}` : ''}`, inspW, fs));
        rows.push(subRow('na', '두 영상을 한 파일로 엮는 내보내기 · 목소리 해설 녹화는 영상 합성 기능이 든 새 앱이 필요해 아직 못 해요. 장면 모음은 실제 영상 장면이에요.', inspW, fs));
        return { title: '장면 모음', rows };
      }
      case 'info':
        return { title: `${infoSide.toUpperCase()} 영상 정보`, rows: infoRows(infoSide) };
      case 'markers':
        return { title: '장면 고르기', rows: [flowRow('m', cluster.map((m) => btn(m.key, m.label, <TextBtn label={m.label} onPress={() => jumpMarker(m)} />)))] };
      case 'trim':
        return {
          title: `${F} 다듬기`,
          rows: [
            subRow('t', '이 비교에서 쓸 앞 · 뒤를 정해요. 원본 파일은 그대로예요.', inspW, fs),
            flowRow('b', [
              btn('s', `${F} 여기부터`, <TextBtn label={`${F} 여기부터`} disabled={!infoOf(focus)?.ready} onPress={() => trimHere(focus, 'start')} hint="이 장면 앞은 이 비교에서 안 써요" />),
              btn('e', `${F} 여기까지`, <TextBtn label={`${F} 여기까지`} disabled={!infoOf(focus)?.ready} onPress={() => trimHere(focus, 'end')} hint="이 장면 뒤는 이 비교에서 안 써요" />),
              ...(pair?.trims[focus] ? [btn('x', '다듬기 풀기', <TextBtn label="다듬기 풀기" onPress={() => edit(clearTrim(docRef.current, focus))} />)] : []),
            ]),
          ],
        };
      default:
        return { title: '', rows: [] };
    }
  };
  function infoRows(s: SideKey): IRow[] {
    const src = srcOf(s);
    if (!src) return [];
    const info = infoOf(s);
    const facts = src.facts;
    const lines = [
      labelOf(s),
      subOf(s),
      src.date ? `찍은 날 ${videoDateText(src.date)}` : null,
      [facts?.durationSec ? `${facts.durationSec.toFixed(1)}초` : null, (info?.fps ?? facts?.nominalFps) ? `${Math.round((info?.fps ?? facts?.nominalFps) as number)}fps` : null, info?.width && info?.height ? `${info.width}×${info.height}` : null, info?.codec].filter(Boolean).join(' · ') || null,
      src.origin === 'photos' ? '사진 앱에서 가져온 앱 안 복사본' : src.origin === 'camera' ? '앱에서 찍은 영상' : null,
    ].filter((x): x is string => !!x);
    const rows: IRow[] = lines.map((l, i) => subRow(`l${i}`, l, inspW, fs));
    rows.push(headRow('hh', '던지는 손', fs));
    const handOpts = [{ value: 'none' as const, label: '모름' }, { value: 'R' as const, label: '오른손' }, { value: 'L' as const, label: '왼손' }];
    rows.push(segOf('hand', handOpts.map((o) => o.label), <Seg label="던지는 손" maxW={inspW} maxH={bodyCap} value={src.hand ?? 'none'} onChange={(v) => edit(updateSource(docRef.current, src.id, { hand: v === 'none' ? null : v }))} options={handOpts} />));
    const views0 = Object.keys(VIEW_LABEL) as ViewKey[];
    rows.push(headRow('hv', '촬영 방향', fs));
    rows.push(
      flowRow('view', [
        btn('none', '모름', <TextBtn label="모름" on={src.view == null} onPress={() => edit(updateSource(docRef.current, src.id, { view: null }))} />),
        ...views0.map((v) => btn(v, VIEW_LABEL[v], <TextBtn label={VIEW_LABEL[v]} on={src.view === v} onPress={() => edit(updateSource(docRef.current, src.id, { view: v }))} />)),
      ])
    );
    rows.push(headRow('hp', '구종', fs));
    rows.push(
      flowRow('pt', [
        btn('none', '모름', <TextBtn label="모름" on={src.pitchType == null} onPress={() => edit(updateSource(docRef.current, src.id, { pitchType: null }))} />),
        ...PITCH_TYPES.map((p) => btn(p, p, <TextBtn label={p} on={src.pitchType === p} onPress={() => edit(updateSource(docRef.current, src.id, { pitchType: p }))} />)),
      ])
    );
    rows.push(headRow('hd', '이 투구', fs));
    const verdictOpts = [{ value: 'none' as const, label: '정하지 않음' }, { value: 'good' as const, label: '잘 됨' }, { value: 'work' as const, label: '아쉬움' }];
    rows.push(segOf('verdict', verdictOpts.map((o) => o.label), <Seg label="이 투구" maxW={inspW} maxH={bodyCap} value={src.verdict ?? 'none'} onChange={(v) => edit(updateSource(docRef.current, src.id, { verdict: v === 'none' ? null : v }))} options={verdictOpts} />));
    rows.push(subRow('why', '견주기 · 거르기에 써요. 모르면 비워 두세요. 비운 값은 짐작하지 않아요.', inspW, fs));
    rows.push(flowRow('rep', [btn('rep', `${s.toUpperCase()} 영상 바꾸기`, <TextBtn label={`${s.toUpperCase()} 영상 바꾸기`} onPress={() => (setUi(INITIAL_UI), openPick(s))} />)]));
    return rows;
  }
  const drawSideK: SideKey = single ? 'a' : drawSide;
  function clearScene() {
    const src = srcOf(drawSideK);
    if (!src) return;
    const scope = { kind: 'scene' as const, sourceId: src.id, t: times[drawSideK] };
    const n = visibleList(history.items, src.id, times[drawSideK]).filter((x) => x.span.kind !== 'always').length;
    if (!n) return toast('이 장면에 지울 그림이 없어요.', 'info');
    Alert.alert(`이 장면 그림 ${n}개를 지울까요?`, '되돌리기로 다시 살릴 수 있어요.', [
      { text: '취소', style: 'cancel' },
      { text: '지우기', style: 'destructive', onPress: () => applyHistory(applyEdit(history, { op: 'clear', scope })) },
    ]);
  }
  function startCalibrate() {
    pendingCal.current = drawSideK;
    setDrawTool('line');
    setUi((u) => closeInspector(u));
    toast('같은 평면에서 길이를 아는 두 점을 이어 선을 그려 주세요(예: 사람 키 · 막대).', 'info');
  }

  /* ---- 그리기 · 장면 · 메모 · 맞추기 줄(도구 줄 자리를 바꾼다 — 잰 폭에 맞춰 ToolBar 가 놓는다, SS01) ---- */
  const quick = QUICK_DRAW.map((k) => DRAW_TOOLS.find((t) => t.kind === k)).filter((t): t is (typeof DRAW_TOOLS)[number] => !!t);
  const curTool = DRAW_TOOLS.find((t) => t.kind === drawTool) ?? DRAW_TOOLS[0];
  /* 도구 줄 폭 — 세로는 아래 줄(안쪽 여백 8 · 8), 가로 폰은 오른쪽 칸(여백 6 · 6). 줄 수 — 세로 2(영상 자리를 지킨다) · 오른쪽 칸 6 */
  const barWidth = landscape ? sideW - 12 : contentW - 16;
  const barRows = landscape ? 6 : 2;
  const sideItem = (cur: SideKey, set: (s: SideKey) => void, what: string): ToolItem | null =>
    single
      ? null
      : {
          key: 'target',
          essential: true,
          w: textBtnW(cur.toUpperCase(), fs),
          node: (
            <TextBtn
              label={cur.toUpperCase()}
              a11y={`${what} ${cur.toUpperCase()}, 누르면 ${cur === 'a' ? 'B' : 'A'}`}
              on
              onPress={() => {
                const n: SideKey = cur === 'a' ? 'b' : 'a';
                set(n);
                setFocus(n);
              }}
            />
          ),
        };
  const barItems = (xs: (ToolItem | null | false)[]) => xs.filter((x): x is ToolItem => !!x);
  const bars: ReactNode[] = [];
  if (aligning) {
    const sem = semantic === 'start' ? 'manual' : semantic;
    const semLabels = (['footContact', 'release', 'manual'] as AnchorSemantic[]).map((x) => anchorShort(x));
    const markLabel = `${F} ${anchorShort(sem)} 지정`;
    bars.push(
      <ToolBar
        key="align"
        label="맞추기 도구 줄"
        width={barWidth}
        maxRows={landscape ? barRows : 3}
        items={barItems([
          {
            key: 'sem',
            essential: true,
            w: Math.min(barWidth, segW(semLabels, fs)),
            node: <Seg label="기준 뜻" maxW={barWidth} value={sem} onChange={chooseSemantic} options={(['footContact', 'release', 'manual'] as AnchorSemantic[]).map((x) => ({ value: x, label: anchorShort(x), a11y: ANCHOR_LABEL[x] }))} />,
          },
          { key: 'trim', w: iconW, priority: 2, overflow: true, node: <IconBtn icon="ruler" label={`${F} 다듬기, 이 비교에서 쓸 앞 · 뒤`} on={ui.inspector === 'trim'} onPress={() => toggle('trim')} />, more: { label: `${F} 다듬기`, run: () => toggle('trim') } },
          !!snap && { key: 'cancel', essential: true, w: textBtnW('취소', fs), node: <TextBtn label="취소" a11y="맞추기 취소, 전에 보던 비교로" onPress={back} /> },
          { key: 'start', w: textBtnW('처음부터', fs), priority: 3, overflow: true, node: <TextBtn label="처음부터" a11y="기준 없이 처음부터 보기" disabled={!bothReady} onPress={startFromBeginning} />, more: { label: '기준 없이 처음부터 보기', run: startFromBeginning, disabled: !bothReady } },
          {
            key: 'mark',
            essential: true,
            w: textBtnW(markLabel, fs),
            compactW: textBtnW('지정', fs),
            node: <TextBtn label={markLabel} a11y={`${F} 지금 장면을 ${ANCHOR_LABEL[sem]}로 지정`} primary={!canStart} disabled={!infoOf(focus)?.ready} onPress={markSide} />,
            compactNode: <TextBtn label="지정" a11y={`${F} 지금 장면을 ${ANCHOR_LABEL[sem]}로 지정`} primary={!canStart} disabled={!infoOf(focus)?.ready} onPress={markSide} />,
          },
          /* 처음 쓰기 — 두 영상을 다 지정하면 다음 할 일(비교 보기)이 주 단추가 된다 */
          {
            key: 'go',
            essential: true,
            push: true,
            w: textBtnW('비교 보기', fs),
            compactW: iconW,
            node: <TextBtn label="비교 보기" a11y="맞춘 장면으로 비교 보기, 멈춘 채 열어요" primary={canStart} disabled={!canStart} onPress={startCompare} />,
            compactNode: <IconBtn icon="arrow-right" label="맞춘 장면으로 비교 보기, 멈춘 채 열어요" on={canStart} disabled={!canStart} onPress={startCompare} />,
          },
        ])}
      />
    );
  } else if (ui.context === 'draw') {
    const colorNo = COLORS.indexOf(color as (typeof COLORS)[number]) + 1;
    const widthNo = WIDTHS.indexOf(strokeW as (typeof WIDTHS)[number]) + 1;
    const toolA11y = `그리기 도구 고르기, 지금 ${curTool.label}`;
    bars.push(
      <ToolBar
        key="draw"
        label="그리기 도구 줄"
        width={barWidth}
        maxRows={barRows}
        items={barItems([
          sideItem(drawSide, setDrawSide, '그릴 영상'),
          /* 지금 도구 — 누르면 열두 도구를 쪽으로 고른다(빠른 도구가 다 안 보여도 여기서 모두) */
          {
            key: 'tool',
            essential: true,
            w: textBtnW(curTool.label, fs) + 22,
            compactW: iconW,
            node: <TextBtn icon={curTool.icon} label={curTool.label} on={ui.inspector === 'drawTools'} a11y={toolA11y} onPress={() => toggle('drawTools')} />,
            compactNode: <IconBtn icon={curTool.icon} label={toolA11y} on={ui.inspector === 'drawTools'} onPress={() => toggle('drawTools')} />,
          },
          ...quick.map((t, i): ToolItem => ({ key: `q:${t.kind}`, w: iconW, priority: 4 + i * 0.1, node: <IconBtn icon={t.icon} label={t.label} on={drawTool === t.kind} onPress={() => (setDrawTool(t.kind), setSelId(null))} /> })),
          { key: 'q:select', w: iconW, priority: 3, node: <IconBtn icon="move" label="고르기 · 옮기기" on={drawTool === 'select'} onPress={() => setDrawTool('select')} /> },
          /* 모양 — 선 색 · 굵기를 한 창에 */
          {
            key: 'style',
            essential: true,
            w: iconW,
            node: (
              <Press accessibilityRole="button" accessibilityLabel={`선 모양, 지금 색 ${colorNo}번 · 굵기 ${widthNo}`} accessibilityState={{ selected: ui.inspector === 'style' }} onPress={() => toggle('style')} style={st.colorBtn}>
                <View style={[st.colorDot, { backgroundColor: color, borderColor: c.line, borderWidth: Math.max(2, strokeW / 2) }]} />
              </Press>
            ),
          },
          { key: 'drawSet', w: iconW, priority: 5, overflow: true, node: <IconBtn icon="settings2" label="그리기 설정, 보이는 때 · 이름표 · 지우기 · 길이 보정" on={ui.inspector === 'drawSet'} onPress={() => toggle('drawSet')} />, more: { label: '그리기 설정', run: () => toggle('drawSet') } },
          { key: 'undo', essential: true, w: iconW, node: <IconBtn icon="rotate-ccw" label="되돌리기" disabled={history.past.length === 0} onPress={() => applyHistory(applyEdit(history, { op: 'undo' }))} /> },
          { key: 'redo', w: iconW, priority: 6, overflow: true, node: <IconBtn icon="rotate-cw" label="다시 하기" disabled={history.future.length === 0} onPress={() => applyHistory(applyEdit(history, { op: 'redo' }))} />, more: { label: '다시 하기', run: () => applyHistory(applyEdit(history, { op: 'redo' })), disabled: history.future.length === 0 } },
          !!selectedAnn && {
            key: 'delete',
            w: iconW,
            priority: 1,
            overflow: true,
            node: <IconBtn icon="trash2" label="고른 그림 지우기" color={c.danger} onPress={() => selId && (applyHistory(applyEdit(history, { op: 'remove', id: selId })), setSelId(null))} />,
            more: { label: '고른 그림 지우기', destructive: true, run: () => selId && (applyHistory(applyEdit(history, { op: 'remove', id: selId })), setSelId(null)) },
          },
          { key: 'done', essential: true, push: true, w: textBtnW('완료', fs), node: <TextBtn label="완료" primary onPress={() => enterContext('draw')} a11y="그리기 끝내기" /> },
        ])}
      />
    );
  } else if (ui.context === 'events') {
    const chip = `${EVENT_SHORT[curEvent]} · ${evStatus(evVal)}`;
    const chipShort = `${EVENT_SHORT[curEvent]} ${evVal == null ? '—' : evVal === 'obscured' ? '가림' : '✓'}`;
    const chipA11y = `${evSide.toUpperCase()} ${EVENT_LABEL[curEvent]}, ${evStatus(evVal)}, 다른 장면 고르기`;
    bars.push(
      <ToolBar
        key="events"
        label="장면 도구 줄"
        width={barWidth}
        maxRows={barRows}
        items={barItems([
          sideItem(eventSide, setEventSide, '짚을 영상'),
          { key: 'prev', essential: true, w: iconW, node: <IconBtn icon="chevron-left" label="이전 투구 장면" onPress={() => stepEvent(-1)} /> },
          {
            key: 'chip',
            essential: true,
            w: textBtnW(chip, fs),
            compactW: textBtnW(chipShort, fs),
            node: <TextBtn label={chip} a11y={chipA11y} on={ui.inspector === 'eventPick'} onPress={() => toggle('eventPick')} />,
            compactNode: <TextBtn label={chipShort} a11y={chipA11y} on={ui.inspector === 'eventPick'} onPress={() => toggle('eventPick')} />,
          },
          { key: 'next', essential: true, w: iconW, node: <IconBtn icon="chevron-right" label="다음 투구 장면" onPress={() => stepEvent(1)} /> },
          { key: 'close', essential: true, w: iconW, node: <IconBtn icon="x" label="장면 짚기 끝내기" onPress={() => enterContext('events')} /> },
          { key: 'mark', essential: true, w: textBtnW('지금 장면', fs), node: <TextBtn label="지금 장면" a11y={`${evSide.toUpperCase()} ${EVENT_LABEL[curEvent]}을 지금 장면 ${clock(times[evSide])}로`} primary onPress={() => markEvent(curEvent, times[evSide])} /> },
          { key: 'obscured', w: textBtnW('가려짐', fs), priority: 2, overflow: true, node: <TextBtn label="가려짐" on={evVal === 'obscured'} onPress={() => markEvent(curEvent, evVal === 'obscured' ? null : 'obscured')} hint="잘 안 보이면 짐작해 채우지 않고 가려짐으로" />, more: { label: evVal === 'obscured' ? '가려짐 표시 풀기' : '가려짐으로 표시', run: () => markEvent(curEvent, evVal === 'obscured' ? null : 'obscured') } },
          evVal != null && { key: 'trash', w: iconW, priority: 3, overflow: true, node: <IconBtn icon="trash2" label={`${EVENT_SHORT[curEvent]} 표시 지우기`} onPress={() => markEvent(curEvent, null)} />, more: { label: `${EVENT_SHORT[curEvent]} 표시 지우기`, destructive: true, run: () => markEvent(curEvent, null) } },
          { key: 'go', w: iconW, priority: 1, overflow: true, node: <IconBtn icon="arrow-right" label={`${EVENT_SHORT[curEvent]} 장면으로 가기`} disabled={typeof evVal !== 'number'} onPress={goEvent} />, more: { label: `${EVENT_SHORT[curEvent]} 장면으로 가기`, run: goEvent, disabled: typeof evVal !== 'number' } },
          { key: 'results', w: iconW, priority: 4, overflow: true, node: <IconBtn icon="clipboard-list" label="장면 결과, 구간 시간 · 2D 참고 측정" on={ui.inspector === 'eventResults'} onPress={() => toggle('eventResults')} />, more: { label: '장면 결과', run: () => toggle('eventResults') } },
        ])}
      />
    );
  } else if (ui.context === 'notes') {
    const write = `${noteSide.toUpperCase()} ${clock(times[noteSide])} 메모 쓰기`;
    bars.push(
      <ToolBar
        key="notes"
        label="메모 도구 줄"
        width={barWidth}
        maxRows={barRows}
        items={barItems([
          {
            key: 'write',
            essential: true,
            w: textBtnW(write, fs),
            compactW: textBtnW('메모 쓰기', fs),
            node: <TextBtn label={write} primary grow onPress={() => openNoteEditor(null)} />,
            compactNode: <TextBtn label="메모 쓰기" a11y={write} primary onPress={() => openNoteEditor(null)} />,
          },
          { key: 'list', w: iconW, priority: 1, overflow: true, node: <IconBtn icon="list" label={`메모 ${pairNotes.length}개 보기${draftList.length ? `, 초안 ${draftList.length}개` : ''}`} on={ui.inspector === 'notes'} onPress={() => toggle('notes')} />, more: { label: `메모 ${pairNotes.length}개 보기`, run: () => toggle('notes') } },
          { key: 'close', essential: true, push: true, w: iconW, node: <IconBtn icon="x" label="메모 끝내기" onPress={() => enterContext('notes')} /> },
        ])}
      />
    );
  }
  const dock: { key: string; icon: IconName; label: string; a11y?: string; on: boolean; run: () => void }[] = single
    ? [
        { key: 'draw', icon: 'pencil', label: '그리기', on: false, run: () => enterContext('draw') },
        { key: 'events', icon: 'flag', label: '장면', on: false, run: () => enterContext('events') },
        { key: 'notes', icon: 'sticky-note', label: '메모', on: false, run: () => enterContext('notes') },
        { key: 'add', icon: 'plus', label: '비교 영상', a11y: '비교 영상 추가', on: false, run: () => openPick('b') },
        { key: 'story', icon: 'layers', label: '모음', a11y: '장면 모음', on: ui.inspector === 'storyboard', run: () => toggle('storyboard') },
      ]
    : [
        { key: 'align', icon: 'target', label: '맞추기', a11y: '맞추기 · 반복 · 배치', on: ui.inspector === 'compareSet', run: () => (setCompareStart(null), toggle('compareSet')) },
        { key: 'draw', icon: 'pencil', label: '그리기', on: false, run: () => enterContext('draw') },
        { key: 'events', icon: 'flag', label: '장면', on: false, run: () => enterContext('events') },
        { key: 'notes', icon: 'sticky-note', label: '메모', on: false, run: () => enterContext('notes') },
        { key: 'story', icon: 'layers', label: '모음', a11y: '장면 모음', on: ui.inspector === 'storyboard', run: () => toggle('storyboard') },
      ];
  /* 도구 칸 이름 — 칸 폭에 들어가면 보이고, 큰 글씨로 안 들어가면 그림만(이름은 VoiceOver 가 읽는다 — 글자를 줄이지 않는다) */
  const dockItemW = landscape ? barWidth : barWidth / dock.length;
  const dockNode = (
    <View style={landscape ? st.dockCol : st.dock} accessibilityRole="toolbar" accessibilityLabel="도구">
      {dock.map((d) => {
        const named = textW(d.label, 11, fs) + 6 <= dockItemW;
        return (
          <Press
            key={d.key}
            accessibilityRole="button"
            accessibilityLabel={d.a11y ?? d.label}
            accessibilityState={{ selected: d.on }}
            onPress={d.run}
            style={[st.dockItem, d.on && { backgroundColor: withAlpha(c.action, 0.14) }]}
          >
            <Icon name={d.icon} size={20} color={d.on ? c.link : c.ink} />
            {named ? (
              <Text numberOfLines={1} maxFontSizeMultiplier={FS_MAX} style={[st.dockText, { color: d.on ? c.link : c.muted }]}>
                {d.label}
              </Text>
            ) : null}
          </Press>
        );
      })}
    </View>
  );
  const ctxNode = bars.length ? <View style={{ gap: 4 }}>{bars}</View> : dockNode;

  /* ---- 작은 창 자리 — 세로는 무대 아래쪽(영상 가림 한도 안), 가로 폰은 오른쪽 칸 자리(영상을 가리지 않는다) ---- */
  const editing = !!noteEdit;
  const insp = ui.inspector && !editing ? rowsFor(ui.inspector) : null;
  const needBody = insp ? atomicNeed(insp.rows, { width: inspW, fs }) : 0;
  const inspAvail = inspSide ? sideAvail : inspectorBudget({ stageH, fs, needBody }).avail;
  const inspNode = insp ? (
    <Inspector key={`${ui.inspector}:${infoSide}:${compareStart}`} title={insp.title} rows={insp.rows} avail={inspAvail} width={inspOuterW} onClose={() => setUi((u) => closeInspector(u))} startRow={ui.inspector === 'compareSet' ? compareStart : null} />
  ) : null;

  /* ---- 메모 쓰기 자리(SS03) — 자판과 겹치는 높이를 한 번만 빼고, 머리 줄을 걷어 편집 줄 · 작은 정지 미리보기에 ---- */
  const overlap = keyboardOverlap(rootY + rootSize.h, kbTop);
  const editPad = (overlap > 0 ? overlap : inset.bottom) + 4;
  const editPlan = planEditor({ avail: Math.max(0, rootSize.h - inset.top - editPad), fs });

  /* ---- 재생 줄 — 함께 · A · B / 이전 · 재생 · 다음 / 속도. 좁으면 대상은 지금 대상 이름 단추(누르면 고르는 창) ---- */
  const transportW = (landscape ? contentW - sideW : contentW) - 16;
  const targetItem: ToolItem | null =
    allowed.length > 1
      ? {
          key: 'target',
          essential: true,
          w: segW(allowed.map((t) => TARGET_LABEL[t]), fs),
          compactW: textBtnW(TARGET_LABEL[tgt], fs),
          node: <Seg label="재생 대상" value={tgt} onChange={chooseTarget} compact options={allowed.map((t) => ({ value: t, label: TARGET_LABEL[t], a11y: t === 'both' ? '함께, 두 영상' : `${TARGET_LABEL[t]} 만 따로` }))} />,
          compactNode: <TextBtn label={TARGET_LABEL[tgt]} on={tgt !== 'both' || ui.inspector === 'target'} a11y={`재생 대상 ${TARGET_LABEL[tgt]}, 바꾸기`} onPress={() => toggle('target')} />,
        }
      : null;
  const transportNode = (
    <ToolBar
      label="재생 줄"
      width={transportW}
      maxRows={2}
      preferCompact
      items={barItems([
        targetItem,
        { key: 'prev', essential: true, w: iconW, node: <IconBtn icon="chevron-left" label={sideT ? `${sideT.toUpperCase()} 이전 장면` : single ? '이전 장면' : '두 영상 이전 장면'} disabled={sideT ? !sideReady : !canSync} onPress={() => stepPress(-1)} /> },
        {
          key: 'play',
          essential: true,
          w: 56,
          node: (
            <Press
              accessibilityRole="button"
              accessibilityLabel={playText}
              accessibilityState={{ disabled: !playOk, busy: !sideT && isBusy(phase) }}
              disabled={!playOk}
              onPress={playPress}
              style={[st.play, { backgroundColor: c.action }, !playOk && { opacity: 0.35 }]}
            >
              {!sideT && isBusy(phase) ? <ActivityIndicator color={c.onAction} /> : <Icon name={playing ? 'pause' : 'play'} size={22} color={c.onAction} />}
            </Press>
          ),
        },
        { key: 'next', essential: true, w: iconW, node: <IconBtn icon="chevron-right" label={sideT ? `${sideT.toUpperCase()} 다음 장면` : single ? '다음 장면' : '두 영상 다음 장면'} disabled={sideT ? !sideReady : !canSync} onPress={() => stepPress(1)} /> },
        { key: 'rate', essential: true, push: true, w: textBtnW(rateLabel(rate), fs), node: <TextBtn label={rateLabel(rate)} on={ui.inspector === 'playback'} a11y={`재생 속도 ${rateLabel(rate)}, 속도 · 소리 · 시각 넣기`} onPress={() => toggle('playback')} /> },
      ])}
    />
  );
  const timelineNode = (
    <Timeline
      value={tl.value}
      min={tl.min}
      max={tl.max}
      step={tl.step}
      disabled={tl.disabled}
      label={tl.label}
      valueText={tl.valueText}
      leftText={tl.left}
      rightText={tl.right}
      markers={tl.markers}
      loop={sideT ? null : loop}
      loopEdit={loopEdit && !sideT}
      selectedHandle={handle}
      onStart={() => {
        stopSide();
        if (sideT) {
          transport.pause();
          playerCall.pause(playerOf(sideT));
        } else {
          takeControl();
          transport.pause();
        }
      }}
      onSeek={(t) => (sideT ? seekSide(sideT, t) : userSeek(t))}
      onJump={jumpMarker}
      onCluster={(ms) => {
        setCluster(ms);
        setUi((u) => ({ ...u, inspector: 'markers' }));
      }}
      onHandle={setLoopEdge}
      onHandleSelect={setHandle}
    />
  );
  const statusText = phase === 'error' && !sideT ? '두 영상을 같은 자리로 맞추지 못했어요. 다시 재생해 주세요.' : null;
  /* 겹침 진하기 줄(IM04) — 타임라인 바로 위. 위 영상 그림만 흐리게: −/+ 5% · 25 · 50 · 75 · 위 영상 바꾸기. 반반이면 까닭만 */
  const overlayNode =
    present && stageView === 'overlay' ? (
      <ToolBar
        label="겹쳐 보기 진하기"
        width={transportW}
        maxRows={1}
        preferCompact
        items={barItems(
          opacityApplies(present)
            ? [
                { key: 'op-', essential: true, w: iconW, node: <IconBtn icon="minus" label={`${present.top.toUpperCase()} 더 옅게`} disabled={present.opacity <= 0} onPress={() => editPresent((p) => stepOpacity(p, -1))} /> },
                {
                  key: 'opv',
                  essential: true,
                  w: Math.ceil(textW(opacityLabel(present), 15, fs)) + 12,
                  node: (
                    <Text accessibilityLabel={opacityA11y(present)} accessibilityLiveRegion="polite" maxFontSizeMultiplier={FS_MAX} style={[TYPE.sub, { color: c.ink, fontVariant: ['tabular-nums'], paddingHorizontal: 4 }]}>
                      {opacityLabel(present)}
                    </Text>
                  ),
                },
                { key: 'op+', essential: true, w: iconW, node: <IconBtn icon="plus" label={`${present.top.toUpperCase()} 더 진하게`} disabled={present.opacity >= 1} onPress={() => editPresent((p) => stepOpacity(p, 1))} /> },
                ...OPACITY_PRESETS.map((o) => ({
                  key: `op${o}`,
                  priority: 2,
                  w: textBtnW(`${Math.round(o * 100)}`, fs),
                  node: <TextBtn label={`${Math.round(o * 100)}`} on={Math.abs(present.opacity - o) < 0.01} a11y={`${present.top.toUpperCase()} 진하기 ${Math.round(o * 100)}퍼센트`} onPress={() => editPresent((p) => setPresentOpacity(p, o))} />,
                })),
                { key: 'swap', priority: 1, w: iconW, node: <IconBtn icon="arrow-up-down" label={`위 영상을 ${present.top === 'a' ? 'B' : 'A'}로 바꾸기`} onPress={() => editPresent(swapTop)} /> },
              ]
            : [
                { key: 'wn', essential: true, w: Math.ceil(textW(wipeNote, 15, fs)) + 8, node: <Text maxFontSizeMultiplier={FS_MAX} style={[TYPE.sub, { color: c.muted }]}>{wipeNote}</Text> },
                { key: 'woff', essential: true, w: textBtnW('나누기 끄기', fs), node: <TextBtn label="나누기 끄기" onPress={() => editPresent((p) => setPresentWipe(p, null))} /> },
              ]
        )}
      />
    ) : null;
  const drawSplitNote = overlayOn && stage === 'compare' && drawingNow;

  return (
    <View
      ref={rootRef}
      style={{ flex: 1, backgroundColor: COMPARE_BLACK.page, paddingTop: editing ? inset.top : 0, paddingLeft: inset.left, paddingRight: inset.right }}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        const h = Math.round(e.nativeEvent.layout.height);
        if (w !== rootSize.w || h !== rootSize.h) setRootSize({ w, h });
        /* 자판 윗변과 견줄 화면 아래 끝(창 좌표) */
        rootRef.current?.measureInWindow?.((_x: number, y: number) => Number.isFinite(y) && Math.round(y) !== rootY && setRootY(Math.round(y)));
      }}
    >
      <Stack.Screen options={{ gestureEnabled: swipeOk && !drawing && !stroking && !editing && !toolsHidden }} />
      {/* 이 화면에 있는 동안만 상태 막대 글자를 밝게(IM01) — 떠나거나 다른 화면이 덮으면 앱 설정으로 */}
      {screenFocused ? <StatusBar style="light" /> : null}
      {/*
       * 머리 — 뒤로 · 이름 · 저장 표시 · 숨기기 · 더보기. 영상 위에 뜬다(IM02 — 영상 바탕은 화면 맨 위부터, 단추는 안전 영역 안).
       * 메모를 쓰는 동안은 걷고(편집 줄에 닫기 · 저장이 있다 — SS03), 도구를 숨기면 걷고 '도구 보이기' 하나만 남긴다(IM06)
       */}
      {!editing && !toolsHidden ? (
        <View style={[st.barOverlay, { paddingTop: inset.top, backgroundColor: COMPARE_BLACK.scrim }]}>
        <View style={st.bar}>
          <Pressable accessibilityRole="button" accessibilityLabel={ui.inspector ? '작은 창 닫기' : ui.context !== 'view' ? '도구 끝내기' : '뒤로'} onPress={back} hitSlop={4} style={st.barButton}>
            <Icon name="back" size={22} color={c.link} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`비교 이름 ${doc.title}, 바꾸기`} onPress={() => setSheet({ kind: 'title' })} style={st.barMid}>
            <Text numberOfLines={1} maxFontSizeMultiplier={FS_MAX} style={[st.barTitle, { color: c.ink }]}>
              {aligning ? `같은 동작에 맞추기 · ${F}` : doc.title}
            </Text>
          </Pressable>
          {review ? (
            <View style={st.review}>
              <IconBtn icon="chevron-left" label="이전 B" onPress={() => (stopAll(), edit(moveReview(docRef.current, -1)))} />
              <Text maxFontSizeMultiplier={FS_MAX} style={[TYPE.sub, { color: c.muted, fontVariant: ['tabular-nums'] }]} accessibilityLabel={`기준 A 고정, B ${review.candidateIds.length}개 중 ${review.index + 1}번째`}>
                B {review.index + 1}/{review.candidateIds.length}
              </Text>
              <IconBtn icon="chevron-right" label="다음 B" onPress={() => (stopAll(), edit(moveReview(docRef.current, 1)))} />
            </View>
          ) : null}
          <Press
            accessibilityRole="button"
            accessibilityLabel={saveFailed ? `${saveText}, 다시 저장하기` : saveText}
            accessibilityLiveRegion="polite"
            disabled={!saveFailed}
            onPress={() => (saver.schedule(docRef.current), void saver.flush())}
            style={st.barButton}
          >
            {save === 'saving' ? (
              <ActivityIndicator color={c.muted} />
            ) : (
              <Icon name={saveFailed ? 'circle-alert' : save === 'saved' ? 'circle-check' : !doc.ownerId ? 'lock' : 'circle-dot'} size={20} color={saveFailed ? c.danger : c.muted} />
            )}
          </Press>
          <Press accessibilityRole="button" accessibilityLabel={chromeText.hideLabel} accessibilityHint="영상만 크게 보여요. 재생은 그대로예요" onPress={() => chromeDo({ type: 'hide' })} style={st.barButton}>
            <Icon name="eye-off" size={20} color={c.link} />
          </Press>
          <Press accessibilityRole="button" accessibilityLabel="더보기" onPress={more} style={st.barButton}>
            <Icon name="ellipsis" size={22} color={c.link} />
          </Press>
        </View>
        {saveFailed ? (
          <Press accessibilityRole="button" onPress={() => (saver.schedule(docRef.current), void saver.flush())} style={[st.saveFail, { backgroundColor: withAlpha(c.danger, 0.2) }]}>
            <Text numberOfLines={2} maxFontSizeMultiplier={FS_MAX} style={[TYPE.sub, { color: c.danger }]}>
              {save === 'conflict' ? '다른 곳에서 바뀌었어요 · 사본으로 남겼어요' : '저장하지 못했어요 · 눌러서 다시 저장'}
            </Text>
          </Press>
        ) : null}
        </View>
      ) : null}

      <View style={{ flex: 1, flexDirection: landscape && !editing ? 'row' : 'column' }}>
        <View style={{ flex: 1 }}>
          {/* 무대 — 남는 자리 전부. 영상은 실제 비율로, 타임라인 쪽에 붙여서. 메모를 쓰는 동안은 작은 정지 미리보기 */}
          <View
            testID="compare-stage"
            style={st.stage}
            onLayout={(e) => {
              const w = Math.round(e.nativeEvent.layout.width);
              const h = Math.round(e.nativeEvent.layout.height);
              if (!stageSize || stageSize.w !== w || stageSize.h !== h) setStageSize({ w, h });
            }}
          >
            <Pane
              key={aSrc?.id ?? 'a'}
              {...paneProps('a')}
              rect={plan?.slots.a ?? null}
              onReplace={() => openPick('a', errA && (errA.kind === 'missing' || errA.kind === 'gone') ? (aSrc?.id ?? null) : null)}
            />
            {bSrc ? <Pane key={bSrc.id} {...paneProps('b')} rect={plan?.slots.b ?? null} onReplace={() => openPick('b', errB && (errB.kind === 'missing' || errB.kind === 'gone') ? bSrc.id : null)} /> : null}
            {statusText ? (
              <Text style={[st.status, { top: headerH + 6, color: c.danger, backgroundColor: c.card }]} maxFontSizeMultiplier={FS_MAX} accessibilityLiveRegion="polite">
                {statusText}
              </Text>
            ) : drawSplitNote ? (
              <Text style={[st.status, { top: headerH + 6, color: c.ink, backgroundColor: COMPARE_BLACK.scrim }]} maxFontSizeMultiplier={FS_MAX} accessibilityLiveRegion="polite">
                그리는 동안은 나눠 보여요 · 그리기를 끝내면 겹침으로 돌아가요
              </Text>
            ) : null}
            {inspNode && !inspSide ? (
              <View testID="compare-inspector-stage" style={st.inspWrap}>
                {inspNode}
              </View>
            ) : null}
          </View>
          {editing && noteEdit ? (
            <View style={[st.controls, { paddingBottom: editPad }]}>
              <NoteEditor
                key={noteEdit.key}
                title={noteEdit.edit ? '메모 고치기' : `${noteEdit.side.toUpperCase()} ${clock(noteEdit.t)} 메모`}
                initial={draftOf(noteEdit.key)?.text ?? noteEdit.edit?.text ?? ''}
                initialCaret={draftOf(noteEdit.key)?.caret}
                plan={editPlan}
                width={contentW - 16}
                onDraft={onDraft}
                onClose={() => closeNoteEditor(true)}
                onDiscard={() => closeNoteEditor(false)}
                onSave={(raw) => {
                  const t = raw.trim();
                  if (!t) return closeNoteEditor(false);
                  if (noteEdit.edit) edit(editNote(docRef.current, noteEdit.edit.id, t));
                  else edit(addNote(docRef.current, { sourceId: noteEdit.sourceId, t: noteEdit.t, text: t }, nowIso()));
                  closeNoteEditor(false);
                }}
              />
            </View>
          ) : toolsHidden ? null : (
            <View style={[st.controls, { paddingBottom: landscape ? inset.bottom + 2 : 0 }]}>
              {overlayNode}
              {timelineNode}
              {transportNode}
            </View>
          )}
          {!landscape && !editing && !toolsHidden ? <View style={[st.controls, { paddingBottom: inset.bottom + 4, paddingTop: 2 }]}>{ctxNode}</View> : null}
        </View>
        {landscape && !editing && !toolsHidden ? (
          <View
            testID="compare-side"
            style={[st.sideCol, { width: sideW, paddingTop: headerH, paddingBottom: inset.bottom + 4 }]}
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height);
              if (h !== sideH) setSideH(h);
            }}
          >
            {inspNode ? <View testID="compare-inspector-side">{inspNode}</View> : ctxNode}
          </View>
        ) : null}
      </View>

      {/* 도구를 숨긴 동안 늘 닿는 '도구 보이기'(44pt, 안전 영역 안 오른쪽 위) — 뒤로 · 영상 누르기로도 돌아온다 */}
      {toolsHidden ? (
        <Press
          accessibilityRole="button"
          accessibilityLabel={chromeText.restoreLabel}
          accessibilityHint={chromeText.hint ?? undefined}
          onPress={() => chromeDo({ type: 'show' })}
          style={[st.restore, { top: inset.top + 8, right: inset.right + 8, backgroundColor: COMPARE_BLACK.scrim }]}
        >
          <Icon name="menu" size={22} color={c.ink} />
        </Press>
      ) : null}
      {expand && expandPlayer ? (
        <ExpandView
          player={expandPlayer}
          side={expand}
          aspect={(expand === 'a' ? aspA : aspB) ?? FALLBACK_ASPECT}
          time={times[expand]}
          playLabel={stage === 'compare' || single ? playLabel : null}
          canPlay={canSync}
          onToggle={togglePlay}
          onClose={() => setExpand(null)}
        />
      ) : null}

      {sheet?.kind === 'title' ? (
        <TextSheet title="비교 이름" initial={doc.title} placeholder="예: 11월 불펜 vs 10월" max={40} onClose={() => setSheet(null)} onDone={(t) => (edit(rename(docRef.current, t)), setSheet(null))} />
      ) : null}
      {sheet?.kind === 'label' ? (
        <TextSheet title="글 그림" placeholder="예: 팔꿈치 높이" max={60} onClose={() => setSheet(null)} onDone={(t) => (createAnn(sheet.side, { kind: 'label', p: sheet.p, text: t }), setSheet(null))} />
      ) : null}
      {sheet?.kind === 'time' ? (
        <TextSheet
          title={sideT ? `${sideT.toUpperCase()} 시각(초)` : single ? '시각(초)' : '기준 장면부터(초, 앞은 −)'}
          placeholder={sideT || single ? '예: 2.35' : '예: -0.4'}
          numeric
          max={8}
          onClose={() => setSheet(null)}
          onDone={(t) => {
            const v = Number(t.replace(',', '.').replace('−', '-'));
            if (!Number.isFinite(v)) return toast('시각을 숫자로 넣어 주세요.', 'error');
            setSheet(null);
            if (sideT) return seekSide(sideT, v);
            if (range) userSeek(Math.min(range.max, Math.max(range.min, v)));
          }}
        />
      ) : null}
      {sheet?.kind === 'calibrate' ? (
        <TextSheet
          title="그 선의 실제 길이(cm)"
          placeholder="예: 180"
          numeric
          max={6}
          onClose={() => setSheet(null)}
          onDone={(t) => {
            const cm = Number(t.replace(',', '.'));
            const g = sheet.geom;
            const src = srcOf(sheet.side);
            if (!(cm > 0) || !src || (g.kind !== 'line' && g.kind !== 'arrow')) return toast('길이를 숫자로 넣어 주세요.', 'error');
            edit(updateSource(docRef.current, src.id, { calibration: { a: g.a, b: g.b, cm } }));
            setSheet(null);
            toast('길이 보정을 저장했어요. 같은 평면의 선만 cm 로 보여요.', 'success');
          }}
        />
      ) : null}
    </View>
  );
}

/** 겹쳐 보기(R11) — A 위에 B 를 투명하게(또는 반반 나눠). 시간 맞춤과 따로, 공간 맞춤(reg)은 손으로. 원본 칸은 '나란히'로 언제든 */
function ToolTile({ label, icon, on, onPress, w = 64, h = 52 }: { label: string; icon: IconName; on: boolean; onPress: () => void; w?: number; h?: number }) {
  const c = useComparePalette();
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={onPress} style={[st.tile, { width: w, minHeight: h, backgroundColor: on ? c.action : withAlpha(c.ink, 0.07) }]}>
      <Icon name={icon} size={18} color={on ? c.onAction : c.link} />
      <Text numberOfLines={1} maxFontSizeMultiplier={FS_MAX} style={[st.tileText, { color: on ? c.onAction : c.ink }]}>
        {label}
      </Text>
    </Press>
  );
}
function Swatch({ color, on, label, onPress }: { color: string; on: boolean; label: string; onPress: () => void }) {
  const c = useComparePalette();
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={onPress} style={[st.swatchHit, { borderColor: on ? c.action : 'transparent' }]}>
      <View style={[st.swatch, { backgroundColor: color }]} />
    </Press>
  );
}

/** 장면 결과(R30 · R32) — 순서 문제 · 두 영상 장면으로 가기 · 구간 시간 · 2D 참고 측정. 쪽으로 나눈다 */
function eventResultRows(o: {
  a: SourceRef | null;
  b: SourceRef | null;
  metricRows: { metric: MetricKey; a: Annotation | null; b: Annotation | null; aspectA: number; aspectB: number }[];
  w: number;
  fs: number;
  onJump: (e: PitchEvent) => void;
  onAnchor: (e: PitchEvent) => void;
}): IRow[] {
  const rows: IRow[] = [];
  const { a, b, w, fs } = o;
  for (const [k, src] of [
    ['A', a],
    ['B', b],
  ] as const) {
    const issues = src ? orderIssues(src.events) : [];
    if (issues.length) rows.push(subRow(`iss${k}`, `${k}: ${issues.map(([x, y]) => `${EVENT_SHORT[y]}이(가) ${EVENT_SHORT[x]}보다 앞이에요`).join(' · ')}. 다시 확인해 주세요.`, w, fs, true));
  }
  const shared = a && b ? sharedEvents(a.events, b.events) : [];
  if (shared.length) {
    rows.push(headRow('hs', '두 영상 장면으로 가기', fs));
    rows.push(flowRow('jump', shared.map((e) => btnItem(e, EVENT_SHORT[e], fs, <TextBtn label={EVENT_SHORT[e]} onPress={() => o.onJump(e)} hint="A 를 그 장면으로 옮기고 B 는 기준대로 따라가요" />))));
    const anchors = shared.filter((e) => e === 'footContact' || e === 'release');
    if (anchors.length) rows.push(flowRow('anchor', anchors.map((e) => btnItem(e, `${EVENT_SHORT[e]}을 기준으로`, fs, <TextBtn label={`${EVENT_SHORT[e]}을 기준으로`} onPress={() => o.onAnchor(e)} />))));
  }
  const factsOf = (s: SourceRef | null): MediaFacts => s?.facts ?? EMPTY_FACTS;
  const intervals: IRow[] = [];
  for (const [from, to] of DEFAULT_INTERVALS) {
    const ia = a ? intervalOf(a.events, from, to, factsOf(a)) : null;
    const ib = b ? intervalOf(b.events, from, to, factsOf(b)) : null;
    if (!ia && !ib) continue;
    const cmp = compareInterval(ia, ib);
    const one = (iv: typeof ia) => (!iv ? '—' : iv.real != null ? durationText(iv.real, iv.plusMinus) : `재생 ${durationText(iv.presentation, null)}${iv.mapping === 'unknown' ? '(실제 시간 모름)' : ''}`);
    const diff = !b
      ? ''
      : cmp.basis === 'real'
        ? ` · 차이 ${cmp.diff >= 0 ? '+' : '−'}${durationText(Math.abs(cmp.diff), cmp.plusMinus)} (실제 시간)`
        : cmp.basis === 'presentation'
          ? ` · 차이 ${cmp.diff >= 0 ? '+' : '−'}${Math.abs(cmp.diff).toFixed(2)}초 (재생 시간 기준 · 슬로모션 여부 모름)`
          : cmp.reason === 'timebase'
            ? ' · 시간 축이 달라(슬로모션 · 일반) 견주지 않아요'
            : ' · 두 영상 모두 짚으면 견줘요';
    intervals.push(subRow(`iv${from}${to}`, `${EVENT_SHORT[from]} → ${EVENT_SHORT[to]} · A ${one(ia)}${b ? ` · B ${one(ib)}` : ''}${diff}`, w, fs));
  }
  if (intervals.length) rows.push(headRow('hi', '구간 시간', fs), ...intervals);
  if (o.metricRows.length) {
    rows.push(headRow('hm', '2D 참고 측정', fs));
    for (const r of o.metricRows) {
      const cmp = compareMetric(r.metric, r.a ? { geom: r.a.geom, aspect: r.aspectA, cal: a?.calibration ?? null, view: a?.view ?? null } : null, r.b ? { geom: r.b.geom, aspect: r.aspectB, cal: b?.calibration ?? null, view: b?.view ?? null } : null);
      const unit = (u: string) => (u === '°' ? '°' : u === 'cm' ? 'cm' : '(화면 비율)');
      const text = cmp.ok
        ? `A ${cmp.a.toFixed(1)}${unit(cmp.unit)} · B ${cmp.b.toFixed(1)}${unit(cmp.unit)} · 차이 ${cmp.diff >= 0 ? '+' : '−'}${Math.abs(cmp.diff).toFixed(1)}`
        : cmp.reason === 'viewUnknown'
          ? '촬영 방향을 정하면 견줘요(영상 정보)'
          : cmp.reason === 'view'
            ? '촬영 방향이 달라 견주지 않아요'
            : cmp.reason === 'unit'
              ? '길이 보정이 한쪽만 있어 견주지 않아요'
              : '두 영상에 같은 이름표를 그리면 견줘요';
      rows.push(subRow(`m${r.metric}`, `${METRIC_LABEL[r.metric]} · ${text}`, w, fs));
    }
    rows.push(subRow('mnote', '화면에 투영된 2D 값이에요. 촬영 방향 · 거리가 다르면 같은 자세도 다르게 보여요. 관절 부담 · 부상 위험은 이 값으로 셈하지 않아요.', w, fs));
  }
  if (!rows.length) rows.push(subRow('none', '멈춘 장면에서 \'지금 장면\'을 누르면 구간 시간이 생겨요. 잘 안 보이면 \'가려짐\'으로 두어요.', w, fs));
  return rows;
}

/** 크게 보기 — 같은 재생기를 화면 가득 한 번 더 붙인다. 보는 동안만 가로로 돌릴 수 있게 */
function ExpandView({ player, side, aspect, time, playLabel, canPlay, onToggle, onClose }: { player: VideoPlayer; side: SideKey; aspect: number; time: number; playLabel: string | null; canPlay: boolean; onToggle: () => void; onClose: () => void }) {
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
      <View style={{ flex: 1, backgroundColor: '#000', paddingTop: inset.top, paddingBottom: inset.bottom + 8, paddingLeft: inset.left + 12, paddingRight: inset.right + 12 }}>
        <View style={st.fullBar}>
          <Text style={st.fullTitle}>
            {side.toUpperCase()} 영상 · {clock(time)}
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
          <Press accessibilityRole="button" accessibilityLabel={playLabel} disabled={!canPlay} onPress={onToggle} style={[st.primary, { backgroundColor: 'rgba(255,255,255,0.16)', alignSelf: 'center', paddingHorizontal: 28 }, !canPlay && { opacity: 0.4 }]}>
            <Text maxFontSizeMultiplier={FS_MAX} style={[TYPE.button, { color: '#fff' }]}>
              {playLabel}
            </Text>
          </Press>
        ) : null}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 2 },
  barOverlay: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 10 },
  restore: { position: 'absolute', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  barButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  barMid: { flex: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  barTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center' },
  review: { flexDirection: 'row', alignItems: 'center' },
  saveFail: { minHeight: 32, marginHorizontal: 8, borderRadius: 8, paddingHorizontal: 10, justifyContent: 'center' },
  stage: { flex: 1, minHeight: 0 },
  inspWrap: { position: 'absolute', left: 6, right: 6, bottom: 6, alignItems: 'center' },
  status: { position: 'absolute', left: 8, right: 8, top: 6, fontSize: 13, lineHeight: 18, padding: 6, borderRadius: 8, overflow: 'hidden', textAlign: 'center' },
  controls: { paddingHorizontal: 8, gap: 2 },
  transport: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  play: { width: 56, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dock: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'stretch', minHeight: 48 },
  dockCol: { flex: 1, justifyContent: 'space-evenly', gap: 2 },
  dockItem: { flex: 1, minHeight: 48, minWidth: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 1, paddingHorizontal: 2 },
  dockText: { fontSize: 11, fontWeight: '600' },
  ctxRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  sideCol: { paddingHorizontal: 6, paddingTop: 4, justifyContent: 'flex-end' },
  ctxWrap: { flexWrap: 'wrap' },
  colorBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  colorDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2 },
  tile: { width: 64, minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 },
  tileText: { fontSize: 11, fontWeight: '600' },
  swatchHit: { width: 44, height: 44, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 24, height: 24, borderRadius: 7 },
  primary: { minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  fullBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  fullTitle: { color: '#fff', fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'], paddingLeft: 4 },
  fullClose: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  tag: { position: 'absolute', top: 6, color: '#fff', fontSize: 12, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(16,40,59,0.72)' },
});
