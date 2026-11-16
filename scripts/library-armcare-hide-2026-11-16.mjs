/**
 * 2026-11-16 암케어 어깨 후방 · 전방에서 자세만 다른 변형 8개를 숨긴다(지우지 않음 — hiddenAt 만).
 * 같은 동작이 장비마다 하나씩 남고(튜빙 · 하프닐링 · 케이블 · 덤벨 · 맨몸), 재활 표가 부르는 이름은 안 건드린다.
 * 숨기기 전 확인: 8개 모두 기록 · 즐겨찾기 · 내 루틴 · 저장된 일정 참조 0건, 장비별 자리 후보 0 되는 곳 없음.
 * 백업 db-2026-11-16-07-05. 같은 커밋이 lib/library-cache.ts 캐시 이름을 올린다.
 *
 *   node --env-file=.env scripts/library-armcare-hide-2026-11-16.mjs            # 확인만
 *   node --env-file=.env scripts/library-armcare-hide-2026-11-16.mjs --apply    # 숨기기
 *   node --env-file=.env scripts/library-armcare-hide-2026-11-16.mjs --restore  # 되돌리기(8개 모두 다시 보이게)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const TITLES = [
  '스플릿 스탠스 튜빙 외회전 0도',
  '스플릿 스탠스 튜빙 외회전 90도',
  '스플릿 스탠스 싱글암 리버스 플라이',
  '스플릿 스탠스 튜빙 내회전 0도',
  '스플릿 스탠스 튜빙 내회전 90도',
  '사이드라잉 덤벨 내회전 아이소메트릭 홀드',
  '프론트 레이즈 리바운드',
  '밴드 프론트 레이즈',
];
const apply = process.argv.includes('--apply');
const restore = process.argv.includes('--restore');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const rows = await prisma.exerciseVideo.findMany({
  where: { category: '암케어', title: { in: TITLES } },
  select: { id: true, title: true, hiddenAt: true },
});
if (rows.length !== TITLES.length) {
  console.log('멈춤 — 운동 수가 안 맞음:', rows.length, '/', TITLES.length, rows.map((r) => r.title));
  process.exit(1);
}
for (const r of rows) console.log(`${r.title} · ${r.hiddenAt ? '숨김' : '보임'}`);
if (apply || restore) {
  const res = await prisma.exerciseVideo.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, hiddenAt: restore ? { not: null } : null },
    data: { hiddenAt: restore ? null : new Date() },
  });
  console.log(restore ? '다시 보이게' : '숨김', res.count, '개');
} else console.log('--apply 로 숨긴다.');
await prisma.$disconnect();
