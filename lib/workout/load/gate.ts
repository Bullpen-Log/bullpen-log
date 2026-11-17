/**
 * EX-LOAD01 — 읽기 관문. 세트 · 요약의 kg 을 계산(최고 · 총량 · 추정 1RM · 추천 · 미리 채우기 · 진행)에 넣어도 되는가를 한곳에서 정한다.
 *
 * 근거(앞이 이긴다) — 지금 라이브러리 장비는 지난 장비의 증거가 아니다:
 *   1. 구조화 저장(row.load, 스키마 적용 뒤) — 그 세트에 얼린 무게 · 뜻 그대로.
 *   2. 'contract' — 이 판에 얼린 기록 계약(이번 판부터 FrozenExercise.load). 그 계약이 무게를 안 받는데 kg 이 있으면 옛 앱이 보낸
 *      맞지 않는 무게(incompatible).
 *   3. 'equipment' — 계약 없이 장비만 얼린 옛 판. **검토한 옛 대응표 v1**(HISTORICAL_MAPPING): 그 판에 얼린 장비가 자유 중량 한 묶음
 *      (바벨 → 봉 포함 합계, 덤벨 · 케틀벨 → 한 손, 원판만 → 든 원판 합)이면, 그때 앱의 무게 칸 약속(record-load · done-load 가 덤벨 ·
 *      케틀벨을 '한 손'으로 보이고, 프로그램 추천이 바벨 합계 · 덤벨 한 손으로 셈하던 것)과 같으므로 historicalMapped 로 넣는다.
 *      기구 설정값 · 도구 무게는 그때 기구 정체 · 개수를 몰라 보이기만(견줌 없음), 맨몸 · 밴드 · 모름의 kg 은 unverified.
 *   4. 'current' — 판에 없는 줄(오래된 요약 · 체크, 판에서 빠진 운동). 그때 장비를 모르므로 kg 은 늘 unverified(계산 · 미리 채우기 ·
 *      진행에서 뺀다). 횟수 · 시간 · 날짜는 그대로 쓴다.
 *   검토 목록(REVIEWED_INCOMPATIBLE_LOAD, 포고 홉)은 근거와 상관없이 incompatible.
 *
 * 뺀 줄도 지우지 않는다 — 원래 kg 은 rawKg 로만(자세히 보기의 '확인 전 무게'). 순수 모듈.
 */

import { bandComparisonKey } from '@/lib/workout/load/band-catalog';
import { acceptsMass, type RecordingContract } from '@/lib/workout/load/contract';
import { REVIEWED_INCOMPATIBLE_LOAD } from '@/lib/workout/load/overrides';
import type { BandPart, LoadStatus, MassLoad, MassPiece, SetupRef } from '@/lib/workout/load/recorded';
import { contractFromSnapshot, type LoadSnapshot } from '@/lib/workout/load/snapshot';

export type LoadEvidence = 'contract' | 'equipment' | 'current';

/** 옛 판(장비만 얼린 판)의 kg 을 읽는 대응표 판 — 바꾸면 판을 올리고 전달 문서에 근거를 적는다 */
export const HISTORICAL_MAPPING_VERSION = 1;

export type LoadReadContext = {
  exerciseId: string;
  contract: RecordingContract;
  evidence: LoadEvidence;
};

export type SetLoadViewStatus = LoadStatus | 'historicalMapped' | 'incompatible' | 'unverified' | 'none';

export type SetLoadView = {
  status: SetLoadViewStatus;
  /** kg 총량 · '가장 무거운 무게'에 넣을 값 — 넣지 않으면 null */
  metricKg: number | null;
  /** 추정 1RM 에 넣을 값 — 허용 목록 운동의 자유 중량일 때만 */
  e1rmKg: number | null;
  /** 화면에 '든 무게'로 보일 값(도구 무게 · 기구 설정값 포함) — 확인 전 · 맞지 않음이면 null */
  displayKg: number | null;
  /**
   * 다음 세트 · 다음 날의 무게 칸을 미리 채울 값 — 같은 뜻으로 견줄 수 있는 지난 값만(자유 중량 · 같은 기구 열쇠가 있는 기구 설정값 ·
   * 같은 운동의 도구 무게). 기구 정체를 모르는 케이블 · 머신 값은 미리 채우지 않는다(GPT 서브1 결정, 2R 점 4).
   */
  prefillKg: number | null;
  /** 줄에 적힌 원래 값(뺀 것도) — 자세히 보기에서만 */
  rawKg: number | null;
  /** 견줌 열쇠 — 같은 열쇠끼리만 최고 · 진행을 견준다. 없으면 견주지 않는다 */
  key: string | null;
  band: BandPart | null;
  /** 그 세트를 한 기구(사용자가 붙인 이름) — 화면이 '어느 기구로'를 보인다. 없으면 null */
  setup: SetupRef | null;
  /** 서로 다른 무게 도구(왼 · 오른) — 한 숫자가 없을 때도 기록을 그대로 보인다 */
  parts: MassPiece[] | null;
};

/** 계산(최고 · 총량 · 진행)에 넣는 상태 */
export function isIncluded(status: SetLoadViewStatus): boolean {
  return status === 'ok' || status === 'historicalMapped';
}

