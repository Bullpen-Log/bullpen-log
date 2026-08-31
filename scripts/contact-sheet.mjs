/**
 * 썸네일을 여러 장 모아 한 장으로 붙인다.
 *
 *   node scripts/contact-sheet.mjs scripts/lists/_shortlist.json .sheets
 *
 * 등록하기 전에 "제목이 말하는 그 운동이 맞는가"를 눈으로 봐야 한다. 그런데
 * 쉰 장을 한 장씩 열어보면 오래 걸리므로, 열두 장씩 격자로 붙여 한 번에 본다.
 *
 * 번호를 크게 박아 둔다. 보고 나서 "3번은 다른 운동"처럼 가리키려면 그림과
 * 목록이 같은 번호를 써야 한다.
 */
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const [listPath, outDir = '.sheets'] = process.argv.slice(2);
if (!listPath) {
  console.error('사용법: node scripts/contact-sheet.mjs <목록.json> [저장폴더]');
  process.exit(1);
}
const rows = JSON.parse(readFileSync(listPath, 'utf8'));
mkdirSync(outDir, { recursive: true });

/** 한 칸 크기와 한 장에 넣을 개수 */
const CELL_W = 480;
const CELL_H = 360;
const COLS = 3;
const ROWS = 4;
const PER_SHEET = COLS * ROWS;
const LABEL_H = 34;

async function thumb(videoId) {
  /*
   * hqdefault 는 어떤 영상이든 있다. maxresdefault 는 없는 영상이 있어서
   * 실패하면 화면이 비는데, 그러면 무엇을 못 봤는지 알 수가 없다.
   */
  const res = await fetch(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

function labelSvg(text) {
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Buffer.from(
    `<svg width="${CELL_W}" height="${LABEL_H}">
       <rect width="100%" height="100%" fill="#0b1220"/>
       <text x="10" y="24" font-family="sans-serif" font-size="19" font-weight="700" fill="#7dd3fc">${safe}</text>
     </svg>`
  );
}

const sheets = Math.ceil(rows.length / PER_SHEET);
console.log(`${rows.length}개 → ${sheets}장`);

for (let s = 0; s < sheets; s++) {
  const slice = rows.slice(s * PER_SHEET, (s + 1) * PER_SHEET);
  const composites = [];

  for (let i = 0; i < slice.length; i++) {
    const r = slice[i];
    const buf = await thumb(r.videoId);
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col * CELL_W;
    const y = row * (CELL_H + LABEL_H);

    if (buf) {
      const img = await sharp(buf).resize(CELL_W, CELL_H, { fit: 'contain', background: '#000' }).toBuffer();
      composites.push({ input: img, top: y, left: x });
    }
    composites.push({
      input: labelSvg(`${r.n ?? s * PER_SHEET + i + 1}. ${r.title}`),
      top: y + CELL_H,
      left: x,
    });
  }

  const W = COLS * CELL_W;
  const H = ROWS * (CELL_H + LABEL_H);
  const out = `${outDir}/sheet-${String(s + 1).padStart(2, '0')}.png`;
  await sharp({
    create: { width: W, height: H, channels: 3, background: '#0b1220' },
  })
    .composite(composites)
    .png()
    .toFile(out);
  console.log(`  ${out}  (${slice.length}칸)`);
}
