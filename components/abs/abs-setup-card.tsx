'use client';

import { useState } from 'react';
import { Segmented } from '@/components/segmented';
import { CHIP_BASE, CHIP_ON, SectionLabel } from '@/components/velocity/kit';
import { ABS_DISCLOSURE, AVERAGE_HEIGHT_CM, HEIGHT_MAX_CM, HEIGHT_MIN_CM, RULES, type RuleSetId } from '@/lib/abs/rules';
import type { AbsSession } from './use-abs-session';

/**
 * ABS 설정 단계의 안내 카드 속 내용 — 타자 신장(평균 · 직접) · 규칙 · 플레이트 찾기 상태. 카드 틀 · 단추 줄은 측정 화면의 GuideCard.
 * 플레이트 선 · 존 상자는 뷰파인더 위 PlateOverlay 가 그린다.
 */
export function AbsSetupCard({ abs, tiltKnown }: { abs: AbsSession; tiltKnown: boolean }) {
  const h = abs.setup.height;
  const [text, setText] = useState(h === 'average' ? '' : String(h));
  const parsed = Number(text);
  const valid = Number.isFinite(parsed) && parsed >= HEIGHT_MIN_CM && parsed <= HEIGHT_MAX_CM;
  const cal = abs.calib;
  const status = !abs.ends
    ? { tone: 'warn' as const, text: abs.find?.reason ?? '플레이트를 찾는 중이에요. 흰 홈플레이트가 존 밑에 보여야 해요.' }
    : !tiltKnown
      ? { tone: 'warn' as const, text: '폰 기울기를 아직 못 읽었어요. 수평계가 켜지면 바로 돼요.' }
      : cal && !cal.ok
        ? { tone: 'warn' as const, text: cal.reasons[0] ?? '보정이 어긋나요.' }
        : cal
          ? {
              tone: 'ok' as const,
              text: `플레이트 ${cal.plateDepthM.toFixed(1)}m 앞 · 카메라 높이 ${cal.cameraHeightM.toFixed(1)}m${abs.manual ? ' · 직접 맞춤' : ''}`,
            }
          : { tone: 'warn' as const, text: '보정 중이에요.' };
  return (
    <div className="space-y-4">
      <div>
        <SectionLabel>타자 신장</SectionLabel>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={h === 'average'}
            onClick={() => abs.setHeight('average')}
            className={`${CHIP_BASE} ${h === 'average' ? CHIP_ON : ''}`}
          >
            평균 신장 {AVERAGE_HEIGHT_CM}cm
          </button>
          <label className={`${CHIP_BASE} gap-1.5 ${h !== 'average' ? CHIP_ON : ''}`}>
            <input
              inputMode="numeric"
              value={text}
              placeholder="직접"
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, '').slice(0, 3);
                setText(v);
                const n = Number(v);
                if (Number.isFinite(n) && n >= HEIGHT_MIN_CM && n <= HEIGHT_MAX_CM) abs.setHeight(n);
              }}
              className="w-12 bg-transparent text-center tabular-nums outline-none"
              aria-label="타자 신장(cm)"
            />
            cm
          </label>
        </div>
        {text && !valid && <p className="mt-1.5 text-xs text-warn">{HEIGHT_MIN_CM}~{HEIGHT_MAX_CM}cm 사이로 넣어요.</p>}
        <p className="mt-1.5 text-footnote text-muted">평균을 고르면 다음 타자에게도 그대로 써요. 측정 중 ‘다음 타자’에서 바꿀 수 있어요.</p>
      </div>
      <div>
        <SectionLabel>규칙</SectionLabel>
        <div className="mt-2">
          <Segmented<RuleSetId>
            label="판정 규칙"
            value={abs.setup.rule}
            onChange={abs.setRule}
            options={(Object.keys(RULES) as RuleSetId[]).map((k) => ({ value: k, label: RULES[k].label }))}
          />
        </div>
      </div>
      <div>
        <SectionLabel>홈플레이트</SectionLabel>
        <p className={`mt-2 flex items-start gap-2 text-sm leading-snug ${status.tone === 'ok' ? 'text-ink' : 'text-warn'}`}>
          <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${status.tone === 'ok' ? 'bg-ok' : 'bg-warn'}`} />
          {status.text}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => {
              abs.setManual(false);
              abs.detectNow();
            }}
            className={`${CHIP_BASE} ${!abs.manual ? CHIP_ON : ''}`}
          >
            다시 찾기
          </button>
          <button
            type="button"
            onClick={() => abs.setManual(true)}
            aria-pressed={abs.manual}
            className={`${CHIP_BASE} ${abs.manual ? CHIP_ON : ''}`}
          >
            직접 맞추기
          </button>
        </div>
        {abs.manual && <p className="mt-1.5 text-footnote text-muted">화면의 두 점을 끌어 플레이트 앞변 양끝에 맞춰요.</p>}
      </div>
      <p className="text-footnote text-muted">{ABS_DISCLOSURE}</p>
    </div>
  );
}
