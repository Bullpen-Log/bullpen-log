import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, Alert, BackHandler, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInLeft, FadeInRight, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { effortScaleText } from '@/lib/pitch-effort';
import { isRatedSession } from '@/lib/pitch-satisfaction';
import { SESSION_TYPES, isRestSession } from '@/lib/session-type';
import { formatSpeed, speedLabel, type SpeedUnit } from '@/lib/units';
import { READABLE } from '~/lib/layout';
import { setPref, usePrefs } from '~/lib/prefs';
import { cacheEpoch } from '~/lib/store';
import { TYPE, usePalette, withAlpha, type Palette } from '~/lib/ui';
import { ActionButton } from '~/shell/action-button';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';
import { LocalVideo } from '../../modules/local-video';
import { discardServerVideo, isPhoneVideoPath, loadMe, phoneAssetId, phoneOrphans, removePhoneOrphans, type PitchLog } from './api';
import { PICK_ORIGINAL, attach, attachErrorText, dropPickerTemp, markImported } from './attach';
import {
  FATIGUE_LEVELS,
  FATIGUE_QUESTION,
  MAX_VIDEOS,
  REST,
  STEPS,
  THROW_TYPES,
  bumpCount,
  buildEntry,
  countError,
  fatigueLabel,
  firstStep,
  initialForm,
  isDirty,
  restLoses,
  saveProblem,
  speedProblem,
  speedText,
  stepDone,
  stepProblem,
  summaryLine,
  switchSpeedUnit,
  toggleCue,
  typeSpeed,
  type EntryForm,
  type EntrySource,
  type MeasuredSource,
  type Problem,
  type Step,
} from './entry-model';
import {
  afterSaved,
  loadPendingEntry, savePendingEntry, clearPendingEntry,
  clearEntryDraft,
  createEntry,
  dismissLinkNote,
  knownIdsOf,
  loadEntryDraft,
  noteLink,
  reconcileCreate,
  saveEntryDraft,
  updateEntry,
  type SaveOutcome,
} from './entry-save';
import { FatigueGuide, FeelSheet, Sheet, SourceSheet, SpeedSheet, VideoSheet, isReady, type VideoItem } from './quick-step-sheets';
import { monthOf, useMonth } from './store';

/**
 * 투구 기록 입력 '퀵 스텝'(2026-10-29 김민 확정) — 투구 종류 → 투구 수 → 팔의 피로, 마지막 단계에서 영상 · 느낀 점 · 구속은 고를 때만.
 * 새로 · 고치기 · 구속 측정 · 드릴 · 지난 영상 가져오기가 모두 이 흐름을 쓴다(그날 화면 안 · /pitch/edit 창).
 *
 * - 단계를 오가는 것은 저장이 아니다. 마지막 '기록 저장'에서만 서버에 남긴다(새로 = POST, 고치기 = 같은 id 로 PATCH).
 * - 규칙(검사 · 저장값 · 옛 기록 호환)은 entry-model.ts, 저장 · 확인 · 초안은 entry-save.ts. 이 파일은 그리기와 순서만.
 * - 답을 못 받으면 '저장됐는지 확인'을 따로 둔다 — 모른 채 '저장되지 않음'이라고 하지 않고, 확인 없이 다시 보내 두 줄을 만들지 않는다.
 */
export type EntryDone = { log: PitchLog; created: boolean };

const TYPE_ICON: Record<string, IconName> = { 불펜: 'circle-dot', 라이브: 'people', 경기: 'flag', 캐치볼: 'arrow-left-right' };
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DRAFT_NOTE = '이 폰에도 남겨 뒀어요(영상은 빼고).';

type Banner = { tone: 'error' | 'info'; text: string; action?: 'retry' | 'check' | 'close' | 'clearDraft' };

