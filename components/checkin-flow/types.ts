import {
  pickArmPain,
  pickCheckinParts,
  sleepQualityOf,
  type CheckinPartKey,
} from '@/lib/checkin';
import { cleanBodySpots, type BodySpots } from '@/lib/body-spots';

/**
 * 체크인 3판 흐름(components/checkin-flow/flow.tsx)이 받는 것 — 저장된 체크인 한 건을 화면이 채울 수 있는 모양으로.
 * 서버(app/(app)/layout.tsx · app/(session)/checkin/page.tsx · lib/checkin-flow-load.ts)가 DB 줄에서 만든다.
 */
export type CheckinPrefill = {
  /** YYYY-MM-DD */
  date: string;
  condition: number;
  /** 어젯밤 수면의 질 1~5 — 옛 기록은 느낌 · 잔 시간으로 어림(sleepQualityOf), 없으면 null */
  sleepQuality: number | null;
  /** 다섯 부위 칸(정상 · 뻐근 · 통증) */
  parts: Record<CheckinPartKey, string>;
  /** 몸 그림에서 고른 근육 */
  bodySpots: BodySpots;
  /** 팔 통증 자리 · 정도 */
  armPainSpots: string[];
  armPainLevel: number | null;
  note: string | null;
};

/** 흐름이 그리는 데 필요한 둘레 — 닉네임 · 평소 컨디션 · 최근 사흘 체크인(오늘 것 채우기 · 어제 컨디션) · 연속 기록용 날짜들 */
export type CheckinFlowContext = {
  nickname: string;
  /** 오늘을 뺀 28일 컨디션의 중앙값(lib/report/facts.ts usualConditionOf). 체크인이 적으면 null */
  usualCondition: number | null;
  recent: CheckinPrefill[];
  /** 두 달치 체크인한 날 — 완료 화면의 'N일 연속' */
  streakDays: string[];
};

/** DB 줄 → 화면이 채울 모양 */
export function prefillOf(row: {
  date: Date;
  condition: number;
  sleep: string;
  sleepHours?: number | null;
  sleepQuality?: number | null;
  shoulder: string;
  elbow: string;
  wrist: string;
  lowerBack: string;
  lowerBody: string;
  bodySpots: unknown;
  armPainSpots?: readonly string[] | null;
  armPainLevel?: number | null;
  note?: string | null;
}): CheckinPrefill {
  const arm = pickArmPain(row);
  return {
    date: row.date.toISOString().slice(0, 10),
    condition: row.condition,
    sleepQuality: sleepQualityOf(row),
    parts: pickCheckinParts(row),
    bodySpots: cleanBodySpots(row.bodySpots),
    armPainSpots: arm.armPainSpots,
    armPainLevel: arm.armPainLevel,
    note: row.note ?? null,
  };
}
