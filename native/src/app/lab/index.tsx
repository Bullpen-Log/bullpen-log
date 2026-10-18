import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { type Href, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppLabList, AppLabListItem } from '@/app/actions/pitch-lab';
import { labPairBlock, labVideoBlock, type LabCapture } from '@/lib/pitch-lab-guard';
import type { LabGuideSection } from '@/lib/pitch-lab-guide';
import {
  LAB_GROUND_OPTIONS,
  LAB_MAX_VIDEO_BYTES,
  LAB_MAX_VIDEO_MB,
  LAB_VIEWS,
  labSideBase,
  labViewLabel,
  type LabGround,
  type LabHand,
  type LabMeta,
  type LabView,
} from '@/lib/pitch-lab-meta';
import { Badge, Bar, Chip, LoadState, s, useLoad } from '~/community/parts';
import { probeLabAsset, uploadLabVideo } from '~/lab/upload';
import { PICK_ORIGINAL } from '~/pitch/attach';
import { rpc } from '~/lib/rpc';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 3D 동작 분석 목록(앱 화면) — 웹 app/(app)/videos/lab/lab-client.tsx 를 옮겼다: 위는 옆 · 뒤 영상 짝 올리기, 아래는 올린 샘플(누르면 결과 화면
 * /lab/<id>, 지우기). 올리기 전 검사 · 짝 검사 · 지문은 웹과 같은 lib(pitch-lab-guard)로(~/lab/upload.ts), 서버 saveLabSample 이 한 번 더 본다.
 * 영상 펴서 나란히 보기는 결과 화면의 원본 두 칸이 대신한다. 마커 샘플은 보기만(올리기는 스크립트).
 */
type Loaded = Awaited<ReturnType<typeof loadAppLabList>>;
type Picked = { asset: ImagePicker.ImagePickerAsset; fps: number | null; cap: LabCapture & { fp: string } };

const FPS_OPTIONS = [
  { value: 'unknown', label: '모름' },
  { value: '120', label: '120' },
  { value: '240', label: '240' },
] as const;
const HAND_OPTIONS = [
  { value: 'R', label: '오른손' },
  { value: 'L', label: '왼손' },
] as const;
/** 샘플 번호(UUID v4 모양 — 사이트 isLabId) — 앱에는 crypto.randomUUID 가 없다. 사람마다 자기 폴더 안이라 Math.random 이면 겹칠 일이 없다 */
const newLabId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 3) | 8).toString(16);
  });
const toneColor = (tone: 'sky' | 'muted' | 'warn', c: Palette) => (tone === 'sky' ? c.sky : tone === 'warn' ? c.warn : undefined);

