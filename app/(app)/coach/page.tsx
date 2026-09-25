import { redirect } from 'next/navigation';
import { readCoachView } from './tabs';

/**
 * 예전 분석 탭 — 홈으로 옮겼다.
 *
 * 분석은 결국 '그날 어땠나'를 보는 일이고, 날짜는 홈 캘린더가 쥐고 있었다. 그래서
 * 홈 캘린더 밑에 늘 떠 있는 분석 칸으로 옮겼다(app/(app)/today/analysis-block.tsx).
 * 캘린더에서 날짜를 누르면 그날 분석으로 바뀐다.
 *
 * 이 주소를 저장해 둔 사람을 위해 홈의 같은 칸으로 넘겨 준다(?view= 를 그대로 옮긴다).
 * 이 폴더의 부품들(부하 지수·추이·리포트 카드)은 홈 분석 칸이 그대로 쓴다.
 */
export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const view = readCoachView((await searchParams).view);
  redirect(`/today?analysis=${view}#analysis`);
}
