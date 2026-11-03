import { useEffect, useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import {
  recordNoteMatches,
  type RecordNote,
  type WorkoutRecord,
} from '@/lib/workout/record-model';
import type { NoteSave } from '@/lib/workout/record-note';
import { trainingEffortLevel } from '@/lib/training-effort';
import { cacheEpoch, loadJson, trySaveJson } from '~/lib/store';
import { rpc, RpcError } from '~/lib/rpc';
import { loadMe } from '~/pitch/api';
import { leave } from '~/mechanics/parts';
import type { Palette } from '~/lib/ui';
import { Sheet } from '~/workout/sheets';
import { IntensitySlider } from '~/workout/intensity-slider';
import { Press } from '~/shell/press';
import { Icon } from '~/shell/icon';
import { toast } from '~/shell/toast';
import { RecordButton, RecordLink, RecordNotice, rs } from './record-ui';

type Changes = { exerciseId: string; before: boolean; done: boolean }[];
type Pending =
  | { kind: 'note'; intensity: number; memo: string; version: string | null }
  | { kind: 'checks'; changes: Changes };
async function limited<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), 25000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Owner/date-scoped durable uncertainty: verification reads only, never repeats a possibly committed mutation. */
export function RecordEditors({
  record: r,
  reload,
  open,
  onOpenNote,
  onClose,
  c,
}: {
  record: WorkoutRecord;
  reload: () => Promise<unknown>;
  open: 'note' | 'checks' | null;
  onOpenNote: () => void;
  onClose: () => void;
  c: Palette;
}) {
  const [owner, setOwner] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(r.note);
  const [score, setScore] = useState<number | null>(r.note?.intensity ?? null);
  const [memo, setMemo] = useState(r.note?.memo ?? '');
  const [version, setVersion] = useState<string | null>(r.note?.version ?? null);
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const epoch = useRef(cacheEpoch());
  const alive = useRef(true);
  const opened = useRef(open);
  const dirty = useRef(false);
  const key = owner ? `sinker:record-edit:${owner}:${r.date}` : null;
  const current = () => alive.current && epoch.current === cacheEpoch();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [seenRecord, setSeenRecord] = useState(r);
  if (seenRecord !== r) {
    setSeenRecord(r);
    setNote(r.note);
  }
  useEffect(() => {
    let active = true;
    void loadMe()
      .then(async (me) => {
        const saved = (await loadJson(
          `sinker:record-edit:${me.userId}:${r.date}`
        )) as Pending | null;
        if (!active || epoch.current !== cacheEpoch()) return;
        setOwner(me.userId);
        if (
          saved &&
          ((saved.kind === 'note' &&
            Number.isInteger(saved.intensity) &&
            saved.intensity >= 1 &&
            saved.intensity <= 10 &&
            typeof saved.memo === 'string') ||
            (saved.kind === 'checks' &&
              Array.isArray(saved.changes) &&
              saved.changes.every(
                (c) => typeof c.exerciseId === 'string' && typeof c.done === 'boolean'
              )))
        )
          setPending(saved);
        setReady(true);
      })
      .catch(() => {
        if (active && current())
          setError('수정 정보를 확인하지 못했어요. 화면을 다시 열어 주세요.');
      });
    return () => {
      active = false;
    };
  }, [r.date]);
  useEffect(() => {
    if (open && opened.current !== open) {
      setScore(note?.intensity ?? null);
      setMemo(note?.memo ?? '');
      setVersion(note?.version ?? null);
      setChoices(Object.fromEntries(r.exercises.map((e) => [e.id, e.done])));
      setError(null);
      dirty.current = false;
    }
    opened.current = open;
  }, [open, note, r.exercises]);
  const close = () => {
    if (lock.current) return;
    if (dirty.current && !pending)
      Alert.alert('수정한 내용을 남길까요?', undefined, [
        { text: '계속 수정', style: 'cancel' },
        {
          text: '저장하지 않고 닫기',
          style: 'destructive',
          onPress: () => {
            dirty.current = false;
            onClose();
          },
        },
      ]);
    else onClose();
  };
  const denied = (e: unknown) => {
    if (e instanceof RpcError && e.code === 'redirect') {
      leave(e.to ?? '/login');
      return true;
    }
    return (
      e instanceof RpcError &&
      ['FEATURE_LOCKED_BETA', 'PERMISSION_DENIED', 'update'].includes(e.code)
    );
  };
  const clear = async () => {
    if (key) await trySaveJson(key, null);
    if (current()) {
      setPending(null);
      dirty.current = false;
    }
  };
  const verify = async () => {
    if (!pending || lock.current || !current()) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      if (pending.kind === 'note') {
        const result = await limited(
          rpc<{ ok: true; note: RecordNote | null } | { ok: false; to: string }>(
            'app-training-parts.loadAppTrainingRecordNote',
            r.date
          )
        );
        if (!current()) return;
        if (!result.ok) {
          leave(result.to);
          return;
        }
        if (recordNoteMatches(result.note, pending)) {
          setNote(result.note);
          await clear();
          onClose();
          void reload();
          toast('저장된 기록을 확인했어요.');
        } else {
          /* 서버를 읽었는데 그 내용이 아니면 저장 안 된 것 — 대기를 풀고 적던 값 그대로 다시 저장할 수 있게(지금 판으로) */
          const moved = (result.note?.version ?? null) !== pending.version;
          setNote(result.note);
          setScore(pending.intensity);
          setMemo(pending.memo);
          setVersion(result.note?.version ?? null);
          await clear();
          if (!current()) return;
          dirty.current = true;
          setError(
            moved
              ? '그사이 다른 곳에서 기록이 바뀌었어요. 확인하고 다시 저장해 주세요.'
              : '저장되지 않았어요. 다시 저장해 주세요.'
          );
        }
      } else {
        const result = await limited(
          rpc<{ ok: true; record: WorkoutRecord | null }>(
            'app-training-parts.loadAppTrainingRecord',
            r.date,
            'training'
          )
        );
        if (!current()) return;
        if (
          result.record?.setsKnown &&
          pending.changes.every(
            (ch) =>
              (result.record!.exercises.find((e) => e.id === ch.exerciseId)?.done ??
                false) === ch.done
          )
        ) {
          await clear();
          onClose();
          void reload();
          toast('완료 표시를 확인했어요.');
        } else {
          /* 완료 표시는 한 번에 다 바뀌거나 하나도 안 바뀐다(서버 트랜잭션) — 안 바뀌었으니 대기를 풀고 다시 저장할 수 있게 */
          await clear();
          if (!current()) return;
          void reload();
          setError('완료 표시가 바뀌지 않았어요. 확인하고 다시 저장해 주세요.');
        }
      }
    } catch (e) {
      if (current()) {
        denied(e);
        setError('결과를 확인하지 못했어요. 다시 확인해 주세요.');
      }
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  };
  const save = async () => {
    if (!current() || !key || !ready || lock.current || pending || !r.editable) return;
    const changes = r.exercises
      .filter((e) => e.canToggle && choices[e.id] !== e.done)
      .map((e) => ({ exerciseId: e.id, before: e.done, done: choices[e.id] }));
    if (open === 'note' && (score == null || !r.noteKnown)) return;
    if (open === 'checks' && !changes.length) {
      onClose();
      return;
    }
    const p: Pending =
      open === 'note'
        ? { kind: 'note', intensity: score!, memo: memo.trim(), version }
        : { kind: 'checks', changes };
    lock.current = true;
    setBusy(true);
    setError(null);
    if (!(await trySaveJson(key, p))) {
      lock.current = false;
      if (current()) {
        setBusy(false);
        setError('이 기기에 저장 준비를 마치지 못했어요. 다시 시도해 주세요.');
      }
      return;
    }
    if (!current()) {
      lock.current = false;
      return;
    }
    try {
      const result =
        p.kind === 'note'
          ? await limited(
              rpc<NoteSave>('app-training-parts.saveAppTrainingRecordNote', r.date, {
                intensity: p.intensity,
                memo: p.memo,
                version: p.version,
              })
            )
          : await limited(
              rpc<{ ok: true } | { error: string }>(
                'app-training-parts.setAppTrainingRecordDone',
                r.date,
                p.changes
              )
            );
      if (epoch.current !== cacheEpoch()) return;
      await trySaveJson(key, null);
      if (!current()) return;
      if ('error' in result) {
        setError(result.error);
        if ('conflict' in result && result.conflict) {
          void reload();
          /* 새 판을 받아 둔다 — 안 받으면 다시 저장해도 옛 판이라 늘 충돌 */
          if (p.kind === 'note')
            void limited(
              rpc<{ ok: true; note: RecordNote | null } | { ok: false; to: string }>(
                'app-training-parts.loadAppTrainingRecordNote',
                r.date
              )
            )
              .then((x) => {
                if (!current() || !x.ok) return;
                setNote(x.note);
                setVersion(x.note?.version ?? null);
              })
              .catch(() => {});
        }
      } else {
        if (p.kind === 'note' && 'note' in result)
          setNote((result as { ok: true; note: RecordNote }).note);
        dirty.current = false;
        onClose();
        void reload();
        toast('기록을 저장했어요.');
      }
    } catch (e) {
      if (epoch.current !== cacheEpoch()) return;
      if (denied(e)) {
        await trySaveJson(key, null);
        if (current()) setError(e instanceof Error ? e.message : '접근할 수 없어요.');
      } else if (current()) {
        setPending(p);
        dirty.current = false;
        setError('저장됐는지 확인이 필요해요.');
      }
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  };
  const showSection =
    r.exercises.some((e) => e.done) ||
    r.session != null ||
    note != null ||
    !r.noteKnown ||
    pending != null;
  return (
    <>
      {showSection ? (
        <>
          <View style={rs.sectionHead}>
            <Text style={[rs.section, { color: c.ink }]}>그날의 기록</Text>
            {r.editable && r.noteKnown ? (
              <RecordLink
                label={note ? '수정' : '남기기'}
                onPress={onOpenNote}
                c={c}
                disabled={!ready || busy || Boolean(pending)}
              />
            ) : null}
          </View>
          {pending ? (
            <View style={[rs.notice, { backgroundColor: c.danger + '12' }]}>
              <Text style={[rs.small, { color: c.danger }]}>
                {error ?? '저장 결과 확인이 필요해요.'}
              </Text>
              <RecordLink
                label={busy ? '확인 중…' : '저장 여부 확인'}
                onPress={() => void verify()}
                c={c}
                disabled={busy}
              />
            </View>
          ) : null}
          {!r.noteKnown ? (
            <RecordNotice c={c} retry={() => void reload()}>
              강도와 메모를 불러오지 못했어요.
            </RecordNotice>
          ) : (
            <View style={[rs.card, { backgroundColor: c.card, boxShadow: c.float }]}>
              <View style={rs.split}>
                <Text style={[rs.small, { color: c.muted }]}>체감 강도</Text>
                <Text style={[rs.body, { color: c.ink, fontWeight: '700' }]}>
                  {note
                    ? `${trainingEffortLevel(note.intensity)?.label ?? ''} · ${note.intensity}/10`
                    : '미입력'}
                </Text>
              </View>
              {note ? (
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 3,
                    marginTop: 12,
                    marginBottom: 6,
                  }}
                  accessible={false}
                >
                  {Array.from({ length: 10 }, (_, i) => (
                    <View
                      key={i}
                      style={{
                        flex: 1,
                        height: 5,
                        borderRadius: 4,
                        backgroundColor: i < note.intensity ? c.link : c.chip,
                      }}
                    />
                  ))}
                </View>
              ) : null}
              <View
                style={[
                  rs.line,
                  { borderColor: c.line, borderBottomWidth: 0, marginTop: 8 },
                ]}
              >
                <Text style={[rs.small, { color: c.muted }]}>메모</Text>
                <Text
                  selectable
                  style={[rs.body, { color: note?.memo ? c.ink : c.muted }]}
                >
                  {note?.memo ?? '없음'}
                </Text>
              </View>
            </View>
          )}
        </>
      ) : null}
      <Sheet
        fit
        open={open != null}
        onClose={close}
        title={open === 'checks' ? '완료 표시 수정' : '강도 · 메모'}
        c={c}
        footer={
          <RecordButton
            label={
              pending
                ? busy
                  ? '확인 중…'
                  : '저장 여부 확인'
                : busy
                  ? '저장 중…'
                  : '저장'
            }
            disabled={
              busy ||
              !ready ||
              (!pending && !r.editable) ||
              (!pending && open === 'note' && score == null)
            }
            onPress={() => void (pending ? verify() : save())}
            c={c}
          />
        }
      >
        {pending ? (
          <Text style={[rs.body, { color: c.muted }]}>
            저장됐는지 먼저 확인해 주세요.
          </Text>
        ) : open === 'note' ? (
          <>
            <IntensitySlider
              value={score}
              onChange={(v) => {
                setScore(v);
                dirty.current = true;
              }}
              disabled={busy}
              label="그날 체감 강도"
            />
            <Text style={[rs.body, { color: c.ink }]}>메모</Text>
            <TextInput
              accessibilityLabel="그날 운동 메모"
              multiline
              maxLength={1000}
              editable={!busy}
              value={memo}
              onChangeText={(v) => {
                setMemo(v);
                dirty.current = true;
              }}
              placeholder="남길 내용이 있으면 적어 주세요."
              placeholderTextColor={c.muted}
              style={[rs.input, { backgroundColor: c.chip, color: c.ink }]}
            />
          </>
        ) : (
          <>
            {r.exercises.map((e) => (
              <Press
                key={e.id}
                disabled={busy || !e.canToggle}
                accessibilityRole="checkbox"
                accessibilityLabel={e.title}
                accessibilityState={{
                  checked: choices[e.id] ?? e.done,
                  disabled: !e.canToggle || busy,
                }}
                onPress={() => {
                  setChoices((p) => ({ ...p, [e.id]: !(p[e.id] ?? e.done) }));
                  dirty.current = true;
                }}
                style={[
                  rs.line,
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderColor: c.line,
                    opacity: e.canToggle ? 1 : 0.5,
                  },
                ]}
              >
                <Icon
                  name={(choices[e.id] ?? e.done) ? 'circle-check' : 'circle'}
                  size={23}
                  color={c.link}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[rs.body, { color: c.ink }]}>{e.title}</Text>
                  {!e.canToggle ? (
                    <Text style={[rs.small, { color: c.muted }]}>
                      저장된 세트 기록 있음 또는 확인 필요
                    </Text>
                  ) : null}
                </View>
              </Press>
            ))}
            <Text style={[rs.small, { color: c.muted }]}>
              세트가 저장된 운동은 여기서 완료 표시를 지우지 않아요.
            </Text>
          </>
        )}
        {error ? <RecordNotice c={c}>{error}</RecordNotice> : null}
      </Sheet>
    </>
  );
}
