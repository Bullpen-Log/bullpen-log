import * as Haptics from 'expo-haptics';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardUp } from '~/lib/use-keyboard-up';
import { COMMENT_BODY_MAX, REPORT_DETAIL_MAX, REPORT_REASONS, postCategoryLabel, type ReportReason } from '@/lib/community';
import type { loadAppCommunityPost } from '@/app/actions/community';
import { Badge, Bar, call, categoryColor, Chip, LoadState, s, useBusy, useLoad } from '~/community/parts';
import { useDraftGuard } from '~/community/draft-guard';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';
import { Icon } from '~/shell/icon';

/**
 * 글 하나(앱 화면) — 웹 app/(app)/community/[id]/page.tsx 를 옮겼다. 본문 · 좋아요 · 신고 · 댓글, 관리자는 가리기 · 되살리기까지.
 * 누가 무엇을 누를 수 있는지(canLike · canDelete …)는 서버가 웹과 같은 곳(lib/community-load.ts)에서 정해 보낸다 — 앱은 받은 대로 그린다.
 * 쓰기도 웹과 같은 서버 동작(community.*App* → app/actions/community.ts)이라 막기도 같다.
 */
type Loaded = Awaited<ReturnType<typeof loadAppCommunityPost>>;
type Post = NonNullable<Extract<Loaded, { ok: true }>['post']>;
type Ok = { ok: true } | { ok: false; error: string };
type Target = { postId: string } | { commentId: string };

