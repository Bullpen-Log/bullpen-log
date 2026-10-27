import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, G, Line, LinearGradient, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { CONTENT_MAX } from '~/lib/layout';
import { SPACE, useTheme, usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { onIntroGone } from '~/shell/intro';
import { Press } from '~/shell/press';
import { SinkerBall, spinBall, type BallRotation } from './ball/ball';
import { dotDate, weekdayEn, weekdayKo, type NextAction } from './plan-model';

/**
 * 홈 히어로 — 승인 시안 1 '볼 컨트롤'(sinker-home-four-concepts.html · layout-review heroMarkup 과 같은 칸): 네이비 판 · 위 줄(• SINKER | 10.27 · 화) ·
 * 큰 날짜(10. / 윤곽 27. / 하늘 TUE) · 궤도 선 · 날짜 옆 입체 공(돌려 보세요) · 아래 '지금 할 일 하나'와 단추.
 * 판은 아래 글이 길어지면(큰 글씨) 같이 커진다 — 시안의 큰 글씨 판(460)처럼. 공의 아래쪽은 글 뒤 그러데이션에 잠긴다(시안 :after).
 * 처음 한 번만(앱을 켠 뒤) 접속 연출이 걷히면 공이 한 바퀴 돌아 로고가 앞으로 온다 — 탭을 옮겼다 오거나 자료를 다시 받아도 안 돈다.
 */
const NIGHT = { light: '#062b4a', dark: '#041b30' } as const;
const NIGHT_TEXT = '#f4fbff';
const NIGHT_MUTED = '#adcee5';
const ACCENT = '#7dd3fc';
const COPY_TOP = 248;
let welcomed = false;

export function HomeHero({
  today,
  action,
  onAction,
  rotation,
}: {
  today: string;
  action: NextAction;
  onAction: () => void;
  rotation: BallRotation;
}) {
  const c = usePalette();
  const theme = useTheme();
  const reduce = useReducedMotion();
  const night = theme === 'light' ? NIGHT.light : NIGHT.dark;
  /* 첫 장면부터 공 · 날짜가 보이게 — 재기 전 폭은 창으로 어림(홈 본문 폭 = 창 − 양옆 16, 넓은 창은 720). 재면 바로 맞춘다 */
  const win = useWindowDimensions().width;
  const [w, setW] = useState(() => Math.min(win - SPACE.side * 2, CONTENT_MAX));
  const [h, setH] = useState(386);

  useEffect(() => {
    if (welcomed || reduce) return;
    welcomed = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = onIntroGone(() => {
      t = setTimeout(() => spinBall(rotation, Math.PI * 2, 1300), 180);
    });
    return () => {
      off();
      if (t) clearTimeout(t);
    };
  }, [reduce, rotation]);

  const big = Math.max(60, Math.min(83, w * 0.2));
  /*
   * 공은 큰 날짜 오른쪽 끝과 판 오른쪽 끝의 한가운데(2026-10-27 김민: 오른쪽에 붙어 있다 — 시안은 판 밖으로 잘렸다).
   * 날짜 칸 끝 = 왼쪽 22 + 가장 넓은 줄(WED 쯤) ≈ 글자 크기 1.15배. 양옆에 8 은 남도록 반지름을 줄인다.
   */
  const dateRight = 22 + big * 1.15;
  const R = Math.min(w < 350 ? 86 : w < 375 ? 96 : Math.min(108, w * 0.267), (w - dateRight) / 2 - 8);
  const cx = (dateRight + w) / 2;
  const cy = 36 + R * 1.28;
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));

  return (
    <View
      onLayout={(e) => {
        setW(e.nativeEvent.layout.width);
        setH(e.nativeEvent.layout.height);
      }}
      style={[styles.hero, { backgroundColor: night, boxShadow: `0 14px 30px -14px ${night}aa` }]}
    >
      {w > 0 ? (
        <>
          {/* 바탕 — 오른쪽 위 푸른 빛 · 옅은 사선 둘 · 궤도 선(시안 :before · sx-orbit-lines) */}
          <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <RadialGradient id="glow" cx={w * 0.9} cy={h * 0.08} rx={w * 0.62} ry={h * 0.62} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#0376ba" stopOpacity={0.4} />
                <Stop offset="1" stopColor="#0376ba" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width={w} height={h} fill="url(#glow)" />
            <Line x1={w * 0.18} y1={h} x2={w * 0.62} y2={0} stroke="#7dd3fc" strokeOpacity={0.06} strokeWidth={1} />
            <Line x1={w * 0.43} y1={h} x2={w * 0.87} y2={0} stroke="#7dd3fc" strokeOpacity={0.06} strokeWidth={1} />
            {/* 궤도 선은 공을 둘러(시안처럼 공 가운데에서 조금 오른쪽) */}
            <G transform={`translate(${cx + 12} ${cy + 1}) rotate(-28)`}>
              <Ellipse rx={150} ry={150 * 0.4384} fill="none" stroke="#7dcfff" strokeOpacity={0.11} />
              <Ellipse rx={128} ry={128 * 0.4384} fill="none" stroke="#7dcfff" strokeOpacity={0.1} />
              <Ellipse rx={104} ry={104 * 0.4384} fill="none" stroke="#7dcfff" strokeOpacity={0.1} />
            </G>
          </Svg>
          {/* 큰 날짜 — 숫자 · 윤곽 숫자 · 하늘 요일(시안 sx-supertype). 읽기는 위 줄 날짜가 맡는다 */}
          <Svg width={w} height={COPY_TOP + 40} style={styles.abs} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[`${month}.`, `${day}.`, weekdayEn(today)].map((t, i) => (
              <SvgText
                key={i}
                x={22}
                y={58 + big * 0.7 + i * big * 0.78}
                fontFamily="DINCondensed-Bold"
                fontSize={big}
                letterSpacing={-2}
                fill={i === 0 ? NIGHT_TEXT : i === 2 ? ACCENT : 'none'}
                stroke={i === 1 ? '#a8d9f3' : 'none'}
                strokeOpacity={0.7}
                strokeWidth={i === 1 ? 1 : 0}
              >
                {t}
              </SvgText>
            ))}
          </Svg>
          <SinkerBall
            interactive
            label="입체 야구공"
            rotation={rotation}
            size={[R * 2.4, R * 2.6]}
            radius={R}
            center={[R * 1.2, R * 1.2]}
            style={[styles.abs, { left: cx - R * 1.2, top: cy - R * 1.2 }]}
          />
          {/* 글 뒤 그러데이션 — 공 아래가 판 색으로 잠긴다(시안 :after 153px · 43%) */}
          <Svg width={w} height={153} style={[styles.abs, { top: h - 153 }]} pointerEvents="none">
            <Defs>
              <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={night} stopOpacity={0} />
                <Stop offset="0.43" stopColor={night} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect width={w} height={153} fill="url(#fade)" />
          </Svg>
        </>
      ) : null}
      <View style={styles.top} pointerEvents="none">
        <View style={styles.code}>
          <View style={styles.dot} />
          <Text style={styles.topText}>SINKER</Text>
        </View>
        <Text accessibilityLabel={`${month}월 ${day}일 ${weekdayKo(today)}요일`} style={styles.topText}>
          {dotDate(today)} · {weekdayKo(today)}
        </Text>
      </View>
      <View style={styles.spin} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name="move-horizontal" size={13} color={NIGHT_MUTED} strokeWidth={2} />
        <Text style={styles.spinText}>돌려 보세요</Text>
      </View>
      <View style={styles.copy} pointerEvents="box-none">
        <Text accessibilityRole="header" lineBreakStrategyIOS="hangul-word" style={styles.title}>
          {action.title}
        </Text>
        <Text lineBreakStrategyIOS="hangul-word" style={styles.sub}>
          {action.sub}
        </Text>
        <Press card accessibilityRole="button" accessibilityLabel={action.cta} onPress={onAction} style={[styles.cta, { backgroundColor: c.action }]}>
          <Text style={[styles.ctaText, { color: c.onAction }]}>{action.cta}</Text>
          <Icon name="arrow-up-right" size={19} color={c.onAction} strokeWidth={2.2} />
        </Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 386, borderRadius: 24, overflow: 'hidden', paddingTop: COPY_TOP, paddingHorizontal: 22, paddingBottom: 22, justifyContent: 'flex-end' },
  abs: { position: 'absolute', left: 0, top: 0 },
  top: { position: 'absolute', left: 22, right: 22, top: 19, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: ACCENT },
  topText: { fontFamily: 'DINCondensed-Bold', fontSize: 13, letterSpacing: 1.7, color: NIGHT_MUTED },
  spin: { position: 'absolute', right: 22, top: 43, flexDirection: 'row', alignItems: 'center', gap: 5 },
  spinText: { fontSize: 11, letterSpacing: 0.2, color: NIGHT_MUTED },
  copy: { zIndex: 5 },
  title: { fontSize: 20, lineHeight: 27, fontWeight: '700', letterSpacing: -0.6, color: NIGHT_TEXT, marginBottom: 6 },
  sub: { fontSize: 13, lineHeight: 19, color: NIGHT_MUTED, marginBottom: 16 },
  cta: { minHeight: 48, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  ctaText: { fontSize: 15, lineHeight: 20, fontWeight: '600', flexShrink: 1 },
});
