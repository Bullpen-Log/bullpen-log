import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createDocument, type ComparisonDocument, type NewSource } from '~/compare/doc';
import { compareStorage, importForCompare, useCompareStore } from '~/compare/store';
import { todayVsPast } from '~/compare/sources';
import { sourceFromItem, Workbench } from '~/compare/ui/workbench';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { dateKeyOf } from '~/pitch/api';
import { useAllLogs } from '~/pitch/store';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';
import { startPickUi } from '~/videos/filters';
import { VideoGallery } from '~/videos/gallery';
import { useMyVideos } from '~/videos/store';
import { todayKey } from '~/videos/text';

/**
 * 투구 영상 비교 · 분석(2026-11-02 — 설계 docs/designs/sinker-pitch-video-workbench-plan.md, 계약 R01~R42).
 *
 * 들어오는 길:
 * - 투구 탭 '영상 비교'(?new=1) — 영상 하나 또는 둘을 고른다(내 영상 · 투구 기록 영상 · 사진 앱 · 바로 촬영). 하나면 바로 보고, 둘이면 기준 맞추기.
 * - 최근 비교(?doc=) — 저장한 그대로(멈춘 채, 기준 · 속도 · 그림 · 자리).
 * - 내 영상 상세(?a=&src=my-videos) — B 고르기부터. 뒤로는 상세로.
 * - 투구 기록 2분할(?a=&b=) — 기준 맞추기부터. 뒤로는 그 목록으로.
 * - 인자 없음(메카닉 화면) — 기록 영상 둘을 고르는 목록 → 기준 맞추기.
 * 모든 길이 같은 비교 엔진(compare/ui/workbench.tsx)을 쓴다. 이 화면 주소는 /pitch/* 라 출시 전 베타 정책이 정한 대로 열리고 잠긴다.
 */
export default function PitchCompareScreen() {
  const params = useLocalSearchParams<{ a?: string; al?: string; b?: string; bl?: string; src?: string; doc?: string; new?: string }>();
  const { owner } = useCompareStore();
  const { items } = useMyVideos();
  const [made, setMade] = useState<{ doc: ComparisonDocument; stage: 'pick' | 'align' | 'compare'; exitIsBack: boolean; onExit: () => void } | null>(null);
  /* 주소로 영상이 정해져 온 길(내 영상 · 2분할) — 처음 그릴 때 한 번 문서를 만든다 */
  const [fromParams] = useState<ComparisonDocument | null>(() => {
    if (!params.a) return null;
    const it = (p: string) => items?.find((v) => v.path === p) ?? null;
    const srcs: NewSource[] = [sourceFromItem(it(params.a), params.a, params.al ?? null)];
    if (params.b) srcs.push(sourceFromItem(it(params.b), params.b, params.bl ?? null));
    return createDocument(owner ?? '', srcs, new Date().toISOString());
  });

  if (params.doc) return <DocLoader id={params.doc} />;
  if (made) return <Workbench key={made.doc.id} initial={made.doc} start={made.stage} onExit={made.onExit} exitIsBack={made.exitIsBack} />;
  if (fromParams) return <Workbench initial={fromParams} start={params.b ? 'align' : 'pick'} onExit={() => router.back()} exitIsBack />;
  if (params.new)
    return (
      <StartPicker
        onPick={(srcs) => setMade({ doc: createDocument(owner ?? '', srcs, new Date().toISOString()), stage: 'align', exitIsBack: true, onExit: () => router.back() })}
        onBack={() => router.back()}
      />
    );
  return (
    <LogPicker
      onPick={(a, b) =>
        setMade({
          doc: createDocument(owner ?? '', [sourceFromItem(null, a.path, a.label), sourceFromItem(null, b.path, b.label)].map((s) => ({ ...s, origin: 'log' as const })), new Date().toISOString()),
          stage: 'align',
          exitIsBack: false,
          onExit: () => setMade(null),
        })
      }
    />
  );
}

