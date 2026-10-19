import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Icon } from '~/shell/icon';
import { CardButton } from './camera-ui';
import type { CameraMode } from './mode';

/*
 * 주의사항 — 웹 components/velocity/tips-popup.tsx TipsCard 와 같은 꼴: 위 그림(옅은 하늘 판) · '주의사항 n/4' · 제목 · 짧은 글 · '자세히' 펼침 ·
 * 점(눌러 바로 가기) · '오늘은 보지 않기' · 아래 단추(다음 · 마지막은 카메라 맞추기). 글 · 그림은 setup-steps.tsx tipsFor 의 투수 뒤 카드 넷 그대로.
 * 앱은 투수 뒤만 재서 렌즈 · 1x · 포수 뒤 자리 · 미트 표적 카드는 없다(웹도 투수 뒤면 뺀다).
 * 모드를 고르면 맨 앞에 '사용 방법' 카드가 붙는다(tipsFor — 2026-10-20 김민: 고른 뒤 먼저 사용 방법과 안내사항, 그다음 시작). ABS 는 플레이트 카드도.
 */
export const TIPS_SKIP_KEY = 'bullpen-velocity-tips-skip';

const SKY = '#0a84d6';
const WARN = '#b45309';
const OK = '#047857';

/** kicker — 카드 위 작은 이름(없으면 '주의사항') */
type Tip = { key: string; title: string; short: string; long: string; art: () => React.JSX.Element; kicker?: string };

