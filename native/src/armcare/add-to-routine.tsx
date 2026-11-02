import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { type Href, router } from 'expo-router';
import { MY_ROUTINE_MAX } from '@/lib/armcare/my-routines';
import { targetStatus, type RoutineChoice } from '@/lib/armcare/routine-target';
import type { Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { Sheet } from '~/workout/sheets';
import { s } from '~/training/screen';
import { initializeTargets, useRoutineTargets, refreshTargets, addToTarget, confirmTarget } from './routine-target-store';
export type { RoutineChoice } from '@/lib/armcare/routine-target';

const Enabled = createContext(false);

/** One account-scoped source for every exercise row, including after closing a sheet. */
export function MyRoutinesProvider({ children }: { routines: RoutineChoice[] | null; children: ReactNode }) {
  useEffect(() => { void initializeTargets(); }, []);
  return <Enabled.Provider value>{children}</Enabled.Provider>;
}
export function RoutineOperationNotice({ c }: { c: Palette }) {
  const st = useRoutineTargets();
  if (!st.op && !st.message) return null;
  return <View accessibilityLiveRegion="polite" style={[s.card, { backgroundColor: c.chip, gap: 8 }]}>
    <Text style={[s.small, { color: c.ink }]}>{st.op ? `${st.op.title} · ${st.op.status === 'adding' ? '루틴에 담는 중…' : '담기 결과 확인 필요'}` : st.message}</Text>
    {st.op?.status === 'unknown' ? <Press onPress={() => void confirmTarget()} disabled={st.checking} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}><Text style={[s.bodyBold, { color: c.link }]}>{st.checking ? '확인 중…' : '담기 결과 확인'}</Text></Press> : null}
  </View>;
}
export function AddToRoutine({ exerciseId, title, defaultSets, c }: { exerciseId: string; title: string; defaultSets?: number; c: Palette }) {
  const enabled = useContext(Enabled);
  const st = useRoutineTargets();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const submitted = useRef<string | null>(null);
  useEffect(() => {
    if (st.completed?.exerciseId === exerciseId && st.completed.routineId === submitted.current) {
      submitted.current = null;
      setOpen(false);
    }
  }, [st.completed, exerciseId]);
  const routines = st.routines;
  const busy = !!st.op || st.checking;
  const target = routines?.find((r) => r.id === selected);
  const allInside = !!routines?.length && st.fresh && routines.every((r) => targetStatus(r, exerciseId) === 'inside');
  const noneAvailable = !!routines?.length && st.fresh && routines.every((r) => targetStatus(r, exerciseId) !== 'available');
  const valid = !!target && targetStatus(target, exerciseId) === 'available' && st.fresh && !st.loading && !busy;
  if (!enabled) return null;
  return <>
    <Press onPress={() => { setSelected(null); setOpen(true); void initializeTargets(); }} accessibilityRole="button" accessibilityLabel={`${title} 내 루틴에 담기`} style={{ minWidth: 52, minHeight: 44, borderRadius: 22, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[s.smallBold, { color: c.link }]}>담기</Text>
    </Press>
    <Sheet open={open} fit onClose={() => setOpen(false)} title="내 루틴에 담기" description={title} c={c} footer={<View style={{ gap: 8 }}>
      {target && valid ? <Text style={[s.small, { color: c.muted }]}>{target.name}에 담기</Text> : null}
      <Press disabled={!valid && !allInside} accessibilityRole="button" accessibilityState={{ disabled: !valid && !allInside }} onPress={() => { if (allInside) return setOpen(false); if (target) { submitted.current = target.id; void addToTarget(target.id, exerciseId, title); } }} style={{ minHeight: 52, padding: 14, borderRadius: 20, alignItems: 'center', backgroundColor: valid ? c.action : c.chip }}><Text style={[s.bodyBold, { color: valid ? '#fff' : c.muted }]}>{allInside ? '목록으로 돌아가기' : st.op?.status === 'adding' ? '담는 중…' : '선택한 루틴에 담기'}</Text></Press>
    </View>}>
      <View style={{ gap: 12 }}>
        {defaultSets != null ? <Text style={[s.small, { color: c.muted }]}>기본 {defaultSets}세트</Text> : null}
        <RoutineOperationNotice c={c} />
        {st.loading ? <Text style={[s.small, { color: c.muted }]}>내 루틴 확인 중…</Text> : null}
        {st.error ? <View><Text style={[s.small, { color: c.warn }]}>{st.error}</Text><Press accessibilityRole="button" onPress={() => void initializeTargets()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={[s.bodyBold, { color: c.link }]}>다시 불러오기</Text></Press></View> : null}
        {selected && !target && !st.loading ? <Text style={[s.small, { color: c.warn }]}>선택한 루틴이 바뀌었어요. 다른 루틴을 선택해 주세요.</Text> : null}
        {routines?.length === 0 && st.fresh ? <Text style={[s.body, { color: c.muted }]}>저장한 루틴이 없어요.</Text> : null}
        {allInside ? <Text style={[s.small, { color: c.muted }]}>모든 루틴에 이미 담겨 있어요.</Text> : noneAvailable ? <Text style={[s.small, { color: c.muted }]}>지금 담을 수 있는 루틴이 없어요.</Text> : null}
        {routines?.map((r) => {
          const status = targetStatus(r, exerciseId);
          const disabled = busy || !st.fresh || st.loading || status !== 'available';
          const chosen = selected === r.id && status === 'available';
          return <Press key={r.id} onPress={() => setSelected(r.id)} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: chosen, disabled }} style={{ padding: 16, borderRadius: 20, borderWidth: 1, borderColor: chosen ? c.action : c.line, backgroundColor: chosen ? c.chip : c.card, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 5 }}><Text style={[s.bodyBold, { color: c.ink }]}>{r.name}</Text><Text style={[s.small, { color: c.muted }]}>{status === 'inside' ? '이미 담김' : status === 'full' ? '운동 15개 · 가득 참' : `운동 ${r.exerciseIds.length}개${r.exerciseIds.length === 14 ? ' · 1개 더 담을 수 있어요' : ''}`}</Text></View>
            <Icon name={chosen || status === 'inside' ? 'check' : 'plus'} size={18} color={chosen ? c.link : c.muted} />
          </Press>;
        })}
        {st.fresh && !st.loading && routines ? <Press disabled={busy} accessibilityRole="button" onPress={() => { setOpen(false); router.push((routines.length < MY_ROUTINE_MAX ? `/training/routine/new?add=${exerciseId}` : '/training-armcare?tab=today') as Href); }} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={[s.bodyBold, { color: busy ? c.muted : c.link }]}>{routines.length < MY_ROUTINE_MAX ? '이 운동으로 새 루틴 만들기' : '내 루틴 관리'}</Text></Press> : null}
        {!st.fresh && !st.loading && !st.error ? <Press onPress={() => void refreshTargets()} style={{ minHeight: 44 }}><Text style={{ color: c.link }}>내 루틴 확인</Text></Press> : null}
      </View>
    </Sheet>
  </>;
}
