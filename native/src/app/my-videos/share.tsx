import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COUNTRY_LABEL, countryOf } from '@/lib/country';
import { OVERSEAS_KINDS, overseasKindByKey, type OverseasKind } from '@/lib/community-country';
import { POST_BODY_MAX, POST_TITLE_MAX } from '@/lib/community';
import type { MyVideoLog } from '@/lib/my-videos';
import { isPhoneVideoPath } from '@/lib/phone-video-path';
import {
  insertNote,
  newShareDraft,
  noteInBody,
  publicItems,
  sharePayload,
  shareTextError,
  type ShareAttempt,
  type ShareDraft,
} from '@/lib/video-share';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { useCountry } from '~/lib/country-store';
import { rpc } from '~/lib/rpc';
import { discardServerVideo } from '~/pitch/api';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { outboxOwner } from '~/workout/outbox';
import { DetailPlayer, type PlayerAvail } from '~/videos/detail-player';
import { FlowBar, FooterActions, Outcome, ProgressLine, VideoSummary, type FooterAction } from '~/videos/flow-parts';
import { bigText, checkShareFile, uploadShareCopy } from '~/videos/share';
import { clearShareDraft, keepShareDraft, loadShareDraft } from '~/videos/share-drafts';
import { findMyVideo, useMyVideos } from '~/videos/store';
import { videoDateText } from '~/videos/text';

/**
 * 내 영상 → 덕아웃에 올리기(2026-10-29 확정 시안 02-share) — 작성 → 게시 전 확인 → 사본 전송 → 게시글 등록 → (결과 확인) → 완료.
 *   - 대상 덕아웃은 계정이 정한다(서버 loadShareTarget). 화면은 고르지 않는다. 글 종류는 지금 공유 화면의 셋(폼 질문 · 훈련 기록 · 투수 팁) 그대로.
 *   - 영상 메모는 자동으로 안 붙는다 — '영상 메모 가져오기'로 확인한 뒤 본문에 넣을 때만 복사(그 뒤엔 일반 본문). 투구 기록은 기본 안 붙음, 붙이면 종류 · 공 수 · 날짜만.
 *   - 게시 전 확인에서 실제 게시될 모양 · 공개 항목 · 다른 사람 허락(따로 체크)을 보고 [덕아웃에 올리기]를 눌러야 올라간다.
 *   - 전송 100% 는 게시 완료가 아니다 — 등록 단계를 따로. 등록 답을 못 받으면 새로 만들지 않고 '게시 여부 확인'(같은 공유 사본으로 만든 글이 있나 묻기).
 *     같은 시도를 다시 보내면 서버가 같은 글을 돌려준다(공유 사본 경로가 열쇠 — lib/video-share.ts · app/actions/community.ts tryCreatePost).
 *   - 글 · 선택 · 시도 단계는 계정 + 영상마다 폰에 남는다(나갔다 와도 이어짐). 완료되면 그 초안만 지운다.
 */
type Target = { country: string; label: string; blocked: string | null };
const BUSY: readonly ShareAttempt['stage'][] = ['upload', 'register'];

type Ui = { draft: (d: ShareDraft) => void; progress: (p: number | null) => void; cancelable: (c: (() => void) | null) => void };

/*
 * 게시가 확인된 공유 사본 → 글(앱을 켠 동안). 확인 · 다시 올리기 · 늦게 온 답이 겹쳐도 한 번 완료된 시도는 완료로 남는다
 * (늦게 끝난 '아직 없음' 확인이 완료를 덮어 같은 사본으로 또 올리게 하지 않게).
 */
