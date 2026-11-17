import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EventDetail, PlanView } from '@/app/actions/app-team';
import { lineLoadHint, type LineLoadInfo, type WorkLine } from '@/lib/org/team-session';
import type { LibraryExercise } from '@/lib/library-load';
import { acceptsMass, resolveRecordingContract, type RecordingContract } from '@/lib/workout/load/contract';
import { overridesFor } from '@/lib/workout/load/overrides';
import { LOAD_PROTOCOL } from '@/lib/workout/load/protocol';
import { EMPTY_LOAD_DRAFT, LoadExtras, LoadNotice, buildSetLoad, loadDraftOfSet, loadPlan, showsKg, type LoadDraft } from '~/workout/load-input';
import { EXERCISE_LIST } from '~/library/parts';
import { rpc } from '~/lib/rpc';
import { cacheGet } from '~/lib/store';
import { TYPE, type Palette } from '~/lib/ui';
import { Card, Empty } from '~/org/parts';
import { Num, type Pick } from '~/org/picker';

/**
 * 처방 줄 고치기(팀 훈련 실제 확인 — 조 실제 · 선수 예외가 같이 쓴다). 줄마다 세트 · 횟수 · 초, 예외 줄은 무게까지(조 공통 무게는 없다, 계약 11-10 3).
 * 보낼 때 toLines 로 lib/org/team-session.ts WorkLine 모양으로.
 */
/**
 * ld — EX-LOAD01 R1-03: 선수가 이 줄에서 실제로 쓴 장비(밴드 · 역할 · 고른 변형 · 기구 이름 · 양손 무게). 운동 화면과 같은 고름 모양
 * (native/src/workout/load-model.ts LoadDraft). 손대지 않았으면 없다(그러면 예전처럼 kg 숫자만 보낸다).
 */
export type LineDraft = { id: string; kind: 'exercise' | 'drill'; name: string; sets: string; reps: string; sec: string; kg: string; ld?: LoadDraft };

type Contracts = Readonly<Record<string, RecordingContract>>;

const str = (n: number | undefined) => (n == null ? '' : String(n));
const num = (s: string) => (s.trim() ? Number(s) : undefined);

/** contracts(훈련 답의 contracts)를 주면 무게 기록 칸을 실은 줄을 그 고름으로 되살린다 */
export function fromLines(lines: readonly WorkLine[], names: Readonly<Record<string, string>>, contracts?: Contracts): LineDraft[] {
  return lines.flatMap((l) => {
    const id = l.exerciseId ?? l.guideId;
    if (!id) return [];
    const semantic = !!l.exerciseId && (l.load != null || l.variant != null);
    const ld = semantic ? loadDraftOfSet({ weightKg: l.weightKg ?? null, load: l.load ?? null, variant: l.variant ?? null }, contracts?.[id] ?? null, 'kg') : undefined;
    return [{ id, kind: l.exerciseId ? 'exercise' : 'drill', name: names[id] ?? '지운 운동', sets: str(l.sets), reps: str(l.reps), sec: str(l.holdSec), kg: str(l.weightKg), ...(ld ? { ld } : {}) }];
  });
}

/**
 * 줄 하나의 무게 칸 — 계약과 고름이 있으면 운동 화면과 같은 세트 만들기(buildSetLoad)로 밴드 · 섞인 무게 · 서로 다른 무게 · 기구 이름을 싣고
 * (새 화면의 약속 loadProtocol), 없으면 예전처럼 kg 숫자만. 실패면 고칠 말.
 */
