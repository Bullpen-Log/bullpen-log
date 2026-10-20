import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { createUploadTask, FileSystemUploadType } from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toDateKey } from '@/lib/pitch-stats';
import { PITCH_TYPES } from '@/lib/velocity-meta';
import { Bar, BarButton, Chip, s } from '~/community/parts';
import { PICK_ORIGINAL } from '~/pitch/attach';
import { rpc } from '~/lib/rpc';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';

/**
 * 구속 측정 관리자의 '영상 올리기'(앱) — 웹 app/(app)/admin/velocity/mobile-upload.tsx 를 옮겼다: 사진 앱의 투구 영상 여러 개를 골라 스피드건 값만
 * 적고 한 번에 올린다. 폰에서 재지 않고 '수기'(스피드건 값)로 저장 — 카메라 값은 PC 구속 측정 관리자의 '이 영상으로 다시 재기'로 채운다.
 * 한 번에 올린 영상들은 세션 하나(영상 파일 · 보정용)의 공들. 공을 먼저 저장하고 영상을 하나씩(디스크에서 바로) 올린다 — 영상이 실패하면
 * 그 줄만 다시. 관리자 한도(500MB, 사이트 lib/storage.ts ADMIN_MAX_VIDEO_BYTES)를 넘는 영상은 고를 때 막는다.
 */
const MAX_BYTES = 500 * 1024 * 1024;
const CAMERA_OPTIONS = [
  { value: 'behind-pitcher', label: '투수 뒤' },
  { value: 'behind-catcher', label: '포수 뒤' },
] as const;

