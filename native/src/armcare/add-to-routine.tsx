import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { type Href, router } from 'expo-router';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MY_ROUTINE_MAX, MY_ROUTINE_MAX_ITEMS } from '@/lib/armcare/my-routines';
import type { Palette } from '~/lib/ui';
import { CHECK_CONNECTION } from '@/lib/offline';
import { OFFLINE_TEXT, act } from '~/mechanics/parts';
import { Sheet } from '~/workout/sheets';

/**
 * 부위별 보강의 운동 줄에서 내 루틴에 담는 단추 · 창 — 웹 app/(app)/training/add-to-routine.tsx 를 옮겼다(같은 서버 동작
 * armcare.addToMyArmcareRoutine). 루틴 목록은 부위별 보강 칸이 한 번 넘겨 준다(Provider) — 없는 곳(오늘 루틴 체크 목록)에서는 단추를 안 그린다.
 */
export type RoutineChoice = { id: string; name: string; exerciseIds: string[] };

const RoutinesContext = createContext<RoutineChoice[] | null>(null);

export function MyRoutinesProvider({ routines, children }: { routines: RoutineChoice[] | null; children: ReactNode }) {
  return <RoutinesContext.Provider value={routines}>{children}</RoutinesContext.Provider>;
}

export function AddToRoutine({ exerciseId, title, c }: { exerciseId: string; title: string; c: Palette }) {
  const routines = useContext(RoutinesContext);
  const [open, setOpen] = useState(false);
  /* 이 창에서 담은 것 — 다시 받기 전에도 ✓ 가 보이게 */
  const [addedTo, setAddedTo] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!routines) return null;

  const contains = (r: RoutineChoice) => r.exerciseIds.includes(exerciseId) || addedTo.includes(r.id);
  const add = async (r: RoutineChoice) => {
    if (pending) return;
    setPending(true);
    setMessage(null);
    const res = await act<{ ok: true; added: boolean }>('armcare.addToMyArmcareRoutine', r.id, exerciseId);
    setPending(false);
    /* 신호가 끊겼으면 웹 add-to-routine 과 같은 글 */
    if ('error' in res) return setMessage(res.error === OFFLINE_TEXT ? `담지 못했어요. ${CHECK_CONNECTION}` : res.error);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAddedTo((prev) => [...prev, r.id]);
    setMessage(res.added ? `'${r.name}'에 담았어요.` : `'${r.name}'에 이미 있어요.`);
  };

  return (
    <>
      <Pressable
        onPress={() => {
          setMessage(null);
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${title} 내 루틴에 담기`}
        style={[st.add, { borderColor: c.line }]}
      >
        <SymbolView name="plus" size={11} weight="semibold" tintColor={c.muted} />
        <Text style={[st.addText, { color: c.muted }]}>담기</Text>
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title="내 루틴에 담기" description={title} c={c}>
        <View style={{ gap: 12 }}>
          {routines.length === 0 ? (
            <Text style={[st.body, { color: c.muted }]}>아직 만든 루틴이 없어요. 이 운동으로 새 루틴을 시작해 보세요.</Text>
          ) : (
            routines.map((r) => {
              const inside = contains(r);
              const full = !inside && r.exerciseIds.length >= MY_ROUTINE_MAX_ITEMS;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => void add(r)}
                  disabled={pending || inside || full}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: pending || inside || full, selected: inside }}
                  style={[st.choice, inside ? { borderColor: c.sky, backgroundColor: c.sky + '14' } : { borderColor: c.line, backgroundColor: c.card }]}
                >
                  <Text style={[st.body, { color: inside ? c.sky : c.ink, fontWeight: '600', flex: 1 }]}>{r.name}</Text>
                  {inside ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <SymbolView name="checkmark" size={12} weight="bold" tintColor={c.sky} />
                      <Text style={[st.small, { color: c.sky, fontWeight: '600' }]}>담김</Text>
                    </View>
                  ) : (
                    <Text style={[st.small, { color: c.muted }]}>{full ? `${MY_ROUTINE_MAX_ITEMS}개 꽉 참` : `운동 ${r.exerciseIds.length}개`}</Text>
                  )}
                </Pressable>
              );
            })
          )}
          {message ? <Text style={[st.body, { color: c.sky }]}>{message}</Text> : null}
          {routines.length < MY_ROUTINE_MAX ? (
            <Pressable
              onPress={() => {
                setOpen(false);
                router.push(`/training/routine/new?add=${exerciseId}` as Href);
              }}
              accessibilityRole="button"
              style={[st.newBtn, { backgroundColor: c.chip }]}
            >
              <SymbolView name="plus" size={14} weight="semibold" tintColor={c.ink} />
              <Text style={[st.body, { color: c.ink, fontWeight: '600' }]}>이 운동으로 새 루틴 만들기</Text>
            </Pressable>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}

const st = StyleSheet.create({
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, alignSelf: 'flex-start' },
  addText: { fontSize: 12, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13 },
  choice: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  newBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12 },
});
