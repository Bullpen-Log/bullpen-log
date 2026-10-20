-- 준관리자(MANAGER) — 더하기만. 지금 ADMIN 은 그대로 대표관리자(2026-10-20 금윤호).
-- migrate diff 가 내는 VelocityAttempt 외래키 지우기 셋은 넣지 않았다(예전부터 DB 에만 있는 것 — HANDOFF 10-16).
ALTER TYPE "Role" ADD VALUE 'MANAGER';
