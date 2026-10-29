import { type Href, router, useLocalSearchParams } from 'expo-router';
import { formatSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FEEL_NOTE_MAX, cleanFeelNote, type MyVideoItem, type MyVideoLog } from '@/lib/my-videos';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { useFeatured } from '~/pitch/store';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';
import { rpc } from '~/lib/rpc';
import { DetailPlayer, type PlayerAvail } from '~/videos/detail-player';
import { startPickUi } from '~/videos/filters';
import { keepNoteDraft, loadNoteDraft } from '~/videos/note-drafts';
import { useShareDraftStage } from '~/videos/share-drafts';
import { deleteVideo, findMyVideo, linkVideo, refreshMyVideos, saveMyVideo, toggleFavorite, useMyVideos } from '~/videos/store';
import { durationText, videoDateText } from '~/videos/text';

/**
 * 영상 하나(내 영상 상세, 2026-10-29 시안) — 재생 → [다른 영상과 비교 | 선 · 각도] → 영상 메모(읽기 중심 · 편집 · 저장 상태) → 연결된 기록(요약 줄).
 * 더보기(⋯): 덕아웃에 올리기 · 기록 연결 관리 · 영상 정보 · 지우기. 오류는 그 일 가까이(메모는 메모 칸, 연결은 연결 칸 · 창, 지우기는 위 띠).
 * 영상 메모(UserVideo.feelNote)와 기록 총평(PitchLog.memo)은 다른 원본 — 총평은 기록 화면에서 고친다. 영상을 못 틀어도 메모 · 기록은 그대로 보인다.
 * 바로 들어왔을 때(목록 없이) — 받는 중 · 못 받음 · 없는 영상을 가른다(끝없이 도는 표시로 두지 않는다).
 */
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const SOURCE_TEXT: Record<MyVideoItem['dateSource'], string> = {
  header: '영상 파일에 적힌 촬영 날짜',
  camera: '앱에서 찍은 날짜',
  manual: '직접 고친 날짜',
  log: '촬영 날짜를 몰라 붙은 기록의 날짜',
  unknown: '촬영 날짜 모름',
};

