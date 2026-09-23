'use client';

import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** 이보다 짧으면 접지 않는다. 두세 줄짜리를 접어 봐야 누를 것만 하나 는다. */
const LONG = 220;

/** 펴고 접는 데 걸리는 시간. 아래 duration-300 과 같아야 한다. */
const MS = 300;

/**
 * 커밋 본문 — 길면 접어 둔다.
 *
 * 본문은 '왜 이렇게 했는지'가 적히는 자리라 같이 하는 사람에게 가장 쓸모 있는
 * 글이다. 그래서 지우지 않고 접는다. 다만 하루에 커밋이 스무 개인 날이 있는데,
 * 본문이 다 펼쳐져 있으면 그날 무엇을 했는지 훑는 것조차 스크롤 한참이다.
 *
 * 높이는 React 가 건드리지 않는다. 접힌 높이는 CSS 클래스가 정하고, 펼 때만
 * 잰 값을 직접 써넣는다. 두 곳에서 같은 값을 정하면 서로 덮어써서, 접어도
 * 그대로 멈춰 있는 일이 생긴다.
 *
 * 'none' 에서 곧장 접으면 움직이지 않는다 — 'none' 은 숫자가 아니라 중간값을
 * 만들 수 없다. 그래서 접기 전에 지금 높이를 숫자로 박고, getBoundingClientRect
 * 로 브라우저에게 '지금 계산해'라고 시킨 뒤에 클래스 값으로 되돌린다. 그래야
 * 어디서부터 움직일지가 정해진다.
 *
 * 여기서 requestAnimationFrame 을 쓰지 않는 이유: 탭이 뒤에 가 있으면 그 함수가
 * 아예 불리지 않는다. 그러면 접기가 조용히 실패해서, 돌아왔을 때 버튼은
 * '더 보기'인데 글은 펼쳐져 있는 꼴이 된다.
 */
export function CommitBody({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (text.length <= LONG) {
    return (
      <p className="mt-1.5 ml-6 text-xs leading-relaxed break-keep whitespace-pre-wrap text-muted">
        {text}
      </p>
    );
  }

  const toggle = () => {
    const box = boxRef.current;
    if (!box) return;

    /* 다 펴지기 전에 또 누른 경우, 예약해 둔 '풀기'를 취소한다 */
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    box.style.maxHeight = `${box.scrollHeight}px`;

    if (open) {
      /* 방금 써넣은 숫자를 브라우저가 지금 계산하게 한다 */
      box.getBoundingClientRect();
      /* 인라인을 지우면 클래스의 접힌 높이로 돌아가며 움직인다 */
      box.style.maxHeight = '';
      setOpen(false);
    } else {
      /*
       * 다 편 뒤에는 풀어 둔다. 잰 높이를 그대로 두면 창을 좁혀 글이 다시
       * 흘렀을 때 끝줄이 잘린다.
       */
      timer.current = setTimeout(() => {
        if (boxRef.current) boxRef.current.style.maxHeight = 'none';
      }, MS);
      setOpen(true);
    }
  };

  return (
    <div className="ml-6">
      <div
        ref={boxRef}
        className="relative max-h-22 overflow-hidden transition-[max-height] duration-300 ease-out"
      >
        <p className="mt-1.5 text-xs leading-relaxed break-keep whitespace-pre-wrap text-muted">
          {text}
        </p>

        {/*
          접힌 끝을 흐리게 덮는다. 글이 칼로 자른 듯 끊기면 '여기서 끝'인지
          '더 있는데 가려진 것'인지 구분이 안 된다.
        */}
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface-2 to-transparent transition-opacity duration-200 ${
            open ? 'opacity-0' : 'opacity-100'
          }`}
        />
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted transition-colors duration-75 hover:text-sky"
      >
        {open ? '접기' : '더 보기'}
        <ChevronDown
          aria-hidden
          className={`h-3 w-3 transition-transform duration-300 ease-out ${open ? 'rotate-180' : ''}`}
        />
      </button>
    </div>
  );
}