function lineLoadFields(d: LineDraft, contract: RecordingContract | null | undefined, structured: boolean): { ok: true; fields: Partial<WorkLine> } | { ok: false; error: string } {
  const kg = num(d.kg) ?? null;
  if (!contract || !d.ld) return { ok: true, fields: kg != null ? { weightKg: kg } : {} };
  const b = buildSetLoad({ contract, draft: d.ld, structured, kg: showsKg(contract, d.ld.variant) && !d.ld.unequal ? kg : null, unit: 'kg' });
  if (!b.ok) return { ok: false, error: `${d.name}: ${b.error}` };
  const modern = b.load !== undefined || b.variant !== undefined;
  return {
    ok: true,
    fields: {
      ...(b.weightKg != null ? { weightKg: b.weightKg } : {}),
      ...(modern ? { loadProtocol: LOAD_PROTOCOL } : {}),
      ...(b.load !== undefined ? { load: b.load, loadResolver: b.loadResolver } : {}),
      ...(b.variant ? { variant: b.variant } : {}),
    },
  };
}

/** 보내기 전 — 장비를 고른 줄이 운동 화면 규칙에 맞나(양손 무게 · 고르기 · 밴드 역할). 맞으면 null */
export function linesLoadError(drafts: readonly LineDraft[], contracts?: Contracts, structured = false): string | null {
  for (const d of drafts) {
    if (d.kind !== 'exercise') continue;
    const r = lineLoadFields(d, contracts?.[d.id], structured);
    if (!r.ok) return r.error;
  }
  return null;
}

/**
 * loads(서버가 푼 계약 — 훈련 답의 loads)를 주면 무게를 받지 않는 운동의 kg 은 보내지 않는다(웹과 같다 — 서버도 그런 kg 을 받지 않는다).
 * EX-LOAD01 R1-03 — contracts 를 주면 장비를 고른 줄은 무게 기록 칸까지(보내기 전에 linesLoadError 로 먼저 본다).
 */
export function toLines(drafts: readonly LineDraft[], weight: boolean, loads?: Readonly<Record<string, LineLoadInfo>>, contracts?: Contracts, structured = false): WorkLine[] {
  return drafts.map((d) => {
    const base = {
      ...(d.kind === 'exercise' ? { exerciseId: d.id } : { guideId: d.id }),
      sets: num(d.sets),
      reps: num(d.reps),
      holdSec: num(d.sec),
    };
    if (!weight || d.kind !== 'exercise') return base;
    const r = d.ld ? lineLoadFields(d, contracts?.[d.id], structured) : null;
    if (r?.ok) return { ...base, ...r.fields };
    return { ...base, ...(loads?.[d.id]?.mass === false ? {} : { weightKg: num(d.kg) }) };
  });
}

/** 고르개(LibraryBrowser)의 고른 것 ↔ 줄 — 새로 고른 것만 빈 줄로 붙인다 */
export function picksOf(drafts: readonly LineDraft[]): Pick[] {
  return drafts.map((d) => ({ id: d.id, kind: d.kind, name: d.name, sets: '', reps: '' }));
}
export function withPicks(drafts: readonly LineDraft[], picks: readonly Pick[]): LineDraft[] {
  return picks.map((p) => drafts.find((d) => d.id === p.id) ?? { id: p.id, kind: p.kind, name: p.name, sets: '', reps: '', sec: '', kg: '' });
}

/*
 * EX-LOAD01 — 운동의 장비가 무게를 받는가(lib/workout/load/contract.ts 해석기 + 검토한 예외). 받지 않는 운동(맨몸 · 받침 · 밴드 · 장비 확인 중)
 * 에는 kg 칸을 내지 않는다(포고 홉에 kg 을 적게 하던 것). 장비는 운동 라이브러리 목록에서 읽는다(라이브러리 화면과 같은 받아 둔 값 · 같은 서버 동작).
 * 장비를 모르면(목록을 못 받음 · 숨긴 운동) 예전처럼 kg 칸을 둔다 — 서버의 코치 기록 검사가 마지막으로 거른다.
 */
const equipmentById = new Map<string, readonly string[]>();
let libraryAsked = false;
const takeLibrary = (r: unknown) => {
  const list = (r as { ok?: boolean; exercises?: LibraryExercise[] } | null)?.exercises;
  if (!Array.isArray(list)) return false;
  for (const e of list) if (e && typeof e.id === 'string' && Array.isArray(e.equipment)) equipmentById.set(e.id, e.equipment);
  return true;
};

