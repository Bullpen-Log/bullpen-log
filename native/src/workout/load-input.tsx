import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { BAND_CATALOG_REVISION, BAND_SERIES, CUSTOM_TEXT_MAX, MAX_BANDS, bandText, cleanBandComponent, seriesById, type BandComponent } from '@/lib/workout/load/band-catalog';
import type { RecordingContract } from '@/lib/workout/load/contract';
import { SETUP_TEXT_MAX, type BandRoleRecorded } from '@/lib/workout/load/recorded';
import type { WeightUnit } from '@/lib/units';
import type { Palette } from '~/lib/ui';
import { Segmented } from '~/shell/heading';
import { Press } from '~/shell/press';
import { activeContract, fixedRole, loadPlan, recallBands, recallRole, type LoadDraft } from '~/workout/load-model';

export * from '~/workout/load-model';

/**
 * EX-LOAD01 — 운동 화면(native/src/app/workout.tsx)의 장비 기록 칸. 무엇을 적는지는 그 판에 얼린 기록 계약(RunExercise.load)만 정한다:
 *   - 맨몸 · 받침(none) · 장비 확인 중(unresolved) → kg 칸 없음(횟수 · 시간만).
 *   - 바벨 · 덤벨 · 케이블 · 도구 → kg 칸(이름은 '무게(봉 포함)' · '무게(한 손 · 한 개)' · '케이블 머신 설정값' 처럼 계약이 말한다). 두 배로 셈하지 않는다.
 *   - 밴드 → 상표 → 계열 → 단계(글과 색 점을 같이, 글은 늘 보인다). 임의 kg 없음.
 *   - 밴드 + 무게(combined) → 둘 다 따로. 밴드 · 무게 중 고르기(alternative) → 세트마다 [밴드 | 무게].
 * 서버가 구조화 무게를 아직 저장할 수 없으면(loadCapability.structured false · 옛 서버) 밴드 고르개 · 기구 이름 · 양손 다른 무게는 내지 않고
 * '업데이트 뒤에' 한 줄만 — 저장되지 않을 값을 고르게 하지 않는다.
 *
 * 여기는 그리는 부분(LoadExtras · LoadNotice)이다. 화면 없이 셈하는 부분(buildSetLoad · loadDraftOfSet · setLoadText · 기억)은 load-model.ts
 * (여기서 다시 내보낸다 — node 시험이 RN 없이 부른다). 보내기 전 검사는 서버와 같은 lib/workout/load/recorded.ts normalizeSetLoad 로 운동 화면이 한다.
 */

/* ───────────────────────────── 그림 ───────────────────────────── */

const ROLE_CHOICES: { value: BandRoleRecorded; label: string }[] = [
  { value: 'resistance', label: '저항' },
  { value: 'assistance', label: '보조' },
  { value: 'unknown', label: '모름' },
];
const VARIANTS = [
  { value: 'band', label: '밴드' },
  { value: 'mass', label: '무게' },
] as const;
const BRANDS = [...new Set(BAND_SERIES.map((s) => s.brand))];

type Picking = { step: 'brand' } | { step: 'series'; brand: string } | { step: 'level'; seriesId: string } | { step: 'custom' };

/** 아래 막대의 한 줄 안내 — 장비 확인 중 · 업데이트 뒤에 저장 */
export function LoadNotice({ text, c }: { text: string; c: Palette }) {
  return <Text style={[st.small, { color: c.muted, textAlign: 'center' }]}>{text}</Text>;
}

/**
 * 이번 세트 장비 — [밴드 | 무게] · 밴드 역할 · 밴드(상표 → 계열 → 단계 · 다른 상표) · 기구 이름 · 양손 다른 무게. 고른 것은 다음 세트부터 쓰이고,
 * 이미 남긴 세트는 바뀌지 않는다. 운동이 바뀌면 운동 화면이 새로 그린다(key).
 */