export default function MyVideoScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { path } = useLocalSearchParams<{ path: string }>();
  const list = useMyVideos();
  const v = path ? findMyVideo(path) : null;
  const featured = useFeatured();
  const speed = usePrefs().speed;
  const [drawing, setDrawing] = useState(false);
  const [avail, setAvail] = useState<PlayerAvail>('loading');
  const [linking, setLinking] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const gone = useRef(false);
  const shareStage = useShareDraftStage(path ?? null);

  if (!v) {
    const waiting = list.loading || (!list.items && !list.error);
    return (
      <View style={[styles.center, { backgroundColor: c.page, paddingTop: inset.top, gap: 12, padding: 24 }]}>
        {waiting ? (
          <ActivityIndicator />
        ) : (
          <>
            <Icon name={list.items ? 'film' : 'refresh-cw'} size={30} color={c.muted} />
            <Text style={[TYPE.card, { color: c.ink, textAlign: 'center' }]}>{list.items ? '이 영상을 볼 수 없어요' : '영상 정보를 받지 못했어요'}</Text>
            <Text style={[TYPE.body, { color: c.muted, textAlign: 'center' }]}>
              {list.items ? '지웠거나, 다른 계정의 영상이거나, 아직 보내는 중일 수 있어요.' : (list.error ?? '')}
            </Text>
            {!list.items ? (
              <Press accessibilityRole="button" onPress={() => void refreshMyVideos()} style={[styles.pill, { backgroundColor: c.action }]}>
                <Text style={[TYPE.buttonCompact, { color: '#fff' }]}>다시 받기</Text>
              </Press>
            ) : null}
            <Press accessibilityRole="button" onPress={() => router.back()} style={[styles.pill, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
              <Text style={[TYPE.buttonCompact, { color: c.ink }]}>내 영상으로 돌아가기</Text>
            </Press>
          </>
        )}
      </View>
    );
  }

  const isFeatured = v.date != null && featured[v.date] === v.path;
  const [y, m, d] = v.date ? v.date.split('-').map(Number) : [0, 0, 0];
  const title = v.date ? `${m}월 ${d}일` : '촬영 날짜 모름';
  const sub = v.date
    ? [`${y}년 · ${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}요일`, v.dateSource === 'log' ? '기록 날짜' : null].filter(Boolean).join(' · ')
    : null;
  const fileOk = avail === 'ready';

  const remove = () => {
    if (v.clip) {
      Alert.alert('이 영상은 여기서 지울 수 없어요', '구속 측정 영상은 투구 기록의 구속 측정 칸에서 지워요.');
      return;
    }
    Alert.alert(
      '이 영상을 지울까요?',
      [
        v.logs.length ? `기록 ${v.logs.length}개에서도 빠져요. 투구수 · 강도는 그대로예요.` : null,
        isFeatured ? '그날 대표 영상에서도 빠져요.' : null,
        '영상 · 메모가 지워지고 되돌릴 수 없어요.',
      ]
        .filter(Boolean)
        .join('\n'),
      [
        { text: '취소', style: 'cancel' },
        {
          text: '지우기',
          style: 'destructive',
          onPress: async () => {
            setTopError(null);
            const r = await deleteVideo(v.path, v.logs.map((l) => l.date));
            if ('error' in r) {
              setTopError(`지우지 못했어요. ${r.error}`);
              return;
            }
            gone.current = true;
            void keepNoteDraft(v.path, null);
            if (r.cleanup) toast(r.cleanup, 'info');
            router.back();
          },
        },
      ]
    );
  };
  const info = () =>
    Alert.alert(
      '영상 정보',
      [
        `촬영 날짜 · ${v.date ? videoDateText(v.date) : '모름'}`,
        `날짜 출처 · ${SOURCE_TEXT[v.dateSource]}`,
        `보관 · ${v.storage === 'phone' ? '이 기기의 싱커 앱 안(앱을 지우면 함께 사라져요)' : '싱커 서버'}`,
        `길이 · ${durationText(v.durationSec) ?? '모름'}`,
        `종목 · ${v.sport === 'hit' ? '타격' : '투구'}`,
        `연결된 기록 · ${v.logs.length}개`,
        isFeatured ? '그날 대표 영상이에요' : null,
      ]
        .filter(Boolean)
        .join('\n')
    );
  const more = () => {
    /* 쓰던 공유가 있으면 그 상태로(결과 확인이 남았으면 그것부터 — 다시 올려 중복을 만들지 않게) */
    const shareLabel =
      shareStage === 'uncertain' || shareStage === 'register'
        ? '덕아웃 게시 여부 확인'
        : shareStage && shareStage !== 'done'
          ? '덕아웃에 올리기 · 작성 중'
          : '덕아웃에 올리기';
    const options = [shareLabel, '기록 연결 관리', '영상 정보', '영상 지우기', '취소'];
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 4, destructiveButtonIndex: 3 }, (i) => {
      /* 덕아웃은 기존 작성 화면으로(공유용 사본 · 나라 · 고른 정보만) — 한 번에 올리지 않는다 */
      if (i === 0) router.push({ pathname: '/my-videos/share' as never, params: { path: v.path } });
      else if (i === 1) setLinking(true);
      else if (i === 2) info();
      else if (i === 3) remove();
    });
  };
  const compare = () => {
    startPickUi();
    router.push({ pathname: '/pitch/compare' as never, params: { a: v.path, src: 'my-videos' } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <View style={[styles.bar, { paddingTop: inset.top + 4 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} hitSlop={6} style={styles.barButton}>
          <Icon name="back" size={22} color={c.link} />
        </Pressable>
        <View style={styles.barMid} accessible accessibilityRole="header" accessibilityLabel={[title, sub].filter(Boolean).join(', ')}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.6} style={[styles.barTitle, { color: c.ink }]}>
            {title}
          </Text>
          {sub ? (
            <Text numberOfLines={1} maxFontSizeMultiplier={1.6} style={[TYPE.sub, { color: c.muted }]}>
              {sub}
            </Text>
          ) : null}
        </View>
        <View style={styles.barRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={v.revisit ? '즐겨찾기에서 해제' : '즐겨찾기에 추가'}
            accessibilityState={{ selected: v.revisit }}
            onPress={() => void toggleFavorite(v.path)}
            style={({ pressed }) => [styles.barButton, pressed && { transform: [{ scale: 0.92 }] }]}
          >
            <Icon name="star" size={22} color={v.revisit ? c.link : c.muted} fill={v.revisit ? c.link : undefined} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="더보기" onPress={more} style={styles.barButton}>
            <Icon name="ellipsis" size={22} color={c.link} />
          </Pressable>
        </View>
      </View>
      <ScrollView
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}
      >
        {topError ? (
          <View style={[styles.band, { backgroundColor: withAlpha(c.danger, 0.1) }]} accessibilityRole="alert">
            <Text style={[TYPE.body, { color: c.ink }]}>{topError}</Text>
          </View>
        ) : null}
        <DetailPlayer path={v.path} drawing={drawing} onDrawingDone={() => setDrawing(false)} onAvail={setAvail} />
        <View style={styles.actions}>
          <ActionButton icon="squares" label="다른 영상과 비교" disabled={!fileOk} onPress={compare} />
          <ActionButton
            icon="ruler"
            label="선 · 각도"
            on={drawing}
            disabled={!fileOk}
            onPress={() => setDrawing((x) => !x)}
          />
        </View>
        {!fileOk && avail !== 'loading' ? (
          <Text style={[TYPE.sub, { color: c.muted }]}>
            {avail === 'missing' ? '이 기기에 영상 파일이 없어 비교 · 선 · 각도를 쓸 수 없어요. 메모와 기록은 그대로 볼 수 있어요.' : '영상을 불러온 뒤에 비교 · 선 · 각도를 쓸 수 있어요.'}
          </Text>
        ) : null}

        <NoteSection key={v.path} v={v} deleted={gone} />

        <View style={{ gap: 8 }}>
          <View style={styles.sectionHead}>
            <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink, flex: 1 }]}>
              연결된 기록
            </Text>
            <Press accessibilityRole="button" onPress={() => setLinking(true)} hitSlop={8} style={styles.linkBtn}>
              <Text style={[TYPE.body, { color: c.link, fontWeight: '600' }]}>관리</Text>
            </Press>
          </View>
          {v.logs.length ? (
            v.logs.map((l) => <LogRow key={`${l.kind}:${l.id}`} log={l} />)
          ) : (
            <Press accessibilityRole="button" onPress={() => setLinking(true)} style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
              <Text style={[TYPE.body, { color: c.muted }]}>연결된 기록이 없어요. 눌러서 그날 기록에 붙일 수 있어요. 투구수 · 강도는 바뀌지 않아요.</Text>
            </Press>
          )}
        </View>

        {v.clip ? (
          <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Text style={[TYPE.sub, { color: c.muted }]}>구속 측정</Text>
            <Text style={[TYPE.card, { color: c.ink }]}>
              {formatSpeed(v.clip.kmh, speed)}
              {v.clip.pitchType ? ` · ${v.clip.pitchType}` : ''}
            </Text>
          </View>
        ) : null}
        {v.storage === 'phone' ? <Text style={[TYPE.sub, { color: c.muted }]}>이 영상은 이 기기의 싱커 앱 안에만 있어요. 앱을 지우면 영상도 사라져요.</Text> : null}
      </ScrollView>
      {linking ? <LinkSheet v={v} onClose={() => setLinking(false)} /> : null}
    </View>
  );
}