/** 저장한 비교 열기 — 다른 계정 · 새 판 · 깨진 문서는 고치지 않고 까닭을 보인다 */
function DocLoader({ id }: { id: string }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { owner } = useCompareStore();
  const [r, setR] = useState<{ doc: ComparisonDocument } | { error: string } | null>(null);
  useEffect(() => {
    const st = compareStorage();
    if (!owner || !st) return;
    let alive = true;
    void st.load(id).then((x) => {
      if (!alive) return;
      if (x.ok) setR({ doc: x.doc });
      else
        setR({
          error:
            x.reason === 'missing'
              ? '이 비교를 이 기기에서 찾지 못했어요. 지웠거나 다른 기기에서 만든 비교예요.'
              : x.reason === 'owner'
                ? '다른 계정의 비교라 열 수 없어요.'
                : x.reason === 'newer'
                  ? '새 버전 앱에서 저장한 비교예요. 앱을 업데이트하면 열려요.'
                  : '비교 파일이 깨져 열지 못했어요.',
        });
    });
    return () => {
      alive = false;
    };
  }, [id, owner]);
  if (r && 'doc' in r) return <Workbench initial={r.doc} start={r.doc.active.b ? (r.doc.pairs.some((p) => p.a === r.doc.active.a && p.b === r.doc.active.b && (p.semantic === 'start' || (p.anchors.a != null && p.anchors.b != null))) ? 'compare' : 'align') : 'align'} onExit={() => router.back()} exitIsBack />;
  return (
    <View style={{ flex: 1, backgroundColor: c.page, paddingTop: inset.top + 4 }}>
      <View style={st.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} hitSlop={6} style={st.barButton}>
          <Icon name="back" size={22} color={c.link} />
        </Pressable>
      </View>
      <View style={st.center}>
        {r && 'error' in r ? (
          <Text maxFontSizeMultiplier={1.6} style={[TYPE.body, { color: c.ink, textAlign: 'center' }]}>
            {r.error}
          </Text>
        ) : (
          <>
            <ActivityIndicator />
            <Text style={[TYPE.sub, { color: c.muted }]}>{owner ? '비교를 여는 중' : '로그인을 확인하는 중'}</Text>
          </>
        )}
      </View>
    </View>
  );
}

/** 처음 고르기 — 내 영상(투구 기록 영상 포함)에서 하나 · 둘, 또는 사진 앱 · 바로 촬영. 기록 · 업로드 없이 바로 비교 */
function StartPicker({ onPick, onBack }: { onPick: (s: NewSource[]) => void; onBack: () => void }) {
  const { items } = useMyVideos();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /* 고르기 조건은 내 영상 목록의 조건으로 연다(B 고르기와 같은 규칙) */
  useEffect(() => startPickUi(), []);
  const itemOf = (p: string) => items?.find((v) => v.path === p) ?? null;
  const pair = useMemo(() => (items ? todayVsPast(items, todayKey()) : null), [items]);
  const imp = async (kind: 'photos' | 'camera') => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await importForCompare(kind, kind === 'photos' && picked.length === 0);
      if (!Array.isArray(r)) {
        toast(
          r.error === 'permission'
            ? '카메라 권한이 없어요. 설정 › 싱커에서 카메라를 켜 주세요.'
            : r.error === 'owner'
              ? '로그인을 확인하는 중이에요. 잠시 뒤 다시 해 주세요.'
              : '영상을 가져오지 못했어요. 저장 공간을 확인하고 다시 해 주세요.',
          'error'
        );
        return;
      }
      if (!r.length) return;
      /* 이미 고른 게 하나 있으면 그것이 A, 가져온 것이 B */
      const fromList = picked.slice(0, 2 - r.length).map((p) => sourceFromItem(itemOf(p), p));
      onPick([...fromList, ...r].slice(0, 2));
    } finally {
      setBusy(false);
    }
  };
  const actions = [
    { label: '사진 앱에서', icon: 'image-plus' as const, onPress: () => void imp('photos'), busy },
    { label: '바로 촬영', icon: 'video' as const, onPress: () => void imp('camera'), busy },
    ...(pair && picked.length === 0
      ? [{ label: '오늘 vs 지난 투구', icon: 'film' as const, onPress: () => onPick([sourceFromItem(pair.today, pair.today.path), sourceFromItem(pair.past, pair.past.path)]) }]
      : []),
  ];
  return (
    <VideoGallery
      pick={{
        a: null,
        aPath: '',
        selected: null,
        onSelect: () => undefined,
        onBack,
        next: { label: picked.length >= 2 ? '두 영상 비교' : '이 영상 열기', onPress: () => picked.length && onPick(picked.map((p) => sourceFromItem(itemOf(p), p))) },
        start: {
          picked,
          onToggle: (v) => setPicked((cur) => (cur.includes(v.path) ? cur.filter((x) => x !== v.path) : cur.length >= 2 ? [cur[1], v.path] : [...cur, v.path])),
          actions,
        },
      }}
    />
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
            label: `${Number(dateKeyOf(l.date).slice(5, 7))}/${Number(dateKeyOf(l.date).slice(8))} ${l.sessionType}${l.videoPaths.length > 1 ? ` · 영상 ${i + 1}` : ''}`,
          }))
        ),
    [all.logs]
  );
  const toggle = (v: LogPick) => setPicked((p) => (p.some((x) => x.key === v.key) ? p.filter((x) => x.key !== v.key) : p.length >= 2 ? [p[1], v] : [...p, v]));

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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  primary: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderRadius: 14, paddingHorizontal: 14 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
