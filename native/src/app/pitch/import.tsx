import * as ImagePicker from 'expo-image-picker';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { isPhoneVideoPath, loadMe, phoneAssetId } from '~/pitch/api';
import { PICK_ORIGINAL, attach, attachErrorText, dropPickerTemp, readVideoFacts, useImported } from '~/pitch/attach';
import { Icon } from '~/shell/icon';
import { DateNavButton } from '~/shell/mini-calendar';
import { Press } from '~/shell/press';

/**
 * 지난 영상 가져오기(앱) — 웹 app/(app)/videos/import-sheet.tsx 와 같은 규칙(lib/pitch-import.ts): 사진 앱에서 영상 여러 개를 고르면
 * 영상 머리의 찍은 날짜로 묶고(기록당 두 개), 묶음마다 [기록 남기기] → 그 날짜 기록 폼에 영상을 붙여 연다.
 * 폰에 넣는 때는 [기록 남기기]를 누를 때(미리보기에서는 안 넣는다 — 틀린 묶음을 [따로] 빼도 지우고 다시 넣을 일이 없다).
 * 폼에서 저장 안 하고 닫으면 폼이 그 영상을 폰에서 지운다(기록 폼의 '이번에 넣은 영상' 규칙).
 * 내용만큼만 올라오는 아래 시트(_layout formSheet fitToContents — 2026-10-20 김민: 큰 창에 단추 하나만 떠 있었다). 진행 · 오류는 맨 위에
 * (예전엔 맨 밑이라 묶음이 많으면 화면 밖에서 돌다 실패해 '첨부가 안 된다'로 보였다).
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
  /* 선택기가 앱 캐시에 복사해 둔 원본 — 화면을 닫으면 지운다(그때까지는 묶음을 다시 넣을 수 있게 둔다) */
  const pickedRef = useRef<Picked[]>([]);
  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);
  useEffect(() => () => pickedRef.current.forEach((p) => dropPickerTemp(p.asset.uri)), []);

  const pick = async () => {
    if (busy) return;
    setError(null);
    /*
     * 고른 뒤 사진 선택기가 원본을 앱으로 복사하는 동안(iCloud 영상은 내려받기까지) 몇 초 ~ 몇십 초 말이 없었다 — 먼저 돌개를 띄워 둔다
     * (선택기 밑에 깔려 있다가 닫히면 보인다). 선택기가 던지면(iCloud 못 받음 등) 말없이 멈추던 것도 글로 알린다.
     */
    setBusy('영상을 가져오는 중');
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        ...PICK_ORIGINAL,
        allowsMultipleSelection: true,
        selectionLimit: PICK_LIMIT,
        orderedSelection: true,
      });
      if (res.canceled || !res.assets?.length) return;
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
      /* 다시 골랐다 — 앞서 고른 것 중 아직 안 넣은 원본은 더 쓸 일이 없다 */
      picked.forEach((p) => dropPickerTemp(p.asset.uri));
      setPicked(next);
      setGroups(groupItems(next.map((p) => p.item)));
    } catch (e) {
      setError(attachErrorText(e, '영상을 가져오지 못했어요. 사진 앱에서 영상이 다 받아졌는지 본 뒤 다시 골라 주세요.'));
    } finally {
      setBusy(null);
    }
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
        /* 원본은 화면을 닫거나 다시 고를 때 지운다 — 반쯤 막히거나 폼을 저장 없이 닫으면 이 묶음을 처음부터 다시 넣어서 */
        paths.push(await attach(asset, me.isAdmin, { keepPickerFile: true }));
      }
      router.push({
        pathname: '/pitch/edit' as Href as never,
        params: { date: g.date, videos: JSON.stringify(paths), importKey: keyOf(g) },
      });
    } catch (e) {
      /* 반쯤 넣다 막히면 넣은 것도 폰에서 뺀다(다시 누르면 처음부터) */
      const phone = paths.filter(isPhoneVideoPath).map(phoneAssetId);
      if (phone.length) void LocalVideo.remove({ ids: phone }).catch(() => undefined);
      setError(attachErrorText(e, '영상을 넣지 못했어요.'));
    } finally {
      setBusy(null);
    }
  };

  const left = groups.filter((g) => !done.has(keyOf(g))).length;

  return (
    <ScrollView style={{ backgroundColor: c.page }} contentContainerStyle={{ padding: 20, paddingBottom: inset.bottom + 20, gap: 12 }}>
        {/* 머리 — 알림 시트(notice.tsx)와 같은 꼴: 제목 17 굵게 + 오른쪽 닫기 ✕ */}
        <View style={styles.head}>
          <Text accessibilityRole="header" style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>
            지난 영상 가져오기
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => router.back()} hitSlop={6} style={({ pressed }) => [styles.close, { backgroundColor: c.chip }, pressed && { opacity: 0.55 }]}>
            <Icon name="x" size={18} color={c.muted} />
          </Pressable>
        </View>
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator />
            <Text style={{ color: c.muted, fontSize: 15 }}>{busy}</Text>
          </View>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 15, lineHeight: 21 }}>
            {error}
          </Text>
        ) : null}
        {groups.length === 0 ? (
          <View style={{ gap: 12 }}>
            <Text style={{ color: c.muted, fontSize: 15, lineHeight: 22 }}>
              사진 앱의 투구 영상을 찍은 날짜로 묶어 기록으로 남겨요. 한 번에 {PICK_LIMIT}개까지 고르고, 같은 날 영상은 2개씩 한 기록이 돼요.
            </Text>
            <Press accessibilityRole="button" onPress={pick} disabled={!!busy} style={[styles.primary, { backgroundColor: c.action }, busy && { opacity: 0.4 }]}>
              <Text style={styles.primaryText}>영상 고르기</Text>
            </Press>
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
                    <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>기록으로 남겼어요</Text>
                  ) : (
                    <Press
                      accessibilityRole="button"
                      onPress={() => open(g)}
                      disabled={!!busy || !g.date}
                      style={[styles.primary, { backgroundColor: c.action }, (!g.date || busy) && { opacity: 0.4 }]}
                    >
                      <Text style={styles.primaryText}>기록 남기기</Text>
                    </Press>
                  )}
                </View>
              );
            })}
            <Press accessibilityRole="button" onPress={pick} disabled={!!busy} style={[styles.ghost, { backgroundColor: c.chip }]}>
              <Text style={[styles.ghostText, { color: c.ink }]}>다른 영상 고르기</Text>
            </Press>
          </>
        )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', margin: 6, marginRight: -6 },
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