const svg = { viewBox: '0 0 200 150', width: '100%', height: '100%', fill: 'none', stroke: SKY, strokeWidth: 4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const TIPS: Tip[] = [
  {
    key: 'tripod',
    title: '삼각대에 고정하세요',
    short: '손으로 들면 재지 않아요. 흔들리면 배경이 밀려 공을 못 찾아요.',
    long: '계산은 "배경은 가만히 있고 공만 움직인다"는 전제로 돌아가요. 손으로 들면 화면 전체가 조금씩 밀려서 공이 아닌 것이 움직인 것처럼 보여요. 조금 흔들리면 값에 알림이 붙고, 많이 흔들리면 재지 않아요. 삼각대가 없으면 가방 위, 펜스 틈 같은 곳에 단단히 기대 두세요. 셔터를 누를 때 폰을 건드리지 않게 소리 안내나 타이머를 쓰면 좋아요.',
    art: () => (
      <Svg {...svg}>
        <Rect x="82" y="22" width="36" height="62" rx="6" fill="white" />
        <Circle cx="100" cy="46" r="7" />
        <Path d="M100 84v14M100 98L62 140M100 98l38 42M100 98v42" />
        <Path d="M30 60l-8 8M22 60l8 8" stroke={WARN} />
        <Path d="M170 60l-8 8M162 60l8 8" stroke={WARN} />
        <Path d="M150 40c8-6 16-6 24 0" strokeDasharray="4 6" />
      </Svg>
    ),
  },
  {
    key: 'level',
    title: '폰을 수평으로',
    short: "카메라 화면 왼쪽 위 수평계가 초록 '수평'이 되게 맞추세요.",
    long: '옆으로 기울면 공이 화면을 비스듬히 지나가고 스트라이크 존 격자도 기울어요. 삼각대 헤드를 돌려 좌우 기울기를 1.5° 안으로 맞추세요. 수평계의 선이 양쪽 눈금과 나란해지면 초록이 돼요. 앞뒤는 표적을 맞추느라 조금(10° 안) 숙이거나 젖혀도 괜찮아요. 폰이 기울기 값을 주지 않는 기기면 수평계가 안 뜨고, 그때는 눈으로 맞추세요.',
    art: () => (
      <Svg {...svg}>
        <Rect x="30" y="66" width="140" height="22" rx="11" fill="white" />
        <Path d="M100 58v38" stroke="#94a3b8" strokeDasharray="3 5" />
        <Circle cx="100" cy="77" r="8" fill={OK} stroke="none" />
        <Rect x="60" y="22" width="80" height="26" rx="8" fill="white" transform="rotate(-8 100 35)" />
        <Path d="M150 30l10-6M150 30l6 10" stroke={WARN} />
        <Rect x="60" y="106" width="80" height="26" rx="8" fill="white" />
        <Path d="M150 119l10 0" stroke={OK} />
      </Svg>
    ),
  },
  {
    key: 'light',
    title: '밝은 곳, 단순한 배경',
    short: '밝을수록 셔터가 빨라져 공이 덜 번져요. 역광을 피하고, 흰 공 · 어두운 배경이 가장 잘 잡혀요.',
    long: '공은 배경보다 밝게 찍혀야 찾을 수 있어요. 해를 마주 보면 공이 검게 찍혀 못 찾고, 흰 벽 · 밝은 하늘이 배경이면 공과 구분이 안 돼요. 그물 · 초록 펜스 · 어두운 실내 벽이 좋은 배경이에요. 어두우면 카메라가 셔터를 길게 열어 공이 길게 번지고 자리를 잘못 잡아요. 낮의 야외나 밝은 실내에서 재세요. 형광등 · LED 아래에서는 조명 깜빡임(60Hz)으로 밝기가 프레임마다 흔들릴 수 있어요. 때가 탄 공보다 흰 공이 정확해요. 카메라 바로 앞에 그물이 있으면 초점이 그물에 잡힐 수 있으니 그물에서 30cm 이상 떨어지세요.',
    art: () => (
      <Svg {...svg}>
        <Circle cx="46" cy="40" r="16" fill="white" />
        <Path d="M46 12v8M46 60v8M18 40h8M66 40h8M26 20l6 6M60 54l6 6M26 60l6-6M60 26l6-6" />
        <Rect x="104" y="30" width="80" height="100" rx="8" fill="#1e293b" stroke="#1e293b" />
        <Path d="M112 38v84M124 38v84M136 38v84M148 38v84M160 38v84M172 38v84M104 50h80M104 66h80M104 82h80M104 98h80M104 114h80" stroke="#475569" strokeWidth={2} />
        <Circle cx="144" cy="80" r="9" fill="white" stroke="white" />
      </Svg>
    ),
  },
  {
    key: 'fps',
    title: '고속 촬영 · 1080p 이상',
    short: '앱이 1080p · 60fps 로 찍어요. 공이 날아가는 길을 장면마다 담아요.',
    long: '공은 손을 떠나 0.5~1초 동안 그물까지 날아가요. 초당 60장이면 그 길이 30~60장에 담겨 물리 궤적을 정확히 맞춰요. 초당 30장이면 장수가 반이라 덜 정확해요(값에 알림이 붙어요). 120 · 240장으로 찍혀도 60장 남짓으로 솎아 재요. 해상도는 1080p 이상. 낮으면 그물 쪽 먼 공이 몇 픽셀로 줄어 끝까지 못 따라가요.',
    art: () => (
      <Svg {...svg}>
        <Rect x="16" y="26" width="168" height="98" rx="10" fill="white" />
        <Path d="M16 46h168M16 104h168" />
        <Path d="M32 26v20M56 26v20M80 26v20M104 26v20M128 26v20M152 26v20M176 26v20M32 104v20M56 104v20M80 104v20M104 104v20M128 104v20M152 104v20M176 104v20" />
        <Circle cx="44" cy="75" r="9" fill="white" />
        <Circle cx="78" cy="75" r="7" fill="white" />
        <Circle cx="108" cy="75" r="5.5" fill="white" />
        <Circle cx="134" cy="75" r="4" fill="white" />
        <Circle cx="156" cy="75" r="3" fill="white" />
        <SvgText x="100" y="142" textAnchor="middle" fontSize="13" fontWeight="700" fill={WARN} stroke="none">
          120~240 fps
        </SvgText>
      </Svg>
    ),
  },
];

/* 사용 방법 — 구속 측정 */
const HOWTO_SPEED: Tip = {
  key: 'howto-speed',
  kicker: '사용 방법',
  title: '이렇게 재요',
  short: '폰을 투수 바로 뒤에 두고 설정을 마친 뒤 빨간 단추를 눌러요. 그다음엔 던지기만 하면 공마다 저절로 재요.',
  long: '1. 투구 종류를 고르고 폰을 투수 뒤 1m 안, 던지는 방향 정면에 둬요. 2. 수평을 맞추고 릴리스 포인트가 가운데 표적에 오게 해요. 3. 스트라이크 존 크기를 맞춰요. 4. 빨간 단추를 누르고 던지면 공마다 구속이 떠요. 5. 다 던졌으면 세션 종료를 눌러 체감 강도를 고르고 저장해요.',
  art: () => (
    <Svg {...svg}>
      <Rect x="18" y="52" width="28" height="48" rx="5" fill="white" />
      <Circle cx="32" cy="70" r="5" />
      <Path d="M32 100v12M32 112l-14 22M32 112l14 22" />
      <Path d="M56 76c30-14 64-14 100 0" strokeDasharray="4 7" />
      <Circle cx="72" cy="70" r="7" fill="white" />
      <Circle cx="104" cy="65" r="5" fill="white" />
      <Circle cx="134" cy="68" r="3.5" fill="white" />
      <Rect x="158" y="40" width="26" height="70" rx="4" fill="#1e293b" stroke="#1e293b" />
      <Path d="M158 58h26M158 76h26M158 94h26M171 40v70" stroke="#475569" strokeWidth={2} />
    </Svg>
  ),
};

/* 사용 방법 — ABS 판정(lib/abs, 설정 5단계의 홈플레이트 · 타자) */
const HOWTO_ABS: Tip = {
  key: 'howto-abs',
  kicker: '사용 방법',
  title: 'ABS 는 이렇게 판정해요',
  short: '구속 측정 설정에 홈플레이트 · 타자 단계가 하나 더 있어요. 공마다 볼 · 스트라이크와 구속이 같이 떠요.',
  long: '1. 구속 측정과 같이 종류 · 자리 · 수평 · 존을 맞춰요. 2. 흰 홈플레이트가 존 밑에 보이게 두면 저절로 찾아요. 못 찾으면 직접 맞추기로 앞변 양 끝을 맞춰요. 3. 타자 신장을 고르면 존 위아래가 정해져요. 측정 중에는 위 칩으로 다음 타자를 바꿔요. 4. 판정은 아직 참고용이에요. 실제 판정과 다를 수 있어요.',
  art: () => (
    <Svg {...svg}>
      <Rect x="70" y="18" width="60" height="78" rx="3" fill="white" />
      <Path d="M90 18v78M110 18v78M70 44h60M70 70h60" stroke="#94a3b8" strokeWidth={2} />
      <Circle cx="100" cy="57" r="7" fill={OK} stroke="none" />
      <Path d="M70 112h60l-6 14-24 12-24-12z" fill="white" />
      <SvgText x="160" y="62" textAnchor="middle" fontSize="22" fontWeight="800" fill={OK} stroke="none">
        S
      </SvgText>
    </Svg>
  ),
};

const ABS_PLATE: Tip = {
  key: 'abs-plate',
  title: '홈플레이트가 보이게',
  short: '홈플레이트 전체가 화면에 들어오게 둬요. 흙이나 그늘에 가리면 못 찾아요.',
  long: '플레이트 앞변(투수 쪽 변) 두 끝으로 거리와 기울기를 맞춰요. 앞변이 존 밑에 또렷이 보여야 해요. 플레이트가 흙에 덮였으면 쓸어 주세요. 판정 중에 삼각대가 움직이면 판정이 어긋나니 단단히 고정해요.',
  art: () => (
    <Svg {...svg}>
      <Rect x="40" y="16" width="120" height="118" rx="10" fill="white" />
      <Path d="M70 92h60l-6 14-24 12-24-12z" fill="white" />
      <Path d="M70 92h60" stroke={OK} strokeWidth={5} />
      <Circle cx="70" cy="92" r="5" fill={SKY} stroke="none" />
      <Circle cx="130" cy="92" r="5" fill={SKY} stroke="none" />
    </Svg>
  ),
};

/** 모드를 고른 뒤 보이는 카드 — 사용 방법(ABS 는 플레이트 카드까지) → 주의사항 넷 */
export const tipsFor = (mode: CameraMode): Tip[] => (mode === 'abs' ? [HOWTO_ABS, ABS_PLATE, ...TIPS] : [HOWTO_SPEED, ...TIPS]);

export function TipsCard({
  tips = TIPS,
  index,
  onIndex,
  action,
  onSkipToday,
}: {
  tips?: Tip[];
  index: number;
  onIndex: (i: number) => void;
  action: { label: string; onPress: () => void };
  onSkipToday: () => void;
}) {
  const at = Math.min(index, tips.length - 1);
  const tip = tips[at];
  /* 장이 바뀌면 접힌 채로 */
  const [detailOf, setDetailOf] = useState<string | null>(null);
  const detail = detailOf === tip.key;
  return (
    <View style={st.card}>
      <Animated.View key={tip.key} entering={FadeIn.duration(180)}>
        <View style={st.art}>{tip.art()}</View>
        <View style={st.body}>
          <Text style={st.count}>
            {tip.kicker ?? '주의사항'} {at + 1}/{tips.length}
          </Text>
          <Text style={st.title}>{tip.title}</Text>
          <Text style={st.short}>{tip.short}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: detail }}
            onPress={() => setDetailOf(detail ? null : tip.key)}
            style={st.more}
          >
            <Icon name="info" size={16} color={SKY} />
            <Text style={st.moreText}>자세히</Text>
            <Icon name={detail ? 'chevron-up' : 'chevron-down'} size={16} color={SKY} />
          </Pressable>
          {detail ? (
            <Animated.Text entering={FadeIn.duration(160)} style={st.long}>
              {tip.long}
            </Animated.Text>
          ) : null}
        </View>
      </Animated.View>
      <View style={st.foot}>
        <View style={st.dots} accessibilityLabel={`${at + 1} / ${tips.length}`}>
          {tips.map((t, k) => (
            <Pressable key={t.key} accessibilityRole="button" accessibilityLabel={`${k + 1}번째 카드`} onPress={() => onIndex(k)} hitSlop={6} style={st.dotHit}>
              <View style={[st.dot, k === at ? st.dotOn : null]} />
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={onSkipToday} style={st.skip}>
          <Text style={st.skipText}>오늘은 보지 않기</Text>
        </Pressable>
      </View>
      <View style={st.action}>
        <CardButton label={action.label} onPress={action.onPress} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: '#f2f2f7',
    borderRadius: 28,
    overflow: 'hidden',
    boxShadow: '0 12px 32px -6px rgba(0,0,0,0.45), 0 30px 60px -20px rgba(0,0,0,0.5)',
  },
  art: { height: 150, backgroundColor: 'rgba(232,243,252,0.6)', paddingHorizontal: 24, paddingVertical: 10, alignItems: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  count: { fontSize: 12, fontWeight: '600', color: '#6e6e73', fontVariant: ['tabular-nums'] },
  title: { marginTop: 4, fontSize: 20, fontWeight: '700', color: '#1d1d1f' },
  short: { marginTop: 6, fontSize: 15, lineHeight: 22, color: '#6e6e73' },
  more: { marginTop: 4, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  moreText: { fontSize: 15, fontWeight: '600', color: SKY },
  long: { marginTop: 4, borderRadius: 16, backgroundColor: '#e5e5ea', paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, lineHeight: 22, color: '#1d1d1f', overflow: 'hidden' },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8 },
  dots: { flexDirection: 'row', alignItems: 'center' },
  dotHit: { height: 40, justifyContent: 'center', paddingHorizontal: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#c7c7cc' },
  dotOn: { width: 20, backgroundColor: SKY },
  skip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 },
  skipText: { fontSize: 15, color: '#6e6e73' },
  action: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 20 },
});
