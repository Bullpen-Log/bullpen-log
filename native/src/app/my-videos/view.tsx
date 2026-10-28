import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FEEL_NOTE_MAX, type MyVideoLog } from '@/lib/my-videos';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { useFeatured } from '~/pitch/store';
import { PitchVideo } from '~/pitch/video';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { rpc } from '~/lib/rpc';
import { deleteVideo, findMyVideo, linkVideo, refreshMyVideos, saveMyVideo, toggleFavorite, useMyVideos } from '~/videos/store';
import { videoDateText } from '~/videos/text';

/**
 * 영상 하나(내 영상 상세) — 재생기 · 이 영상에만 남는 감각 메모 · ★ 즐겨찾기 · 붙은 기록(읽기만) · 다른 영상과 비교.
 * 바로 들어왔을 때(목록 없이) — 받는 중 · 못 받음 · 없는 영상을 가른다(끝없이 도는 표시로 두지 않는다).
 * 기록 총평(PitchLog.memo)은 기록 화면에서 고친다 — 여기서 적는 메모와 따로다(설계 4절).
 */
export default function MyVideoScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { path } = useLocalSearchParams<{ path: string }>();
  const list = useMyVideos();
  const v = path ? findMyVideo(path) : null;
  const featured = useFeatured();
  const [note, setNote] = useState(v?.note ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
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
    const waiting = list.loading || (!list.items && !list.error);
    return (
      <View style={[styles.center, { backgroundColor: c.page, paddingTop: inset.top, gap: 12, padding: 24 }]}>
        {waiting ? (
          <ActivityIndicator />
        ) : (
          <>
            <Icon name={list.items ? 'film' : 'refresh-cw'} size={30} color={c.muted} />
            <Text style={[TYPE.body, { color: c.muted, textAlign: 'center' }]}>
              {list.items
                ? '이 영상을 찾지 못했어요. 지웠거나, 다른 계정의 영상이거나, 아직 보내는 중일 수 있어요.'
                : `영상 정보를 받지 못했어요. ${list.error ?? ''}`}
            </Text>
            {!list.items ? (
              <Press accessibilityRole="button" onPress={() => void refreshMyVideos()} style={[styles.button, { backgroundColor: withAlpha(c.ink, 0.06), paddingHorizontal: 20 }]}>
                <Text style={[TYPE.buttonCompact, { color: c.ink }]}>다시 받기</Text>
              </Press>
            ) : null}
            <Press accessibilityRole="button" onPress={() => router.back()} style={[styles.button, { paddingHorizontal: 20 }]}>
              <Text style={[TYPE.buttonCompact, { color: c.link }]}>돌아가기</Text>
            </Press>
          </>
        )}
      </View>
    );
  }
  const unlink = (l: MyVideoLog) =>
    Alert.alert('이 기록에서 영상을 뗄까요?', '기록에서만 빠져요. 영상 · 메모는 내 영상에 남아요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '연결 해제',
        onPress: async () => {
          const err = await linkVideo(v.path, l, false);
          if (err) setStatus(err);
        },
      },
    ]);
  const remove = () =>
    Alert.alert(
      '이 영상을 지울까요?',
      [v.logs.length ? `기록 ${v.logs.length}개에서도 빠져요(투구수 · 강도는 그대로).` : null, '영상 · 메모가 지워지고 되돌릴 수 없어요.'].filter(Boolean).join('\n'),
      [
        { text: '취소', style: 'cancel' },
        {
          text: '지우기',
          style: 'destructive',
          onPress: async () => {
            const err = await deleteVideo(v.path, v.logs.map((l) => l.date));
            if (err) setStatus(err);
            else {
              saved.current = note; // 나가며 메모를 다시 저장하지 않게
              router.back();
            }
          },
        },
      ]
    );
  /* 즐겨찾기 — 목록과 같은 길(연타는 마지막 뜻만, 실패하면 되돌리고 알림) */
  const toggleStar = () => void toggleFavorite(v.path);
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
          accessibilityLabel={v.revisit ? '즐겨찾기에서 해제' : '즐겨찾기에 추가'}
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
        {isFeatured || v.dateSource === 'log' || !v.date ? (
          <Text style={[TYPE.sub, { color: c.muted }]}>
            {[
              isFeatured ? '그날 대표 영상' : null,
              v.dateSource === 'log' ? '찍은 날을 몰라 붙은 기록의 날짜로 묶었어요' : null,
              !v.date ? '찍은 날을 몰라요' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}

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
          <LogCard key={`${l.kind}:${l.id}`} log={l} onUnlink={() => unlink(l)} />
        ))}
        <Press accessibilityRole="button" onPress={() => setLinking(true)} style={[styles.button, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
          <Icon name="plus" size={18} color={c.ink} />
          <Text style={[TYPE.buttonCompact, { color: c.ink }]}>기록에 연결</Text>
        </Press>

        {/* 덕아웃에 올리기(2026-10-28) — 공유용 사본을 올리고 글을 쓴다(my-videos/share). 내 영상은 비공개 그대로 */}
        <Press
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/my-videos/share' as never, params: { path: v.path } })}
          style={[styles.button, { backgroundColor: withAlpha(c.ink, 0.06) }]}
        >
          <Icon name="chat" size={18} color={c.ink} />
          <Text style={[TYPE.buttonCompact, { color: c.ink }]}>덕아웃에 올리기</Text>
        </Press>
        <Press
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/my-videos' as never, params: { pick: v.path, src: 'my-videos' } })}
          style={[styles.button, { backgroundColor: withAlpha(c.ink, 0.06) }]}
        >
          <Icon name="video" size={18} color={c.ink} />
          <Text style={[TYPE.buttonCompact, { color: c.ink }]}>다른 영상과 비교</Text>
        </Press>
        {v.clip ? (
          <Text style={[TYPE.sub, { color: c.muted }]}>구속 측정 영상은 투구 기록의 구속 측정 칸에서 지워요.</Text>
        ) : (
          <Press accessibilityRole="button" onPress={remove} style={styles.danger}>
            <Text style={[TYPE.buttonCompact, { color: c.danger }]}>영상 지우기</Text>
          </Press>
        )}
        {v.storage === 'phone' ? (
          <Text style={[TYPE.sub, { color: c.muted }]}>영상은 이 폰의 싱커 앱 안에만 있어요. 앱을 지우면 영상도 사라져요.</Text>
        ) : null}
      </ScrollView>
      {linking ? <LinkSheet path={v.path} date={v.date} linked={v.logs} onClose={() => setLinking(false)} /> : null}
    </View>
  );
}

