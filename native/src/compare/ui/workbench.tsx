import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { VideoView, type VideoPlayer } from 'expo-video';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActionSheetIOS, ActivityIndicator, Alert, AppState, BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MyVideoItem } from '@/lib/my-videos';
import { applyEdit, historyOf, SCENE_TOL, visibleList, WIDTHS, COLORS, type Annotation, type Geometry, type History, type MetricKey } from '~/compare/annotations';
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
  removeNote,
  rename,
  setActive,
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
import { anchorFromEvents, normalizedAnchors, timeOf, type PitchEvent, EVENT_SHORT } from '~/compare/pitch-events';
import { createAutosaver, SAVE_LABEL, type SaveState } from '~/compare/storage';
import { applyPick, beginPick, type PickChoice, type PickSlot } from '~/compare/source-pick';
import { compareOwner, compareStorage, deleteComparison, discardImported, holdPaths, refreshRecent, releaseHold, useCompareStore } from '~/compare/store';
import {
  buildNormalized,
  clock,
  COMPARE_RATES,
  normalizeFacts,
  offsetRange,
  rateLabel,
  startRange,
  stepFrom,
  stepInfo,
  syncQuality,
  trimmedRange,
  type RelRange,
} from '~/compare/timing';
import { phaseLabel, isBusy } from '~/compare/transport';
import type { DrawTool } from '~/compare/ui/annotation-layer';
import { Pane, type PaneDraw, type SideInfo, type SideKey } from '~/compare/ui/pane';
import { Chip, DrawPanel, EventsPanel, ExportPanel, NotesPanel, Row, SourceInfoSheet, Storyboard, TextSheet, exportPlanFor, type SpanChoice } from '~/compare/ui/panels';
import { SourcePicker } from '~/compare/ui/source-picker';
import { useCompareTransport } from '~/compare/ui/transport-hook';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';
import { bothMarked, navBack, navCompare, navOpenPick, navPickNext, navRealign, navRestore, navStart, navSwipeOk, relText, type CompareNav } from '~/videos/compare-math';
import { startPickUi } from '~/videos/filters';
import { Scrubber, ScrubLabels, playerCall } from '~/videos/player-parts';
import { useMyVideos } from '~/videos/store';
import { videoCaption, videoDateText } from '~/videos/text';

/**
 * 투구 영상 분석(2026-11-02 — 설계 docs/designs/sinker-pitch-video-workbench-plan.md). 한 문서(compare/doc.ts)를 고치며 자동으로 저장한다.
 * 단계: 고르기(pick) → 기준 맞추기(align) → 함께 보기(compare). B 가 없으면 한 영상 보기(single — align 단계에서 B 가 없을 때 그린다).
 * 뒤로 길은 compare-math 의 nav*(셀프테스트가 고리 없음을 본다). 짝 상태(기준 · 보기 · 반복)는 문서에 남아 B 를 바꿨다 돌아오면 그대로다.
 */
