import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FEEL_NOTE_MAX, type MyVideoLog } from '@/lib/my-videos';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { useFeatured } from '~/pitch/store';
import { PitchVideo } from '~/pitch/video';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { findMyVideo, saveMyVideo, useMyVideos } from '~/videos/store';
import { videoDateText } from '~/videos/text';

/**
 * 영상 하나(내 영상 상세) — 재생기 · 이 영상에만 남는 감각 메모 · ★ 다시 보기 · 붙은 기록(읽기만) · 다른 영상과 비교.
 * 기록 총평(PitchLog.memo)은 기록 화면에서 고친다 — 여기서 적는 메모와 따로다(설계 4절).
 */
export default function MyVideoScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { path } = useLocalSearchParams<{ path: string }>();
  useMyVideos();
  const v = path ? findMyVideo(path) : null;
  const featured = useFeatured();
  const [note, setNote] = useState(v?.note ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const saved = useRef(v?.note ?? '');
  /* 목록이 늦게 오면(앱을 막 켬) 그때 채운다 — 적는 중이면 안 덮는다 */
  useEffect(() => {
    if (v && note === '' && saved.current === '' && v.note) {
      saved.current = v.note;
      setNote(v.note);
    }
  }, [v, note]);

  const saveNote = async () => {
    if (!path || note.trim() === saved.current.trim()) return;
    setStatus('저장하는 중');
    const err = await saveMyVideo(path, { feelNote: note });
    if (err) setStatus(err);
    else {
      saved.current = note;
      setStatus('저장했어요');
    }
  };
  /* 적다가 나가면 그 글을 남긴다 */
  const latest = useRef(saveNote);
  useEffect(() => {
    latest.current = saveNote;
  });
  useEffect(() => () => void latest.current(), []);

  if (!v) {
    return (
      <View style={[styles.center, { backgroundColor: c.page, paddingTop: inset.top }]}>
        <ActivityIndicator />
      </View>
    );
  }
  const toggleStar = async () => {
    const err = await saveMyVideo(v.path, { revisit: !v.revisit });
    if (err) setStatus(err);
  };
  const isFeatured = v.date != null && featured[v.date] === v.path;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <View style={[styles.bar, { paddingTop: inset.top + 4 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} hitSlop={6} style={styles.barButton}>
          <Icon name="back" size={22} color={c.link} />
        </Pressable>
        <Text accessibilityRole="header" style={[TYPE.card, { flex: 1, textAlign: 'center', color: c.ink }]}>
          {videoDateText(v.date)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={v.revisit ? '다시 볼 영상에서 빼기' : '다시 볼 영상으로'}
          accessibilityState={{ selected: v.revisit }}
          onPress={toggleStar}
          hitSlop={6}
          style={styles.barButton}
        >
          <Icon name="star" size={22} color={v.revisit ? c.warn : c.muted} fill={v.revisit ? c.warn : undefined} />
        </Pressable>
      </View>
      <ScrollView keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
        <PitchVideo path={v.path} tools />
        {isFeatured ? <Text style={[TYPE.sub, { color: c.muted }]}>그날 대표 영상</Text> : null}

        <View style={{ gap: 6 }}>
          <Text style={[TYPE.card, { color: c.ink }]}>이 영상에서 느낀 것</Text>
          <TextInput
            value={note}
            onChangeText={(t) => {
              setNote(t);
              setStatus(null);
            }}
            onBlur={saveNote}
            multiline
            maxLength={FEEL_NOTE_MAX}
            placeholder="예: 하체가 먼저 나가니 릴리스가 편했다"
            placeholderTextColor={c.muted}
            accessibilityLabel="이 영상의 느낌 메모"
            style={[styles.note, { color: c.ink, backgroundColor: c.card, boxShadow: c.float }]}
          />
          <Text style={[TYPE.sub, { color: c.muted }]}>{status ?? '이 영상에만 저장돼요. 기록 총평은 그대로예요.'}</Text>
        </View>

        {v.clip ? (
          <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Text style={[TYPE.sub, { color: c.muted }]}>구속 측정</Text>
            <Text style={[TYPE.card, { color: c.ink }]}>
              {Math.round(v.clip.kmh)}km/h{v.clip.pitchType ? ` · ${v.clip.pitchType}` : ''}
            </Text>
          </View>
        ) : null}

        {v.logs.map((l) => (
          <LogCard key={`${l.kind}:${l.id}`} log={l} />
        ))}

        <Press
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/my-videos' as never, params: { pick: v.path } })}
          style={[styles.button, { backgroundColor: withAlpha(c.ink, 0.06) }]}
        >
          <Icon name="video" size={18} color={c.ink} />
          <Text style={[TYPE.buttonCompact, { color: c.ink }]}>다른 영상과 비교</Text>
        </Press>
        {v.storage === 'phone' ? (
          <Text style={[TYPE.sub, { color: c.muted }]}>영상은 이 폰의 싱커 앱 안에만 있어요. 앱을 지우면 영상도 사라져요.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** 붙은 기록 — 날짜 · 종류 · 수 · 기록 총평(읽기만). 투구 기록은 그날 화면에서 고친다 */
function LogCard({ log }: { log: MyVideoLog }) {
  const c = usePalette();
  const pitch = log.kind === 'pitch';
  return (
    <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[TYPE.sub, { color: c.muted }]}>
        {pitch ? '투구 기록' : '타격 기록'} · {videoDateText(log.date)}
      </Text>
      <Text style={[TYPE.card, { color: c.ink }]}>
        {log.type} · {log.count}
        {pitch ? '구' : '스윙'}
      </Text>
      {log.memo ? <Text style={[TYPE.body, { color: c.ink }]}>기록 총평 · {log.memo}</Text> : null}
      {[...log.cuesGood, ...log.cuesBad].length ? (
        <Text style={[TYPE.sub, { color: c.muted }]}>
          {[...log.cuesGood.map((q) => `좋았던 ${q}`), ...log.cuesBad.map((q) => `아쉬운 ${q}`)].join(' · ')}
        </Text>
      ) : null}
      {pitch ? (
        <Pressable accessibilityRole="link" onPress={() => router.push(`/pitch/${log.date}` as Href)} hitSlop={8}>
          <Text style={[TYPE.body, { color: c.link }]}>기록에서 고치기 ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 6 },
  barButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  note: { minHeight: 88, borderRadius: 14, padding: 12, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
  card: { gap: 4, padding: 14, borderRadius: 16 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 24 },
});