export function QuickStepEntry({
  date,
  source,
  convertRest = false,
  onDone,
  onCancel,
}: {
  date: string;
  source: EntrySource;
  /** 쉬는 날 기록을 투구로 바꿀 때 — 종류부터 다시 고른다(같은 기록을 고친다) */
  convertRest?: boolean;
  onDone: (r: EntryDone) => void;
  onCancel: () => void;
}) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const unit = usePrefs().speed;
  const unitText = speedLabel(unit);
  const { logs: monthLogs } = useMonth(monthOf(date));
  const editingId = source.kind === 'edit' ? source.log.id : null;
  const measured: MeasuredSource | null = source.kind === 'measured' ? source.m : null;

  const [start] = useState<EntryForm>(() => {
    const f = initialForm(source, unit);
    return convertRest ? { ...f, type: '' } : f;
  });
  const [form, setForm] = useState<EntryForm>(start);
  const [step, setStep] = useState<Step>(() => (convertRest ? 0 : firstStep(source, start)));
  const back = useRef<1 | -1>(1);
  const prevType = useRef<string>('');
  const set = (patch: Partial<EntryForm>) => setForm((f) => ({ ...f, ...patch }));

  /* 영상 — 고치기는 저장된 것, 가져오기는 이번에 넣은 것(저장 없이 닫으면 아무 기록에도 안 붙은 것만 지운다) */
  const [videos, setVideos] = useState<VideoItem[]>(() =>
    source.kind === 'edit'
      ? source.log.videoPaths.map((p) => ({ key: p, path: p, fresh: false }))
      : source.kind === 'import'
        ? source.paths.map((p) => ({ key: p, path: p, fresh: true }))
        : []
  );
  const [attaching, setAttaching] = useState<string | null>(null);
  const attachingRef = useRef(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const [sheet, setSheet] = useState<'video' | 'feel' | 'speed' | 'source' | 'guide' | null>(null);
  const sheetFrom = useRef<ComponentRef<typeof Pressable> | null>(null);
  const [cueSide, setCueSide] = useState<'good' | 'bad'>('good');
  const [cuesOpen, setCuesOpen] = useState(form.good.length + form.bad.length > 0);

  const [problem, setProblem] = useState<Problem | null>(null);
  const [phase, setPhase] = useState<'idle' | 'saving' | 'checking'>('idle');
  const [banner, setBanner] = useState<Banner | null>(null);

  const inFlight = useRef(false);
  const opRef = useRef(0);
  const mounted = useRef(true);
  const saved = useRef(false);
  const knownIds = useRef<Set<string> | null>(null);
  /** 답을 못 받은 마지막 저장 몸 — '저장 확인'은 이것으로 찾는다 */
  const pending = useRef<ReturnType<typeof buildEntry> | null>(null);
  const owner = useRef<string | null>(null);

  const rest = isRestSession(form.type);
  const busy = phase !== 'idle' || attaching != null;
  const dayLogs = (monthLogs ?? []).filter((l) => l.date.slice(0, 10) === date && l.id !== editingId);
  /* 휴식은 그날 다른 기록이 없을 때만 — 투구가 있는 날 휴식이 같이 쌓이지 않게, 쉬는 날이 두 줄 생기지 않게 */
  const restAllowed = dayLogs.length === 0;
  const videosChanged = videos.some((v) => !isReady(v) || v.fresh) || (source.kind === 'edit' && videos.filter(isReady).length !== source.log.videoPaths.length);
  const dirty = isDirty(form, start, videosChanged);
  /* 처음 값 그대로인가 — 늦게 읽힌 초안이 적기 시작한 것을 덮지 않게 */
  const untouched = useRef(true);
  useEffect(() => {
    if (dirty || step !== (convertRest ? 0 : firstStep(source, start))) untouched.current = false;
  });

  /* 계정 — 초안 열쇠 · 다른 계정 초안을 쓰지 않게. 처음 한 번, 그 뒤 초안 채우기(측정 · 드릴 · 가져온 영상으로 채운 폼은 그 값이 먼저) */
  useEffect(() => {
    mounted.current = true;
    const epoch = cacheEpoch();
    let alive = true;
    void loadMe()
      .then(async (me) => {
        if (!alive || epoch !== cacheEpoch()) return;
        owner.current = me.userId;
        if (source.kind !== 'edit') {
          const request = await loadPendingEntry(me.userId, date);
          if (!alive || epoch !== cacheEpoch()) return;
          if (request) {
            pending.current = request.entry;
            knownIds.current = new Set(request.knownIds);
            setForm(request.form);
            setStep(request.step);
            setVideos(request.entry.videoPaths.map((path) => ({ key: path, path, fresh: false })));
            setBanner({ tone: 'info', text: '앞서 보낸 기록의 저장 여부를 확인해 주세요.', action: 'check' });
            return;
          }
        }
        if (source.kind !== 'new' && source.kind !== 'edit') return;
        if (convertRest) return;
        const d = await loadEntryDraft(me.userId, date, editingId);
        if (!alive || !d || epoch !== cacheEpoch() || owner.current !== me.userId) return;
        /* 그새 적기 시작했으면 덮지 않는다(초안은 그대로 두고 다음에) */
        if (!untouched.current) return;
        setForm(d.form);
        setStep(d.step);
        setBanner({ tone: 'info', text: '저장하지 못했던 기록을 다시 채웠어요. 영상은 다시 넣어 주세요.', action: 'clearDraft' });
      })
      .catch(() => {});
    return () => {
      alive = false;
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 붙을 때 한 번
  }, []);

  /* 닫힐 때 — 저장하지 않았으면 이번에 넣은 폰 영상 가운데 어느 기록에도 안 붙은 것만 지운다(서버에 묻고, 못 물으면 안 지운다) */
  const videosRef = useRef(videos);
  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);
  useEffect(
    () => () => {
      for (const v of videosRef.current) if (!isReady(v)) dropPickerTemp(v.asset.uri);
      if (saved.current || pending.current || inFlight.current) return;
      const fresh = videosRef.current.filter(isReady).filter((v) => v.fresh && isPhoneVideoPath(v.path)).map((v) => v.path);
      void phoneOrphans(fresh).then((o) => (o?.length ? LocalVideo.remove({ ids: o.map(phoneAssetId) }).catch(() => undefined) : undefined));
    },
    []
  );

  /* 안드로이드 뒤로 — 창이 열려 있으면 창을, 앞 단계가 있으면 앞 단계로, 아니면 작성 그만두기 */
  const stepBackOrCancel = useRef<() => boolean>(() => false);
  stepBackOrCancel.current = () => {
    if (sheet) return closeSheet(), true;
    if (busy) return true;
    if (rest) return leaveRest(), true;
    if (step > 0) return go((step - 1) as Step), true;
    cancel();
    return true;
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => stepBackOrCancel.current());
    return () => sub.remove();
  }, []);

  const announce = (text: string) => AccessibilityInfo.announceForAccessibility(text);

  const go = (to: Step) => {
    back.current = to < step ? -1 : 1;
    setProblem(null);
    setStep(to);
  };
  const next = () => {
    const p = stepProblem(form, step);
    if (p) {
      setProblem(p);
      announce(p.message);
      return;
    }
    go((step + 1) as Step);
  };

  const openSheet = (k: NonNullable<typeof sheet>, from: ComponentRef<typeof Pressable> | null) => {
    sheetFrom.current = from;
    setSheet(k);
  };
  const closeSheet = () => {
    setSheet(null);
    /* 닫은 뒤 연 단추로 읽기 초점을 돌려준다(VoiceOver) */
    const el = sheetFrom.current;
    if (el) setTimeout(() => AccessibilityInfo.sendAccessibilityEvent(el, 'focus'), 400);
  };

  const goRest = () => {
    const lose = restLoses(form);
    const apply = () => {
      prevType.current = form.type;
      setProblem(null);
      set({ type: REST });
    };
    if (!lose.length && !measured) return apply();
    Alert.alert(
      '휴식으로 바꿀까요?',
      [lose.length ? `적어 둔 ${lose.join(' · ')}는 휴식 기록에 들어가지 않아요.` : null, measured ? '가져온 구속 측정은 이 기록에 이어지지 않아요.' : null]
        .filter(Boolean)
        .join(' '),
      [
        { text: '계속 작성', style: 'cancel' },
        { text: '휴식으로 변경', onPress: apply },
      ]
    );
  };
  const leaveRest = () => set({ type: prevType.current && !isRestSession(prevType.current) ? prevType.current : '' });

  const cancel = () => {
    if (busy) return;
    if (pending.current) return onCancel();
    if (!dirty) return onCancel();
    Alert.alert('기록을 그만 남길까요?', '입력한 내용은 저장되지 않아요.', [
      { text: '계속 작성', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: onCancel },
    ]);
  };

  /* ---------------- 영상 ---------------- */
  const addAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    const me = await loadMe();
    for (const [i, a] of assets.entries()) {
      setAttaching(`영상 ${i + 1}/${assets.length} 넣는 중`);
      try {
        /* 원본은 남겨 두고(실패하면 그 파일만 다시 넣게), 넣은 뒤 지운다 */
        const path = await attach(a, me.isAdmin, { keepPickerFile: true });
        dropPickerTemp(a.uri);
        if (!mounted.current) {
          /* 그새 화면을 닫았다 — 아무 기록에도 안 붙을 영상이라 바로 정리 */
          if (isPhoneVideoPath(path)) void LocalVideo.remove({ ids: [phoneAssetId(path)] }).catch(() => undefined);
          else void discardServerVideo(path);
          continue;
        }
        setVideos((v) => [...v, { key: path, path, fresh: true }]);
      } catch (e) {
        if (mounted.current) setVideos((v) => [...v, { key: `${a.uri}:${Date.now()}`, failed: true, asset: a, error: attachErrorText(e, '영상을 넣지 못했어요.') }]);
        else dropPickerTemp(a.uri);
      }
    }
  };
  const pick = async (camera: boolean) => {
    if (attachingRef.current || rest) return;
    const room = MAX_VIDEOS - videos.length;
    if (room <= 0) return;
    attachingRef.current = true;
    setVideoError(null);
    setAttaching('영상을 가져오는 중');
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setVideoError('카메라를 쓸 수 없어요. 설정에서 싱커의 카메라를 허용해 주세요.');
          return;
        }
      }
      const opts: ImagePicker.ImagePickerOptions = { ...PICK_ORIGINAL, videoMaxDuration: 180 };
      const res = camera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync({ ...opts, allowsMultipleSelection: true, selectionLimit: room });
      if (res.canceled || !res.assets?.length) return;
      await addAssets(res.assets.slice(0, room));
    } catch (e) {
      if (mounted.current) setVideoError(attachErrorText(e, '영상을 가져오지 못했어요. 사진 앱에서 영상이 다 받아졌는지 본 뒤 다시 골라 주세요.'));
    } finally {
      attachingRef.current = false;
      if (mounted.current) setAttaching(null);
    }
  };
  const retryVideo = async (v: VideoItem) => {
    if (isReady(v) || attachingRef.current) return;
    attachingRef.current = true;
    setVideos((list) => list.filter((x) => x !== v));
    try {
      await addAssets([v.asset]);
    } finally {
      attachingRef.current = false;
      if (mounted.current) setAttaching(null);
    }
  };
  const removeVideo = (v: VideoItem) => {
    if (!isReady(v)) {
      dropPickerTemp(v.asset.uri);
      return setVideos((list) => list.filter((x) => x !== v));
    }
    if (v.fresh) {
      setVideos((list) => list.filter((x) => x !== v));
      /* 이번에 넣은 폰 영상 — 어느 기록에도 안 붙은 것만 지운다(가져온 영상이 다른 기록에 이미 붙었을 수 있다) */
      if (isPhoneVideoPath(v.path)) void removePhoneOrphans([v.path]);
      return;
    }
    Alert.alert('이 영상을 뺄까요?', '기록을 저장하면 이 영상이 빠져요. 저장하지 않고 닫으면 그대로예요.', [
      { text: '취소', style: 'cancel' },
      { text: '빼기', style: 'destructive', onPress: () => setVideos((list) => list.filter((x) => x !== v)) },
    ]);
  };

  /* ---------------- 저장 ---------------- */
  const saveDraftFor = async (): Promise<boolean> => {
    if (!owner.current) return false;
    return saveEntryDraft({ owner: owner.current, date, recordId: editingId, step, form });
  };

  const save = async (mode: 'save' | 'check') => {
    if (inFlight.current || attachingRef.current) return;
    if (pending.current) mode = 'check';
    const p = mode === 'check' ? null : saveProblem(form, unit, unitText);
    if (p) {
      setProblem(p);
      if (p.step !== 'extra') go(p.step);
      else openSheet('speed', null);
      announce(p.message);
      return;
    }
    if (videos.some((v) => !isReady(v))) {
      setBanner({ tone: 'error', text: '넣지 못한 영상이 있어요. 영상에서 다시 넣거나 빼 주세요.' });
      return;
    }
    inFlight.current = true;
    const op = ++opRef.current;
    const epoch = cacheEpoch();
    setPhase(mode === 'check' ? 'checking' : 'saving');
    setBanner(null);
    setProblem(null);
    const entry = mode === 'check' && pending.current ? pending.current : buildEntry(form, { date, source, videoPaths: videos.filter(isReady).map((v) => v.path) });
    let out: SaveOutcome;
    if (source.kind === 'edit') {
      out = await updateEntry(source.log.id, entry);
    } else {
      knownIds.current ??= await knownIdsOf(date, monthLogs);
      if (!knownIds.current) out = { kind: 'notSaved', message: '신호가 약해 서버에 닿지 못했어요. 입력한 내용은 그대로 있어요.' };
      else if (mode === 'check') out = await reconcileCreate(entry, knownIds.current);
      else if (!owner.current || !await savePendingEntry(owner.current, date, { entry, knownIds: [...knownIds.current], form, step })) out = { kind: 'rejected', message: '저장 준비를 마치지 못했어요. 다시 시도해 주세요.' };
      else {
        pending.current = entry;
        out = await createEntry(entry, knownIds.current);
        if (out.kind === 'rejected') {
          await clearPendingEntry(owner.current, date);
          pending.current = null;
        }
      }
    }
    inFlight.current = false;
    /* 그새 닫았거나 다른 계정이 됐으면 이 답을 이 화면 · 새 계정에 쓰지 않는다 */
    if (op !== opRef.current || epoch !== cacheEpoch()) return;
    if (out.kind === 'saved') {
      saved.current = true;
      pending.current = null;
      if (owner.current) { void clearEntryDraft(owner.current, date, editingId); if (!editingId) void clearPendingEntry(owner.current, date); }
      if (source.kind === 'import' && source.importKey) markImported(source.importKey);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const ids = entry.velocitySessionIds ?? [];
      afterSaved(out.log, date, epoch, ids.length > 0);
      if (ids.length) noteLink({ date, logId: out.log.id, sessionIds: ids, result: out.link });
      else dismissLinkNote(date);
      /* 고치며 뺀 폰 영상은 폰에서도 — 다른 기록 · 내 영상이 쓰면 남긴다 */
      if (source.kind === 'edit') void removePhoneOrphans(source.log.videoPaths.filter((x) => !entry.videoPaths.includes(x)));
      if (!mounted.current) return;
      setPhase('idle');
      onDone({ log: out.log, created: source.kind !== 'edit' });
      return;
    }
    if (!mounted.current) {
      if (out.kind !== 'rejected' && out.kind !== 'deleted') void saveDraftFor();
      return;
    }
    setPhase('idle');
    if (out.kind === 'rejected') {
      setBanner({ tone: 'error', text: out.message, action: 'retry' });
    } else if (out.kind === 'deleted') {
      setBanner({ tone: 'error', text: out.message, action: 'close' });
    } else {
      const kept = await saveDraftFor();
      if (!mounted.current) return;
      if (out.kind === 'unknown') pending.current = entry;
      const action = out.kind === 'unknown' && source.kind !== 'edit' ? 'check' : 'retry';
      setBanner({ tone: 'error', text: kept ? `${out.message} ${DRAFT_NOTE}` : out.message, action });
    }
    announce(out.message);
  };

  const ctaLabel = phase === 'saving' ? '저장 중…' : phase === 'checking' ? '확인 중…' : banner?.action === 'check' ? '저장 확인' : banner?.action === 'retry' ? '다시 저장' : null;
  const onPrimary = () => {
    if (banner?.action === 'check') return void save('check');
    if (rest || step === 2 || banner?.action === 'retry') return void save('save');
    next();
  };
  const primaryLabel = ctaLabel ?? (rest ? (editingId ? '수정 저장' : '휴식 기록 저장') : step < 2 ? '다음' : editingId ? '수정 저장' : '기록 저장');

  const at = new Date(`${date}T00:00:00.000Z`);
  const dateText = `${at.getUTCMonth() + 1}월 ${at.getUTCDate()}일 ${WEEKDAYS[at.getUTCDay()]}요일`;
  const summary = step === 2 && !rest ? summaryLine(form) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      {/* 적은 게 있거나 저장 중이면 끌어 닫기를 막는다 — 닫기는 '취소'로(버릴지 묻는다) */}
      <Stack.Screen options={{ gestureEnabled: !dirty && !busy }} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={[styles.bar, { paddingTop: 12 }]}>
          <Press accessibilityRole="button" accessibilityLabel="작성 취소" onPress={cancel} disabled={busy} hitSlop={8} style={styles.barSide}>
            <Text style={[TYPE.body, { fontSize: 17, color: busy ? c.muted : c.link }]}>취소</Text>
          </Press>
          <Text accessibilityRole="header" style={[TYPE.card, { color: c.ink }]}>
            {editingId ? '기록 수정' : '투구 기록'}
          </Text>
          <View style={styles.barSide} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ paddingHorizontal: 16, paddingBottom: 24, gap: 14 }, READABLE]}>
          <View style={styles.dateRow}>
            <View accessible accessibilityLabel={`${dateText} 기록${editingId ? ', 날짜는 바꿀 수 없어요' : ''}`} style={[styles.datePill, { backgroundColor: c.card, boxShadow: c.float }]}>
              <Icon name="calendar-days" size={16} color={c.link} />
              <Text style={[TYPE.buttonCompact, { color: c.ink }]}>{dateText}</Text>
            </View>
          </View>

          {!rest ? <StepTabs c={c} form={form} step={step} onGo={(s) => !busy && !pending.current && go(s)} /> : null}

          {banner ? (
            <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: banner.tone === 'error' ? c.dangerBg : c.skyTint, borderColor: banner.tone === 'error' ? c.dangerLine : 'transparent' }]}>
              <Icon name={banner.tone === 'error' ? 'circle-alert' : 'info'} size={18} color={banner.tone === 'error' ? c.danger : c.link} />
              <Text style={[TYPE.body, { flex: 1, color: c.ink }]}>{banner.text}</Text>
              {banner.action === 'clearDraft' ? (
                <Press
                  accessibilityRole="button"
                  onPress={() => {
                    if (owner.current) { void clearEntryDraft(owner.current, date, editingId); if (!editingId) void clearPendingEntry(owner.current, date); }
                    setForm(start);
                    setStep(convertRest ? 0 : firstStep(source, start));
                    setBanner(null);
                  }}
                  style={styles.bannerBtn}
                >
                  <Text style={[TYPE.buttonCompact, { color: c.link }]}>지우기</Text>
                </Press>
              ) : banner.action === 'close' ? (
                <Press accessibilityRole="button" onPress={onCancel} style={styles.bannerBtn}>
                  <Text style={[TYPE.buttonCompact, { color: c.link }]}>닫기</Text>
                </Press>
              ) : null}
            </View>
          ) : null}

          <View pointerEvents={busy || pending.current ? 'none' : 'auto'} accessibilityElementsHidden={busy || !!pending.current} style={{ gap: 14 }}>
          {rest ? (
            <RestCard c={c} form={form} editing={!!editingId} hasVideos={videos.some(isReady)} onMemo={(memo) => set({ memo })} onBack={leaveRest} disabled={busy} />
          ) : (
            <Animated.View layout={LinearTransition.duration(220)} style={[styles.card, { backgroundColor: c.card, boxShadow: c.floatHero }]}>
              <Animated.View key={step} entering={(back.current > 0 ? FadeInRight : FadeInLeft).duration(220).withInitialValues({ opacity: 0, transform: [{ translateX: 14 * back.current }] })} style={{ gap: 16 }}>
                <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>{step + 1} / 3</Text>
                {step === 0 ? (
                  <TypeStep c={c} value={form.type} onPick={(type) => (setProblem(null), set({ type }))} restAllowed={restAllowed} onRest={goRest} problem={problem?.field === 'type' ? problem.message : null} />
                ) : step === 1 ? (
                  <CountStep c={c} form={form} measured={measured} unit={unit} onCount={(count) => (setProblem(null), set({ count }))} problem={problem?.field === 'count' ? problem.message : null} onSource={(el) => openSheet('source', el)} />
                ) : (
                  <FatigueStep
                    c={c}
                    form={form}
                    onPick={(effortPct) => (setProblem(null), set({ effortPct }))}
                    problem={problem?.field === 'effort' ? problem.message : null}
                    onGuide={(el) => openSheet('guide', el)}
                  />
                )}
              </Animated.View>
            </Animated.View>
          )}

          {!rest && step === 2 ? (
            <Extras
              c={c}
              form={form}
              unit={unit}
              videos={videos}
              speedError={problem?.field === 'speed' ? problem.message : null}
              onOpen={(k, el) => openSheet(k, el)}
            />
          ) : null}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: inset.bottom + 12, backgroundColor: c.page, borderTopColor: c.line }]}>
          <View style={[{ gap: 8 }, READABLE]}>
            {summary ? (
              <Text accessibilityLiveRegion="polite" style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]}>
                {summary}
              </Text>
            ) : null}
            <View style={styles.footerRow}>
              {!rest && step > 0 ? (
                <Press accessibilityRole="button" onPress={() => go((step - 1) as Step)} disabled={busy || !!pending.current} style={styles.prev}>
                  <Icon name="chevron-left" size={18} color={busy ? c.muted : c.link} />
                  <Text style={[TYPE.buttonCompact, { color: busy ? c.muted : c.link }]}>이전</Text>
                </Press>
              ) : null}
              <ActionButton
                label={primaryLabel}
                icon={!ctaLabel && !rest && step < 2 ? 'arrow-right' : undefined}
                onPress={onPrimary}
                disabled={busy}
                busy={phase !== 'idle'}
                style={{ flex: 1 }}
              />
            </View>
            {attaching ? <Text style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]}>영상을 넣는 동안은 저장할 수 없어요.</Text> : null}
          </View>
        </View>
      </KeyboardAvoidingView>

      <Sheet title="영상" open={sheet === 'video'} onClose={closeSheet}>
        <VideoSheet items={videos} attaching={attaching} error={videoError} rest={rest} onPick={(cam) => void pick(cam)} onRetry={(v) => void retryVideo(v)} onRemove={removeVideo} />
      </Sheet>
      <Sheet title="느낀 점" open={sheet === 'feel'} onClose={closeSheet}>
        <FeelSheet
          form={form}
          rated={isRatedSession(form.type)}
          cueSide={cueSide}
          cuesOpen={cuesOpen}
          onMemo={(memo) => set({ memo })}
          onSatisfaction={(satisfaction) => set({ satisfaction })}
          onCue={(cue) => setForm((f) => ({ ...f, ...toggleCue(f, cue, cueSide) }))}
          onCueSide={setCueSide}
          onCuesOpen={setCuesOpen}
        />
      </Sheet>
      <Sheet title="구속" open={sheet === 'speed'} onClose={closeSheet}>
        <SpeedSheet
          form={form}
          unit={unit}
          measured={measured}
          error={problem?.field === 'speed' ? (speedProblem(form, unit, unitText)?.message ?? null) : null}
          onMax={(s) => set({ max: typeSpeed(s, unit) })}
          onAvg={(s) => set({ avg: typeSpeed(s, unit) })}
          onUnit={(u) => {
            if (u === unit) return;
            setForm((f) => ({ ...f, max: switchSpeedUnit(f.max, u), avg: switchSpeedUnit(f.avg, u) }));
            setPref('speed', u);
          }}
        />
      </Sheet>
      {measured ? (
        <Sheet title="연결한 측정" open={sheet === 'source'} onClose={closeSheet}>
          <SourceSheet m={measured} unit={unit} />
        </Sheet>
      ) : null}
      <Sheet title="팔의 피로 기준" open={sheet === 'guide'} onClose={closeSheet}>
        <FatigueGuide />
      </Sheet>
    </View>
  );
}

