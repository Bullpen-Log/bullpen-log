import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { methodByKey, type ArmcareMethodKey } from '@/lib/armcare/methods';
import { REHAB_FEEL_OPTIONS, REHAB_LEFTOVER_OPTIONS } from '@/lib/armcare/rehab-regions';
import type { RehabFeel, RehabLeftover, RehabResult } from '@/lib/armcare/rehab-regions';
import type { RehabCheckInitial } from '@/app/(session)/armcare/play/[id]/rehab-check';
import { rpc, RpcError } from '~/lib/rpc';
import { leaveTo } from '~/shell/web-nav';
import type { Palette } from '~/lib/ui';
import { ExerciseVideo, clockText } from '~/workout/parts';

/** 암케어 따라 하기(native/src/app/armcare/[id].tsx)의 작은 조각 — 웹 app/(session)/armcare/play/[id] 의 같은 이름 부품을 옮겼다 */

export type Clock = { kind: 'hold' | 'rest'; endsAt: number; total: number };

/**
 * 버티기 · 쉬기 시계 — 남은 시간과 막대. 스스로 초를 센다(웹과 같은 까닭 — 화면 전체를 자주 다시 그리지 않게). 시계마다 새로
 * 만들어(key) 시작하는 그 순간부터 센다. 앱으로 돌아오면 곧바로 맞춘다(잠긴 동안 멈춘 타이머).
 */
export function Countdown({ clock, label, c }: { clock: Clock; label: string; c: Palette }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);
  const left = Math.max(0, Math.ceil((clock.endsAt - now) / 1000));
  return (
    <View accessibilityRole="timer" accessibilityLabel={`${label} ${clockText(left)}`} style={{ gap: 8 }}>
      <View style={s.clockRow}>
        <Text style={[s.bodyBold, { color: c.muted }]}>{label}</Text>
        <Text style={[s.clock, { color: c.ink }]}>{clockText(left)}</Text>
      </View>
      <View style={[s.bar, { backgroundColor: c.chip }]}>
        <View
          style={{
            width: `${clock.total ? (left / clock.total) * 100 : 0}%`,
            height: '100%',
            borderRadius: 4,
            backgroundColor: clock.kind === 'hold' ? c.sky : c.muted,
          }}
        />
      </View>
    </View>
  );
}

/**
 * 영상 칸 — 미리보기를 먼저 보이고 누르면 튼다(웹 LibraryVideo 처럼 누르기 전에는 영상을 받지 않는다). 영상이 없고 미리보기만 있으면 그림만.
 * 운동마다 새로 그린다(부르는 쪽 key) — 앞 운동의 영상이 다음 운동에서 돌지 않게.
 */
