import { AbsEmbed } from './abs-embed';

/**
 * ABS 3D 둘러보기만 — 아이폰 앱 판정 카드(native/src/velocity/abs/verdict-card.tsx)가 전체 화면 웹뷰로 띄운다
 * (근육 그림 app/embed/muscle · 3D 동작 분석 app/embed/lab 과 같은 방식 — 3D 는 웹 WebGL 한 벌). 앱 틀 · 하단 탭이 없는 맨 화면(app/(app) 밖).
 * 판정 · 궤적은 아직 저장 전 공일 수 있어 주소가 아니라 앱이 웹뷰에 넣는다(abs-embed.tsx).
 */
export default function AbsEmbedPage() {
  return <AbsEmbed />;
}
