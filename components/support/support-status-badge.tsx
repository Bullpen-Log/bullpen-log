import { Badge } from '@/components/ui';
import { INQUIRY_STATUS, type InquiryStatusKey } from '@/lib/support';

/*
 * 상태의 색 — 접수됨은 하늘(기다리는 중), 답변 완료는 초록(--color-ok · emerald 원색은 흰 바탕에서 안 읽힌다),
 * 종료는 회색(Badge 기본). 이름 · 색 구분은 lib/support.ts INQUIRY_STATUS 가 쥔다.
 */
const TONE_CLASS: Record<(typeof INQUIRY_STATUS)[InquiryStatusKey]['tone'], string> = {
  sky: 'border-sky-soft/40 text-sky',
  good: 'border-ok/40 text-ok',
  muted: '',
};

/** 1:1 문의의 상태 알약 — 목록 · 상세 · 관리자가 같은 것을 쓴다 */
export function SupportStatusBadge({ status }: { status: InquiryStatusKey }) {
  const meta = INQUIRY_STATUS[status];
  return <Badge className={TONE_CLASS[meta.tone]}>{meta.label}</Badge>;
}