export default function CommunityPostScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const keyboardUp = useKeyboardUp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, reload } = useLoad<Loaded>('community.loadAppCommunityPost', id);
  const post = data?.post;
  /* 누른 좋아요 — 받은 글(from)이 그대로일 때만 쓴다(돌아와 새로 읽으면 서버 값) */
  const [like, setLike] = useState<{ from: Post; liked: boolean; likes: number } | null>(null);
  const [report, setReport] = useState<Target | null>(null);
  /* 이번에 신고한 것 — 단추 대신 '접수했어요' */
  const [reported, setReported] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const send = useBusy();
  const scroll = useRef<ScrollViewInstance>(null);
  /* 적던 댓글이 있으면 나가기 전에 묻는다(올리면 칸이 비어 묻지 않는다) */
  useDraftGuard(!!comment.trim());

  if (!data || !post) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <Bar back="덕아웃" c={c} />
        {data && !post ? (
          <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', padding: 32 }}>글을 찾지 못했어요. 지워졌거나 볼 수 없는 글이에요.</Text>
        ) : (
          <LoadState error={error} onRetry={() => void reload()} c={c} />
        )}
      </View>
    );
  }

  const shown = like && like.from === post ? like : post;
  const toggleLike = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const want = !shown.liked;
    setLike({ from: post, liked: want, likes: shown.likes + (want ? 1 : -1) });
    /* 바라는 상태를 보내고 서버가 남긴 상태 · 수로 맞춘다 — 실패면 서버 값을 다시 읽는다(응답만 끊겼으면 이미 바뀌었을 수 있다) */
    const r = await call<{ ok: true; liked: boolean; likes: number }>('community.setAppLike', post.id, want);
    if (r.ok) setLike({ from: post, liked: r.liked, likes: r.likes });
    else {
      setLike(null);
      void reload();
    }
  };

  const confirm = (title: string, detail: string, run: () => Promise<void>) =>
    Alert.alert(title, detail, [
      { text: '취소', style: 'cancel' },
      { text: '지우기', style: 'destructive', onPress: () => void run() },
    ]);
  const removePost = () =>
    confirm('이 글을 지울까요?', `${post.title}\n댓글 · 좋아요도 함께 사라져요. 되돌릴 수 없어요.`, async () => {
      const r = await call<Ok>('community.deleteAppPost', post.id);
      if (!r.ok) return Alert.alert(r.error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    });
  const removeComment = (commentId: string) =>
    confirm('이 댓글을 지울까요?', '되돌릴 수 없어요.', async () => {
      const r = await call<Ok>('community.deleteAppComment', commentId);
      if (!r.ok) return Alert.alert(r.error);
      await reload();
    });
  const hide = async (kind: 'post' | 'comment', targetId: string, hidden: boolean) => {
    const r = await call<Ok>('community.setAppHidden', kind, targetId, !hidden);
    if (!r.ok) return Alert.alert(r.error);
    await reload();
  };
  const addComment = () =>
    send.run(async () => {
      if (!comment.trim()) return '댓글을 적어 주세요.';
      const r = await call<Ok>('community.addAppComment', post.id, comment);
      if (!r.ok) return r.error;
      setComment('');
      await reload();
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
      return null;
    });

  const textBtn = (label: string, onPress: () => void, color = c.muted, icon?: SFSymbol) => (
    <Press accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={styles.textBtn}>
      {icon ? <SymbolView name={icon} size={15} tintColor={color} /> : null}
      <Text style={{ color, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Press>
  );
  const reportedText = <Text style={{ color: c.muted, fontSize: 13 }}>신고를 접수했어요. 살펴볼게요.</Text>;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="덕아웃" c={c} />
      <ScrollView ref={scroll} contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: 24 }, READABLE]} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 12, opacity: post.hidden ? 0.7 : 1 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Badge text={postCategoryLabel(post.category)} color={categoryColor(post.category, c)} c={c} />
            {post.hidden ? (
              <Badge text={post.isAdmin ? '가림 · 관리자에게만 보여요' : '운영자가 가렸어요. 다른 사람에게는 보이지 않아요.'} color={c.danger} c={c} />
            ) : null}
          </View>
          <Text selectable style={{ color: c.ink, fontSize: 24, fontWeight: '700' }}>
            {post.title}
          </Text>
          <Text style={[s.meta, { color: c.muted }]}>
            <Text style={{ color: c.ink, fontWeight: '600' }}>{post.nickname}</Text>
            {'  '}
            {post.at}
          </Text>
          <Text selectable style={[s.body, { color: c.ink }]}>
            {post.body}
          </Text>
        </View>

        {/* 동작 줄 — 좋아요 · 댓글 수 왼쪽, 가리기 · 지우기 오른쪽 */}
        <View style={[styles.actions, { borderColor: c.line }]}>
          <Press
            accessibilityRole="button"
            accessibilityState={{ selected: shown.liked, disabled: !post.canLike }}
            accessibilityLabel={`${shown.liked ? '좋아요 취소' : '좋아요'} ${shown.likes}`}
            disabled={!post.canLike}
            onPress={toggleLike}
            style={[styles.like, { backgroundColor: shown.liked ? c.chip : 'transparent', borderColor: shown.liked ? c.danger : c.line }]}
          >
            <SymbolView name={shown.liked ? 'heart.fill' : 'heart'} size={16} tintColor={shown.liked ? c.danger : c.muted} />
            <Text style={{ color: shown.liked ? c.danger : c.ink, fontSize: 15, fontWeight: '600' }}>{shown.likes}</Text>
          </Press>
          <View style={styles.textBtn}>
            <Icon name="chat" size={17} color={c.muted} />
            <Text style={{ color: c.muted, fontSize: 15 }}>{post.commentCount}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {post.isAdmin ? textBtn(post.hidden ? '되살리기' : '가리기', () => void hide('post', post.id, post.hidden), c.muted, post.hidden ? 'eye' : 'eye.slash') : null}
          {post.canDelete ? textBtn('지우기', removePost, c.danger, 'trash') : null}
        </View>
        {post.canReport ? (reported.includes(post.id) ? reportedText : textBtn('신고', () => setReport({ postId: post.id }), c.muted, 'flag')) : null}

        <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>
          댓글 <Text style={{ color: c.muted }}>{post.commentCount}</Text>
        </Text>
        {post.comments.length === 0 ? (
          <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', paddingVertical: 16 }}>아직 댓글이 없어요. 첫 댓글을 남겨 보세요.</Text>
        ) : (
          <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
            {post.comments.map((m, i) => (
              <View
                key={m.id}
                style={[
                  styles.comment,
                  { opacity: m.hidden ? 0.55 : 1 },
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={{ color: c.ink, fontSize: 13, fontWeight: '600' }}>{m.nickname}</Text>
                  {m.mine ? <Badge text="나" c={c} /> : null}
                  {m.hidden ? <Badge text="가림" color={c.danger} c={c} /> : null}
                  <Text style={[s.meta, { color: c.muted }]}>{m.ago}</Text>
                </View>
                <Text selectable style={{ color: c.ink, fontSize: 15, lineHeight: 22 }}>
                  {m.body}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 4 }}>
                  {post.isAdmin ? textBtn(m.hidden ? '되살리기' : '가리기', () => void hide('comment', m.id, m.hidden)) : null}
                  {m.canReport ? (reported.includes(m.id) ? reportedText : textBtn('신고', () => setReport({ commentId: m.id }), c.muted, 'flag')) : null}
                  {m.canDelete ? textBtn('지우기', () => removeComment(m.id), c.danger, 'trash') : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* 가린 글에는 글쓴이도 댓글을 못 단다 — 아무도 못 보는 글이다(서버도 막는다) */}
      {post.canComment ? (
        <View style={[styles.composer, { backgroundColor: c.page, borderTopColor: c.line, paddingBottom: (keyboardUp ? 0 : inset.bottom) + 8 }]}>
          {send.error ? <Text style={{ color: c.danger, fontSize: 15 }}>{send.error}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              value={comment}
              onChangeText={setComment}
              maxLength={COMMENT_BODY_MAX}
              multiline
              placeholder="댓글을 남겨 보세요."
              placeholderTextColor={c.muted}
              accessibilityLabel="댓글"
              style={[styles.commentInput, { backgroundColor: c.card, color: c.ink }]}
            />
            <Press
              accessibilityRole="button"
              accessibilityLabel={send.busy ? '올리는 중' : '댓글 올리기'}
              onPress={addComment}
              disabled={send.busy || !comment.trim()}
              style={[styles.send, { backgroundColor: c.action, opacity: send.busy || !comment.trim() ? 0.4 : 1 }]}
            >
              <SymbolView name="paperplane.fill" size={18} tintColor="#fff" />
            </Press>
          </View>
        </View>
      ) : null}

      {report ? (
        <ReportSheet
          target={report}
          c={c}
          onClose={() => setReport(null)}
          onDone={(key) => {
            setReported([...reported, key]);
            setReport(null);
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** 신고 — 이유 하나 · 더 알려 줄 것(선택). 보내면 그 자리가 '접수했어요'로 바뀐다(웹 community-report-form.tsx 와 같다) */
function ReportSheet({ target, c, onClose, onDone }: { target: Target; c: Palette; onClose: () => void; onDone: (key: string) => void }) {
  const inset = useSafeAreaInsets();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const send = useBusy();
  const submit = () =>
    send.run(async () => {
      if (!reason) return '신고 이유를 골라 주세요.';
      const r = await call<Ok>('community.reportApp', { ...target, reason, detail });
      if (!r.ok) return r.error;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone('postId' in target ? target.postId : target.commentId);
      return null;
    });
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
        <View style={styles.sheetBar}>
          <Press accessibilityRole="button" onPress={onClose} hitSlop={10}>
            <Text style={{ color: c.link, fontSize: 17 }}>취소</Text>
          </Press>
          <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>신고</Text>
          <Press accessibilityRole="button" onPress={submit} disabled={send.busy} hitSlop={10}>
            <Text style={{ color: c.danger, fontSize: 17, fontWeight: '700', opacity: send.busy ? 0.4 : 1 }}>보내기</Text>
          </Press>
        </View>
        <ScrollView contentContainerStyle={[{ padding: 16, gap: 8, paddingBottom: inset.bottom + 24 }, READABLE]} keyboardShouldPersistTaps="handled">
          <Text style={[s.label, { color: c.muted }]}>왜 신고하나요?</Text>
          <View accessibilityRole="radiogroup" style={s.chips}>
            {REPORT_REASONS.map((r) => (
              <Chip key={r.key} label={r.label} on={reason === r.key} onPress={() => setReason(r.key)} color={c.danger} c={c} />
            ))}
          </View>
          <Text style={[s.label, { color: c.muted }]}>더 알려 줄 것(선택)</Text>
          <TextInput
            value={detail}
            onChangeText={setDetail}
            maxLength={REPORT_DETAIL_MAX}
            multiline
            placeholder="더 알려 줄 것이 있으면 적어 주세요."
            placeholderTextColor={c.muted}
            style={[s.area, { minHeight: 96, backgroundColor: c.card, boxShadow: c.float, color: c.ink }]}
          />
          {send.error ? <Text style={{ color: c.danger, fontSize: 15 }}>{send.error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  like: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 },
  textBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: 8 },
  comment: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 6 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 8, gap: 6 },
  commentInput: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 17 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
});