type Item = {
  key: number;
  asset: ImagePicker.ImagePickerAsset;
  gun: string;
  type: string | null;
  pitchId: string | null;
  state: 'ready' | 'saving' | 'uploading' | 'done' | 'error';
  percent: number | null;
  error: string | null;
};
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)}MB`;

export default function VelocityUploadScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const seq = useRef(0);
  const [items, setItems] = useState<Item[]>([]);
  const [cameraPos, setCameraPos] = useState<'behind-pitcher' | 'behind-catcher'>('behind-pitcher');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = (key: number, p: Partial<Item>) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...p } : it)));

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ ...PICK_ORIGINAL, allowsMultipleSelection: true, selectionLimit: 30 });
    if (res.canceled) return;
    setItems((list) => [
      ...list,
      ...res.assets.map((asset): Item => {
        const big = (asset.fileSize ?? 0) > MAX_BYTES;
        return {
          key: ++seq.current,
          asset,
          gun: '',
          type: null,
          pitchId: null,
          state: big ? 'error' : 'ready',
          percent: null,
          error: big ? `${mb(asset.fileSize ?? 0)} — 500MB 까지예요. 사진 앱에서 잘라 주세요` : null,
        };
      }),
    ]);
  };
  const gunOf = (it: Item) => {
    const v = Number(it.gun.replace(',', '.'));
    return it.gun.trim() && v >= 20 && v <= 200 ? Math.round(v * 10) / 10 : null;
  };

  /* 영상 하나 — 공은 이미 저장됨. 웹 uploadClip 과 같은 길(createClipUpload → PUT → attachClip) */
  const uploadOne = async (it: Item, pitchId: string) => {
    patch(it.key, { state: 'uploading', percent: 0, error: null, pitchId });
    const mime = it.asset.mimeType ?? 'video/quicktime';
    const bytes = it.asset.fileSize ?? 1;
    const sec = it.asset.duration ? it.asset.duration / 1000 : null;
    try {
      const target = await rpc<{ ok: true; signedUrl: string; path: string } | { ok: false; error: string }>('velocity.createClipUpload', pitchId, mime, bytes);
      if (!target.ok) throw new Error(target.error);
      const task = createUploadTask(
        target.signedUrl,
        it.asset.uri,
        { httpMethod: 'PUT', uploadType: FileSystemUploadType.BINARY_CONTENT, headers: { 'content-type': mime } },
        (p) => p.totalBytesExpectedToSend > 0 && patch(it.key, { percent: Math.round((p.totalBytesSent / p.totalBytesExpectedToSend) * 100) })
      );
      const put = await task.uploadAsync();
      if (!put || put.status < 200 || put.status >= 300) throw new Error('업로드에 실패했어요.');
      const attached = await rpc<{ ok: true } | { ok: false; error: string }>('velocity.attachClip', pitchId, { path: target.path, bytes, sec, mime, eventSec: null });
      if (!attached.ok) throw new Error(attached.error);
      patch(it.key, { state: 'done', percent: 100 });
    } catch (e) {
      patch(it.key, { state: 'error', percent: null, error: `공은 저장했지만 영상을 못 올렸어요: ${e instanceof Error && e.message ? e.message : '다시 해 주세요'}` });
    }
  };

  const submit = async () => {
    setError(null);
    const ready = items.filter((it) => it.state === 'ready');
    const retry = items.filter((it) => it.state === 'error' && it.pitchId);
    const missing = ready.filter((it) => gunOf(it) == null);
    if (missing.length > 0) {
      for (const it of missing) patch(it.key, { error: '스피드건 값(20~200)을 적어 주세요' });
      return setError(`스피드건 값이 없는 영상 ${missing.length}개 — 적은 뒤 올려요`);
    }
    if (ready.length === 0 && retry.length === 0) return;
    setBusy(true);
    try {
      for (const it of retry) await uploadOne(it, it.pitchId!);
      if (ready.length > 0) {
        for (const it of ready) patch(it.key, { state: 'saving', error: null });
        let saved: { ok: true; pitchIds?: string[] } | { ok: false; error: string };
        try {
          saved = await rpc('velocity.saveVelocitySession', {
            date: toDateKey(new Date()),
            sessionType: '불펜',
            effortPct: 50,
            fovDeg: 69,
            source: 'file',
            device: `휴대폰 올리기 · ${ready.length}개`,
            cameraPos,
            net: false,
            forCalibration: true,
            autoMode: false,
            focalPx: null,
            frameW: null,
            frameH: null,
            releaseDistM: null,
            pitches: ready.map((it) => {
              const gunKmh = gunOf(it)!;
              return {
                manual: true,
                rawKmh: gunKmh,
                errorKmh: 0,
                confidence: 'low' as const,
                releaseKmh: null,
                releaseDxCm: null,
                releaseDyCm: null,
                releaseDistM: null,
                travelM: null,
                durationSec: null,
                frames: null,
                fps: null,
                autoDetected: false,
                pitchType: it.type,
                zone: null,
                result: null,
                gunKmh,
                memo: (it.asset.fileName ?? '').slice(0, 100) || null,
              };
            }),
          });
        } catch {
          saved = { ok: false, error: '신호가 약해 보내지 못했어요. 다시 해 주세요.' };
        }
        if (!saved.ok) {
          for (const it of ready) patch(it.key, { state: 'ready' });
          return setError(saved.error);
        }
        const ids = saved.pitchIds ?? [];
        for (let i = 0; i < ready.length; i++) {
          const id = ids[i];
          if (id) await uploadOne(ready[i], id);
          else patch(ready[i].key, { state: 'error', error: '공을 저장하지 못했어요' });
        }
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } finally {
      setBusy(false);
    }
  };

  const done = items.length > 0 && items.every((it) => it.state === 'done');
  const pending = items.filter((it) => it.state === 'ready' || (it.state === 'error' && it.pitchId)).length;
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="구속 측정" title="영상 올리기" right={done ? <BarButton label="완료" onPress={() => router.back()} c={c} /> : undefined} c={c} />
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: inset.bottom + 32 }, READABLE]} keyboardShouldPersistTaps="handled">
        <Text style={{ color: c.muted, fontSize: 15, lineHeight: 21, paddingHorizontal: 4 }}>
          투구 영상을 고르고 스피드건 값을 적어 올려요. 카메라 값은 PC 에서 &apos;다시 재기&apos;로 채워요.
        </Text>
        <Text style={[s.label, { color: c.muted }]}>카메라 자리(모든 영상)</Text>
        <View accessibilityRole="radiogroup" style={s.chips}>
          {CAMERA_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} on={cameraPos === o.value} onPress={() => setCameraPos(o.value)} c={c} />
          ))}
        </View>
        {items.map((it) => (
          <ItemCard
            key={it.key}
            it={it}
            disabled={busy}
            onGun={(gun) => patch(it.key, { gun, error: null })}
            onType={(type) => patch(it.key, { type })}
            onRemove={() => setItems((list) => list.filter((x) => x.key !== it.key))}
            c={c}
          />
        ))}
        {!busy ? (
          <Press accessibilityRole="button" onPress={() => void pick()} style={[s.pill, { minHeight: 52, backgroundColor: c.card }]}>
            <Text style={{ color: c.sky, fontSize: 16, fontWeight: '600' }}>{items.length ? '영상 더 고르기' : '영상 고르기'}</Text>
          </Press>
        ) : null}
        {error ? <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>{error}</Text> : null}
        {pending > 0 ? (
          <Press accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={[s.pill, { minHeight: 52, backgroundColor: c.sky, opacity: busy ? 0.6 : 1 }]}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{busy ? '올리는 중…' : `${pending}개 올리기`}</Text>
          </Press>
        ) : done ? (
          <Text style={{ color: c.ok, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>다 올렸어요.</Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ItemCard({ it, disabled, onGun, onType, onRemove, c }: { it: Item; disabled: boolean; onGun: (v: string) => void; onType: (v: string | null) => void; onRemove: () => void; c: Palette }) {
  const editable = it.state === 'ready' || (it.state === 'error' && !it.pitchId);
  const status =
    it.state === 'saving' ? '저장하는 중…' : it.state === 'uploading' ? `영상 올리는 중 ${it.percent ?? 0}%` : it.state === 'done' ? '올렸어요' : null;
  return (
    <View style={{ borderRadius: 14, padding: 12, gap: 8, backgroundColor: c.card, boxShadow: c.float }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[s.meta, { flex: 1, color: c.muted }]} numberOfLines={1}>
          {it.asset.fileName ?? '영상'} · {mb(it.asset.fileSize ?? 0)}
          {it.asset.duration ? ` · ${(it.asset.duration / 1000).toFixed(1)}초` : ''}
        </Text>
        {editable && !disabled ? (
          <Press accessibilityRole="button" accessibilityLabel="빼기" onPress={onRemove} hitSlop={8} style={{ minHeight: 32, justifyContent: 'center' }}>
            <Text style={{ color: c.muted, fontSize: 14 }}>빼기</Text>
          </Press>
        ) : null}
      </View>
      {editable ? (
        <>
          <TextInput
            value={it.gun}
            onChangeText={(t) => onGun(t.replace(/[^0-9.,]/g, '').slice(0, 5))}
            keyboardType="decimal-pad"
            placeholder="스피드건 km/h"
            placeholderTextColor={c.muted}
            editable={!disabled}
            style={[s.input, { backgroundColor: c.page, color: c.ink }]}
          />
          <View accessibilityRole="radiogroup" style={s.chips}>
            {PITCH_TYPES.map((t) => (
              <Chip key={t.key} label={t.label} on={it.type === t.key} onPress={() => onType(it.type === t.key ? null : t.key)} c={c} />
            ))}
          </View>
        </>
      ) : (
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>
          건 {it.gun} km/h{it.type ? ` · ${PITCH_TYPES.find((t) => t.key === it.type)?.label ?? ''}` : ''}
        </Text>
      )}
      {status ? <Text style={[s.meta, { color: it.state === 'done' ? c.ok : c.sky, fontWeight: '600' }]}>{status}</Text> : null}
      {it.error ? <Text style={{ color: c.danger, fontSize: 14 }}>{it.error}</Text> : null}
    </View>
  );
}
