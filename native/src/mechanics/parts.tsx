import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { josa } from '@/lib/korean';
import { mechanicsLevel } from '@/lib/mechanics/levels';
import { DRILL_THROW_TEXT, FILM_VERDICTS, type DrillThrowNote, type FilmVerdict } from '@/lib/mechanics/program';
import { rpc, RpcError } from '~/lib/rpc';
import type { Palette } from '~/lib/ui';
import { openWebAfter } from '~/shell/web-nav';

/** 메커니즘 따라 하기(native/src/app/mechanics.tsx)의 작은 조각 — 웹 mechanics-player.tsx · drill-throw-note.tsx · film-verdict.tsx 를 옮겼다 */

/** 화면을 닫고 웹을 그 주소로 — 껍데기(index.tsx)가 웹뷰를 옮긴다 */
export function leave(to: string) {
  openWebAfter(to);
  router.back();
}

/**
 * 서버 동작 부르기 — 웹 orOffline 처럼 던지지 않고 { error } 로 돌려준다(신호가 끊겨도 화면이 오류로 사라지지 않게). 로그인이 풀렸으면
 * 화면을 닫고 웹을 로그인으로 보낸다.
 */
export async function act<T extends object>(action: string, ...args: unknown[]): Promise<T | { error: string }> {
  try {
    return await rpc<T>(action, ...args);
  } catch (e) {
    if (e instanceof RpcError && e.code === 'redirect') {
      leave(e.to ?? '/login');
      return { error: e.message };
    }
    return { error: e instanceof RpcError && e.code !== 'offline' ? e.message : '인터넷 연결을 확인한 뒤 다시 해 주세요.' };
  }
}

