import { IntakeFlow } from '@/components/intake/intake-flow';

/** 초대 링크 화면. 서버는 아무것도 읽지 않는다 — 토큰은 주소 조각에 있어 브라우저만 안다 */
export default function SubmitPage() {
  return <IntakeFlow />;
}
