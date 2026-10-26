import { useState, type ReactNode } from 'react';
import { useWindowDimensions, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { columnsFor, columnWidths, type ColumnRule } from './columns';

/**
 * 넓은 화면(아이패드)에서 앱 화면 본문을 읽기 좋은 폭으로 — 2026-10-18 김민: 앱은 아이패드도 받는데(app.json supportsTablet) 본문이 화면 끝까지
 * 늘어나 글 줄이 너무 길었다.
 *
 * 쓰는 법: 세로로 굴리는 화면의 본문 상자(ScrollView · FlatList 의 contentContainerStyle)에 READABLE 을 덧붙인다 —
 *   contentContainerStyle={[{ padding: 16, gap: 12 }, READABLE]}
 * 상자 폭이 CONTENT_MAX 를 넘지 않고 가운데로 모인다. 굴리는 칸은 그대로 화면 끝까지라 빈 옆자리를 끌어도 굴러간다. 휴대폰은 가장 넓은 기종도
 * 440pt 라 이 한도보다 좁아 그대로다(폭 100%).
 *
 * 두 칸이 나은 화면(3D + 숫자, 목록 + 자세히 …)은 TwoColumns — 그 칸이 실제로 받은 폭이 넉넉할 때(lib/columns.ts — 창 900pt 와 같은 자리,
 * 큰 글씨면 더 넓어야)만 나란히, 그 밖에는 위아래 그대로. 그 화면은 READABLE 대신 READABLE_WIDE 를 쓴다.
 */
export const CONTENT_MAX = 720;
/** 두 칸 화면의 최대 폭 */
export const WIDE_MAX = 1120;
/** 이보다 넓으면 두 칸(아이패드 11인치 세로 834pt 는 한 칸, 가로 1210pt 는 두 칸) */
export const TWO_COLUMN_MIN = 900;

export const READABLE = { width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' } as const satisfies ViewStyle;
export const READABLE_WIDE = { width: '100%', maxWidth: WIDE_MAX, alignSelf: 'center' } as const satisfies ViewStyle;

/**
 * 이 칸이 받은 폭으로 두 칸인지 — onLayout 을 그 칸(본문 상자)에 단다. 재기 전(처음 한 장면)은 한 칸이다(휴대폰 그대로 · 좁은 시트에서 두 칸이 한 번
 * 번쩍이지 않게). 창 폭이 아니라 칸 폭이라 시트 · 분할 화면 · 옆 칸 안에서도 맞다(2026-10-26 아이패드 점검).
 */
export function useColumns(rule: ColumnRule = {}) {
  const { width: windowW, fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setWidth((p) => (p === w ? p : w));
  };
  const two = width > 0 && columnsFor(width, fontScale, rule) === 2;
  /* 재기 전 칸 폭은 창으로 어림(본문 상자 · 옆 여백 16) — 3D 처럼 폭으로 높이를 정하는 것이 0 을 받지 않게 */
  const known = width || Math.max(0, Math.min(windowW, WIDE_MAX) - 32);
  return { two, width, onLayout, widths: columnWidths(known, two, rule) };
}

/** 두 칸 줄 · 칸 모양 — 한 칸이어도 같은 View 들을 그대로 둔다(아래 TwoColumns) */
export const columnRow = (two: boolean, gap: number): ViewStyle => (two ? { flexDirection: 'row', alignItems: 'flex-start', gap } : { gap });
export const columnCell = (two: boolean, flex: number, gap: number): ViewStyle => (two ? { flex, minWidth: 0, gap } : { gap });

/**
 * 넓으면 두 칸(왼쪽 · 오른쪽), 좁으면 위아래로 이어 붙인다(휴대폰 화면 그대로). 칸 비율은 left : right(기본 3 : 2 — 웹 결과 화면의 PC 배치와 같다).
 * gap 은 칸 사이 · 위아래 사이 모두. min · minColumn 으로 그 화면의 기준을 바꾼다(lib/columns.ts).
 * 한 칸 ↔ 두 칸에서 View 들의 차례 · 겹은 늘 같고 스타일만 바뀐다 — 예전엔 모양이 달라 아이패드를 돌릴 때마다 안의 3D · 영상이 새로 붙어 시점 ·
 * 재생 자리가 처음으로 돌아갔다. left · right 를 함수로 주면 그 칸의 폭(pt)을 받는다(3D 처럼 폭으로 높이를 정하는 것).
 */
export function TwoColumns({
  left,
  right,
  ratio = [3, 2],
  gap = 20,
  min,
  minColumn,
  style,
}: {
  left: ReactNode | ((width: number) => ReactNode);
  right: ReactNode | ((width: number) => ReactNode);
  ratio?: [number, number];
  gap?: number;
  min?: number;
  minColumn?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { two, onLayout, widths } = useColumns({ ratio, gap, min, minColumn });
  return (
    <View onLayout={onLayout} style={[columnRow(two, gap), style]}>
      <View style={columnCell(two, ratio[0], gap)}>{typeof left === 'function' ? left(widths[0]) : left}</View>
      <View style={columnCell(two, ratio[1], gap)}>{typeof right === 'function' ? right(widths[1]) : right}</View>
    </View>
  );
}

/**
 * 본문 밖에 붙은 막대(운동 진행 · 따라 하기의 바닥 조작 막대)의 옆 여백 — 막대 바탕은 화면 끝까지 두고 안쪽 단추만 본문(READABLE)과 같은 폭으로
 * 모은다. base 는 휴대폰에서의 여백(그대로 나온다).
 */
export function useBarSide(base: number): number {
  const { width } = useWindowDimensions();
  return Math.max(base, Math.round((width - CONTENT_MAX) / 2) + base);
}
