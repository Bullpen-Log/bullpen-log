import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FEEL_NOTE_MAX, type NewVideo, type VideoSport } from '@/lib/my-videos';
import { phoneAssetId, phoneVideoPath } from '@/lib/phone-video-path';
import { toDateKey } from '@/lib/pitch-stats';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { discardServerVideo, isPhoneVideoPath, loadMe } from '~/pitch/api';
import { PICK_ORIGINAL, attach, attachErrorText, dropPickerTemp, readVideoFacts, saveToPhone } from '~/pitch/attach';
import { PitchVideo } from '~/pitch/video';
import { Segmented } from '~/shell/heading';
import { DateNavButton } from '~/shell/mini-calendar';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';
import { outboxOwner } from '~/workout/outbox';
import { LocalVideo } from '../../../modules/local-video';
import { addVideo, clearDraft, saveDraft, setDraftEditing } from '~/videos/outbox';
import { videoDateText } from '~/videos/text';

/**
 * 영상만 저장(운동량 없이) — 찍거나 고른 영상에 방금의 느낌 한 줄을 남긴다(설계 3절). 투구수 · 강도를 묻지 않아 부하가 그대로다.
 * 1. 찍거나 고르면 곧바로 앱 안(회원) · 서버(관리자)에 넣고 '저장 전'으로 폰에 적는다 — 앱이 죽어도 찍은 것을 잃지 않는다.
 * 2. 느낌 · 종목 · 촬영 날짜(파일 머리에서 읽음, 모르면 '모름' — 오늘로 단정하지 않는다)를 고친다.
 * 3. [저장] = 대기열에 담고 보낸다(신호가 없으면 '동기화 대기'). [버리기] = 1에서 넣은 파일만 지운다.
 * 끌어 닫기는 막는다(_layout) — 나가는 길은 두 단추뿐.
 */
const SPORTS: { value: VideoSport; label: string }[] = [
  { value: 'pitch', label: '투구' },
  { value: 'hit', label: '타격' },
];
const newId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 3) | 8).toString(16);
  });

