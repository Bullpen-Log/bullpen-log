import type { Metadata } from 'next';
import { FindWizard } from './find-wizard';

export const metadata: Metadata = { title: '나에게 맞는 코치 찾기' };

/** 맞춤 코치 찾기(3판) — 닥터나우 진료 신청서 · '어떤 의사를 선호하시나요'를 한 흐름으로. 답은 목록 주소(/lessons/list)에 실린다 */
export default function FindCoachPage() {
  return <FindWizard />;
}
