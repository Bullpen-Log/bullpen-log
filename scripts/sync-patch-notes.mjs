/**
 * 깃 기록을 읽어 패치노트를 맞춘다.
 *
 * 패치노트는 손으로 적는 것이 아니다. 적는 자리를 만들어 두면 언젠가 반드시
 * 잊어버리고, 그때부터는 '비어 있는 날'이 작업을 안 한 날인지 적기를 잊은
 * 날인지 알 수 없게 된다. 그래서 이미 확실하게 남는 것 — 커밋 — 에서 가져온다.
 *
 * 한 장 = 한 사람의 하루. 커밋 하나에 한 장씩이면 하루에 열 장씩 쌓여 무엇이
 * 큰 일이었는지 안 보이고, 날짜로만 묶으면 둘이 같은 날 작업했을 때 누구 것인지
 * 섞인다.
 *
 * 여러 번 돌려도 같은 결과다(멱등). 같은 (사람, 날짜) 를 찾아 덮어쓴다. 사람이
 * 적어 둔 메모만은 건드리지 않는다 — 그것만이 깃에 없는 것이라서다.
 *
 *   npm run patch:sync           최근 90일
 *   npm run patch:sync -- --all  처음부터 전부
 */

import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

/* 깃 기록을 자를 때 쓰는 보이지 않는 글자. 커밋 메시지에 나올 리 없는 것으로 고른다. */
const REC = '\x1e';
const FLD = '\x1f';

/**
 * 경로를 사람 말로 옮긴다.
 *
 * 'app/(app)/today/summary-panel.tsx' 를 그대로 보여 주면 같이 하는 사람이
 * 무엇을 고쳤는지 알려면 폴더 구조를 외워야 한다. '홈 화면'이라고 적으면
 * 제목만 보고 열어볼지 넘길지 정할 수 있다.
 *
 * 위에서부터 먼저 맞는 것을 쓴다 — 좁은 것이 먼저다.
 */
const AREAS = [
  ['app/(app)/today', '홈 화면'],
  ['app/(app)/pitch-log', '투구 일지'],
  ['app/(app)/library', '운동 라이브러리'],
  ['app/(app)/admin', '관리자'],
  ['app/(app)/coach', '리포트'],
  ['app/(app)/videos', '영상'],
  ['app/(app)/board', '자료실'],
  ['app/(app)/training', '트레이닝'],
  ['app/(app)/profile', '내 정보'],
  ['app/(app)/more', '메뉴'],
  ['app/(app)/dashboard', '대시보드'],
  ['app/(session)', '운동 세션'],
  ['app/(legal)', '약관·정책'],
  ['app/login', '로그인'],
  ['app/actions', '서버 동작'],
  ['app/api', 'API'],
  ['app/globals.css', '디자인·테마'],
  ['lib/ai', 'AI 처방'],
  ['lib/report', '리포트 계산'],
  ['lib', '공용 로직'],
  ['components', '공용 화면'],
  ['prisma', '데이터베이스'],
  ['scripts', '도구'],
  ['docs', '문서'],
  ['public', '정적 파일'],
  ['types', '타입'],
];

/** 경로 하나가 어느 자리인지. 못 찾으면 null — 설정 파일 같은 것들이다. */
function areaOf(path) {
  for (const [prefix, label] of AREAS) {
    if (path === prefix || path.startsWith(prefix + '/')) return label;
  }
  if (/^(package|tsconfig|next\.config|eslint|postcss|vercel|prisma\.config)/.test(path)) {
    return '설정';
  }
  if (/\.(md|mdx)$/.test(path)) return '문서';
  return null;
}

