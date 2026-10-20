import { Image } from 'expo-image';
import { thumbSource, type Thumb } from './store';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { STRONG_EFFORT_PCT, effortBand } from '@/lib/pitch-effort';
import { usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';

/**
 * 투구 탭 달력 칸 속 — 웹 app/(app)/videos/video-calendar.tsx renderDay 와 같은 꼴.
 * - 영상 있는 날: 그날 대표 영상의 한 장면을 칸 가득 · 위아래만 살짝 어둡게 · 왼쪽 위 날짜 · 왼쪽 아래 'N구' · 영상이 여럿이면 오른쪽 아래 필름 + 수.
 * - 영상 없이 남긴 날: 체감 강도로 칠하고 왼쪽 위 날짜 · 가운데 아래 'N구'. 쉬는 날은 안쪽 점선 · '휴식'.
 * - 아무것도 없는 지난날: 옅은 회색 판 · 날짜만. 앞날은 더 옅은 날짜만.
 * - 오늘은 날짜에 파란 테두리 원(어두운 바탕이면 흰 원).
 * 장면 그림이 없으면(아직 · 못 만듦) 옅은 하늘 판에 필름 — 웹 Thumb 과 같다. 받으면 옅게 바뀐다(160ms).
 */
const BAND_ALPHA = { strong: 0.7, mid: 0.4, light: 0.15 } as const;
/* 영상 칸 밑 강도 막대 — 어두운 장면 위라 칸 색(BAND_ALPHA)보다 진하게 */
const BAR_OPACITY = { strong: 1, mid: 0.65, light: 0.35 } as const;

export type VideoDay = {
  day: number;
  isToday: boolean;
  isFuture: boolean;
  /** 그날 기록이 있나 */
  logged: boolean;
  rest: boolean;
  pitches: number;
  effortPct: number;
  videos: number;
  thumb: Thumb | null;
  /** 체크인 메모를 남긴 날 — 오른쪽 위 쪽지 */
  noted?: boolean;
};

export function VideoCell({ d }: { d: VideoDay }) {
  const c = usePalette();
  if (!d.logged) {
    return (
      <>
        {!d.isFuture ? <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(c.chip, 0.5) }]} /> : null}
        <DayNum d={d} color={d.isFuture ? withAlpha(c.muted, 0.35) : c.muted} ring={c.sky} />
        {d.noted ? <NoteMark color={c.muted} /> : null}
      </>
    );
  }
  if (d.videos > 0 && !d.rest) {
    return (
      <>
        {/* 장면 그림이 없거나 아직이면 옅은 하늘 판 + 필름(웹 Thumb) — 영상이 있는 날임은 늘 보인다 */}
        <View style={[StyleSheet.absoluteFill, styles.noThumb, { backgroundColor: withAlpha(c.skyTint, 0.7) }]}>
          <Icon name="film" size={16} color={withAlpha(c.sky, 0.7)} />
        </View>
        {d.thumb ? <Image source={thumbSource(d.thumb)} contentFit="cover" transition={160} style={StyleSheet.absoluteFill} /> : null}
        <Shade />
        <DayNum d={d} color="#fff" ring="#fff" bold shadow />
        <Text style={[styles.cornerCount, styles.shadow]}>{d.pitches}구</Text>
        {/* 영상이 강도 색을 덮으니 밑에 강도 막대(2026-10-21 김민: 영상 올린 날만 강도가 안 보였다) — 진하기는 강도 색 칸과 같은 세 단계 */}
        <View style={[styles.effortBar, { backgroundColor: c.sky, opacity: BAR_OPACITY[effortBand(d.effortPct)] }]} />
        {d.noted ? <NoteMark color="#fff" shadow below={d.videos > 1} /> : null}
        {d.videos > 1 ? (
          <View style={styles.films}>
            <Icon name="film" size={10} color="#fff" />
            <Text style={styles.filmsText}>{d.videos}</Text>
          </View>
        ) : null}
      </>
    );
  }
  const strong = !d.rest && d.effortPct >= STRONG_EFFORT_PCT;
  const ink = strong ? '#fff' : c.ink;
  return (
    <>
      {d.rest ? (
        <View style={[styles.restLine, { borderColor: c.lineStrong }]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(c.sky, BAND_ALPHA[effortBand(d.effortPct)]) }]} />
      )}
      <DayNum d={d} color={ink} ring={strong ? '#fff' : c.sky} />
      <Text numberOfLines={1} style={[styles.midCount, { color: d.rest ? c.muted : ink }]}>
        {d.rest ? '휴식' : `${d.pitches}구`}
      </Text>
      {d.noted ? <NoteMark color={strong ? '#fff' : c.muted} shadow={strong} /> : null}
    </>
  );
}

/** 메모 쪽지 — 오른쪽 위 12px(웹 NoteMark) */
function NoteMark({ color, shadow = false, below = false }: { color: string; shadow?: boolean; below?: boolean }) {
  return (
    <View accessibilityLabel="메모 있음" style={[styles.note, below && { top: 22 }, shadow && styles.noteShadow]}>
      <Icon name="sticky-note" size={12} color={color} />
    </View>
  );
}

function DayNum({ d, color, ring, bold = false, shadow = false }: { d: VideoDay; color: string; ring: string; bold?: boolean; shadow?: boolean }) {
  if (d.isToday) {
    return (
      <View style={[styles.today, { borderColor: ring }]}>
        <Text style={[styles.dayText, { color: ring, fontWeight: '700' }, shadow && styles.shadow]}>{d.day}</Text>
      </View>
    );
  }
  return <Text style={[styles.dayText, styles.dayPos, { color, fontWeight: bold ? '700' : '500' }, shadow && styles.shadow]}>{d.day}</Text>;
}

/* 위 36px · 아래 32px 만 어둡게 — 밝은 장면 위에서도 날짜 · 투구수가 읽히게(웹 from-black/55 · /60) */
function Shade() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="t" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#000" stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="b" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.6} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height={36} fill="url(#t)" />
      <Rect x="0" y="100%" width="100%" height={32} translateY={-32} fill="url(#b)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  noThumb: { alignItems: 'center', justifyContent: 'center' },
  note: { position: 'absolute', right: 4, top: 4 },
  noteShadow: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  /* 날짜 15 · 투구 수 13(2026-10-21 김민: 칸 글이 12 · 11 이라 안 읽혔다) */
  dayText: { fontSize: 15, lineHeight: 18, fontVariant: ['tabular-nums'] },
  dayPos: { position: 'absolute', left: 6, top: 3 },
  today: { position: 'absolute', left: 2, top: 2, minWidth: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  shadow: { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  cornerCount: { position: 'absolute', left: 6, bottom: 7, color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 15 },
  midCount: { position: 'absolute', left: 2, right: 2, bottom: 6, textAlign: 'center', fontSize: 13, fontWeight: '600', lineHeight: 15 },
  effortBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  /* 영상 수 — 오른쪽 위(밑은 투구 수가 칸 폭을 쓴다), 메모 쪽지는 그 밑으로 */
  films: {
    position: 'absolute',
    right: 3,
    top: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  filmsText: { color: '#fff', fontSize: 11, fontWeight: '600', lineHeight: 12 },
  restLine: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed' },
});