/** 위 단계 표시 — 누르면 그 단계로(값은 그대로). 다 채운 단계는 체크 */
function StepTabs({ c, form, step, onGo }: { c: Palette; form: EntryForm; step: Step; onGo: (s: Step) => void }) {
  return (
    <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: withAlpha(c.ink, 0.05) }]}>
      {STEPS.map((s) => {
        const on = s.step === step;
        const done = stepDone(form, s.step);
        return (
          <Press
            key={s.step}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${s.step + 1}단계 ${s.label}${done ? ', 입력함' : ''}`}
            onPress={() => onGo(s.step)}
            style={[styles.tab, on && { backgroundColor: c.card, boxShadow: c.float }]}
          >
            <View style={[styles.tabNum, { backgroundColor: on ? c.action : done ? c.skyTint : 'transparent' }]}>
              {done && !on ? <Icon name="check" size={12} color={c.link} /> : <Text style={[TYPE.sub, { color: on ? c.onAction : c.muted, fontWeight: '700' }]}>{s.step + 1}</Text>}
            </View>
            <Text numberOfLines={1} style={[TYPE.sub, { color: on ? c.ink : c.muted, fontWeight: on ? '600' : '400', flexShrink: 1 }]}>
              {s.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

function ProblemLine({ c, text }: { c: Palette; text: string | null }) {
  if (!text) return null;
  return (
    <Text accessibilityRole="alert" style={[TYPE.body, { color: c.danger }]}>
      {text}
    </Text>
  );
}

function TypeStep({
  c,
  value,
  onPick,
  restAllowed,
  onRest,
  problem,
}: {
  c: Palette;
  value: string;
  onPick: (t: string) => void;
  restAllowed: boolean;
  onRest: () => void;
  problem: string | null;
}) {
  return (
    <>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[TYPE.heading, styles.title, { color: c.ink }]}>
          투구 종류
        </Text>
        {restAllowed ? (
          <Press accessibilityRole="button" onPress={onRest} style={styles.restBtn}>
            <Icon name="moon" size={16} color={c.muted} />
            <Text style={[TYPE.sub, { color: c.muted }]}>던지지 않았어요</Text>
          </Press>
        ) : null}
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="투구 종류" style={styles.typeGrid}>
        {THROW_TYPES.map((t) => {
          const on = value === t;
          const hint = SESSION_TYPES.find((x) => x.name === t)?.hint;
          return (
            <Press
              key={t}
              select
              selected={on}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${t}${hint ? `, ${hint}` : ''}`}
              onPress={() => onPick(t)}
              style={[styles.typeTile, { backgroundColor: on ? c.skyTint : withAlpha(c.ink, 0.05), borderColor: on ? c.action : 'transparent' }]}
            >
              <View style={styles.typeHead}>
                <View style={[styles.typeIcon, { backgroundColor: c.card }]}>
                  <Icon name={TYPE_ICON[t] ?? 'circle'} size={18} color={c.link} />
                </View>
                {on ? <Icon name="circle-check" size={20} color={c.link} /> : null}
              </View>
              <Text style={[TYPE.body, { color: c.ink, fontWeight: on ? '700' : '600', fontSize: 17 }]}>{t}</Text>
              {hint ? <Text style={[TYPE.sub, { color: c.muted }]}>{hint}</Text> : null}
            </Press>
          );
        })}
      </View>
      {!restAllowed ? <Text style={[TYPE.sub, { color: c.muted }]}>이날은 이미 남긴 기록이 있어 휴식으로 따로 남기지 않아요.</Text> : null}
      <ProblemLine c={c} text={problem} />
    </>
  );
}

