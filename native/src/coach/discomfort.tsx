import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { loadDiscomfortAsk } from '@/app/actions/coach';
import { loadMe } from '~/pitch/api';
import { rpc } from '~/lib/rpc';
import { TYPE, type Palette } from '~/lib/ui';
import { ActionButton } from '~/shell/action-button';
import { Press } from '~/shell/press';

type Ask = Extract<Awaited<ReturnType<typeof loadDiscomfortAsk>>, { ok: true }>;

/**
 * 운동 끝 '불편했던 동작이 있었나요?'(docs/designs/ai-coach.md 10-5 U36) — 유료 · 코치 진행 중 · 건강정보 동의가 있을 때만(서버가 정한다).
 * 오늘 한 운동 중에서 여럿 고르기 · 건너뛰기. 고른 동작은 다음 운동에서 뒤로 미룬다(빼지는 않음). 진단은 하지 않는다.
 * 힘듦을 고른 뒤에만 그린다(그날 기록 줄에 붙여서 — 부르는 쪽 workout-done.tsx).
 */
export function DiscomfortAsk({ sessionId, c }: { sessionId: string; c: Palette }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [state, setState] = useState<'open' | 'saving' | 'saved' | 'skipped'>('open');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadMe()
      .then((me) => (me.coachPaid ? rpc<Awaited<ReturnType<typeof loadDiscomfortAsk>>>('coach.loadDiscomfortAsk', sessionId) : null))
      .then(
        (r) => {
          if (!alive || !r?.ask) return;
          setAsk(r);
          setPicked(new Set(r.chosen));
          if (r.chosen.length) setState('saved');
        },
        () => undefined
      );
    return () => {
      alive = false;
    };
  }, [sessionId]);
  if (!ask || !ask.items.length || state === 'skipped') return null;
  if (state === 'saved')
    return (
      <View style={[st.box, { backgroundColor: c.card, boxShadow: c.float }]}>
        <Text style={[TYPE.body, { color: c.ink }]}>
          {picked.size ? `불편했던 동작 ${picked.size}개를 남겼어요. 다음 운동에서 뒤로 미룰게요.` : '불편했던 동작 없음으로 남겼어요.'}
        </Text>
      </View>
    );

  const save = async (ids: string[]) => {
    setState('saving');
    setErr(null);
    try {
      const r = await rpc<{ ok: true } | { error: string }>('coach.saveDiscomfort', sessionId, ids);
      if ('error' in r) {
        setErr(r.error ?? '다시 눌러 주세요.');
        setState('open');
      } else setState('saved');
    } catch {
      setErr('신호가 약해요. 다시 눌러 주세요.');
      setState('open');
    }
  };
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <View style={[st.box, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[TYPE.card, { color: c.ink }]}>불편했던 동작이 있었나요?</Text>
      <Text style={[TYPE.sub, { color: c.muted }]}>고르면 다음 운동에서 뒤로 미뤄요. 계속 아프면 전문가와 상의해 주세요.</Text>
      <View style={st.chips}>
        {ask.items.map((x) => {
          const on = picked.has(x.id);
          return (
            <Press
              key={x.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => toggle(x.id)}
              style={[st.chip, { backgroundColor: on ? c.action : c.page, borderColor: on ? c.action : c.line }]}
            >
              <Text style={[TYPE.body, { color: on ? c.onAction : c.ink }]}>{x.name}</Text>
            </Press>
          );
        })}
      </View>
      {err ? <Text style={[TYPE.sub, { color: c.danger }]}>{err}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <ActionButton label="없었어요" tone="secondary" disabled={state === 'saving'} onPress={() => void save([])} style={{ flex: 1 }} />
        <ActionButton label="남기기" busy={state === 'saving'} disabled={!picked.size} onPress={() => void save([...picked])} style={{ flex: 1 }} />
      </View>
      <Press accessibilityRole="button" onPress={() => setState('skipped')} style={st.skip}>
        <Text style={[TYPE.sub, { color: c.muted }]}>건너뛰기</Text>
      </Press>
    </View>
  );
}

const st = StyleSheet.create({
  box: { borderRadius: 20, padding: 16, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  skip: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
