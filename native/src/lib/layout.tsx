import type { ReactNode } from 'react';
import { useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * 넓은 화면(아이패드)에서 앱 화면 본문을 읽기 좋은 폭으로 — 2026-10-18 김민: 앱은 아이패드도 받는데(app.json supportsTablet) 본문이 화면 끝까지
 * 늘어나 글 줄이 너무 길었다.
 *
 * 쓰는 법: 세로로 굴리는 화면의 본문 상자(ScrollView · FlatList 의 contentContainerStyle)에 READABLE 을 덧붙인다 —
 *   contentContainerStyle={[{ padding: 16, gap: 12 }, READABLE]}
 * 상자 폭이 CONTENT_MAX 를 넘지 않고 가운데로 모인다. 굴리는 칸은 그대로 화면 끝까지라 빈 옆자리를 끌어도 굴러간다. 휴대폰은 가장 넓은 기종도
 * 440pt 라 이 한도보다 좁아 그대로다(폭 100%).
 *
 * 두 칸이 나은 화면(3D + 숫자, 목록 + 자세히 …)은 TwoColumns — TWO_COLUMN_MIN 보다 넓을 때(아이패드 가로 · 큰 아이패드)만 나란히, 그 밖에는
 * 위아래 그대로. 그 화면은 READABLE 대신 READABLE_WIDE 를 쓴다.
 */
export const CONTENT_MAX = 720;
/** 두 칸 화면의 최대 폭 */
export const WIDE_MAX = 1120;
/** 이보다 넓으면 두 칸(아이패드 11인치 세로 834pt 는 한 칸, 가로 1210pt 는 두 칸) */
export const TWO_COLUMN_MIN = 900;

export const READABLE = { width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' } as const satisfies ViewStyle;
export const READABLE_WIDE = { width: '100%', maxWidth: WIDE_MAX, alignSelf: 'center' } as const satisfies ViewStyle;

/** 지금 두 칸으로 나눌 만큼 넓은가 — 아이패드를 돌리거나 나눠 쓰면 바뀐다 */
export function useTwoColumns(): boolean {
  return useWindowDimensions().width >= TWO_COLUMN_MIN;
}

/**
 * 넓으면 두 칸(왼쪽 · 오른쪽), 좁으면 위아래로 이어 붙인다(휴대폰 화면 그대로). 칸 비율은 left : right(기본 3 : 2 — 웹 결과 화면의 PC 배치와 같다).
 * gap 은 칸 사이 · 위아래 사이 모두.
 */
export function TwoColumns({
  left,
  right,
  ratio = [3, 2],
  gap = 20,
  style,
}: {
  left: ReactNode;
  right: ReactNode;
  ratio?: [number, number];
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const two = useTwoColumns();
  if (!two)
    return (
      <View style={[{ gap }, style]}>
        {left}
        {right}
      </View>
    );
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-start', gap }, style]}>
      <View style={{ flex: ratio[0], minWidth: 0, gap }}>{left}</View>
      <View style={{ flex: ratio[1], minWidth: 0, gap }}>{right}</View>
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