function CountStep({
  c,
  form,
  measured,
  unit,
  onCount,
  problem,
  onSource,
}: {
  c: Palette;
  form: EntryForm;
  measured: MeasuredSource | null;
  unit: SpeedUnit;
  onCount: (s: string) => void;
  problem: string | null;
  onSource: (el: ComponentRef<typeof Pressable> | null) => void;
}) {
  const label = measured ? '전체 투구 수' : '투구 수';
  const n = countError(form.count) == null ? Number(form.count) : null;
  const sourceRef = useRef<ComponentRef<typeof Pressable>>(null);
  return (
    <>
      <View style={styles.context}>
        <Chip c={c} text={form.type} />
      </View>
      <Text accessibilityRole="header" style={[TYPE.heading, styles.title, { color: c.ink }]}>
        {label}
      </Text>
      {measured ? (
        <Pressable
          ref={sourceRef}
          accessibilityRole="button"
          accessibilityLabel={`구속측정에서 가져옴, 측정한 공 ${measured.measured}구. 측정 내역 보기`}
          onPress={() => onSource(sourceRef.current)}
          style={({ pressed }) => [styles.measured, { backgroundColor: c.skyTint }, pressed && { opacity: 0.7 }]}
        >
          <Icon name="radar" size={16} color={c.link} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>구속측정에서 가져옴 · 측정한 공 {measured.measured}구</Text>
            <Text style={[TYPE.sub, { color: c.ink }]}>
              최고 {formatSpeed(measured.maxKmh, unit)} · 측정 평균 {formatSpeed(measured.avgKmh, unit)}
            </Text>
          </View>
          <Icon name="chevron-right" size={16} color={c.muted} />
        </Pressable>
      ) : null}
      <View style={styles.countRow}>
        <Press accessibilityRole="button" accessibilityLabel={`${label} 1구 줄이기`} onPress={() => onCount(bumpCount(form.count, -1))} style={[styles.stepBtn, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
          <Icon name="minus" size={22} color={c.ink} />
        </Press>
        <View style={styles.countBox}>
          <TextInput
            value={form.count}
            onChangeText={onCount}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={4}
            accessibilityLabel={label}
            accessibilityHint="1구에서 500구 사이 정수"
            placeholder="—"
            placeholderTextColor={c.lineStrong}
            style={[TYPE.num, styles.countInput, { color: c.ink }]}
          />
          <Text style={[TYPE.body, { color: c.muted }]}>구</Text>
        </View>
        <Press accessibilityRole="button" accessibilityLabel={`${label} 1구 늘리기`} onPress={() => onCount(bumpCount(form.count, 1))} style={[styles.stepBtn, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
          <Icon name="plus" size={22} color={c.ink} />
        </Press>
      </View>
      <View style={styles.quick}>
        {[5, 10].map((d) => (
          <Press key={d} accessibilityRole="button" accessibilityLabel={`${label} ${d}구 늘리기`} onPress={() => onCount(bumpCount(form.count, d))} style={[styles.quickBtn, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
            <Text style={[TYPE.buttonCompact, { color: c.ink }]}>+{d}</Text>
          </Press>
        ))}
      </View>
      {measured ? (
        <Text style={[TYPE.sub, { color: c.muted }]}>
          측정하지 않은 공(워밍업 등)도 던졌다면 더해 주세요. 구속은 측정한 공 그대로예요.
          {measured.missed > 0 ? ` 공을 봤지만 못 잰 시도가 ${measured.missed}번 있었어요.` : ''}
          {n != null && n < measured.measured ? ' 측정한 공보다 적어요. 맞는지 확인해 주세요.' : ''}
        </Text>
      ) : (
        <Text style={[TYPE.sub, { color: c.muted }]}>이번에 던진 공 수예요. 그날 합계는 기록을 모아 셈해요.</Text>
      )}
      <ProblemLine c={c} text={problem} />
    </>
  );
}

function FatigueStep({
  c,
  form,
  onPick,
  problem,
  onGuide,
}: {
  c: Palette;
  form: EntryForm;
  onPick: (pct: number) => void;
  problem: string | null;
  onGuide: (el: ComponentRef<typeof Pressable> | null) => void;
}) {
  const pct = form.effortPct;
  /* 옛 기록의 85% · 5% — 칸에 없지만 그대로 보이고, 고르지 않으면 지킨다 */
  const offChip = pct != null && pct % 10 !== 0;
  const guideRef = useRef<ComponentRef<typeof Pressable>>(null);
  return (
    <>
      <View style={styles.context}>
        <Chip c={c} text={form.type} />
        {countError(form.count) == null ? <Chip c={c} text={`${Number(form.count)}구`} /> : null}
      </View>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[TYPE.heading, styles.title, { color: c.ink }]}>
          팔의 피로
        </Text>
        <Pressable
          ref={guideRef}
          accessibilityRole="button"
          onPress={() => onGuide(guideRef.current)}
          hitSlop={6}
          style={({ pressed }) => [styles.restBtn, pressed && { opacity: 0.6 }]}
        >
          <Icon name="info" size={16} color={c.link} />
          <Text style={[TYPE.sub, { color: c.link }]}>기준</Text>
        </Pressable>
      </View>
      <Text style={[TYPE.body, { color: c.muted }]}>{FATIGUE_QUESTION}</Text>
      <Text accessibilityLiveRegion="polite" style={[TYPE.card, { color: pct == null ? c.muted : c.ink }]}>
        {pct == null ? '골라 주세요' : fatigueLabel(pct)}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="팔의 피로 1부터 10" style={styles.fatigueGrid}>
        {FATIGUE_LEVELS.map((v) => {
          const on = pct === v * 10;
          return (
            <Press
              key={v}
              select
              selected={on}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`팔의 피로 ${v}점, ${fatigueLabel(v * 10).split(' · ')[1]}`}
              onPress={() => onPick(v * 10)}
              style={[styles.fatigueCell, { backgroundColor: on ? c.action : withAlpha(c.ink, 0.06) }]}
            >
              <Text style={[TYPE.num, { fontSize: 18, color: on ? c.onAction : c.ink }]}>{v}</Text>
            </Press>
          );
        })}
      </View>
      <View style={[styles.titleRow, { marginTop: -6 }]}>
        <Text style={[TYPE.sub, { color: c.muted }]}>1 거의 부담 없음</Text>
        <Text style={[TYPE.sub, { color: c.muted }]}>다 씀 10</Text>
      </View>
      {offChip ? <Text style={[TYPE.sub, { color: c.muted }]}>지금 {effortScaleText(pct!)} · 칸을 고르면 바뀌어요. 그대로 두면 지금 값을 지켜요.</Text> : null}
      <ProblemLine c={c} text={problem} />
    </>
  );
}

/** 마지막 단계의 선택 기록 세 단추 — 적은 것은 짧게 요약 */
function Extras({
  c,
  form,
  unit,
  videos,
  speedError,
  onOpen,
}: {
  c: Palette;
  form: EntryForm;
  unit: SpeedUnit;
  videos: VideoItem[];
  speedError: string | null;
  onOpen: (k: 'video' | 'feel' | 'speed', el: ComponentRef<typeof Pressable> | null) => void;
}) {
  const refs = { video: useRef<ComponentRef<typeof Pressable>>(null), feel: useRef<ComponentRef<typeof Pressable>>(null), speed: useRef<ComponentRef<typeof Pressable>>(null) };
  const ready = videos.filter(isReady).length;
  const failed = videos.length - ready;
  const feel = [form.memo.trim() ? '메모' : null, isRatedSession(form.type) && form.satisfaction != null ? `만족 ${form.satisfaction}/5` : null, isRatedSession(form.type) && form.good.length + form.bad.length ? `감각 ${form.good.length + form.bad.length}` : null].filter(Boolean).join(' · ');
  const mx = speedText(form.max, unit);
  const av = speedText(form.avg, unit);
  const speed = [mx ? `최고 ${mx}` : null, av ? `평균 ${av}` : null].filter(Boolean).join(' · ');
  const items: { k: 'video' | 'feel' | 'speed'; icon: IconName; label: string; value: string; warn?: boolean }[] = [
    { k: 'video', icon: 'video', label: '영상', value: failed ? '다시 넣기 필요' : ready ? `${ready}개` : '추가', warn: failed > 0 },
    { k: 'feel', icon: 'messages-square', label: '느낀 점', value: feel || '추가' },
    { k: 'speed', icon: 'gauge', label: '구속', value: speedError ? '확인 필요' : speed || '추가', warn: !!speedError },
  ];
  return (
    <View style={{ gap: 8 }}>
      <Text style={[TYPE.sub, { color: c.muted }]}>선택 기록</Text>
      <View style={styles.extras}>
        {items.map((it) => (
          <Pressable
            key={it.k}
            ref={refs[it.k]}
            accessibilityRole="button"
            accessibilityLabel={`${it.label}, ${it.value}`}
            onPress={() => onOpen(it.k, refs[it.k].current)}
            style={({ pressed }) => [styles.extra, { backgroundColor: c.card, boxShadow: c.float }, pressed && { opacity: 0.7 }]}
          >
            <Icon name={it.icon} size={20} color={it.warn ? c.danger : c.link} />
            <Text style={[TYPE.buttonCompact, { color: c.ink }]}>{it.label}</Text>
            <Text numberOfLines={2} style={[TYPE.sub, { color: it.warn ? c.danger : it.value === '추가' ? c.muted : c.link, textAlign: 'center' }]}>
              {it.value}
            </Text>
          </Pressable>
        ))}
      </View>
      {speedError ? (
        <Text accessibilityRole="alert" style={[TYPE.body, { color: c.danger }]}>
          {speedError}
        </Text>
      ) : null}
    </View>
  );
}

function RestCard({
  c,
  form,
  editing,
  hasVideos,
  onMemo,
  onBack,
  disabled,
}: {
  c: Palette;
  form: EntryForm;
  editing: boolean;
  hasVideos: boolean;
  onMemo: (s: string) => void;
  onBack: () => void;
  disabled: boolean;
}) {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={[styles.card, { backgroundColor: c.card, boxShadow: c.floatHero, alignItems: 'stretch' }]}>
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
        <View style={[styles.restEmblem, { backgroundColor: c.skyTint }]}>
          <Icon name="moon" size={26} color={c.link} />
        </View>
        <Text accessibilityRole="header" style={[TYPE.heading, { fontSize: 24, color: c.ink }]}>
          던지지 않았어요
        </Text>
        <Text style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]}>투구 수와 팔의 피로 없이 휴식으로 남겨요.</Text>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[TYPE.sub, { color: c.muted }]}>메모 · 선택</Text>
        <TextInput
          value={form.memo}
          onChangeText={onMemo}
          multiline
          accessibilityLabel="메모"
          placeholder="예: 이동일"
          placeholderTextColor={c.muted}
          style={[styles.memo, { color: c.ink, backgroundColor: withAlpha(c.ink, 0.05) }]}
        />
      </View>
      {hasVideos ? <Text style={[TYPE.sub, { color: c.muted }]}>붙어 있던 영상은 지우지 않고 그대로 남아요.</Text> : null}
      <Press accessibilityRole="button" onPress={onBack} disabled={disabled} style={[styles.prev, { alignSelf: 'center' }]}>
        <Text style={[TYPE.buttonCompact, { color: c.link }]}>{editing ? '투구 기록으로 바꾸기' : '던졌어요 · 투구 기록하기'}</Text>
      </Press>
    </Animated.View>
  );
}

