import type { Metadata } from 'next';
import { EngineClient } from './engine-client';

export const metadata: Metadata = {
  title: '구속 계산',
  robots: { index: false, follow: false },
};

/**
 * 아이폰 앱(native/, Expo)의 숨은 웹뷰가 여는 '구속 계산기' — 화면이 없다(2026-10-17 엔지니어링 검토 D5).
 *
 * 앱은 구속 측정 화면을 네이티브로 그리지만, 구속 엔진(lib/velocity-engine)은 브라우저 기능(워커 · WebCodecs · onnxruntime-web)에
 * 기대어 RN 에서 못 돈다. 그래서 앱이 이 쪽을 보이지 않는 웹뷰로 열어 두고 클립을 보내면, 지금 사이트가 앱 클립을 재는 것과 같은
 * 옵션으로 재서 결과만 돌려준다 — 엔진 값 · 스피드건 보정이 그대로다. 로그인 · 데이터는 쓰지 않는다(계산만).
 */
export default function VelocityEnginePage() {
  return <EngineClient />;
}
