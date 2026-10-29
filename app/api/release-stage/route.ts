import { NextResponse } from 'next/server';
import { RELEASE_POLICY_VERSION } from '@/lib/release-access';
import { releaseStage } from '@/lib/release-gate';

/**
 * 지금 서버의 출시 단계(2026-10-30) — 서버 환경변수 RELEASE_STAGE 가 이 배포에 실제로 들어갔는지 밖에서 확인하는 곳.
 * 사람 · 계정 정보는 없다(단계 · 정책 판 · 변수가 비었는지만). 변수 값 자체는 돌려주지 않는다.
 *   curl https://dugout-baseball.com/api/release-stage
 * restricted_beta 면 일반 · 준관리자는 투구 3D 만, released 면 잠금 없음. source 'code' = 변수가 없어 코드 기본값(lib/release-access.ts RELEASE_STAGE_DEFAULT)을 쓴다.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { stage: releaseStage(), policyVersion: RELEASE_POLICY_VERSION, set: !!process.env.RELEASE_STAGE?.trim(), source: process.env.RELEASE_STAGE?.trim() ? 'env' : 'code' },
    { headers: { 'cache-control': 'no-store' } }
  );
}