export function ExerciseMedia({
  path,
  referenceVideoId,
  thumbUrl,
  aspectRatio,
}: {
  path: string | null;
  referenceVideoId: string | null;
  thumbUrl: string | null;
  aspectRatio: number | null;
}) {
  const [play, setPlay] = useState(false);
  const hasVideo = Boolean(path || referenceVideoId);
  if (play && hasVideo) return <ExerciseVideo path={path} referenceVideoId={referenceVideoId} aspectRatio={aspectRatio} />;
  if (!hasVideo && !thumbUrl) return null;
  /* ExerciseVideo 와 같은 비율 — 직접 찍은 영상은 세로, 유튜브는 가로 */
  const box = [s.media, { aspectRatio: aspectRatio ?? (path ? 9 / 16 : 16 / 9) }];
  const thumb = thumbUrl ? <Image source={{ uri: thumbUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} /> : null;
  if (!hasVideo) return <View style={box}>{thumb}</View>;
  return (
    <Pressable onPress={() => setPlay(true)} accessibilityRole="button" accessibilityLabel="자세 영상 틀기" style={box}>
      {thumb}
      <View style={s.playMark}>
        <SymbolView name="play.fill" size={22} tintColor="#fff" />
      </View>
    </Pressable>
  );
}

/**
 * 자세 설명 — 펼쳐야 받아 온다(글이 길어 처음부터 펼치지 않는다, 웹 useExerciseDescription 과 같은 길 content.exerciseDescription).
 * null 은 못 받은 것(로그인이 풀림 · 지운 운동), 빈 글은 설명이 없는 운동. 리바운드처럼 방식이 붙은 운동이면 그 방식 설명도.
 */
export function HowTo({
  exerciseId,
  method,
  inline = false,
  c,
}: {
  exerciseId: string;
  method: ArmcareMethodKey | null;
  /** 이미 '자세·영상 보기'로 펼친 칸 안 — 웹처럼 접지 않고 바로 받아 보인다(접이 안에 또 접이가 있었다) */
  inline?: boolean;
  c: Palette;
}) {
  const [open, setOpen] = useState(inline);
  const [got, setGot] = useState<{ text: string | null; failed: boolean } | null>(null);
  /* inline 이면 처음부터 받는 중 — 효과 안에서는 받은 뒤에만 상태를 바꾼다 */
  const [loading, setLoading] = useState(inline);
  const fetchText = () =>
    rpc<string | null>('content.exerciseDescription', exerciseId)
      .then(
        (text) => setGot({ text, failed: text == null }),
        () => setGot({ text: null, failed: true })
      )
      .finally(() => setLoading(false));
  const load = () => {
    if (loading || (got && !got.failed)) return;
    setLoading(true);
    void fetchText();
  };
  const m = method ? methodByKey(method) : null;
  useEffect(() => {
    if (inline) void fetchText();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 그릴 때 한 번
  }, []);
  return (
    <View style={[s.howTo, { backgroundColor: c.card, boxShadow: c.float }]}>
      {inline ? null : <Pressable
        onPress={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={s.howToHead}
      >
        <SymbolView name="info.circle" size={14} tintColor={c.muted} />
        <Text style={[s.smallBold, { color: c.muted, flex: 1 }]}>자세 설명</Text>
        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={12} tintColor={c.muted} />
      </Pressable>}
      {open ? (
        <View style={{ gap: 12, paddingBottom: 12 }}>
          {loading ? (
            <ActivityIndicator />
          ) : got?.failed ? (
            <Pressable onPress={load} accessibilityRole="button" style={s.textBtn}>
              <Text style={[s.small, { color: c.muted }]}>
                설명을 불러오지 못했어요. <Text style={{ color: c.sky, fontWeight: '700' }}>다시 받기</Text>
              </Text>
            </Pressable>
          ) : got ? (
            got.text ? (
              <Text selectable style={[s.body, { color: c.ink }]}>
                {got.text}
              </Text>
            ) : (
              <Text style={[s.small, { color: c.muted }]}>아직 적힌 설명이 없어요.</Text>
            )
          ) : null}
          {m ? (
            <View style={[s.method, { borderColor: c.sky + '40', backgroundColor: c.sky + '0f' }]}>
              <Text style={[s.smallBold, { color: c.sky }]}>
                {m.label} 방식 <Text style={{ color: c.muted, fontWeight: '500' }}>· {m.cue}</Text>
              </Text>
              {[
                ['하는 법', m.what],
                ['왜', m.why],
                ['무게', m.load],
                ['멈출 때', m.stop],
              ].map(([k, v]) => (
                <View key={k} style={s.methodRow}>
                  <Text style={[s.smallBold, s.methodKey, { color: c.sky }]}>{k}</Text>
                  <Text style={[s.small, { color: c.ink, flex: 1 }]}>{v}</Text>
                </View>
              ))}
              {m.caution ? (
                <Text style={[s.small, s.warnBox, { color: c.warn, backgroundColor: c.warnBg }]}>{m.caution}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** 고르는 칩 하나 — 고른 것은 하늘색. 누르는 자리 44px */
function Chip({ label, on, onPress, c }: { label: string; on: boolean; onPress: () => void; c: Palette }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={[s.chip, { backgroundColor: on ? c.sky + '1a' : c.chip, borderColor: on ? c.sky : 'transparent' }]}
    >
      <Text style={[s.small, { color: on ? c.sky : c.ink, fontWeight: on ? '700' : '400' }]}>{label}</Text>
    </Pressable>
  );
}

const PAIN_OPTIONS = Array.from({ length: 11 }, (_, i) => i);

/**
 * 재활 따라 하기 끝의 3문항(웹 rehab-check.tsx) — 남은 통증 · 오늘 가장 아팠던 정도(0~10) · 느낌 → 판정 한 줄.
 * 마친 운동의 체크가 아직 서버에 가는 중이면(settled 아님) 기다린다 — 한 비율을 그날 체크로 센다(app/actions/rehab.ts saveRehabSession).
 * 다시 답하면 그날 줄을 고친다.
 */
export function RehabCheck({
  dateKey,
  settled,
  initial,
  c,
}: {
  dateKey: string;
  settled: boolean;
  initial: RehabCheckInitial;
  c: Palette;
}) {
  const [leftover, setLeftover] = useState<RehabLeftover | null>(initial?.leftover ?? null);
  const [pain, setPain] = useState<number | null>(initial?.pain ?? null);
  const [feel, setFeel] = useState<RehabFeel | null>(initial?.feel ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ result: RehabResult; text: string } | null>(null);
  const ready = leftover != null && pain != null && feel != null;

  const submit = async () => {
    if (leftover == null || pain == null || feel == null) return;
    setError(null);
    setPending(true);
    try {
      const res = await rpc<{ ok: true; result: RehabResult; text: string } | { error: string }>('rehab.saveRehabSession', {
        dateKey,
        leftover,
        pain,
        feel,
      });
      if ('error' in res) setError(res.error);
      else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setResult({ result: res.result, text: res.text });
      }
    } catch (e) {
      /* 로그인이 풀렸으면 신호 탓이 아니다 — 화면을 닫고 웹을 로그인으로 */
      if (e instanceof RpcError && e.code === 'redirect') {
        leaveTo(e.to ?? '/login');
        return;
      }
      setError('인터넷 연결을 확인한 뒤 다시 해 주세요.');
    } finally {
      setPending(false);
    }
  };

  if (result) {
    const warn = result.result === 'red' || result.result === 'refer';
    return (
      <Text
        accessibilityRole="alert"
        style={[s.result, warn ? { color: c.warn, backgroundColor: c.warnBg } : { color: c.ink, backgroundColor: c.sky + '14' }]}
      >
        {result.text}
      </Text>
    );
  }

  return (
    <View style={[s.rehab, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[s.rehabTitle, { color: c.ink }]}>오늘 어땠어요?</Text>
      <View style={{ gap: 6 }}>
        <Text style={[s.bodyBold, { color: c.ink }]}>시작할 때 지난번 운동 뒤 통증이 남아 있었어요?</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="남은 통증" style={s.stack}>
          {REHAB_LEFTOVER_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} on={leftover === o.value} onPress={() => setLeftover(o.value)} c={c} />
          ))}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[s.bodyBold, { color: c.ink }]}>
          오늘 운동 중 가장 아팠던 정도 <Text style={{ color: c.muted, fontWeight: '400' }}>(0~10)</Text>
        </Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="가장 아팠던 정도" style={s.wrap}>
          {PAIN_OPTIONS.map((n) => (
            <Chip key={n} label={String(n)} on={pain === n} onPress={() => setPain(n)} c={c} />
          ))}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[s.bodyBold, { color: c.ink }]}>어떤 느낌이었어요?</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="느낌" style={s.stack}>
          {REHAB_FEEL_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} on={feel === o.value} onPress={() => setFeel(o.value)} c={c} />
          ))}
        </View>
      </View>
      {error ? <Text style={[s.small, s.warnBox, { color: c.danger, backgroundColor: c.danger + '14' }]}>{error}</Text> : null}
      <Pressable
        onPress={() => void submit()}
        disabled={!ready || !settled || pending}
        accessibilityRole="button"
        style={[s.submit, { backgroundColor: c.sky, opacity: !ready || !settled || pending ? 0.5 : 1 }]}
      >
        <Text style={s.submitText}>{pending ? '남기는 중…' : !settled ? '체크를 남기는 중…' : '남기기'}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  clockRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  clock: { fontSize: 36, fontWeight: '600', fontVariant: ['tabular-nums'] },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  media: { width: '100%', maxHeight: 420, borderRadius: 16, backgroundColor: '#000', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  playMark: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  howTo: { borderRadius: 12, paddingHorizontal: 14 },
  howToHead: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  textBtn: { minHeight: 40, justifyContent: 'center' },
  method: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  methodRow: { flexDirection: 'row', gap: 10 },
  methodKey: { width: 56 },
  warnBox: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden' },
  chip: { minHeight: 44, borderRadius: 22, borderWidth: 1, paddingHorizontal: 14, justifyContent: 'center' },
  stack: { alignItems: 'flex-start', gap: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rehab: { borderRadius: 16, padding: 16, gap: 16, alignSelf: 'stretch' },
  rehabTitle: { fontSize: 17, fontWeight: '700' },
  result: { fontSize: 15, lineHeight: 22, fontWeight: '600', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, overflow: 'hidden', alignSelf: 'stretch' },
  submit: { minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  small: { fontSize: 13, lineHeight: 18 },
  smallBold: { fontSize: 13, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
});
