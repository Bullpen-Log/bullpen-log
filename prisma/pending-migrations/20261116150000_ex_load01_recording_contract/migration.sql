-- EX-LOAD01 — 장비 기록 계약 · 밴드 · 원래 요청 복구(더하기만). 아직 적용하지 않는다 — README 의 차례.
-- 옛 줄은 다시 쓰지 않는다: 새 칸은 모두 NULL 허용, 새 표는 새로 만든다. 옛 코드는 새 칸을 모르고 그대로 돈다.
-- v2 보류 마이그레이션(20261113120000_workout_v2_foundation)과 서로 기대지 않는다(어느 차례로 적용해도 된다).

-- 세트마다 얼린 무게 스냅샷(lib/workout/load/snapshot.ts LoadSnapshot v1): 실제 계약 · 고른 변형 · 정규화한 무게(밴드 · 섞임 ·
-- 서로 다른 무게 · 기구 열쇠) · 상태 · 출처. NULL = 스냅샷 없는 옛 줄(읽기 관문이 판의 계약 · 장비로 본다).
ALTER TABLE "UserExerciseSet" ADD COLUMN IF NOT EXISTS "load" JSONB;

-- 관리자가 고치는 '뜻 설정'(lib/workout/load/contract.ts SemanticOverrides): 밴드 역할 · 같이/골라 쓰기 · 받침 · 무게 더한 변형 · 1RM.
-- NULL = 설정 없음(장비만으로 정한다). 코드의 검토 표(lib/workout/load/overrides.ts)는 locked 인 것만 이 칸을 이긴다.
ALTER TABLE "ExerciseVideo" ADD COLUMN IF NOT EXISTS "loadSemantics" JSONB;

-- 옛 앱이 장비가 받지 않는 kg 을 보낸 세트의 원래 요청(정규화 전 그대로 · 지문). 정식 세트와 같은 거래에서 남는다.
-- 같은 지문 = 같은 재전송(한 줄), 다른 kg = 다른 지문(따로 남음). 정식 세트는 하나(setId 로 잇는다).
CREATE TABLE IF NOT EXISTS "WorkoutLoadRecovery" (
  "id"              TEXT PRIMARY KEY,
  "ownerId"         TEXT NOT NULL,
  "actorId"         TEXT NOT NULL,
  "setId"           TEXT NOT NULL,
  "sessionId"       TEXT NOT NULL,
  "exerciseId"      TEXT NOT NULL,
  "setNo"           INTEGER NOT NULL,
  "clientSetId"     TEXT,
  "originalHash"    TEXT NOT NULL,
  "originalPayload" JSONB NOT NULL,
  "reason"          TEXT NOT NULL,
  "protocol"        INTEGER,
  "state"           TEXT NOT NULL DEFAULT 'open',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkoutLoadRecovery_owner_set_hash_key"
  ON "WorkoutLoadRecovery" ("ownerId", "sessionId", "exerciseId", "setNo", "originalHash");
CREATE INDEX IF NOT EXISTS "WorkoutLoadRecovery_ownerId_state_idx" ON "WorkoutLoadRecovery" ("ownerId", "state");
CREATE INDEX IF NOT EXISTS "WorkoutLoadRecovery_setId_idx" ON "WorkoutLoadRecovery" ("setId");