type Tool = 'align' | 'draw' | 'events' | 'notes' | 'export';
const TOOL_LABEL: Record<Tool, string> = { align: '맞추기', draw: '그리기', events: '투구 장면', notes: '메모', export: '내보내기' };

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
  const c = usePalette();
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
  /* 자세한 도구는 고를 때만 펼친다(F08 — 기본 화면은 영상 · 함께 재생 · 속도 · 맞추기만) */
  const [tool, setTool] = useState<Tool | null>(null);
  const [sheet, setSheet] = useState<null | { kind: 'note'; edit?: NoteRef } | { kind: 'label'; side: SideKey; p: Pt } | { kind: 'calibrate'; side: SideKey; geom: Geometry } | { kind: 'info'; side: SideKey } | { kind: 'title' }>(null);

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
  const back = () => {
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
  const pickRate = () => {
    const options = [...COMPARE_RATES.map(rateLabel), '취소'];
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1, title: '재생 속도' }, (i) => {
      const r = COMPARE_RATES[i];
      if (r == null) return;
      edit({ ...docRef.current, transport: { ...docRef.current.transport, rate: r } });
    });
  };
  const pickAudio = () => {
    const options = ['소리 없음', 'A 소리', 'B 소리', '취소'];
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 3, title: '들을 소리' }, (i) => {
      const audio = (['none', 'a', 'b'] as const)[i];
      if (!audio) return;
      edit({ ...docRef.current, transport: { ...docRef.current.transport, audio } });
    });
  };
  const togglePlay = () => {
    takeControl();
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
  const drawing = tool === 'draw' && (stage === 'compare' || single);
  /* 손가락으로 그리는 그 동안만 화면 굴림을 멈춘다(F08 — 그리기 도구를 켰다고 화면을 잠그면 영상 밑 도구에 못 간다) */
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
      { label: 'A 영상 정보', run: () => setSheet({ kind: 'info', side: 'a' }) },
    ];
    actions.push({ label: 'A 영상 바꾸기', run: () => openPick('a') });
    if (bSrc) {
      actions.push({ label: 'B 영상 바꾸기', run: () => openPick('b') });
      actions.push({ label: 'B 영상 정보', run: () => setSheet({ kind: 'info', side: 'b' }) });
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

  /* ---- 배치 ---- */
  const [bodyW, setBodyW] = useState<number | null>(null);
  const big = fontScale >= 1.3;
  const wide = winW > winH;
  const shape = big ? 'stack' : doc.transport.layout === 'auto' ? (wide ? 'side' : 'stack') : doc.transport.layout;
  /* 칸 폭은 실제로 받은 본문 폭(onLayout — READABLE 한도 · 안전 영역 · 분할 창이 이미 들어 있다). 재기 전엔 같은 셈으로 어림(F08) */
  const W = bodyW ?? Math.min(winW, 720) - 32 - 2 * Math.max(inset.left, inset.right);
  const aspA = sides.a?.aspect ?? aSrc?.facts?.displayAspect ?? 9 / 16;
  const aspB = sides.b?.aspect ?? bSrc?.facts?.displayAspect ?? 9 / 16;
  const boxAspect = Math.min(2, Math.max(0.45, single ? aspA : Math.min(aspA, aspB)));
  const colW = shape === 'side' && !single && !overlay.on ? (W - 12) / 2 : W;
  /* 세로로 쌓으면 두 칸이 화면을 다 먹지 않게 — 칸 높이는 창 높이의 31%(가로면 60%) 안 */
  const maxH = single || overlay.on ? winH * (wide ? 0.62 : 0.46) : shape === 'side' ? winH * (wide ? 0.6 : 0.42) : winH * 0.31;
  const boxH = Math.round(Math.min(colW / boxAspect, maxH));
  const box = { w: Math.round(Math.min(colW, boxH * boxAspect)), h: boxH };

  const labelOf = (s: SideKey) => {
    const src = srcOf(s);
    const item = itemOf(src?.path ?? null);
    return item ? videoDateText(item.date) : (src?.label ?? (src?.date ? videoDateText(src.date) : '영상'));
  };
  const subOf = (s: SideKey) => {
    const src = srcOf(s);
    const item = itemOf(src?.path ?? null);
    const log = item?.logs[0];
    const clip = item?.clip;
    const facts = [log ? `${log.type} ${log.count}구 · 투구 기록` : null, clip ? `구속 측정 ${clip.kmh.toFixed(1)}km/h · 카메라 측정` : null].filter(Boolean).join(' · ');
    return facts || (item ? (item.note ?? videoCaption(item)) : src?.origin === 'photos' ? '사진 앱에서 가져옴' : src?.origin === 'camera' ? '앱에서 촬영' : null);
  };
  const markTextOf = (s: SideKey) => {
    if (single) return '한 영상 보기';
    if (startBased) return '시작점 기준';
    const m = marks[s];
    return m != null ? `${ANCHOR_LABEL[semantic]} 기준 ${clock(m)}` : `${ANCHOR_LABEL[semantic]} 지정 전`;
  };
  const paneProps = (s: SideKey) => ({
    side: s,
    path: s === 'a' ? aPath : (bPath ?? ''),
    rate,
    time: times[s],
    box,
    width: colW,
    title: labelOf(s),
    sub: subOf(s),
    markText: markTextOf(s),
    marked: !single && !startBased && marks[s] != null,
    aligning: stage === 'align' && !single,
    focused: (stage === 'align' || tool === 'events' || tool === 'notes') && !single && focus === s,
    muted: doc.transport.audio !== s,
    view: shownView(s),
    onView: (v: ViewTransform) => setView(s, v),
    draw: paneDraw(s),
    onFocus: () => {
      setFocus(s);
      setEventSide(s);
      setDrawSide(s);
    },
    onInfo: s === 'a' ? infoA : infoB,
    onExpand: () => setExpand(s),
    onExit: back,
  });

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
  const focusReady = !!infoOf(focus)?.ready;
  const focusDur = infoOf(focus)?.duration ?? null;
  const F = focus.toUpperCase();
  const playLabel = phaseLabel(phase);
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
  const plan = exportPlanFor(range, loop, ma, mb, rate, overlay.on ? 'overlay' : shape === 'side' ? 'side' : 'stack', { normalized: !!normalized, approx: quality.state === 'approx', start: startBased });
  const storyRows = (['kneePeak', 'handSep', 'footContact', 'maxER', 'release', 'followThrough'] as PitchEvent[])
    .map((e) => ({ event: e, a: aSrc ? timeOf(aSrc.events, e) : null, b: bSrc ? timeOf(bSrc.events, e) : null }))
    .filter((r) => r.a != null || r.b != null);

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Stack.Screen options={{ gestureEnabled: swipeOk && !drawing }} />
      {/* 머리 — 뒤로 · 이름 · 저장 상태 · 더보기 */}
      <View style={[st.bar, { paddingTop: inset.top + 4, paddingLeft: inset.left + 8, paddingRight: inset.right + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={back} hitSlop={6} style={st.barButton}>
          <Icon name="back" size={22} color={c.link} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`비교 이름 ${doc.title}, 바꾸기`} onPress={() => setSheet({ kind: 'title' })} style={st.barMid}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.5} style={[st.barTitle, { color: c.ink }]}>
            {doc.title}
          </Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[TYPE.sub, { color: save === 'failed' || save === 'conflict' ? c.danger : c.muted }]} accessibilityLiveRegion="polite">
            {!doc.ownerId ? '로그인 확인 중 · 아직 저장 안 됨' : save === 'idle' ? (worthSaving(doc) ? '저장 중' : '투구 영상 분석') : SAVE_LABEL[save]}
          </Text>
        </Pressable>
        <Press accessibilityRole="button" accessibilityLabel="더보기" onPress={more} style={st.barButton}>
          <Icon name="settings2" size={22} color={c.link} />
        </Press>
      </View>
      <ScrollView
        scrollEnabled={!stroking}
        contentContainerStyle={[{ paddingHorizontal: 16 + Math.max(inset.left, inset.right), paddingTop: 4, gap: 14, paddingBottom: inset.bottom + (stage === 'align' && !single ? 200 : 40) }, READABLE]}
      >
        {review ? (
          <Row>
            <Text maxFontSizeMultiplier={1.5} style={[TYPE.sub, { color: c.muted, flex: 1 }]}>
              기준 A 고정 · B {review.index + 1}/{review.candidateIds.length}
            </Text>
            <Chip label="이전 B" onPress={() => (stopAll(), edit(moveReview(docRef.current, -1)))} />
            <Chip label="다음 B" onPress={() => (stopAll(), edit(moveReview(docRef.current, 1)))} />
          </Row>
        ) : null}
        {!single ? (
          <View style={st.subhead}>
            <Text maxFontSizeMultiplier={1.6} style={[TYPE.section, { color: c.ink, flex: 1 }]} accessibilityRole="header">
              {stage === 'align' ? '같은 동작에 맞추기' : '함께 보기'}
            </Text>
            {big ? null : (
              <Chip
                label={overlay.on ? '겹쳐 보기' : shape === 'side' ? '나란히' : '위아래'}
                onPress={() => {
                  const order = ['stack', 'side', 'overlay'] as const;
                  const cur = overlay.on ? 'overlay' : shape;
                  const next = order[(order.indexOf(cur as never) + 1) % order.length];
                  let d = updatePair(docRef.current, { overlay: { ...overlay, on: next === 'overlay' } });
                  if (next !== 'overlay') d = { ...d, transport: { ...d.transport, layout: next } };
                  edit(d);
                }}
                hint="위아래 · 나란히 · 겹쳐 보기를 바꿔요"
              />
            )}
          </View>
        ) : null}

        {/* 영상 칸 — 본문 폭을 여기서 잰다 */}
        <View
          onLayout={(e) => {
            const w = Math.round(e.nativeEvent.layout.width);
            if (w > 0 && w !== bodyW) setBodyW(w);
          }}
          style={shape === 'side' && !single && !overlay.on ? { flexDirection: 'row', gap: 12 } : { gap: 14 }}
        >
          <Pane key={aSrc?.id ?? 'a'} {...paneProps('a')} onReplace={() => openPick('a', errA && (errA.kind === 'missing' || errA.kind === 'gone') ? (aSrc?.id ?? null) : null)} />
          {bSrc ? (
            <Pane
              key={bSrc.id}
              {...paneProps('b')}
              hidden={overlay.on && stage === 'compare'}
              onReplace={() => openPick('b', errB && (errB.kind === 'missing' || errB.kind === 'gone') ? bSrc.id : null)}
            />
          ) : null}
        </View>
        {overlay.on && stage === 'compare' && pa && pb ? (
          <OverlayBox pa={pa} pb={pb} box={box} opacity={overlay.opacity} wipe={overlay.wipe} reg={overlay.reg} mirrorA={views.a.mirror} mirrorB={views.b.mirror} />
        ) : null}

        {single ? (
          <SinglePanel
            time={times.a}
            duration={sides.a?.duration ?? null}
            ready={readyA}
            stepText={stepOf('a').exact ? '한 장면' : '짐작한 장면 간격'}
            rate={rate}
            playLabel={playLabel}
            busy={isBusy(phase)}
            onScrub={(t) => userSeek(t)}
            onStart={() => (takeControl(), transport.pause())}
            onNudge={(d) => nudgeSide('a', d)}
            onToggle={togglePlay}
            onRate={pickRate}
            onAdd={() => openPick('b')}
          />
        ) : stage === 'align' ? (
          <View style={[st.panel, { backgroundColor: c.card }]}>
            <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.ink }]}>
              두 영상에서 같은 순간을 짚어 주세요.
            </Text>
            <Row wrap>
              {(['footContact', 'release', 'manual'] as AnchorSemantic[]).map((s) => (
                <Chip key={s} label={ANCHOR_LABEL[s]} on={semantic === s} onPress={() => chooseSemantic(s)} />
              ))}
            </Row>
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
                      {s.toUpperCase()} 장면
                    </Text>
                  </Press>
                );
              })}
            </View>
            <Text maxFontSizeMultiplier={1.6} style={[TYPE.card, { color: c.ink, fontVariant: ['tabular-nums'] }]}>
              {F} {clock(times[focus])}
            </Text>
            <Scrubber
              value={times[focus]}
              max={focusDur ?? 1}
              disabled={!focusReady}
              onStart={() => playerCall.pause(playerOf(focus))}
              onSeek={(t) => seekSide(focus, t)}
              step={stepOf(focus).step}
              label={`${F} 영상 장면 선택`}
              valueText={clock(times[focus])}
            />
            <ScrubLabels left="0:00" right={clock(focusDur)} />
            <View style={st.row}>
              <Press accessibilityRole="button" accessibilityLabel={`${F} 이전 장면`} disabled={!focusReady} onPress={() => nudgeSide(focus, -1)} style={st.iconBtn}>
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
                  {F} {ANCHOR_LABEL[semantic === 'start' ? 'manual' : semantic]}로 지정
                </Text>
              </Press>
              <Press accessibilityRole="button" accessibilityLabel={`${F} 다음 장면`} disabled={!focusReady} onPress={() => nudgeSide(focus, 1)} style={st.iconBtn}>
                <Icon name="chevron-right" size={24} color={focusReady ? c.link : c.muted} />
              </Press>
            </View>
            <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
              {stepOf(focus).exact ? '이전 · 다음은 이 영상의 한 장면씩이에요.' : '이전 · 다음은 짐작한 장면 간격이에요(장면 간격이 고른지 모름).'}
            </Text>
            {/* 영상별 다듬기(R09) — 이 짝에서 쓸 앞 · 뒤. 원본 파일은 그대로 */}
            <Row wrap>
              <Chip label={`${F} 여기부터`} disabled={!focusReady} onPress={() => trimHere(focus, 'start')} hint="이 장면 앞은 이 비교에서 안 써요" />
              <Chip label={`${F} 여기까지`} disabled={!focusReady} onPress={() => trimHere(focus, 'end')} hint="이 장면 뒤는 이 비교에서 안 써요" />
              {pair?.trims[focus] ? <Chip label={`${F} 다듬기 풀기`} onPress={() => edit(clearTrim(docRef.current, focus))} /> : null}
            </Row>
          </View>
        ) : (
          <View style={[st.panel, { backgroundColor: c.card }]}>
            <Text maxFontSizeMultiplier={1.5} style={[TYPE.sub, { color: quality.state === 'approx' ? c.danger : c.muted }]} accessibilityLiveRegion="polite">
              {syncLabel}
            </Text>
            <View style={st.row}>
              <Text maxFontSizeMultiplier={1.6} style={[TYPE.card, { color: c.ink, flex: 1, fontVariant: ['tabular-nums'] }]}>
                {startBased ? `처음부터 ${relText(rel)}` : `기준 장면 ${relText(rel)}`}
              </Text>
              <Chip label={doc.transport.audio === 'none' ? '소리 없음' : `${doc.transport.audio.toUpperCase()} 소리`} onPress={pickAudio} />
              <Chip label={rateLabel(rate)} onPress={pickRate} disabled={!canSync} />
            </View>
            <Scrubber
              value={rel}
              min={range?.min ?? 0}
              max={range?.max ?? 1}
              disabled={!canSync}
              onStart={() => (takeControl(), transport.pause())}
              onSeek={(t) => userSeek(t)}
              step={stepOf('a').step}
              label="함께 재생할 위치"
              valueText={relText(rel)}
            />
            <ScrubLabels left={range ? relText(loop?.min ?? range.min) : '—'} right={range ? relText(loop?.max ?? range.max) : '—'} />
            <View style={st.row}>
              <Press accessibilityRole="button" accessibilityLabel="두 영상 이전 장면" disabled={!canSync} onPress={() => nudgeRel(-1)} style={st.iconBtn}>
                <Icon name="chevron-left" size={24} color={canSync ? c.link : c.muted} />
              </Press>
              <Press
                accessibilityRole="button"
                accessibilityLabel={playLabel}
                accessibilityState={{ disabled: !canSync, busy: isBusy(phase) }}
                disabled={!canSync}
                onPress={togglePlay}
                style={[st.primary, { flex: 1, flexDirection: 'row', gap: 8, backgroundColor: c.action }, !canSync && { opacity: 0.4 }]}
              >
                {isBusy(phase) ? <ActivityIndicator color={c.onAction} /> : <Icon name={phase === 'playing' ? 'pause' : 'play'} size={20} color={c.onAction} />}
                <Text maxFontSizeMultiplier={1.4} style={[TYPE.button, { color: c.onAction }]}>
                  {playLabel}
                </Text>
              </Press>
              <Press accessibilityRole="button" accessibilityLabel="두 영상 다음 장면" disabled={!canSync} onPress={() => nudgeRel(1)} style={st.iconBtn}>
                <Icon name="chevron-right" size={24} color={canSync ? c.link : c.muted} />
              </Press>
            </View>
            {phase === 'error' ? (
              <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.danger }]}>
                두 영상을 같은 자리로 맞추지 못했어요. 다시 재생해 주세요.
              </Text>
            ) : null}
            {/* 도구 */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} accessibilityRole="tablist">
              {(Object.keys(TOOL_LABEL) as Tool[]).map((k) => (
                <Chip key={k} label={TOOL_LABEL[k]} on={tool === k} onPress={() => setTool(tool === k ? null : k)} />
              ))}
            </ScrollView>
            {tool === 'align' ? (
              <View style={{ gap: 8 }}>
                <Row wrap>
                  <Chip label="맞춘 장면으로" disabled={!canSync} onPress={() => userSeek(0)} />
                  <Chip label="장면 다시 맞추기" onPress={realign} />
                  <Chip label="여기서 반복 시작" disabled={!canSync} onPress={() => setLoopHere('start')} />
                  <Chip label="여기서 반복 끝" disabled={!canSync} onPress={() => setLoopHere('end')} />
                  {loop ? <Chip label="반복 풀기" onPress={() => edit(updatePair(docRef.current, { loop: null }))} /> : null}
                </Row>
                <Row wrap>
                  <Chip label="실제 시간" on={!normalized} onPress={() => edit(updatePair(docRef.current, { mode: 'offset' }))} />
                  <Chip
                    label="동작 길이 맞춤"
                    on={!!normalized}
                    disabled={!normOk}
                    hint={normOk ? '짚은 투구 장면들이 같은 자리에 오게 늘이고 줄여요' : '두 영상에 같은 투구 장면을 둘 이상 짚어야 해요'}
                    onPress={() => edit(updatePair(docRef.current, { mode: 'normalized' }))}
                  />
                </Row>
                {overlay.on ? (
                  <Row wrap>
                    <Text style={[TYPE.sub, { color: c.muted }]}>B 투명도</Text>
                    {[0.3, 0.5, 0.7].map((o) => (
                      <Chip key={o} label={`${Math.round(o * 100)}%`} on={Math.abs(overlay.opacity - o) < 0.01} onPress={() => edit(updatePair(docRef.current, { overlay: { ...overlay, opacity: o } }))} />
                    ))}
                    <Chip label={overlay.wipe == null ? '반반 나누기' : '나누기 끄기'} onPress={() => edit(updatePair(docRef.current, { overlay: { ...overlay, wipe: overlay.wipe == null ? 0.5 : null } }))} />
                  </Row>
                ) : null}
                {overlay.on ? (
                  /* 겹쳐 보기 자리 맞춤(R11) — B 를 A 의 몸 위에 손으로 맞춘다. 시간 맞춤과 따로 */
                  <Row wrap>
                    <Text style={[TYPE.sub, { color: c.muted }]}>B 자리</Text>
                    {(
                      [
                        ['left', '왼쪽'],
                        ['right', '오른쪽'],
                        ['up', '위'],
                        ['down', '아래'],
                        ['bigger', '크게'],
                        ['smaller', '작게'],
                      ] as const
                    ).map(([k, label]) => (
                      <Chip key={k} label={label} onPress={() => edit(updatePair(docRef.current, { overlay: { ...overlay, reg: nudgeReg(overlay.reg, k) } }))} hint={`겹친 B 를 ${label}로 조금`} />
                    ))}
                    <Chip label="자리 풀기" onPress={() => edit(updatePair(docRef.current, { overlay: { ...overlay, reg: { ...IDENTITY_REG } } }))} />
                  </Row>
                ) : null}
                <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
                  {normalized
                    ? '동작 길이 맞춤 · 실제 시간과 달라요. 짚은 첫 장면부터 마지막 장면까지만 재생하고, 걸린 시간 · 속도는 견주지 않아요.'
                    : '두 영상이 함께 재생되는 구간만 보여요. 기준은 A 를 주인 시계로 B 를 따라 맞춰요.'}
                </Text>
                {syncDetail ? (
                  <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
                    {syncDetail}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {tool === 'draw' ? (
              <DrawPanel
                tool={drawTool}
                onTool={(t) => {
                  setDrawTool(t);
                  setSelId(null);
                }}
                color={color}
                onColor={setColor}
                width={strokeW}
                onWidth={setStrokeW}
                span={span}
                onSpan={setSpan}
                hasLoop={!!loop}
                metric={metric}
                onMetric={setMetric}
                side={drawSide}
                onSide={setDrawSide}
                canUndo={history.past.length > 0}
                canRedo={history.future.length > 0}
                onUndo={() => applyHistory(applyEdit(history, { op: 'undo' }))}
                onRedo={() => applyHistory(applyEdit(history, { op: 'redo' }))}
                selected={selectedAnn}
                onDelete={() => selId && (applyHistory(applyEdit(history, { op: 'remove', id: selId })), setSelId(null))}
                onClear={() => {
                  const src = srcOf(drawSide);
                  if (!src) return;
                  const scope = { kind: 'scene' as const, sourceId: src.id, t: times[drawSide] };
                  const n = visibleList(history.items, src.id, times[drawSide]).filter((x) => x.span.kind !== 'always').length;
                  if (!n) return toast('이 장면에 지울 그림이 없어요.', 'info');
                  Alert.alert(`이 장면 그림 ${n}개를 지울까요?`, '되돌리기로 다시 살릴 수 있어요.', [
                    { text: '취소', style: 'cancel' },
                    { text: '지우기', style: 'destructive', onPress: () => applyHistory(applyEdit(history, { op: 'clear', scope })) },
                  ]);
                }}
                onCalibrate={() => {
                  pendingCal.current = drawSide;
                  setDrawTool('line');
                  toast('같은 평면에서 길이를 아는 두 점을 이어 선을 그려 주세요(예: 사람 키 · 막대).', 'info');
                }}
                calibrated={!!srcOf(drawSide)?.calibration}
                twoSides={!!bSrc}
              />
            ) : null}
            {tool === 'events' ? (
              <EventsPanel
                sides={{ a: aSrc, b: bSrc }}
                focus={eventSide}
                onFocus={setEventSide}
                times={times}
                onMark={(e) => markEvent(e, times[eventSide])}
                onObscure={(e) => markEvent(e, srcOf(eventSide)?.events[e] === 'obscured' ? null : 'obscured')}
                onClear={(e) => markEvent(e, null)}
                onJump={jumpEvent}
                onAnchorHere={anchorAt}
                metricRows={metricRows}
              />
            ) : null}
            {tool === 'notes' ? (
              <NotesPanel
                notes={pairNotes}
                labelOf={noteLabel}
                onAdd={() => setSheet({ kind: 'note' })}
                onOpen={openNote}
                onEdit={(n) => setSheet({ kind: 'note', edit: n })}
                onDelete={(n) => edit(removeNote(docRef.current, n.id))}
              />
            ) : null}
            {tool === 'export' ? (
              <ExportPanel plan={plan}>
                <Storyboard pa={pa} pb={pb} rows={storyRows} />
              </ExportPanel>
            ) : null}
          </View>
        )}

        {single ? (
          <View style={[st.panel, { backgroundColor: c.card }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {(['draw', 'events', 'notes'] as Tool[]).map((k) => (
                <Chip key={k} label={TOOL_LABEL[k]} on={tool === k} onPress={() => setTool(tool === k ? null : k)} />
              ))}
            </ScrollView>
            {tool === 'draw' ? (
              <DrawPanel
                tool={drawTool}
                onTool={setDrawTool}
                color={color}
                onColor={setColor}
                width={strokeW}
                onWidth={setStrokeW}
                span={span}
                onSpan={setSpan}
                hasLoop={false}
                metric={metric}
                onMetric={setMetric}
                side="a"
                onSide={() => undefined}
                canUndo={history.past.length > 0}
                canRedo={history.future.length > 0}
                onUndo={() => applyHistory(applyEdit(history, { op: 'undo' }))}
                onRedo={() => applyHistory(applyEdit(history, { op: 'redo' }))}
                selected={selectedAnn}
                onDelete={() => selId && (applyHistory(applyEdit(history, { op: 'remove', id: selId })), setSelId(null))}
                onClear={() => aSrc && applyHistory(applyEdit(history, { op: 'clear', scope: { kind: 'scene', sourceId: aSrc.id, t: times.a } }))}
                onCalibrate={() => {
                  pendingCal.current = 'a';
                  setDrawTool('line');
                  toast('같은 평면에서 길이를 아는 두 점을 이어 선을 그려 주세요.', 'info');
                }}
                calibrated={!!aSrc?.calibration}
                twoSides={false}
              />
            ) : null}
            {tool === 'events' ? (
              <EventsPanel
                sides={{ a: aSrc, b: null }}
                focus="a"
                onFocus={() => undefined}
                times={times}
                onMark={(e) => markEvent(e, times.a)}
                onObscure={(e) => markEvent(e, aSrc?.events[e] === 'obscured' ? null : 'obscured')}
                onClear={(e) => markEvent(e, null)}
                onJump={(e) => {
                  const t = aSrc ? timeOf(aSrc.events, e) : null;
                  if (t != null) userSeek(t);
                }}
                onAnchorHere={() => undefined}
                metricRows={[]}
              />
            ) : null}
            {tool === 'notes' ? (
              <NotesPanel notes={pairNotes} labelOf={noteLabel} onAdd={() => setSheet({ kind: 'note' })} onOpen={openNote} onEdit={(n) => setSheet({ kind: 'note', edit: n })} onDelete={(n) => edit(removeNote(docRef.current, n.id))} />
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {stage === 'align' && !single ? (
        <View style={[st.foot, { paddingBottom: inset.bottom + 12, backgroundColor: c.page, borderTopColor: c.line }]}>
          <Text maxFontSizeMultiplier={1.6} numberOfLines={2} style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]}>
            {errB ? 'B 영상을 확인하면 비교할 수 있어요.' : errA ? 'A 영상을 확인하면 비교할 수 있어요.' : bothMarked(marks) ? '두 영상의 기준 장면을 지정했어요.' : `A와 B에서 ${ANCHOR_LABEL[semantic === 'start' ? 'manual' : semantic]} 장면을 지정해 주세요.`}
          </Text>
          <Row>
            <Press accessibilityRole="button" accessibilityState={{ disabled: !bothReady }} disabled={!bothReady} onPress={startFromBeginning} style={[st.secondary, { borderColor: c.line }, !bothReady && { opacity: 0.4 }]}>
              <Text maxFontSizeMultiplier={1.3} style={[TYPE.buttonCompact, { color: c.link }]}>
                처음부터 보기
              </Text>
            </Press>
            <Press
              accessibilityRole="button"
              accessibilityState={{ disabled: !canStart }}
              disabled={!canStart}
              onPress={startCompare}
              style={[st.primary, { flex: 1, backgroundColor: c.action }, !canStart && { opacity: 0.4 }]}
            >
              <Text maxFontSizeMultiplier={1.4} style={[TYPE.button, { color: c.onAction }]}>
                맞춘 장면으로 비교
              </Text>
            </Press>
          </Row>
        </View>
      ) : null}

      {expand && expandPlayer ? (
        <ExpandView player={expandPlayer} side={expand} aspect={(expand === 'a' ? aspA : aspB) || boxAspect} time={times[expand]} playLabel={stage === 'compare' || single ? playLabel : null} canPlay={canSync} onToggle={togglePlay} onClose={() => setExpand(null)} />
      ) : null}

      {sheet?.kind === 'title' ? (
        <TextSheet title="비교 이름" initial={doc.title} placeholder="예: 11월 불펜 vs 10월" max={40} onClose={() => setSheet(null)} onDone={(t) => (edit(rename(docRef.current, t)), setSheet(null))} />
      ) : null}
      {sheet?.kind === 'note' ? (
        <TextSheet
          title={sheet.edit ? '메모 고치기' : `${noteSide.toUpperCase()} ${clock(times[noteSide])} 메모`}
          initial={sheet.edit?.text}
          placeholder="이 장면에서 본 것"
          onClose={() => setSheet(null)}
          onDone={(t) => {
            if (sheet.edit) edit(editNote(docRef.current, sheet.edit.id, t));
            else edit(addNote(docRef.current, { sourceId: srcOf(noteSide)?.id ?? null, t: times[noteSide], text: t }, nowIso()));
            setSheet(null);
          }}
        />
      ) : null}
      {sheet?.kind === 'label' ? (
        <TextSheet title="글 그림" placeholder="예: 팔꿈치 높이" max={60} onClose={() => setSheet(null)} onDone={(t) => (createAnn(sheet.side, { kind: 'label', p: sheet.p, text: t }), setSheet(null))} />
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
      {sheet?.kind === 'info' && srcOf(sheet.side) ? (
        <SourceInfoSheet src={srcOf(sheet.side) as SourceRef} onClose={() => setSheet(null)} onChange={(p) => edit(updateSource(docRef.current, (srcOf(sheet.side) as SourceRef).id, p))} />
      ) : null}
    </View>
  );
}

function SinglePanel({
  time,
  duration,
  ready,
  stepText,
  rate,
  playLabel,
  busy,
  onScrub,
  onStart,
  onNudge,
  onToggle,
  onRate,
  onAdd,
}: {
  time: number;
  duration: number | null;
  ready: boolean;
  stepText: string;
  rate: number;
  playLabel: string;
  busy: boolean;
  onScrub: (t: number) => void;
  onStart: () => void;
  onNudge: (d: 1 | -1) => void;
  onToggle: () => void;
  onRate: () => void;
  onAdd: () => void;
}) {
  const c = usePalette();
  return (
    <View style={[st.panel, { backgroundColor: c.card }]}>
      <View style={st.row}>
        <Text maxFontSizeMultiplier={1.6} style={[TYPE.card, { color: c.ink, flex: 1, fontVariant: ['tabular-nums'] }]}>
          {clock(time)}
        </Text>
        <Chip label={rateLabel(rate)} onPress={onRate} disabled={!ready} />
      </View>
      <Scrubber value={time} max={duration ?? 1} disabled={!ready} onStart={onStart} onSeek={onScrub} step={1 / 30} label="영상 위치" valueText={clock(time)} />
      <ScrubLabels left="0:00" right={clock(duration)} />
      <View style={st.row}>
        <Press accessibilityRole="button" accessibilityLabel="이전 장면" disabled={!ready} onPress={() => onNudge(-1)} style={st.iconBtn}>
          <Icon name="chevron-left" size={24} color={ready ? c.link : c.muted} />
        </Press>
        <Press
          accessibilityRole="button"
          accessibilityLabel={playLabel === '함께 재생' ? '재생' : playLabel === '함께 멈춤' ? '멈춤' : playLabel}
          disabled={!ready}
          onPress={onToggle}
          style={[st.primary, { flex: 1, flexDirection: 'row', gap: 8, backgroundColor: c.action }, !ready && { opacity: 0.4 }]}
        >
          {busy ? <ActivityIndicator color={c.onAction} /> : <Icon name={playLabel === '함께 멈춤' ? 'pause' : 'play'} size={20} color={c.onAction} />}
          <Text maxFontSizeMultiplier={1.4} style={[TYPE.button, { color: c.onAction }]}>
            {playLabel === '함께 재생' ? '재생' : playLabel === '함께 멈춤' ? '멈춤' : playLabel}
          </Text>
        </Press>
        <Press accessibilityRole="button" accessibilityLabel="다음 장면" disabled={!ready} onPress={() => onNudge(1)} style={st.iconBtn}>
          <Icon name="chevron-right" size={24} color={ready ? c.link : c.muted} />
        </Press>
      </View>
      <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
        이전 · 다음: {stepText}
      </Text>
      <Press accessibilityRole="button" onPress={onAdd} style={[st.primary, { backgroundColor: withAlpha(c.action, 0.12) }]}>
        <Text maxFontSizeMultiplier={1.4} style={[TYPE.button, { color: c.link }]}>
          비교 영상 추가
        </Text>
      </Press>
    </View>
  );
}

/** 겹쳐 보기(R11) — A 위에 B 를 투명하게(또는 반반 나눠). 시간 맞춤과 따로, 공간 맞춤(reg)은 손으로. 원본 칸은 '나란히'로 언제든 */
function OverlayBox({
  pa,
  pb,
  box,
  opacity,
  wipe,
  reg,
  mirrorA,
  mirrorB,
}: {
  pa: VideoPlayer;
  pb: VideoPlayer;
  box: { w: number; h: number };
  opacity: number;
  wipe: number | null;
  reg: { dx: number; dy: number; scale: number };
  mirrorA: boolean;
  mirrorB: boolean;
}) {
  const c = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ width: box.w, height: box.h, alignSelf: 'center', borderRadius: 16, overflow: 'hidden', backgroundColor: '#0e1a26' }} accessible accessibilityLabel={`겹쳐 보기, B 투명도 ${Math.round(opacity * 100)}%`}>
        <View style={[StyleSheet.absoluteFill, { transform: [{ scaleX: mirrorA ? -1 : 1 }] }]} pointerEvents="none">
          <VideoView player={pa} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
        </View>
        <View
          pointerEvents="none"
          style={[
            wipe != null ? { position: 'absolute', top: 0, bottom: 0, left: box.w * wipe, right: 0, overflow: 'hidden' } : StyleSheet.absoluteFill,
            { opacity: wipe != null ? 1 : opacity },
          ]}
        >
          <View style={{ position: 'absolute', top: 0, bottom: 0, width: box.w, left: wipe != null ? -box.w * wipe : 0, transform: [{ translateX: reg.dx * box.w }, { translateY: reg.dy * box.h }, { scale: reg.scale }, { scaleX: mirrorB ? -1 : 1 }] }}>
            <VideoView player={pb} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
          </View>
        </View>
        {wipe != null ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: box.w * wipe - 1, width: 2, backgroundColor: '#fff' }} /> : null}
        <Text style={[st.tag, { left: 8 }]}>A</Text>
        <Text style={[st.tag, { right: 8, backgroundColor: c.action }]}>B</Text>
      </View>
    </View>
  );
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
            <Text maxFontSizeMultiplier={1.4} style={[TYPE.button, { color: '#fff' }]}>
              {playLabel}
            </Text>
          </Press>
        ) : null}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6, minHeight: 56, gap: 4 },
  barButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  barMid: { flex: 1, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  barTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.4 },
  subhead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  panel: { borderRadius: 20, padding: 16, gap: 10 },
  segment: { flexDirection: 'row', borderRadius: 14, padding: 3, gap: 3 },
  segItem: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  primary: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  secondary: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  fullBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  fullTitle: { color: '#fff', fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'], paddingLeft: 4 },
  fullClose: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  tag: { position: 'absolute', top: 8, color: '#fff', fontSize: 12, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(16,40,59,0.72)' },
});