export default function NewVideoScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const params = useLocalSearchParams<{ source?: string; sport?: string }>();
  const camera = params.source === 'camera';
  const today = toDateKey(new Date());
  const [video, setVideo] = useState<NewVideo | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(camera ? '카메라를 여는 중' : '영상을 고르는 중');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    setDraftEditing(true);
    return () => setDraftEditing(false);
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const opts: ImagePicker.ImagePickerOptions = { ...PICK_ORIGINAL, videoMaxDuration: 180 };
        const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
        const asset = res.canceled ? null : res.assets?.[0];
        if (!asset) return router.back();
        setBusy('영상을 넣는 중');
        const facts = await readVideoFacts(asset.uri).catch(() => null);
        /* 계정은 껍데기가 아는 것 먼저(신호 없이도 폰에 넣는다) — 관리자 영상은 서버에 둔다(기록 폼과 같은 규칙) */
        const me = await loadMe().catch(() => null);
        const owner = me?.userId ?? outboxOwner();
        if (!owner) throw new Error('로그인 정보를 못 받았어요. 신호가 잡히면 다시 해 주세요.');
        let path: string | null;
        if (me?.isAdmin) path = await attach(asset, true);
        else {
          path = phoneVideoPath(owner, await saveToPhone(asset.uri));
          dropPickerTemp(asset.uri);
        }
        if (!path) throw new Error('영상을 넣지 못했어요.');
        const at = camera ? Date.now() : (facts?.startMs ?? null);
        const input: NewVideo = {
          clientId: newId(),
          path,
          sport: params.sport === 'hit' ? 'hit' : 'pitch',
          origin: camera ? 'camera' : 'album',
          capturedAt: at != null ? new Date(at).toISOString() : null,
          capturedDate: at != null ? toDateKey(new Date(at)) : null,
          capturedSource: camera ? 'camera' : at != null ? 'header' : 'unknown',
          feelNote: null,
          durationSec: facts?.durationSec ?? (asset.duration ? asset.duration / 1000 : null),
          width: asset.width || null,
          height: asset.height || null,
        };
        await saveDraft(input);
        setVideo(input);
      } catch (e) {
        setError(attachErrorText(e, '영상을 넣지 못했어요.'));
      } finally {
        setBusy(null);
      }
    })();
  }, [camera, params.sport]);

  const save = () => {
    if (!video) return;
    addVideo({ ...video, feelNote: note.trim() || null });
    void clearDraft();
    toast('저장했어요');
    router.back();
  };
  const discard = () => {
    if (video) {
      if (isPhoneVideoPath(video.path)) void LocalVideo.remove({ ids: [phoneAssetId(video.path)] }).catch(() => undefined);
      else void discardServerVideo(video.path);
      void clearDraft();
    }
    router.back();
  };
  const pickDate = (d: string) => setVideo((v) => (v ? { ...v, capturedDate: d, capturedSource: 'manual', capturedAt: v.capturedAt } : v));

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <View style={[styles.bar, { paddingTop: 12 }]}>
        <Press accessibilityRole="button" onPress={discard} hitSlop={8} disabled={!!busy && !error && !video}>
          <Text style={[TYPE.body, { color: c.link }]}>{video ? '버리기' : '닫기'}</Text>
        </Press>
        <Text accessibilityRole="header" style={[TYPE.card, { flex: 1, textAlign: 'center', color: c.ink }]}>
          영상 남기기
        </Text>
        <Press accessibilityRole="button" onPress={save} hitSlop={8} disabled={!video}>
          <Text style={[TYPE.body, { color: video ? c.link : c.muted, fontWeight: '600' }]}>저장</Text>
        </Press>
      </View>
      <ScrollView keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator />
            <Text style={[TYPE.body, { color: c.muted }]}>{busy}</Text>
          </View>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={[TYPE.body, { color: c.danger }]}>
            {error}
          </Text>
        ) : null}
        {video ? (
          <>
            <PitchVideo path={video.path} />
            <View style={{ gap: 6 }}>
              <Text style={[TYPE.card, { color: c.ink }]}>방금 어떤 느낌이었나요?</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={FEEL_NOTE_MAX}
                placeholder="예: 하체가 먼저 나가니 릴리스가 편했다 (비워도 돼요)"
                placeholderTextColor={c.muted}
                accessibilityLabel="영상 느낌 메모"
                style={[styles.note, { color: c.ink, backgroundColor: c.card, boxShadow: c.float }]}
              />
            </View>
            <Segmented options={SPORTS} value={video.sport} onChange={(sport) => setVideo((v) => (v ? { ...v, sport } : v))} label="종목" />
            <View style={styles.dateRow}>
              <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>찍은 날</Text>
              <DateNavButton
                label={video.capturedDate ? videoDateText(video.capturedDate) : '모름 · 정하기'}
                date={video.capturedDate ?? ''}
                today={today}
                min="2015-01-01"
                marked={() => false}
                onPick={pickDate}
              />
            </View>
            <Text style={[TYPE.sub, { color: c.muted }]}>
              {isPhoneVideoPath(video.path)
                ? '영상은 이 폰의 싱커 앱 안에만 둬요. 사진 앱이나 서버에 따로 올리지 않아요. 앱을 지우면 영상도 사라져요.'
                : '관리자 영상은 서버에 둬요.'}
              {' 투구수 · 강도는 묻지 않아 운동량에 더해지지 않아요.'}
            </Text>
          </>
        ) : null}
        {!video && !busy ? (
          <Press accessibilityRole="button" onPress={() => router.back()} style={[styles.button, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
            <Text style={[TYPE.buttonCompact, { color: c.ink }]}>돌아가기</Text>
          </Press>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8, minHeight: 52 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  note: { minHeight: 88, borderRadius: 14, padding: 12, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  button: { alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 24 },
});
