import { RoundChat } from '@/components/round-icon';

/** 채팅 — 대화를 고르기 전의 오른쪽 칸(휴대폰은 목록만 보여 이 칸은 숨는다). 목록은 layout.tsx */
export default function ChatHome() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="grid h-20 w-20 place-items-center rounded-full border-2 border-ink text-ink">
        <RoundChat className="h-9 w-9" />
      </span>
      <p className="text-lg font-bold text-ink">내 메시지</p>
      <p className="text-sm text-muted">왼쪽에서 대화를 골라 주세요. 장터 물건의 ‘채팅하기’로 새 대화를 열 수 있어요.</p>
    </div>
  );
}
