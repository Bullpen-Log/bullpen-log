import * as Haptics from 'expo-haptics';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toDateKey } from '@/lib/pitch-stats';
import { usePalette, withAlpha } from '~/lib/ui';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';
import { SinkerBall, useBallRotation } from '~/home/ball/ball';
import {
  CATCH,
  RESULT_TEXT,
  START_STATE,
  TARGET_STEP,
  canThrow,
  cancelThrow,
  judgeCatch,
  judgeStep,
  settle,
  startThrow,
  stepX,
  type CatchResult,
  type CatchState,
} from '~/home/catch-rules';
import { recordCatch, useLocker } from '~/home/locker-store';
import { SheetHead } from '~/home/sheet-head';

/**
 * 공 잡기(시트) — 승인 시안의 arcade: 내 공(실밥 색 그대로)이 왼쪽에서 날아와 과녁에 닿을 때 '잡기'. 규칙은 ~/home/catch-rules.ts.
 * 한 번 던지면 한 번 판정, 결과 뒤 0.35초는 다시 던지기를 받지 않는다(연타로 점수가 오르지 않게). 처음 잡으면 캐치 스티커.
 * 닫거나 앱이 뒤로 가면 날던 공은 점수 없이 거둔다(남은 시계 · 늦은 점수가 없게). 움직임 줄이기면 공이 칸을 건너뛰고, 과녁 칸이 밝아질 때 누른다.
 */
const BR = 22;
const STAGE_H = 224;

