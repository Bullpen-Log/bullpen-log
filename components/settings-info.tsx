'use client';

import { ChevronRight } from 'lucide-react';
import { Modal, useModalState } from '@/components/modal';
import { LegalSheet, type LegalDoc } from '@/components/legal-sheet';
import { CONTACT } from '@/components/site-footer';

type Sheet = LegalDoc | 'credit';

const ROW =
  'flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left text-sm text-ink transition-colors active:bg-ink/6';

/**
 * 설정 › 정보의 줄 — 약관 · 개인정보 · 3D 모델 출처는 그 자리에서 창으로, 문의는 메일 앱으로(2026-10-04 '앱 안에 머물기').
 *
 * 예전 약관 줄은 약관 화면으로 넘어가 웹 문서 머리(로고 · 바닥글)가 떴고, 3D 출처는 지도 밑에 밑줄 링크로 붙어 있어
 * 누르면 앱 밖(사파리)으로 나갔다. 아이폰 앱의 '설정 › 정보 › 법적 고지'처럼 여기 모은다.
 */
export function SettingsInfoRows() {
  const sheet = useModalState<Sheet>();
  const legal = sheet.content === 'credit' ? null : sheet.content;

  return (
    <>
      <div className="divide-y divide-line overflow-hidden rounded-xl bg-surface-2">
        <button type="button" className={ROW} onClick={(e) => sheet.show('terms', e)}>
          이용약관
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted/70" />
        </button>
        <button type="button" className={ROW} onClick={(e) => sheet.show('privacy', e)}>
          개인정보 처리방침
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted/70" />
        </button>
        <button type="button" className={ROW} onClick={(e) => sheet.show('credit', e)}>
          3D 모델 출처
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted/70" />
        </button>
        <a href={`mailto:${CONTACT}`} className={ROW}>
          문의하기
          <span className="flex min-w-0 items-center gap-1 text-muted">
            <span className="truncate text-xs">{CONTACT}</span>
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted/70" />
          </span>
        </a>
      </div>

      <LegalSheet
        doc={legal}
        open={sheet.open && sheet.content !== 'credit'}
        origin={sheet.origin}
        onClose={sheet.close}
        onSwitch={sheet.setContent}
      />
      <Modal
        open={sheet.open && sheet.content === 'credit'}
        onClose={sheet.close}
        title="3D 모델 출처"
        origin={sheet.origin}
      >
        <ModelCreditBody />
      </Modal>
    </>
  );
}

/*
 * 출처 글 — public/models/ATTRIBUTION.txt 와 같은 내용. 따옴표 안 문구는 원저작자가 정한 그대로 둔다(번역하지 않는다).
 */
const CREDITS: { quote: string; note: string }[] = [
  {
    quote: 'Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0',
    note: 'github.com/Z-Anatomy/Models-of-human-anatomy',
  },
  {
    quote: 'BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan',
    note: 'creativecommons.org/licenses/by-sa/2.1/jp',
  },
  {
    quote:
      'BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution 4.0 International',
    note: 'dbarchive.biosciencedbc.jp/en/bodyparts3d',
  },
  {
    quote: 'Fit Mit With anatomy atlas (CC BY-SA 4.0)',
    note: 'github.com/slfresh/fitmitwith-anatomy-atlas',
  },
];

function ModelCreditBody() {
  return (
    <div className="space-y-5 text-sm leading-relaxed break-keep text-ink">
      <p className="text-muted">
        암케어 · 부위별 보강의 3D 근육 지도는 아래 자료를 고쳐 만들었어요. 이 모델 파일은 크리에이티브 커먼즈
        저작자표시-동일조건변경허락 4.0(CC BY-SA 4.0)으로 쓰고, 불펜로그의 나머지는 따로예요.
      </p>
      <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface-2">
        {CREDITS.map((c) => (
          <li key={c.quote} className="px-4 py-3">
            <p className="selectable text-sm text-ink">“{c.quote}”</p>
            <p className="selectable mt-0.5 text-xs break-all text-muted">{c.note}</p>
          </li>
        ))}
      </ul>
      <div className="space-y-1.5">
        <p className="font-semibold">바꾼 것</p>
        <p className="text-muted">
          팔 관리 지도는 상체 근육 · 뼈 · 머리와 손만 남기고 다리와 결합 조직을 뺐어요. 전신 지도는 결합 조직만
          뺐어요. 둘 다 파일을 가볍게 줄였고 근육 이름은 그대로예요. 해부학 전문가의 검토는 받지 않았어요.
        </p>
      </div>
      <a
        href="https://creativecommons.org/licenses/by-sa/4.0/deed.ko"
        target="_blank"
        rel="noreferrer"
        className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 text-sm text-sky transition-colors active:bg-ink/6"
      >
        CC BY-SA 4.0 라이선스 전문
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted/70" />
      </a>
    </div>
  );
}
