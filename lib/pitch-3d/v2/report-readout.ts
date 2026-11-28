import { DROP_RISE_MAX } from '@/lib/pitch-3d/v2/mech-checks';
import { DROP_FLOAT_MAX, type ElementName, type ReportItem, type ReportStatus } from '@/lib/pitch-3d/v2/report';

export type ResultRating = Exclude<ReportStatus, 'edge'>;
type GradedRating = Extract<ResultRating, 'good' | 'fair' | 'improve'>;

export const resultRating = (status: ReportStatus): ResultRating => status === 'edge' ? 'fair' : status;

const UNITS: Record<ElementName, '°' | '%'> = {
  드리프트: '%',
  드롭: '%',
  '상하체 분리': '°',
  브레이크: '°',
  '몸통 회전': '°',
  스로잉: '%',
};

const MEANING: Record<ElementName, string> = {
  드리프트: '다리를 가장 높이 들었을 때 골반과 뒷발 사이의 앞뒤 거리를 키에 대한 비율로 봐요. 양수는 골반이 홈 쪽에 있다는 뜻이에요.',
  드롭: '다리를 들었을 때와 착지할 때의 골반 높이 차이예요. 다리 길이를 기준으로 재고, 양수는 골반이 내려갔다는 뜻이에요.',
  '상하체 분리': '0°는 상체가 옆을 향한 자세예요. 숫자가 클수록 포수 쪽으로 더 열려 있어요.',
  브레이크: '착지한 뒤 공을 놓기까지 앞무릎이 얼마나 펴졌는지 봐요. 음수는 무릎이 더 굽었다는 뜻이에요.',
  '몸통 회전': '공을 놓는 순간 몸통이 앞이나 뒤로 기운 각도예요. 양수는 포수 쪽으로 기울었다는 뜻이에요.',
  스로잉: '앞발이 닿을 때 던지는 손과 어깨의 높이 차이예요. 팔 길이를 기준으로 재고, 양수는 손이 어깨보다 높다는 뜻이에요.',
};

function format(value: number, unit: '°' | '%') {
  const amount = Math.round(Math.abs(value) * (unit === '%' ? 1000 : 10)) / 10;
  return `${amount > 0 && value < 0 ? '−' : ''}${amount}${unit}`;
}

export function resultValue(item: ReportItem): string | null {
  if (item.status === 'unsure') return null;
  return item.gauge && Number.isFinite(item.gauge.value)
    ? format(item.gauge.value, UNITS[item.element])
    : item.value;
}