function Chip({ c, text }: { c: Palette; text: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
      <Text style={[TYPE.sub, { color: c.ink, fontWeight: '600' }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 4 },
  barSide: { minWidth: 56, minHeight: 44, justifyContent: 'center' },
  dateRow: { alignItems: 'center' },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 16, borderRadius: 20 },
  tabs: { flexDirection: 'row', borderRadius: 22, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 44, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  tabNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  bannerBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  card: { borderRadius: 26, padding: 20, gap: 16, overflow: 'hidden' },
  title: { fontSize: 28 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  restBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 4 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeTile: { flexGrow: 1, flexBasis: '45%', minWidth: 140, minHeight: 104, borderRadius: 20, borderWidth: 1.5, padding: 14, gap: 6 },
  typeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  typeIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  context: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  measured: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 12, minHeight: 44 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  countBox: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4 },
  countInput: { fontSize: 52, minWidth: 80, textAlign: 'center', paddingVertical: 4 },
  quick: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  quickBtn: { minWidth: 72, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  fatigueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fatigueCell: { flexGrow: 1, flexBasis: '17%', minWidth: 52, minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  extras: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  extra: { flexGrow: 1, flexBasis: '30%', minWidth: 96, minHeight: 92, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 10 },
  footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prev: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 48, paddingHorizontal: 10 },
  restEmblem: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  memo: { minHeight: 96, borderRadius: 12, paddingHorizontal: 14, paddingTop: 12, fontSize: 17, textAlignVertical: 'top' },
});