/** 장비 목록을 한 번 받는다(앱을 켠 동안 한 번) — 받으면 다시 그리게 번호를 올린다 */
function useExerciseEquipment(enabled: boolean): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled || libraryAsked) return;
    libraryAsked = true;
    let alive = true;
    /* 받은 장비는 화면이 닫혀도 담아 둔다(다음에 열 때 바로) — 다시 그리기만 이 화면이 살아 있을 때 */
    void cacheGet('library:exercises').then((v) => {
      if (takeLibrary(v) && alive) setVersion((n) => n + 1);
    });
    rpc<unknown>(EXERCISE_LIST).then(
      (r) => {
        if (takeLibrary(r) && alive) setVersion((n) => n + 1);
      },
      () => {
        /* 못 받으면 다음에 이 화면을 열 때 다시 */
        libraryAsked = false;
      }
    );
    return () => {
      alive = false;
    };
  }, [enabled]);
  return version;
}

/**
 * 이 운동에 kg 을 적을 수 있나 — 서버가 푼 계약(loads)이 먼저(EX-LOAD01 R1-03 — 화면의 장비로 짐작하지 않는다), 없으면(옛 서버 답) 장비로 같은
 * 해석기를 돌린다. 둘 다 모르면 null(예전처럼 칸을 둔다).
 */
export function kgAllowed(exerciseId: string, equipment?: Readonly<Record<string, readonly string[]>>, loads?: Readonly<Record<string, LineLoadInfo>>): boolean | null {
  const info = loads?.[exerciseId];
  if (info) return info.mass;
  const eq = equipment?.[exerciseId] ?? equipmentById.get(exerciseId);
  if (!eq) return null;
  return acceptsMass(resolveRecordingContract({ exerciseId, equipment: eq, overrides: overridesFor(exerciseId) }));
}

/** 이 선수가 할 활동 — 대상인 활동에서 그 선수의 개인 '바꾸기'가 대신하는 조 활동을 뺀다(서버 memberPlans 와 같은 규칙) */
export function plansOfMember(d: EventDetail, memberId: string): PlanView[] {
  const mine = d.plans.filter((p) => p.targets.includes(memberId));
  const replaced = new Set(mine.filter((p) => p.scope === 'member' && p.replacesPlanId).map((p) => p.replacesPlanId!));
  return mine.filter((p) => !replaced.has(p.id));
}

