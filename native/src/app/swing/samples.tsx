import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { type Href, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SwingList } from '@/app/actions/swing-lab';
import { LAB_BAT_OPTIONS, LAB_MAX_VIDEO_BYTES, LAB_MAX_VIDEO_MB, LAB_VIEWS, type LabBat, type LabHand, type LabView } from '@/lib/pitch-lab-meta';
import { SWING_MARKER_NOTE, swingFrontBase, swingViewLabel, swingViewShort } from '@/lib/swing-lab-meta';
import { Badge, Bar, Chip, LoadState, s, useLoad } from '~/community/parts';
import { NumberInput } from '~/lab/parts';
import { useLabUpload, type LabSlowmo } from '~/lab/use-lab-upload';
import { PICK_ORIGINAL } from '~/pitch/attach';
import { SwingRow } from '~/swing/parts';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 3D 개발 관리자(앱) — 3D 스윙 분석 모델을 만들 타자 샘플 · 마커 샘플을 모으는 곳(2026-10-21 금윤호: "모델링은 우리가 찍어서 줄 수 있도록").
 * 대표관리자만(lib/permissions.ts 'dev3d') — 관리자 메뉴 · 3D 스윙 분석 머리 '샘플' 단추로 들어온다. 웹은 /admin/dev3d.
 * 위는 올리기(정면 · 포수 뒤 짝 + 촬영 정보, 마커 샘플이면 ③ · ④ 카메라도), 아래는 관리자끼리 본 샘플. 투구 샘플은 맨 위 줄로 /lab/samples.
 */
const FPS_OPTIONS = [
  { value: 'unknown', label: '모름' },
  { value: '120', label: '120' },
  { value: '240', label: '240' },
] as const;
const HAND_OPTIONS = [
  { value: 'R', label: '우타' },
  { value: 'L', label: '좌타' },
] as const;

