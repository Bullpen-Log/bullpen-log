import type { ActLogType, OpenScreen } from '@/lib/coach/act';

/**
 * 코치 카드(개인 비서 1단계, 2026-11-20 김민: "AI 코치가 싱커 안 개인 비서 — 모든 부분에서 액세스와 컨트롤") — 코치가 도구로 낸 바꾸기 제안 하나.
 * 코치는 바꾸지 않는다: 카드를 만들 뿐이고 선수가 눌러야 실행된다(서버가 그때 다시 확인). 화면 열기 · 투구 기록 초안은 앱이 그 화면을 연다(open).
 * 저장은 CoachMessage.act 칸에 { cards } 로(옛 마디의 act 는 대신 해 주기 하나 — lib/coach/act.ts readAct). 순수 파일 — 앱도 읽는다.
 */
export type CardOpen =
  | { kind: 'screen'; screen: OpenScreen }
  | { kind: 'log'; date: string; type: ActLogType; count: number | null };

export type CoachCard = {
  /** 마디 안에서만 고유('c0' …) */
  id: string;
  /** 낸 도구 이름(lib/coach/tool-defs.ts) — 실행할 때 이 도구의 확인 · 실행을 다시 탄다 */
  tool: string;
  title: string;
  /** 미리보기 줄(무엇이 바뀌나) */
  lines: string[];
  /** 단추 글 */
  cta: string;
  /** 앱이 화면을 여는 카드 — 서버 실행 없음 */
  open?: CardOpen;
  /** 서버 실행 카드의 입력(도구가 거른 값) */
  args?: unknown;
  /** 지우기 · 그만두기처럼 되돌리기 어려운 카드 — 앱이 이 글로 한 번 더 묻는다(4단계 '지우기는 두 번 묻는다') */
  confirm?: string;
  done?: boolean;
};

/** 한 답에 낼 수 있는 카드 수 */
export const CARDS_MAX = 4;

const str = (v: unknown): v is string => typeof v === 'string';

/** 저장된 act 칸 → 카드들(옛 대신 해 주기 모양이면 null) */
export function readCards(raw: unknown): CoachCard[] | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { cards?: unknown }).cards)) return null;
  return ((raw as { cards: unknown[] }).cards as Record<string, unknown>[])
    .filter((c) => c && typeof c === 'object' && str(c.id) && str(c.tool) && str(c.title) && str(c.cta) && Array.isArray(c.lines))
    .map((c) => ({
      id: c.id as string,
      tool: c.tool as string,
      title: c.title as string,
      lines: (c.lines as unknown[]).filter(str),
      cta: c.cta as string,
      ...(c.open && typeof c.open === 'object' ? { open: c.open as CardOpen } : {}),
      ...(c.args !== undefined ? { args: c.args } : {}),
      ...(str(c.confirm) ? { confirm: c.confirm } : {}),
      ...(c.done ? { done: true } : {}),
    }));
}

/** 앱에 보낼 때는 서버 실행 입력(args)을 뺀다 */
export function shownCard(card: CoachCard): Omit<CoachCard, 'args'> {
  const c: Partial<CoachCard> = { ...card };
  delete c.args;
  return c as Omit<CoachCard, 'args'>;
}
