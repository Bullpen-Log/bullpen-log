import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Text, View } from 'react-native';
import { pitchingBurn, trainingBurn } from '@/lib/nutrition/burn';
import { kcalText } from '@/lib/nutrition/meta';
import { REST_REQUIREMENTS, REST_REQUIREMENTS_YOUTH, YOUTH_REST_TABLE_THROUGH_AGE, dailyPitchCap } from '@/lib/report/plan';
import type { Palette } from '~/lib/ui';

/**
 * 첫 설정의 끼움 화면(앱) — 웹 components/onboarding/insert-cards.tsx 와 같은 숫자 · 같은 말. 질문 사이에 앱이 답으로 셈한 값을 보여 준다.
 */
function InsertCard({ icon, headline, lines, c }: { icon: SFSymbol; headline: React.ReactNode; lines: string[]; c: Palette }) {
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 20, padding: 20, gap: 14 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.sky + '1a', alignItems: 'center', justifyContent: 'center' }}>
        <SymbolView name={icon} size={22} tintColor={c.sky} />
      </View>
      <Text style={{ color: c.ink, fontSize: 22, fontWeight: '700', lineHeight: 29 }}>{headline}</Text>
      <View style={{ gap: 8 }}>
        {lines.map((l) => (
          <View key={l} style={{ flexDirection: 'row', gap: 8 }}>
            <Text style={{ color: c.sky, fontSize: 15 }}>•</Text>
            <Text style={{ color: c.muted, fontSize: 15, lineHeight: 21, flex: 1 }}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** 하루 투구 한도 — 성인(한도 없음)은 '지금 팔 상태를 알려 드려요' */
export function PitchCapInsert({ age, c }: { age: number | null; c: Palette }) {
  const cap = dailyPitchCap(age);
  const table = age != null && age <= YOUTH_REST_TABLE_THROUGH_AGE ? REST_REQUIREMENTS_YOUTH : REST_REQUIREMENTS;
  const rests = table
    .filter((r) => r.restDays > 0)
    .slice()
    .sort((a, b) => a.minPitches - b.minPitches);
  const restLine = `한 번에 ${rests[0].minPitches}구부터 ${rests[0].restDays}일, ${rests[rests.length - 1].minPitches}구부터 ${rests[rests.length - 1].restDays}일은 전력으로 던지지 않아요.`;
  if (cap == null) {
    return (
      <InsertCard
        icon="checkmark.shield"
        headline="지금 팔 상태를 알려 드려요"
        lines={['평소 던지던 양과 최근 몇 주의 부하를 견줘 지금 팔 상태를 보여 줘요.', '세게 던진 날 · 갑자기 늘어난 날을 알려 줘요.', '팀 · 지도자의 지침이 먼저예요.']}
        c={c}
      />
    );
  }
  return (
    <InsertCard
      icon="checkmark.shield"
      headline={
        <>
          {age === null ? '하루 ' : `만 ${age}세는 하루 `}
          <Text style={{ color: c.sky }}>{cap}구</Text>
          까지예요
        </>
      }
      lines={[restLine, '투구를 적으면 매일 팔 상태를 보여 줘요.', '기준은 유소년 투구수 가이드(Pitch Smart)예요. 팀 · 지도자의 지침이 먼저예요.']}
      c={c}
    />
  );
}

/** 체중 뒤 — '운동과 투구를 적으면 쓴 만큼 더 먹어요'(웹 BurnInsert 와 같은 값 · 같은 말, 체중을 모르면 75kg) */
export function BurnInsert({ weightKg, c }: { weightKg: number | null; c: Palette }) {
  const kg = weightKg ?? 75;
  const training = trainingBurn(60 * 60, kg);
  const bullpen = pitchingBurn('불펜', 40, 7, kg);
  const total = (training?.kcal ?? 0) + (bullpen?.kcal ?? 0);
  return (
    <InsertCard
      icon="flame"
      headline={
        <>
          운동과 투구를 적으면 쓴 만큼 <Text style={{ color: c.sky }}>더 먹어요</Text>
        </>
      }
      lines={[
        `${weightKg === null ? '75kg 기준으로 ' : `${kg}kg 이면 `}웨이트 60분은 약 ${kcalText(training?.kcal ?? 0)}kcal, 불펜 40구(전력 7)는 약 ${kcalText(bullpen?.kcal ?? 0)}kcal을 써요.`,
        `그날 둘 다 했으면 목표에 ${kcalText(total)}kcal이 더해져요. 따로 적을 건 없어요. 트레이닝 · 투구 기록에서 가져와요.`,
        '던지는 날 앞뒤 끼니는 거르지 않는 것이 먼저예요. 영양 탭이 그날 가이드를 줘요.',
        '대략의 값이에요. 같은 운동이라도 사람마다 20~30% 는 달라요.',
      ]}
      c={c}
    />
  );
}
