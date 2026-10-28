import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COUNTRY_LABEL } from '@/lib/country';
import { OVERSEAS_KINDS, type OverseasKind } from '@/lib/community-country';
import { POST_BODY_MAX, POST_TITLE_MAX } from '@/lib/community';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { useCountry } from '~/lib/country-store';
import { rpc } from '~/lib/rpc';
import { PitchVideo } from '~/pitch/video';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';
import { leaveTo } from '~/shell/web-nav';
import { findMyVideo } from '~/videos/store';
import { uploadShareCopy } from '~/videos/share';

/**
 * 내 영상 → 덕아웃에 올리기(2026-10-28, 설계 docs/designs/overseas-sinker-dugout.md 5-6). 어느 나라 덕아웃에 올라가는지 맨 위에,
 * 보일 것만(영상 · 갈래 · 제목 · 내용 · 고른 기록) — 감각 메모는 '본문에 넣기'로 복사(이후 메모를 고쳐도 글은 그대로),
 * 투구 기록은 켤 때만(종류 · 투구 수 — 체크인 · 통증 · 영양은 붙이는 칸이 없다). 영상은 공유용 사본을 올린다 — 내 영상은 비공개 그대로.
 * 올리다 끊기면 적은 것은 이 화면에 남고 다시 누르면 처음부터 올린다.
 */
export default function ShareVideoScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const country = useCountry();
  const { path } = useLocalSearchParams<{ path: string }>();
  const v = path ? findMyVideo(path) : null;
  const pitchLog = v?.logs.find((l) => l.kind === 'pitch') ?? null;
  const [kind, setKind] = useState<OverseasKind>(OVERSEAS_KINDS[pitchLog ? 1 : 0]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [withLog, setWithLog] = useState(false);
  const [othersOk, setOthersOk] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dugout = `${COUNTRY_LABEL[country]} 덕아웃`;

  if (!v) {
    return (
      <View style={[styles.center, { backgroundColor: c.page, padding: 24, gap: 12 }]}>
        <Text style={[TYPE.body, { color: c.muted }]}>영상을 찾지 못했어요.</Text>
        <Press accessibilityRole="button" onPress={() => router.back()}>
          <Text style={[TYPE.buttonCompact, { color: c.link }]}>돌아가기</Text>
        </Press>
      </View>
    );
  }

  const busy = progress !== null;
  const ready = title.trim().length > 0 && body.trim().length > 0 && othersOk && !busy;
  const submit = async () => {
    if (!ready) return;
    setError(null);
    setProgress(0);
    try {
      const media = await uploadShareCopy(v.path, setProgress);
      const r = await rpc<{ ok: true; id: string } | { ok: false; error: string }>('community.createAppPost', {
        category: kind.category,
        tag: kind.tag,
        title: title.trim(),
        body: body.trim(),
        media: [media],
        card: withLog && pitchLog ? `pitch:${pitchLog.id}` : undefined,
      });
      if (!r.ok) throw new Error(r.error);
      toast(`${dugout}에 올렸어요`);
      leaveTo(`/community/${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '올리지 못했어요. 다시 해 주세요.');
      setProgress(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <View style={[styles.bar, { paddingTop: inset.top + 4 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => router.back()} hitSlop={6} style={styles.barButton} disabled={busy}>
          <Icon name="back" size={22} color={c.link} />
        </Pressable>
        <Text accessibilityRole="header" style={[TYPE.card, { flex: 1, textAlign: 'center', color: c.ink }]}>
          덕아웃에 올리기
        </Text>
        <View style={styles.barButton} />
      </View>
      <ScrollView keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
        <Text style={[TYPE.card, { color: c.ink }]}>{dugout}에 올라가요</Text>
        <PitchVideo path={v.path} />
        <Text style={[TYPE.sub, { color: c.muted }]}>이 영상의 사본이 올라가요. 내 영상은 그대로 나만 봐요.</Text>

        <View style={{ gap: 8 }}>
          <Text style={[TYPE.sub, { color: c.muted }]}>어떤 글인가요</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {OVERSEAS_KINDS.map((k) => {
              const on = k.key === kind.key;
              return (
                <Press
                  key={k.key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setKind(k)}
                  style={[styles.chip, { backgroundColor: on ? c.action : withAlpha(c.ink, 0.06) }]}
                >
                  <Text style={[TYPE.buttonCompact, { color: on ? c.onAction : c.ink }]}>{k.label}</Text>
                </Press>
              );
            })}
          </View>
          <Text style={[TYPE.sub, { color: c.muted }]}>{kind.what}</Text>
        </View>

        <TextInput
          value={title}
          onChangeText={setTitle}
          maxLength={POST_TITLE_MAX}
          placeholder={kind.example}
          placeholderTextColor={c.muted}
          accessibilityLabel="제목"
          style={[styles.input, { color: c.ink, backgroundColor: c.card, boxShadow: c.float }]}
        />
        <View style={{ gap: 6 }}>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={POST_BODY_MAX}
            placeholder="무엇을 묻고 싶은지, 그날 어땠는지 적어 주세요."
            placeholderTextColor={c.muted}
            accessibilityLabel="내용"
            style={[styles.input, styles.body, { color: c.ink, backgroundColor: c.card, boxShadow: c.float }]}
          />
          {v.note ? (
            <Press accessibilityRole="button" onPress={() => setBody((b) => (b.trim() ? `${b.trim()}\n\n${v.note}` : v.note!))}>
              <Text style={[TYPE.buttonCompact, { color: c.link }]}>감각 메모 넣기</Text>
            </Press>
          ) : null}
        </View>

        {pitchLog ? (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[TYPE.body, { color: c.ink }]}>그날 투구 기록 붙이기</Text>
              <Text style={[TYPE.sub, { color: c.muted }]}>종류 · 투구 수만 보여요. 컨디션 · 통증은 안 올라가요.</Text>
            </View>
            <Switch value={withLog} onValueChange={setWithLog} accessibilityLabel="그날 투구 기록 붙이기" />
          </View>
        ) : null}

        <Press accessibilityRole="checkbox" accessibilityState={{ checked: othersOk }} onPress={() => setOthersOk((x) => !x)} style={styles.row}>
          <Icon name="circle-check" size={22} color={othersOk ? c.action : withAlpha(c.ink, 0.25)} />
          <Text style={[TYPE.body, { flex: 1, color: c.ink }]}>영상에 다른 사람이 나오면 그 사람에게 허락을 받았어요</Text>
        </Press>

        {error ? <Text style={[TYPE.body, { color: c.danger }]}>{error}</Text> : null}
        <Press
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          onPress={submit}
          style={[styles.button, { backgroundColor: ready ? c.action : withAlpha(c.ink, 0.1) }]}
        >
          {busy ? <ActivityIndicator color={c.onAction} /> : null}
          <Text style={[TYPE.buttonCompact, { color: ready ? c.onAction : c.muted }]}>
            {busy ? `올리는 중 ${progress}%` : error ? '다시 올리기' : `${dugout}에 올리기`}
          </Text>
        </Press>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 6 },
  barButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  input: { borderRadius: 14, padding: 12, fontSize: 16, lineHeight: 22 },
  body: { minHeight: 120, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 26 },
});
