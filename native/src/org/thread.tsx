import type { VideoPlayer } from 'expo-video';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { loadCoachThread } from '@/app/actions/app-lesson';
import { COMMENT_KIND_LABEL, COMMENT_MAX } from '@/lib/org/comments';
import { LoadState, call, useBusy, useLoad } from '~/community/parts';
import { TYPE, type Palette } from '~/lib/ui';
import { ChoiceChips } from '~/org/forms';
import { dayLabel } from '~/org/parts';
import { OrgVideo, playerTime, secText, seekPlayer, type VideoWho } from '~/org/video';

/**
 * 일지 · 숙제에 다는 말(2단계) — 접힌 채 '영상 N · 말 N'(회원이 쓴 안 푼 말이 있으면 표시), 누르면 펴서 읽고 쓴다.
 * 코치는 답(답하면 그 자리의 회원 말을 푼다), 회원은 질문 · 정정 요청(코치 '받은 것'에 뜬다). 서버 app-lesson.*Thread · add*Comment.
 * 그 자리에 영상(일지 영상 · 숙제 영상)이 있으면 위에서 튼다 — 코치는 '지금 순간에 말'로 그 초에 말을 달고, 초가 달린 말을 누르면 그 순간으로 옮긴다.
 */
type Loaded = Awaited<ReturnType<typeof loadCoachThread>>;
const PLAYER_KINDS = [
  { value: 'question', label: '질문' },
  { value: 'fix', label: '정정 요청' },
] as const;

