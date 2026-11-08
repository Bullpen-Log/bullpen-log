import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';
import { V2_FAIL_TEXT, type V2FailCode } from '@/lib/pitch-3d/v2/contract';
import {
  LAB_FAIL_FIX,
  LAB_GUIDE_CHECKS,
  LAB_GUIDE_LENS_NOTE,
  LAB_GUIDE_MOVE_NOTE,
  LAB_GUIDE_POINTS,
  LAB_GUIDE_SECTION_NAME,
  LAB_LENS_DISTANCES,
  labGuideUploadPoints,
  type LabGuideSection,
} from '@/lib/pitch-lab-guide';
import { forHand, LAB_MAX_VIDEO_MB, type LabHand } from '@/lib/pitch-lab-meta';
import { Bar, s } from '~/community/parts';
import { loadJson, saveJson } from '~/lib/store';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 3D 동작 분석 촬영 안내(앱 화면) — 웹 app/(app)/videos/lab/guide/ 를 옮겼다. 글 · 근거는 둘이 같이 쓰는 lib/pitch-lab-guide.ts 한 곳,
 * 그림은 웹 guide-art.tsx 를 react-native-svg 로 옮겼다(같은 좌표). ?s=<칸> 이면 그 카드부터 연다(목록 화면의 오류 밑 바로가기).
 * 2026-11-08 김민: "밑으로 내리며 보니 읽기 힘들다, 카드로 하나 확인하면 다음" → 한 화면에 카드 하나, 아래 [이전 | 확인했어요].
 * 마지막 카드가 찍기 전 확인(앞 카드들의 요약), '분석이 안 됐다면'은 흐름 밖 카드(그 카드에서 링크 · ?s=fail).
 * 확인 목록 체크는 이 폰에만(앱 저장소 — 웹 localStorage 와 따로).
 */
const CHECK_KEY = 'bullpen-lab-guide-checks';
const FLOW: LabGuideSection[] = ['place', 'frame', 'phone', 'steps', 'move', 'upload', 'checklist'];
const ALL: LabGuideSection[] = [...FLOW, 'fail'];