type LinkTarget = { kind: 'pitch' | 'hit'; id: string; date: string; type: string; count: number; videos: number };

/** '기록에 연결' — 그날(모르면 최근 14일)의 투구 · 타격 기록. 누르면 연결(투구수 그대로) */
function LinkSheet({ path, date, linked, onClose }: { path: string; date: string | null; linked: MyVideoLog[]; onClose: () => void }) {
  const c = usePalette();
  const [logs, setLogs] = useState<LinkTarget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void rpc<{ ok: true; logs: LinkTarget[] } | { ok: false; error: string }>('my-videos.loadMyVideoLinkTargets', date).then(
      (r) => (r.ok ? setLogs(r.logs) : setError(r.error)),
      () => setError('신호가 약해 기록을 못 받았어요.')
    );
  }, [date]);
  const has = (l: LinkTarget) => linked.some((x) => x.kind === l.kind && x.id === l.id);
  const pick = async (l: LinkTarget) => {
    setBusy(true);
    const err = await linkVideo(path, l, true);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <View style={[styles.bar, { paddingTop: 12 }]}>
          <View style={styles.barButton} />
          <Text accessibilityRole="header" style={[TYPE.card, { flex: 1, textAlign: 'center', color: c.ink }]}>
            기록에 연결
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} hitSlop={6} style={styles.barButton}>
            <Icon name="x" size={20} color={c.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          <Text style={[TYPE.sub, { color: c.muted }]}>
            {date ? `${videoDateText(date)} 기록` : '최근 14일 기록'}이에요. 연결해도 투구수 · 강도는 그대로예요. 기록 하나에 영상 2개까지.
          </Text>
          {error ? <Text style={[TYPE.body, { color: c.danger }]}>{error}</Text> : null}
          {!logs && !error ? <ActivityIndicator style={{ marginTop: 24 }} /> : null}
          {logs && logs.length === 0 ? (
            <Text style={[TYPE.body, { color: c.muted, paddingVertical: 24, textAlign: 'center' }]}>이날 남긴 기록이 없어요.</Text>
          ) : null}
          {logs?.map((l) => {
            const on = has(l);
            const full = !on && l.videos >= 2;
            return (
              <Press
                key={`${l.kind}:${l.id}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: on || full || busy }}
                disabled={on || full || busy}
                onPress={() => void pick(l)}
                style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }, (on || full) && { opacity: 0.5 }]}
              >
                <Text style={[TYPE.sub, { color: c.muted }]}>
                  {l.kind === 'pitch' ? '투구 기록' : '타격 기록'} · {videoDateText(l.date)}
                </Text>
                <Text style={[TYPE.card, { color: c.ink }]}>
                  {l.type} · {l.count}
                  {l.kind === 'pitch' ? '구' : '스윙'}
                </Text>
                <Text style={[TYPE.sub, { color: c.muted }]}>{on ? '이미 연결됨' : full ? '영상이 2개라 더 못 붙여요' : `영상 ${l.videos}/2`}</Text>
              </Press>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** 붙은 기록 — 날짜 · 종류 · 수 · 기록 총평(읽기만). 투구 기록은 그날 화면에서 고친다 */
function LogCard({ log, onUnlink }: { log: MyVideoLog; onUnlink: () => void }) {
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
      <View style={styles.logActions}>
        {pitch ? (
          <Pressable accessibilityRole="link" onPress={() => router.push(`/pitch/${log.date}` as Href)} hitSlop={8}>
            <Text style={[TYPE.body, { color: c.link }]}>기록에서 고치기 ›</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onUnlink} hitSlop={8}>
          <Text style={[TYPE.body, { color: c.muted }]}>연결 해제</Text>
        </Pressable>
      </View>
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
  danger: { alignItems: 'center', justifyContent: 'center', height: 48 },
  logActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
});