export default function LockerCatchSheet() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { locker, ready } = useLocker();
  /* 재기 전 무대 폭은 창 − 양옆 20 으로 어림(첫 장면부터 과녁 · 공이 제자리) */
  const win = useWindowDimensions().width;
  const [w, setW] = useState(() => win - 40);
  const [st, setSt] = useState<CatchState>(START_STATE);
  const stRef = useRef(st);
  const [msg, setMsg] = useState('');
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startAt = useRef(0);
  const p = useSharedValue(0);
  const rot = useBallRotation({ rx: 0.25, ry: -0.4 });

  const put = (next: CatchState) => {
    stRef.current = next;
    setSt(next);
  };
  const stopClock = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    cancelAnimation(p);
    cancelAnimation(rot.ry);
  };

  const finish = (id: number, result: CatchResult) => {
    const next = settle(stRef.current, id, result, Date.now());
    if (next === stRef.current) return;
    stopClock();
    put(next);
    setMsg(RESULT_TEXT[result]);
    if (result === 'catch') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const gained = recordCatch(toDateKey(new Date()));
      if (gained.length) toast('스티커를 받았어요 · 캐치');
    } else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const throwBall = () => {
    const now = Date.now();
    if (!ready || !canThrow(stRef.current, now)) return;
    const next = startThrow(stRef.current, now);
    put(next);
    const id = next.throwId;
    setMsg('공이 와요');
    if (reduce) {
      stepRef.current = 0;
      setStep(0);
      const tick = () => {
        timer.current = setTimeout(() => {
          if (stRef.current.throwId !== id || stRef.current.phase !== 'flying') return;
          const i = stepRef.current + 1;
          if (i >= CATCH.steps) return finish(id, 'late');
          stepRef.current = i;
          setStep(i);
          if (i === TARGET_STEP) {
            void Haptics.selectionAsync();
            AccessibilityInfo.announceForAccessibility('지금');
          }
          tick();
        }, CATCH.stepMs);
      };
      tick();
      return;
    }
    cancelAnimation(p);
    p.value = 0;
    /* 판정은 던진 시각부터 지난 시간으로 — 그림 프레임이 밀려도(폰이 바쁠 때) 판정은 안 밀린다. 공 그림도 같은 시간표 */
    startAt.current = performance.now();
    rot.ry.set(withTiming(rot.ry.get() + 8, { duration: CATCH.flightMs, easing: Easing.linear }));
    p.value = withTiming(1, { duration: CATCH.flightMs, easing: Easing.linear });
    timer.current = setTimeout(() => finish(id, 'late'), CATCH.flightMs + 60);
  };

  const tapCatch = () => {
    const s = stRef.current;
    if (s.phase !== 'flying') return;
    finish(s.throwId, reduce ? judgeStep(stepRef.current) : judgeCatch((performance.now() - startAt.current) / CATCH.flightMs));
  };

  /* 앱이 뒤로 가면 날던 공을 거둔다 · 닫히면 시계를 다 걷는다 */
  const onAway = useEffectEvent(() => {
    if (stRef.current.phase !== 'flying') return;
    stopClock();
    put(cancelThrow(stRef.current));
    p.value = 0;
    setMsg('다시 던져 보세요');
  });
  const teardown = useEffectEvent(() => stopClock());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (a) => {
      if (a !== 'active') onAway();
    });
    return () => {
      sub.remove();
      teardown();
    };
  }, []);

  const flying = st.phase === 'flying';
  const span = (CATCH.to - CATCH.from) * w;
  const ballStyle = useAnimatedStyle(() => {
    const t = reduce ? 0 : p.value;
    return {
      transform: [{ translateX: CATCH.from * w + t * span - BR * 1.2 }, { translateY: -Math.sin(t * Math.PI) * 14 }],
    };
  });
  const stepLeft = stepX(flying || st.phase === 'done' ? step : 0) * w - BR * 1.2;
  const atTarget = reduce && flying && step === TARGET_STEP;

  return (
    <ScrollView style={{ backgroundColor: c.card }} contentContainerStyle={{ padding: 20, paddingBottom: inset.bottom + 24, gap: 14 }}>
      <SheetHead c={c} title="공 잡기" />
      <Text style={[styles.body, { color: c.muted }]}>
        {reduce ? '공이 밝아진 과녁 칸에 오면 ‘잡기’를 누르세요.' : '공이 과녁에 닿을 때 ‘잡기’를 누르세요.'}
      </Text>
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={[styles.stage, { backgroundColor: c.page }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {reduce && w > 0
          ? Array.from({ length: CATCH.steps }, (_, i) => (
              <View key={i} style={[styles.stepDot, { left: stepX(i) * w - 3, backgroundColor: i === TARGET_STEP ? c.link : c.line }]} />
            ))
          : null}
        <View
          style={[
            styles.target,
            {
              left: CATCH.target * w - 38.5,
              borderColor: withAlpha(c.link, atTarget ? 0.9 : 0.4),
              backgroundColor: atTarget ? withAlpha(c.link, 0.16) : 'transparent',
              boxShadow: `0 0 0 7px ${withAlpha(c.link, 0.06)}`,
            },
          ]}
        />
        {w > 0 ? (
          <Animated.View style={[styles.ball, reduce ? { left: stepLeft } : ballStyle]}>
            <SinkerBall size={[BR * 2.4, BR * 2.4]} radius={BR} thread={locker.thread} rotation={rot} shadowOpacity={0.14} />
          </Animated.View>
        ) : null}
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text accessibilityLiveRegion="polite" style={[styles.msg, { color: st.result === 'catch' ? c.link : c.ink }]}>
            {msg || '준비됐어요'}
          </Text>
          <Text style={[styles.small, { color: c.muted }]}>지금까지 캐치 {locker.catches}번</Text>
        </View>
        {/* 단추 하나 — 화면이 다시 그려지기 전에 눌러도 지금 상태(stRef)로 던지기 · 잡기를 고른다 */}
        <Press
          accessibilityRole="button"
          accessibilityLabel={flying ? '공 잡기' : st.phase === 'done' ? '다시 던지기' : '공 던지기'}
          disabled={!ready}
          onPress={() => (stRef.current.phase === 'flying' ? tapCatch() : throwBall())}
          style={[styles.btn, { backgroundColor: c.action, opacity: ready ? 1 : 0.45 }]}
        >
          <Text style={[styles.btnText, { color: c.onAction }]}>{flying ? '잡기' : st.phase === 'done' ? '다시 던지기' : '던지기'}</Text>
        </Press>
      </View>
      <Text style={[styles.small, { color: c.muted, textAlign: 'center' }]}>훈련 기록과 따로예요 · 이 폰에만 저장돼요</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 22 },
  stage: { height: STAGE_H, borderRadius: 22, overflow: 'hidden' },
  target: { position: 'absolute', top: STAGE_H / 2 - 38.5, width: 77, height: 77, borderRadius: 39, borderWidth: 2 },
  stepDot: { position: 'absolute', top: STAGE_H / 2 + 52, width: 6, height: 6, borderRadius: 3 },
  ball: { position: 'absolute', left: 0, top: STAGE_H / 2 - BR * 1.2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  msg: { fontSize: 16, fontWeight: '600' },
  small: { fontSize: 12, lineHeight: 17 },
  btn: { minHeight: 48, minWidth: 104, paddingHorizontal: 18, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '600' },
});
