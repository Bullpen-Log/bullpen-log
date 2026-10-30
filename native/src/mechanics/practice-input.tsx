import { Text, TextInput, View } from 'react-native';
import type { Palette } from '~/lib/ui';
import { Press } from '~/shell/press';

import type { SkillAnswer } from '@/lib/mechanics/progression';
import { FEELS, isThrowingDrill, type DrillFeel } from '@/lib/mechanics/program';

/**
 * 메카닉 실행(2026-10-31 시안 02)의 기록 입력 — 드릴을 마친 뒤 실제 횟수 · 체감 강도 · 수행 중 통증 · 동작 느낌을 한 화면에 모은다.
 * 고르기만으로는 저장 · 다음으로 가지 않는다(저장은 실행 화면의 '드릴 기록 저장' 하나). 빈칸에서 시작하고 목표량을 실제 값으로 채우지 않는다.
 * 횟수는 오늘 이 드릴의 합계(서버 계약), 스로잉만 '구'(투구 기록에 한 번 반영), 나머지는 '회'(투구 수에 더하지 않음).
 * 시험(scripts/mechanics-input-test.mjs)이 react-native 의 Text · View · TextInput 만 바꿔 끼워 그리므로 그 셋과 Press 만 쓴다.
 */
export type PracticeForm = {
  requestId: string;
  count: string;
  effort: string;
  response: 'clear' | 'pain' | null;
  feel: DrillFeel | null;
  alreadyLogged: boolean;
  quality: SkillAnswer | null;
  transferred: SkillAnswer | null;
};
export const newRequestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const emptyPractice = (): PracticeForm => ({
  requestId: newRequestId(),
  count: '',
  effort: '',
  response: null,
  feel: null,
  alreadyLogged: false,
  quality: null,
  transferred: null,
});

/** 무엇이든 적거나 골랐나 — 드릴을 바꾸거나 건너뛸 때 지워진다고 먼저 묻는다 */
export const practiceTouched = (v: PracticeForm) =>
  !!(v.count || v.effort || v.response || v.feel || v.alreadyLogged || v.quality || v.transferred);

const isInt = (s: string, min: number, max: number) => /^\d{1,4}$/.test(s) && Number(s) >= min && Number(s) <= max;

/** 저장 전 검사 — 서버 계약(횟수 1~1000 정수 · 강도 0~100 정수 · 통증 · 느낌)과 같다. 빠진 것을 하나씩 알린다 */
export function practiceError(v: PracticeForm, category: string): string | null {
  const unit = isThrowingDrill(category) ? '투구 수' : '반복 횟수';
  if (!isInt(v.count.trim(), 1, 1000)) return `${unit}를 1~1000 사이 정수로 적어 주세요.`;
  if (!isInt(v.effort.trim(), 0, 100)) return '체감 강도를 0~100 사이 정수로 적어 주세요.';
  if (!v.response) return '수행 중 통증이 있었는지 골라 주세요.';
  if (!v.feel) return '동작이 어땠는지 골라 주세요.';
  return null;
}

export const FEEL_LABEL: Record<DrillFeel, string> = Object.fromEntries(FEELS.map((f) => [f.value, f.label])) as Record<DrillFeel, string>;
export const SKILL_TEXT: Record<SkillAnswer, string> = { yes: '유지했어요', no: '어려웠어요', unknown: '확인 못 했어요' };

