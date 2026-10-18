import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { areaOfMuscle, muscleInfo, type ArmcareMuscle } from '@/lib/armcare/anatomy';
import { visibleChips } from '@/lib/armcare/chips';
import { MUSCLE_DETAILS } from '@/lib/armcare/details';
import { APP_UA, SITE_URL } from '~/lib/site';
import type { Palette } from '~/lib/ui';
import { Sheet } from '~/workout/sheets';

/**
 * 근육 칩 — 웹 components/muscle-chips.tsx: 맨 앞(가장 크게 쓰는 근육, 또는 highlight)만 진하게, max 넘으면 '+N'(누르면 다 펼침).
 * 칩을 누르면 그 근육 설명 창(웹 armcare-info-body.tsx MuscleInfo 의 글 — 어떤 근육 · 던질 때 · 왜 중요한가 · 이렇게 키워요 · 붙는 곳).
 * 창 맨 위 3D 근육 그림은 사이트 app/embed/muscle 을 작은 웹뷰로(3D 동작 분석 lab-3d.tsx 와 같은 방식 — 3D 는 웹 WebGL 한 벌).
 * 설명이 없는 근육 이름이면 글자 칩.
 */
export function MuscleChips({ muscles, highlight, max, c }: { muscles: string[]; highlight?: readonly string[]; max?: number; c: Palette }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (muscles.length === 0) return null;
  const shown = all ? muscles : visibleChips(muscles, highlight, max);
  const hidden = muscles.length - shown.length;
  return (
    <View style={st.wrap}>
      {shown.map((m) => {
        const strong = highlight ? highlight.includes(m) : m === muscles[0];
        const known = !!MUSCLE_DETAILS[m as ArmcareMuscle];
        return (
          <Pressable
            key={m}
            accessibilityRole={known ? 'button' : 'text'}
            accessibilityLabel={known ? `${m}, 위치와 설명 보기` : m}
            disabled={!known}
            hitSlop={{ top: 8, bottom: 8 }}
            onPress={() => {
              void Haptics.selectionAsync();
              setOpen(m);
            }}
            style={[st.chip, { backgroundColor: strong ? c.skyTint : c.chip }]}
          >
            <Text style={{ color: strong ? c.skyStrong : c.muted, fontSize: 12, fontWeight: '500' }}>
              {m}
              {known ? <Text style={{ opacity: 0.6 }}> ›</Text> : null}
            </Text>
          </Pressable>
        );
      })}
      {hidden > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`근육 ${hidden}개 더 보기`} onPress={() => setAll(true)} style={[st.chip, { backgroundColor: c.chip }]}>
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: '500' }}>+{hidden}</Text>
        </Pressable>
      ) : null}
      <MuscleSheet name={open} muscles={muscles} onPick={setOpen} onClose={() => setOpen(null)} c={c} />
    </View>
  );
}

