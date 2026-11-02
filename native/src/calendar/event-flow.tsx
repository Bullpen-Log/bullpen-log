import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  newEventId,
  type CalendarEventSnapshot,
  type EventCommand,
  type EventVerification,
  type EventWriteResult,
} from '@/lib/calendar-edit';
import { timeLabel } from '@/lib/calendar-event';
import { FEATURE_LOCKED_BETA } from '@/lib/release-access';
import {
  forgetCalendarEvent,
  rememberCalendarEvent,
  syncCalendarAlarm,
} from '~/home/events';
import { READABLE } from '~/lib/layout';
import { markWrite, rpc, RpcError } from '~/lib/rpc';
import { cacheEpoch, tryLoadJson, trySaveJson } from '~/lib/store';
import { useKeyboardUp } from '~/lib/use-keyboard-up';
import type { Palette } from '~/lib/ui';
import { loadMe } from '~/pitch/api';
import { Press } from '~/shell/press';
import { createEventOperations } from './edit-operations';
import {
  draftChanged,
  draftOf,
  eventInput,
  snapshotDraft,
  validDraft,
} from './event-model';
import {
  eventDateLabel,
  EventButton,
  EventFields,
  EventGroup,
  EventNotice,
  EventPickerOverlay,
  EventRow,
  reminderLabel,
  type EventPicker,
} from './event-fields';

