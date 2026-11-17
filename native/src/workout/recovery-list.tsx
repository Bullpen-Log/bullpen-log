import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { AMOUNT_LIMITS } from '@/lib/exercise-meta';
import { formatWeight, fromWeight, round1, toWeight, type WeightUnit } from '@/lib/units';
import { resolveRecordingContract, type RecordingContract } from '@/lib/workout/load/contract';
import { describeSet, heldReasonOf, ownerGroupOf, recoveryActionsOf, recoveryEditOf } from '@/lib/workout/load/describe';
import { overridesFor } from '@/lib/workout/load/overrides';
import { LOAD_PROTOCOL } from '@/lib/workout/load/protocol';
import { normalizeSetLoad } from '@/lib/workout/load/recorded';
import type { LibraryExercise } from '@/lib/library-load';
import { rpc } from '~/lib/rpc';
import { usePalette, type Palette } from '~/lib/ui';
import { useWeightUnit } from '~/lib/weight-unit';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { LoadExtras, buildSetLoad, kgLabel, loadDraftOfSet, showsKg, type LoadDraft } from './load-input';
import { drainOutbox, extraKey, outbox, outboxOwner, quarantineKey, subscribeOutboxOwner, type PendingSet } from './outbox';
import { Sheet } from './sheets';

/**
 * EX-LOAD01-R1 — 못 보낸 운동 세트 복구(앱 화면 app/workout-recovery.tsx 의 몸통). 웹 components/load/recovery-list.tsx 와 같은 규칙:
 *   - 내 세트: 날짜 · 운동 · 그 판의 상태(읽기만 — workout.finishStatus) · 원래 무게 기록(밴드 · 섞임 · 양손 다른 무게 · 기구 이름 그대로) · 횟수 ·
 *     붙든 까닭과 [다시 보내기] [고치기] [버리기]. 다시 보내기는 같은 판 · 번호 · 시각으로만(새 운동을 만들지 않는다). 또 받지 않으면 원래 값이
 *     다시 붙들린다.
 *   - 계정을 모르는 옛 세트: 수만(내 기록으로 보이지 않고 보내지 않는다). [내 기록으로 확인하기]는 세트 내용 없이 판 번호만 서버에 묻고
 *     (workout.finishStatus — 읽기만, 이 계정의 판이 아니면 'missing'), 이 계정의 판으로 확인된 줄에만 계정을 붙인다(outbox.bindOwner).
 *     이 기기에서 버릴 수 있다.
 *   - 다른 계정의 세트: 수만. 보내기 · 고치기 · 버리기 없음 — 그 계정으로 로그인하면 보낸다.
 *   - 읽을 수 없는 줄 · 깨진 저장 값: 수만, 보내지 않는다. 사람이 버릴 때만 지운다.
 * 운동 이름 · 기록 방식은 라이브러리 목록(읽기만 — app-library.loadAppExerciseLibrary)에서 찾는다. 못 읽으면 '운동'으로 보이고 고치기는 횟수 · 시간만.
 * 그 판에 얼린 기록 계약을 앱이 갖고 있지 않아 라이브러리 장비로 푼 계약은 참고용이다 — 서버가 얼린 계약으로 다시 검사하고, 받지 않으면 다시 붙든다.
 *
 * 계정: 지금 계정을 듣는다(subscribeOutboxOwner) — 화면이 떠 있는 채로 계정이 바뀌면 고치기 창 · 맥락을 걷고 새 계정으로 다시 고른다. 동작은 누르는
 * 순간에도 대기열이 계정을 다시 본다(release · correct · discardOwned · bindOwner 에 화면의 계정을 넘김 — 다르면 아무것도 바꾸지 않는다).
 * 고치기는 줄의 계정을 그대로 둔다. 새 판(약속 · 해석기 · 카탈로그 · 모르는 칸)의 줄은 고치기를 내놓지 않는다(recoveryEditOf) — 다시 보내기는
 * 원래 값 그대로, 버리기는 확인을 받고.
 */
