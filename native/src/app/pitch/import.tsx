import * as ImagePicker from 'expo-image-picker';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type ImportGroup,
  type ImportItem,
  groupItems,
  importDateOf,
  needsDateCheck,
  setGroupDate,
  splitOut,
} from '@/lib/pitch-import';
import { toDateKey } from '@/lib/pitch-stats';
import { usePalette } from '~/lib/ui';
import { LocalVideo } from '../../../modules/local-video';
import { ApiError, isPhoneVideoPath, loadMe, phoneAssetId } from '~/pitch/api';
import { PICK_ORIGINAL, attach, readVideoFacts, useImported } from '~/pitch/attach';

/**
 * 지난 영상 가져오기(앱) — 웹 app/(app)/videos/import-sheet.tsx 와 같은 규칙(lib/pitch-import.ts): 사진 앱에서 영상 여러 개를 고르면
 * 영상 머리의 찍은 날짜로 묶고(기록당 두 개), 묶음마다 [기록 남기기] → 그 날짜 기록 폼에 영상을 붙여 연다.
 * 폰에 넣는 때는 [기록 남기기]를 누를 때(미리보기에서는 안 넣는다 — 틀린 묶음을 [따로] 빼도 지우고 다시 넣을 일이 없다).
 * 폼에서 저장 안 하고 닫으면 폼이 그 영상을 폰에서 지운다(기록 폼의 '이번에 넣은 영상' 규칙).
 */
const PICK_LIMIT = 20;

type Picked = { item: ImportItem; asset: ImagePicker.ImagePickerAsset };