function massView(c: RecordingContract, m: MassLoad | { kg: number; setup?: null; parts?: null }, status: SetLoadViewStatus, raw: number | null): SetLoadView {
  const kg = m.kg;
  const view: SetLoadView = {
    status,
    metricKg: null,
    e1rmKg: null,
    displayKg: kg,
    prefillKg: null,
    rawKg: raw,
    key: null,
    band: null,
    setup: 'setup' in m && m.setup ? m.setup : null,
    parts: 'parts' in m && m.parts ? m.parts : null,
  };
  if (kg == null) return view; /* 서로 다른 무게의 도구 — 한 숫자가 없다 */
  if (c.mode === 'externalMass' && c.readiness === 'ready' && !('parts' in m && m.parts)) {
    view.metricKg = kg;
    view.key = c.key;
    view.prefillKg = kg;
    view.e1rmKg = c.e1rmEligible ? kg : null;
    return view;
  }
  if (c.mode === 'indicatedLoad' && 'setup' in m && m.setup) {
    /* 같은 사람이 이름 붙인 같은 기구끼리만 — 1RM 은 셈하지 않는다(잰 힘이 아니다). 미리 채우기는 부르는 쪽이 같은 열쇠인지 본다 */
    view.metricKg = kg;
    view.key = `${c.key}:${m.setup.key}`;
    view.prefillKg = kg;
    return view;
  }
  if (c.mode === 'implementMass' && c.readiness === 'ready') {
    /* 같은 운동의 도구 무게 — 보이고 미리 채우되 견주지 않는다(최고 · 총량 · 1RM 없음) */
    view.prefillKg = kg;
    return view;
  }
  return view; /* 기구 정체 모름 · 섞임 — 보이기만 */
}

/**
 * 한 줄의 무게를 계산용으로 본다.
 */
export function viewSetLoad(
  ctx: LoadReadContext,
  row: { weightKg: number | null; snapshot?: LoadSnapshot | null }
): SetLoadView {
  const raw = row.weightKg != null && row.weightKg > 0 ? row.weightKg : null;
  const empty = (status: SetLoadViewStatus, band: BandPart | null = null, key: string | null = null): SetLoadView => ({
    status,
    metricKg: null,
    e1rmKg: null,
    displayKg: null,
    prefillKg: null,
    rawKg: raw,
    key,
    band,
    setup: null,
    parts: null,
  });

  /*
   * 1. 세트 스냅샷(스키마 적용 뒤) — 그 세트를 받을 때의 실제 계약 · 변형 · 값이 권위다. 판 · 라이브러리의 지금 계약은 보지 않는다.
   *    다만 검토로 '맞지 않음'이 확인된 운동은 여기서도 계산에서 뺀다.
   */
  if (row.snapshot) {
    const snap = row.snapshot;
    const c = contractFromSnapshot(snap.contract);
    const l = snap.value;
    const status: SetLoadViewStatus = snap.status;
    if (status === 'legacyIncompatible') return empty('incompatible');
    if (l.kind === 'band') {
      const key = l.bands.length ? bandComparisonKey(l.role, l.bands) : null;
      return empty(l.bands.length ? status : 'unknownBand', { role: l.role, bands: l.bands }, key);
    }
    if (l.kind === 'combined') {
      /* 섞인 무게 — 무게 성분은 보이되 총량 · 1RM 에 넣지 않는다(밴드 힘을 kg 으로 더하지 않는다) */
      return { ...empty(status, l.band, null), displayKg: l.mass?.kg ?? null };
    }
    if (l.kind === 'none') return empty(status === 'ok' ? 'none' : status);
    if (REVIEWED_INCOMPATIBLE_LOAD.has(ctx.exerciseId)) return empty('incompatible');
    return massView(c, l, status, raw);
  }

  const c = ctx.contract;
  if (raw == null) return empty(c.mode === 'band' ? 'unknownBand' : 'none');
  if (REVIEWED_INCOMPATIBLE_LOAD.has(ctx.exerciseId)) return empty('incompatible');

  if (ctx.evidence === 'contract') {
    if (!acceptsMass(c)) return empty('incompatible');
    if (c.readiness !== 'ready') return empty('unverified');
    if (c.mode === 'combined') return { ...empty('ok'), displayKg: raw };
    return massView(c, { kg: raw }, 'ok', raw);
  }

  if (ctx.evidence === 'equipment') {
    /* 검토한 옛 대응표 v1 — 그 판에 얼린 장비의 자유 중량 한 묶음만 계산에 넣는다 */
    if (c.readiness === 'ready' && c.mode === 'externalMass' && c.massBasis !== 'added') {
      return massView(c, { kg: raw }, 'historicalMapped', raw);
    }
    /* 기구 설정값 · 도구 무게 — 보이되 견주지 않는다(그때 기구 정체 · 개수를 모른다) */
    if (c.readiness === 'ready' && (c.mode === 'indicatedLoad' || c.mode === 'implementMass')) {
      /* 도구 무게는 같은 운동이면 미리 채운다. 기구 설정값은 기구 정체를 몰라 미리 채우지도 않는다 */
      return { ...empty('historicalMapped'), displayKg: raw, prefillKg: c.mode === 'implementMass' ? raw : null };
    }
    return empty('unverified');
  }

  /* 'current' — 판에 없는 줄. 지금 장비는 그때 장비의 증거가 아니다 */
  return empty('unverified');
}

/** 계산에 쓸 kg 만(총량 · 최고). 부르는 쪽이 줄 단위로 빠르게 거를 때 */
export function metricKgOf(ctx: LoadReadContext, weightKg: number | null): number | null {
  return viewSetLoad(ctx, { weightKg }).metricKg;
}