export default function LabGuideScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { s: jump, hand: handParam } = useLocalSearchParams<{ s?: string; hand?: string }>();
  const hand: LabHand = handParam === 'L' ? 'L' : 'R';
  const scroll = useRef<ScrollViewInstance>(null);
  const [page, setPage] = useState<LabGuideSection>(ALL.includes(jump as LabGuideSection) ? (jump as LabGuideSection) : FLOW[0]);
  const idx = FLOW.indexOf(page); // 실패 카드는 −1
  const last = idx === FLOW.length - 1;

  const go = (next: LabGuideSection) => {
    void Haptics.selectionAsync();
    setPage(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const back = () => (page === 'fail' ? go('checklist') : idx > 0 ? go(FLOW[idx - 1]) : router.back());
  const forward = () => (last || page === 'fail' ? router.back() : go(FLOW[idx + 1]));

  const body = (id: LabGuideSection): ReactNode => {
    switch (id) {
      case 'checklist':
        return (
          <>
            <Checklist hand={hand} c={c} />
            <Pressable accessibilityRole="link" onPress={() => go('fail')} hitSlop={6} style={{ minHeight: 32, justifyContent: 'center' }}>
              <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>{LAB_GUIDE_SECTION_NAME.fail} ›</Text>
            </Pressable>
          </>
        );
      case 'place':
        return (
          <>
            <PlacementArt hand={hand} c={c} />
            <Points items={LAB_GUIDE_POINTS.place.map((t) => forHand(t, hand))} c={c} />
            <Fold title="렌즈별 참고 거리" c={c}>
              {LAB_LENS_DISTANCES.map((r) => (
                <View key={r.lens} style={{ flexDirection: 'row', gap: 8, paddingVertical: 6, borderTopWidth: 0.5, borderTopColor: c.line }}>
                  <View style={{ flex: 1.4 }}>
                    <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{r.lens}</Text>
                    <Text style={[s.meta, { color: c.muted }]}>{r.phones}</Text>
                  </View>
                  <Text style={{ flex: 1, color: c.ink, fontSize: 15 }}>옆 {r.side}</Text>
                  <Text style={{ flex: 1, color: c.ink, fontSize: 15 }}>뒤 {r.back}</Text>
                </View>
              ))}
              <Text style={[s.meta, { color: c.muted }]}>{LAB_GUIDE_LENS_NOTE}</Text>
            </Fold>
          </>
        );
      case 'frame':
        return (
          <>
            <FramingArt c={c} />
            <Points items={LAB_GUIDE_POINTS.frame} c={c} />
          </>
        );
      case 'phone':
        return <Points items={LAB_GUIDE_POINTS.phone} c={c} />;
      case 'steps':
        return (
          <View style={{ gap: 10 }}>
            {LAB_GUIDE_POINTS.steps.map((text, i) => (
              <View key={text} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.action }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, color: c.ink, fontSize: 15, lineHeight: 22, paddingTop: 1 }}>{text}</Text>
              </View>
            ))}
          </View>
        );
      case 'move':
        return (
          <>
            <Points items={LAB_GUIDE_POINTS.move} c={c} />
            <Text style={{ color: c.ink, fontSize: 15, lineHeight: 22, borderRadius: 12, padding: 12, backgroundColor: c.page }}>{LAB_GUIDE_MOVE_NOTE}</Text>
          </>
        );
      case 'upload':
        return <Points items={labGuideUploadPoints(LAB_MAX_VIDEO_MB)} c={c} />;
      case 'fail':
        return (
          <View style={{ gap: 4 }}>
            {(Object.keys(LAB_FAIL_FIX) as V2FailCode[]).map((code) => {
              const fix = LAB_FAIL_FIX[code];
              if (!fix) return null;
              return (
                <View key={code} style={{ gap: 2, paddingVertical: 4 }}>
                  <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{V2_FAIL_TEXT[code]}</Text>
                  <Text style={[s.meta, { color: c.muted, lineHeight: 19 }]}>{forHand(fix.fix, hand)}</Text>
                  <Pressable accessibilityRole="link" onPress={() => go(fix.section)} hitSlop={6} style={{ minHeight: 32, justifyContent: 'center' }}>
                    <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>{LAB_GUIDE_SECTION_NAME[fix.section]} ›</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="3D 분석" title="촬영 안내" c={c} />
      {/* 어디쯤인지 — 칸을 누르면 그 카드로 */}
      <View style={[{ paddingHorizontal: 16, paddingTop: 4, gap: 8 }, READABLE]}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {FLOW.map((id, i) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={`${i + 1}. ${LAB_GUIDE_SECTION_NAME[id]}`}
              accessibilityState={{ selected: id === page }}
              onPress={() => go(id)}
              hitSlop={{ top: 10, bottom: 10 }}
              style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: idx >= 0 && i <= idx ? c.action : c.line }}
            />
          ))}
        </View>
        <Text style={[s.meta, { color: c.muted }]}>{idx >= 0 ? `${idx + 1} / ${FLOW.length}` : '도움말'}</Text>
      </View>
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={[{ padding: 16, paddingTop: 10 }, READABLE]}>
        <Animated.View key={page} entering={FadeIn.duration(180)} style={{ borderRadius: 16, padding: 16, gap: 14, backgroundColor: c.card, boxShadow: c.float }}>
          <Text style={{ color: c.ink, fontSize: 22, fontWeight: '700' }}>{LAB_GUIDE_SECTION_NAME[page]}</Text>
          {body(page)}
        </Animated.View>
      </ScrollView>
      <View style={[{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: inset.bottom + 12 }, READABLE]}>
        <Pressable
          accessibilityRole="button"
          onPress={back}
          style={({ pressed }) => [s.primary, { marginTop: 0, flex: 1, backgroundColor: c.card, borderWidth: 0.5, borderColor: c.line, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[s.primaryText, { color: c.ink }]}>{idx === 0 ? '닫기' : '이전'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={forward}
          style={({ pressed }) => [s.primary, { marginTop: 0, flex: 2, backgroundColor: c.action, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={s.primaryText}>{last || page === 'fail' ? '영상 올리러 가기' : '확인했어요'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Points({ items, c }: { items: readonly string[]; c: Palette }) {
  return (
    <View style={{ gap: 8 }}>
      {items.map((text) => (
        <View key={text} style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 8, backgroundColor: c.action }} />
          <Text style={{ flex: 1, color: c.ink, fontSize: 15, lineHeight: 22 }}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

function Fold({ title, children, c }: { title: string; children: ReactNode; c: Palette }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ borderRadius: 12, paddingHorizontal: 12, backgroundColor: c.page }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: c.muted, fontSize: 15 }}>{open ? '접기' : '펴기'}</Text>
      </Pressable>
      {open ? <View style={{ paddingBottom: 10, gap: 6 }}>{children}</View> : null}
    </View>
  );
}

/** 찍기 전 확인 — 현장에서 하나씩 체크(이 폰에만 남는다, 다음 촬영 때 '다시'로 비운다) */
function Checklist({ hand, c }: { hand: LabHand; c: Palette }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => {
    void loadJson(CHECK_KEY).then((v) => Array.isArray(v) && setDone(new Set(v.filter((x): x is string => typeof x === 'string'))));
  }, []);
  const save = (next: Set<string>) => {
    setDone(next);
    void saveJson(CHECK_KEY, [...next]);
  };
  const count = LAB_GUIDE_CHECKS.filter((x) => done.has(x.id)).length;
  return (
    <View style={{ gap: 4 }}>
      {LAB_GUIDE_CHECKS.map((x) => {
        const on = done.has(x.id);
        return (
          <Pressable
            key={x.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => {
              const next = new Set(done);
              if (on) next.delete(x.id);
              else next.add(x.id);
              save(next);
            }}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.sky : c.line, backgroundColor: on ? c.sky : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {on ? <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>✓</Text> : null}
            </View>
            <Text style={{ flex: 1, color: on ? c.muted : c.ink, fontSize: 15 }}>{forHand(x.title, hand)}</Text>
          </Pressable>
        );
      })}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={[s.meta, { color: count === LAB_GUIDE_CHECKS.length ? c.ok : c.muted, fontWeight: '600' }]}>
          {count === LAB_GUIDE_CHECKS.length ? '다 됐어요. 찍어도 돼요' : `${count} / ${LAB_GUIDE_CHECKS.length}`}
        </Text>
        {count > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => save(new Set())} hitSlop={8} style={{ minHeight: 32, justifyContent: 'center' }}>
            <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>다시</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/* ───────────── 그림(웹 guide-art.tsx 와 같은 좌표 — 글자는 그림 위에 얹는다) ───────────── */

const W = 320;
const H = 210;

function Tag({ x, y, children, color, align = 'center', c }: { x: number; y: number; children: ReactNode; color: string; align?: 'start' | 'center' | 'end'; c: Palette }) {
  /* 자리는 그림 칸의 % — 가운데 · 끝 맞춤은 너비를 몰라 바깥 상자를 넓게 두고 안에서 맞춘다 */
  const box = 180;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: `${(y / H) * 100}%`,
        left: `${(x / W) * 100}%`,
        width: box,
        marginTop: -11,
        marginLeft: align === 'start' ? 0 : align === 'end' ? -box : -box / 2,
        alignItems: align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : 'center',
      }}
    >
      <Text style={{ color, fontSize: 13, fontWeight: '600', backgroundColor: c.card, borderRadius: 10, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2 }}>{children}</Text>
    </View>
  );
}

function Phone({ x, y, angle, tone, c }: { x: number; y: number; angle: number; tone: string; c: Palette }) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${angle})`}>
      <Rect x={-5} y={-11} width={10} height={22} rx={3} fill={c.card} stroke={tone} strokeWidth={2} />
      <Path d="M5 -5 h3 v10 h-3" fill={tone} />
    </G>
  );
}

/** 폰 두 대 자리 — 위에서 본 마운드(웹 PlacementArt). 좌투면 위아래를 뒤집어 옆 폰이 위(1루)에 선다 */
function PlacementArt({ hand, c }: { hand: LabHand; c: Palette }) {
  const sgn = hand === 'L' ? -1 : 1;
  const P = { x: 140, y: sgn === 1 ? 88 : H - 88 };
  const home = { x: 298, y: P.y };
  const side = { x: P.x, y: P.y + sgn * 96 };
  const back = { x: 30, y: P.y };
  const corner = 16;
  return (
    <View style={{ width: '100%', aspectRatio: W / H }}>
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%">
        <Ellipse cx={P.x - 4} cy={P.y} rx={44} ry={38} fill={c.line} />
        <Rect x={P.x - 15} y={P.y - 7} width={4} height={14} rx={1} fill={c.card} stroke={c.ink} strokeWidth={1.5} />
        <Path d={`M${home.x - 7} ${home.y - 7} h9 l6 7 l-6 7 h-9 z`} fill={c.card} stroke={c.ink} strokeWidth={1.5} strokeLinejoin="round" />
        <Path d={`M${P.x + 16} ${P.y} H${home.x - 16}`} stroke={c.muted} strokeWidth={1.5} strokeDasharray="4 5" strokeLinecap="round" />
        <Path d={`M${home.x - 22} ${P.y - 5} l6 5 l-6 5`} fill="none" stroke={c.muted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={`M${back.x + 9} ${P.y} H${P.x - corner}`} stroke={c.ink} strokeWidth={2} strokeLinecap="round" />
        <Path d={`M${P.x} ${side.y - sgn * 9} V${P.y + sgn * corner}`} stroke={c.sky} strokeWidth={2} strokeLinecap="round" />
        <Path d={`M${P.x - corner} ${P.y} V${P.y + sgn * corner} H${P.x}`} fill="none" stroke={c.muted} strokeWidth={1.5} strokeLinejoin="round" />
        <Ellipse cx={P.x} cy={P.y} rx={6} ry={12} fill={c.card} stroke={c.ink} strokeWidth={2} />
        <Circle cx={P.x + 1} cy={P.y} r={4} fill={c.ink} />
        <Phone x={back.x} y={back.y} angle={0} tone={c.ink} c={c} />
        <Phone x={side.x} y={side.y} angle={-90 * sgn} tone={c.sky} c={c} />
      </Svg>
      <Tag x={back.x - 8} y={P.y - sgn * 28} color={c.ink} align="start" c={c}>
        뒤 폰 · 2루 쪽 3~4m · 세로
      </Tag>
      <Tag x={side.x + 18} y={side.y} color={c.link} align="start" c={c}>
        옆 폰 · {hand === 'L' ? '1루' : '3루'} 쪽 3.5~5m · 가로
      </Tag>
      <Tag x={home.x} y={home.y - 22} color={c.muted} c={c}>
        홈
      </Tag>
      <Tag x={P.x - corner - 6} y={P.y + sgn * (corner + 12)} color={c.muted} align="end" c={c}>
        90°
      </Tag>
    </View>
  );
}

/** 막대 사람(옆에서 본 내딛기 · 공 놓기) — 발끝 y=50, 머리 위 y=1, 오른쪽으로 던진다 */
function Pitcher({ c }: { c: Palette }) {
  return (
    <G fill="none" stroke={c.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={30} cy={6} r={5} fill={c.card} />
      <Path d="M30 12 L26 28" />
      <Path d="M26 28 L14 38 L4 50" />
      <Path d="M26 28 L40 38 L46 50" />
      <Path d="M30 14 L40 8 L50 4" />
      <Path d="M30 14 L22 20 L20 26" />
    </G>
  );
}

/** 화면에 담는 법 — 알맞음 · 너무 작음 · 잘림(웹 FramingArt) */
function FramingArt({ c }: { c: Palette }) {
  const cases = [
    { id: 'frame-good', place: 'translate(46 24)', ok: true, label: '알맞아요' },
    { id: 'frame-small', place: 'translate(68 53) scale(0.42)', ok: false, label: '너무 작아요' },
    { id: 'frame-cut', place: 'translate(112 26) scale(1.1)', ok: false, label: '손이 잘려요' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {cases.map((k) => (
        <View key={k.id} style={{ flex: 1, gap: 6 }}>
          <View style={{ width: '100%', aspectRatio: 160 / 90 }}>
            <Svg viewBox="0 0 160 90" width="100%" height="100%">
              <Defs>
                <ClipPath id={k.id}>
                  <Rect x={2} y={2} width={156} height={86} rx={8} />
                </ClipPath>
              </Defs>
              <Rect x={2} y={2} width={156} height={86} rx={8} fill={c.page} />
              <Path d="M2 74 H158" stroke={c.line} strokeWidth={1.5} clipPath={`url(#${k.id})`} />
              <G clipPath={`url(#${k.id})`}>
                <G transform={k.place}>
                  <Pitcher c={c} />
                </G>
              </G>
              <Rect x={2} y={2} width={156} height={86} rx={8} fill="none" stroke={c.muted} strokeWidth={2} />
            </Svg>
          </View>
          <Text style={{ color: k.ok ? c.ok : c.danger, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
            {k.ok ? '✓ ' : '! '}
            {k.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