const shiftDay = (key: string, by: number) => {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};
const dateText = (key: string) => `${key.slice(0, 4)}년 ${Number(key.slice(5, 7))}월 ${Number(key.slice(8))}일`;
const durText = (ms?: number | null) => {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return ` · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function PitchImportScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const today = toDateKey(new Date());
  const [picked, setPicked] = useState<Picked[]>([]);
  const [groups, setGroups] = useState<ImportGroup[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useImported();

  const pick = async () => {
    setError(null);
    const res = await ImagePicker.launchImageLibraryAsync({
      ...PICK_ORIGINAL,
      allowsMultipleSelection: true,
      selectionLimit: PICK_LIMIT,
      orderedSelection: true,
    });
    if (res.canceled) return;
    setBusy('찍은 날짜를 읽는 중');
    const now = Date.now();
    const next: Picked[] = [];
    for (const [i, asset] of res.assets.entries()) {
      const facts = await readVideoFacts(asset.uri).catch(() => null);
      /* 사진 선택기는 파일 시각을 안 준다 — 머리에 시각이 없으면 날짜 없음(적어야 함) */
      const { date, source } = importDateOf(facts, 0, now);
      next.push({ item: { id: i, name: asset.fileName ?? `영상 ${i + 1}`, date, source }, asset });
    }
    setPicked(next);
    setGroups(groupItems(next.map((p) => p.item)));
    setBusy(null);
  };

  const open = async (g: ImportGroup) => {
    if (busy || !g.date) return;
    setError(null);
    const paths: string[] = [];
    try {
      const me = await loadMe();
      for (const [i, it] of g.items.entries()) {
        setBusy(`영상 ${i + 1}/${g.items.length} 넣는 중`);
        const asset = picked.find((p) => p.item.id === it.id)!.asset;
        paths.push(await attach(asset, me.isAdmin));
      }
      router.push({
        pathname: '/pitch/edit' as Href as never,
        params: { date: g.date, videos: JSON.stringify(paths), importKey: g.key },
      });
    } catch (e) {
      /* 반쯤 넣다 막히면 넣은 것도 폰에서 뺀다(다시 누르면 처음부터) */
      const phone = paths.filter(isPhoneVideoPath).map(phoneAssetId);
      if (phone.length) void LocalVideo.remove({ ids: phone }).catch(() => undefined);
      setError(e instanceof ApiError ? e.message : '영상을 넣지 못했어요.');
    } finally {
      setBusy(null);
    }
  };

  const left = groups.filter((g) => !done.has(g.key)).length;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
          <Text style={[styles.barAction, { color: c.sky }]}>닫기</Text>
        </Pressable>
        <Text style={[styles.barTitle, { color: c.ink }]}>지난 영상 가져오기</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: inset.bottom + 32, gap: 12 }}>
        {groups.length === 0 ? (
          <View style={{ gap: 12, paddingTop: 8 }}>
            <Text style={{ color: c.ink, fontSize: 17, lineHeight: 24 }}>
              사진 앱의 투구 영상을 골라 주세요. 찍은 날짜끼리 묶어 그날 기록으로 남겨요.
            </Text>
            <Text style={{ color: c.muted, fontSize: 15 }}>한 번에 {PICK_LIMIT}개까지, 기록 하나에 영상 두 개까지예요.</Text>
            <Pressable accessibilityRole="button" onPress={pick} disabled={!!busy} style={[styles.primary, { backgroundColor: c.sky }]}>
              <Text style={styles.primaryText}>영상 고르기</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={{ color: c.muted, fontSize: 15 }}>
              {left > 0 ? `${groups.length}개 묶음 중 ${left}개 남았어요.` : `${groups.length}개 묶음을 모두 남겼어요.`}
            </Text>
            {groups.map((g) => {
              const saved = done.has(g.key);
              const check = g.items.some(needsDateCheck);
              return (
                <View key={g.key} style={[styles.card, { backgroundColor: c.card }, saved && { opacity: 0.55 }]}>
                  {g.date ? (
                    <View style={styles.dateRow}>
                      <Text style={[styles.date, { color: c.ink }]}>{dateText(g.date)}</Text>
                      {check && !saved ? (
                        <View style={styles.stepper}>
                          <Step label="하루 앞" text="‹" onPress={() => setGroups(setGroupDate(groups, g.key, shiftDay(g.date!, -1)))} />
                          <Step
                            label="하루 뒤"
                            text="›"
                            disabled={g.date >= today}
                            onPress={() => setGroups(setGroupDate(groups, g.key, shiftDay(g.date!, 1)))}
                          />
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      <Text style={[styles.date, { color: c.danger }]}>찍은 날짜를 못 읽었어요</Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setGroups(setGroupDate(groups, g.key, today))}
                        style={[styles.ghost, { backgroundColor: c.chip }]}
                      >
                        <Text style={[styles.ghostText, { color: c.ink }]}>날짜 정하기</Text>
                      </Pressable>
                    </View>
                  )}
                  {check && g.date && !saved ? (
                    <Text style={{ color: c.muted, fontSize: 13 }}>영상에 찍은 날짜가 없어 고른 날짜예요. 맞는지 확인해 주세요.</Text>
                  ) : null}
                  {g.items.map((it) => {
                    const asset = picked.find((p) => p.item.id === it.id)?.asset;
                    return (
                      <View key={it.id} style={styles.itemRow}>
                        <Text style={{ flex: 1, color: c.ink, fontSize: 15 }} numberOfLines={1}>
                          {it.name}
                          {durText(asset?.duration)}
                        </Text>
                        {g.items.length > 1 && !saved ? (
                          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setGroups(splitOut(groups, it.id))}>
                            <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>따로</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                  {saved ? (
                    <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>기록으로 남겼어요</Text>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => open(g)}
                      disabled={!!busy || !g.date}
                      style={[styles.primary, { backgroundColor: c.sky }, (!g.date || busy) && { opacity: 0.4 }]}
                    >
                      <Text style={styles.primaryText}>기록 남기기</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
            <Pressable accessibilityRole="button" onPress={pick} disabled={!!busy} style={[styles.ghost, { backgroundColor: c.chip }]}>
              <Text style={[styles.ghostText, { color: c.ink }]}>다른 영상 고르기</Text>
            </Pressable>
          </>
        )}
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator />
            <Text style={{ color: c.muted, fontSize: 15 }}>{busy}</Text>
          </View>
        ) : null}
        {error ? <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

function Step({ label, text, onPress, disabled }: { label: string; text: string; onPress: () => void; disabled?: boolean }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.stepBtn, { backgroundColor: c.chip }, disabled && { opacity: 0.3 }]}
    >
      <Text style={{ color: c.sky, fontSize: 22 }}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  barAction: { fontSize: 17 },
  barTitle: { fontSize: 17, fontWeight: '600' },
  card: { borderRadius: 16, padding: 14, gap: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontSize: 17, fontWeight: '700' },
  stepper: { flexDirection: 'row', gap: 8 },
  stepBtn: { width: 44, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  primary: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  ghost: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 17, fontWeight: '600' },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
