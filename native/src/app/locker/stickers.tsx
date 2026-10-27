import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { fadeIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import { STICKER_ICON, STICKERS, stickerCount, useLocker, type StickerKey } from '~/home/locker-store';
import { SheetHead } from '~/home/sheet-head';

/**
 * 내 스티커(시트) — 승인 시안의 album: 넷(체크인 · 투구 · 휴식 · 운동 기록 · 캐치). 받은 것은 그림, 아직이면 자물쇠와 받는 법.
 * 누르면 그 스티커 한 장(받은 날 또는 조건). 처음 받은 날만 남는다 — 다음 날에도 그대로(하루마다 지워지지 않는다).
 */
const dateText = (k: string) => `${Number(k.slice(0, 4))}년 ${Number(k.slice(5, 7))}월 ${Number(k.slice(8, 10))}일`;

export default function LockerStickersSheet() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { locker } = useLocker();
  const [open, setOpen] = useState<StickerKey | null>(null);
  const s = open ? STICKERS.find((x) => x.key === open)! : null;
  const got = s ? locker.stickers[s.key] : undefined;
  return (
    <ScrollView style={{ backgroundColor: c.card }} contentContainerStyle={{ padding: 20, paddingBottom: inset.bottom + 24, gap: 14 }}>
      <SheetHead c={c} title={s ? s.label : '내 스티커'} />
      {s ? (
        <Animated.View key={s.key} entering={fadeIn} style={{ gap: 14 }}>
          <View style={[styles.large, { backgroundColor: c.skyTint }]}>
            <Icon name={got ? STICKER_ICON[s.key] : 'lock'} size={58} color={got ? c.link : c.muted} strokeWidth={2} />
          </View>
          <Text style={[styles.body, { color: c.ink, textAlign: 'center' }]}>{got ? `${dateText(got)}에 받았어요.` : '아직 받지 않았어요.'}</Text>
          <Text style={[styles.body, { color: c.muted, textAlign: 'center' }]}>{s.how}</Text>
          <Press accessibilityRole="button" onPress={() => setOpen(null)} style={styles.plain}>
            <Text style={[styles.plainText, { color: c.link }]}>내 스티커로</Text>
          </Press>
        </Animated.View>
      ) : (
        <>
          <Text style={[styles.body, { color: c.muted }]}>
            {stickerCount(locker)} / {STICKERS.length} · 이 폰에만 저장돼요
          </Text>
          <View style={styles.grid}>
            {STICKERS.map((x) => {
              const on = !!locker.stickers[x.key];
              return (
                <Press
                  key={x.key}
                  card
                  accessibilityRole="button"
                  accessibilityLabel={`${x.label} 스티커, ${on ? '받음' : `아직 없음. ${x.how}`}`}
                  onPress={() => setOpen(x.key)}
                  style={[styles.item, { backgroundColor: c.page }]}
                >
                  <View style={[styles.symbol, { backgroundColor: c.skyTint, opacity: on ? 1 : 0.55 }]}>
                    <Icon name={on ? STICKER_ICON[x.key] : 'lock'} size={25} color={on ? c.link : c.muted} strokeWidth={2.2} />
                  </View>
                  <Text style={[styles.itemLabel, { color: on ? c.ink : c.muted }]}>{x.label}</Text>
                  <Text style={[styles.small, { color: c.muted }]}>{on ? '받음' : '아직 없음'}</Text>
                </Press>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  item: { flexGrow: 1, flexBasis: 130, minHeight: 126, borderRadius: 18, padding: 13, alignItems: 'center', justifyContent: 'center', gap: 9 },
  symbol: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { fontSize: 13, fontWeight: '600' },
  small: { fontSize: 11 },
  large: { width: 120, height: 120, borderRadius: 30, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 10 },
  plain: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  plainText: { fontSize: 14, fontWeight: '600' },
});
