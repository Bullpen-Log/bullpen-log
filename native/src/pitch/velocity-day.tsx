import * as Haptics from 'expo-haptics';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LogPrefill, PitchEdit, VelocityPitchView, VelocitySessionView } from '@/lib/velocity-meta';
import { CONFIDENCE_TEXT, PITCH_RESULTS, PITCH_TYPES, pitchTypeLabel, sessionSetupText, summarize, zoneLabel } from '@/lib/velocity-meta';
import { applyCalibration, calibrationText } from '@/lib/velocity-calibration';
import { formatSpeed, round1, speedLabel, toSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { rpc } from '~/lib/rpc';
import { usePalette, withAlpha, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';
import { isPhoneVideoPath } from './api';
import { PitchVideo, UrlVideo } from './video';

/**
 * 그날 화면의 구속 측정 칸(앱) — 웹 app/(app)/pitch-log/velocity-section.tsx 와 같은 꼴:
 * - 머리: 카메라 그림 '구속 측정' + 한 줄('공을 누르면 잰 직후처럼 영상으로 봐요. 연필로 고쳐요').
 * - 세션마다 테두리 판: 시각 · 카메라/영상 파일 · 투수 뒤 · 네트, 'N구 · 최고 · 평균 · 스트라이크 %', 화각 · 보정, 지우기(휴지통).
 * - 공 줄: 차례 · 큰 구속 · 구종(S/B · 메모) · 코스 · 신뢰도 · 릴리스 · 건, 작은 존 그림, 영상이 있으면 ▶ 동그라미.
 *   영상 있는 공을 누르면 결과 창(영상 · 큰 구속 · 구종 칩 — 누르면 바로 저장), 없으면 고치기 창(구종 · 코스 · 결과 · 메모 · 지우기).
 * 자료는 app.loadAppVelocityDay(웹과 같은 세션 · 서명 주소), 고치기 · 지우기는 웹과 같은 velocity.* 서버 동작.
 * 아직 투구 기록으로 안 남긴 측정이 있으면 '측정한 N구 기록 남기기' → 기록 폼을 측정값으로 채워 연다(저장하면 그 세션을 잇는다).
 */
type Loaded = { sessions: VelocitySessionView[]; prefill: LogPrefill | null };
const days = new Map<string, Loaded>();
export const resetVelocityDayCache = () => days.clear();

/** 그날 구속 측정(세션 · 공 · 클립 주소) — 그날 화면 구속 칸 · 홈 그날 칸 영상(웹 velocity-clips)이 같이 쓴다. key 가 바뀌면 다시 받는다 */
export function useVelocityDay(date: string, key: unknown = 0): Loaded | null {
  const [state, setState] = useState<{ date: string; data: Loaded | null }>(() => ({ date, data: days.get(date) ?? null }));
  useEffect(() => {
    let alive = true;
    rpc<({ ok: true } & Loaded) | { ok: false; error: string }>('app.loadAppVelocityDay', date).then(
      (r) => {
        if (!r.ok || !alive) return;
        days.set(date, r);
        setState({ date, data: r });
      },
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [date, key]);
  return state.date === date ? (state.data ?? days.get(date) ?? null) : (days.get(date) ?? null);
}

type Result = { ok: true } | { ok: false; error: string };
const pad = (n: number) => String(n).padStart(2, '0');
const releaseOf = (s: VelocitySessionView) => (kmh: number) =>
  s.calPairs > 0 ? applyCalibration(kmh, { scale: s.calScale, offset: s.calOffset, n: s.calPairs }) : kmh;
const editOf = (p: VelocityPitchView): PitchEdit => ({ pitchType: p.pitchType, zone: p.zone, result: p.result, gunKmh: p.gunKmh, memo: p.memo });

export function VelocityDay({ date, logCount }: { date: string; logCount: number }) {
  const c = usePalette();
  const unit = usePrefs().speed;
  /* 기록 수가 바뀌면(측정값으로 남겼으면) 다시 받는다 — '남기기' 줄이 걷히게. 고치거나 지우면 rev 로 다시 */
  const [rev, setRev] = useState(0);
  const data = useVelocityDay(date, `${logCount}:${rev}`);
  const [viewing, setViewing] = useState<VelocityPitchView | null>(null);
  const [editing, setEditing] = useState<VelocityPitchView | null>(null);
  if (!data || data.sessions.length === 0) return null;
  const pf = data.prefill;
  const hasClips = data.sessions.some((s) => s.pitches.some((p) => p.clip));
  const speedNum = (kmh: number) => round1(toSpeed(kmh, unit));
  const reload = () => setRev((n) => n + 1);
  const sessionOf = (p: VelocityPitchView) => data.sessions.find((s) => s.pitches.some((q) => q.id === p.id));

  const removeSession = (s: VelocitySessionView) =>
    Alert.alert('이 측정 세션을 지울까요?', `공 ${s.pitches.length}개와 영상이 함께 지워져요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          const r = await rpc<Result>('velocity.deleteVelocitySession', s.id).catch(() => ({ ok: false as const, error: '신호가 약해 서버에 닿지 못했어요.' }));
          if (!r.ok) return Alert.alert('지우지 못했어요', r.error);
          toast('지웠어요');
          reload();
        },
      },
    ]);

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="camera" size={16} color={c.sky} />
          <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>구속 측정</Text>
        </View>
        <Text style={{ flex: 1, color: c.muted, fontSize: 12 }}>
          {hasClips ? '공을 누르면 잰 직후처럼 영상으로 봐요. 연필로 고쳐요' : '줄을 누르면 구종 · 코스 · 결과를 고쳐요'}
        </Text>
      </View>
      {data.sessions.map((s) => {
        const sum = summarize(s.pitches);
        const at = new Date(s.createdAt);
        const cal = calibrationText({ scale: s.calScale, offset: s.calOffset, n: s.calPairs });
        const release = releaseOf(s);
        return (
          <View key={s.id} style={[styles.session, { backgroundColor: c.card, borderColor: c.line }]}>
            <View style={[styles.sessionHead, { borderBottomColor: c.line }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: c.muted, fontSize: 12 }}>
                  <Text style={{ color: c.ink, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                    {pad(at.getHours())}:{pad(at.getMinutes())}
                  </Text>
                  {'  '}
                  {s.source === 'file' ? '영상 파일' : '카메라'} · {sessionSetupText(s)}
                  {s.sessionType ? ` · ${s.sessionType}` : ''}
                </Text>
                {sum ? (
                  <Text style={{ color: c.muted, fontSize: 12 }}>
                    {s.pitches.length}구 · 최고 <Text style={{ color: c.ink, fontWeight: '700' }}>{formatSpeed(sum.max, unit)}</Text> · 평균{' '}
                    <Text style={{ color: c.ink, fontWeight: '700' }}>{formatSpeed(sum.avg, unit)}</Text>
                    {sum.strikeRate != null ? ` · 스트라이크 ${sum.strikeRate}%` : ''}
                    {sum.spreadCm != null ? ` · 릴리스 흩어짐 ${sum.spreadCm}cm` : ''}
                  </Text>
                ) : null}
                <Text style={{ color: c.muted, fontSize: 12 }}>
                  화각 {s.fovDeg}° · {cal ? `보정 ${cal}` : '보정 없음'}
                </Text>
              </View>
              <Press accessibilityRole="button" accessibilityLabel="이 세션 지우기" onPress={() => removeSession(s)} style={styles.trash}>
                <Icon name="trash2" size={15} color={c.muted} />
              </Press>
            </View>
            {s.pitches.map((p, i) => (
              <View key={p.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                <Press
                  accessibilityRole="button"
                  accessibilityLabel={`${p.seq}번째 공 ${formatSpeed(p.kmh, unit)}${p.clip ? ', 영상 보기' : ', 고치기'}`}
                  onPress={() => (p.clip ? setViewing(p) : setEditing(p))}
                  style={styles.rowMain}
                >
                  <Text style={{ width: 20, color: c.muted, fontSize: 12, fontVariant: ['tabular-nums'] }}>{p.seq}</Text>
                  <Text style={{ width: 56, color: c.ink, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.4 }}>{speedNum(p.kmh)}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>
                      {pitchTypeLabel(p.pitchType) ?? <Text style={{ color: c.muted }}>구종 —</Text>}
                      {p.result === 'strike' ? <Text style={{ color: c.ok }}> S</Text> : p.result === 'ball' ? <Text style={{ color: c.warn }}> B</Text> : null}
                      {p.memo ? <Text style={{ color: c.muted, fontWeight: '400' }}>  {p.memo}</Text> : null}
                    </Text>
                    <Text style={{ color: c.muted, fontSize: 12, lineHeight: 16 }}>
                      {zoneLabel(p.zone) ?? '코스 —'} · {CONFIDENCE_TEXT[p.confidence]}
                      {p.releaseKmh != null ? ` · 릴리스 추정 ${speedNum(release(p.releaseKmh))}` : ''}
                      {p.gunKmh != null ? ` · 건 ${speedNum(p.gunKmh)}` : ''}
                    </Text>
                  </View>
                  <ZoneGrid value={p.zone} c={c} />
                  {!p.clip ? <Icon name="chevron-right" size={16} color={c.lineStrong} /> : null}
                </Press>
                {p.clip ? (
                  <Press accessibilityRole="button" accessibilityLabel={`${p.seq}번째 공 영상 보기`} onPress={() => setViewing(p)} style={styles.playBtn}>
                    <View style={[styles.playCircle, { backgroundColor: c.sky }]}>
                      <Icon name="play" size={18} color="#fff" fill="#fff" />
                    </View>
                  </Press>
                ) : null}
              </View>
            ))}
          </View>
        );
      })}
      {pf ? (
        <Press
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: '/pitch/edit' as Href as never,
              params: {
                date,
                vsids: JSON.stringify(pf.sessionIds),
                vtype: pf.sessionType ?? '',
                vcount: String(pf.pitchCount),
                vmax: pf.maxVelocity != null ? String(pf.maxVelocity) : '',
                vavg: pf.avgVelocity != null ? String(pf.avgVelocity) : '',
                veffort: pf.effortPct != null ? String(pf.effortPct) : '',
              },
            })
          }
          style={[styles.prefill, { backgroundColor: c.sky }]}
        >
          <Text style={styles.prefillText}>측정한 {pf.pitchCount}구 기록 남기기</Text>
        </Press>
      ) : null}
      {pf?.missed ? (
        <Text style={{ color: c.warn, fontSize: 12 }}>못 잰 공 {pf.missed}개는 빠졌어요. 실제로 던진 수가 다르면 기록에서 고쳐 주세요.</Text>
      ) : null}
      {pf ? <Text style={{ color: c.muted, fontSize: 12 }}>기록으로 남기기 전에는 이 공이 팔 부하 · 휴식에 안 들어가요.</Text> : null}

      {viewing ? (
        <ResultSheet
          pitch={viewing}
          session={sessionOf(viewing)}
          onClose={() => setViewing(null)}
          onEdit={() => {
            const p = viewing;
            setViewing(null);
            setTimeout(() => setEditing(p), 350);
          }}
          onSaved={reload}
        />
      ) : null}
      {editing ? <EditSheet pitch={editing} onClose={() => setEditing(null)} onSaved={reload} /> : null}
    </View>
  );
}

/** 작은 존 그림(웹 ZoneGrid sm) — 3×3, 고른 칸만 하늘 */
function ZoneGrid({ value, c, onChange, big = false }: { value: number | null; c: Palette; onChange?: (z: number | null) => void; big?: boolean }) {
  const cell = big ? 44 : 10;
  return (
    <View
      accessibilityRole={onChange ? 'radiogroup' : 'image'}
      accessibilityLabel={onChange ? '코스' : zoneLabel(value) ? `코스 ${zoneLabel(value)}` : '코스 없음'}
      style={[styles.zone, { width: cell * 3 + 2 * 2 + 4 + 4, borderColor: withAlpha(c.ink, 0.2), backgroundColor: c.line }]}
    >
      {Array.from({ length: 9 }, (_, i) => {
        const z = i + 1;
        const on = value === z;
        const box = { width: cell, height: cell, borderRadius: big ? 6 : 2, backgroundColor: on ? c.sky : c.card };
        return onChange ? (
          <Press
            key={z}
            select
            selected={on}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={zoneLabel(z) ?? String(z)}
            onPress={() => onChange(on ? null : z)}
            style={box}
          />
        ) : (
          <View key={z} style={box} />
        );
      })}
    </View>
  );
}

/** 공 결과 창 — 웹 PitchResultDialog: 영상(던진 시각 조금 앞부터) · 큰 구속 · ± · 신뢰도 · 구종 칩(누르면 바로 저장) · 고치기 */
function ResultSheet({
  pitch,
  session,
  onClose,
  onEdit,
  onSaved,
}: {
  pitch: VelocityPitchView;
  session: VelocitySessionView | undefined;
  onClose: () => void;
  onEdit: () => void;
  onSaved: () => void;
}) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const unit = usePrefs().speed;
  const [type, setType] = useState(pitch.pitchType);
  const speedNum = (kmh: number) => round1(toSpeed(kmh, unit));
  const rel = session ? releaseOf(session) : (k: number) => k;
  const clip = pitch.clip!;
  const start = clip.eventSec != null ? Math.max(0, clip.eventSec - 0.6) : null;
  /* 서버에 저장된 마지막 구종 · 마지막으로 누른 차례 — 늦게 실패한 앞 누름이 뒤에 고른 것을 되돌리지 않게 */
  const confirmed = useRef(pitch.pitchType);
  const turn = useRef(0);
  const pick = async (key: string | null) => {
    const mine = ++turn.current;
    setType(key);
    void Haptics.selectionAsync();
    const r = await rpc<Result>('velocity.updateVelocityPitch', pitch.id, { ...editOf(pitch), pitchType: key }).catch(() => ({ ok: false as const, error: '신호가 약해 서버에 닿지 못했어요.' }));
    if (r.ok) confirmed.current = key;
    if (mine !== turn.current) return;
    if (!r.ok) {
      setType(confirmed.current);
      return Alert.alert('저장하지 못했어요', r.error);
    }
    onSaved();
  };
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <View style={styles.sheetBar}>
          <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>{pitch.seq}번째 공</Text>
          <Press accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={[styles.close, { backgroundColor: c.chip }]}>
            <Icon name="x" size={18} color={c.muted} />
          </Press>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: inset.bottom + 24 }}>
          {isPhoneVideoPath(clip.url) ? <PitchVideo path={clip.url} /> : <UrlVideo uri={clip.url} start={start} autoPlay />}
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ color: c.ink, fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1.5 }}>
              {speedNum(pitch.kmh)}
              <Text style={{ color: c.muted, fontSize: 17, fontWeight: '600' }}> {speedLabel(unit)}</Text>
            </Text>
            <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>
              ± {speedNum(pitch.errorKmh)} · {CONFIDENCE_TEXT[pitch.confidence]}
              {pitch.releaseKmh != null ? ` · 릴리스 ${speedNum(rel(pitch.releaseKmh))}` : ''}
              {pitch.gunKmh != null ? ` · 건 ${speedNum(pitch.gunKmh)}` : ''}
            </Text>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600' }}>구종</Text>
            <TypeChips value={type} onPick={(k) => void pick(k)} c={c} />
          </View>
          <Press accessibilityRole="button" onPress={onEdit} style={[styles.ghost, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
            <Icon name="pencil" size={16} color={c.ink} />
            <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>코스 · 결과 · 메모 고치기</Text>
          </Press>
        </ScrollView>
      </View>
    </Modal>
  );
}

function TypeChips({ value, onPick, c }: { value: string | null; onPick: (k: string | null) => void; c: Palette }) {
  return (
    <View style={styles.chips}>
      {PITCH_TYPES.map((t) => {
        const on = value === t.key;
        return (
          <Press
            key={t.key}
            select
            selected={on}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onPick(on ? null : t.key)}
            style={[styles.chip, on ? { borderColor: c.sky, backgroundColor: withAlpha(c.sky, 0.1) } : { backgroundColor: withAlpha(c.ink, 0.06) }]}
          >
            <Text style={{ color: on ? c.sky : withAlpha(c.ink, 0.8), fontSize: 15, fontWeight: on ? '600' : '400' }}>{t.label}</Text>
          </Press>
        );
      })}
    </View>
  );
}

/** 공 고치기 창 — 웹 PitchEditorFields(구종 · 코스 · 결과 · 메모) + 지우기 */
function EditSheet({ pitch, onClose, onSaved }: { pitch: VelocityPitchView; onClose: () => void; onSaved: () => void }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const unit = usePrefs().speed;
  const [draft, setDraft] = useState<PitchEdit>(() => editOf(pitch));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<PitchEdit>) => setDraft((d) => ({ ...d, ...patch }));
  const save = async () => {
    if (busy) return;
    setBusy(true);
    const r = await rpc<Result>('velocity.updateVelocityPitch', pitch.id, draft).catch(() => ({ ok: false as const, error: '신호가 약해 서버에 닿지 못했어요.' }));
    setBusy(false);
    if (!r.ok) return Alert.alert('저장하지 못했어요', r.error);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast('저장했어요');
    onSaved();
    onClose();
  };
  const remove = () =>
    Alert.alert('이 공을 지울까요?', '영상도 함께 지워져요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          const r = await rpc<Result>('velocity.deleteVelocityPitch', pitch.id).catch(() => ({ ok: false as const, error: '신호가 약해 서버에 닿지 못했어요.' }));
          if (!r.ok) return Alert.alert('지우지 못했어요', r.error);
          toast('지웠어요');
          onSaved();
          onClose();
        },
      },
    ]);
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <View style={styles.sheetBar}>
          <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>
            {pitch.seq}번째 공 · {formatSpeed(pitch.kmh, unit)}
          </Text>
          <Press accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={[styles.close, { backgroundColor: c.chip }]}>
            <Icon name="x" size={18} color={c.muted} />
          </Press>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: inset.bottom + 24 }}>
          <View style={{ gap: 8 }}>
            <Text style={[styles.label, { color: c.muted }]}>구종</Text>
            <TypeChips value={draft.pitchType} onPick={(k) => set({ pitchType: k })} c={c} />
          </View>
          <View style={{ gap: 8 }}>
            <Text style={[styles.label, { color: c.muted }]}>
              코스 <Text style={{ fontWeight: '400' }}>{zoneLabel(draft.zone) ?? '투수가 보는 대로 · 누르면 골라요'}</Text>
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <ZoneGrid value={draft.zone} onChange={(zone) => set({ zone })} big c={c} />
              <View style={{ gap: 8 }}>
                {PITCH_RESULTS.map((r) => {
                  const on = draft.result === r.key;
                  const tone = r.key === 'strike' ? c.ok : c.warn;
                  return (
                    <Press
                      key={r.key}
                      select
                      selected={on}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => set({ result: on ? null : r.key })}
                      style={[styles.chip, on ? { borderColor: tone, backgroundColor: withAlpha(tone, 0.1) } : { backgroundColor: withAlpha(c.ink, 0.06) }]}
                    >
                      <Text style={{ color: on ? tone : withAlpha(c.ink, 0.8), fontSize: 15, fontWeight: on ? '600' : '400' }}>{r.label}</Text>
                    </Press>
                  );
                })}
              </View>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={[styles.label, { color: c.muted }]}>메모</Text>
            <TextInput
              value={draft.memo ?? ''}
              onChangeText={(t) => set({ memo: t || null })}
              maxLength={500}
              placeholder="예) 팔이 늦게 나옴"
              placeholderTextColor={withAlpha(c.muted, 0.6)}
              style={[styles.input, { backgroundColor: withAlpha(c.ink, 0.05), color: c.ink }]}
            />
          </View>
          <Press accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[styles.prefill, { backgroundColor: c.sky }, busy && { opacity: 0.5 }]}>
            <Text style={styles.prefillText}>{busy ? '저장 중…' : '저장'}</Text>
          </Press>
          <Press accessibilityRole="button" onPress={remove} style={styles.removeBtn}>
            <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>이 공 지우기</Text>
          </Press>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8, rowGap: 2 },
  session: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  sessionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  trash: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  rowMain: { flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 16, paddingRight: 8 },
  playBtn: { width: 56, alignItems: 'center', justifyContent: 'center', paddingRight: 4 },
  playCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', paddingLeft: 2 },
  zone: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, padding: 2, borderRadius: 8, borderWidth: 2 },
  prefill: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  prefillText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  ghost: { flexDirection: 'row', gap: 6, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '600' },
  input: { minHeight: 48, borderRadius: 16, paddingHorizontal: 16, fontSize: 17 },
  removeBtn: { alignSelf: 'center', minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
});
