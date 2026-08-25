import { redirect } from 'next/navigation';

/**
 * 예전 홈 주소.
 *
 * 홈은 입력(체크인)과 출력(부하·추이)이 섞여 있었고, 정작 매일 해야 하는
 * 기록은 다른 화면에 있었다. 그래서 하는 일 기준으로 나눴다 —
 * 오늘 할 일은 트레이닝, 돌아보는 것은 분석.
 *
 * 화면은 없앴지만 주소는 남긴다. 북마크나 예전 링크를 타고 온 사람이
 * 빈 화면을 보면 안 된다.
 */
export default function DashboardPage() {
  redirect('/today');
}
