import 'server-only';
import { after } from 'next/server';
import { createPublicApi } from '@/lib/intake/public-api';
import { getIntakeStorage } from '@/lib/intake/storage';
import { prisma } from '@/lib/prisma';

/** 공개 접수 라우트가 같이 쓰는 처리기 — 몸통은 lib/intake/public-api.ts */
export const intakePublicApi = createPublicApi({ db: prisma, storage: getIntakeStorage, schedule: (task) => after(task) });