const settled = new Map<string, { postId: string; country: string | null }>();
function stepper(start: ShareDraft, ui: Ui) {
  let cur = start;
  const put = async (a: Partial<ShareAttempt>) => {
    const copy = a.copyPath ?? cur.attempt.copyPath;
    const done = copy ? settled.get(copy) : undefined;
    if (a.stage === 'done' && copy && a.postId) settled.set(copy, { postId: a.postId, country: a.country ?? null });
    else if (done) a = { stage: 'done', postId: done.postId, country: done.country, error: null };
    cur = { ...cur, attempt: { ...cur.attempt, ...a } };
    ui.draft(cur);
    if (cur.attempt.stage === 'done') await clearShareDraft(cur.owner, cur.path).catch(() => undefined);
    else await keepShareDraft(cur).catch(() => undefined);
  };
  return { put, cur: () => cur };
}
const errText = (e: unknown, fallback: string) => (e instanceof Error && /[가-힣]/.test(e.message) ? e.message : fallback);

/**
 * 올리기 — 사본(이미 올렸으면 건너뜀) → 등록. 단계마다 폰에 먼저 남긴다(화면을 나가도 이어서 남는다). 25초 안에 등록 답이 없으면 결과 확인 필요로 —
 * 그 뒤에 답이 오면(가는 중이던 요청) 완료로 바꾼다.
 */
async function runPublish(start: ShareDraft, kind: OverseasKind, ui: Ui): Promise<void> {
  const { put, cur } = stepper(start, ui);
  if (outboxOwner() !== start.owner) {
    await put({ stage: 'rejected', error: '로그인한 계정이 바뀌었어요. 이 글을 쓴 계정으로 다시 로그인하면 이어서 올릴 수 있어요.' });
    return;
  }
  if (!start.attempt.uploaded) {
    /* 올리다 만 사본은 정리할 목록으로 — 새 사본을 올린 뒤에 지운다(어디에도 안 붙었을 때만 서버가 지움) */
    const stale = start.attempt.copyPath ? [...start.attempt.stale, start.attempt.copyPath] : start.attempt.stale;
    await put({ stage: 'upload', copyPath: null, uploaded: false, error: null, stale });
    ui.progress(isPhoneVideoPath(start.path) ? 0 : null);
    let copy: string;
    try {
      copy = await uploadShareCopy(start.path, {
        onProgress: (p) => ui.progress(p),
        onPath: (p) => void put({ copyPath: p }),
        onCancelable: (c) => ui.cancelable(c),
      });
    } catch (e) {
      ui.cancelable(null);
      ui.progress(null);
      await put({ stage: 'failed', error: errText(e, '영상을 올리지 못했어요. 신호를 확인한 뒤 다시 시도해 주세요.') });
      return;
    }
    ui.cancelable(null);
    await put({ copyPath: copy, uploaded: true, stale: [] });
    for (const s of stale) void discardServerVideo(s);
  }
  ui.progress(null);
  await put({ stage: 'register', error: null });
  const d = cur();
  const sending = rpc<{ ok: true; id: string; country?: string } | { ok: false; error: string }>(
    'community.createAppPost',
    sharePayload({ category: kind.category, tag: kind.tag, title: d.title, body: d.body, copyPath: d.attempt.copyPath!, logId: d.logId })
  );
  const r = await Promise.race([sending.catch(() => null), new Promise<'wait'>((res) => setTimeout(() => res('wait'), 25000))]);
  if (r === 'wait' || r === null) {
    await put({ stage: 'uncertain' });
    /* 늦게 온 답 — 아직 확인 전이면 그대로 완료(같은 시도라 글은 하나) */
    if (r === 'wait')
      void sending.then(
        (x) => x.ok && cur().attempt.stage === 'uncertain' && void put({ stage: 'done', postId: x.id, country: x.country ?? null, error: null }),
        () => undefined
      );
    return;
  }
  if (!r.ok) {
    await put({ stage: 'rejected', error: r.error });
    return;
  }
  await put({ stage: 'done', postId: r.id, country: r.country ?? null, error: null });
}

