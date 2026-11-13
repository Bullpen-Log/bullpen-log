import { SymbolView } from 'expo-symbols';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { ScrubGestureSession, clampTime, finiteTime, seekRange, timeText } from '@/lib/exercise-video-state';
import { type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';

/** Timeline-first transparent row, full 44pt hit regions. Owned controls sit inside the picture;
 * YouTube opts out of overlay. Native pan owns the touch from down, never a JS responder race.
 */
export type NativeControlsProps = {
  c: Palette;
  overlay?: boolean;
  forceWide?: boolean;
  playing: boolean;
  ready: boolean;
  duration: number | null;
  time: number;
  onToggle: () => void;
  onScrubStart: () => void;
  onScrubDraft: (t: number) => void;
  onScrubEnd: (commit: boolean, t: number, interrupted?: boolean) => void;
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
  const [barWidth, setBarWidth] = useState(0);
  const [menu, setMenu] = useState(false);
  const touch = useRef(new ScrubGestureSession());
  const callbacks = useRef(p);
  const actionAfterMenu = useRef<(() => void) | null>(null);
  useLayoutEffect(() => { callbacks.current = p; });
  useEffect(() => {
    const session = touch.current;
    const handlers = callbacks;
    const action = actionAfterMenu;
    return () => {
      action.current = null;
      const ended = session.finish(false);
      if (ended) handlers.current.onScrubEnd(false, ended.time, true);
    };
  }, []);
  const pos = (x: number) => clampTime(range ? range.min + Math.min(1, Math.max(0, x / Math.max(1, width))) * (range.max - range.min) : 0, range);
  const finish = (commit: boolean, x?: number) => {
    if (commit && x != null) touch.current.move(pos(x));
    const end = touch.current.finish(commit);
    if (!end) return;
    setDraft(null);
    p.onScrubEnd(end.commit, end.time);
  };
  const pan = usePanGesture({
    enabled: enabled || draft != null,
    minDistance: 0,
    maxPointers: 1,
    shouldCancelWhenOutside: false,
    runOnJS: true,
    onTouchesDown: (e) => { if (e.numberOfTouches > 1) finish(false); },
    // A stationary tap may fail UIPan's activation threshold; actual touch-up still commits.
    // Cancellation finalizes first and clears ownership, so its later up cannot commit.
    onTouchesUp: (e) => { if (e.numberOfTouches <= 1) finish(true, e.changedTouches[0]?.x); },
    onTouchesCancel: () => finish(false),
    onBegin: (e) => {
      if (!range || !touch.current.begin(pos(e.x))) return;
      p.onScrubStart(); setDraft(touch.current.value); p.onScrubDraft(touch.current.value);
    },
    onUpdate: (e) => {
      if (e.numberOfPointers !== 1) { finish(false); return; }
      const t = pos(e.x);
      if (touch.current.move(t)) { setDraft(t); p.onScrubDraft(t); }
    },
    onFinalize: (e) => finish(!e.canceled, e.x),
  });
  const shown = draft ?? finiteTime(p.time);
  const frac = range ? Math.min(1, Math.max(0, (shown - range.min) / (range.max - range.min))) : 0;
  const ink = '#fff';
  const buttons = 2 + Number(!!p.onRate && p.rates.length > 1) + Number(!!p.onExpand) + Number(!!p.onMute) + Number(!!p.onRestart);
  const compact = !p.forceWide && barWidth < buttons * 44 + 64;
  const tiny = !p.forceWide && barWidth < 152;
  const closeMenu = (action?: () => void) => {
    actionAfterMenu.current = action ?? null;
    setMenu(false);
    if (Platform.OS !== 'ios' && actionAfterMenu.current) { actionAfterMenu.current(); actionAfterMenu.current = null; }
  };
  return <View pointerEvents="box-none" style={p.overlay === false ? s.external : s.overlay} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
    <View style={s.row}>
      {!tiny ? <Press onPress={p.onToggle} accessibilityRole="button" accessibilityLabel={p.playing ? '영상 일시정지' : '영상 재생'} style={[s.btn, s.leading]}>
        <Icon name={p.playing ? 'pause' : 'play'} size={14} color={ink} fill={ink} />
      </Press> : null}
      {!tiny ? <GestureDetector gesture={pan}>
        <View collapsable={false} accessible accessibilityRole="adjustable" accessibilityLabel="영상 재생 위치" accessibilityHint={p.status ?? undefined}
          accessibilityState={{ disabled: !enabled }}
          accessibilityValue={range ? { min: range.min, max: range.max, now: shown, text: `${timeText(shown)} / ${timeText(range.max)}` } : { text: '길이 확인 중' }}
          accessibilityActions={[{ name: 'increment', label: '5초 앞으로' }, { name: 'decrement', label: '5초 뒤로' }]}
          onAccessibilityAction={(e) => { if (enabled) p.onStep(e.nativeEvent.actionName === 'increment' ? 1 : -1); }}
          onLayout={(e) => { if (width !== e.nativeEvent.layout.width) finish(false); setWidth(e.nativeEvent.layout.width); }}
          style={[s.seek, !enabled && s.off]}>
          <View pointerEvents="none" style={s.track}><View style={[s.progress, { width: `${frac * 100}%`, backgroundColor: p.c.link }]} /></View>
          <View pointerEvents="none" style={[s.thumb, { left: Math.max(0, frac * (width - 12)), backgroundColor: p.c.link }]} />
        </View>
      </GestureDetector> : <View style={{ flex: 1 }} />}
      {compact ? <Press onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel="영상 조작 더 보기" style={[s.btn, s.trailing]}><SymbolView name="ellipsis" size={14} tintColor={ink} /></Press> : <>
        <Press onPress={p.onLoop} accessibilityRole="button" accessibilityState={{ selected: p.loop }} accessibilityLabel={p.loop ? '반복 재생 끄기' : '반복 재생 켜기'} style={[s.btn, s.trailing]}><SymbolView name="repeat" size={14} tintColor={p.loop ? p.c.link : ink} /></Press>
        {p.onRestart ? <Press onPress={p.onRestart} disabled={!p.ready} accessibilityRole="button" accessibilityLabel="처음부터" style={[s.btn, s.trailing]}><Icon name="rotate-ccw" size={13} color={ink} /></Press> : null}
        {p.onRate && p.rates.length > 1 ? <Press disabled={!p.ready} onPress={() => p.onRate!(p.rates[(p.rates.indexOf(p.rate) + 1) % p.rates.length])} accessibilityRole="button" accessibilityLabel={`재생 속도 ${p.rate}배, 바꾸기`} style={[s.btn, s.trailing]}><Text maxFontSizeMultiplier={1.5} style={[s.rate, { color: p.rate === 1 ? ink : p.c.link }]}>{p.rate}×</Text></Press> : null}
        {p.onMute ? <Press disabled={!p.ready} onPress={p.onMute} accessibilityRole="button" accessibilityLabel={p.muted ? '소리 켜기' : '소리 끄기'} style={[s.btn, s.trailing]}><Icon name={p.muted ? 'volume-x' : 'volume-2'} size={13} color={ink} /></Press> : null}
        {p.onExpand ? <Press onPress={p.onExpand} accessibilityRole="button" accessibilityLabel={p.expanded ? '크게 보기 닫기' : '크게 보기'} style={[s.btn, s.trailing]}><SymbolView name={p.expanded ? 'arrow.down.right.and.arrow.up.left' : 'arrow.up.left.and.arrow.down.right'} size={13} tintColor={ink} /></Press> : null}
      </>}
    </View>
    <Modal transparent visible={menu} animationType="fade" onRequestClose={() => closeMenu()} onDismiss={() => { const action = actionAfterMenu.current; actionAfterMenu.current = null; action?.(); }}>
      <GestureHandlerRootView style={s.menu}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => closeMenu()} accessibilityRole="button" accessibilityLabel="영상 조작 닫기" />
        <View accessibilityViewIsModal style={s.panel}>
          <ExerciseVideoControls {...p} overlay={false} forceWide onExpand={p.onExpand ? () => closeMenu(p.onExpand) : undefined} />
          <Press onPress={() => closeMenu()} accessibilityRole="button" accessibilityLabel="영상 조작 닫기" style={s.done}><Text style={{ color: '#fff' }}>닫기</Text></Press>
        </View>
      </GestureHandlerRootView>
    </Modal>
  </View>;
}
const s = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 4, height: 44 },
  external: { width: '100%', minHeight: 44 },
  row: { flexDirection: 'row', alignItems: 'center', height: 44 },
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  leading: { alignItems: 'flex-start', paddingLeft: 4 },
  trailing: { alignItems: 'flex-end', paddingRight: 4 },
  off: { opacity: 0.4 },
  seek: { flex: 1, minWidth: 44, height: 44, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  progress: { height: 6, borderRadius: 3 },
  thumb: { position: 'absolute', width: 12, height: 12, borderRadius: 6 },
  rate: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  menu: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  panel: { width: '92%', maxWidth: 420, backgroundColor: '#101820', borderRadius: 16, padding: 8 },
  done: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
