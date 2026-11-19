import { redirect } from 'next/navigation';

/** 코치 대화는 앱 화면(native/src/app/coach-chat.tsx) — 웹 알림함에서 누른 '/coach-chat'(코치가 먼저 건 말)은 코치 화면으로 */
export default function CoachChatPage() {
  redirect('/coach');
}