/** 게시 여부 확인 — 이 사본으로 만든 내 글이 있나. 모르면(신호) 결과를 바꾸지 않고 글만 돌려준다 */
async function runCheck(start: ShareDraft, ui: Ui): Promise<string | null> {
  const cur = start;
  const { put } = stepper(start, ui);
  const copy = cur.attempt.copyPath;
  if (!copy || !cur.attempt.uploaded) {
    await put({ stage: 'notPosted', error: null });
    return null;
  }
  const r = await rpc<{ ok: true; id: string | null; country: string | null } | { ok: false; error: string }>('community.loadSharePost', copy).catch(() => null);
  if (!r) return '확인하지 못했어요. 신호가 잡히면 다시 확인해 주세요.';
  if (!r.ok) return r.error;
  if (r.id) {
    await put({ stage: 'done', postId: r.id, country: r.country, error: null });
    return null;
  }
  await put({ stage: 'notPosted', error: null });
  return null;
}

export default function ShareVideoScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const localCountry = useCountry();
  const { path } = useLocalSearchParams<{ path: string }>();
  /* 목록을 듣는다 — 바로 열렸을 때(앱을 다시 켬)도 받아 와서 찾는다 */
  const list = useMyVideos();
  const v = path ? findMyVideo(path) : null;
  const owner = outboxOwner();
  const pitchLogs: MyVideoLog[] = v ? v.logs.filter((l) => l.kind === 'pitch') : [];
  const [draft, setDraft] = useState<ShareDraft | null>(null);
  const [page, setPage] = useState<'write' | 'review'>('write');
  const [ack, setAck] = useState(false);
  const [file, setFile] = useState<Awaited<ReturnType<typeof checkShareFile>> | null>(null);
  const [avail, setAvail] = useState<PlayerAvail>('loading');
  const [target, setTarget] = useState<Target | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const [saveWarn, setSaveWarn] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const autoChecked = useRef(false);
  /* 새 초안의 글 종류 — 기록이 붙은 영상이면 '훈련 기록'(예전과 같음). 처음 값으로 고정(목록이 새로 와도 쓰던 초안을 다시 읽지 않게) */
  const [defaultKind] = useState(() => OVERSEAS_KINDS[pitchLogs.length ? 1 : 0].key);

  /* 초안 — 이 계정 · 이 영상의 것(없으면 새로). 기록이 붙은 영상이면 '훈련 기록'으로 시작(예전과 같음) */
  useEffect(() => {
    if (!owner || !path) return;
    let alive = true;
    const fresh = () => newShareDraft(owner, path, defaultKind);
    void loadShareDraft(owner, path).then(
      (d) => alive && setDraft(d ?? fresh()),
      () => alive && setDraft(fresh())
    );
    return () => {
      alive = false;
    };
  }, [owner, path, defaultKind]);
  /* 파일 — 이 기기에 있나 · 한도 안인가(올리기 전에 가른다) */
  useEffect(() => {
    if (!path) return;
    let alive = true;
    void checkShareFile(path).then(
      (f) => alive && setFile(f),
      () => alive && setFile({ ok: true, size: null })
    );
    return () => {
      alive = false;
    };
  }, [path]);
  /* 글 · 선택을 고칠 때마다 폰에 남긴다(0.4초 모아서). 올리는 중 · 완료는 단계 쪽이 남긴다 */
  const stage = draft?.attempt.stage ?? 'idle';
  useEffect(() => {
    if (!draft || BUSY.includes(stage) || stage === 'done') return;
    const t = setTimeout(
      () =>
        void keepShareDraft(draft).then(
          () => setSaveWarn(false),
          () => setSaveWarn(true)
        ),
      400
    );
    return () => clearTimeout(t);
  }, [draft, stage]);

  const ui: Ui = {
    draft: (d) => setDraft(d),
    progress: (p) => setProgress(p),
    cancelable: (cc) => {
      cancelRef.current = cc;
    },
  };
  const check = () => {
    if (!draft || checking) return;
    setChecking(true);
    setCheckNote(null);
    void runCheck(draft, ui).then((note) => {
      setChecking(false);
      setCheckNote(note);
    });
  };
  /* 돌아왔는데 결과 확인이 남았으면 한 번 저절로 묻는다(읽기만 — 새로 만들지 않음) */
  const autoCheck = useEffectEvent(() => {
    if (autoChecked.current || !draft) return;
    autoChecked.current = true;
    check();
  });
  useEffect(() => {
    if (stage === 'uncertain') autoCheck();
  }, [stage, draft]);

  const fallbackLabel = `${COUNTRY_LABEL[countryOf(localCountry)]} 덕아웃`;
  const label = draft?.attempt.country ? `${COUNTRY_LABEL[countryOf(draft.attempt.country)]} 덕아웃` : (target?.label ?? fallbackLabel);

  if (!v || !path) {
    if (path && (list.loading || (!list.items && !list.error)))
      return (
        <View style={[styles.center, { backgroundColor: c.page }]}>
          <ActivityIndicator />
        </View>
      );
    return (
      <View style={[styles.center, { backgroundColor: c.page }]}>
        <Text style={[TYPE.body, { color: c.muted }]}>영상을 찾지 못했어요.</Text>
        <Press accessibilityRole="button" onPress={() => router.back()}>
          <Text style={[TYPE.buttonCompact, { color: c.link }]}>돌아가기</Text>
        </Press>
      </View>
    );
  }
  if (!owner || !draft) {
    return (
      <View style={[styles.center, { backgroundColor: c.page }]}>
        {owner ? <ActivityIndicator /> : <Text style={[TYPE.body, { color: c.muted }]}>계정을 확인하지 못했어요. 잠시 뒤 다시 열어 주세요.</Text>}
      </View>
    );
  }

  const kind = overseasKindByKey(draft.kindKey) ?? OVERSEAS_KINDS[0];
  const edit = (patch: Partial<ShareDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const missing = file?.ok === false && file.reason === 'missing';
  const fileOk = !!file?.ok && avail !== 'missing' && avail !== 'gone';
  const big = file?.ok === false && file.reason === 'big';
  const textError = shareTextError(draft.title, draft.body);
  const log = pitchLogs.find((l) => l.id === draft.logId) ?? null;
  const note = v.note;
  const noteIn = noteInBody(draft.body, note);
  /* 보낼 초안 — 고른 기록이 이 영상에서 빠졌으면 안 붙인다(화면에 안 보이는 기록이 올라가지 않게) */
  const sendable: ShareDraft = { ...draft, logId: log?.id ?? null };

  const openReview = () => {
    if (textError || !fileOk) return;
    setNotice(null);
    setPage('review');
    void rpc<({ ok: true } & Target) | { ok: false; error: string }>('community.loadShareTarget').then(
      (r) => r.ok && setTarget({ country: r.country, label: r.label, blocked: r.blocked }),
      () => undefined
    );
  };
  const publish = () => {
    if (!ack || textError || !fileOk || BUSY.includes(stage)) return;
    setCheckNote(null);
    /* 올리기 직전 — 서버가 정한 덕아웃이 확인 화면에서 본 것과 같은지 다시 본다(그새 나라 · 계정이 바뀌었으면 다시 확인) */
    void rpc<({ ok: true } & Target) | { ok: false; error: string }>('community.loadShareTarget')
      .then(
        (r) => (r.ok ? r : null),
        () => null
      )
      .then((t) => {
        if (t && target && t.label !== target.label) {
          setTarget(t);
          setAck(false);
          setNotice(`올라갈 곳이 ${t.label}으로 바뀌었어요. 다시 확인한 뒤 올려 주세요.`);
          return;
        }
        if (t?.blocked) {
          setTarget(t);
          setNotice(t.blocked);
          return;
        }
        if (t) setTarget(t);
        return runPublish(sendable, kind, ui);
      });
  };
  const discardAll = () => {
    const a = draft.attempt;
    const copies = [...a.stale, ...(a.copyPath && a.stage !== 'done' ? [a.copyPath] : [])];
    void clearShareDraft(owner, path).then(
      () => {
        /* 어디에도 안 붙은 사본만 서버가 지운다(게시된 사본은 남음) */
        for (const p of copies) void discardServerVideo(p);
        router.back();
      },
      () => Alert.alert('취소하지 못했어요', '기기에 남긴 초안을 지우지 못했어요. 잠시 뒤 다시 해 주세요.')
    );
  };
  const back = () => {
    if (stage === 'upload')
      return Alert.alert('전송을 멈출까요?', '작성한 내용과 선택은 그대로 남아요. 다시 시도하면 처음부터 올려요.', [
        { text: '계속 올리기', style: 'cancel' },
        { text: '전송 멈추기', style: 'destructive', onPress: () => cancelRef.current?.() },
      ]);
    if (page === 'review' && stage === 'idle') return setPage('write');
    if (stage === 'idle' && (draft.title.trim() || draft.body.trim()))
      return Alert.alert('작성 중인 글', '작성한 내용을 남겨두고 나갈 수 있어요. 영상 화면에서 덕아웃에 올리기로 이어서 써요.', [
        { text: '계속 쓰기', style: 'cancel' },
        {
          text: '초안 남기고 나가기',
          onPress: () =>
            void keepShareDraft(draft).then(
              () => router.back(),
              () => Alert.alert('초안을 남기지 못했어요', '이 기기에 저장하지 못했어요. 잠시 뒤 다시 해 주세요.')
            ),
        },
        { text: '작성 취소', style: 'destructive', onPress: discardAll },
      ]);
    router.back();
  };
  const toWrite = () => {
    setPage('write');
    setDraft((d) => (d ? { ...d, attempt: { ...d.attempt, stage: 'idle', error: null } } : d));
  };
  const chooseKind = () => {
    const options = [...OVERSEAS_KINDS.map((k) => (k.key === kind.key ? `${k.label} ✓` : k.label)), '취소'];
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1, title: '글 종류' }, (i) => {
      const k = OVERSEAS_KINDS[i];
      if (k) edit({ kindKey: k.key });
    });
  };
  const importNote = () => {
    if (!note) return;
    if (noteIn) return Alert.alert('영상 메모', `${note}\n\n이미 본문에 들어 있어요.`);
    Alert.alert('영상 메모', `${note}\n\n본문에 복사돼요. 본문에서 자유롭게 고칠 수 있어요.`, [
      { text: '닫기', style: 'cancel' },
      {
        text: '본문에 넣기',
        onPress: () => {
          const r = insertNote(draft.body, note);
          if (r.ok) edit({ body: r.body });
          else if (r.reason === 'long') Alert.alert('본문에 메모를 넣을 공간이 부족해요', `내용은 ${POST_BODY_MAX}자까지예요. 본문을 줄인 뒤 다시 넣어 주세요.`);
        },
      },
    ]);
  };
  const audience = () =>
    Alert.alert(
      '공개되는 정보',
      `${label}에 게시돼요.\n선택한 영상의 사본과 작성한 제목 · 내용이 공개돼요. 투구 기록은 고른 경우에만 종류 · 공 수 · 날짜가 함께 올라가요.\n영상 메모는 본문에 넣은 내용만 공개돼요. 내 영상 원본은 나만 봐요.`
    );

  const media = fileOk ? (
    <DetailPlayer path={path} drawing={false} onDrawingDone={() => undefined} onAvail={setAvail} />
  ) : missing || avail === 'missing' || avail === 'gone' ? (
    <View style={[styles.mediaError, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
      <Icon name="film" size={26} color={c.muted} />
      <Text style={[TYPE.card, { color: c.ink }]}>이 기기에 영상이 없어요</Text>
      <Text style={[TYPE.body, { color: c.muted, textAlign: 'center' }]}>촬영한 기기의 싱커 앱에서 확인해 주세요.</Text>
    </View>
  ) : (
    <DetailPlayer path={path} drawing={false} onDrawingDone={() => undefined} onAvail={setAvail} />
  );
  const summary = (
    <VideoSummary path={path} title={draft.title.trim() || '제목 없음'} sub={`${label} · ${kind.label}`} />
  );
  const recordCard = log ? (
    <View style={[styles.record, { backgroundColor: withAlpha(c.action, 0.08) }]}>
      <Icon name="clipboard-list" size={20} color={c.link} />
      <View style={{ flex: 1 }}>
        <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>
          {log.type} · {log.count}구
        </Text>
        <Text style={[TYPE.sub, { color: c.muted }]}>{videoDateText(log.date)} · 투구 기록</Text>
      </View>
    </View>
  ) : null;

  let body: React.ReactNode;
  let footer: React.ReactNode;
  let title = '덕아웃에 올리기';
  let right: { label: string; onPress: () => void } | null = null;
  const editBtn: FooterAction = { label: '글 수정', icon: 'pencil', onPress: toWrite };
  const toLibrary: FooterAction = { label: '내 영상으로', onPress: () => router.back() };

  if (stage === 'upload' || stage === 'register') {
    body =
      stage === 'upload' ? (
        <Outcome icon="share" busy={progress === null} title="영상을 올리고 있어요" text={progress === null ? '공유용 사본을 서버에서 만들고 있어요.' : '공유용 사본을 전송하고 있어요.'}>
          {summary}
          {progress !== null ? <ProgressLine percent={progress} label="공유용 사본 전송률" /> : null}
        </Outcome>
      ) : (
        <Outcome icon="share" busy title="게시글을 등록하고 있어요" text="영상 전송은 끝났어요. 게시 완료를 확인하고 있어요.">
          {summary}
        </Outcome>
      );
    footer = (
      <FooterActions
        note={stage === 'register' ? '나가도 등록은 이어져요. 다시 열면 결과를 확인해요.' : '완료될 때까지 잠시 기다려 주세요.'}
        secondary={stage === 'upload' ? { label: '전송 멈추기', onPress: back } : null}
      />
    );
  } else if (stage === 'failed' || stage === 'rejected' || stage === 'notPosted') {
    body = (
      <Outcome
        icon={stage === 'notPosted' ? 'circle-alert' : 'refresh-cw'}
        tone="warn"
        title={stage === 'failed' ? '영상을 올리지 못했어요' : stage === 'rejected' ? '게시글을 등록하지 못했어요' : '아직 게시되지 않았어요'}
        text={
          stage === 'notPosted'
            ? '다시 올려도 같은 사본이라 한 번만 올라가요. 작성한 내용과 첨부 선택은 그대로예요.'
            : '작성한 내용과 첨부 선택은 그대로 남아 있어요.'
        }
      >
        {summary}
        {draft.attempt.error ? <Text style={[TYPE.sub, { color: c.danger, textAlign: 'center' }]}>{draft.attempt.error}</Text> : null}
      </Outcome>
    );
    footer = <FooterActions primary={{ label: stage === 'notPosted' ? '다시 올리기' : '다시 시도', icon: 'refresh-cw', onPress: () => void runPublish(sendable, kind, ui) }} secondary={editBtn} />;
  } else if (stage === 'uncertain') {
    body = (
      <Outcome icon="circle-alert" tone="warn" busy={checking} title="게시 결과를 확인하지 못했어요" text="중복으로 올리지 않도록 먼저 게시 여부를 확인할게요.">
        {summary}
        {checkNote ? <Text style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]}>{checkNote}</Text> : null}
      </Outcome>
    );
    footer = <FooterActions primary={{ label: checking ? '확인 중' : '게시 여부 확인', busy: checking, onPress: check }} secondary={{ ...toLibrary, disabled: checking }} />;
  } else if (stage === 'done') {
    title = '게시 완료';
    body = (
      <Outcome icon="check" tone="good" title={`${label}에 올렸어요`}>
        {summary}
      </Outcome>
    );
    footer = (
      <FooterActions
        primary={{ label: '게시글 보기', onPress: () => draft.attempt.postId && router.replace(`/community/${draft.attempt.postId}` as Href) }}
        secondary={toLibrary}
      />
    );
  } else if (page === 'review') {
    title = '게시 전 확인';
    right = { label: '수정', onPress: () => setPage('write') };
    body = (
      <>
        <Destination label={label} onInfo={audience} />
        <View style={[styles.post, { backgroundColor: c.card, boxShadow: c.float }]}>
          <View style={[styles.tag, { backgroundColor: withAlpha(c.action, 0.1) }]}>
            <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>{kind.label}</Text>
          </View>
          <Text style={[TYPE.section, { color: c.ink }]}>{draft.title.trim()}</Text>
          <Text style={[TYPE.reading, { color: c.ink }]}>{draft.body.trim()}</Text>
          {media}
          {recordCard}
        </View>
        <View style={{ gap: 4 }}>
          <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>공개 항목</Text>
          <Text style={[TYPE.body, { color: c.muted }]}>{publicItems(!!log).join(' · ')}</Text>
          <Text style={[TYPE.sub, { color: c.muted }]}>영상 메모는 본문에 넣은 내용만 공개돼요. 내 영상 원본은 나만 봐요.</Text>
        </View>
        <Press accessibilityRole="checkbox" accessibilityState={{ checked: ack }} onPress={() => setAck((x) => !x)} style={styles.row}>
          <Icon name="circle-check" size={24} color={ack ? c.action : withAlpha(c.ink, 0.25)} />
          <Text style={[TYPE.body, { flex: 1, color: c.ink }]}>영상에 다른 사람이 나오면 그 사람에게 공유 허락을 받았어요.</Text>
        </Press>
        {notice || target?.blocked ? (
          <Text accessibilityRole="alert" style={[TYPE.body, { color: c.danger }]}>
            {notice ?? target?.blocked}
          </Text>
        ) : null}
      </>
    );
    footer = (
      <FooterActions primary={{ label: `${label}에 올리기`, disabled: !ack || !!textError || !fileOk || !!target?.blocked, onPress: publish }} />
    );
  } else {
    body = (
      <>
        <Destination label={label} onInfo={audience} />
        {media}
        <View style={styles.metaRow}>
          <Text style={[TYPE.sub, { color: c.muted }]}>공유용 사본이 올라가요</Text>
          <Text style={[TYPE.sub, { color: c.muted }]}>원본은 내 영상에 보관</Text>
        </View>
        {big ? <Text style={[TYPE.body, { color: c.danger }]}>{bigText(file?.size ?? null)}</Text> : null}
        <Press accessibilityRole="button" accessibilityLabel={`글 종류, ${kind.label}, 바꾸기`} onPress={chooseKind} style={[styles.kindRow, { backgroundColor: c.card, boxShadow: c.float }]}>
          <Text style={[TYPE.body, { color: c.muted }]}>글 종류</Text>
          <Text style={[TYPE.body, { flex: 1, color: c.ink, fontWeight: '600', textAlign: 'right' }]}>{kind.label}</Text>
          <Icon name="chevron-down" size={16} color={c.muted} />
        </Press>
        <Text style={[TYPE.sub, { color: c.muted, marginTop: -8 }]}>{kind.what}</Text>
        <View style={{ gap: 6 }}>
          <TextInput
            value={draft.title}
            onChangeText={(t) => edit({ title: t })}
            maxLength={POST_TITLE_MAX}
            placeholder={kind.example}
            placeholderTextColor={c.muted}
            accessibilityLabel={`제목, ${POST_TITLE_MAX}자까지`}
            style={[styles.input, { color: c.ink, backgroundColor: c.card, boxShadow: c.float }]}
          />
          {draft.title.length >= POST_TITLE_MAX - 10 ? <Counter n={draft.title.length} max={POST_TITLE_MAX} /> : null}
          <TextInput
            value={draft.body}
            onChangeText={(t) => edit({ body: t })}
            multiline
            maxLength={POST_BODY_MAX}
            placeholder="영상과 함께 남길 내용"
            placeholderTextColor={c.muted}
            accessibilityLabel={`내용, ${POST_BODY_MAX}자까지`}
            style={[styles.input, styles.body, { color: c.ink, backgroundColor: c.card, boxShadow: c.float }]}
          />
          {draft.body.length >= POST_BODY_MAX - 500 ? <Counter n={draft.body.length} max={POST_BODY_MAX} /> : null}
          {note ? (
            <Press accessibilityRole="button" onPress={importNote} style={styles.noteBtn} hitSlop={6}>
              <Icon name="sticky-note" size={16} color={c.link} />
              <Text style={[TYPE.buttonCompact, { color: c.link }]}>{noteIn ? '가져온 메모 확인' : '영상 메모 가져오기'}</Text>
            </Press>
          ) : null}
        </View>
        {pitchLogs.length === 1 ? (
          <Press
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!log }}
            onPress={() => edit({ logId: log ? null : pitchLogs[0].id })}
            style={[styles.recordChoice, { backgroundColor: c.card, boxShadow: c.float }]}
          >
            <Icon name="circle-check" size={24} color={log ? c.action : withAlpha(c.ink, 0.25)} />
            <View style={{ flex: 1 }}>
              <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>투구 기록 함께 올리기</Text>
              <Text style={[TYPE.sub, { color: c.muted }]}>
                {pitchLogs[0].type} · {pitchLogs[0].count}구 · {videoDateText(pitchLogs[0].date)}
              </Text>
            </View>
          </Press>
        ) : pitchLogs.length > 1 ? (
          <View style={{ gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel="함께 올릴 투구 기록">
            <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>투구 기록 함께 올리기</Text>
            <View style={[styles.group, { backgroundColor: c.card, boxShadow: c.float }]}>
              {[null, ...pitchLogs].map((l) => {
                const on = (l?.id ?? null) === draft.logId;
                return (
                  <Press key={l?.id ?? 'none'} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => edit({ logId: l?.id ?? null })} style={styles.radio}>
                    <Icon name={on ? 'circle-check' : 'circle'} size={22} color={on ? c.action : withAlpha(c.ink, 0.3)} />
                    <Text style={[TYPE.body, { flex: 1, color: c.ink }]}>{l ? `${l.type} · ${l.count}구 · ${videoDateText(l.date)}` : '붙이지 않기'}</Text>
                  </Press>
                );
              })}
            </View>
          </View>
        ) : null}
        {saveWarn ? <Text style={[TYPE.sub, { color: c.warn }]}>작성 중인 글을 이 기기에 남기지 못했어요. 나가기 전에 올리거나 다시 시도해 주세요.</Text> : null}
      </>
    );
    footer =
      missing || avail === 'missing' || avail === 'gone' ? (
        <FooterActions primary={toLibrary} />
      ) : (
        <FooterActions
          primary={{ label: '게시 전 확인', disabled: !!textError || !fileOk || big, onPress: openReview }}
          note={textError && (draft.title || draft.body) ? textError : null}
        />
      );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Stack.Screen options={{ gestureEnabled: !BUSY.includes(stage) }} />
      <View style={{ height: inset.top }} />
      <FlowBar title={title} onBack={back} backDisabled={stage === 'register'} right={right} />
      <ScrollView keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: 32 }, READABLE]}>
        {body}
      </ScrollView>
      {footer}
    </View>
  );
}

function Destination({ label, onInfo }: { label: string; onInfo: () => void }) {
  const c = usePalette();
  return (
    <View style={styles.destination}>
      <Icon name="messages-square" size={18} color={c.link} />
      <Text style={[TYPE.card, { flex: 1, color: c.ink }]}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="공개되는 정보 안내" onPress={onInfo} hitSlop={8} style={styles.info}>
        <Icon name="info" size={20} color={c.muted} />
      </Pressable>
    </View>
  );
}

function Counter({ n, max }: { n: number; max: number }) {
  const c = usePalette();
  return <Text style={[TYPE.sub, { color: n >= max ? c.danger : c.muted, textAlign: 'right', fontVariant: ['tabular-nums'] }]}>{`${n}/${max}`}</Text>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  destination: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  info: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mediaError: { alignItems: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 24, borderRadius: 18 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: -8 },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 14, borderRadius: 14 },
  input: { borderRadius: 14, padding: 12, fontSize: 16, lineHeight: 22 },
  body: { minHeight: 140, textAlignVertical: 'top' },
  noteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44 },
  recordChoice: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, borderRadius: 14 },
  group: { borderRadius: 14, overflow: 'hidden' },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  post: { borderRadius: 18, padding: 16, gap: 10 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  record: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14 },
});
