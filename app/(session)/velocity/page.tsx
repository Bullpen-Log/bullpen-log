import { redirect } from 'next/navigation';

/**
 * /velocity — 불펜 벨로시티의 자리는 투구 기록 탭의 [구속 측정] 보기다(사용자 요청 — 따로 홈을
 * 두지 않고 캘린더 · 목록 옆에). 옛 주소로 들어오면 그리로 보낸다. 측정은 /velocity/measure.
 */
export default function VelocityPage() {
  redirect('/videos?view=velocity');
}
