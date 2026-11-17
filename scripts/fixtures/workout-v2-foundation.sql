-- EX-RX01 R2A — 운동 판 v2 기초(더하기만). **아직 적용하지 않는다** (README.md 참고).
-- prisma/migrations 밖에 두어 `prisma migrate deploy`(Vercel 빌드 포함)가 보지 않는다.
--
-- 담는 것
--   1) TrainingSession · UserExerciseSet · UserTrainingProgram 에 판 번호 · 세대 · 울타리 칸(기본값이 있어 옛 줄은 다시 쓰지 않는다)
--   2) 목표 판(WorkoutTargetRevision) · 작업 영수증(WorkoutMutationReceipt) · 지운 세트 표식(WorkoutSetTombstone) · 복구함(WorkoutRecoveryItem)
--   3) 옛 쓰기 울타리 trigger — mutationProtocolVersion >= 2 인 줄은 v2 명령의 거래 안(같은 거래의 set_config 문맥)에서만 바뀐다
--
-- 울타리는 인증이 아니다. 서버의 로그인 · 조직 권한 검사를 대신하지 않는다. 옛 서버 · 옛 배포가 v2 줄을 덮어쓰지 못하게 하는 호환 장치다.

-- 1) 기존 표에 칸 더하기 --------------------------------------------------------------------------

ALTER TABLE "TrainingSession"
  ADD COLUMN "stateVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "runGeneration" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "mutationProtocolVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "safetyEpoch" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "UserExerciseSet"
  ADD COLUMN "entryId" TEXT,
  ADD COLUMN "plannedSetKey" TEXT,
  ADD COLUMN "targetRevisionId" TEXT,
  ADD COLUMN "clientSetId" TEXT,
  ADD COLUMN "recordVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "runGeneration" INTEGER;

-- 같은 사람의 같은 세트(클라이언트가 만든 번호)는 하나. NULL 은 서로 다르게 친다(옛 세트는 번호가 없다)
CREATE UNIQUE INDEX "UserExerciseSet_userId_clientSetId_key" ON "UserExerciseSet"("userId", "clientSetId");
CREATE INDEX "UserExerciseSet_targetRevisionId_idx" ON "UserExerciseSet"("targetRevisionId");

ALTER TABLE "UserTrainingProgram"
  ADD COLUMN "mutationProtocolVersion" INTEGER NOT NULL DEFAULT 1;

-- 2) 새 표 ---------------------------------------------------------------------------------------

CREATE TABLE "WorkoutTargetRevision" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "runGeneration" INTEGER NOT NULL,
  "seq" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "changedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "policyVersion" INTEGER NOT NULL,
  "operationId" TEXT,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkoutTargetRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkoutTargetRevision_sessionId_entryId_seq_key" ON "WorkoutTargetRevision"("sessionId", "entryId", "seq");
CREATE INDEX "WorkoutTargetRevision_sessionId_idx" ON "WorkoutTargetRevision"("sessionId");
CREATE INDEX "WorkoutTargetRevision_userId_exerciseId_createdAt_idx" ON "WorkoutTargetRevision"("userId", "exerciseId", "createdAt");

CREATE TABLE "WorkoutMutationReceipt" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "sessionId" TEXT,
  "runGeneration" INTEGER,
  "commandType" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "resultCode" TEXT NOT NULL,
  "stateVersion" INTEGER,
  "result" JSONB NOT NULL,
  "effectKey" TEXT,
  "effect" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkoutMutationReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkoutMutationReceipt_ownerId_operationId_key" ON "WorkoutMutationReceipt"("ownerId", "operationId");
-- 한 프로그램 회차의 한 일차에 효과(넘김 · 건너뜀 · 보류)는 하나
CREATE UNIQUE INDEX "WorkoutMutationReceipt_effectKey_key" ON "WorkoutMutationReceipt"("effectKey");
CREATE INDEX "WorkoutMutationReceipt_sessionId_idx" ON "WorkoutMutationReceipt"("sessionId");

CREATE TABLE "WorkoutSetTombstone" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientSetId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "entryId" TEXT,
  "plannedSetKey" TEXT,
  "targetRevisionId" TEXT,
  -- 지운 세트의 값 — 옛 앱이 같은 세트 번호로 다시 보낸 것이 '늦게 온 같은 세트'인지 '새 세트'인지 가른다
  "values" JSONB,
  "deletedByOperationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkoutSetTombstone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkoutSetTombstone_userId_clientSetId_key" ON "WorkoutSetTombstone"("userId", "clientSetId");
CREATE INDEX "WorkoutSetTombstone_sessionId_idx" ON "WorkoutSetTombstone"("sessionId");

CREATE TABLE "WorkoutRecoveryItem" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "sessionId" TEXT,
  "exerciseId" TEXT,
  "conflictCode" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'open',
  "resolvedByOperationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "WorkoutRecoveryItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkoutRecoveryItem_ownerId_fingerprint_key" ON "WorkoutRecoveryItem"("ownerId", "fingerprint");
