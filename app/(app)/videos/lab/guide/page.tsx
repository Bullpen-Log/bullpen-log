import { requireUser } from '@/lib/dal';
import { LabGuideView } from './guide-view';

/**
 * 3D 동작 분석 촬영 안내 — 엔진이 가장 잘 알아보는 조건을 찍기 전에 보고, 현장에서 확인 목록으로 하나씩 누른다
 * (2026-10-15 사용자: "우리가 가장 잘 인식할 수 있는 조건을 사용자가 참고해서 촬영할 수 있게").
 * 조건의 근거는 lib/pitch-lab-guide.ts 머리 주석. 실험실 목록의 올리기 칸 · 빈 목록 · 올리기 전 검사 · 분석 실패 화면이 이곳을 가리킨다.
 */
export default async function LabGuidePage() {
  await requireUser();
  return <LabGuideView />;
}