export function PracticeInput({
  value,
  category,
  skill,
  onChange,
  locked = false,
  c,
}: {
  value: PracticeForm;
  category: string;
  skill?: { cue: string; requiresTransfer: boolean };
  /** 바뀐 칸만 넘긴다 — 부르는 쪽이 앞 상태에 합친다(한 장면에 두 번 눌러도 앞 고름이 지워지지 않게) */
  onChange: (patch: Partial<PracticeForm>) => void;
  /** 저장 결과를 확인하는 동안 — 같은 요청을 다른 내용으로 보내지 않게 고치지 못한다 */
  locked?: boolean;
  c: Palette;
}) {
  const throwing = isThrowingDrill(category);
  const set = (patch: Partial<PracticeForm>) => {
    if (!locked) onChange(patch);
  };
  const label = { color: c.muted, fontSize: 13, fontWeight: '600' as const };
  const head = { color: c.ink, fontSize: 17, fontWeight: '700' as const };
  const choice = (on: boolean) => ({
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: on ? c.sky : c.line,
    backgroundColor: on ? c.sky + '1f' : c.card,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 6,
    opacity: locked ? 0.6 : 1,
  });
  const choiceText = (on: boolean) => ({ color: on ? c.link : c.ink, fontSize: 15, fontWeight: on ? ('700' as const) : ('500' as const) });
  const field = (text: string, unit: string, onText: (t: string) => void, a11y: string, placeholder: string, max: number) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 56,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.card,
        paddingHorizontal: 14,
        opacity: locked ? 0.6 : 1,
      }}
    >
      <TextInput
        accessibilityLabel={a11y}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        keyboardType="number-pad"
        maxLength={max}
        editable={!locked}
        value={text}
        /* 친 그대로 둔다 — 소수점 · 글자를 지워 다른 숫자로 바꾸지 않고 저장 전 검사가 '정수로'를 알린다 */
        onChangeText={(t) => onText(t.trim())}
        style={{ flex: 1, minHeight: 48, color: c.ink, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] }}
      />
      <Text style={{ color: c.muted, fontSize: 15, fontWeight: '600' }}>{unit}</Text>
    </View>
  );
  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 10 }}>
        <Text accessibilityRole="header" style={head}>
          수행 기록
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={label}>{throwing ? '오늘 이 드릴의 실제 투구 합계' : '오늘 이 드릴의 반복 수행 합계'}</Text>
            {field(
              value.count,
              throwing ? '구' : '회',
              (count) => set({ count }),
              throwing ? '오늘 이 드릴로 실제로 던진 공 합계' : '오늘 이 드릴의 실제 반복 합계',
              '—',
              4
            )}
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={label}>체감 강도</Text>
            {field(value.effort, '%', (effort) => set({ effort }), '실제 체감 강도 퍼센트, 0에서 100', '0~100', 3)}
          </View>
        </View>
        <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19 }}>
          {throwing
            ? '오늘 이 드릴로 던진 합계를 적어요. 투구 기록에 한 번만 저장돼요.'
            : '오늘 이 드릴로 한 반복 합계를 적어요. 투구 수에는 더하지 않아요.'}
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={head}>수행 중 통증</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(
            [
              { value: 'clear', label: '없었어요' },
              { value: 'pain', label: '있었어요' },
            ] as const
          ).map((x) => (
            <Press
              key={x.value}
              onPress={() => set({ response: x.value })}
              accessibilityRole="radio"
              accessibilityLabel={`수행 중 통증 ${x.label}`}
              accessibilityState={{ checked: value.response === x.value, disabled: locked }}
              style={choice(value.response === x.value)}
            >
              <Text style={choiceText(value.response === x.value)}>{x.label}</Text>
            </Press>
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={head}>동작은 어땠나요?</Text>
        {/* 셋 다 같은 모양 · 같은 크기 — 하나만 칠하면 무심코 누르기 쉬워 진도가 부풀었다(2026-10-04 검토) */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {FEELS.map((f) => (
            <Press
              key={f.value}
              onPress={() => set({ feel: f.value })}
              accessibilityRole="radio"
              accessibilityLabel={`동작 느낌 ${f.label}`}
              accessibilityHint={f.hint}
              accessibilityState={{ checked: value.feel === f.value, disabled: locked }}
              style={choice(value.feel === f.value)}
            >
              <Text style={choiceText(value.feel === f.value)}>{f.label}</Text>
            </Press>
          ))}
        </View>
      </View>

      {skill ? (
        <View style={{ gap: 10 }}>
          <Text style={head}>필수 교정 · 자가 확인</Text>
          <Text style={{ color: c.ink, fontSize: 15, lineHeight: 22 }}>동작 목표: {skill.cue}</Text>
          {(
            [
              { key: 'quality', label: '동작 목표를 유지했나요?' },
              ...(skill.requiresTransfer ? [{ key: 'transferred', label: '실제 캐치볼에서도 같은 신호를 유지했나요?' }] : []),
            ] as { key: 'quality' | 'transferred'; label: string }[]
          ).map((q) => (
            <View key={q.key} style={{ gap: 6 }}>
              <Text style={{ color: c.ink, fontSize: 15 }}>{q.label}</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['yes', 'no', 'unknown'] as const).map((v) => (
                  <Press
                    key={v}
                    accessibilityRole="radio"
                    accessibilityLabel={`${q.label} ${SKILL_TEXT[v]}`}
                    accessibilityState={{ checked: value[q.key] === v, disabled: locked }}
                    onPress={() => set({ [q.key]: v })}
                    style={choice(value[q.key] === v)}
                  >
                    <Text style={choiceText(value[q.key] === v)}>{SKILL_TEXT[v]}</Text>
                  </Press>
                ))}
              </View>
            </View>
          ))}
          <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19 }}>
            고르지 않으면 ‘확인 못 함’으로 남아요. 자가 확인은 3D 측정 결과와 구분해요.
          </Text>
        </View>
      ) : null}

      {throwing ? (
        <Press
          accessibilityRole="checkbox"
          accessibilityState={{ checked: value.alreadyLogged, disabled: locked }}
          onPress={() => set({ alreadyLogged: !value.alreadyLogged })}
          style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: locked ? 0.6 : 1 }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 1.5,
              borderColor: value.alreadyLogged ? c.sky : c.muted,
              backgroundColor: value.alreadyLogged ? c.sky : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {value.alreadyLogged ? <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>✓</Text> : null}
          </View>
          <Text style={{ color: c.ink, fontSize: 15, flex: 1 }}>다른 투구 기록에 이미 포함했어요</Text>
        </Press>
      ) : null}
    </View>
  );
}
