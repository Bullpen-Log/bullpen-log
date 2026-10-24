import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import Animated from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  EFFORT_CHIPS,
  PITCH_EFFORT_ASK,
  PITCH_EFFORT_INTRO,
  PITCH_EFFORT_LEVELS as PITCH_LEVELS,
  PITCH_EFFORT_WARN,
  effortScaleText,
  readEffort,
  snapEffortPct,
} from '@/lib/pitch-effort';
import { fromSpeed, round1, speedLabel, toSpeed } from '@/lib/units';
import { setPref, usePrefs } from '~/lib/prefs';
import { SESSION_TYPES, isRestSession } from '@/lib/session-type';
import {
  GOOD_DAY_MIN,
  PITCH_CUES,
  SATISFACTION_ENDS,
  SATISFACTION_OPTIONS,
  isRatedSession,
} from '@/lib/pitch-satisfaction';
import { LocalVideo } from '../../../modules/local-video';
import { PICK_ORIGINAL, attach, attachErrorText, markImported } from '~/pitch/attach';
import { usePalette, withAlpha, type Palette } from '~/lib/ui';
import { fadeIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import { Segmented } from '~/shell/heading';
import { Icon } from '~/shell/icon';
import {
  ApiError,
  OfflineError,
  createLog,
  isPhoneVideoPath,
  loadMe,
  phoneAssetId,
  phoneOrphans,
  updateLog,
  type PitchEntry,
  type PitchLog,
} from '~/pitch/api';
import { monthOf, refreshMonth, useMonth } from '~/pitch/store';
import { READABLE } from '~/lib/layout';
import { loadJson, saveJson } from '~/lib/store';

/**
 * 투구 기록 남기기 · 고치기(앱) — 종류 · 공 수 · 체감 강도 · 구속 · 메모 · 영상 두 개까지. 웹 entry-form 의 첫 판(만족도 · 감각 칩 · 드릴 ·
 * 구속 측정 채우기는 다음 판). 영상은 웹과 같은 규칙: 회원은 폰의 앱 안(LocalVideo — 서버엔 경로만), 관리자는 서버 저장소.
 */
const MAX_VIDEOS = 2;
type Video = { path: string; name: string; fresh?: boolean };

/**
 * 저장 없이 닫을 때 이번에 넣은 폰 영상을 지운다 — 어느 기록에도 안 붙은 것만(서버에 묻는다). 저장은 됐는데 신호가 끊겨 답만 못 받은
 * 기록의 영상을 지우던 것(2026-10-18 점검). 서버에 못 물으면 안 지운다.
 */
async function dropUnsaved(videos: Video[]) {
  const fresh = videos.filter((v) => v.fresh && isPhoneVideoPath(v.path)).map((v) => v.path);
  const orphans = await phoneOrphans(fresh);
  if (orphans?.length) await LocalVideo.remove({ ids: orphans.map(phoneAssetId) }).catch(() => undefined);
}

/** 주소에 실려 온 글자 목록 — 잘린 · 깨진 주소면 화면이 죽지 않고 빈 목록 */
function parseList(raw?: string): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export default function PitchEditScreen() {
  /* videos · importKey = 지난 영상 가져오기(pitch/import)가 폰에 넣은 영상 경로를 붙여 연다 — 저장하면 그 묶음을 '남김'으로 */
  /* drill · pct = 트레이닝 탭 메커니즘 카드의 '드릴로 던진 공'(웹 drillPrefill 과 같은 값 — 캐치볼 · 공 수 · 강도 · 메모로 채운다) */
  const { date, id, videos, importKey, drill, pct, vsids, vtype, vcount, vmax, vavg, veffort } = useLocalSearchParams<{
    date: string;
    id?: string;
    videos?: string;
    importKey?: string;
    drill?: string;
    pct?: string;
    /* 구속 측정으로 채우기 — 그날 화면의 '측정한 N구 기록 남기기'(웹 logPrefillOf 와 같은 값). 저장하면 그 세션을 잇는다 */
    vsids?: string;
    vtype?: string;
    vcount?: string;
    vmax?: string;
    vavg?: string;
    veffort?: string;
  }>();
  const c = usePalette();
  const { logs, error, loading, reload } = useMonth(monthOf(date));
  /* 이 화면에서 그 달을 한 번 다 받았는가 — 받아 둔 옛 달만 보고 '못 찾음'을 내지 않게(처음 그림에서는 아직 받는 중이 안 켜졌다) */
  const [fetched, setFetched] = useState(false);
  useEffect(() => {
    if (!loading) return;
    return () => setFetched(true);
  }, [loading]);
  const editing = id ? (logs ?? []).find((l) => l.id === id) : undefined;
  /* 고치기인데 그 달을 아직 못 받았으면 잠깐 기다린다 — 폼은 처음 값으로 한 번만 채운다 */
  if (id && !editing) {
    /* 다 받았는데 없거나(다른 기기에서 지움) 못 받았으면 — 끝없이 돌지 않고 알린다 */
    const missing = fetched && !loading && (logs != null || error != null);
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
        {missing ? (
          <>
            <Text style={{ color: c.ink, fontSize: 15, textAlign: 'center' }}>{error && !logs ? error : '이 기록을 찾지 못했어요. 지워졌을 수 있어요.'}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {error && !logs ? (
                <Press accessibilityRole="button" onPress={() => void reload()} style={{ minHeight: 44, paddingHorizontal: 18, borderRadius: 22, justifyContent: 'center', backgroundColor: c.sky }}>
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>다시 불러오기</Text>
                </Press>
              ) : null}
              <Press accessibilityRole="button" onPress={() => router.back()} style={{ minHeight: 44, paddingHorizontal: 18, borderRadius: 22, justifyContent: 'center', backgroundColor: c.chip }}>
                <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>닫기</Text>
              </Press>
            </View>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }
  const imported = parseList(videos);
  const drillThrows = drill ? Number.parseInt(drill, 10) : NaN;
  const drillPrefill =
    !editing && Number.isFinite(drillThrows) && drillThrows > 0
      ? { pitchCount: drillThrows, effortPct: snapEffortPct(Number(pct) || 60), memo: `메커니즘 드릴 ${drillThrows}회` }
      : null;
  const sessionIds = parseList(vsids);
  const num = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : null);
  const velocityPrefill =
    !editing && sessionIds.length
      ? {
          sessionIds,
          sessionType: vtype && SESSION_TYPES.some((t) => t.name === vtype) ? vtype : null,
          pitchCount: num(vcount) ?? 0,
          maxVelocity: num(vmax),
          avgVelocity: num(vavg),
          effortPct: num(veffort),
        }
      : null;
  return (
    <EntryForm
      key={editing?.id ?? 'new'}
      velocityPrefill={velocityPrefill}
      date={date}
      editing={editing}
      imported={imported}
      importKey={importKey}
      drillPrefill={drillPrefill}
    />
  );
}

export function EntryForm({
  date,
  editing,
  imported,
  importKey,
  drillPrefill,
  velocityPrefill,
  inline,
}: {
  date: string;
  /** 그날 화면 안에 펴 두는 폼(웹 day-client) — 위 막대 · 굴리기 없이, 저장 · 취소는 부르는 쪽이 받는다 */
  inline?: { onDone: () => void; onCancel?: () => void };
  editing?: PitchLog;
  imported: string[];
  importKey?: string;
  drillPrefill?: { pitchCount: number; effortPct: number; memo: string } | null;
  velocityPrefill?: {
    sessionIds: string[];
    sessionType: string | null;
    pitchCount: number;
    maxVelocity: number | null;
    avgVelocity: number | null;
    effortPct: number | null;
  } | null;
}) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const vp = velocityPrefill;
  /* 구속 단위 — 설정의 km/h | mph(저장은 늘 km/h, 웹 entry-form 과 같다) */
  const unit = usePrefs().speed;
  const shownSpeed = (kmh: number | null | undefined) => (kmh == null ? '' : String(round1(toSpeed(kmh, unit))));
  /* 옛 기록(체감 강도 % 없음)은 1~10 × 10 으로 채운다(웹 readEffort) — 예전엔 비어 열려 메모만 고쳐도 강도를 다시 골라야 했다 */
  const initialEffort = editing ? readEffort({ intensity: editing.intensity ?? 0, effortPct: editing.effortPct }) : null;
  /* 비워 두고 꼭 고르게(2026-10-18 사용자) — 예전엔 '불펜'이 미리 골라져 있었다 */
  const [type, setType] = useState<string>(editing?.sessionType ?? vp?.sessionType ?? (drillPrefill ? '캐치볼' : ''));
  const [count, setCount] = useState(
    editing && !isRestSession(editing.sessionType)
      ? String(editing.pitchCount)
      : vp?.pitchCount
        ? String(vp.pitchCount)
        : drillPrefill
          ? String(drillPrefill.pitchCount)
          : ''
  );
  const [effort, setEffort] = useState<number | null>(
    editing ? (initialEffort?.pct ?? null) : (vp?.effortPct ?? drillPrefill?.effortPct ?? null)
  );
  const [maxV, setMaxV] = useState(shownSpeed(editing ? editing.maxVelocity : vp?.maxVelocity));
  const [avgV, setAvgV] = useState(shownSpeed(editing ? editing.avgVelocity : vp?.avgVelocity));
  const [memo, setMemo] = useState(editing?.memo ?? drillPrefill?.memo ?? '');
  /* 투구 만족도 · 좋았던 · 아쉬웠던 감각(불펜 · 라이브 · 경기만 — 웹 entry-form 과 같다, lib/pitch-satisfaction.ts) */
  const [satisfaction, setSatisfaction] = useState<number | null>(editing?.satisfaction ?? null);
  const [good, setGood] = useState<string[]>(editing?.cuesGood ?? []);
  const [bad, setBad] = useState<string[]>(editing?.cuesBad ?? []);
  const toggleCue = (cue: string, side: 'good' | 'bad') => {
    const [mine, setMine, setOther] = side === 'good' ? [good, setGood, setBad] : [bad, setBad, setGood];
    setMine(mine.includes(cue) ? mine.filter((x) => x !== cue) : [...mine, cue]);
    setOther((o) => o.filter((x) => x !== cue));
  };
  const [videos, setVideos] = useState<Video[]>(
    () =>
      editing?.videoPaths.map((p, i) => ({ path: p, name: `영상 ${i + 1}` })) ??
      imported.map((p, i) => ({ path: p, name: `가져온 영상 ${i + 1}`, fresh: true }))
  );
  /*
   * '더 적기' — 꼭 셋(종류 · 투구 수 · 강도)만 펴 두고 구속 · 만족도 · 메모 · 영상은 접는다(웹 entry-form.tsx). 고칠 때 적은 게 있거나
   * 구속 측정 · 드릴로 채워 열었으면 펴서 연다. 접어도 적은 값 · 넣은 영상은 그대로다.
   */
  const [more, setMore] = useState(
    () =>
      !!(
        editing &&
        (editing.maxVelocity != null ||
          editing.avgVelocity != null ||
          editing.memo ||
          editing.satisfaction != null ||
          editing.cuesGood.length ||
          editing.cuesBad.length ||
          editing.videoPaths.length)
      ) ||
      !!vp ||
      !!drillPrefill ||
      imported.length > 0
  );
  const [effortMissing, setEffortMissing] = useState(false);
  const [cuesOpen, setCuesOpen] = useState((editing?.cuesGood.length ?? 0) + (editing?.cuesBad.length ?? 0) > 0);
  /* 단위를 바꾸면 적어 둔 숫자를 새 단위로 다시 쓴다(들고 있는 값은 화면 단위라서) */
  const switchUnit = (next: 'kmh' | 'mph') => {
    if (next === unit) return;
    const conv = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? v : String(round1(toSpeed(fromSpeed(Number(v), unit), next))));
    setMaxV(conv);
    setAvgV(conv);
    setPref('speed', next);
  };
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rest = isRestSession(type);

  const pick = async (camera: boolean) => {
    setError(null);
    const opts: ImagePicker.ImagePickerOptions = { ...PICK_ORIGINAL, videoMaxDuration: 180 };
    /* 고른 뒤 선택기가 원본을 복사하는 동안 말이 없었다 — 먼저 띄워 두고, 선택기가 던지면 글로 알린다(가져오기 화면과 같다) */
    setBusy('영상을 가져오는 중');
    try {
      const res = camera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync({ ...opts, allowsMultipleSelection: true, selectionLimit: MAX_VIDEOS - videos.length });
      if (res.canceled || !res.assets?.length) return;
      const me = await loadMe();
      for (const [i, a] of res.assets.slice(0, MAX_VIDEOS - videos.length).entries()) {
        setBusy(`영상 ${i + 1}/${res.assets.length} 넣는 중`);
        const path = await attach(a, me.isAdmin);
        setVideos((v) => [...v, { path, name: `영상 ${v.length + 1}`, fresh: true }]);
      }
    } catch (e) {
      setError(attachErrorText(e, '영상을 넣지 못했어요.'));
    } finally {
      setBusy(null);
    }
  };

  const dropVideo = (v: Video) => {
    setVideos((list) => list.filter((x) => x !== v));
    /* 이번에 새로 넣은 폰 영상만 바로 지운다 — 원래 있던 것은 저장할 때 서버 기록에서 빠진다 */
    if (v.fresh && isPhoneVideoPath(v.path)) void LocalVideo.remove({ ids: [phoneAssetId(v.path)] }).catch(() => undefined);
  };

  /* 저장돼 있던 영상은 묻고 뺀다(웹 confirmRemove) — 새로 넣은 것은 바로 */
  const confirmDrop = (v: Video) => {
    if (v.fresh) return dropVideo(v);
    Alert.alert('이 영상을 뺄까요?', '저장돼 있던 영상이에요. 빼면 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '빼기', style: 'destructive', onPress: () => dropVideo(v) },
    ]);
  };

  /* 두 번 눌러도 한 번만 — busy(상태)는 다시 그려진 뒤에야 바뀌어, 빨리 두 번 누르면 둘 다 지나갔다 */
  const inFlight = useRef(false);
  /* 저장했거나 [취소]가 직접 정리했으면 닫힐 때 다시 지우지 않는다(아래 닫힘 정리) */
  /*
   * 신호가 끊겨 못 저장하면 적은 것을 폰에 남겨 두고, 다시 열면 채운다(웹 entry-form readDraft · writeDraft — 7일, 날 · 기록마다).
   * 측정 · 드릴 · 가져온 영상으로 채워 여는 폼은 그 값이 먼저다. 영상은 남기지 않는다.
   */
  const draftKey = `pitch-draft:${date}:${editing?.id ?? 'new'}`;
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (vp || drillPrefill || imported.length) return;
    let alive = true;
    void loadJson(draftKey).then((raw) => {
      const d = raw as { savedAt?: number; form?: Record<string, unknown> } | null;
      if (!alive || !d?.form || typeof d.savedAt !== 'number') return;
      if (Date.now() - d.savedAt > 7 * 24 * 3600 * 1000 || typeof d.form.type !== 'string') return void saveJson(draftKey, null);
      const f = d.form as { type: string; count: string; effort: number | null; maxV: string; avgV: string; memo: string; satisfaction: number | null; good: string[]; bad: string[] };
      setType(f.type);
      setCount(f.count);
      setEffort(f.effort);
      setMaxV(f.maxV);
      setAvgV(f.avgV);
      setMemo(f.memo);
      setSatisfaction(f.satisfaction);
      setGood(f.good ?? []);
      setBad(f.bad ?? []);
      if (f.maxV || f.avgV || f.memo || f.satisfaction != null) setMore(true);
      setRestored(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 붙을 때 한 번만
  }, []);

  const savedRef = useRef(false);
  const save = async () => {
    if (busy || inFlight.current) return;
    if (!type) return setError('투구 종류를 골라 주세요.');
    if (!rest && effort == null) {
      setEffortMissing(true);
      return setError('체감 강도를 골라 주세요.');
    }
    /* 구속은 30~200km/h(웹 SPEED_MIN · MAX) — 접힌 칸이면 펴서 알린다 */
    for (const [label, v] of [
      ['최고 구속', maxV],
      ['평균 구속', avgV],
    ] as const) {
      if (rest || !v.trim()) continue;
      const kmh = fromSpeed(Number.parseFloat(v), unit);
      if (!Number.isFinite(kmh) || kmh < 30 || kmh > 200) {
        setMore(true);
        return setError(`${label}는 ${Math.round(toSpeed(30, unit))}~${Math.round(toSpeed(200, unit))}${speedLabel(unit)} 사이로 적어 주세요.`);
      }
    }
    const entry: PitchEntry = {
      date,
      sessionType: type,
      pitchCount: rest ? 0 : Number.parseInt(count, 10),
      effortPct: rest ? null : effort,
      maxVelocity: rest || !maxV ? null : round1(fromSpeed(Number.parseFloat(maxV), unit)),
      avgVelocity: rest || !avgV ? null : round1(fromSpeed(Number.parseFloat(avgV), unit)),
      memo,
      videoPaths: videos.map((v) => v.path),
      ...(isRatedSession(type) ? { satisfaction, cuesGood: good, cuesBad: bad } : {}),
      ...(!editing && vp?.sessionIds.length ? { velocitySessionIds: vp.sessionIds } : {}),
    };
    /* 옛 기록의 채워 둔 강도를 그대로 두었으면 옛 1~10 을 보낸다 — 서버가 % 칸을 비운 채 둔다(웹과 같다) */
    if (editing && initialEffort?.derivedFrom != null && effort === initialEffort.pct && !rest) {
      delete entry.effortPct;
      entry.intensity = initialEffort.derivedFrom;
    }
    inFlight.current = true;
    setBusy('저장하는 중');
    setError(null);
    try {
      if (editing) {
        await updateLog(editing.id, { ...entry, baseVideoPaths: editing.videoPaths });
        /* 고치며 뺀 폰 영상은 폰에서도 지운다(웹 entry-form 과 같다) */
        const gone = editing.videoPaths.filter((p) => isPhoneVideoPath(p) && !entry.videoPaths.includes(p)).map(phoneAssetId);
        if (gone.length) void LocalVideo.remove({ ids: gone }).catch(() => undefined);
      } else {
        await createLog(entry);
        if (importKey) markImported(importKey);
      }
      savedRef.current = true;
      void saveJson(draftKey, null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      /* 새 달을 받은 뒤 닫는다(그날 화면에 바로 보이게) — 신호가 약하면 2.5초만 기다리고 닫는다(받기는 뒤에서 이어 간다) */
      await Promise.race([refreshMonth(monthOf(date)), new Promise((r) => setTimeout(r, 2500))]);
      if (inline) inline.onDone();
      else router.back();
    } catch (e) {
      if (e instanceof OfflineError) {
        /* 신호가 약해 서버에 못 닿았다 — 적은 것은 폰에 맡긴다(창을 닫아도 다시 채움) */
        void saveJson(draftKey, { savedAt: Date.now(), form: { type, count, effort, maxV, avgV, memo, satisfaction, good, bad } });
        setError('저장하지 못했어요. 신호를 확인해 주세요. 적은 내용은 이 폰에 남겨 뒀어요.');
      } else setError(e instanceof ApiError ? e.message : '저장하지 못했어요. 적은 것은 그대로 있어요.');
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  /*
   * 쓸어내려 닫아도(모달 끌기) 이번에 넣은 폰 영상을 지운다 — [취소]만 지우면 끌어 닫은 영상이 앱 안에 통째로 남는다. 저장했으면 그대로.
   * 닫힐 때 지금 목록을 보게 ref 로 쥔다.
   */
  const videosRef = useRef(videos);
  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);
  useEffect(
    () => () => {
      if (savedRef.current) return;
      void dropUnsaved(videosRef.current);
    },
    []
  );

  const cancel = () => {
    /* 저장 · 영상 넣는 중에는 닫지 않는다 — 저장 도중 닫으면 곧 기록에 붙을 영상을 지웠다 */
    if (busy || inFlight.current) return;
    savedRef.current = true; // 아래에서 직접 정리 — 닫힐 때 한 번 더 하지 않게
    void dropUnsaved(videos);
    if (inline) inline.onCancel?.();
    else router.back();
  };

  const at = new Date(`${date}T00:00:00.000Z`);
  const input = [styles.input, { backgroundColor: withAlpha(c.ink, 0.05), color: c.ink }];
  const typeHint = SESSION_TYPES.find((t) => t.name === type)?.hint;
  const offChip = effort != null && !(EFFORT_CHIPS as readonly number[]).includes(effort);

  const fields = (
    <View style={{ gap: 20 }}>
      {restored ? (
        <View style={[styles.restored, { backgroundColor: withAlpha(c.sky, 0.1) }]}>
          <Text style={{ flex: 1, color: withAlpha(c.ink, 0.8), fontSize: 13 }}>저장하지 못했던 기록을 다시 채웠어요. 저장을 눌러 주세요.</Text>
          <Press
            accessibilityRole="button"
            onPress={() => {
              void saveJson(draftKey, null);
              setRestored(false);
              setType(editing?.sessionType ?? '');
              setCount(editing ? String(editing.pitchCount) : '');
              setEffort(initialEffort?.pct ?? null);
              setMaxV(shownSpeed(editing?.maxVelocity));
              setAvgV(shownSpeed(editing?.avgVelocity));
              setMemo(editing?.memo ?? '');
              setSatisfaction(editing?.satisfaction ?? null);
              setGood(editing?.cuesGood ?? []);
              setBad(editing?.cuesBad ?? []);
            }}
            style={styles.restoredBtn}
          >
            <Text style={{ color: c.sky, fontSize: 13, fontWeight: '400' }}>지우기</Text>
          </Press>
        </View>
      ) : null}
      <Field c={c} label="투구 종류" hint={typeHint}>
        <TypeGrid value={type} onChange={setType} />
      </Field>

      {!rest ? (
        <>
          <Field c={c} label="투구수">
            <TextInput value={count} onChangeText={setCount} keyboardType="number-pad" placeholder="45" placeholderTextColor={c.muted} style={input} />
          </Field>
          {/* 강도 1~10 — 고르개(웹 effort-chips.tsx Segmented) · 밑에 기준표(웹 IntensityGuide). 칸 n = n × 10% 로 저장 */}
          <View style={{ gap: 12 }}>
            <View style={{ gap: 8 }}>
              <Text style={[styles.label, { color: c.muted }]}>강도</Text>
              <Segmented
                label="강도"
                size="md"
                options={EFFORT_CHIPS.map((v) => ({ value: String(v), label: effortScaleText(v) }))}
                value={effort == null ? '' : String(effort)}
                onChange={(v) => {
                  setEffortMissing(false);
                  setEffort(Number(v));
                }}
              />
              {effortMissing ? (
                <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 13 }}>
                  체감 강도를 골라 주세요.
                </Text>
              ) : offChip ? (
                <Text style={{ color: withAlpha(c.muted, 0.8), fontSize: 13 }}>지금 {effortScaleText(effort)} · 칩을 누르면 바뀌어요</Text>
              ) : null}
            </View>
            <IntensityGuide c={c} />
          </View>
        </>
      ) : null}

      {!rest ? (
        <Press
          accessibilityRole="button"
          accessibilityState={{ expanded: more }}
          onPress={() => setMore((o) => !o)}
          style={[styles.fold, { backgroundColor: withAlpha(c.ink, 0.05) }]}
        >
          <Text style={{ color: c.skyStrong, fontSize: 15, fontWeight: '600' }}>더 적기</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
            <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
              구속 · 영상 · 만족도 · 메모
            </Text>
            <View style={{ transform: [{ rotate: more ? '180deg' : '0deg' }] }}>
              <Icon name="chevron-down" size={16} color={c.muted} />
            </View>
          </View>
        </Press>
      ) : null}

      {rest || more ? (
        <Animated.View entering={fadeIn} style={{ gap: 20 }}>
          {!rest ? (
            <>
              <View style={styles.pair}>
                <Field c={c} label={`최고 구속 (${speedLabel(unit)})`} hint="스피드건이 없으면 비워두세요." style={{ flex: 1 }}>
                  <TextInput
                    value={maxV}
                    onChangeText={setMaxV}
                    keyboardType="decimal-pad"
                    placeholder={String(Math.round(toSpeed(138, unit)))}
                    placeholderTextColor={c.muted}
                    style={input}
                  />
                </Field>
                <Field c={c} label={`평균 구속 (${speedLabel(unit)})`} hint="비워두셔도 돼요." style={{ flex: 1 }}>
                  <TextInput
                    value={avgV}
                    onChangeText={setAvgV}
                    keyboardType="decimal-pad"
                    placeholder={String(Math.round(toSpeed(132, unit)))}
                    placeholderTextColor={c.muted}
                    style={input}
                  />
                </Field>
              </View>
              {/* 단위를 칸 바로 밑에서(웹 SpeedUnitSwitch) — 바꾸면 앱 전체 표시 단위가 바뀐다. 적은 숫자는 그 단위로 다시 보인다 */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Text style={{ flex: 1, color: c.muted, fontSize: 13 }}>스피드건이 mph 면 단위를 바꿔 적어요</Text>
                <Segmented
                  label="구속 단위"
                  flow
                  options={[
                    { value: 'kmh', label: 'km/h' },
                    { value: 'mph', label: 'mph' },
                  ]}
                  value={unit}
                  onChange={(v) => switchUnit(v)}
                />
              </View>
            </>
          ) : null}

          {isRatedSession(type) ? (
            <View style={{ gap: 8 }}>
              <Text style={[styles.label, { color: c.muted }]}>투구 만족도</Text>
              <Segmented
                label="투구 만족도"
                size="md"
                options={SATISFACTION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={satisfaction == null ? '' : String(satisfaction)}
                onChange={(v) => setSatisfaction(Number(v))}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
                <Text style={{ color: withAlpha(c.muted, 0.7), fontSize: 13 }}>1 {SATISFACTION_ENDS.low}</Text>
                <Text style={{ color: withAlpha(c.muted, 0.7), fontSize: 13 }}>{SATISFACTION_ENDS.high} 5</Text>
              </View>
              <Press accessibilityRole="button" accessibilityState={{ expanded: cuesOpen }} onPress={() => setCuesOpen((o) => !o)} style={styles.cueToggle}>
                <Text style={{ color: c.sky, fontSize: 15, fontWeight: '400' }}>느낀 점 더하기</Text>
                <View style={{ transform: [{ rotate: cuesOpen ? '180deg' : '0deg' }] }}>
                  <Icon name="chevron-down" size={16} color={c.sky} />
                </View>
              </Press>
              {cuesOpen ? (
                <Animated.View entering={fadeIn} style={{ gap: 12 }}>
                  {(
                    [
                      ['good', '좋았던 것', good],
                      ['bad', '아쉬웠던 것', bad],
                    ] as const
                  ).map(([side, label, list]) => (
                    <View key={side} style={{ gap: 8 }}>
                      <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
                      <View style={styles.chips}>
                        {PITCH_CUES.map((cue) => {
                          const on = list.includes(cue);
                          return (
                            <Press
                              key={cue}
                              select
                              selected={on}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: on }}
                              onPress={() => toggleCue(cue, side)}
                              style={[styles.chip, chipLook(c, on)]}
                            >
                              {on ? <Icon name="check" size={14} color={c.skyStrong} /> : null}
                              <Text style={chipText(c, on)}>{cue}</Text>
                            </Press>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </Animated.View>
              ) : null}
            </View>
          ) : null}

          {/* 영상 — 쉰 날에도 이미 붙은 것은 뺄 수 있게 보인다(웹) */}
          {!rest || videos.length ? (
            <Field c={c} label="투구 영상" hint={rest ? '쉰 날에는 새로 올릴 수 없어요. 이미 붙어 있는 영상은 뺄 수 있어요.' : '폰에 있는 영상을 바로 올리거나 지금 찍을 수 있어요.'}>
              <View style={{ gap: 8 }}>
                {videos.map((v) => (
                  <View key={v.path} style={[styles.videoRow, { backgroundColor: withAlpha(c.ink, 0.05) }]}>
                    <Icon name="film" size={16} color={c.muted} />
                    <Text style={{ flex: 1, color: c.ink, fontSize: 15 }}>{v.name}</Text>
                    <Press accessibilityRole="button" accessibilityLabel={`${v.name} 빼기`} onPress={() => confirmDrop(v)} style={styles.dropBtn}>
                      <Icon name="x" size={16} color={c.danger} />
                    </Press>
                  </View>
                ))}
                {!rest && videos.length < MAX_VIDEOS ? (
                  <View style={styles.pair}>
                    <Press accessibilityRole="button" onPress={() => pick(true)} disabled={!!busy} style={[styles.ghost, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
                      <Icon name="camera" size={16} color={c.ink} />
                      <Text style={[styles.ghostText, { color: c.ink }]}>촬영하기</Text>
                    </Press>
                    <Press accessibilityRole="button" onPress={() => pick(false)} disabled={!!busy} style={[styles.ghost, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
                      <Icon name="image-plus" size={16} color={c.ink} />
                      <Text style={[styles.ghostText, { color: c.ink }]}>앨범에서</Text>
                    </Press>
                  </View>
                ) : null}
              </View>
            </Field>
          ) : null}

          <Field
            c={c}
            label={rest ? '메모' : '특이사항 · 느낀점'}
            hint={isRatedSession(type) && (satisfaction ?? 0) >= GOOD_DAY_MIN && !memo.trim() ? '잘 던진 날 남긴 메모는 다음에 던지는 날 홈에 다시 띄워 드려요.' : undefined}
          >
            <TextInput
              value={memo}
              onChangeText={setMemo}
              multiline
              placeholder={rest ? '어깨가 뻐근해서 쉼' : '릴리즈 포인트가 일정했고 5회부터 팔이 무거워짐'}
              placeholderTextColor={c.muted}
              style={[input, styles.memo]}
            />
          </Field>
        </Animated.View>
      ) : null}

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator />
          <Text style={{ color: c.muted, fontSize: 15 }}>{busy}</Text>
        </View>
      ) : null}
      {error ? <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text> : null}
      {/* 저장 — 웹 '10월 4일 기록 저장' · '수정 저장' */}
      <View style={{ gap: 8 }}>
        <Press
          accessibilityRole="button"
          onPress={() => void save()}
          disabled={!!busy}
          style={[styles.save, { backgroundColor: c.sky }, busy ? { opacity: 0.5 } : null]}
        >
          <Text style={styles.saveText}>
            {busy === '저장하는 중' ? '저장 중…' : busy ? '영상 올리는 중… 끝나면 저장할 수 있어요' : editing ? '수정 저장' : `${at.getUTCMonth() + 1}월 ${at.getUTCDate()}일 기록 저장`}
          </Text>
        </Press>
        {inline?.onCancel ? (
          <Press accessibilityRole="button" onPress={cancel} disabled={!!busy} style={[styles.cancel, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
            <Text style={{ color: c.ink, fontSize: 15, fontWeight: '400' }}>취소</Text>
          </Press>
        ) : null}
      </View>
    </View>
  );

  if (inline) return fields;
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      {/* 저장 · 영상 넣는 중에는 끌어 닫기를 막는다 */}
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <View style={[styles.bar, { paddingTop: 12 }]}>
        <Press accessibilityRole="button" onPress={cancel} disabled={!!busy} hitSlop={10}>
          <Text style={[styles.barAction, { color: c.sky }]}>취소</Text>
        </Press>
        <Text style={[styles.barTitle, { color: c.ink }]}>
          {at.getUTCMonth() + 1}월 {at.getUTCDate()}일 {editing ? '기록 수정' : '기록하기'}
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: inset.bottom + 32 }, READABLE]} keyboardShouldPersistTaps="handled">
        {fields}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** 폼 칸 — 이름(12) 위 · 힌트(12) 밑(웹 Field) */
function Field({ c, label, hint, style, children }: { c: Palette; label: string; hint?: string; style?: object; children: React.ReactNode }) {
  return (
    <View style={[{ gap: 8 }, style]}>
      <Text style={[styles.label, { color: c.muted }]}>{label}</Text>
      {children}
      {hint ? <Text style={{ color: c.muted, fontSize: 13, lineHeight: 17 }}>{hint}</Text> : null}
    </View>
  );
}

/* 고르는 알약 — 웹 chipClass: 회색 알약, 고른 것은 하늘 테두리 · 옅은 하늘 · 짙은 하늘 굵게 */
const chipLook = (c: Palette, on: boolean) => ({
  borderColor: on ? c.sky : 'transparent',
  backgroundColor: on ? withAlpha(c.sky, 0.1) : withAlpha(c.ink, 0.06),
});
const chipText = (c: Palette, on: boolean) => ({ fontSize: 15, color: on ? c.skyStrong : withAlpha(c.ink, 0.8), fontWeight: on ? ('600' as const) : ('400' as const) });

/** 투구 종류 — 같은 폭 칸 격자(웹 chip-grid: 칸 하나 84px 이상) */
function TypeGrid({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = usePalette();
  const [w, setW] = useState(0);
  const cols = w ? Math.max(1, Math.floor((w + 8) / (84 + 8))) : 4;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="투구 종류" onLayout={(e) => setW(e.nativeEvent.layout.width)} style={styles.typeGrid}>
      {SESSION_TYPES.map((t) => {
        const on = value === t.name;
        return (
          <View key={t.name} style={{ width: `${100 / cols}%`, padding: 4 }}>
            <Press
              select
              selected={on}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(t.name)}
              style={[styles.typeChip, chipLook(c, on)]}
            >
              <Text style={chipText(c, on)}>{t.name}</Text>
            </Press>
          </View>
        );
      })}
    </View>
  );
}

/* 강도 기준표 — 웹 components/intensity-guide.tsx 투구 띠(접힘), 글은 lib/pitch-effort.ts 하나 */
function IntensityGuide({ c }: { c: Palette }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.guide, { borderColor: c.line, backgroundColor: withAlpha(c.chip, 0.25) }]}>
      <Press accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={styles.guideHead}>
        <Icon name="info" size={14} color={c.sky} />
        <Text style={{ flex: 1, color: c.muted, fontSize: 13 }}>{PITCH_EFFORT_ASK}</Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevron-down" size={14} color={c.muted} />
        </View>
      </Press>
      {open ? (
        <Animated.View entering={fadeIn} style={{ gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line, padding: 12 }}>
          <Text style={{ color: c.muted, fontSize: 11, lineHeight: 16 }}>{PITCH_EFFORT_INTRO}</Text>
          {PITCH_LEVELS.map((l) => (
            <View key={l.range} style={{ flexDirection: 'row', gap: 12 }}>
              <Text style={{ width: 56, color: c.sky, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{l.range}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.ink, fontSize: 13, fontWeight: '600' }}>{l.label}</Text>
                <Text style={{ color: c.muted, fontSize: 11, lineHeight: 16, marginTop: 2 }}>{l.detail}</Text>
              </View>
            </View>
          ))}
          <Text style={[styles.warnBox, { color: c.warn, backgroundColor: c.warnBg, borderColor: c.warnLine }]}>
            <Text style={{ fontWeight: '700' }}>{PITCH_EFFORT_WARN.strong}</Text> {PITCH_EFFORT_WARN.rest}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  restored: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  restoredBtn: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  barAction: { fontSize: 17 },
  barTitle: { fontSize: 17, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '400' },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 16, fontSize: 17 },
  memo: { minHeight: 104, paddingTop: 12, textAlignVertical: 'top' },
  pair: { flexDirection: 'row', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', margin: -4 },
  typeChip: { minHeight: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  videoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderRadius: 12, paddingLeft: 14 },
  dropBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ghost: { flex: 1, height: 48, borderRadius: 24, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 15, fontWeight: '600' },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fold: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48, borderRadius: 16, paddingHorizontal: 16 },
  cueToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, alignSelf: 'flex-start' },
  guide: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  guideHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  warnBox: { fontSize: 11, lineHeight: 16, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden' },
  save: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  cancel: { minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