export type EventIntent = {
  kind: 'new' | 'detail' | 'resume';
  date: string;
  id?: string;
  serial: number;
};
export type EventRecovery = { pending: boolean; blocked: boolean };
const FORM_WIDTH = { ...READABLE, maxWidth: 540 };
function limited<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('결과 확인 필요')), 25_000);
    promise.then(
      (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
type ReadResult =
  { ok: true; event: CalendarEventSnapshot | null } | { ok: false; error: string };

/** Mounted with the calendar so interrupted saves are discovered before another mutation can start. */
export function CalendarEventFlow({
  intent,
  today,
  onClose,
  onChanged,
  onRecovery,
  c,
}: {
  intent: EventIntent | null;
  today: string;
  onClose: () => void;
  onChanged: (date: string | null) => void;
  onRecovery: (r: EventRecovery) => void;
  c: Palette;
}) {
  const inset = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const keyboard = useKeyboardUp();
  const [mode, setMode] = useState<'edit' | 'detail'>('edit');
  const [base, setBase] = useState<CalendarEventSnapshot | null>(null);
  const [draft, setDraft] = useState(() => draftOf(null, today));
  const [before, setBefore] = useState(draft);
  const [createId, setCreateId] = useState(newEventId);
  const [readBusy, setReadBusy] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [picker, setPicker] = useState<EventPicker | null>(null);
  const sequence = useRef(0);
  const seen = useRef<number | null>(null);
  const [ops] = useState(() =>
    createEventOperations({
      epoch: cacheEpoch,
      read: tryLoadJson,
      store: trySaveJson,
      write: (command) =>
        limited(rpc<EventWriteResult>('calendar-event.saveAppCalendarEvent', command)),
      verify: (command) =>
        limited(
          rpc<EventVerification>('calendar-event.loadAppCalendarEventResult', command)
        ),
      completed: () => undefined,
      rejected: (e) =>
        e instanceof RpcError &&
        ['redirect', 'update', FEATURE_LOCKED_BETA].includes(e.code),
    })
  );
  const operation = useSyncExternalStore(ops.subscribe, ops.snapshot);
  useEffect(() => {
    ops.setCompleted((result, pending) => {
      // A read may confirm a write whose response was lost. Refresh the other tabs too.
      markWrite();
      if (result.event) {
        rememberCalendarEvent(result.event, false);
        void syncCalendarAlarm(result.event);
      } else void forgetCalendarEvent(result.id, pending.base ?? undefined);
      onChanged(result.date ?? pending.base?.date ?? null);
      onClose();
    });
  }, [onChanged, onClose, ops]);
  useEffect(() => {
    const epoch = cacheEpoch();
    let active = true;
    void loadMe()
      .then((me) => {
        if (active && epoch === cacheEpoch()) return ops.open(me.userId);
      })
      .catch(() => {
        if (active && epoch === cacheEpoch())
          setInitError('계정을 확인하지 못했어요. 다시 열어주세요.');
      });
    return () => {
      active = false;
      // Mutable request token, not a rendered node. Invalidate the latest read on unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      sequence.current++;
      ops.dispose();
    };
  }, [ops]);
  useEffect(() => {
    onRecovery({
      pending: !!operation.pending,
      blocked: !!initError || (!operation.ready && !!operation.error),
    });
  }, [operation.pending, operation.ready, operation.error, initError, onRecovery]);

  const load = async (id: string, edit: boolean, replace = false) => {
    const seq = ++sequence.current,
      epoch = cacheEpoch();
    setReadBusy(true);
    setReadError(null);
    setPicker(null);
    try {
      const r = await limited(
        rpc<ReadResult>('calendar-event.loadAppCalendarEvent', id)
      );
      if (seq !== sequence.current || epoch !== cacheEpoch()) return;
      if (!r.ok) {
        setReadError(r.error);
        return;
      }
      if (!r.event) {
        setReadError('이 일정은 삭제되었거나 볼 수 없어요.');
        return;
      }
      const event = r.event;
      const apply = () => {
        if (seq !== sequence.current || epoch !== cacheEpoch()) return;
        const d = snapshotDraft(event);
        setBase(event);
        setDraft(d);
        setBefore(d);
        setMode(edit && event.owner === undefined ? 'edit' : 'detail');
        ops.dismissError();
      };
      if (replace && draftChanged(draft, before))
        Alert.alert('최신 내용으로 바꿀까요?', '현재 작성한 내용은 사라져요.', [
          { text: '계속 작성', style: 'cancel' },
          { text: '최신 내용 불러오기', onPress: apply },
        ]);
      else apply();
    } catch {
      if (seq === sequence.current && epoch === cacheEpoch())
        setReadError('일정을 불러오지 못했어요. 작성한 내용은 그대로 있어요.');
    } finally {
      if (seq === sequence.current && epoch === cacheEpoch()) setReadBusy(false);
    }
  };
  /* An explicit external open initializes one editor; mutation updates never reinitialize its draft. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!intent) {
      sequence.current++;
      seen.current = null;
      setPicker(null);
      return;
    }
    if (!operation.ready || seen.current === intent.serial) return;
    seen.current = intent.serial;
    setReadError(null);
    setPicker(null);
    setBase(null);
    setReadBusy(false);
    const p = operation.pending;
    if (p) {
      const d =
        p.command.op === 'delete'
          ? draftOf(p.base, intent.date)
          : draftOf(
              {
                id: p.command.id,
                ...p.command.input,
                time: p.command.input.time ?? null,
                memo: p.command.input.memo ?? null,
                remindMin: p.command.input.remindMin ?? null,
              },
              intent.date
            );
      setBase(p.base);
      setDraft(d);
      setBefore(d);
      setCreateId(p.command.id);
      setMode(p.command.op === 'delete' ? 'detail' : 'edit');
    } else if (intent.kind === 'detail' && intent.id) {
      setMode('detail');
      void load(intent.id, false);
    } else {
      const d = draftOf(null, intent.date);
      setDraft(d);
      setBefore(d);
      setCreateId(newEventId());
      setMode('edit');
      ops.dismissError();
    }
    // One initialization per explicit open; mutation state changes must never replace a draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, operation.ready]);

  /* eslint-enable react-hooks/set-state-in-effect */
  const close = () => {
    if (operation.busy) return;
    if (picker) return setPicker(null);
    if (operation.pending || mode === 'detail' || !draftChanged(draft, before))
      return onClose();
    Alert.alert('일정 작성을 그만둘까요?', '작성한 내용은 저장되지 않아요.', [
      { text: '계속 작성', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: onClose },
    ]);
  };
  const save = () => {
    Keyboard.dismiss();
    if (!validDraft(draft, today) || base?.owner !== undefined) return;
    const command: EventCommand = base
      ? { op: 'update', id: base.id, version: base.version, input: eventInput(draft) }
      : { op: 'create', id: createId, input: eventInput(draft) };
    void ops.send({ command, base });
  };
  const remove = () => {
    if (!base || base.owner !== undefined || operation.pending || operation.busy)
      return;
    const event = base;
    Alert.alert('일정을 삭제할까요?', `‘${event.title}’ 일정이 삭제돼요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '일정 삭제',
        style: 'destructive',
        onPress: () =>
          void ops.send({
            command: { op: 'delete', id: event.id, version: event.version },
            base: event,
          }),
      },
    ]);
  };
  const blocked = !operation.ready || readBusy || !!operation.pending || operation.busy;
  const waiting = operation.pending;
  return (
    <Modal
      visible={intent != null}
      animationType={reduce ? 'none' : 'fade'}
      presentationStyle="fullScreen"
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: c.page }}
      >
        <View
          accessibilityElementsHidden={!!picker}
          importantForAccessibility={picker ? 'no-hide-descendants' : 'auto'}
          style={{ flex: 1 }}
        >
          <View
            style={[
              {
                paddingTop: Math.max(inset.top, 12),
                paddingHorizontal: 18,
                paddingBottom: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              },
              FORM_WIDTH,
            ]}
          >
            <Press
              accessibilityRole="button"
              disabled={operation.busy}
              onPress={close}
              style={{
                minHeight: 44,
                minWidth: 44,
                justifyContent: 'center',
                opacity: operation.busy ? 0.4 : 1,
              }}
            >
              <Text style={{ color: c.link, fontSize: 16 }}>
                {waiting ? '닫기' : mode === 'edit' ? '취소' : '닫기'}
              </Text>
            </Press>
            <Text
              accessibilityRole="header"
              style={{
                flex: 1,
                color: c.ink,
                fontSize: 18,
                fontWeight: '700',
                textAlign: 'center',
              }}
            >
              {mode === 'detail' ? '개인 일정' : base ? '일정 수정' : '일정 추가'}
            </Text>
            <View style={{ width: 44 }} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={[
              { padding: 18, gap: 16, paddingBottom: 28 },
              FORM_WIDTH,
            ]}
          >
            {initError || (!operation.ready && operation.error) ? (
              <EventNotice text={initError ?? operation.error!} c={c} />
            ) : !operation.ready ? (
              <ActivityIndicator
                accessibilityLabel="저장 확인 정보 불러오는 중"
                color={c.link}
              />
            ) : null}
            {readBusy ? (
              <ActivityIndicator accessibilityLabel="일정 불러오는 중" color={c.link} />
            ) : null}
            {readError ? (
              <EventNotice
                text={readError}
                action="다시 확인"
                onPress={() => {
                  const id = base?.id ?? intent?.id;
                  if (id) void load(id, mode === 'edit', mode === 'edit');
                }}
                c={c}
              />
            ) : null}
            {operation.ready && operation.error ? (
              <EventNotice
                text={operation.error}
                action={operation.conflict && base ? '최신 내용 확인' : undefined}
                onPress={
                  base ? () => void load(base.id, mode === 'edit', true) : undefined
                }
                c={c}
              />
            ) : null}
            {operation.ready && mode === 'edit' ? (
              <EventFields
                draft={draft}
                setDraft={setDraft}
                onPicker={(p) => {
                  Keyboard.dismiss();
                  setPicker(p);
                }}
                disabled={blocked}
                c={c}
              />
            ) : operation.ready && base ? (
              <>
                <EventGroup c={c}>
                  <Text
                    style={{
                      fontSize: 28,
                      fontWeight: '700',
                      letterSpacing: -0.6,
                      lineHeight: 36,
                      color: c.ink,
                    }}
                  >
                    {base.title}
                  </Text>
                  {base.owner !== undefined ? (
                    <Text style={{ color: c.muted, fontSize: 13 }}>
                      {base.owner || '다른 관리자'} · 읽기 전용
                    </Text>
                  ) : null}
                  <EventRow
                    icon="calendar-days"
                    label="날짜"
                    value={eventDateLabel(base.date)}
                    c={c}
                  />
                  <EventRow
                    icon="clock-3"
                    label="시간"
                    value={base.time ? timeLabel(base.time) : '종일'}
                    c={c}
                  />
                  <EventRow
                    icon="bell"
                    label="알림"
                    value={reminderLabel(snapshotDraft(base))}
                    c={c}
                  />
                </EventGroup>
                {base.memo ? (
                  <EventGroup c={c}>
                    <Text style={{ color: c.muted, fontSize: 13 }}>메모</Text>
                    <Text style={{ color: c.ink, fontSize: 16, lineHeight: 25 }}>
                      {base.memo}
                    </Text>
                  </EventGroup>
                ) : null}
                {base.owner === undefined && !waiting ? (
                  <Press
                    accessibilityRole="button"
                    disabled={blocked}
                    onPress={remove}
                    style={{
                      minHeight: 48,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: blocked ? 0.4 : 1,
                    }}
                  >
                    <Text style={{ color: c.danger, fontSize: 15 }}>일정 삭제</Text>
                  </Press>
                ) : null}
              </>
            ) : null}
          </ScrollView>
          {operation.ready ? (
            <View
              style={[
                {
                  paddingHorizontal: 18,
                  paddingTop: 12,
                  paddingBottom: keyboard ? 12 : Math.max(inset.bottom, 16),
                  gap: 9,
                  borderTopWidth: 0.5,
                  borderTopColor: c.line,
                  backgroundColor: c.page,
                },
                FORM_WIDTH,
              ]}
            >
              {waiting ? (
                <>
                  <EventButton
                    label={
                      operation.busy
                        ? '확인 중…'
                        : waiting.command.op === 'delete'
                          ? '삭제 여부 확인'
                          : '저장 여부 확인'
                    }
                    disabled={operation.busy}
                    onPress={() => void ops.verify()}
                    c={c}
                  />
                  {operation.notApplied ? (
                    <EventButton
                      label="같은 내용으로 다시 시도"
                      disabled={operation.busy}
                      secondary
                      onPress={() => void ops.retry()}
                      c={c}
                    />
                  ) : null}
                  <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>
                    닫아도 다음에 결과를 확인할 수 있어요.
                  </Text>
                </>
              ) : mode === 'edit' ? (
                <EventButton
                  label={
                    operation.busy ? '저장 중…' : base ? '변경사항 저장' : '일정 저장'
                  }
                  disabled={
                    blocked ||
                    operation.conflict ||
                    !validDraft(draft, today) ||
                    (!!base && !draftChanged(draft, before))
                  }
                  onPress={save}
                  c={c}
                />
              ) : base?.owner === undefined && base ? (
                <EventButton
                  label="일정 수정"
                  disabled={blocked}
                  onPress={() => void load(base.id, true)}
                  c={c}
                />
              ) : null}
            </View>
          ) : null}
        </View>
        {picker ? (
          <EventPickerOverlay
            kind={picker}
            draft={draft}
            today={today}
            onClose={() => setPicker(null)}
            onApply={(patch) => {
              setDraft({ ...draft, ...patch });
              setPicker(null);
            }}
            c={c}
          />
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}