function MuscleSheet({ name, muscles, onPick, onClose, c }: { name: string | null; muscles: string[]; onPick: (m: string) => void; onClose: () => void; c: Palette }) {
  const info = name ? muscleInfo(name) : null;
  const area = name ? areaOfMuscle(name) : null;
  const d = name ? MUSCLE_DETAILS[name as ArmcareMuscle] : null;
  const known = muscles.filter((m) => MUSCLE_DETAILS[m as ArmcareMuscle]);
  return (
    <Sheet open={!!name && !!d} onClose={onClose} title={name ?? ''} description={[area?.label, info?.does].filter(Boolean).join(' · ')} c={c}>
      {known.length > 1 ? (
        <View style={[st.wrap, { marginBottom: 16 }]}>
          {known.map((m) => {
            const on = m === name;
            return (
              <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onPick(m)} style={[st.tab, { backgroundColor: on ? c.sky : c.chip }]}>
                <Text style={{ color: on ? '#fff' : c.ink, fontSize: 13, fontWeight: '600' }}>{m}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {name && d ? <Muscle3D name={name} onPick={(m) => MUSCLE_DETAILS[m as ArmcareMuscle] && onPick(m)} c={c} /> : null}
      {d ? (
        <View style={{ gap: 18 }}>
          {(
            [
              ['어떤 근육인가요', d.what],
              ['던질 때', d.pitching],
              ['왜 중요한가요', d.why],
              ['이렇게 키워요', d.train],
            ] as const
          ).map(([title, body]) => (
            <View key={title} style={{ gap: 6 }}>
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '700' }}>{title}</Text>
              <Text style={{ color: c.ink, opacity: 0.85, fontSize: 15, lineHeight: 23 }}>{body}</Text>
            </View>
          ))}
          {info ? (
            <View style={[st.at, { backgroundColor: c.card }]}>
              <Text style={{ color: c.skyStrong, fontSize: 13, fontWeight: '700' }}>붙는 곳</Text>
              <Text style={{ flex: 1, color: c.ink, opacity: 0.8, fontSize: 13, lineHeight: 19 }}>{info.at}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

type WebViewHandle = { injectJavaScript(script: string): void; reload(): void };
/* react-native-webview 14 의 타입은 ref 를 안 받지만 실제 부품은 forwardRef 다(lab-3d.tsx 와 같다) */
const RefWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;
type FromWeb = { t: 'muscle'; kind: 'status'; status: string } | { t: 'muscle'; kind: 'pick'; muscle: string };

/**
 * 3D 근육 그림 — 웹 근육 설명 창의 InfoGraphic(armcare-info-body.tsx)과 같은 칸(끌어 돌리기 · 근육 누르기). 근육을 바꾸면 웹뷰를 새로 열지 않고
 * window.__musclePick 으로 알리고, 3D 에서 누른 근육은 'pick' 으로 받아 창을 그 근육으로 바꾼다. WebGL 이 없거나 못 불러오면 칸을 접는다(글만 남음).
 */
function Muscle3D({ name, onPick, c }: { name: string; onPick: (muscle: string) => void; c: Palette }) {
  const web = useRef<WebViewHandle>(null);
  const [first] = useState(name);
  const [ready, setReady] = useState(false);
  /* 웹 쪽이 뜨면 제 '불러오는 중'을 그리므로 앱 돌개는 페이지가 뜨기 전까지만 */
  const [loaded, setLoaded] = useState(false);
  const [gone, setGone] = useState(false);
  const url = `${SITE_URL}/embed/muscle?m=${encodeURIComponent(first)}&bg=${encodeURIComponent(c.card)}`;
  /* 창 안에서 다른 근육으로 바꾸면(위 칩 · 3D 누름) 그림도 그 근육으로 */
  useEffect(() => {
    if (ready) web.current?.injectJavaScript(`window.__musclePick&&window.__musclePick(${JSON.stringify(name)});true;`);
  }, [name, ready]);
  if (gone) return null;
  const onMessage = (e: WebViewMessageEvent) => {
    let m: FromWeb;
    try {
      m = JSON.parse(e.nativeEvent.data) as FromWeb;
    } catch {
      return;
    }
    if (m?.t !== 'muscle') return;
    if (m.kind === 'status') {
      if (m.status === 'unavailable' || m.status === 'error') setGone(true);
      else if (m.status === 'ready') setReady(true);
    } else if (m.kind === 'pick' && m.muscle !== name) {
      void Haptics.selectionAsync();
      onPick(m.muscle);
    }
  };
  return (
    <View style={[st.map, { backgroundColor: c.card }]}>
      <RefWebView
        ref={web}
        source={{ uri: url }}
        applicationNameForUserAgent={APP_UA}
        sharedCookiesEnabled
        scrollEnabled={false}
        bounces={false}
        allowsLinkPreview={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        /* 이 칸은 3D 하나만 — 다른 주소로 옮겨 가지 않는다 */
        onShouldStartLoadWithRequest={(r) => r.url === url || r.url === 'about:blank'}
        onMessage={onMessage}
        onLoadEnd={() => setLoaded(true)}
        onError={() => setGone(true)}
        onHttpError={() => setGone(true)}
        onContentProcessDidTerminate={() => web.current?.reload()}
      />
      {!ready && !loaded ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
          <ActivityIndicator color={c.muted} />
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  map: { height: 260, borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { minHeight: 24, borderRadius: 12, paddingHorizontal: 8, justifyContent: 'center' },
  tab: { minHeight: 34, borderRadius: 17, paddingHorizontal: 12, justifyContent: 'center' },
  at: { flexDirection: 'row', gap: 12, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
});