export default function LabListScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<Loaded>('pitch-lab.loadAppLabList');
  const [tab, setTab] = useState<'sample' | 'marker'>('sample');
  const normal = data?.samples.filter((x) => !x.marker) ?? [];
  const markers = data?.samples.filter((x) => x.marker) ?? [];
  const shown = tab === 'marker' ? markers : normal;
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="투구" title="3D 동작 분석" c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView
          contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: inset.bottom + 32 }, READABLE]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
        >
          {/* 웹 머리처럼 '베타' 표시 */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4 }}>
            <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginTop: 1, backgroundColor: c.skyTint }}>
              <Text style={{ color: c.skyStrong, fontSize: 12, fontWeight: '700' }}>베타</Text>
            </View>
            <Text style={{ flex: 1, color: c.muted, fontSize: 15, lineHeight: 21 }}>같은 공을 옆과 뒤에서 함께 찍어 올리면 몸의 움직임을 3D 로 보여 줘요.</Text>
          </View>
          {/* 마커 샘플(스티커를 붙여 3~4대로 찍은 정답지용)은 따로 — 2026-10-12 사용자: "기존 샘플과 다른 곳에" */}
          {markers.length > 0 ? (
            <View accessibilityRole="radiogroup" style={s.chips}>
              <Chip label={`샘플 ${normal.length}`} on={tab === 'sample'} onPress={() => setTab('sample')} c={c} />
              <Chip label={`마커 샘플 ${markers.length}`} on={tab === 'marker'} onPress={() => setTab('marker')} c={c} />
            </View>
          ) : null}
          {tab === 'sample' ? <UploadCard heightCm={data.heightCm} defaultHand={data.hand} onDone={() => void reload()} c={c} /> : null}
          {shown.length === 0 ? (
            <View style={{ padding: 24, gap: 6, alignItems: 'center' }}>
              <Text style={[s.title, { color: c.ink }]}>아직 올린 영상이 없어요</Text>
              <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center' }}>
                같은 공을 옆({labSideBase(data.hand)} 쪽)과 뒤(2루 쪽)에서 찍은 영상을 짝으로 올려 주세요.
              </Text>
            </View>
          ) : (
            <View style={[s.group, { backgroundColor: c.card }]}>
              {shown.map((x, i) => (
                <SampleRow
                  key={x.id}
                  item={x}
                  name={`${x.marker ? '마커 샘플' : '투구'} ${shown.length - i}`}
                  last={i === shown.length - 1}
                  onRemoved={() => void reload()}
                  c={c}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

/* ─────────────────────────── 올리기 ─────────────────────────── */

function UploadCard({ heightCm, defaultHand, onDone, c }: { heightCm: number | null; defaultHand: LabHand; onDone: () => void; c: Palette }) {
  const [picked, setPicked] = useState<Partial<Record<LabView, Picked>>>({});
  const [checking, setChecking] = useState<LabView | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [fps, setFps] = useState<'unknown' | '120' | '240'>('unknown');
  const [hand, setHand] = useState<LabHand>(defaultHand);
  const [ground, setGround] = useState<LabGround>('mound');
  const [height, setHeight] = useState(heightCm ? String(heightCm) : '');
  /* 폰마다 투수까지(m) — 1배여도 폰마다 화각이 달라 두 대를 따로 적는다 */
  const [distance, setDistance] = useState<Record<LabView, string>>({ side: '', back: '' });
  const [memo, setMemo] = useState('');
  const [progress, setProgress] = useState<{ view: LabView; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const busy = progress != null;
  const pairBlock = picked.side && picked.back ? labPairBlock(picked.side.cap, picked.back.cap) : null;
  const ready = LAB_VIEWS.every((v) => picked[v]) && !pairBlock && !busy && checking == null;

  const pick = async (view: LabView) => {
    setError(null);
    setBlocked(false);
    const res = await ImagePicker.launchImageLibraryAsync(PICK_ORIGINAL);
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    if ((asset.fileSize ?? 0) > LAB_MAX_VIDEO_BYTES) return setError(`영상은 ${LAB_MAX_VIDEO_MB}MB 이하만 올릴 수 있어요.`);
    setPicked((p) => ({ ...p, [view]: undefined }));
    setChecking(view);
    try {
      /*
       * 올리기 전 검사(GPU 0원) — 화면 녹화 · 30fps 급 · 낮은 해상도 · 줌 · 너무 짧으면 고르지 않고 까닭을 알린다(웹과 같은 규칙).
       * 2026-10-14 사용자: 이상한 영상으로 계속 실패해 GPU 비용이 나가지 않게.
       */
      const probe = await probeLabAsset(asset);
      const block = labVideoBlock(probe.info);
      if (block) {
        setError(`${labViewLabel(view, hand)} 영상: ${block}`);
        setBlocked(true);
        return;
      }
      setPicked((p) => {
        const next = { ...p, [view]: { asset, fps: probe.info.fps, cap: probe.capture } };
        /* 두 영상 다 고속(원본 슬로모)이면 촬영 정보의 슬로모 배수를 저절로 */
        const both = LAB_VIEWS.map((x) => next[x]?.fps);
        if (both.every((x): x is number => x != null && x >= 100)) setFps(Math.min(...both) >= 200 ? '240' : '120');
        return next;
      });
    } catch {
      setError('영상을 읽지 못했어요. 다시 골라 주세요.');
    } finally {
      setChecking(null);
    }
  };

  const known = LAB_VIEWS.map((v) => picked[v]?.fps).filter((x): x is number => x != null);
  const slow = known.filter((x) => x <= 65);
  /* 2026-10-15 사용자: "에어드롭으로 옮길 때 프레임이 떨어진다" — 웹과 같은 알림 */
  const fpsWarn =
    slow.length > 0
      ? `초당 ${Math.round(Math.min(...slow))}장 영상이에요. 슬로 모션으로 찍었다면 다른 폰으로 옮기며 원본이 바뀐 거예요. AirDrop 은 옵션에서 모든 사진 데이터를 켜고 다시 옮겨 주세요.`
      : known.length === 2 && Math.abs(known[0] - known[1]) > 0.1 * Math.max(...known)
        ? `두 영상의 초당 장수가 달라요(옆 ${Math.round(known[0])} · 뒤 ${Math.round(known[1])}). 같은 설정으로 찍었다면 옮기며 한쪽 원본이 바뀐 거예요.`
        : null;

  const upload = async () => {
    setError(null);
    setBlocked(false);
    const id = newLabId();
    try {
      for (const view of LAB_VIEWS) {
        setProgress({ view, percent: 0 });
        await uploadLabVideo(id, view, picked[view]!.asset, (percent) => setProgress({ view, percent }));
      }
      const meta: Omit<LabMeta, 'createdAt'> = {
        /* 늘 두 폰 동시 촬영 · 원본(2026-10-15) — 서버도 다르면 받지 않는다 */
        synced: true,
        slowmoFps: fps === 'unknown' ? null : (Number(fps) as 120 | 240),
        screenRecorded: false,
        hand,
        ground,
        heightCm: height ? Number(height) : null,
        distanceM: null,
        distances: Object.fromEntries(LAB_VIEWS.filter((v) => distance[v]).map((v) => [v, Number(distance[v])])),
        memo: memo.trim() || null,
        kind: 'sample',
        files: Object.fromEntries(
          LAB_VIEWS.map((v) => {
            const p = picked[v]!;
            return [
              v,
              {
                name: p.asset.fileName ?? '',
                size: p.asset.fileSize ?? 0,
                fp: p.cap.fp,
                ...(p.cap.startMs != null ? { at: new Date(p.cap.startMs).toISOString(), src: p.cap.timeSource ?? undefined } : {}),
                ...(p.cap.durationSec != null ? { dur: p.cap.durationSec } : {}),
              },
            ];
          })
        ),
      };
      const r = await rpc<{ ok: true } | { error: string }>('pitch-lab.saveLabSample', { id, meta });
      if ('error' in r) return setError(r.error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPicked({});
      setMemo('');
      onDone();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : '올리지 못했어요. 다시 해 주세요.');
    } finally {
      setProgress(null);
    }
  };

  return (
    <View style={{ borderRadius: 14, padding: 14, gap: 12, backgroundColor: c.card }}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>영상 올리기</Text>
        <Text style={[s.meta, { color: c.muted }]}>두 폰으로 같은 공을 동시에 찍은 원본만 올릴 수 있어요. 영상 하나에 {LAB_MAX_VIDEO_MB}MB까지예요.</Text>
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push(`/lab/guide?hand=${hand}` as Href)}
        style={({ pressed }) => [{ borderRadius: 12, padding: 12, gap: 2, backgroundColor: pressed ? c.line : c.page }]}
      >
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>촬영 안내 ›</Text>
        <Text style={[s.meta, { color: c.muted }]}>두 대 동시에 · 240fps 슬로 모션 · 1배 · 삼각대 · 원본 그대로</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {LAB_VIEWS.map((view) => {
          const p = picked[view];
          const pct = progress?.view === view ? progress.percent : null;
          return (
            <Pressable
              key={view}
              accessibilityRole="button"
              accessibilityLabel={`${labViewLabel(view, hand)} 영상 고르기`}
              disabled={busy || checking != null}
              onPress={() => void pick(view)}
              style={{ flex: 1, minHeight: 96, borderRadius: 14, padding: 10, gap: 4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: p ? c.chip : c.page }}
            >
              <Text style={{ color: p ? c.sky : c.ink, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>{labViewLabel(view, hand)}</Text>
              <Text style={[s.meta, { color: c.muted }]} numberOfLines={1}>
                {checking === view ? '확인하는 중…' : p ? `${((p.asset.fileSize ?? 0) / 1024 / 1024).toFixed(1)}MB` : '눌러서 고르기'}
              </Text>
              {p?.fps != null ? <Badge text={`${Math.round(p.fps)}fps`} color={p.fps >= 100 ? c.ok : c.warn} c={c} /> : null}
              {pct != null ? <View style={{ position: 'absolute', left: 0, bottom: 0, height: 4, width: `${pct}%`, backgroundColor: c.sky }} /> : null}
            </Pressable>
          );
        })}
      </View>

      <Pressable accessibilityRole="button" accessibilityState={{ expanded: infoOpen }} onPress={() => setInfoOpen((v) => !v)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>촬영 정보 {infoOpen ? '접기' : '펴기'}</Text>
      </Pressable>
      {infoOpen ? (
        <View style={{ gap: 4 }}>
          <Text style={[s.label, { color: c.muted }]}>던진 곳</Text>
          <View accessibilityRole="radiogroup" style={s.chips}>
            {LAB_GROUND_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} on={ground === o.value} onPress={() => setGround(o.value)} c={c} />
            ))}
          </View>
          <Text style={[s.label, { color: c.muted }]}>슬로모(초당 장수)</Text>
          <View accessibilityRole="radiogroup" style={s.chips}>
            {FPS_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} on={fps === o.value} onPress={() => setFps(o.value)} c={c} />
            ))}
          </View>
          <Text style={[s.label, { color: c.muted }]}>던지는 손</Text>
          <View accessibilityRole="radiogroup" style={s.chips}>
            {HAND_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} on={hand === o.value} onPress={() => setHand(o.value)} c={c} />
            ))}
          </View>
          <Text style={[s.label, { color: c.muted }]}>키(cm)</Text>
          <NumberInput value={height} onChange={setHeight} placeholder="175" c={c} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {LAB_VIEWS.map((v) => (
              <View key={v} style={{ flex: 1 }}>
                <Text style={[s.label, { color: c.muted }]}>{v === 'side' ? '옆 폰' : '뒤 폰'}까지 거리(m)</Text>
                <NumberInput value={distance[v]} onChange={(x) => setDistance((d) => ({ ...d, [v]: x }))} placeholder="모름" c={c} />
              </View>
            ))}
          </View>
          <Text style={[s.meta, { color: c.muted }]}>폰마다 투수까지 따로 재서 적어 주세요. 같은 1배여도 폰마다 찍히는 크기가 달라요.</Text>
          <Text style={[s.label, { color: c.muted }]}>메모</Text>
          <TextInput
            value={memo}
            onChangeText={setMemo}
            maxLength={500}
            placeholder="예: 직구, 세게"
            placeholderTextColor={c.muted}
            style={[s.input, { backgroundColor: c.page, color: c.ink }]}
          />
        </View>
      ) : null}

      {fpsWarn ? (
        <View style={{ borderRadius: 12, padding: 12, gap: 4, backgroundColor: c.page }}>
          <Text style={{ color: c.warn, fontSize: 14, lineHeight: 20 }}>{fpsWarn}</Text>
          <GuideLink label="원본 그대로 옮기는 법 ›" section="move" hand={hand} c={c} />
        </View>
      ) : null}
      {error ? <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>{error}</Text> : null}
      {pairBlock ? <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>{pairBlock}</Text> : null}
      {pairBlock ? <GuideLink label="두 폰으로 동시에 찍는 법 보기 ›" section="steps" hand={hand} c={c} /> : null}
      {error && blocked ? <GuideLink label="어떻게 찍으면 되는지 촬영 안내 보기 ›" section="checklist" hand={hand} c={c} /> : null}

      <Pressable
        accessibilityRole="button"
        disabled={!ready}
        onPress={() => void upload()}
        style={[s.primary, { marginTop: 0, backgroundColor: c.sky, opacity: ready || busy ? 1 : 0.4 }]}
      >
        <Text style={s.primaryText}>{progress ? `${progress.view === 'side' ? '옆' : '뒤'} 영상 올리는 중 ${progress.percent}%` : '짝으로 올리기'}</Text>
      </Pressable>
    </View>
  );
}