export function resultObservation(item: ReportItem): string {
  const g = item.gauge;
  if (item.status === 'unsure' || !g || !Number.isFinite(g.value)) return item.obs ?? item.line;
  const value = g.value;
  switch (item.element) {
    case '드리프트':
      if (Math.abs(value) < 0.005) return '다리를 가장 높이 들었을 때 골반이 뒷발 바로 위에 있었어요.';
      return value > 0
        ? '다리를 가장 높이 들었을 때 골반이 뒷발보다 홈 쪽에 있었어요.'
        : '다리를 가장 높이 들었을 때 골반이 뒷발보다 뒤에 있었어요.';
    case '드롭':
      if (item.dropRise != null || (item.fault === 'drop.float' && value >= DROP_FLOAT_MAX))
        return '앞발을 내딛는 중 골반이 한 번 위로 올라갔어요.';
      if (value < -0.005) return '착지 때 골반이 다리를 들었을 때보다 높았어요.';
      if (Math.abs(value) < 0.005) return '다리를 들었을 때와 착지할 때 골반 높이가 거의 같았어요.';
      return value < g.cut
        ? '앞발을 내딛을 때 골반이 조금만 내려갔어요.'
        : '앞발을 내딛는 동안 골반이 낮아졌어요.';
    case '상하체 분리':
      if (value > 0) return value <= g.cut
        ? '앞발이 닿을 때 어깨선이 조금 열려 있었어요.'
        : '앞발이 닿을 때 어깨선이 포수 쪽으로 열려 있었어요.';
      return value > g.edgeEnd
        ? '앞발이 닿을 때 상체는 거의 옆을 향했어요.'
        : '앞발이 닿을 때 상체가 포수 쪽으로 돌아가기 전이었어요.';
    case '브레이크':
      if (!g.up) return value < 0.5
        ? '착지한 뒤 앞무릎이 더 굽지 않았어요.'
        : '착지 뒤 앞무릎이 더 굽었어요.';
      if (Math.abs(value) < 0.5) return '착지부터 공을 놓을 때까지 앞무릎 각도가 거의 같았어요.';
      return value > 0
        ? '착지부터 공을 놓을 때까지 앞무릎이 펴졌어요.'
        : '착지부터 공을 놓을 때까지 앞무릎이 더 굽었어요.';
    case '몸통 회전':
      if (Math.abs(value) < 0.5) return '공을 놓을 때 몸통이 거의 곧게 서 있었어요.';
      if (value < 0) return '공을 놓을 때 몸통이 뒤로 기울었어요.';
      return value < g.cut
        ? '공을 놓을 때 몸통이 앞으로 조금만 기울었어요.'
        : '공을 놓을 때 몸통이 포수 쪽으로 기울었어요.';
    case '스로잉':
      if (Math.abs(value) < 0.05) return '앞발이 닿을 때 던지는 손이 어깨 높이쯤에 있었어요.';
      return value > 0
        ? '앞발이 닿을 때 던지는 손이 어깨보다 높았어요.'
        : '앞발이 닿을 때 던지는 손이 어깨보다 낮았어요.';
  }
}

export function resultCriteria(item: ReportItem, ground: 'mound' | 'flat') {
  const g = item.gauge;
  const unit = UNITS[item.element];
  const meaning = item.element === '브레이크' && g && !g.up
    ? '착지한 뒤 앞무릎이 가장 많이 굽었을 때, 착지 순간과 각도가 얼마나 달라졌는지 봐요.'
    : MEANING[item.element];
  if (!g || !Number.isFinite(g.cut) || !Number.isFinite(g.fairEnd) || item.status === 'note' || item.status === 'unsure') {
    return {
      meaning,
      rows: [],
      appliedRange: null,
      note: item.status === 'note' ? item.foot ?? '이 값은 참고용이에요.' : '이번 결과에는 보여 줄 판정 범위가 없어요.',
    };
  }
  const good = format(g.fairEnd, unit);
  const cut = format(g.cut, unit);
  const rows: { rating: GradedRating; range: string }[] = [
    { rating: 'good', range: g.up ? `${good} 이상` : `${good} 이하` },
    { rating: 'fair', range: g.up ? `${cut} 이상, ${good} 미만` : `${good} 초과, ${cut} 이하` },
    { rating: 'improve', range: g.up ? `${cut} 미만` : `${cut} 초과` },
  ];
  const notes = [];
  const decidedByRise = item.fault === 'drop.float' && g.value >= g.cut;
  if (ground === 'flat' && (item.element === '드롭' || item.element === '몸통 회전')) {
    notes.push('평지에서 던진 영상에 적용하는 임시 기준이에요.');
  }
  if (item.element === '드롭') {
    notes.push(item.dropRise != null
      ? `앞발을 내딛는 중 골반이 다리 길이의 ${format(item.dropRise, '%')}만큼 올라갔어요. ${format(DROP_RISE_MAX, '%')}를 넘으면 고칠 점이에요.`
      : `앞발을 내딛는 중 골반이 다리 길이의 ${format(DROP_RISE_MAX, '%')} 넘게 올라가도 고칠 점이에요.`);
  }
  if ([g.cut, g.fairEnd].some((bound) => g.value !== bound && format(g.value, unit) === format(bound, unit))) {
    notes.push('판정에는 반올림하기 전 수치를 사용해요.');
  }
  return { meaning, rows, appliedRange: decidedByRise ? null : resultRating(item.status), note: notes.join('\n') };
}
