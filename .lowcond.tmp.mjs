import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { toDateKey } from './lib/pitch-stats.ts';
const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const u = await p.user.findFirst({
  where: { email: 'als216c@gmail.com' },
  select: { id: true },
});
const date = new Date(`${toDateKey(new Date())}T00:00:00.000Z`);
await p.dailyCheckin.upsert({
  where: { userId_date: { userId: u.id, date } },
  update: { condition: 3 },
  create: {
    userId: u.id,
    date,
    shoulder: '정상',
    elbow: '정상',
    wrist: '정상',
    lowerBack: '정상',
    lowerBody: '정상',
    condition: 3,
    sleep: '부족',
    preferredParts: [],
  },
});
console.log('컨디션 3 체크인 저장');
await p.$disconnect();
