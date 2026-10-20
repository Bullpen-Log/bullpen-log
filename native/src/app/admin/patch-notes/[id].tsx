import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppPatchNote } from '@/app/actions/app-admin';
import { Bar, call, LoadState, s, useBusy, useLoad } from '~/community/parts';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';

/**
 * 패치노트 한 장(앱 화면, 관리자) — 웹 app/(app)/admin/patch-notes/[id]/page.tsx: 그날의 크기 · 한 일(커밋 제목 · 본문) · 메모.
 * 깃에서 온 것은 못 고치고, 메모만 적는다(app-admin.saveAppPatchNote → updatePatchNote, 2000자). 다시 맞춰도 메모는 남는다.
 */
type Loaded = Awaited<ReturnType<typeof loadAppPatchNote>>;
type Note = NonNullable<Extract<Loaded, { ok: true }>['note']>;

export default function PatchNoteScreen() {
  const c = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, reload } = useLoad<Loaded>('app-admin.loadAppPatchNote', id ?? '');
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="패치노트" title="" c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : !data.note ? (
        <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', padding: 24 }}>기록을 찾을 수 없어요.</Text>
      ) : (
        <Body key={data.note.id} note={data.note} c={c} />
      )}
    </KeyboardAvoidingView>
  );
}

function Body({ note, c }: { note: Note; c: Palette }) {
  const inset = useSafeAreaInsets();
  const [memo, setMemo] = useState(note.memo);
  const [saved, setSaved] = useState(note.memo);
  const save = useBusy();
  const stats = [
    { label: '커밋', value: `${note.stats.commits}개` },
    { label: '파일', value: `${note.stats.files}개` },
    { label: '더한 줄', value: `+${note.stats.insertions}` },
    { label: '지운 줄', value: `−${note.stats.deletions}` },
  ];
  const submit = () =>
    save.run(async () => {
      const r = await call<{ ok: true }>('app-admin.saveAppPatchNote', note.id, memo);
      if (!r.ok) return r.error;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(memo);
      return null;
    });
  return (
    <ScrollView contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 4 }}>
        <Text style={[s.meta, { color: c.sky, fontWeight: '600' }]}>{note.author}</Text>
        <Text style={{ color: c.ink, fontSize: 24, fontWeight: '700' }}>{note.day}</Text>
        {note.areas.length > 0 ? <Text style={[s.meta, { color: c.muted }]}>{note.areas.join(' · ')}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {stats.map((st) => (
          <View key={st.label} style={{ flex: 1, borderRadius: 12, padding: 10, gap: 2, backgroundColor: c.card, boxShadow: c.float }}>
            <Text style={[s.meta, { color: c.muted }]}>{st.label}</Text>
            <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{st.value}</Text>
          </View>
        ))}
      </View>
      <View style={{ borderRadius: 14, padding: 14, gap: 12, backgroundColor: c.card, boxShadow: c.float }}>
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>한 일</Text>
        {note.commits.length === 0 ? (
          <Text style={[s.meta, { color: c.muted }]}>커밋 기록이 없어요.</Text>
        ) : (
          note.commits.map((cm) => <CommitRow key={cm.sha} subject={cm.subject} body={cm.body} sha={cm.sha} c={c} />)
        )}
      </View>
      <View style={{ gap: 8 }}>
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>메모</Text>
        <Text style={[s.meta, { color: c.muted }]}>받은 뒤 할 일 같은 것을 적어 두면 같이 하는 사람이 봐요.{note.editedBy ? ` 마지막으로 ${note.editedBy} 님이 고쳤어요.` : ''}</Text>
        <TextInput
          value={memo}
          onChangeText={setMemo}
          maxLength={2000}
          multiline
          placeholder="메모"
          placeholderTextColor={c.muted}
          style={[s.area, { backgroundColor: c.card, boxShadow: c.float, color: c.ink, minHeight: 140 }]}
        />
        {save.error ? <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>{save.error}</Text> : null}
        <Press
          accessibilityRole="button"
          onPress={submit}
          disabled={save.busy || memo === saved}
          style={[s.primary, { backgroundColor: c.sky, opacity: save.busy || memo === saved ? 0.5 : 1 }]}
        >
          <Text style={s.primaryText}>{save.busy ? '저장하는 중…' : memo === saved ? '저장됨' : '메모 저장'}</Text>
        </Press>
      </View>
    </ScrollView>
  );
}

function CommitRow({ subject, body, sha, c }: { subject: string; body: string; sha: string; c: Palette }) {
  const [open, setOpen] = useState(false);
  return (
    <Press accessibilityRole="button" onPress={() => body && setOpen((v) => !v)} style={{ gap: 4 }}>
      <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600', lineHeight: 21 }}>{subject}</Text>
      <Text style={[s.meta, { color: c.muted }]}>
        {sha.slice(0, 8)}
        {body ? (open ? ' · 접기' : ' · 자세히') : ''}
      </Text>
      {open ? <Text selectable style={{ color: c.ink, fontSize: 15, lineHeight: 21 }}>{body}</Text> : null}
    </Press>
  );
}
