import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { toast } from '~/shell/toast';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { SwingListItem } from '@/app/actions/swing-lab';
import type { LabHand } from '@/lib/pitch-lab-meta';
import { SWING_GUIDE_CHECKS, swingForHand } from '@/lib/swing-lab-meta';
import { Badge, s } from '~/community/parts';
import { rpc } from '~/lib/rpc';
import { loadJson, saveJson } from '~/lib/store';
import type { Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';

/**
 * 3D 스윙 분석(타자) 앱 화면들(사용자 /swing · 3D 개발 관리자 /swing/samples · 안내 /swing/guide · 샘플 /swing/<id>)이 같이 쓰는 조각.
 * 투구 3D 동작 분석의 native/src/lab/parts.tsx 와 같은 모양 — 분석 결과가 아직 없어 상태 꼬리표 대신 영상 수를 단다.
 */

export function SwingRow({ item, name, last, onRemoved, c }: { item: SwingListItem; name: string; last: boolean; onRemoved: () => void; c: Palette }) {
  const [busy, setBusy] = useState(false);
  const remove = () =>
    Alert.alert(`${name}, 지울까요?`, '이 스윙의 영상이 모두 지워져요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const r = await rpc<{ ok: true } | { error: string }>('swing-lab.removeSwingSample', { id: item.id });
            if ('error' in r) return toast(`지우지 못했어요. ${r.error}`, 'error');
            onRemoved();
          } catch {
            toast('지우지 못했어요. 신호가 약해 보내지 못했어요. 다시 해 주세요.', 'error');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  return (
    <View style={[s.row, { opacity: busy ? 0.5 : 1 }, last ? null : { borderBottomWidth: 0.5, borderBottomColor: c.line }]}>
      <Pressable
        accessibilityRole="button"
        disabled={item.broken}
        onPress={() => router.push(`/swing/${item.id}` as Href)}
        style={({ pressed }) => [{ flex: 1, gap: 3, opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }} numberOfLines={1}>
          {name}
          {item.when ? <Text style={[s.meta, { color: c.muted, fontWeight: '400' }]}>{`  ${item.when}`}</Text> : null}
        </Text>
        {item.broken ? (
          <Text style={[s.meta, { color: c.muted }]}>올리다 멈췄어요</Text>
        ) : item.chips.length > 0 ? (
          <Text style={[s.meta, { color: c.muted }]} numberOfLines={1}>
            {item.chips.join(' · ')}
          </Text>
        ) : null}
        {item.memo ? (
          <Text style={[s.meta, { color: c.ink }]} numberOfLines={1}>
            {item.memo}
          </Text>
        ) : null}
        {!item.broken ? <Badge text={`영상 ${item.videoCount}개`} c={c} /> : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${name} 지우기`} disabled={busy} onPress={remove} hitSlop={6} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="trash2" size={20} color={c.muted} />
      </Pressable>
    </View>
  );
}

export function Points({ items, c }: { items: readonly string[]; c: Palette }) {
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

const CHECK_KEY = 'bullpen-swing-guide-checks';

/** 찍기 전 확인 — 이 폰에만 남는다(투구 안내와 따로) */
export function SwingChecklist({ hand, c }: { hand: LabHand; c: Palette }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => {
    void loadJson(CHECK_KEY).then((v) => Array.isArray(v) && setDone(new Set(v.filter((x): x is string => typeof x === 'string'))));
  }, []);
  const save = (next: Set<string>) => {
    setDone(next);
    void saveJson(CHECK_KEY, [...next]);
  };
  const count = SWING_GUIDE_CHECKS.filter((x) => done.has(x.id)).length;
  const all = count === SWING_GUIDE_CHECKS.length;
  return (
    <View style={{ gap: 4 }}>
      {SWING_GUIDE_CHECKS.map((x) => {
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
            <Text style={{ flex: 1, color: on ? c.muted : c.ink, fontSize: 15 }}>{swingForHand(x.title, hand)}</Text>
          </Pressable>
        );
      })}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={[s.meta, { color: all ? c.ok : c.muted, fontWeight: '600' }]}>{all ? '다 됐어요. 찍어도 돼요' : `${count} / ${SWING_GUIDE_CHECKS.length}`}</Text>
        {count > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => save(new Set())} hitSlop={8} style={{ minHeight: 32, justifyContent: 'center' }}>
            <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>다시</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * 폰 두 대 자리(위에서 본 그림) — 위가 투수, 아래가 포수 뒤. 우타는 타자가 홈 왼쪽(3루 쪽) 타석, 정면 폰은 오른쪽(1루 쪽).
 * 좌타는 좌우를 뒤집는다(웹 app/(app)/hitting/lab/guide 의 그림과 같은 좌표).
 */
export function SwingPlaceArt({ hand, c }: { hand: LabHand; c: Palette }) {
  const flip = (x: number) => (hand === 'L' ? 320 - x : x);
  const batterX = flip(122);
  const frontX = flip(270);
  return (
    <View style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: c.page }}>
      <Svg viewBox="0 0 320 210" width="100%" style={{ aspectRatio: 320 / 210 }} accessibilityLabel="폰 두 대 자리 그림">
        {/* 공 길 */}
        <Line x1={160} y1={28} x2={160} y2={118} stroke={c.line} strokeWidth={2} strokeDasharray="4 5" />
        <Circle cx={160} cy={22} r={7} fill={c.muted} />
        <SvgText x={160} y={46} fontSize={11} fill={c.muted} textAnchor="middle">
          투수
        </SvgText>
        {/* 홈 · 타석 */}
        <Path d="M150 124 L170 124 L170 132 L160 140 L150 132 Z" fill={c.card} stroke={c.muted} strokeWidth={1.5} />
        <Rect x={flip(122) - 14} y={110} width={28} height={42} fill="none" stroke={c.line} strokeWidth={1.5} />
        <Circle cx={batterX} cy={131} r={9} fill={c.sky} />
        <SvgText x={batterX} y={168} fontSize={11} fill={c.ink} textAnchor="middle">
          {hand === 'L' ? '좌타' : '우타'}
        </SvgText>
        {/* 정면 폰 */}
        <Line x1={frontX} y1={131} x2={batterX} y2={131} stroke={c.sky} strokeWidth={1.5} strokeDasharray="3 4" />
        <Rect x={frontX - 7} y={119} width={14} height={24} rx={3} fill={c.ink} />
        <SvgText x={frontX} y={108} fontSize={11} fill={c.ink} textAnchor="middle">
          정면 폰
        </SvgText>
        {/* 포수 뒤 폰 */}
        <Line x1={160} y1={188} x2={batterX} y2={131} stroke={c.sky} strokeWidth={1.5} strokeDasharray="3 4" />
        <Rect x={153} y={182} width={14} height={24} rx={3} fill={c.ink} />
        <SvgText x={flip(196)} y={200} fontSize={11} fill={c.ink} textAnchor="middle">
          포수 뒤 폰
        </SvgText>
        {/* 그물 */}
        <Line x1={frontX - 18} y1={112} x2={frontX - 18} y2={150} stroke={c.muted} strokeWidth={2} />
        <Line x1={140} y1={175} x2={180} y2={175} stroke={c.muted} strokeWidth={2} />
      </Svg>
    </View>
  );
}
