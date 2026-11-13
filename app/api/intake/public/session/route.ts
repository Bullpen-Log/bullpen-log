import { intakePublicApi } from '@/app/api/intake/public/_api';

/* 이름 · PIN 을 정했는지만 — 세션 없이 열린다(R03). 이름 · 초안 · 파일은 주지 않는다 */
export const GET = intakePublicApi.gate;
