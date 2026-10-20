import { SymbolView } from 'expo-symbols';
import { Text, TextInput, View } from 'react-native';
import { CKCUEST_METHOD, type StageTest } from '@/lib/armcare/rehab';
import { YES_NO, num, type StageTestDraft } from '@/lib/armcare/rehab-test-draft';
import type { ThrowingDraft } from '@/lib/armcare/rehab-throwing-draft';
import type { Palette } from '~/lib/ui';
import { ChoiceChips } from '~/setup/frame';

/** 0~10 칩 — 통증 · 활동 · 자신감 */
export const ZERO_TEN = Array.from({ length: 11 }, (_, i) => ({ value: String(i), label: String(i) }));

/**
 * 단계 시험 칸(앱) — 웹 rehab-sheets.tsx StageTestFields 와 같은 질문 · 같은 글. 단계 올리기(rehab-test.tsx)와 매주 확인 ⑤(rehab-weekly.tsx)가 같이 쓴다.
 * firstEditable false 면 팔굽혀 터치 '처음' 칸을 고치지 않는다(매주 확인).
 */
export function StageTestFields({
  test,
  draft,
  onChange,
  firstEditable = true,
  c,
}: {
  test: StageTest;
  draft: StageTestDraft;
  onChange: (next: StageTestDraft) => void;
  firstEditable?: boolean;
  c: Palette;
}) {
  const set = (patch: Partial<StageTestDraft>) => onChange({ ...draft, ...patch });
  const yesNo = YES_NO.map((o) => ({ value: o.value, label: o.label }));
  if (test.kind === 'rom') {
    return (
      <View style={{ gap: 18 }}>
        <ChoiceChips legend="다친 쪽을 움직일 때 아프지 않았어요?" options={yesNo} value={draft.painFree} onChange={(v) => set({ painFree: v })} c={c} />
        <ChoiceChips legend="반대쪽과 비슷하게 움직여요?" options={yesNo} value={draft.similar} onChange={(v) => set({ similar: v })} c={c} />
      </View>
    );
  }
  const first = num(draft.ckcFirst);
  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{test.exercise}, 지칠 때까지 몇 번?</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <NumberBox label="다친 쪽" value={draft.injured} onChange={(v) => set({ injured: v })} c={c} />
          <NumberBox label="반대쪽" value={draft.other} onChange={(v) => set({ other: v })} c={c} />
        </View>
        <Text style={{ color: c.muted, fontSize: 13 }}>다친 쪽이 반대쪽의 {test.percent}% 이상이면 통과예요.</Text>
      </View>
      <ChoiceChips legend="시험 중 가장 아팠던 정도 (0~10)" options={ZERO_TEN} value={draft.pain == null ? null : String(draft.pain)} onChange={(v) => set({ pain: Number(v) })} c={c} />
      {test.ckc ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>팔굽혀 터치 15초 (3번 평균)</Text>
          <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>{CKCUEST_METHOD}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {firstEditable ? <NumberBox label="처음 쟀을 때" value={draft.ckcFirst} onChange={(v) => set({ ckcFirst: v })} decimal c={c} /> : null}
            <NumberBox
              label={firstEditable ? '오늘' : first == null ? '오늘 (처음이에요)' : `오늘 (내 첫 기록 ${first})`}
              value={draft.ckcNow}
              onChange={(v) => set({ ckcNow: v })}
              decimal
              c={c}
            />
          </View>
          <Text style={{ color: c.muted, fontSize: 13 }}>
            {first == null ? '처음이면 오늘 기록이 내 첫 기록이 돼요. 다음부터 늘었는지 견줘요.' : '아프지 않게, 처음보다 늘었으면 통과예요.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function NumberBox({ label, value, onChange, decimal, c }: { label: string; value: string; onChange: (v: string) => void; decimal?: boolean; c: Palette }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(decimal ? /[^\d.]/g : /\D/g, ''))}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        accessibilityLabel={label}
        style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.ink, paddingHorizontal: 14, fontSize: 17 }}
      />
    </View>
  );
}

/** 판정 한 칸 — 통과면 체크, 아니면 못 넘은 까닭을 한 줄씩 */
export function JudgedBox({ pass, fails, c }: { pass: boolean; fails: string[]; c: Palette }) {
  return (
    <View style={{ borderRadius: 12, padding: 12, gap: 4, backgroundColor: pass ? c.sky + '1a' : c.card }}>
      {pass ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <SymbolView name="checkmark" size={14} tintColor={c.sky} />
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>통과했어요</Text>
        </View>
      ) : (
        fails.map((f) => (
          <Text key={f} style={{ color: c.ink, fontSize: 15, lineHeight: 21 }}>
            · {f}
          </Text>
        ))
      )}
    </View>
  );
}

/**
 * 투구 복귀표 열기 시험 칸(앱) — 웹 rehab-throwing.tsx ThrowingTestFields 와 같은 질문: 앉아서 한 팔 메디신볼 밀기(≥ 100%) ·
 * (플라이오볼이 있으면) 프론 볼 드롭 30초(≥ 110%) · 한 팔 90/90 벽 던지기 30초(≥ 115%) · 시험 중 통증. 열기 화면과 4단계 매주 확인 ④가 같이 쓴다.
 */
export function ThrowingTestFields({ hasPlyo, draft, onChange, c }: { hasPlyo: boolean; draft: ThrowingDraft; onChange: (next: ThrowingDraft) => void; c: Palette }) {
  const setPair = (key: 'push' | 'drop' | 'wall', side: 0 | 1) => (value: string) => {
    const pair: [string, string] = [...draft[key]];
    pair[side] = value;
    onChange({ ...draft, [key]: pair });
  };
  const pair = (key: 'push' | 'drop' | 'wall', title: string, hint: string, decimal = false) => (
    <View style={{ gap: 8 }}>
      <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{title}</Text>
      <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>{hint}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <NumberBox label="다친 쪽" value={draft[key][0]} onChange={setPair(key, 0)} decimal={decimal} c={c} />
        <NumberBox label="반대쪽" value={draft[key][1]} onChange={setPair(key, 1)} decimal={decimal} c={c} />
      </View>
    </View>
  );
  return (
    <View style={{ gap: 18 }}>
      {pair('push', '앉아서 한 팔 메디신볼 밀기 (cm)', '벽에 등을 대고 앉아 2kg 메디신볼을 한 팔로 밀어 던져요. 세 번 던진 거리의 평균을 적어요. 반대쪽만큼 나가면 통과예요.', true)}
      {hasPlyo ? (
        <>
          {pair('drop', '프론 볼 드롭 30초 (횟수)', '엎드려 팔을 90/90 으로 들고, 30초 동안 플라이오볼을 놓았다 잡기를 되풀이해요. 반대쪽의 110% 이상이면 통과예요.')}
          {pair('wall', '한 팔 90/90 벽 던지기 30초 (횟수)', '팔을 90/90 으로 들고 30초 동안 벽에 플라이오볼을 던지고 받아요. 반대쪽의 115% 이상이면 통과예요.')}
        </>
      ) : (
        <Text style={{ color: c.muted, fontSize: 13 }}>플라이오볼이 없어 볼 드롭 · 벽 던지기 시험은 건너뛰고 밀기로 봐요.</Text>
      )}
      <ChoiceChips legend="시험 중 가장 아팠던 정도 (0~10)" options={ZERO_TEN} value={draft.pain == null ? null : String(draft.pain)} onChange={(v) => onChange({ ...draft, pain: Number(v) })} c={c} />
    </View>
  );
}