function ActionButton({ icon, label, on, disabled, onPress }: { icon: IconName; label: string; on?: boolean; disabled?: boolean; onPress: () => void }) {
  const c = usePalette();
  return (
    <Press
      select={on !== undefined}
      selected={on}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: on }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, { backgroundColor: on ? c.action : c.card, boxShadow: c.float }, disabled && { opacity: 0.45 }]}
    >
      <Icon name={icon} size={19} color={on ? '#fff' : c.link} />
      <Text maxFontSizeMultiplier={1.6} numberOfLines={1} style={[TYPE.buttonCompact, { color: on ? '#fff' : c.ink }]}>
        {label}
      </Text>
    </Press>
  );
}

/**
 * 영상 메모 — 읽기가 먼저(눌러서 · 편집으로 고침), 고칠 땐 [취소][완료]. 저장 중 · 저장됨 · 저장 실패(다시 저장 — 같은 글로)를 칸 밑에.
 * 쓰는 글은 계정 + 경로로 폰에 남겨(note-drafts) 나갔다 와도 되살린다. 저장에 성공하면 서버가 다듬은 글(공백 · 줄바꿈 한 칸, 200자)이 원본.
 */
function NoteSection({ v, deleted }: { v: MyVideoItem; deleted: { current: boolean } }) {
  const c = usePalette();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(v.note ?? '');
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'failed'; error?: string }>({ kind: 'idle' });
  const [draft, setDraft] = useState<string | null>(null);
  const base = v.note ?? '';
  /* 들어올 때 — 쓰다 만 글이 있으면(저장된 메모와 다르면) 이어 쓰기를 권한다 */
  useEffect(() => {
    let alive = true;
    void loadNoteDraft(v.path).then((t) => {
      if (alive && t != null && cleanFeelNote(t) !== (v.note ?? null)) setDraft(t);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.path]);
  const keepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (keepTimer.current) clearTimeout(keepTimer.current);
    },
    []
  );
  const change = (t: string) => {
    setText(t);
    if (state.kind !== 'saving') setState({ kind: 'idle' });
    if (keepTimer.current) clearTimeout(keepTimer.current);
    keepTimer.current = setTimeout(() => {
      if (!deleted.current) void keepNoteDraft(v.path, t);
    }, 400);
  };
  const start = (from: string) => {
    setText(from);
    setDraft(null);
    setState({ kind: 'idle' });
    setEditing(true);
  };
  const save = async () => {
    if (deleted.current) return;
    const want = cleanFeelNote(text);
    if (want === (v.note ?? null)) {
      setEditing(false);
      setState({ kind: 'idle' });
      void keepNoteDraft(v.path, null);
      return;
    }
    if (keepTimer.current) clearTimeout(keepTimer.current);
    void keepNoteDraft(v.path, text);
    setState({ kind: 'saving' });
    const r = await saveMyVideo(v.path, { feelNote: text });
    if (r.dropped) return;
    if (r.superseded) return;
    if (r.ok) {
      setText(r.note ?? '');
      setEditing(false);
      setState({ kind: 'saved' });
      void keepNoteDraft(v.path, null);
    } else setState({ kind: 'failed', error: r.error });
  };
  const cancel = () => {
    const changed = cleanFeelNote(text) !== (v.note ?? null);
    const drop = () => {
      setText(base);
      setEditing(false);
      setState({ kind: 'idle' });
      void keepNoteDraft(v.path, null);
    };
    if (!changed) return drop();
    Alert.alert('고친 메모를 버릴까요?', '저장하지 않은 글은 사라져요.', [
      { text: '계속 쓰기', style: 'cancel' },
      { text: '버리기', style: 'destructive', onPress: drop },
    ]);
  };
  const n = [...text].length;
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.sectionHead}>
        <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink, flex: 1 }]}>
          영상 메모
        </Text>
        {!editing ? (
          <Press accessibilityRole="button" onPress={() => start(v.note ?? '')} hitSlop={8} style={styles.linkBtn}>
            <Text style={[TYPE.body, { color: c.link, fontWeight: '600' }]}>{v.note ? '편집' : '쓰기'}</Text>
          </Press>
        ) : null}
      </View>
      {draft != null && !editing ? (
        <View style={[styles.band, { backgroundColor: withAlpha(c.action, 0.1) }]}>
          <Text style={[TYPE.body, { color: c.ink }]} numberOfLines={3}>
            저장하지 않은 메모가 있어요 · {draft}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Press accessibilityRole="button" onPress={() => start(draft)} style={[styles.pill, { backgroundColor: c.action }]}>
              <Text style={[TYPE.buttonCompact, { color: '#fff' }]}>이어서 쓰기</Text>
            </Press>
            <Press
              accessibilityRole="button"
              onPress={() => {
                setDraft(null);
                void keepNoteDraft(v.path, null);
              }}
              style={[styles.pill, { backgroundColor: withAlpha(c.ink, 0.06) }]}
            >
              <Text style={[TYPE.buttonCompact, { color: c.ink }]}>버리기</Text>
            </Press>
          </View>
        </View>
      ) : null}
      {editing ? (
        <View style={{ gap: 8 }}>
          <TextInput
            value={text}
            onChangeText={change}
            multiline
            autoFocus
            maxLength={FEEL_NOTE_MAX}
            placeholder="예: 앞발 디딘 뒤 상체가 빨리 열림"
            placeholderTextColor={c.muted}
            accessibilityLabel={`영상 메모, ${n}자, 최대 ${FEEL_NOTE_MAX}자`}
            style={[styles.input, { color: c.ink, backgroundColor: c.card, boxShadow: c.float }]}
          />
          <View style={styles.editRow}>
            <Text style={[TYPE.sub, { color: state.kind === 'failed' ? c.danger : c.muted, flex: 1 }]} accessibilityLiveRegion="polite">
              {state.kind === 'saving'
                ? '저장하는 중'
                : state.kind === 'failed'
                  ? `저장하지 못했어요. ${state.error ?? ''} 글은 그대로 있어요.`
                  : `${n}/${FEEL_NOTE_MAX} · 줄바꿈 · 여러 칸 띄움은 저장할 때 한 칸으로 합쳐요.`}
            </Text>
            <Press accessibilityRole="button" disabled={state.kind === 'saving'} onPress={cancel} style={[styles.pill, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
              <Text style={[TYPE.buttonCompact, { color: c.ink }]}>취소</Text>
            </Press>
            <Press
              accessibilityRole="button"
              accessibilityState={{ disabled: state.kind === 'saving' }}
              disabled={state.kind === 'saving'}
              onPress={() => void save()}
              style={[styles.pill, { backgroundColor: c.action }, state.kind === 'saving' && { opacity: 0.6 }]}
            >
              {state.kind === 'saving' ? <ActivityIndicator color="#fff" /> : <Text style={[TYPE.buttonCompact, { color: '#fff' }]}>{state.kind === 'failed' ? '다시 저장' : '완료'}</Text>}
            </Press>
          </View>
        </View>
      ) : (
        <Press accessibilityRole="button" accessibilityHint="눌러서 메모를 고쳐요" onPress={() => start(v.note ?? '')} style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
          <Text style={[TYPE.reading, { color: v.note ? c.ink : c.muted }]}>{v.note ?? '아직 메모가 없어요. 이 영상에서 느낀 것을 남겨 보세요. 기록 총평과는 따로 저장돼요.'}</Text>
          {state.kind === 'saved' ? <Text style={[TYPE.sub, { color: c.ok }]}>저장됨</Text> : null}
        </Press>
      )}
    </View>
  );
}