CREATE INDEX "WorkoutRecoveryItem_ownerId_state_idx" ON "WorkoutRecoveryItem"("ownerId", "state");

-- 3) 옛 쓰기 울타리 ----------------------------------------------------------------------------------
--
-- v2 명령은 거래 하나 안에서 (1) pg_advisory_xact_lock 으로 선수(데이터 주인) 잠금 (2) set_config(..., true) 로
-- 'bullpen.workout_v2_owner' = 선수 id, 'bullpen.workout_v2_mode' = 'command' | 'purge' 를 건다(거래가 끝나면 사라진다 —
-- 풀러의 같은 연결을 다음 거래가 써도 남지 않는다). 아래 trigger 는 그 문맥 없이 v2 줄을 바꾸는 쓰기를 거절한다.

CREATE OR REPLACE FUNCTION "workout_v2_ctx_owner"() RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('bullpen.workout_v2_owner', true), '')
$$;

CREATE OR REPLACE FUNCTION "workout_v2_ctx_mode"() RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('bullpen.workout_v2_mode', true), '')
$$;

CREATE OR REPLACE FUNCTION "workout_v2_fence_session"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- 새 판을 처음부터 v2 로 넣으려면 문맥이 있어야 한다
    IF NEW."mutationProtocolVersion" >= 2 AND "workout_v2_ctx_owner"() IS DISTINCT FROM NEW."userId" THEN
      RAISE EXCEPTION 'WORKOUT_V2_FENCE: v2 session insert without command context' USING ERRCODE = 'BPV20';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."mutationProtocolVersion" < 2 THEN
    -- 옛 줄: 문맥 없이도 그대로. 다만 v2 로 올리는(promote) 일은 문맥 안에서만
    IF TG_OP = 'UPDATE' AND NEW."mutationProtocolVersion" >= 2 AND "workout_v2_ctx_owner"() IS DISTINCT FROM OLD."userId" THEN
      RAISE EXCEPTION 'WORKOUT_V2_FENCE: promotion without command context' USING ERRCODE = 'BPV20';
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF "workout_v2_ctx_owner"() IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'WORKOUT_V2_FENCE: protected session written outside a v2 command' USING ERRCODE = 'BPV20';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF "workout_v2_ctx_mode"() IS DISTINCT FROM 'purge' THEN
      RAISE EXCEPTION 'WORKOUT_V2_FENCE: protected session delete requires purge mode' USING ERRCODE = 'BPV20';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."mutationProtocolVersion" < OLD."mutationProtocolVersion" THEN
    RAISE EXCEPTION 'WORKOUT_V2_FENCE: protocol downgrade' USING ERRCODE = 'BPV20';
  END IF;
  IF NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."date" IS DISTINCT FROM OLD."date" THEN
    RAISE EXCEPTION 'WORKOUT_V2_FENCE: owner/date are immutable' USING ERRCODE = 'BPV20';
  END IF;
  IF NEW."stateVersion" <> OLD."stateVersion" + 1 THEN
    RAISE EXCEPTION 'WORKOUT_V2_FENCE: stateVersion must advance by one' USING ERRCODE = 'BPV20';
  END IF;
  IF NEW."runGeneration" < OLD."runGeneration" OR NEW."safetyEpoch" < OLD."safetyEpoch" THEN
    RAISE EXCEPTION 'WORKOUT_V2_FENCE: generation/epoch cannot go back' USING ERRCODE = 'BPV20';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "TrainingSession_workout_v2_fence"
  BEFORE INSERT OR UPDATE OR DELETE ON "TrainingSession"
  FOR EACH ROW EXECUTE FUNCTION "workout_v2_fence_session"();

CREATE OR REPLACE FUNCTION "workout_v2_fence_set"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_protocol INTEGER := NULL;
  old_owner TEXT := NULL;
  new_protocol INTEGER := NULL;
  new_owner TEXT := NULL;
