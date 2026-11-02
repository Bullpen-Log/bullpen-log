import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { toDateKey } from '@/lib/pitch-stats';
import type { LogPrefill, VelocitySessionView } from '@/lib/velocity-meta';
import { rpc } from '~/lib/rpc';
import { TYPE, usePalette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';
import { loadMe } from '~/pitch/api';
import { measuredFrom, type EntrySource } from '~/pitch/entry-model';
import { QuickStepEntry } from '~/pitch/quick-step';
import { monthOf, useMonth } from '~/pitch/store';

/**
 * 투구 기록 남기기 · 고치기 창(앱) — 그날 화면 밖에서 여는 입구: 트레이닝의 '드릴로 던진 공'(drill · pct), 지난 영상 가져오기(videos · importKey),
 * 기록 고치기(id), 옛 판의 구속 측정 링크(vsids). 입력은 그날 화면과 같은 퀵스텝(pitch/quick-step.tsx).
 * 저장하면 연 곳으로 돌아간다 — 가져오기는 그 목록으로 돌아가 다음 묶음을 이어 간다.
 */
const okDate = (d: string | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(new Date(`${d}T00:00:00.000Z`).getTime()) && new Date(`${d}T00:00:00.000Z`).toISOString().slice(0, 10) === d;

/** 주소에 실려 온 글자 목록 — 잘린 · 깨진 주소면 화면이 죽지 않고 빈 목록 */
function parseList(raw?: string): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

type Params = { date: string; id?: string; videos?: string; importKey?: string; drill?: string; pct?: string; vsids?: string };

export default function PitchEditScreen() {
  const p = useLocalSearchParams<Params>();
  if (!okDate(p.date)) return <Message text="날짜가 올바르지 않아요." onClose={() => router.back()} />;
  return <Entry {...p} />;
}

function Entry({ date, id, videos, importKey, drill, pct, vsids }: Params) {
  const { logs, error, loading, reload } = useMonth(monthOf(date));
  /* 이 화면에서 그 달을 한 번 다 받았는가 — 받아 둔 옛 달만 보고 '못 찾음'을 내지 않게 */
  const [fetched, setFetched] = useState(false);
  useEffect(() => {
    if (!loading) return;
    return () => setFetched(true);
  }, [loading]);
  /* 서버 날짜(시험 계정은 시뮬레이션 날짜) — 앞날에는 남기지 않는다 */
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    loadMe().then(
      (m) => setToday(m.today),
      () => setToday(toDateKey(new Date()))
    );
  }, []);
  const velocity = useVelocitySource(date, parseList(vsids));

  const close = () => router.back();
  if (today && date > today && !id) return <Message text={'앞으로 올 날짜에는 기록할 수 없어요.\n던지고 나서 그날 또는 그 뒤에 남겨 주세요.'} onClose={close} />;

  let source: EntrySource;
  if (id) {
    const editing = (logs ?? []).find((l) => l.id === id);
    if (!editing) {
      const missing = fetched && !loading && (logs != null || error != null);
      if (!missing) return <Message loading onClose={close} />;
      return error && !logs ? <Message text={error} onRetry={() => void reload()} onClose={close} /> : <Message text="이 기록을 찾지 못했어요. 지워졌을 수 있어요." onClose={close} />;
    }
    source = { kind: 'edit', log: editing };
  } else if (vsids) {
    if (velocity.state === 'loading') return <Message loading onClose={close} />;
    if (velocity.state === 'failed') return <Message text="측정을 불러오지 못했어요. 신호를 확인해 주세요." onRetry={velocity.retry} onClose={close} />;
    if (velocity.state === 'gone')
      return (
        <Message
          text="이 측정은 이미 기록에 이어졌거나 더는 이을 수 없어요. 그날 기록에서 확인해 주세요."
          onClose={() => {
            router.back();
            router.push(`/pitch/${date}` as never);
          }}
          closeLabel="그날 기록 보기"
        />
      );
    source = { kind: 'measured', m: velocity.m };
  } else if (drill && Number.parseInt(drill, 10) > 0 && /^\d+$/.test(drill)) {
    const p = Number(pct);
    source = { kind: 'drill', throws: Number(drill), effortPct: Number.isFinite(p) ? p : null };
  } else if (videos) {
    source = { kind: 'import', paths: parseList(videos), importKey };
  } else {
    source = { kind: 'new' };
  }

  return (
    <QuickStepEntry
      key={`${source.kind}:${id ?? ''}`}
      date={date}
      source={source}
      onDone={(r) => {
        toast(r.created ? '기록했어요' : '고쳤어요');
        router.back();
      }}
      onCancel={close}
    />
  );
}

/**
 * 옛 판의 측정 링크(vsids) — 주소의 숫자를 믿지 않고 서버가 그 날 · 그 계정으로 확인한 '아직 안 이은 측정'과 맞춰 본다.
 * 다 맞으면 그 값으로, 이미 이어졌거나 없으면 'gone'.
 */
function useVelocitySource(date: string, ids: string[]) {
  const key = ids.join(',');
  const [rev, setRev] = useState(0);
  type Got = { state: 'failed' } | { state: 'gone' } | { state: 'ok'; m: ReturnType<typeof measuredFrom> };
  /* 받은 답은 어느 물음(세션 · 다시 받기 차례)에 대한 것인지와 같이 둔다 — 다른 물음이면 아직 받는 중 */
  const [got, setGot] = useState<{ k: string; v: Got } | null>(null);
  const k = `${date}|${key}|${rev}`;
  useEffect(() => {
    if (!key) return;
    let alive = true;
    rpc<{ ok: true; sessions: VelocitySessionView[]; prefill: LogPrefill | null } | { ok: false; error: string }>('app.loadAppVelocityDay', date).then(
      (r) => {
        if (!alive) return;
        if (!r.ok) return setGot({ k, v: { state: 'failed' } });
        const want = key.split(',');
        const pf = r.prefill;
        const same = pf && pf.sessionIds.length === want.length && want.every((x) => pf.sessionIds.includes(x));
        setGot({ k, v: same && pf ? { state: 'ok', m: measuredFrom(pf, r.sessions) } : { state: 'gone' } });
      },
      () => alive && setGot({ k, v: { state: 'failed' } })
    );
    return () => {
      alive = false;
    };
  }, [date, key, k]);
  const v: Got | { state: 'loading' } = got?.k === k ? got.v : { state: 'loading' };
  return { ...v, retry: () => setRev((n) => n + 1) } as (Got | { state: 'loading' }) & { retry: () => void };
}

function Message({ text, loading, onRetry, onClose, closeLabel = '닫기' }: { text?: string; loading?: boolean; onRetry?: () => void; onClose: () => void; closeLabel?: string }) {
  const c = usePalette();
  return (
    <View style={[styles.center, { backgroundColor: c.page }]}>
      {loading ? (
        <ActivityIndicator accessibilityLabel="불러오는 중이에요" />
      ) : (
        <>
          <Text style={[TYPE.body, { color: c.ink, textAlign: 'center' }]}>{text}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {onRetry ? (
              <Press accessibilityRole="button" onPress={onRetry} style={[styles.btn, { backgroundColor: c.action }]}>
                <Text style={[TYPE.buttonCompact, { color: c.onAction }]}>다시 불러오기</Text>
              </Press>
            ) : null}
            <Press accessibilityRole="button" onPress={onClose} style={[styles.btn, { backgroundColor: c.chip }]}>
              <Text style={[TYPE.buttonCompact, { color: c.ink }]}>{closeLabel}</Text>
            </Press>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  btn: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, justifyContent: 'center' },
});