/** 연결된 기록 한 줄 — 날짜 · 종류 · 수. 총평 · 감각은 접어 두고 펼쳐 본다(고치기는 기록 화면에서) */
function LogRow({ log }: { log: MyVideoLog }) {
  const c = usePalette();
  const [open, setOpen] = useState(false);
  const pitch = log.kind === 'pitch';
  const cues = [...log.cuesGood.map((q) => `좋았던 ${q}`), ...log.cuesBad.map((q) => `아쉬운 ${q}`)];
  const extra = !!log.memo || cues.length > 0;
  return (
    <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.float, padding: 0 }]}>
      <Press
        accessibilityRole={pitch ? 'link' : 'text'}
        accessibilityHint={pitch ? '그날 투구 기록을 열어요' : undefined}
        disabled={!pitch}
        onPress={() => router.push(`/pitch/${log.date}` as Href)}
        style={styles.logRow}
      >
        <View style={[styles.logIcon, { backgroundColor: withAlpha(c.action, 0.12) }]}>
          <Icon name="clipboard-list" size={18} color={c.link} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[TYPE.card, { color: c.ink }]} numberOfLines={1}>
            {log.type} · {log.count}
            {pitch ? '구' : '스윙'}
          </Text>
          <Text style={[TYPE.sub, { color: c.muted }]} numberOfLines={1}>
            {`${Number(log.date.slice(5, 7))}.${Number(log.date.slice(8))}`} · {pitch ? '투구 기록' : '타격 기록'}
          </Text>
        </View>
        {pitch ? <Icon name="chevron-right" size={18} color={c.muted} /> : null}
      </Press>
      {extra ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 6 }}>
          <Press accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((x) => !x)} hitSlop={6} style={{ minHeight: 32, justifyContent: 'center' }}>
            <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>{open ? '총평 · 감각 접기' : '총평 · 감각 보기'}</Text>
          </Press>
          {open ? (
            <>
              {log.memo ? <Text style={[TYPE.body, { color: c.ink }]}>기록 총평 · {log.memo}</Text> : null}
              {cues.length ? <Text style={[TYPE.sub, { color: c.muted }]}>{cues.join(' · ')}</Text> : null}
              {pitch ? <Text style={[TYPE.sub, { color: c.muted }]}>총평은 그날 투구 기록에서 고쳐요.</Text> : null}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type LinkTarget = { kind: 'pitch' | 'hit'; id: string; date: string; type: string; count: number; videos: number };

/**
 * 기록 연결 관리 — 붙은 기록은 [연결 해제](기록에서만 빠짐 — 영상 · 메모 그대로), 아래는 그날(모르면 최근 14일) 기록에 연결(투구수 · 강도 그대로, 기록 하나에 영상 2개까지).
 * 오류는 이 창 안에(메모 칸이 아니라).
 */
function LinkSheet({ v, onClose }: { v: MyVideoItem; onClose: () => void }) {
  const c = usePalette();
  const [logs, setLogs] = useState<LinkTarget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void rpc<{ ok: true; logs: LinkTarget[] } | { ok: false; error: string }>('my-videos.loadMyVideoLinkTargets', v.date).then(
      (r) => alive && (r.ok ? (setLogs(r.logs), setError(null)) : setError(r.error)),
      () => alive && setError('신호가 약해 기록을 못 받았어요.')
    );
    return () => {
      alive = false;
    };
  }, [v.date, attempt]);
  const has = (l: { kind: string; id: string }) => v.logs.some((x) => x.kind === l.kind && x.id === l.id);
  const run = async (target: { kind: 'pitch' | 'hit'; id: string; date: string }, on: boolean) => {
    setBusy(true);
    setError(null);
    const err = await linkVideo(v.path, target, on);
    setBusy(false);
    if (err) setError(err);
    else toast(on ? '기록에 연결했어요' : '연결을 해제했어요', 'success');
  };
  const unlink = (l: MyVideoLog) =>
    Alert.alert('이 기록에서 영상을 뗄까요?', '기록에서만 빠져요. 영상 · 메모는 내 영상에 남아요.', [
      { text: '취소', style: 'cancel' },
      { text: '연결 해제', onPress: () => void run(l, false) },
    ]);
  const targets = logs?.filter((l) => !has(l)) ?? null;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <View style={[styles.bar, { paddingTop: 12 }]}>
          <View style={styles.barButton} />
          <Text accessibilityRole="header" style={[TYPE.card, { flex: 1, textAlign: 'center', color: c.ink }]}>
            기록 연결 관리
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} hitSlop={6} style={styles.barButton}>
            <Icon name="x" size={20} color={c.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
          {error ? (
            <View style={[styles.band, { backgroundColor: withAlpha(c.danger, 0.1) }]} accessibilityRole="alert">
              <Text style={[TYPE.body, { color: c.ink }]}>{error}</Text>
              {!logs ? (
                <Press accessibilityRole="button" onPress={() => setAttempt((x) => x + 1)} style={[styles.pill, { backgroundColor: c.action, alignSelf: 'flex-start' }]}>
                  <Text style={[TYPE.buttonCompact, { color: '#fff' }]}>다시 받기</Text>
                </Press>
              ) : null}
            </View>
          ) : null}
          <Text style={[TYPE.sub, { color: c.muted, fontWeight: '700' }]}>연결된 기록 {v.logs.length}개</Text>
          {v.logs.length === 0 ? <Text style={[TYPE.body, { color: c.muted }]}>아직 없어요.</Text> : null}
          {v.logs.map((l) => (
            <View key={`${l.kind}:${l.id}`} style={[styles.card, styles.targetRow, { backgroundColor: c.card, boxShadow: c.float }]}>
              <View style={{ flex: 1 }}>
                <Text style={[TYPE.card, { color: c.ink }]}>
                  {l.type} · {l.count}
                  {l.kind === 'pitch' ? '구' : '스윙'}
                </Text>
                <Text style={[TYPE.sub, { color: c.muted }]}>
                  {videoDateText(l.date)} · {l.kind === 'pitch' ? '투구 기록' : '타격 기록'}
                </Text>
              </View>
              <Press accessibilityRole="button" disabled={busy} onPress={() => unlink(l)} style={[styles.pill, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
                <Text style={[TYPE.buttonCompact, { color: c.ink }]}>연결 해제</Text>
              </Press>
            </View>
          ))}
          <Text style={[TYPE.sub, { color: c.muted, fontWeight: '700', marginTop: 8 }]}>
            {v.date ? `${videoDateText(v.date)} 기록` : '최근 14일 기록'}에 연결
          </Text>
          <Text style={[TYPE.sub, { color: c.muted }]}>연결해도 투구수 · 강도 · 총평은 그대로예요. 기록 하나에 영상 2개까지.</Text>
          {!logs && !error ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}
          {targets && targets.length === 0 ? <Text style={[TYPE.body, { color: c.muted, paddingVertical: 12 }]}>연결할 수 있는 기록이 없어요.</Text> : null}
          {targets?.map((l) => {
            const full = l.videos >= 2;
            return (
              <Press
                key={`${l.kind}:${l.id}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: full || busy }}
                accessibilityHint={full ? '영상이 2개라 더 못 붙여요' : undefined}
                disabled={full || busy}
                onPress={() => void run(l, true)}
                style={[styles.card, styles.targetRow, { backgroundColor: c.card, boxShadow: c.float }, full && { opacity: 0.5 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[TYPE.card, { color: c.ink }]}>
                    {l.type} · {l.count}
                    {l.kind === 'pitch' ? '구' : '스윙'}
                  </Text>
                  <Text style={[TYPE.sub, { color: c.muted }]}>
                    {videoDateText(l.date)} · {full ? '영상이 2개라 더 못 붙여요' : `영상 ${l.videos}/2`}
                  </Text>
                </View>
                {!full ? <Icon name="plus" size={18} color={c.link} /> : null}
              </Press>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 6, minHeight: 56 },
  barButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  barMid: { position: 'absolute', left: 96, right: 96, bottom: 6, alignItems: 'center' },
  barTitle: { fontSize: 19, fontWeight: '700', letterSpacing: -0.4 },
  barRight: { marginLeft: 'auto', flexDirection: 'row' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { flexGrow: 1, flexBasis: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: 18, paddingHorizontal: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  linkBtn: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  card: { gap: 6, padding: 16, borderRadius: 18 },
  band: { gap: 10, padding: 12, borderRadius: 14 },
  input: { minHeight: 110, borderRadius: 16, padding: 14, fontSize: 17, lineHeight: 25, textAlignVertical: 'top' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pill: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 64 },
  logIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
