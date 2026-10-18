import * as ImagePicker from 'expo-image-picker';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EFFORT_CHIPS, effortScaleText, readEffort, snapEffortPct } from '@/lib/pitch-effort';
import { fromSpeed, round1, speedLabel, toSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { SESSION_TYPES, isRestSession } from '@/lib/session-type';
import {
  GOOD_DAY_MIN,
  PITCH_CUES,
  SATISFACTION_ENDS,
  SATISFACTION_OPTIONS,
  isRatedSession,
} from '@/lib/pitch-satisfaction';
import { LocalVideo } from '../../../modules/local-video';
import { PICK_ORIGINAL, attach, markImported } from '~/pitch/attach';
import { TYPE, usePalette } from '~/lib/ui';
import {
  ApiError,
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
  const { logs } = useMonth(monthOf(date));
  const editing = id ? (logs ?? []).find((l) => l.id === id) : undefined;
  /* 고치기인데 그 달을 아직 못 받았으면 잠깐 기다린다 — 폼은 처음 값으로 한 번만 채운다 */
  if (id && !editing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  const imported = videos ? (JSON.parse(videos) as string[]) : [];
  const drillThrows = drill ? Number.parseInt(drill, 10) : NaN;
  const drillPrefill =
    !editing && Number.isFinite(drillThrows) && drillThrows > 0
      ? { pitchCount: drillThrows, effortPct: snapEffortPct(Number(pct) || 60), memo: `메커니즘 드릴 ${drillThrows}회` }
      : null;
  const sessionIds = vsids ? (JSON.parse(vsids) as string[]) : [];
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

function EntryForm({
  date,
  editing,
  imported,
  importKey,
  drillPrefill,
  velocityPrefill,
}: {
  date: string;
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
      vp?.maxVelocity != null ||
      !!drillPrefill
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rest = isRestSession(type);

  const pick = async (camera: boolean) => {
    setError(null);
    const opts: ImagePicker.ImagePickerOptions = { ...PICK_ORIGINAL, videoMaxDuration: 180 };
    const res = camera
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync({ ...opts, allowsMultipleSelection: true, selectionLimit: MAX_VIDEOS - videos.length });
    if (res.canceled) return;
    try {
      const me = await loadMe();
      for (const [i, a] of res.assets.slice(0, MAX_VIDEOS - videos.length).entries()) {
        setBusy(`영상 ${i + 1}/${res.assets.length} 넣는 중`);
        const path = await attach(a, me.isAdmin);
        setVideos((v) => [...v, { path, name: `영상 ${v.length + 1}`, fresh: true }]);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '영상을 넣지 못했어요.');
    } finally {
      setBusy(null);
    }
  };

  const dropVideo = (v: Video) => {
    setVideos((list) => list.filter((x) => x !== v));
    /* 이번에 새로 넣은 폰 영상만 바로 지운다 — 원래 있던 것은 저장할 때 서버 기록에서 빠진다 */
    if (v.fresh && isPhoneVideoPath(v.path)) void LocalVideo.remove({ ids: [phoneAssetId(v.path)] }).catch(() => undefined);
  };

  /* 두 번 눌러도 한 번만 — busy(상태)는 다시 그려진 뒤에야 바뀌어, 빨리 두 번 누르면 둘 다 지나갔다 */
  const inFlight = useRef(false);
  const save = async () => {
    if (busy || inFlight.current) return;
    if (!type) return setError('투구 종류를 골라 주세요.');
    if (!rest && effort == null) return setError('체감 강도를 골라 주세요.');
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
      await refreshMonth(monthOf(date));
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장하지 못했어요. 적은 것은 그대로 있어요.');
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
  const savedRef = useRef(false);
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
    router.back();
  };

  const at = new Date(`${date}T00:00:00.000Z`);
  const input = [styles.input, { backgroundColor: c.card, color: c.ink }];
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      {/* 저장 · 영상 넣는 중에는 끌어 닫기를 막는다 */}
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <View style={[styles.bar, { paddingTop: 12 }]}>
        <Pressable accessibilityRole="button" onPress={cancel} disabled={!!busy} hitSlop={10}>
          <Text style={[styles.barAction, { color: c.sky }]}>취소</Text>
        </Pressable>
        <Text style={[styles.barTitle, { color: c.ink }]}>
          {at.getUTCMonth() + 1}월 {at.getUTCDate()}일 {editing ? '기록 고치기' : '새 기록'}
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: inset.bottom + 32, gap: 8 }, READABLE]} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: c.muted }]}>종류</Text>
        <Chips items={SESSION_TYPES.map((t) => t.name)} value={type} onChange={setType} />

        {!rest ? (
          <>
            <Text style={[styles.label, { color: c.muted }]}>투구 수</Text>
            <TextInput value={count} onChangeText={setCount} keyboardType="number-pad" placeholder="예: 40" placeholderTextColor={c.muted} style={input} />
            <Text style={[styles.label, { color: c.muted }]}>강도</Text>
            {/* 1~10(2026-10-18 웹과 같게) — 칩 n 은 n × 10% 로 저장된다 */}
            {/* 열 칸 한 줄(웹 effort-chips.tsx) — 칸 n = n × 10% */}
            <View accessibilityRole="radiogroup" accessibilityLabel="강도" style={styles.effortRow}>
              {EFFORT_CHIPS.map((v) => {
                const on = effort === v;
                return (
                  <Pressable
                    key={v}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`강도 ${effortScaleText(v)}`}
                    onPress={() => setEffort(v)}
                    style={[styles.effortCell, { backgroundColor: on ? c.sky : c.chip }]}
                  >
                    <Text style={[TYPE.num, { fontSize: 15, color: on ? '#fff' : c.ink }]}>{effortScaleText(v)}</Text>
                  </Pressable>
                );
              })}
            </View>
            {effort != null && !(EFFORT_CHIPS as readonly number[]).includes(effort) ? (
              <Text style={{ color: c.muted, fontSize: 12 }}>지금 {effortScaleText(effort)} · 칩을 누르면 바뀌어요</Text>
            ) : null}
          </>
        ) : null}

        {!rest ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: more }}
            onPress={() => setMore((o) => !o)}
            style={({ pressed }) => [styles.fold, { borderColor: c.line }, pressed && { opacity: 0.6 }]}
          >
            <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>{more ? '접기' : '더 적기'}</Text>
            <Text style={{ color: c.muted, fontSize: 13, flex: 1 }} numberOfLines={1}>
              {more ? '' : '구속 · 만족도 · 느낀점 · 영상'}
            </Text>
            <SymbolView name={more ? 'chevron.up' : 'chevron.down'} size={13} tintColor={c.muted} />
          </Pressable>
        ) : null}

        {rest || more ? (
          <>
            {!rest ? (
                <View style={styles.pair}>
                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={[styles.label, { color: c.muted }]}>최고 구속({speedLabel(unit)})</Text>
                    <TextInput value={maxV} onChangeText={setMaxV} keyboardType="decimal-pad" placeholder="선택" placeholderTextColor={c.muted} style={input} />
                  </View>
                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={[styles.label, { color: c.muted }]}>평균 구속({speedLabel(unit)})</Text>
                    <TextInput value={avgV} onChangeText={setAvgV} keyboardType="decimal-pad" placeholder="선택" placeholderTextColor={c.muted} style={input} />
                  </View>
                </View>
            ) : null}

            {isRatedSession(type) ? (
              <>
                <Text style={[styles.label, { color: c.muted }]}>투구 만족도</Text>
                <Chips
                  items={SATISFACTION_OPTIONS.map((o) => o.label)}
                  value={satisfaction == null ? null : String(satisfaction)}
                  onChange={(v) => setSatisfaction(satisfaction === Number(v) ? null : Number(v))}
                />
                <Text style={{ color: c.muted, fontSize: 12 }}>
                  1 {SATISFACTION_ENDS.low} · {SATISFACTION_ENDS.high} 5
                </Text>
                {(
                  [
                    ['good', '좋았던 것', good],
                    ['bad', '아쉬웠던 것', bad],
                  ] as const
                ).map(([side, label, list]) => (
                  <View key={side} style={{ gap: 8 }}>
                    <Text style={[styles.label, { color: c.muted }]}>{label}</Text>
                    <View style={styles.chips}>
                      {PITCH_CUES.map((cue) => {
                        const on = list.includes(cue);
                        return (
                          <Pressable
                            key={cue}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}
                            onPress={() => toggleCue(cue, side)}
                            style={[styles.chip, { backgroundColor: on ? c.sky : c.chip }]}
                          >
                            <Text style={[styles.chipText, { color: on ? '#fff' : c.ink }]}>{cue}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            <Text style={[styles.label, { color: c.muted }]}>
              {rest ? '메모' : '특이사항 · 느낀점'}
            </Text>
            {isRatedSession(type) && (satisfaction ?? 0) >= GOOD_DAY_MIN && !memo.trim() ? (
              <Text style={{ color: c.muted, fontSize: 12 }}>잘 던진 날 남긴 메모는 다음에 던지는 날 홈에 다시 띄워 드려요.</Text>
            ) : null}
            <TextInput value={memo} onChangeText={setMemo} multiline placeholder="오늘 던진 느낌" placeholderTextColor={c.muted} style={[input, styles.memo]} />

            {!rest ? (
              <>
                <Text style={[styles.label, { color: c.muted }]}>영상(두 개까지)</Text>
                {videos.map((v) => (
                  <View key={v.path} style={[styles.videoRow, { backgroundColor: c.card }]}>
                    <Text style={{ flex: 1, color: c.ink, fontSize: 15 }}>{v.name}</Text>
                    <Pressable accessibilityRole="button" hitSlop={8} onPress={() => dropVideo(v)}>
                      <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>빼기</Text>
                    </Pressable>
                  </View>
                ))}
                {videos.length < MAX_VIDEOS ? (
                  <View style={styles.pair}>
                    <Pressable accessibilityRole="button" onPress={() => pick(true)} disabled={!!busy} style={[styles.ghost, { backgroundColor: c.chip }]}>
                      <Text style={[styles.ghostText, { color: c.ink }]}>촬영하기</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => pick(false)} disabled={!!busy} style={[styles.ghost, { backgroundColor: c.chip }]}>
                      <Text style={[styles.ghostText, { color: c.ink }]}>앨범에서</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator />
            <Text style={{ color: c.muted, fontSize: 15 }}>{busy}</Text>
          </View>
        ) : null}
        {error ? <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text> : null}
        {/* 저장 — 맨 밑 큰 단추(웹 폼과 같은 자리) */}
        <Pressable
          accessibilityRole="button"
          onPress={save}
          disabled={!!busy}
          style={({ pressed }) => [styles.save, { backgroundColor: c.sky }, (busy || pressed) && { opacity: busy ? 0.5 : 0.85 }]}
        >
          <Text style={styles.saveText}>{editing ? '고친 내용 저장' : '저장'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Chips({ items, value, onChange }: { items: readonly string[]; value: string | null; onChange: (v: string) => void }) {
  const c = usePalette();
  return (
    <View style={styles.chips}>
      {items.map((it) => {
        const on = it === value;
        return (
          <Pressable
            key={it}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(it)}
            style={[styles.chip, { backgroundColor: on ? c.sky : c.chip }]}
          >
            <Text style={[styles.chipText, { color: on ? '#fff' : c.ink }]}>{it}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  barAction: { fontSize: 17 },
  barTitle: { fontSize: 17, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', marginTop: 10 },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  memo: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  pair: { flexDirection: 'row', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '600' },
  videoRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: 12, paddingHorizontal: 14 },
  ghost: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 17, fontWeight: '600' },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  effortRow: { flexDirection: 'row', gap: 4 },
  effortCell: { flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  save: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
