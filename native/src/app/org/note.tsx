import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadLessonNote, loadNotePitchDay } from '@/app/actions/app-org';
import { HOMEWORK_MAX, NOTE_MAX } from '@/lib/org/rules';
import { PITCH_COUNT_MAX } from '@/lib/org/lesson-work';
import { effortScaleText } from '@/lib/pitch-effort';
import { toDateKey } from '@/lib/pitch-stats';
import { SESSION_TYPES, REST_SESSION_TYPE } from '@/lib/session-type';
import { Bar, LoadState, useBusy, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { Box, ChoiceChips, DateStepper, Field, formCall } from '~/org/forms';
import { Primary } from '~/org/parts';

/**
 * 일지 쓰기 · 고치기(앱 화면) — 웹과 같은 org-notes.createLessonNote · updateLessonNote(폼). 오늘 한 것 · 본 것, 숙제(글),
 * 한 운동(한 줄에 하나 — '밴드 외회전 3x15'), 던진 공 수 · 종류 · 강도. 수강권은 건드리지 않는다(덕아웃 예약 끝남에서). 오늘까지만 쓸 수 있다.
 * 2단계: 던진 공은 선수 투구 기록으로도 남는다(가입 · 투구 공유를 켠 회원만). 선수가 그날 직접 남긴 기록이 있으면 그 줄에 잇거나
 * '따로 던진 공'을 골라야 한다 — 같은 공을 두 번 세지 않게(lib/org/lesson-pitch.ts).
 */
const INTENSITY = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
const TYPES = SESSION_TYPES.filter((t) => t.name !== REST_SESSION_TYPE).map((t) => ({ value: t.name as string, label: t.name }));

type Edit = Extract<Awaited<ReturnType<typeof loadLessonNote>>, { ok: true }>['note'];
type Day = Awaited<ReturnType<typeof loadNotePitchDay>>;

export default function LessonNoteScreen() {
  const p = useLocalSearchParams<{ org: string; member?: string; note?: string }>();
  return p.note ? <EditNote org={p.org ?? ''} noteId={p.note} /> : <NoteForm org={p.org ?? ''} memberId={p.member ?? ''} />;
}

function EditNote({ org, noteId }: { org: string; noteId: string }) {
  const c = usePalette();
  const { data, error, reload } = useLoad<Awaited<ReturnType<typeof loadLessonNote>>>('app-org.loadLessonNote', org, noteId);
  if (!data)
    return (
      <>
        <Bar back="뒤로" title="일지 고치기" c={c} />
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      </>
    );
  return <NoteForm org={org} memberId={data.note.memberId} edit={data.note} />;
}

function NoteForm({ org, memberId, edit }: { org: string; memberId: string; edit?: Edit }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const today = toDateKey(new Date());
  const [date, setDate] = useState(edit?.key ?? today);
  const [body, setBody] = useState(edit?.body ?? '');
  const [homework, setHomework] = useState(edit?.homework ?? '');
  const [exercises, setExercises] = useState(edit?.exercises ?? '');
  const [pitchCount, setPitchCount] = useState(edit?.pitchCount ? String(edit.pitchCount) : '');
  const [intensity, setIntensity] = useState<string | null>(edit?.intensity ? String(edit.intensity) : null);
  const [sessionType, setSessionType] = useState(edit?.sessionType ?? '불펜');
  /* 고칠 때 날짜를 그대로 두면 지금 연결을 그대로 고른 채 시작 */
  const [link, setLink] = useState<{ date: string; value: string }>({ date: edit?.key ?? today, value: edit?.link ?? '' });
  const day = useLoad<Day>('app-org.loadNotePitchDay', org, memberId, date);
  const { busy, error, run } = useBusy();
  const thrown = Number(pitchCount) > 0;
  const linkValue = link.date === date ? link.value : '';

  const save = () =>
    run(async () => {
      if (!body.trim() && !homework.trim()) return '오늘 한 것이나 숙제를 적어 주세요.';
      const fields = { date, body, homework, exercises, pitchCount, intensity, sessionType, link: linkValue };
      const r = edit
        ? await formCall('org-notes.updateLessonNote', { id: edit.id, ...fields })
        : await formCall('org-notes.createLessonNote', { memberId, ...fields });
      if (r.error) return r.error;
      toast(r.success ?? '남겼어요');
      router.back();
      return null;
    });

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title={edit ? '일지 고치기' : '일지 쓰기'} c={c} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
        <Field label="날짜" c={c}>
          <DateStepper value={date} onChange={setDate} max={today} c={c} />
        </Field>
        <Field label="오늘 한 것 · 본 것" c={c}>
          <Box value={body} onChangeText={setBody} placeholder="릴리스 포인트 앞으로 · 하체 쓰임 좋아짐" maxLength={NOTE_MAX} multiline c={c} />
        </Field>
        <Field label="숙제" hint="다음까지" c={c}>
          <Box value={homework} onChangeText={setHomework} placeholder="밴드 외회전 매일 3세트" maxLength={HOMEWORK_MAX} multiline style={{ minHeight: 80 }} c={c} />
        </Field>
        <Field label="한 운동" hint="한 줄에 하나 · 선택" c={c}>
          <Box value={exercises} onChangeText={setExercises} placeholder={'밴드 외회전 3x15\n메디신볼 회전 던지기 3x8'} multiline style={{ minHeight: 80 }} c={c} />
        </Field>
        <Field label="던진 공" hint="선택" c={c}>
          <Box value={pitchCount} onChangeText={(t) => setPitchCount(t.replace(/\D/g, '').slice(0, 3))} placeholder={`0 ~ ${PITCH_COUNT_MAX}구`} keyboardType="number-pad" c={c} />
        </Field>
        {thrown ? (
          <>
            <Field label="종류" c={c}>
              <ChoiceChips options={TYPES} value={sessionType} onChange={setSessionType} c={c} />
            </Field>
            <Field label="강도" hint={day.data?.canWrite ? '1 가볍게 ~ 10 전력' : '1 가볍게 ~ 10 전력 · 선택'} c={c}>
              <ChoiceChips options={INTENSITY} value={intensity} onChange={(v) => setIntensity(v === intensity ? null : v)} c={c} />
            </Field>
            <PitchTarget day={day} value={linkValue} onChange={(value) => setLink({ date, value })} c={c} />
          </>
        ) : null}
        {error ? <Text style={[TYPE.body, { color: c.danger }]}>{error}</Text> : null}
        <Primary label={busy ? '남기는 중…' : edit ? '고치기' : '일지 남기기'} onPress={() => void save()} disabled={busy} c={c} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** 던진 공이 선수 투구 기록 어디에 들어가나 — 선수가 그날 남긴 기록이 있으면 잇기 · 따로 던진 공 중 고르기 */
function PitchTarget({ day, value, onChange, c }: { day: ReturnType<typeof useLoad<Day>>; value: string; onChange: (v: string) => void; c: Palette }) {
  if (!day.data) return <LoadState error={day.error} onRetry={() => void day.reload()} c={c} />;
  if (!day.data.canWrite) return <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>{day.data.why}</Text>;
  if (day.data.logs.length === 0)
    return <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>선수 투구 기록에도 남아요. 선수가 고칠 수 있어요.</Text>;
  const options = [
    ...day.data.logs.map((l) => ({
      value: l.id,
      label: `${l.sessionType} ${l.pitchCount}구${l.effortPct ? ` · ${effortScaleText(l.effortPct)}` : ''}에 잇기`,
    })),
    { value: 'new', label: '따로 던진 공' },
  ];
  return (
    <Field label="선수가 그날 남긴 투구 기록이 있어요" hint="같은 공이면 잇기" c={c}>
      <ChoiceChips options={options} value={value || null} onChange={onChange} c={c} />
    </Field>
  );
}
