/**
 * 검토용 임시 계정 만들기 / 지우기.
 *
 *   node --env-file=.env scripts/review-seed.mjs make    → 만들고 토큰을 찍는다
 *   node --env-file=.env scripts/review-seed.mjs drop    → 지운다
 *
 * 화면 검토를 실제 사용자 계정으로 하면 기록을 건드리게 된다. 8주치 기록이
 * 들어찬 가짜 계정을 따로 만들어, 데이터가 있는 상태의 화면을 본다.
 * 검토가 끝나면 drop 으로 통째로 지운다(관계는 전부 Cascade).
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const EMAIL = 'review-temp@example.invalid';
const TEST_PASSWORD = 'review-1234';
const mode = process.argv[2] ?? 'make';

function dayKey(offset) {
  const d = new Date(Date.now() + offset * 86400000);
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return f.format(d);
}
const at = (key) => new Date(`${key}T00:00:00.000Z`);

if (mode === 'drop') {
  const u = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true },
  });
  if (!u) {
    console.log('임시 계정이 없습니다.');
  } else {
    await prisma.user.delete({ where: { id: u.id } });
    console.log('임시 계정을 지웠습니다.');
  }
  await prisma.$disconnect();
  process.exit(0);
}

// 이미 있으면 지우고 새로 만든다 — 돌릴 때마다 같은 상태가 되게.
const old = await prisma.user.findUnique({
  where: { email: EMAIL },
  select: { id: true },
});
if (old) await prisma.user.delete({ where: { id: old.id } });

const user = await prisma.user.create({
  data: {
    email: EMAIL,
    /*
     * 실제 해시를 넣는다. 비밀번호 변경·탈퇴를 눌러보려면 지금 비밀번호를
     * 확인받아야 하는데, 아무 문자열이나 넣어 두면 그 자리를 시험할 수가 없다.
     */
    password: await bcrypt.hash(TEST_PASSWORD, 10),
    nickname: '검토용',
    role: 'USER',
    birthDate: new Date('2008-04-11T00:00:00.000Z'), // 만 18세 고3
    heightCm: 182,
    targetVelocity: 145,
    throwingHand: '우투',
    competitionLevel: '고등학교',
    baselineFreq: '주 3~4회',
    baselineVolume: '50~80구',
    baselineIntensity: '보통 (6~7)',
    baselineWorkoutFreq: '주 3~4회',
    dailyWorkoutMinutes: 45,
    trainingLevel: '중급',
    trainingGoal: '균형 잡힌 관리',
    ownedEquipment: ['맨몸', '덤벨', '밴드', '메디신볼', '폼롤러'],
  },
});

/* ── 8주치 투구 기록 ────────────────────────────────────────── */
const logs = [];

/*
 * 아주 오래된 기록 한 줌.
 *
 * 일지 화면은 최근 열세 달만 미리 읽고, 그보다 옛날 달로 넘기면 그때 받아 온다.
 * 그 자리를 시험하려면 열세 달 밖에 뭔가 있어야 한다.
 */
for (const back of [400, 401, 430]) {
  const key = dayKey(-back);
  logs.push({
    date: at(key),
    sessionType: '불펜',
    pitchCount: 35,
    intensity: 6,
    maxVelocity: 128,
    avgVelocity: 121,
    memo: '아주 예전 기록',
  });
}
for (let i = 55; i >= 0; i--) {
  const key = dayKey(-i);
  const w = new Date(`${key}T00:00:00Z`).getUTCDay();
  // 화·금 불펜, 수·토 캐치볼, 일 경기, 나머지 휴식
  if (w === 2 || w === 5) {
    logs.push({
      date: at(key),
      sessionType: '불펜',
      pitchCount: 40 + (i % 3) * 5,
      intensity: 7,
      maxVelocity: Math.round((132 + ((55 - i) / 55) * 6 + (i % 3)) * 10) / 10,
      avgVelocity: Math.round((124 + ((55 - i) / 55) * 5) * 10) / 10,
      memo: i === 5 ? '5회부터 팔이 무거워짐' : null,
    });
  } else if (w === 3 || w === 6) {
    logs.push({
      date: at(key),
      sessionType: '캐치볼',
      pitchCount: 40,
      intensity: 3,
      memo: null,
    });
  } else if (w === 0) {
    logs.push({
      date: at(key),
      sessionType: '경기',
      pitchCount: 60 + (i % 4) * 10,
      intensity: 9,
      maxVelocity: Math.round((134 + ((55 - i) / 55) * 6) * 10) / 10,
      avgVelocity: Math.round((126 + ((55 - i) / 55) * 5) * 10) / 10,
      memo: null,
    });
  } else {
    logs.push({
      date: at(key),
      sessionType: '휴식',
      pitchCount: 0,
      intensity: 0,
      memo: null,
    });
  }
}
await prisma.pitchLog.createMany({
  data: logs.map((l) => ({ ...l, userId: user.id, videoPaths: [] })),
});

/* ── 최근 열흘 체크인 ───────────────────────────────────────── */
const checkins = [];
for (let i = 9; i >= 0; i--) {
  const key = dayKey(-i);
  checkins.push({
    userId: user.id,
    date: at(key),
    shoulder: i === 3 ? '뻐근' : '정상',
    elbow: '정상',
    wrist: '정상',
    lowerBack: i === 6 ? '뻐근' : '정상',
    lowerBody: '정상',
    condition: 5 + ((i * 7) % 5),
    sleep: i % 4 === 0 ? '부족' : '충분',
    preferredParts: [],
    preferredWorkout: null,
  });
}
await prisma.dailyCheckin.createMany({ data: checkins });

/* ── 최근 운동 기록 ─────────────────────────────────────────── */
const exercises = await prisma.exerciseVideo.findMany({
  where: { detailsFilledAt: { not: null } },
  select: { id: true, sets: true },
  take: 40,
});
const exLogs = [];
const notes = [];
for (let i = 20; i >= 0; i--) {
  const key = dayKey(-i);
  const w = new Date(`${key}T00:00:00Z`).getUTCDay();
  if (w === 0 || w === 4) continue; // 경기날·하루는 쉼
  const picked = exercises.slice((i * 3) % 20, ((i * 3) % 20) + 6);
  for (const ex of picked) {
    exLogs.push({
      userId: user.id,
      exerciseId: ex.id,
      date: at(key),
      completed: true,
      setsDone: ex.sets ?? 3,
      repsDone: 10,
    });
  }
  notes.push({ userId: user.id, date: at(key), intensity: 5 + (i % 3), memo: null });
}
await prisma.userExerciseLog.createMany({ data: exLogs, skipDuplicates: true });
await prisma.dailyTrainingNote.createMany({ data: notes, skipDuplicates: true });

const token = await new SignJWT({ userId: user.id, role: 'USER' })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('7d')
  .sign(new TextEncoder().encode(process.env.SESSION_SECRET));

console.error(`  로그인 비밀번호: ${TEST_PASSWORD}`);
console.error(
  `임시 계정 ${EMAIL} — 투구 ${logs.length}건 · 체크인 ${checkins.length}건 · 운동 ${exLogs.length}건 · 강도메모 ${notes.length}건`
);
console.log(token);
await prisma.$disconnect();