/** 깃에서 커밋을 읽어 온다. 합침(merge)은 뺀다 — 제 내용이 없다. */
function readCommits(all) {
  const args = [
    'log',
    '--no-merges',
    '--numstat',
    '--date=short',
    `--pretty=format:${REC}%H${FLD}%an${FLD}%ae${FLD}%ad${FLD}%s${FLD}%b${FLD}`,
  ];
  if (!all) args.push('--since=90 days ago');

  const raw = execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  return raw
    .split(REC)
    .filter((chunk) => chunk.trim())
    .map((chunk) => {
      const [sha, name, email, day, subject, body, stats = ''] = chunk.split(FLD);

      /* numstat 은 '더한 줄\t지운 줄\t경로'. 그림·영상은 숫자 자리에 '-' 가 온다. */
      const files = [];
      let insertions = 0;
      let deletions = 0;
      for (const line of stats.split('\n')) {
        const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
        if (!m) continue;
        insertions += m[1] === '-' ? 0 : Number(m[1]);
        deletions += m[2] === '-' ? 0 : Number(m[2]);
        files.push(m[3]);
      }

      return {
        sha,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        day,
        subject,
        body: body.trim(),
        files,
        insertions,
        deletions,
      };
    });
}

async function main() {
  const all = process.argv.includes('--all');
  const commits = readCommits(all);
  console.log(`깃에서 커밋 ${commits.length}개를 읽었습니다${all ? ' (전부)' : ' (최근 90일)'}.`);

  /*
   * 사람 하나에 이름 하나로 맞춘다.
   *
   * 깃 이름(user.name)은 언제든 바꿀 수 있어서, 한 사람이 도중에 바꾸면
   * 예전 날에는 옛 이름이, 요즘 날에는 새 이름이 찍힌다. 그러면 목록의
   * '사람' 칸에 같은 사람이 둘로 뜬다 — 묶는 열쇠는 메일 주소라 기록 자체는
   * 제대로 묶였는데, 보이는 이름만 갈라진 것이다.
   *
   * 지금 쓰는 이름으로 통일한다. 깃은 최신순으로 주므로 처음 만난 것이 곧
   * 가장 최근 이름이다.
   */
  const nameOf = new Map();
  for (const c of commits) {
    if (!nameOf.has(c.email)) nameOf.set(c.email, c.name);
  }

  /* (사람, 날짜) 로 묶는다 */
  const groups = new Map();
  for (const c of commits) {
    const key = `${c.email}\u0000${c.day}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        authorKey: c.email,
        authorName: nameOf.get(c.email),
        day: c.day,
        commits: [],
        files: new Set(),
        areas: new Set(),
        insertions: 0,
        deletions: 0,
      };
      groups.set(key, g);
    }

    g.commits.push({
      sha: c.sha.slice(0, 8),
      subject: c.subject,
      body: c.body,
      files: c.files.length,
      insertions: c.insertions,
      deletions: c.deletions,
    });
    for (const f of c.files) {
      g.files.add(f);
      const a = areaOf(f);
      if (a) g.areas.add(a);
    }
    g.insertions += c.insertions;
    g.deletions += c.deletions;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  let made = 0;
  let kept = 0;
  try {
    for (const g of groups.values()) {
      /*
       * 커밋은 오래된 것이 먼저 오게 뒤집는다. 깃은 최신순으로 주는데,
       * 하루 안에서는 한 일을 순서대로 읽는 편이 자연스럽다.
       */
      const data = {
        authorName: g.authorName,
        commits: g.commits.slice().reverse(),
        commitCount: g.commits.length,
        filesChanged: g.files.size,
        insertions: g.insertions,
        deletions: g.deletions,
        areas: [...g.areas].sort(),
        syncedAt: new Date(),
      };

      const before = await prisma.patchNote.findUnique({
        where: { authorKey_day: { authorKey: g.authorKey, day: g.day } },
        select: { id: true },
      });

      /* note·editedAt·editedBy 는 건드리지 않는다. 깃에 없는 것은 사람 것이다. */
      await prisma.patchNote.upsert({
        where: { authorKey_day: { authorKey: g.authorKey, day: g.day } },
        create: { authorKey: g.authorKey, day: g.day, ...data },
        update: data,
      });

      if (before) kept += 1;
      else made += 1;
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`패치노트 ${groups.size}장 — 새로 ${made}장, 다시 맞춘 것 ${kept}장.`);
}

main().catch((e) => {
  console.error('패치노트를 맞추지 못했습니다:', e);
  process.exit(1);
});