export function TalkToggle({
  kind,
  id,
  talk,
  videos = 0,
  who,
  c,
  defaultOpen = false,
}: {
  kind: 'note' | 'homework';
  id: string;
  talk: { total: number; open: number };
  /** 그 자리의 영상 수(일지 영상) — 알면 접힌 줄에 */
  videos?: number;
  who: VideoWho;
  c: Palette;
  /** 알림이 가리킨 기록이면 펴서 연다(계약 9-6 ①-3 C) */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const parts = [videos ? `영상 ${videos}` : '', talk.total ? `말 ${talk.total}` : ''].filter(Boolean);
  const label = parts.length ? parts.join(' · ') : who.role === 'coach' ? '말 남기기' : '질문 · 정정 요청';
  return (
    <View style={{ gap: 6 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} hitSlop={6} style={{ minHeight: 32, justifyContent: 'center' }}>
        <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>
          {open ? '접기' : label}
          {!open && talk.open ? <Text style={{ color: who.role === 'coach' ? c.danger : c.muted }}> · 답 기다림 {talk.open}</Text> : null}
        </Text>
      </Pressable>
      {open ? <Thread kind={kind} id={id} who={who} c={c} /> : null}
    </View>
  );
}

function Thread({ kind, id, who, c }: { kind: 'note' | 'homework'; id: string; who: VideoWho; c: Palette }) {
  /* 한 화면 안에서 who.role 은 안 바뀐다 — 동작 이름 · 첫 인자만 고른다 */
  const t = useLoad<Loaded>(
    who.role === 'coach' ? 'app-lesson.loadCoachThread' : 'app-lesson.loadMyThread',
    who.role === 'coach' ? who.orgId : who.memberId,
    kind,
    id
  );
  const [body, setBody] = useState('');
  const [ask, setAsk] = useState<'question' | 'fix'>('question');
  const [pick, setPick] = useState<string | null>(null);
  const [atNow, setAtNow] = useState(false);
  const player = useRef<VideoPlayer | null>(null);
  const { busy, error, run } = useBusy();
  const videos = t.data?.videos ?? [];
  const shown = pick && videos.includes(pick) ? pick : (videos[0] ?? null);

  const send = () =>
    run(async () => {
      if (!body.trim()) return '할 말을 적어 주세요.';
      const at = atNow && shown ? playerTime(player.current) : null;
      const r =
        who.role === 'coach'
          ? await call<{ ok: boolean; error?: string }>('app-lesson.addCoachComment', who.orgId, kind, id, body, at != null ? shown : null, at)
          : await call<{ ok: boolean; error?: string }>('app-lesson.addMyComment', who.memberId, kind, id, ask, body);
      if (!r.ok) return ('error' in r && r.error) || '남기지 못했어요.';
      setBody('');
      await t.reload();
      return null;
    });
  /* 초가 달린 말 — 그 영상으로 바꾸고 그 순간으로 */
  const jump = (path: string, sec: number) => {
    if (path !== shown) setPick(path);
    setTimeout(() => seekPlayer(player.current, sec), path !== shown ? 600 : 0);
  };

  if (!t.data) return <LoadState error={t.error} onRetry={() => void t.reload()} c={c} />;
  return (
    <View style={[st.box, { borderColor: c.line }]}>
      {shown ? (
        <View style={{ gap: 6 }}>
          {videos.length > 1 ? (
            <ChoiceChips options={videos.map((v, i) => ({ value: v, label: `영상 ${i + 1}` }))} value={shown} onChange={setPick} c={c} />
          ) : null}
          <OrgVideo key={shown} path={shown} who={who} playerRef={player} c={c} />
        </View>
      ) : null}
      {t.data.comments.map((m) => (
        <View key={m.id} style={{ gap: 1 }}>
          <Text style={[TYPE.sub, { color: m.byCoach ? c.link : m.kind === 'fix' ? c.warn : c.muted, fontWeight: '600' }]}>
            {m.byCoach ? (m.author ?? '코치') : COMMENT_KIND_LABEL[m.kind]} · {dayLabel(m.key)}
            {!m.byCoach && !m.resolved ? ' · 답 기다림' : ''}
          </Text>
          {m.videoPath && m.atSec != null ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${secText(m.atSec)} 순간 보기`} onPress={() => jump(m.videoPath!, m.atSec!)} hitSlop={6}>
              <Text style={[TYPE.sub, { color: c.link, fontWeight: '700' }]}>
                ▶ {videos.length > 1 ? `영상 ${videos.indexOf(m.videoPath) + 1} · ` : ''}
                {secText(m.atSec)}
              </Text>
            </Pressable>
          ) : null}
          <Text selectable style={[TYPE.body, { color: c.ink }]}>
            {m.body}
          </Text>
        </View>
      ))}
      {who.role === 'player' ? <ChoiceChips options={PLAYER_KINDS} value={ask} onChange={setAsk} c={c} /> : null}
      {who.role === 'coach' && shown ? (
        <View style={st.atRow}>
          <Text style={[TYPE.sub, { color: c.ink, flex: 1 }]}>지금 보는 순간에 말 달기</Text>
          <Switch accessibilityLabel="지금 보는 순간에 말 달기" value={atNow} onValueChange={setAtNow} />
        </View>
      ) : null}
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder={who.role === 'coach' ? (atNow ? '이 순간에 볼 것(예: 앞발이 일찍 열려요)' : '답 남기기') : ask === 'fix' ? '어디가 틀렸나요? (예: 던진 공 30구가 아니라 20구)' : '궁금한 것'}
        placeholderTextColor={c.muted}
        maxLength={COMMENT_MAX}
        multiline
        style={[st.input, { backgroundColor: c.page, color: c.ink }]}
        accessibilityLabel="할 말"
      />
      {error ? <Text style={[TYPE.sub, { color: c.danger }]}>{error}</Text> : null}
      <Pressable accessibilityRole="button" onPress={() => void send()} disabled={busy} style={{ alignSelf: 'flex-end', minHeight: 40, justifyContent: 'center' }}>
        <Text style={[TYPE.body, { color: c.link, fontWeight: '700', opacity: busy ? 0.5 : 1 }]}>{busy ? '보내는 중…' : '보내기'}</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: 10, borderLeftWidth: 2, paddingLeft: 10 },
  atRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  input: { minHeight: 64, borderRadius: 10, paddingHorizontal: 12, paddingTop: 10, fontSize: 16, textAlignVertical: 'top' },
});
