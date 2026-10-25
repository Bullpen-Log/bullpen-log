import { ArmStatusNote } from '@/components/arm-status-note';
import { ARM_MISSING_TEXT, armUnknown, type CoachArmStatus } from '@/lib/org/arm-view';

/** 코치 · 보호자 화면의 팔 상태 — 못 읽은 것이 있는 '안전'은 '정보 부족'으로(lib/org/arm-view.ts) */
export function CoachArmNote({ status }: { status: CoachArmStatus }) {
  return (
    <div className="space-y-2">
      {armUnknown(status) ? (
        <p className="text-sm font-bold text-muted">정보 부족</p>
      ) : (
        <ArmStatusNote status={status} bare />
      )}
      {status.missing.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted">
          {status.missing.map((m) => (
            <li key={m}>{ARM_MISSING_TEXT[m]}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
