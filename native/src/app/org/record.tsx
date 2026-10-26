import { type Href, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadCoachNote, loadMyNote, LessonNoteView } from '@/app/actions/app-org';
import type { loadMyHomework } from '@/app/actions/app-lesson';
import { Bar, LoadState, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { HomeworkList } from '~/org/homework';
import { Card, Empty, dayLabel } from '~/org/parts';
import { TalkToggle } from '~/org/thread';

/**
 * 기록 하나(계약 9-6 ①-3 C) — 알림 · 코치 '받은 것'이 가리킨 일지 · 숙제를 그대로 열고 말(질문 · 답)을 펴 둔다.
 * 목록 탭에서 다시 찾지 않게. 지웠거나 취소된 기록은 한 줄로 알린다(권한을 잃은 것과 가른다 — 그때는 서버가 ORG_LOST).
 * 주소: /org/record?org=&as=c|p&kind=note|homework&id=&member= (lib/org/space-nav.ts orgRecordHref)
 */
type Params = { org: string; as: 'c' | 'p'; kind: 'note' | 'homework'; id: string; member?: string };

export default function RecordScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const p = useLocalSearchParams<Params>();
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title={p.kind === 'homework' ? '숙제' : '레슨일지'} c={c} />
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: inset.bottom + 32 }, READABLE]} keyboardShouldPersistTaps="handled">
        {p.kind === 'homework' ? <Homework p={p} c={c} /> : <Note p={p} c={c} />}
        {p.as === 'c' && p.member ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/org/member/${p.member}?org=${p.org}` as Href)}
            hitSlop={6}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>회원 카드 보기 ›</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const Gone = ({ text, c }: { text: string; c: Palette }) => (
  <Card c={c}>
    <Empty text={text} c={c} />
  </Card>
);

function Homework({ p, c }: { p: Params; c: Palette }) {
  const coach = p.as === 'c';
  /* 한 화면 안에서 as 는 안 바뀐다 — 동작 이름 · 인자만 고른다 */
  const { data, error, reload } = useLoad<Awaited<ReturnType<typeof loadMyHomework>>>(
    coach ? 'app-lesson.loadMemberHomework' : 'app-lesson.loadMyHomework',
    ...(coach ? [p.org, p.member ?? '', p.id] : [p.member ?? '', p.id])
  );
  if (!data) return <LoadState error={error} onRetry={() => void reload()} c={c} />;
  if (!data.ok || data.homework.length === 0) return <Gone text="이 숙제를 찾을 수 없어요. 취소됐거나 지워졌을 수 있어요." c={c} />;
  return (
    <HomeworkList
      items={data.homework}
      who={coach ? { role: 'coach', orgId: p.org } : { role: 'player', memberId: p.member ?? '' }}
      onChanged={() => void reload()}
      c={c}
      openTalk={p.id}
    />
  );
}

function Note({ p, c }: { p: Params; c: Palette }) {
  const coach = p.as === 'c';
  const { data, error, reload } = useLoad<Awaited<ReturnType<typeof loadCoachNote>> | Awaited<ReturnType<typeof loadMyNote>>>(
    coach ? 'app-org.loadCoachNote' : 'app-org.loadMyNote',
    coach ? p.org : (p.member ?? ''),
    p.id
  );
  if (!data) return <LoadState error={error} onRetry={() => void reload()} c={c} />;
  if (!data.ok || !data.note) return <Gone text="이 일지를 찾을 수 없어요. 지워졌을 수 있어요." c={c} />;
  const n: LessonNoteView = data.note;
  const left = 'left' in data && data.left;
  return (
    <Card c={c}>
      <Text style={[TYPE.sub, { color: c.muted }]}>
        {coach ? `${n.nickname} · ` : ''}
        {dayLabel(n.key)}
        {n.author ? ` · ${n.author}` : ''}
      </Text>
      <Text selectable style={[TYPE.body, { color: c.ink }]}>
        {n.body}
      </Text>
      {n.homework ? (
        <Text selectable style={[TYPE.body, { color: c.ink }]}>
          <Text style={{ fontWeight: '700' }}>숙제 </Text>
          {n.homework}
        </Text>
      ) : null}
      {n.pitchCount ? (
        <Text style={[TYPE.sub, { color: c.muted }]}>
          던진 공 {n.pitchCount}구
          {n.pitchLog === 'own' ? (coach ? ' · 선수 투구 기록에 남김' : ' · 코치가 내 투구 기록에 남겼어요') : n.pitchLog === 'link' ? (coach ? ' · 선수 기록에 이음' : ' · 내 투구 기록에 이었어요') : ''}
        </Text>
      ) : null}
      {left ? null : (
        <View style={{ marginTop: 4 }}>
          <TalkToggle
            kind="note"
            id={n.id}
            talk={n.talk}
            videos={n.videos.length}
            who={coach ? { role: 'coach', orgId: p.org } : { role: 'player', memberId: p.member ?? '' }}
            c={c}
            defaultOpen
          />
        </View>
      )}
    </Card>
  );
}
