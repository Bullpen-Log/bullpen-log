/**
 * 장비 가용성(EX-STEPBOX01). 필수 묶음끼리는 모두(AND), 한 묶음의 대체품은 하나만(OR).
 * 저장 장비·과거 기록은 고치지 않는다. 대체는 승인된 운동 ID에만 붙이며 이름으로 추측하지 않는다.
 * 중량 기록 계약과는 다른 축이다. 대체품을 equipment 배열에 합쳐 무게로 해석하지 않는다.
 */
export type EquipmentSource = { id?: string; equipment: readonly string[] };
export type EquipmentRequirement = {
  primary: string;
  alternatives: readonly string[];
  condition?: string;
};

export const BULGARIAN_JUMP_ID = '854ee1d0-f529-4ddf-b502-20afa9a9ce8b';
export const STEP_BOX = '스텝박스';
export const BOX_SUPPORT_CONDITION = '적절한 높이의 튼튼하고 안정적인 박스만 사용하세요. 미끄럽거나 움직이는 받침은 사용하지 마세요.';

/** 저장값은 유지하고 화면에서만 용도를 구분한다. 박스를 스텝박스의 전역 별명으로 쓰지 않는다. */
export function equipmentName(name: string): string {
  if (name === '박스') return '박스 (점프용)';
  if (name === '케이블') return '케이블 머신';
  return name;
}

export function equipmentRequirements(ex: EquipmentSource): EquipmentRequirement[] {
  const gear = [...new Set(ex.equipment)];
  // 관리자가 받침을 제거한 운동에 과거 ID만으로 다시 넣지 않는다.
  const profiled = ex.id === BULGARIAN_JUMP_ID && gear.some((e) => e === '박스' || e === STEP_BOX);
  let supportAdded = false;
  return gear.flatMap((name): EquipmentRequirement[] => {
    if (profiled && (name === '박스' || name === STEP_BOX)) {
      if (supportAdded) return [];
      supportAdded = true;
      return [{ primary: STEP_BOX, alternatives: ['박스'], condition: BOX_SUPPORT_CONDITION }];
    }
    return [{ primary: name, alternatives: [] }];
  });
}

export function missingEquipment(ex: EquipmentSource, available: ReadonlySet<string>): EquipmentRequirement[] {
  return equipmentRequirements(ex).filter((r) =>
    ![r.primary, ...r.alternatives].some((name) => name === '맨몸' || available.has(name))
  );
}

export const canUseEquipment = (ex: EquipmentSource, available: ReadonlySet<string>) => missingEquipment(ex, available).length === 0;
export const primaryEquipment = (ex: EquipmentSource) => equipmentRequirements(ex).map((r) => r.primary);

/** 분류 검색용 OR 태그. 가용성의 AND 검사에는 이 평평한 목록을 쓰지 않는다. */
export const equipmentSearchTags = (ex: EquipmentSource) => [...new Set(equipmentRequirements(ex).flatMap((r) => [r.primary, ...r.alternatives]))];
export const equipmentConditions = (ex: EquipmentSource) => equipmentRequirements(ex).flatMap((r) => r.condition ? [r.condition] : []);
export const requirementLabel = (r: EquipmentRequirement) => r.alternatives.length
  ? `${equipmentName(r.primary)} 또는 ${r.alternatives.map(equipmentName).join(' / ')} (높이·안정성 확인)`
  : equipmentName(r.primary);
export const equipmentSummary = (ex: EquipmentSource) => equipmentRequirements(ex).map(requirementLabel).join(' · ');