export function LineEditor({
  lines,
  onChange,
  weight,
  empty,
  equipment,
  loads,
  contracts,
  structured = false,
  c,
}: {
  lines: LineDraft[];
  onChange: (next: LineDraft[]) => void;
  weight: boolean;
  empty: string;
  /** EX-LOAD01 — 운동 id → 장비(부르는 쪽이 알면). 없으면 운동 라이브러리 목록에서 읽는다 */
  equipment?: Readonly<Record<string, readonly string[]>>;
  /** EX-LOAD01 R1-03 — 운동 id → 서버가 푼 기록 계약 요약(훈련 답의 loads). 있으면 이것이 kg 칸을 정한다 */
  loads?: Readonly<Record<string, LineLoadInfo>>;
  /** EX-LOAD01 R1-03 — 운동 id → 계약 전체(훈련 답의 contracts). 있으면 운동 화면과 같은 장비 칸(밴드 · 고르기 · 기구 이름 · 양손 무게)을 낸다 */
  contracts?: Contracts;
  /** 구조화 저장이 켜져 있나(훈련 답의 loadStructured) — 꺼져 있으면 밴드 고르개 대신 '업데이트 뒤에' 한 줄 */
  structured?: boolean;
  c: Palette;
}) {
  /* 무게 칸이 있는 화면(선수 예외)에서만 장비를 받는다 — 서버 계약(loads)이 있으면 받지 않는다. 받으면 다시 그린다 */
  useExerciseEquipment(weight && !equipment && !loads);
  const patch = (i: number, v: Partial<LineDraft>) => onChange(lines.map((x, n) => (n === i ? { ...x, ...v } : x)));
  return (
    <Card c={c} style={{ paddingVertical: 4 }}>
      {lines.length === 0 ? <Empty text={empty} c={c} /> : null}
      {lines.map((x, i) => (
        <View key={`${x.id}-${i}`} style={[st.row, i < lines.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[TYPE.body, { color: c.ink, flex: 1 }]} numberOfLines={2}>
              {x.name}
              {x.kind === 'drill' ? ' · 드릴' : ''}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`${x.name} 빼기`} onPress={() => onChange(lines.filter((_, n) => n !== i))} hitSlop={8}>
              <Text style={{ color: c.danger, fontSize: 20 }}>×</Text>
            </Pressable>
          </View>
          {x.kind === 'exercise'
            ? (() => {
                /* EX-LOAD01 — 장비가 무게를 받지 않는 운동은 kg 칸 없음. 예전에 적힌 kg 은 말없이 버리지 않고 보이고, 사람이 [지우기]로 뺀다 */
                const contract = weight ? (contracts?.[x.id] ?? null) : null;
                const ld = x.ld ?? EMPTY_LOAD_DRAFT;
                /* 계약 전체가 있으면 운동 화면과 같은 규칙(고른 변형 · 양손 무게면 kg 칸 대신 왼손 · 오른손), 없으면 요약 · 장비로 */
                const kgAccepted = contract ? showsKg(contract, ld.variant) : weight && kgAllowed(x.id, equipment, loads) !== false;
                const kgOk = kgAccepted && !ld.unequal;
                const hint = weight && !kgOk && !contract ? lineLoadHint(loads?.[x.id]) : null;
                const notice = contract ? loadPlan(contract, ld.variant, structured).notice : null;
                return (
                  <>
                    <View style={st.nums}>
                      <Num value={x.sets} onChange={(sets) => patch(i, { sets })} unit="세트" max={2} c={c} />
                      <Num value={x.reps} onChange={(reps) => patch(i, { reps })} unit="회" max={3} c={c} />
                      <Num value={x.sec} onChange={(sec) => patch(i, { sec })} unit="초" max={3} c={c} />
                      {kgOk ? <Num value={x.kg} onChange={(kg) => patch(i, { kg })} unit="kg" max={5} decimal c={c} /> : null}
                    </View>
                    {hint && !x.kg.trim() ? <Text style={[TYPE.sub, { color: c.muted }]}>{hint}</Text> : null}
                    {/* EX-LOAD01 R1-03 — 선수가 실제로 쓴 장비(운동 화면과 같은 칸 · 같은 고르개). 지난 밴드 기억은 쓰지 않는다(선수의 기기 기억이 아니다) */}
                    {contract ? (
                      <LoadExtras
                        contract={contract}
                        structured={structured}
                        draft={ld}
                        onChange={(update) => patch(i, { ld: update(x.ld ?? EMPTY_LOAD_DRAFT) })}
                        unit="kg"
                        owner={null}
                        exerciseId={x.id}
                        remember={false}
                        title="선수가 쓴 장비"
                        c={c}
                      />
                    ) : null}
                    {notice ? <LoadNotice text={notice} c={c} /> : null}
                    {weight && !kgAccepted && x.kg.trim() ? (
                      <View style={st.legacy}>
                        <Text style={[TYPE.sub, { color: c.muted, flex: 1 }]}>기록된 무게 {x.kg}kg · 이 운동은 무게 없이 횟수 · 시간으로 기록해요</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={`${x.name} 기록된 무게 지우기`} onPress={() => patch(i, { kg: '' })} hitSlop={8}>
                          <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>지우기</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </>
                );
              })()
            : null}
        </View>
      ))}
    </Card>
  );
}

const st = StyleSheet.create({
  row: { gap: 4, paddingVertical: 8 },
  nums: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  legacy: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
});