BEGIN
  -- 옛 판(OLD)과 새 판(NEW)을 따로 본다 — 세트를 v2 판 밖으로 옮기는 쓰기도 막는다(검토 #1)
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT "mutationProtocolVersion", "userId" INTO old_protocol, old_owner FROM "TrainingSession" WHERE "id" = OLD."sessionId";
  END IF;
  IF TG_OP IN ('UPDATE', 'INSERT') THEN
    SELECT "mutationProtocolVersion", "userId" INTO new_protocol, new_owner FROM "TrainingSession" WHERE "id" = NEW."sessionId";
  END IF;
  IF COALESCE(old_protocol, 1) < 2 AND COALESCE(new_protocol, 1) < 2 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF COALESCE(old_protocol, 1) >= 2 AND "workout_v2_ctx_owner"() IS DISTINCT FROM old_owner THEN
    RAISE EXCEPTION 'WORKOUT_V2_FENCE: set of a protected session written outside a v2 command' USING ERRCODE = 'BPV20';
  END IF;
  IF COALESCE(new_protocol, 1) >= 2 AND "workout_v2_ctx_owner"() IS DISTINCT FROM new_owner THEN
    RAISE EXCEPTION 'WORKOUT_V2_FENCE: set of a protected session written outside a v2 command' USING ERRCODE = 'BPV20';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."sessionId" IS DISTINCT FROM OLD."sessionId" OR NEW."userId" IS DISTINCT FROM OLD."userId" THEN
      RAISE EXCEPTION 'WORKOUT_V2_FENCE: set owner/session are immutable' USING ERRCODE = 'BPV20';
    END IF;
    -- 실제 값 · 연결이 바뀌면 판 번호가 하나 올라야 한다(늦은 옛 고침이 새 고침을 덮지 않게)
    IF (NEW."weightKg", NEW."reps", NEW."holdSeconds", NEW."rir", NEW."targetRevisionId", NEW."plannedSetKey", NEW."entryId")
       IS DISTINCT FROM (OLD."weightKg", OLD."reps", OLD."holdSeconds", OLD."rir", OLD."targetRevisionId", OLD."plannedSetKey", OLD."entryId")
       AND NEW."recordVersion" <> OLD."recordVersion" + 1 THEN
      RAISE EXCEPTION 'WORKOUT_V2_FENCE: recordVersion must advance by one' USING ERRCODE = 'BPV20';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER "UserExerciseSet_workout_v2_fence"
  BEFORE INSERT OR UPDATE OR DELETE ON "UserExerciseSet"
  FOR EACH ROW EXECUTE FUNCTION "workout_v2_fence_set"();

CREATE OR REPLACE FUNCTION "workout_v2_fence_program"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."mutationProtocolVersion" < 2 THEN
    IF TG_OP = 'UPDATE' AND NEW."mutationProtocolVersion" >= 2 AND "workout_v2_ctx_owner"() IS DISTINCT FROM OLD."userId" THEN
      RAISE EXCEPTION 'WORKOUT_V2_FENCE: program promotion without command context' USING ERRCODE = 'BPV20';
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF "workout_v2_ctx_owner"() IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'WORKOUT_V2_FENCE: protected program enrollment written outside a v2 command' USING ERRCODE = 'BPV20';
  END IF;
  IF TG_OP = 'DELETE' AND "workout_v2_ctx_mode"() IS DISTINCT FROM 'purge' THEN
    RAISE EXCEPTION 'WORKOUT_V2_FENCE: protected enrollment delete requires purge mode' USING ERRCODE = 'BPV20';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."mutationProtocolVersion" < OLD."mutationProtocolVersion" THEN
    RAISE EXCEPTION 'WORKOUT_V2_FENCE: protocol downgrade' USING ERRCODE = 'BPV20';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER "UserTrainingProgram_workout_v2_fence"
  BEFORE UPDATE OR DELETE ON "UserTrainingProgram"
  FOR EACH ROW EXECUTE FUNCTION "workout_v2_fence_program"();

-- 목표 판 · 영수증 · 표식은 바꾸지 않는다. 지우는 것은 문맥 안의 purge(계정 지우기 · 보관 기간 정리)만
CREATE OR REPLACE FUNCTION "workout_v2_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_owner TEXT := COALESCE(to_jsonb(OLD) ->> 'userId', to_jsonb(OLD) ->> 'ownerId');
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'WORKOUT_V2_FENCE: % rows are immutable', TG_TABLE_NAME USING ERRCODE = 'BPV20';
  END IF;
  -- 지우기는 그 사람의 purge 문맥에서만(계정 지우기 · 보관 정리) — 다른 사람 줄을 지우지 못한다(검토 #4)
  IF "workout_v2_ctx_mode"() IS DISTINCT FROM 'purge' OR "workout_v2_ctx_owner"() IS DISTINCT FROM row_owner THEN
    RAISE EXCEPTION 'WORKOUT_V2_FENCE: % delete requires the owner purge context', TG_TABLE_NAME USING ERRCODE = 'BPV20';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER "WorkoutTargetRevision_immutable" BEFORE UPDATE OR DELETE ON "WorkoutTargetRevision"
  FOR EACH ROW EXECUTE FUNCTION "workout_v2_immutable"();
CREATE TRIGGER "WorkoutMutationReceipt_immutable" BEFORE UPDATE OR DELETE ON "WorkoutMutationReceipt"
  FOR EACH ROW EXECUTE FUNCTION "workout_v2_immutable"();
CREATE TRIGGER "WorkoutSetTombstone_immutable" BEFORE UPDATE OR DELETE ON "WorkoutSetTombstone"
  FOR EACH ROW EXECUTE FUNCTION "workout_v2_immutable"();
