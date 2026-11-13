import { SymbolView } from 'expo-symbols';
import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { finiteTime, seekRange, timeText } from '@/lib/exercise-video-state';
import { CONTROL, TYPE, withAlpha, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 운동영상 조작부(앱, VP01) — 검은 플레이어 틀의 하단, 영상 무대와 분리된 형제 칸. 영상 위에 겹치지 않는다. 인라인과 크게 보기가 같은 부품을 쓴다.
 *
 * 재생/정지 · 탐색 막대 · 반복 토글 · 배속 · 크게 보기. 시간은 아래에 두며 좁으면 버튼이 줄바꿈된다. 자체 영상에는 처음으로·소리가 없다.
 * 누르는 자리 44pt. 막대는 responder 를 잡고 놓지 않아(onResponderTerminationRequest false) 영상 탭으로 번지지 않는다.
 */
export type NativeControlsProps = {
  c: Palette;
  playing: boolean;
  ready: boolean;
  duration: number | null;
  time: number;
  onToggle: () => void;
  onScrubStart: () => void;
  onScrubDraft: (t: number) => void;
  onScrubEnd: (commit: boolean, t: number) => void;
  onStep: (dir: 1 | -1) => void;
  onRestart?: () => void;
  loop: boolean;
  onLoop: () => void;
  rates: number[];
  rate: number;
  onRate?: (r: number) => void;
  muted?: boolean;
  onMute?: () => void;
  expanded?: boolean;
  onExpand?: () => void;
  status?: string | null;
};

export function ExerciseVideoControls(p: NativeControlsProps) {
  const range = seekRange(p.duration);
  const enabled = p.ready && range != null;
  const [draft, setDraft] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const track = useRef<ComponentRef<typeof View>>(null);
  const left = useRef(0);
  const dragging = useRef(false);
  const last = useRef(0);

  const shown = draft ?? finiteTime(p.time);
  const frac = range ? Math.min(1, Math.max(0, (shown - range.min) / (range.max - range.min))) : 0;
  const posOf = (e: GestureResponderEvent) => {
    if (!range) return 0;
    const f = Math.min(1, Math.max(0, (e.nativeEvent.pageX - left.current) / Math.max(1, width)));
    return range.min + f * (range.max - range.min);
  };
  const ink = p.c.ink;
  const muted = p.c.muted;

  return (
    <View style={[s.bar, { backgroundColor: '#000' }]}>
      <View style={s.row}>
        <Press
          onPress={p.onToggle}
          accessibilityRole="button"
          accessibilityLabel={p.playing ? '영상 일시정지' : '영상 재생'}
          style={s.btn}
        >
          <Icon name={p.playing ? 'pause' : 'play'} size={18} color={ink} fill={ink} />
        </Press>
        <View
          ref={track}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="영상 재생 위치"
          accessibilityState={{ disabled: !enabled }}
          accessibilityValue={enabled ? { min: range!.min, max: range!.max, now: shown, text: `${timeText(shown)} / ${timeText(range!.max)}` } : { text: '길이 확인 중' }}
          accessibilityActions={[{ name: 'increment', label: '5초 앞으로' }, { name: 'decrement', label: '5초 뒤로' }]}
          onAccessibilityAction={(e) => {
            if (enabled) p.onStep(e.nativeEvent.actionName === 'increment' ? 1 : -1);
          }}
          onLayout={(e) => {
            if (dragging.current && e.nativeEvent.layout.width !== width) {
              dragging.current = false;
              setDraft(null);
              p.onScrubEnd(false, 0);
            }
            setWidth(e.nativeEvent.layout.width);
            track.current?.measureInWindow((x) => {
              left.current = x;
            });
          }}
          onStartShouldSetResponder={() => enabled}
          onMoveShouldSetResponder={() => enabled}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => {
            // locationX is relative to this responder; pointerEvents=none keeps descendants from stealing the origin.
            left.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
            dragging.current = true;
            p.onScrubStart();
            last.current = posOf(e);
            setDraft(last.current);
            p.onScrubDraft(last.current);
          }}
          onResponderMove={(e) => {
            if (!dragging.current) return;
            last.current = posOf(e);
            setDraft(last.current);
            p.onScrubDraft(last.current);
          }}
          onResponderRelease={(e) => {
            if (!dragging.current) return;
            dragging.current = false;
            last.current = posOf(e);
            setDraft(null);
            p.onScrubEnd(true, last.current);
          }}
          onResponderTerminate={() => {
            if (!dragging.current) return;
            dragging.current = false;
            setDraft(null);
            p.onScrubEnd(false, 0);
          }}
          style={[s.seek, !enabled && { opacity: 0.4 }]}
        >
          <View pointerEvents="none" style={[s.track, { backgroundColor: withAlpha(ink, 0.18) }]}>
            <View style={[s.progress, { width: `${frac * 100}%`, backgroundColor: p.c.link }]} />
          </View>
          <View pointerEvents="none" style={[s.thumb, { left: Math.max(0, frac * (width - 12)), backgroundColor: p.c.link }]} />
        </View>
        <Press style={s.repeat} onPress={p.onLoop} accessibilityRole="button" accessibilityState={{ selected: p.loop }} accessibilityLabel={p.loop ? '반복 재생 끄기' : '반복 재생 켜기'}>
          <SymbolView name="repeat" size={17} tintColor={p.loop ? p.c.link : muted} />
        </Press>
        {p.onRestart ? (
          <Press onPress={p.onRestart} disabled={!p.ready} accessibilityRole="button" accessibilityLabel="처음부터" style={[s.btn, !p.ready && s.off]}>
            <Icon name="rotate-ccw" size={16} color={ink} />
          </Press>
        ) : null}
        {p.onRate && p.rates.length > 1 ? (
          <Press
            onPress={() => {
              const i = p.rates.indexOf(p.rate);
              p.onRate!(p.rates[(i + 1) % p.rates.length]);
            }}
            disabled={!p.ready}
            accessibilityRole="button"
            accessibilityLabel={`재생 속도 ${p.rate}배, 바꾸기`}
            style={[s.btn, !p.ready && s.off]}
          >
            <Text style={[s.rate, { color: p.rate !== 1 ? p.c.link : ink }]}>{p.rate}×</Text>
          </Press>
        ) : null}
        {p.onMute ? (
          <Press onPress={p.onMute} disabled={!p.ready} accessibilityRole="button" accessibilityLabel={p.muted ? '소리 켜기' : '소리 끄기'} style={[s.btn, !p.ready && s.off]}>
            <Icon name={p.muted ? 'volume-x' : 'volume-2'} size={16} color={ink} />
          </Press>
        ) : null}
        {p.onExpand ? (
          <Press onPress={p.onExpand} accessibilityRole="button" accessibilityLabel={p.expanded ? '크게 보기 닫기' : '크게 보기'} style={s.btn}>
            <SymbolView name={p.expanded ? 'arrow.down.right.and.arrow.up.left' : 'arrow.up.left.and.arrow.down.right'} size={15} tintColor={ink} />
          </Press>
        ) : null}
      </View>
        <Text style={[s.time, { color: muted }]} maxFontSizeMultiplier={1.5} accessibilityElementsHidden importantForAccessibility="no">
          {enabled ? `${timeText(shown)} / ${timeText(range!.max)}` : '--:--'}
        </Text>
      {p.status ? <Text accessibilityLiveRegion="polite" style={[s.small, { color: muted, padding: 4, flexShrink: 1 }]}>{p.status}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { paddingHorizontal: 4, paddingVertical: 2, width: '100%' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2 },
  btn: { minWidth: CONTROL.icon, minHeight: CONTROL.icon, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.4 },
  seek: { flex: 1, minWidth: 64, height: 44, justifyContent: 'center' },
  track: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progress: { height: '100%' },
  thumb: { position: 'absolute', width: 12, height: 12, borderRadius: 6 },
  time: { ...TYPE.sub, fontVariant: ['tabular-nums'], paddingHorizontal: 8, paddingBottom: 4, alignSelf: 'flex-start' },
  repeat: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  small: { fontSize: 12 },
  rate: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