function GuideLink({ label, section, hand, c }: { label: string; section: LabGuideSection; hand: LabHand; c: Palette }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(`/lab/guide?hand=${hand}&s=${section}` as Href)} hitSlop={6} style={{ minHeight: 32, justifyContent: 'center' }}>
      <Text style={{ color: c.sky, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function NumberInput({ value, onChange, placeholder, c }: { value: string; onChange: (v: string) => void; placeholder: string; c: Palette }) {
  return (
    <TextInput
      value={value}
      onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, '').slice(0, 5))}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      placeholderTextColor={c.muted}
      style={[s.input, { backgroundColor: c.page, color: c.ink }]}
    />
  );
}

/* ─────────────────────────── 샘플 하나 ─────────────────────────── */

function SampleRow({ item, name, last, onRemoved, c }: { item: AppLabListItem; name: string; last: boolean; onRemoved: () => void; c: Palette }) {
  const [busy, setBusy] = useState(false);
  const remove = () =>
    Alert.alert('이 샘플을 지울까요?', '옆 · 뒤 영상과 촬영 정보가 함께 지워져요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const r = await rpc<{ ok: true } | { error: string }>('pitch-lab.removeLabSample', { id: item.id });
            if ('error' in r) return Alert.alert('지우지 못했어요', r.error);
            onRemoved();
          } catch {
            Alert.alert('지우지 못했어요', '신호가 약해 보내지 못했어요. 다시 해 주세요.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  return (
    <View style={[s.row, { opacity: busy ? 0.5 : 1 }, last ? null : { borderBottomWidth: 0.5, borderBottomColor: c.line }]}>
      <Pressable
        accessibilityRole="button"
        disabled={item.broken}
        onPress={() => router.push(`/lab/${item.id}` as Href)}
        style={({ pressed }) => [{ flex: 1, gap: 3, opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={{ color: c.ink, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
          {name}
          {item.when ? <Text style={[s.meta, { color: c.muted, fontWeight: '400' }]}>{`  ${item.when}`}</Text> : null}
        </Text>
        {item.broken ? (
          <Text style={[s.meta, { color: c.muted }]}>올리다 멈췄어요</Text>
        ) : item.chips.length > 0 ? (
          <Text style={[s.meta, { color: c.muted }]} numberOfLines={1}>
            {item.chips.join(' · ')}
          </Text>
        ) : null}
        {item.memo ? (
          <Text style={[s.meta, { color: c.ink }]} numberOfLines={1}>
            {item.memo}
          </Text>
        ) : null}
        {item.status ? <Badge text={item.status.text} color={toneColor(item.status.tone, c)} c={c} /> : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="샘플 지우기" disabled={busy} onPress={remove} hitSlop={6} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <SymbolView name="trash" size={18} tintColor={c.muted} />
      </Pressable>
    </View>
  );
}