type Ctx = {
  titles: Record<string, { title: string; contract: RecordingContract }>;
  status: Record<string, 'ACTIVE' | 'ABANDONED' | 'FINISHED' | 'missing'>;
  failed: boolean;
};
const STATUS_WORD: Record<string, string> = { ACTIVE: '운동 중', FINISHED: '마친 운동', ABANDONED: '저절로 닫힌 운동', missing: '이 계정의 운동 기록에서 찾지 못했어요' };
const keyOf = (p: { sessionId: string; exerciseId: string; setNo: number }) => `${p.sessionId}|${p.exerciseId}|${p.setNo}`;

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '시각 모름';
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function RecoveryList() {
  const c = usePalette();
  const unit = useWeightUnit();
  const owner = useSyncExternalStore(subscribeOutboxOwner, outboxOwner);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void outbox.ready().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  const rows = useSyncExternalStore(outbox.subscribe, outbox.snapshot);
  const extras = useSyncExternalStore(outbox.subscribe, outbox.extras);

  const mine = useMemo(() => rows.filter((p) => ownerGroupOf(p, owner) === 'mine').sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)), [rows, owner]);
  const unknownRows = useMemo(() => rows.filter((p) => ownerGroupOf(p, owner) === 'unknown'), [rows, owner]);
  const otherCount = useMemo(() => rows.filter((p) => ownerGroupOf(p, owner) === 'other').length, [rows, owner]);

  /* 맥락 — 읽기만. 못 읽어도 줄은 그대로 */
  const sessionIds = useMemo(() => [...new Set(mine.map((p) => p.sessionId))].sort().slice(0, 20), [mine]);
  const sessionKey = sessionIds.join(',');
  const [ctx, setCtx] = useState<Ctx | null>(null);
  useEffect(() => {
    if (!sessionKey) return;
    let alive = true;
    void (async () => {
      const titles: Ctx['titles'] = {};
      let failed = false;
      try {
        const lib = await rpc<{ ok: true; exercises: LibraryExercise[] } | { ok: false }>('app-library.loadAppExerciseLibrary');
        if (lib.ok)
          for (const ex of lib.exercises) {
            const r = ex as LibraryExercise & { reps?: number | null; holdSeconds?: number | null };
            titles[ex.id] = {
              title: ex.title,
              contract: resolveRecordingContract({
                exerciseId: ex.id,
                equipment: ex.equipment,
                category: ex.category,
                isHold: r.holdSeconds != null && r.reps == null,
                overrides: overridesFor(ex.id),
              }),
            };
          }
        else failed = true;
      } catch {
        failed = true;
      }
      const status: Ctx['status'] = {};
      for (const id of sessionKey.split(',')) {
        try {
          const s = await rpc<{ state: 'ACTIVE' | 'ABANDONED' | 'missing' | 'FINISHED' }>('workout.finishStatus', { sessionId: id });
          status[id] = s.state;
        } catch {
          failed = true;
        }
      }
      if (alive) setCtx({ titles, status, failed });
    })();
    return () => {
      alive = false;
    };
  }, [sessionKey]);

  const [busy, setBusy] = useState<string | null>(null);
  /* 고치는 줄과 창을 연 계정 — 계정이 바뀌면 걷는다(아래) */
  const [editing, setEditing] = useState<{ row: PendingSet; owner: string } | null>(null);
  const [seenOwner, setSeenOwner] = useState(owner);
  if (seenOwner !== owner) {
    setSeenOwner(owner);
    setEditing(null);
    setCtx(null);
  }
  const changed = () => Alert.alert('계정이 바뀌었거나 이미 없는 세트예요', '아무것도 바꾸지 않았어요. 목록을 다시 확인해 주세요.');
  const titleOf = useCallback((p: PendingSet) => ctx?.titles[p.exerciseId]?.title ?? '운동', [ctx]);
  const contractOf = useCallback((p: PendingSet) => ctx?.titles[p.exerciseId]?.contract ?? null, [ctx]);
  const fmtKg = (kg: number) => formatWeight(kg, unit) ?? `${kg}kg`;

  const sendNow = async (p: PendingSet) => {
    setBusy(keyOf(p));
    let r: 'done' | 'offline' | 'busy' = 'busy';
    try {
      r = await drainOutbox((x) => rpc('workout.logSet', x), () => undefined);
    } finally {
      setBusy(null);
    }
    const now = outbox.snapshot().find((x) => keyOf(x) === keyOf(p));
    if (!now) Alert.alert('보냈어요');
    else if (now.held) Alert.alert(heldReasonOf(now.held)?.title ?? '보내지 못했어요', heldReasonOf(now.held)?.message ?? undefined);
    else Alert.alert(r === 'offline' ? '신호가 돌아오면 다시 보내요' : '잠시 뒤에 다시 보내요');
  };
  const retry = (p: PendingSet) => {
    if (outbox.release(p, owner)) void sendNow(p);
    else changed();
  };
  /* 계정을 모르는 줄 — 판 번호만 물어(세트 내용은 보내지 않는다) 이 계정의 판으로 확인된 줄에만 계정을 붙인다 */
  const [checking, setChecking] = useState(false);
  const claim = async () => {
    /* 누른 때의 계정 — 서버에 묻는 사이 계정이 바뀌면 붙이지 않는다(bindOwner 가 지금 계정과 견준다) */
    const who = owner;
    if (!who) return;
    setChecking(true);
    const confirmed = new Set<string>();
    let failed = false;
    try {
      for (const id of [...new Set(unknownRows.map((p) => p.sessionId))].slice(0, 20)) {
        try {
          const st = await rpc<{ state: 'ACTIVE' | 'ABANDONED' | 'missing' | 'FINISHED' }>('workout.finishStatus', { sessionId: id });
          if (st.state !== 'missing') confirmed.add(id);
        } catch {
          failed = true;
        }
      }
    } finally {
      setChecking(false);
    }
    let bound = 0;
    if (outboxOwner() !== who) return changed();
    for (const p of unknownRows) if (confirmed.has(p.sessionId) && outbox.bindOwner(p, who)) bound++;
    Alert.alert(
      bound ? `${bound}개를 이 계정의 세트로 확인했어요` : failed ? '지금 확인하지 못했어요' : '이 계정의 운동 기록에서 찾지 못했어요',
      failed && !bound ? '신호가 돌아오면 다시 눌러 주세요.' : undefined
    );
  };
  const confirmDiscard = (title: string, onYes: () => void) =>
    Alert.alert(title, '이 기기에서만 지워요. 서버에 이미 들어간 기록은 그대로예요. 지운 뒤에는 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '버리기', style: 'destructive', onPress: onYes },
    ]);

  if (!ready) return <ActivityIndicator style={{ paddingVertical: 32 }} />;
  const nothing = !mine.length && !unknownRows.length && !otherCount && !extras.malformed.length && !extras.corrupt.length;

  return (
    <View style={{ gap: 16 }}>
      {nothing ? <Text style={[st.body, { color: c.muted }]}>이 기기에 못 보낸 운동 세트가 없어요.</Text> : null}

      {mine.length ? (
        <View style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={[st.section, { color: c.ink }]}>
            내 세트 {mine.length}개
          </Text>
          {ctx?.failed ? <Text style={[st.small, { color: c.muted }]}>운동 이름이나 운동 상태를 다 불러오지 못했어요. 세트는 그대로 있어요.</Text> : null}
          {mine.map((p) => {
            const k = keyOf(p);
            const reason = heldReasonOf(p.held);
            const status = ctx?.status[p.sessionId];
            const acts = recoveryActionsOf(p, owner);
            return (
              <View key={k} style={[st.card, { backgroundColor: c.card, boxShadow: c.float }]}>
                <Text style={[st.bodyBold, { color: c.ink }]}>
                  {titleOf(p)} · {p.setNo}번 세트
                </Text>
                <Text style={[st.small, { color: c.muted }]}>
                  {when(p.recordedAt)}에 남김{status ? ` · ${STATUS_WORD[status] ?? ''}` : ''}
                </Text>
                <Text style={[st.body, { color: c.ink }]}>{describeSet(p, { contract: contractOf(p), fmtKg })}</Text>
                {reason ? (
                  <View style={[st.reason, { backgroundColor: c.warnBg }]}>
                    <Icon name="circle-alert" size={16} color={c.warn} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[st.smallBold, { color: c.ink }]}>{reason.title}</Text>
                      {reason.message ? <Text style={[st.small, { color: c.muted }]}>{reason.message}</Text> : null}
                    </View>
                  </View>
                ) : (
                  <Text style={[st.small, { color: c.muted }]}>아직 서버로 가지 않았어요</Text>
                )}
                {acts.readOnlyReason ? <Text style={[st.small, { color: c.muted }]}>{acts.readOnlyReason}</Text> : null}
                <View style={st.actions}>
                  <Press accessibilityRole="button" disabled={busy != null} onPress={() => (p.held ? retry(p) : void sendNow(p))} style={[st.pill, { backgroundColor: c.action }]}>
                    {busy === k ? <ActivityIndicator color={c.onAction} /> : <Icon name="refresh-cw" size={16} color={c.onAction} />}
                    <Text style={[st.smallBold, { color: c.onAction }]}>{busy === k ? '보내는 중' : p.held ? '다시 보내기' : '지금 보내기'}</Text>
                  </Press>
                  {acts.correct && owner ? (
                    <Press accessibilityRole="button" disabled={busy != null} onPress={() => setEditing({ row: p, owner })} style={[st.pill, { backgroundColor: c.chip }]}>
                      <Icon name="pencil" size={16} color={c.ink} />
                      <Text style={[st.smallBold, { color: c.ink }]}>고치기</Text>
                    </Press>
                  ) : null}
                  <Press
                    accessibilityRole="button"
                    disabled={busy != null}
                    onPress={() => confirmDiscard('이 세트를 버릴까요?', () => (outbox.discardOwned(p, owner, owner) ? undefined : changed()))}
                    style={[st.pill, { backgroundColor: c.danger + '14' }]}
                  >
                    <Icon name="trash2" size={16} color={c.danger} />
                    <Text style={[st.smallBold, { color: c.danger }]}>버리기</Text>
                  </Press>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {unknownRows.length ? (
        <View style={[st.box, { backgroundColor: c.chip }]}>
          <Text style={[st.bodyBold, { color: c.ink }]}>어느 계정 것인지 모르는 세트 {unknownRows.length}개</Text>
          <Text style={[st.small, { color: c.muted }]}>
            예전 앱이 계정 표시 없이 남긴 세트예요. 이 계정의 기록으로 보이지 않고 보내지도 않아요. 확인하기를 누르면 세트 내용은 보내지 않고 운동 번호만 서버에
            물어, 이 계정의 운동으로 확인된 것만 내 세트로 옮겨요.
          </Text>
          <Press accessibilityRole="button" disabled={checking} onPress={() => void claim()} style={[st.pill, { backgroundColor: c.action, alignSelf: 'flex-start' }]}>
            {checking ? <ActivityIndicator color={c.onAction} /> : null}
            <Text style={[st.smallBold, { color: c.onAction }]}>{checking ? '확인하는 중' : '내 기록으로 확인하기'}</Text>
          </Press>
          <Press
            accessibilityRole="button"
            onPress={() => confirmDiscard(`계정을 모르는 세트 ${unknownRows.length}개를 버릴까요?`, () => unknownRows.forEach((p) => outbox.discardOwned(p, null, owner)))}
            style={st.inlineBtn}
          >
            <Text style={[st.smallBold, { color: c.danger }]}>이 기기에서 버리기</Text>
          </Press>
        </View>
      ) : null}

      {otherCount ? (
        <View style={[st.box, { backgroundColor: c.chip }]}>
          <Text style={[st.bodyBold, { color: c.ink }]}>다른 계정의 세트 {otherCount}개</Text>
          <Text style={[st.small, { color: c.muted }]}>이 기기에서 다른 계정으로 남긴 세트예요. 그 계정으로 로그인하면 보내요. 여기서는 보내거나 고치거나 버릴 수 없어요.</Text>
        </View>
      ) : null}

      {extras.malformed.length || extras.corrupt.length ? (
        <View style={[st.box, { backgroundColor: c.chip }]}>
          <Text style={[st.bodyBold, { color: c.ink }]}>읽을 수 없는 기록 {extras.malformed.length + extras.corrupt.length}개</Text>
          <Text style={[st.small, { color: c.muted }]}>이 앱이 읽지 못하는 모양으로 저장된 기록이에요. 보내지 않고 그대로 두었어요. 앱을 업데이트하면 다시 읽을 수 있을지도 몰라요.</Text>
          {extras.malformed.length ? (
            <Press
              accessibilityRole="button"
              onPress={() => confirmDiscard(`읽을 수 없는 줄 ${extras.malformed.length}개를 버릴까요?`, () => [...extras.malformed].forEach((v) => outbox.discardMalformed(extraKey(v))))}
              style={st.inlineBtn}
            >
              <Text style={[st.smallBold, { color: c.danger }]}>읽을 수 없는 줄 {extras.malformed.length}개 버리기</Text>
            </Press>
          ) : null}
          {extras.corrupt.length ? (
            <Press
              accessibilityRole="button"
              onPress={() =>
                confirmDiscard(`깨진 저장 값 ${extras.corrupt.length}개를 버릴까요?`, () => {
                  void (async () => {
                    for (const q of [...extras.corrupt]) await outbox.discardCorrupt(quarantineKey(q));
                  })();
                })
              }
              style={st.inlineBtn}
            >
              <Text style={[st.smallBold, { color: c.danger }]}>깨진 저장 값 {extras.corrupt.length}개 버리기</Text>
            </Press>
          ) : null}
        </View>
      ) : null}

      {editing && editing.owner === owner ? (
        <RecoveryEditor
          row={editing.row}
          title={titleOf(editing.row)}
          contract={contractOf(editing.row)}
          owner={editing.owner}
          unit={unit}
          c={c}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            const opened = editing;
            setEditing(null);
            /* 창을 연 계정 · 지금 계정 · 줄의 계정이 같을 때만 바꾼다 — 줄의 계정은 그대로(지금 계정으로 새로 찍지 않는다) */
            if (!outbox.correct(opened.row, next, opened.owner)) return changed();
            void sendNow(next);
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * 못 보낸 세트 하나 고치기 — 같은 세트(판 · 운동 · 번호) · 같은 누른 시각 · 같은 계정으로 다시 담는다(outbox.correct — 붙든 표가 풀린다).
 * 이 앱이 모두 아는 줄만 연다(recoveryEditOf) — 아니면 고치지 않고 까닭만 보인다. 기록 계약을 알면 운동 화면과
 * 같은 장비 칸(LoadExtras — 읽기만 쓴다)을 내고 서버와 같은 정규화로 먼저 거른다. 모르면 횟수 · 시간만 고치고 무게 기록은 그대로 둔다.
 */
function RecoveryEditor({
  row,
  title,
  contract,
  owner,
  unit,
  c,
  onSave,
  onClose,
}: {
  row: PendingSet;
  title: string;
  contract: RecordingContract | null;
  owner: string;
  unit: WeightUnit;
  c: Palette;
  onSave: (next: PendingSet) => void;
  onClose: () => void;
}) {
  const isHold = row.holdSeconds != null && row.reps == null;
  const structured = row.load != null;
  const [amount, setAmount] = useState(String((isHold ? row.holdSeconds : row.reps) ?? ''));
  const [kgText, setKgText] = useState(row.weightKg != null ? String(round1(toWeight(row.weightKg, unit))) : '');
  const [draft, setDraft] = useState<LoadDraft>(() => loadDraftOfSet(row, contract, unit));
  const [error, setError] = useState<string | null>(null);
  const onDraft = useCallback((update: (prev: LoadDraft) => LoadDraft) => setDraft(update), []);
  const kgShown = contract != null && showsKg(contract, draft.variant) && !(structured && draft.unequal);

  const support = recoveryEditOf(row);
  const save = () => {
    /* 새 판의 줄은 고치지 않는다 — 고치는 칸이 그 줄을 이 앱의 판으로 다시 만들며 원래 값을 잃는다 */
    if (!support.editable) return setError(support.reason);
    const n = Number(amount);
    const limit = isHold ? AMOUNT_LIMITS.holdSeconds : AMOUNT_LIMITS.reps;
    if (!Number.isInteger(n) || n < 1 || n > limit) return setError(isHold ? `버틴 시간을 1~${limit}초로 적어 주세요.` : `횟수를 1~${limit}회로 적어 주세요.`);
    const base: PendingSet = { ...row, ...(isHold ? { holdSeconds: n, reps: null } : { reps: n, holdSeconds: null }) };
    delete base.held;
    if (!contract) return onSave(base);
    const v = Number(kgText.replace(',', '.'));
    const kg = kgShown && kgText.trim() !== '' && Number.isFinite(v) && v > 0 ? Math.round(fromWeight(v, unit) * 100) / 100 : null;
    const b = buildSetLoad({ contract, draft, structured, kg, unit });
    if (!b.ok) return setError(b.error);
    const check = normalizeSetLoad({
      hasProtocol: true,
      protocol: LOAD_PROTOCOL,
      resolver: b.loadResolver,
      contract,
      variant: b.variant ?? null,
      weightKg: b.weightKg,
      hasLoad: b.load !== undefined,
      load: b.load,
      structured,
    });
    if (!check.ok) return setError(check.error);
    const next: PendingSet = { ...base, weightKg: b.weightKg, loadProtocol: LOAD_PROTOCOL };
    delete next.load;
    delete next.loadResolver;
    delete next.variant;
    if (b.load !== undefined) {
      next.load = b.load;
      next.loadResolver = b.loadResolver;
    }
    if (b.variant) next.variant = b.variant;
    onSave(next);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${title} 고치기`}
      description="같은 세트 · 같은 시각으로 다시 담아 보내요"
      c={c}
      footer={
        <Press accessibilityRole="button" onPress={save} style={[st.big, { backgroundColor: c.action }]}>
          <Text style={[st.bigText, { color: c.onAction }]}>고쳐서 다시 담기</Text>
        </Press>
      }
    >
      <View style={{ gap: 14 }}>
        <View style={{ gap: 6 }}>
          <Text style={[st.bodyBold, { color: c.ink }]}>{isHold ? '버틴 시간(초)' : '횟수'}</Text>
          <TextInput
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^\d]/g, '').slice(0, 4))}
            keyboardType="number-pad"
            accessibilityLabel={isHold ? '버틴 시간' : '횟수'}
            style={[st.input, { backgroundColor: c.chip, color: c.ink }]}
          />
        </View>
        {kgShown ? (
          <View style={{ gap: 6 }}>
            <Text style={[st.bodyBold, { color: c.ink }]}>
              {kgLabel(contract, draft.variant)} ({unit})
            </Text>
            <TextInput
              value={kgText}
              onChangeText={(t) => setKgText(t.slice(0, 7))}
              keyboardType="decimal-pad"
              accessibilityLabel="무게"
              style={[st.input, { backgroundColor: c.chip, color: c.ink }]}
            />
          </View>
        ) : null}
        {contract ? (
          <LoadExtras contract={contract} structured={structured} draft={draft} onChange={onDraft} unit={unit} owner={owner} exerciseId={row.exerciseId} remember={false} c={c} />
        ) : (
          <Text style={[st.small, { color: c.muted }]}>이 운동의 기록 방식을 지금 확인하지 못해 횟수 · 시간만 고칠 수 있어요. 무게 기록은 처음 남긴 그대로 둬요.</Text>
        )}
        {error ? (
          <Text accessibilityRole="alert" style={[st.note, { color: c.danger, backgroundColor: c.danger + '14' }]}>
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const st = StyleSheet.create({
  section: { fontSize: 17, fontWeight: '700' },
  card: { borderRadius: 18, padding: 16, gap: 8 },
  box: { borderRadius: 14, padding: 14, gap: 6 },
  reason: { flexDirection: 'row', gap: 8, borderRadius: 12, padding: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  pill: { minHeight: 44, borderRadius: 22, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  body: { fontSize: 15, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
  smallBold: { fontSize: 13, fontWeight: '600' },
  note: { fontSize: 13, lineHeight: 18, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, overflow: 'hidden' },
  input: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  big: { minHeight: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  bigText: { fontSize: 18, fontWeight: '700' },
});