/** 자세 설명 — 펼칠 때 받는다(content.guideDescription, 웹 Description 과 같은 길). null 은 못 받은 것 */
export function Description({ guideId, c }: { guideId: string; c: Palette }) {
  const [open, setOpen] = useState(false);
  const [got, setGot] = useState<{ text: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const failed = got != null && got.text == null;
  const load = () => {
    if (loading) return;
    setLoading(true);
    rpc<string | null>('content.guideDescription', guideId)
      .then(
        (text) => setGot({ text }),
        () => setGot({ text: null })
      )
      .finally(() => setLoading(false));
  };
  return (
    <View style={[s.card, { backgroundColor: c.card }]}>
      <Pressable
        onPress={() => {
          setOpen((v) => !v);
          if (!open && (got == null || failed)) load();
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={s.head}
      >
        <SymbolView name="info.circle" size={14} tintColor={c.muted} />
        <Text style={[s.bodyBold, { color: c.ink, flex: 1 }]}>자세 설명</Text>
        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={12} tintColor={c.muted} />
      </Pressable>
      {open ? (
        <View style={{ paddingBottom: 14 }}>
          {loading ? (
            <ActivityIndicator />
          ) : failed ? (
            <Pressable onPress={load} accessibilityRole="button" style={s.textBtn}>
              <Text style={[s.small, { color: c.muted }]}>
                설명을 불러오지 못했어요. <Text style={{ color: c.sky, fontWeight: '700' }}>다시 받기</Text>
              </Text>
            </Pressable>
          ) : got ? (
            <Text selectable style={[s.body, { color: c.ink }]}>
              {got.text}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * '드릴로 공을 약 N회 던졌어요 · 투구 기록에 남기기'(웹 drill-throw-note.tsx) — 투구 기록에 바로 넣지 않고 알린다. 남기기는 화면을 닫고
 * 웹을 그날 투구 기록(칸이 채워져 열림)으로, '이미 넣었어요 · 안 적을래요'는 그날 닫는다.
 */
/** 앱 투구 기록 폼을 드릴 공 수로 채워 연다(트레이닝 탭 카드와 같은 길) — 날짜를 못 읽으면 웹 화면으로 */
function recordThrows(note: DrillThrowNote) {
  const date = /\/pitch-log\/(\d{4}-\d{2}-\d{2})/.exec(note.href)?.[1];
  if (!date) return leave(note.href);
  router.push({ pathname: '/pitch/edit' as Href as never, params: { date, drill: String(note.throws), pct: String(note.effortPct) } });
}

export function ThrowNoteCard({ note, c }: { note: DrillThrowNote; c: Palette }) {
  const [closed, setClosed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (closed) return null;
  const close = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await act<{ ok: true }>('mechanics.closeDrillThrowNote');
    setPending(false);
    if ('error' in res) setError('신호가 약해 닫지 못했어요.');
    else setClosed(true);
  };
  return (
    <View style={[s.note, { backgroundColor: c.card }]}>
      <Text style={[s.bodyBold, { color: c.ink }]}>{DRILL_THROW_TEXT.line(note.throws)}</Text>
      <View style={s.row}>
        <Pressable onPress={() => recordThrows(note)} accessibilityRole="link" style={[s.chip, { backgroundColor: c.sky + '1a' }]}>
          <Text style={[s.smallBold, { color: c.sky }]}>{DRILL_THROW_TEXT.record}</Text>
          <SymbolView name="chevron.right" size={11} weight="semibold" tintColor={c.sky} />
        </Pressable>
        {[DRILL_THROW_TEXT.done, DRILL_THROW_TEXT.skip].map((t) => (
          <Pressable key={t} onPress={() => void close()} disabled={pending} accessibilityRole="button" style={[s.textBtn, { opacity: pending ? 0.5 : 1 }]}>
            <Text style={[s.small, { color: c.muted }]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

/** 찍어서 견준 뒤의 한 답(웹 film-verdict.tsx) — 세션 번호와 함께 남고 프로그램 칸이 '견준 기록'으로 보인다. 다시 누르면 바꾼다 */
export function FilmVerdictButtons({ session, c }: { session: number; c: Palette }) {
  const [saved, setSaved] = useState<FilmVerdict | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = async (verdict: FilmVerdict) => {
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await act<{ ok: true }>('mechanics.recordMechanicsFilm', verdict);
    setPending(false);
    if ('error' in res) setError(res.error);
    else {
      void Haptics.selectionAsync();
      setSaved(verdict);
    }
  };
  return (
    <View style={{ gap: 8 }}>
      <Text style={[s.smallBold, { color: c.muted }]}>처음 영상과 견줘 보니 어땠나요?</Text>
      <View accessibilityLabel="처음 영상과 견준 결과" style={s.grid}>
        {FILM_VERDICTS.map((v) => {
          const on = saved === v.value;
          return (
            <Pressable
              key={v.value}
              onPress={() => void pick(v.value)}
              disabled={pending}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[s.cell, { backgroundColor: on ? c.sky : c.chip, opacity: pending ? 0.6 : 1 }]}
            >
              <Text style={[s.smallBold, s.center, { color: on ? '#fff' : c.ink }]}>
                {on ? '✓ ' : ''}
                {v.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {saved ? <Text style={[s.small, { color: c.muted }]}>세션 {session}번 결과로 남겼어요. 다시 누르면 바꿔요.</Text> : null}
      {error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

/**
 * 다음 · 아래 수준 권하기(웹 LevelOffer) — 저절로 바꾸지 않는다. 누르면 그 수준의 1번 세션부터.
 * done: 12세션을 다 마침 · up: 여러 요소에서 '쉬움'이 쌓임 · down: '어려움'이 이어짐.
 */
export function LevelOffer({ kind, to, c }: { kind: 'done' | 'up' | 'down'; to: Parameters<typeof mechanicsLevel>[0]; c: Palette }) {
  const [state, setState] = useState<'ask' | 'changed' | 'keep'>('ask');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (state === 'keep') return null;
  const level = mechanicsLevel(to);
  const title =
    kind === 'done'
      ? `이 수준을 다 마쳤어요. ${level.name}${josa(level.name, '으로/로')} 가 볼까요?`
      : kind === 'up'
        ? `${level.name}${josa(level.name, '으로/로')} 올라가 볼까요?`
        : `${level.name}${josa(level.name, '으로/로')} 낮춰 볼까요?`;
  const detail =
    kind === 'down'
      ? '‘어려움’이 이어지는 요소가 있어요. 한 단계 낮은 수준에서 자세를 다지고 다시 올라와도 돼요.'
      : kind === 'up'
        ? '여러 요소에서 ‘쉬움’이 서로 다른 날 쌓였어요. 드릴이 편해졌다면 다음 수준이 더 맞을 수 있어요.'
        : '4주 동안 12번을 다 했어요. 편하지 않았다면 프로그램 칸에서 같은 수준을 한 번 더 해도 돼요.';
  const start = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await act<{ ok: true }>('mechanics.startMechanicsProgram', to);
    setPending(false);
    if ('error' in res) setError(res.error);
    else setState('changed');
  };
  return (
    <View style={[s.block, { backgroundColor: c.card }]}>
      {state === 'changed' ? (
        <Text style={[s.bodyBold, { color: c.ink }]}>
          {level.name} 프로그램으로 바꿨어요. 다음은 {level.name} 1번 세션이에요.
        </Text>
      ) : (
        <>
          <Text style={[s.blockTitle, { color: c.ink }]}>{title}</Text>
          <Text style={[s.body, { color: c.muted }]}>{detail}</Text>
          <View style={s.grid}>
            <Pressable
              onPress={() => void start()}
              disabled={pending}
              accessibilityRole="button"
              style={[s.cell, { backgroundColor: c.sky, opacity: pending ? 0.6 : 1 }]}
            >
              <Text style={[s.bodyBold, { color: '#fff' }]}>{pending ? '바꾸는 중…' : `${level.name} 시작`}</Text>
            </Pressable>
            <Pressable onPress={() => setState('keep')} disabled={pending} accessibilityRole="button" style={[s.cell, { backgroundColor: c.chip }]}>
              <Text style={[s.bodyBold, { color: c.ink }]}>나중에</Text>
            </Pressable>
          </View>
          {error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 12, paddingHorizontal: 14 },
  head: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 },
  textBtn: { minHeight: 44, paddingHorizontal: 6, justifyContent: 'center' },
  note: { borderRadius: 12, padding: 12, gap: 8, alignSelf: 'stretch' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  chip: { minHeight: 44, borderRadius: 22, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 4 },
  grid: { flexDirection: 'row', gap: 6 },
  cell: { flex: 1, minHeight: 48, borderRadius: 12, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  block: { borderRadius: 16, padding: 16, gap: 12, alignSelf: 'stretch' },
  blockTitle: { fontSize: 17, fontWeight: '700', lineHeight: 23 },
  small: { fontSize: 13, lineHeight: 18 },
  smallBold: { fontSize: 13, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  center: { textAlign: 'center' },
});
