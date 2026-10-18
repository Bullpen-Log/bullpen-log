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
import { READABLE } from '~/lib/layout';
import { Bar } from '~/community/parts';
import { Icon } from '~/shell/icon';
import { DateNavButton } from '~/shell/mini-calendar';

/**
 * 지난 영상 가져오기(앱) — 웹 app/(app)/videos/import-sheet.tsx 와 같은 규칙(lib/pitch-import.ts): 사진 앱에서 영상 여러 개를 고르면
 * 영상 머리의 찍은 날짜로 묶고(기록당 두 개), 묶음마다 [기록 남기기] → 그 날짜 기록 폼에 영상을 붙여 연다.
 * 폰에 넣는 때는 [기록 남기기]를 누를 때(미리보기에서는 안 넣는다 — 틀린 묶음을 [따로] 빼도 지우고 다시 넣을 일이 없다).
 * 폼에서 저장 안 하고 닫으면 폼이 그 영상을 폰에서 지운다(기록 폼의 '이번에 넣은 영상' 규칙).
 */
const PICK_LIMIT = 20;

type Picked = { item: ImportItem; asset: ImagePicker.ImagePickerAsset };

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
  /* 고를 때마다 새 번호 — 묶음 열쇠(날짜#n)는 다시 고르면 겹쳐, 앞서 남긴 묶음과 헷갈리지 않게 '남김' 표시를 이 번호로 가른다 */
  const [pickNo, setPickNo] = useState(0);
  const keyOf = (g: ImportGroup) => `${pickNo}|${g.key}`;
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
    setPickNo((n) => n + 1);
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
        params: { date: g.date, videos: JSON.stringify(paths), importKey: keyOf(g) },
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

  const left = groups.filter((g) => !done.has(keyOf(g))).length;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar modal back="투구" title="지난 영상 가져오기" c={c} />
      <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: inset.bottom + 32, gap: 12 }, READABLE]}>
        {groups.length === 0 ? (
          <View style={{ gap: 12, paddingTop: 8 }}>
            <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>사진 앱의 투구 영상을 찍은 날짜로 묶어 기록으로 남겨요</Text>
            <Text style={{ color: c.muted, fontSize: 15, lineHeight: 22 }}>
              영상은 찍은 폰의 앱 안에 저장돼요(서버에 올리지 않아요). 한 번에 {PICK_LIMIT}개까지 골라요. 같은 날 영상은 2개씩 한 기록이 돼요.
            </Text>
            <Pressable accessibilityRole="button" onPress={pick} disabled={!!busy} style={[styles.primary, { backgroundColor: c.sky }]}>
              <Text style={styles.primaryText}>영상 고르기</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={{ color: c.muted, fontSize: 15, lineHeight: 22 }}>
              {left > 0
                ? `묶음마다 기록 하나가 돼요. 날짜를 못 읽은 영상은 날짜를 정해 주세요. 다른 날 영상이 섞였으면 [따로]로 빼요. ${groups.length}개 묶음 중 ${left}개 남았어요.`
                : `${groups.length}개 묶음을 모두 남겼어요. 남긴 기록은 캘린더 · 목록에서 보여요.`}
            </Text>
            {groups.map((g) => {
              const saved = done.has(keyOf(g));
              const check = g.items.some(needsDateCheck);
              return (
                <View key={g.key} style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }, saved && { opacity: 0.55 }]}>
                  {/* 날짜 — 웹 미리보기의 날짜 칸(input type=date, 오늘까지) */}
                  <View style={styles.dateRow}>
                    <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>날짜</Text>
                    {saved ? (
                      <Text style={{ color: c.ink, fontSize: 15 }}>{g.date ? dateText(g.date) : ''}</Text>
                    ) : (
                      <DateNavButton
                        label={g.date ? dateText(g.date) : '날짜 정하기'}
                        date={g.date ?? ''}
                        today={today}
                        min="2015-01-01"
                        marked={() => false}
                        onPick={(d) => setGroups((prev) => setGroupDate(prev, g.key, d))}
                      />
                    )}
                    {!saved && (!g.date || check) ? <Text style={{ color: c.warn, fontSize: 13 }}>날짜를 확인하세요</Text> : null}
                  </View>
                  {g.items.map((it) => {
                    const asset = picked.find((p) => p.item.id === it.id)?.asset;
                    return (
                      <View key={it.id} style={[styles.itemRow, { borderTopColor: c.line }]}>
                        <Icon name="film" size={16} color={c.muted} />
                        <Text style={{ flex: 1, color: c.ink, fontSize: 15 }} numberOfLines={1}>
                          {it.name}
                          {durText(asset?.duration)}
                        </Text>
                        {g.items.length > 1 && !saved ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${it.name} 따로 빼기`}
                            hitSlop={6}
                            onPress={() => setGroups(splitOut(groups, it.id))}
                            style={({ pressed }) => [styles.split, pressed && { backgroundColor: c.skyTint }]}
                          >
                            <Text style={{ color: c.skyStrong, fontSize: 13, fontWeight: '600' }}>따로</Text>
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

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 14, gap: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, borderTopWidth: StyleSheet.hairlineWidth },
  split: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  primary: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  ghost: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 17, fontWeight: '600' },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