export default function SwingSamplesScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<SwingList>('swing-lab.loadAppSwingList');
  const [tab, setTab] = useState<'sample' | 'marker'>('sample');
  const normal = data?.samples.filter((x) => !x.marker) ?? [];
  const markers = data?.samples.filter((x) => x.marker) ?? [];
  const shown = tab === 'marker' ? markers : normal;
  const isDev = data?.isDev;
  useEffect(() => {
    if (isDev === false) router.replace('/swing' as Href);
  }, [isDev]);
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="3D 개발 관리자" c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView
          contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: inset.bottom + 32 }, READABLE]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
        >
          <Text style={{ color: c.muted, fontSize: 15, lineHeight: 21, paddingHorizontal: 4 }}>
            3D 스윙 분석 모델을 만들 타자 영상을 모아요. 같은 스윙을 정면과 포수 뒤에서 함께 찍어 짝으로 올려 주세요.
          </Text>
          <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
            <LinkRow label="투구 샘플 · 마커 샘플" onPress={() => router.push('/lab/samples' as Href)} c={c} />
            <LinkRow label="3D 스윙 분석 사용자 화면" onPress={() => router.push('/swing' as Href)} c={c} />
            <LinkRow label="타자 촬영 안내" onPress={() => router.push(`/swing/guide?hand=${data.hand}` as Href)} c={c} last />
          </View>
          <View accessibilityRole="radiogroup" style={s.chips}>
            <Chip label={`타자 샘플 ${normal.length}`} on={tab === 'sample'} onPress={() => setTab('sample')} c={c} />
            <Chip label={`마커 샘플 ${markers.length}`} on={tab === 'marker'} onPress={() => setTab('marker')} c={c} />
          </View>
          <UploadCard key={tab} marker={tab === 'marker'} heightCm={data.heightCm} defaultHand={data.hand} onDone={() => void reload()} c={c} />
          {shown.length === 0 ? (
            <View style={{ padding: 24, gap: 6, alignItems: 'center' }}>
              <Text style={[s.title, { color: c.ink }]}>아직 올린 영상이 없어요</Text>
              <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center' }}>
                같은 스윙을 정면({swingFrontBase(data.hand)} 쪽)과 포수 뒤에서 찍은 영상을 짝으로 올려 주세요.
              </Text>
            </View>
          ) : (
            <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
              {shown.map((x, i) => (
                <SwingRow
                  key={x.id}
                  item={x}
                  name={`${x.marker ? '마커 샘플' : '스윙'} ${shown.length - i}`}
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

function LinkRow({ label, onPress, last, c }: { label: string; onPress: () => void; last?: boolean; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [s.row, { opacity: pressed ? 0.6 : 1 }, last ? null : { borderBottomWidth: 0.5, borderBottomColor: c.line }]}
    >
      <Text style={{ flex: 1, color: c.ink, fontSize: 17 }}>{label}</Text>
      <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
    </Pressable>
  );
}

/* ─────────────────────────── 올리기 ─────────────────────────── */

function UploadCard({ marker, heightCm, defaultHand, onDone, c }: { marker: boolean; heightCm: number | null; defaultHand: LabHand; onDone: () => void; c: Palette }) {
  const [fps, setFps] = useState<LabSlowmo>('unknown');
  const [hand, setHand] = useState<LabHand>(defaultHand);
  const [bat, setBat] = useState<LabBat | null>(null);
  const [height, setHeight] = useState(heightCm ? String(heightCm) : '');
  const [distance, setDistance] = useState<Record<LabView, string>>({ side: '', back: '' });
  const [memo, setMemo] = useState('');
  const [extras, setExtras] = useState<Partial<Record<'cam3' | 'cam4', ImagePicker.ImagePickerAsset>>>({});
  const [extraError, setExtraError] = useState<string | null>(null);
  const { picked, checking, progress, busy, error, pairBlock, ready, fpsWarn, autoSlowmo, pick, upload: send } = useLabUpload(hand, 'hit');
  const [seenAuto, setSeenAuto] = useState<LabSlowmo | null>(null);
  if (autoSlowmo !== seenAuto) {
    setSeenAuto(autoSlowmo);
    if (autoSlowmo) setFps(autoSlowmo);
  }

  const pickExtra = async (key: 'cam3' | 'cam4') => {
    setExtraError(null);
    const res = await ImagePicker.launchImageLibraryAsync(PICK_ORIGINAL);
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    if ((asset.fileSize ?? 0) > LAB_MAX_VIDEO_BYTES) return setExtraError(`영상은 ${LAB_MAX_VIDEO_MB}MB 이하만 올릴 수 있어요.`);
    setExtras((e) => ({ ...e, [key]: asset }));
  };

  const upload = async () => {
    const id = await send({
      slowmo: fps,
      hand,
      ground: 'flat',
      heightCm: height ? Number(height) : null,
      distances: Object.fromEntries(LAB_VIEWS.filter((v) => distance[v]).map((v) => [v, Number(distance[v])])),
      memo: memo.trim() || null,
      ...(bat ? { bat } : {}),
      kind: marker ? 'marker' : 'sample',
      ...(marker ? { extras } : {}),
    });
    if (!id) return;
    setMemo('');
    setExtras({});
    onDone();
  };

  return (
    <View style={{ borderRadius: 14, padding: 14, gap: 12, backgroundColor: c.card, boxShadow: c.float }}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>{marker ? '마커 샘플 올리기' : '타자 샘플 올리기'}</Text>
        <Text style={[s.meta, { color: c.muted }]}>
          {marker ? SWING_MARKER_NOTE : `두 폰으로 같은 스윙을 동시에 찍은 원본만 올릴 수 있어요. 영상 하나에 ${LAB_MAX_VIDEO_MB}MB까지예요.`}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {LAB_VIEWS.map((view) => {
          const p = picked[view];
          const pct = progress?.view === view ? progress.percent : null;
          return (
            <Pressable
              key={view}
              accessibilityRole="button"
              accessibilityLabel={`${swingViewLabel(view, hand)} 영상 고르기`}
              disabled={busy || checking != null}
              onPress={() => void pick(view)}
              style={{ flex: 1, minHeight: 96, borderRadius: 14, padding: 10, gap: 4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: p ? c.chip : c.page }}
            >
              <Text style={{ color: p ? c.link : c.ink, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>{swingViewLabel(view, hand)}</Text>
              <Text style={[s.meta, { color: c.muted }]} numberOfLines={1}>
                {checking === view ? '확인하는 중…' : p ? `${((p.asset.fileSize ?? 0) / 1024 / 1024).toFixed(1)}MB` : '눌러서 고르기'}
              </Text>
              {p?.fps != null ? <Badge text={`${Math.round(p.fps)}fps`} color={p.fps >= 100 ? c.ok : c.warn} c={c} /> : null}
              {pct != null ? <View style={{ position: 'absolute', left: 0, bottom: 0, height: 4, width: `${pct}%`, backgroundColor: c.action }} /> : null}
            </Pressable>
          );
        })}
      </View>
      {marker ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['cam3', 'cam4'] as const).map((key) => {
            const a = extras[key];
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void pickExtra(key)}
                style={{ flex: 1, minHeight: 72, borderRadius: 14, padding: 10, gap: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: a ? c.chip : c.page }}
              >
                <Text style={{ color: a ? c.link : c.ink, fontSize: 15, fontWeight: '600' }}>{key === 'cam3' ? '③ 카메라' : '④ 카메라'}</Text>
                <Text style={[s.meta, { color: c.muted }]}>{a ? `${((a.fileSize ?? 0) / 1024 / 1024).toFixed(1)}MB` : '있으면 고르기'}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={{ gap: 4 }}>
        <Text style={[s.label, { color: c.muted }]}>슬로모(초당 장수)</Text>
        <View accessibilityRole="radiogroup" style={s.chips}>
          {FPS_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} on={fps === o.value} onPress={() => setFps(o.value)} c={c} />
          ))}
        </View>
        <Text style={[s.label, { color: c.muted }]}>타석</Text>
        <View accessibilityRole="radiogroup" style={s.chips}>
          {HAND_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} on={hand === o.value} onPress={() => setHand(o.value)} c={c} />
          ))}
        </View>
        <Text style={[s.label, { color: c.muted }]}>배트</Text>
        <View accessibilityRole="radiogroup" style={s.chips}>
          {LAB_BAT_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} on={bat === o.value} onPress={() => setBat(bat === o.value ? null : o.value)} c={c} />
          ))}
        </View>
        <Text style={[s.label, { color: c.muted }]}>키(cm)</Text>
        <NumberInput value={height} onChange={setHeight} placeholder="175" c={c} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {LAB_VIEWS.map((v) => (
            <View key={v} style={{ flex: 1 }}>
              <Text style={[s.label, { color: c.muted }]}>{swingViewShort(v)} 폰까지(m)</Text>
              <NumberInput value={distance[v]} onChange={(x) => setDistance((d) => ({ ...d, [v]: x }))} placeholder="모름" c={c} />
            </View>
          ))}
        </View>
        <Text style={[s.label, { color: c.muted }]}>메모</Text>
        <TextInput
          value={memo}
          onChangeText={setMemo}
          maxLength={500}
          placeholder="예: 티 배팅, 몸쪽 높은 공"
          placeholderTextColor={c.muted}
          style={[s.input, { backgroundColor: c.page, color: c.ink }]}
        />
      </View>

      {fpsWarn ? <Text style={{ color: c.warn, fontSize: 15, lineHeight: 20 }}>{fpsWarn}</Text> : null}
      {error ? <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>{error}</Text> : null}
      {extraError ? <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>{extraError}</Text> : null}
      {pairBlock ? <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>{pairBlock}</Text> : null}

      <Pressable
        accessibilityRole="button"
        disabled={!ready}
        onPress={() => void upload()}
        style={[s.primary, { marginTop: 0, backgroundColor: c.action, opacity: ready || busy ? 1 : 0.4 }]}
      >
        <Text style={s.primaryText}>{progress ? `${swingViewShort(progress.view)} 영상 올리는 중 ${progress.percent}%` : busy ? '올리는 중…' : '짝으로 올리기'}</Text>
      </Pressable>
    </View>
  );
}