export function LoadExtras({
  contract,
  structured,
  draft,
  onChange,
  unit,
  owner,
  exerciseId,
  variantOnly = false,
  remember = true,
  onRecall,
  title = '이번 세트 장비',
  forTarget = false,
  c,
}: {
  contract: RecordingContract | null;
  structured: boolean;
  draft: LoadDraft;
  /** 고름 바꾸기 — 늦게 읽힌 기억이 그사이 사람이 바꾼 것을 덮지 않게 앞 값을 받아 고친다 */
  onChange: (update: (prev: LoadDraft) => LoadDraft) => void;
  unit: WeightUnit;
  /** 지금 계정 — 마지막 밴드 기억의 열쇠. 모르면 기억하지 않는다 */
  owner: string | null;
  exerciseId: string;
  /** 숫자 없이 세트만 체크하는 운동 — [밴드 | 무게] 고르기만 */
  variantOnly?: boolean;
  /** 마지막에 쓴 밴드를 미리 골라 둘까 — 지난 세트를 고치는 동안은 그 세트의 값 그대로(false) */
  remember?: boolean;
  /**
   * EX-LOAD01-R1 — 기기 기억으로 채울 때 쓰는 길(없으면 onChange). 운동 화면은 사람이 고친 것(onChange)과 기억(onRecall)을 갈라
   * '손대지 않은 칸만 장비 목표로 채운다'를 지킨다.
   */
  onRecall?: (update: (prev: LoadDraft) => LoadDraft) => void;
  /** 카드 이름 — 운동 화면은 '이번 세트 장비', 목표 창은 '목표 장비' */
  title?: string;
  /** 목표 창에서 쓰는가 — 밴드를 안 고르면 '모름'으로 남지 않고 목표가 되지 않는다는 말로 */
  forTarget?: boolean;
  c: Palette;
}) {
  const recall = onRecall ?? onChange;
  const plan = loadPlan(contract, draft.variant, structured);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [custom, setCustom] = useState({ brand: '', series: '', level: '' });
  const [customError, setCustomError] = useState<string | null>(null);
  /* 숫자 자판(양손 무게)에는 '완료' 키가 없다 — 쓰는 동안 칸 밑에 [입력 끝] 을 둔다(자판이 아래 막대를 가린다) */
  const [typingKg, setTypingKg] = useState(false);
  const a = activeContract(contract, draft.variant);
  const memoryRole: BandRoleRecorded = fixedRole(a) ?? draft.role ?? 'unknown';

  /*
   * 처음 이 운동(이 역할)을 볼 때 한 번 — 마지막에 쓴 역할 · 밴드를 미리 골라 둔다(아직 아무것도 안 골랐을 때만). 운동 화면은 운동마다 이 칸을
   * 새로 그린다(key) — 다른 운동으로 간 뒤 늦게 읽힌 기억은 붙이지 않는다(mounted).
   */
  const tried = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );
  const wantRecall = remember && plan.bandPicker && !variantOnly && !!owner;
  const askRole = plan.roleChips;
  const startRole = draft.role;
  useEffect(() => {
    if (!wantRecall || !owner) return;
    const k = `${exerciseId}:${memoryRole}`;
    if (tried.current.has(k)) return;
    tried.current.add(k);
    void (async () => {
      const role = askRole && startRole == null ? await recallRole(owner, exerciseId) : null;
      const bands = await recallBands(owner, exerciseId, role ?? memoryRole);
      if (!mounted.current || (role == null && bands == null)) return;
      /* 그사이 사람이 역할 · 밴드를 바꿨으면 그것이 이긴다 */
      recall((prev) => (prev.bands.length || prev.role !== startRole ? prev : { ...prev, role: role ?? prev.role, bands: bands ?? prev.bands }));
    })();
  }, [wantRecall, owner, exerciseId, memoryRole, askRole, startRole, recall]);

  const showCard = plan.variantPicker || (!variantOnly && (plan.roleChips || plan.roleText || plan.bandPicker || plan.setup || plan.unequal));
  if (!showCard) return null;

  const pickRole = (role: BandRoleRecorded) => {
    onChange((prev) => ({ ...prev, role }));
    if (!owner) return;
    /* 그 역할로 마지막에 쓴 밴드가 있으면 그것으로(저항에 쓰던 밴드와 보조에 쓰던 밴드는 다르다) */
    void recallBands(owner, exerciseId, role).then((bands) => {
      if (bands) onChange((prev) => (prev.role === role ? { ...prev, bands } : prev));
    });
  };
  const addBand = (b: BandComponent) => {
    onChange((prev) => (prev.bands.length >= MAX_BANDS ? prev : { ...prev, bands: [...prev.bands, b] }));
    setPicking(null);
  };
  const removeBand = (i: number) => onChange((prev) => ({ ...prev, bands: prev.bands.filter((_, n) => n !== i) }));
  const addCustom = () => {
    const b = cleanBandComponent({ custom: { brand: custom.brand, series: custom.series, level: custom.level } });
    if (!b) return setCustomError('상표와 단계(인쇄된 글자)를 적어 주세요.');
    setCustomError(null);
    setCustom({ brand: '', series: '', level: '' });
    addBand(b);
  };

  return (
    <View style={[st.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[st.smallBold, { color: c.muted }]}>{title}</Text>

      {plan.variantPicker ? (
        <Segmented<'band' | 'mass' | ''>
          label="이번 세트 장비 고르기"
          options={VARIANTS}
          value={draft.variant ?? ''}
          onChange={(v) => onChange((prev) => ({ ...prev, variant: v === '' ? null : v }))}
        />
      ) : null}

      {variantOnly ? null : (
        <>
          {plan.roleText ? <Text style={[st.body, { color: c.ink }]}>{plan.roleText}</Text> : null}
          {plan.roleChips ? (
            <View style={{ gap: 6 }}>
              <Text style={[st.small, { color: c.muted }]}>밴드가 버티게 했나요, 도와줬나요?</Text>
              <View style={st.chips}>
                {ROLE_CHOICES.map((r) => {
                  const on = (draft.role ?? 'unknown') === r.value && (draft.role != null || r.value === 'unknown');
                  return (
                    <Press
                      key={r.value}
                      onPress={() => pickRole(r.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={[st.chip, { backgroundColor: on ? c.action : c.chip }]}
                    >
                      <Text style={[st.smallBold, { color: on ? c.onAction : c.ink }]}>{r.label}</Text>
                    </Press>
                  );
                })}
              </View>
            </View>
          ) : null}

          {plan.bandPicker ? (
            <View style={{ gap: 8 }}>
              {draft.bands.length === 0 ? (
                <Text style={[st.small, { color: c.muted }]}>
                  {forTarget ? '목표로 쓸 밴드를 골라 주세요.' : '밴드를 고르지 않으면 \'어느 밴드인지 모름\'으로 남아요.'}
                </Text>
              ) : (
                draft.bands.map((b, i) => {
                  const text = bandText(b);
                  return (
                    <View key={`${i}-${text}`} style={[st.bandRow, { backgroundColor: c.chip }]}>
                      {'custom' in b ? null : <View style={[st.swatch, { backgroundColor: b.swatch ?? c.line, borderColor: c.lineStrong }]} />}
                      <Text style={[st.body, { color: c.ink, flex: 1 }]}>{'custom' in b ? `다른 상표 · ${text}` : text}</Text>
                      <Press onPress={() => removeBand(i)} accessibilityRole="button" accessibilityLabel={`${text} 빼기`} style={st.iconBtn}>
                        <Text style={{ color: c.muted, fontSize: 18 }}>✕</Text>
                      </Press>
                    </View>
                  );
                })
              )}

              {picking == null ? (
                draft.bands.length < MAX_BANDS ? (
                  <Press onPress={() => setPicking({ step: 'brand' })} accessibilityRole="button" style={[st.textBtn, { alignSelf: 'flex-start' }]}>
                    <Text style={[st.smallBold, { color: c.link }]}>{draft.bands.length ? '＋ 밴드 더하기(같이 쓴 밴드)' : '＋ 밴드 고르기'}</Text>
                  </Press>
                ) : (
                  <Text style={[st.small, { color: c.muted }]}>밴드는 {MAX_BANDS}개까지 같이 적어요.</Text>
                )
              ) : (
                <View style={[st.picker, { borderColor: c.line }]}>
                  {picking.step === 'brand' ? (
                    <>
                      <Text style={[st.small, { color: c.muted }]}>상표</Text>
                      <View style={st.chips}>
                        {BRANDS.map((brand) => (
                          <Press
                            key={brand}
                            onPress={() => {
                              const series = BAND_SERIES.filter((s) => s.brand === brand);
                              setPicking(series.length === 1 ? { step: 'level', seriesId: series[0].id } : { step: 'series', brand });
                            }}
                            accessibilityRole="button"
                            style={[st.chip, { backgroundColor: c.chip }]}
                          >
                            <Text style={[st.smallBold, { color: c.ink }]}>{brand}</Text>
                          </Press>
                        ))}
                        <Press onPress={() => setPicking({ step: 'custom' })} accessibilityRole="button" style={[st.chip, { backgroundColor: c.chip }]}>
                          <Text style={[st.smallBold, { color: c.ink }]}>다른 상표</Text>
                        </Press>
                      </View>
                    </>
                  ) : null}

                  {picking.step === 'series' ? (
                    <>
                      <Text style={[st.small, { color: c.muted }]}>{picking.brand} · 제품 계열</Text>
                      <View style={{ gap: 6 }}>
                        {BAND_SERIES.filter((s) => s.brand === picking.brand).map((s) => (
                          <Press
                            key={s.id}
                            onPress={() => setPicking({ step: 'level', seriesId: s.id })}
                            accessibilityRole="button"
                            style={[st.option, { backgroundColor: c.chip }]}
                          >
                            <Text style={[st.body, { color: c.ink }]}>{s.name}</Text>
                            <Text style={[st.small, { color: c.muted }]}>
                              {s.kind === 'tubing' ? '튜브' : '밴드'} · {s.levels.length}단계
                            </Text>
                          </Press>
                        ))}
                      </View>
                    </>
                  ) : null}

                  {picking.step === 'level'
                    ? (() => {
                        const series = seriesById(picking.seriesId);
                        if (!series) return null;
                        return (
                          <>
                            <Text style={[st.small, { color: c.muted }]}>{series.name} · 단계(가벼운 것부터)</Text>
                            <View style={st.chips}>
                              {series.levels.map((lv) => (
                                <Press
                                  key={lv.id}
                                  onPress={() => addBand({ catalog: BAND_CATALOG_REVISION, seriesId: series.id, levelId: lv.id, label: lv.label, swatch: lv.swatch })}
                                  accessibilityRole="button"
                                  accessibilityLabel={`${lv.label.ko} · ${series.name}`}
                                  style={[st.chip, st.levelChip, { backgroundColor: c.chip }]}
                                >
                                  <View style={[st.swatch, { backgroundColor: lv.swatch, borderColor: c.lineStrong }]} />
                                  <Text style={[st.smallBold, { color: c.ink }]}>{lv.label.ko}</Text>
                                </Press>
                              ))}
                            </View>
                          </>
                        );
                      })()
                    : null}

                  {picking.step === 'custom' ? (
                    <View style={{ gap: 6 }}>
                      <Text style={[st.small, { color: c.muted }]}>밴드에 인쇄된 글자 그대로 적어요. 다른 상표와 견주지 않아요.</Text>
                      {(
                        [
                          { key: 'brand', label: '상표', placeholder: '예: Rogue' },
                          { key: 'series', label: '제품 계열(모르면 비워 두세요)', placeholder: '예: Monster Band' },
                          { key: 'level', label: '단계 · 모델', placeholder: '예: #2 · 초록' },
                        ] as const
                      ).map((f) => (
                        <View key={f.key} style={{ gap: 2 }}>
                          <Text style={[st.small, { color: c.muted }]}>{f.label}</Text>
                          <TextInput
                            value={custom[f.key]}
                            onChangeText={(t) => setCustom((prev) => ({ ...prev, [f.key]: t.slice(0, CUSTOM_TEXT_MAX) }))}
                            placeholder={f.placeholder}
                            placeholderTextColor={c.muted}
                            accessibilityLabel={f.label}
                            returnKeyType="done"
                            style={[st.input, { backgroundColor: c.chip, color: c.ink }]}
                          />
                        </View>
                      ))}
                      {customError ? <Text style={[st.small, { color: c.danger }]}>{customError}</Text> : null}
                      <Press onPress={addCustom} accessibilityRole="button" style={[st.chip, { backgroundColor: c.action, alignSelf: 'flex-start' }]}>
                        <Text style={[st.smallBold, { color: c.onAction }]}>이 밴드 더하기</Text>
                      </Press>
                    </View>
                  ) : null}

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {picking.step !== 'brand' ? (
                      <Press onPress={() => setPicking({ step: 'brand' })} accessibilityRole="button" style={st.textBtn}>
                        <Text style={[st.smallBold, { color: c.link }]}>‹ 상표 다시 고르기</Text>
                      </Press>
                    ) : null}
                    <Press
                      onPress={() => {
                        setPicking(null);
                        setCustomError(null);
                      }}
                      accessibilityRole="button"
                      style={st.textBtn}
                    >
                      <Text style={[st.smallBold, { color: c.muted }]}>그만두기</Text>
                    </Press>
                  </View>
                </View>
              )}
              <Text style={[st.small, { color: c.muted }]}>밴드 단계는 제품 이름이에요. kg 으로 바꾸거나 다른 계열과 세기를 견주지 않아요.</Text>
            </View>
          ) : null}

          {plan.setup ? (
            <View style={{ gap: 2 }}>
              <Text style={[st.small, { color: c.muted }]}>기구 이름 · 선택(같은 이름끼리만 견줘요)</Text>
              <TextInput
                value={draft.setup}
                onChangeText={(t) => onChange((prev) => ({ ...prev, setup: t.slice(0, SETUP_TEXT_MAX) }))}
                placeholder="예: 헬스장 2번 케이블"
                placeholderTextColor={c.muted}
                accessibilityLabel="기구 이름"
                returnKeyType="done"
                style={[st.input, { backgroundColor: c.chip, color: c.ink }]}
              />
            </View>
          ) : null}

          {plan.unequal ? (
            <View style={{ gap: 6 }}>
              <Press
                onPress={() => onChange((prev) => ({ ...prev, unequal: !prev.unequal }))}
                accessibilityRole="switch"
                accessibilityState={{ checked: draft.unequal }}
                style={[st.toggle, { backgroundColor: c.chip }]}
              >
                <Text style={[st.body, { color: c.ink, flex: 1 }]}>양손 무게가 달라요</Text>
                <View style={[st.knob, { backgroundColor: draft.unequal ? c.action : c.line }]}>
                  <Text style={{ color: draft.unequal ? c.onAction : c.muted, fontSize: 12, fontWeight: '700' }}>{draft.unequal ? '켬' : '끔'}</Text>
                </View>
              </Press>
              {draft.unequal ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(
                    [
                      { key: 'left', label: `왼손 (${unit})` },
                      { key: 'right', label: `오른손 (${unit})` },
                    ] as const
                  ).map((f) => (
                    <View key={f.key} style={{ flex: 1, gap: 2 }}>
                      <Text style={[st.small, { color: c.muted }]}>{f.label}</Text>
                      <TextInput
                        value={draft[f.key]}
                        onChangeText={(t) => onChange((prev) => ({ ...prev, [f.key]: t.replace(/[^\d.]/g, '').slice(0, 6) }))}
                        keyboardType="decimal-pad"
                        onFocus={() => setTypingKg(true)}
                        onBlur={() => setTypingKg(false)}
                        placeholder="—"
                        placeholderTextColor={c.muted}
                        accessibilityLabel={f.label}
                        style={[st.input, { backgroundColor: c.chip, color: c.ink, fontVariant: ['tabular-nums'] }]}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
              {draft.unequal && typingKg ? (
                <Press onPress={() => Keyboard.dismiss()} accessibilityRole="button" style={[st.textBtn, { alignSelf: 'flex-end' }]}>
                  <Text style={[st.smallBold, { color: c.link }]}>입력 끝</Text>
                </Press>
              ) : null}
              {draft.unequal ? <Text style={[st.small, { color: c.muted }]}>한 손 무게를 두 배로 셈하거나 평균 내지 않아요.</Text> : null}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { marginTop: 12, borderRadius: 16, padding: 12, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 40, borderRadius: 20, paddingHorizontal: 14, justifyContent: 'center' },
  levelChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  option: { minHeight: 48, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center', gap: 2 },
  bandRow: { minHeight: 44, borderRadius: 12, paddingLeft: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth },
  picker: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10, gap: 8 },
  input: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 17 },
  toggle: { minHeight: 48, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  knob: { minWidth: 44, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  textBtn: { minHeight: 40, paddingHorizontal: 4, justifyContent: 'center' },
  small: { fontSize: 13, lineHeight: 18 },
  smallBold: { fontSize: 13, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
});
