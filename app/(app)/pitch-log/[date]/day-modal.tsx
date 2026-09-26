'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Modal } from '@/components/modal';
import { announcePopupOpened } from '@/components/link-pending';
import { pageBeforePopup } from '@/lib/last-page';

/**
 * 투구 기록 팝업 — 날짜 화면을 지금 보던 화면 위에 띄운다.
 *
 * 앱 안에서 날짜를 누르면 주소는 /pitch-log/<날짜> 로 바뀌지만 화면은 넘어가지 않고
 * 그 위에 이 창이 뜬다(app/(app)/@modal/(.)pitch-log). 닫으면(✕ · Esc · 바깥 누르기 ·
 * 브라우저 뒤로) 한 칸 뒤로 가서 보던 화면이 그대로 남는다 — 홈에서 열었으면 홈, 투구
 * 기록 탭에서 열었으면 그 탭이다.
 *
 * 창은 화면만큼 크게 둔다(page — 폭 76rem, 높이 94%). 한때 작은 창에 영상 · 폼 분석 · 고치기가 다 들어가 창
 * 안에서만 굴러가다 페이지로 옮긴 적이 있다. 넓은 창이면 영상이 제 크기로 보이고, 긴
 * 것은 창 안에서 굴러간다.
 */

/** 닫는 움직임(globals.css 의 dialog 0.12초)이 끝난 뒤에 뒤로 간다 */
const CLOSE_MS = 130;

type DayModalValue = {
  /** 팝업을 띄우기 전에 보던 화면(예: '/today', '/videos') — 모르면 null */
  origin: string | null;
  /** 창을 닫고 보던 화면으로 돌아간다 */
  close: () => void;
};

const DayModalContext = createContext<DayModalValue | null>(null);

/** 팝업 안이면 닫는 법과 돌아갈 화면을, 페이지면 null 을 준다 */
export function useDayModal() {
  return useContext(DayModalContext);
}

/**
 * 팝업 자리는 다른 화면으로 옮겨 가도 전에 띄운 것을 그대로 들고 있다(그 화면에 맞는
 * 팝업이 없으면 바꾸지 않는다). 그래서 주소가 이 팝업을 연 주소가 아니게 되면 스스로
 * 거둔다 — 팝업 안의 '투구 기록' 단추로 탭을 옮겼는데 팝업이 남아 있으면 안 된다.
 *
 * 자리에 '다른 모든 주소는 빈칸'을 두는 방법(catch-all)도 있지만, 그러면 없는 주소까지
 * 앱 틀이 받아서 404 대신 로그인 화면이 떴다.
 *
 * 그 주소로 다시 들어올 때마다 창을 새로 만든다(key) — 지난번에 닫던 상태가 남으면
 * 같은 날을 다시 눌렀을 때 창이 안 뜬다.
 */
export function DayModal({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname();
  /* 이 팝업의 주소 — 처음 뜰 때의 것(/pitch-log/<날짜>) */
  const [own] = useState(pathname);
  const here = pathname === own;
  const [visit, setVisit] = useState(0);
  const [wasHere, setWasHere] = useState(here);
  if (here !== wasHere) {
    setWasHere(here);
    if (here) setVisit((v) => v + 1);
  }
  if (!here) return null;
  return (
    <DayModalWindow key={visit} title={title}>
      {children}
    </DayModalWindow>
  );
}

function DayModalWindow({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  /* 한 번만 뒤로 간다 — 창이 닫히며 한 번 더 '닫힘'을 알려 와도 두 칸 가지 않게 */
  const leaving = useRef(false);
  /* 이 창을 띄우기 전의 화면 — 처음 뜰 때 한 번 읽어 둔다 */
  const [origin] = useState(pageBeforePopup);

  /* 떴다고 알린다 — 누른 링크의 도는 표시가 멈춘다(components/link-pending.tsx) */
  useEffect(() => {
    announcePopupOpened();
  }, []);

  const close = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setOpen(false);
    window.setTimeout(() => router.back(), CLOSE_MS);
  }, [router]);

  return (
    <DayModalContext value={{ origin, close }}>
      <Modal open={open} onClose={close} title={title} size="page">
        {children}
      </Modal>
    </DayModalContext>
  );
}
