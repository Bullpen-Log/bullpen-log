import { ButtonLink } from '@/components/ui';
import { SETUP_PATH, type FeatureKey } from '@/lib/feature-locks';

const LABEL: Record<FeatureKey, string> = {
  pitch: '투구 기록',
  training: '트레이닝',
  nutrition: '영양',
};

/**
 * 잠긴 탭의 판(components/tab-pager.tsx) — 첫 설정 전에는 그 탭 화면 대신 이것이 판에 선다. 탭 화면(…-page.tsx)은 잠겨 있으면
 * redirect 로 설정 화면에 보내는데, 판 자리의 default.tsx 가 그걸 부르면 어느 화면을 열든 설정으로 튕겨 버린다 — 그래서 판에서는
 * 보내지 않고 단추만 둔다. 하단 탭 · 메뉴의 잠긴 항목은 lib/nav.ts applyLocks 가 설정 주소로 바꿔 둔다.
 */
export function TabLocked({ feature }: { feature: FeatureKey }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-lg font-semibold text-ink">
        {LABEL[feature]}은 첫 설정을 마치면 열려요
      </p>
      <p className="text-sm text-muted">몇 가지만 답하면 바로 시작해요.</p>
      <ButtonLink href={SETUP_PATH[feature]}>첫 설정 하기</ButtonLink>
    </div>
  );
}
