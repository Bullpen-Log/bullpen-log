import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { requireAdmin } from '@/lib/dal';
import { PageHeading } from '@/components/ui';
import { parseImport } from '@/lib/review-evidence/model';
import { evidenceStoreKind } from '@/lib/review-evidence/storage';
import { BackToList, Block, Row, Warn } from '../parts';
import { ImportRunner, type RunnerChunk } from './import-runner';

/**
 * 과거 검수 기록 가져오기(대표관리자만, 내 컴퓨터 개발 서버에서만, EX-REF04).
 * 운영에서는 없는 화면이다. 서버 환경변수 REVIEW_EVIDENCE_IMPORT_FILE 이 가리키는 묶음 파일(절대 경로, 20MB 까지)을 읽고,
 * 묶음마다 서버에서 먼저 모양을 검사한다. 하나라도 틀리면 시작하지 않는다. 경로는 화면에 보이지 않는다.
 * 보내기는 '가져오기 시작'을 누른 뒤에만, 브라우저가 로그인한 그 계정으로 한 묶음씩.
 */

const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** 가져오기 기준의 입력 파일 이름 → 화면 이름(모르는 이름은 '그 밖의 입력 n') */
const INPUT_LABEL: Record<string, string> = {
  'exercise-checkpoint': '운동 검수 진행 기록',
  'exercise-records': '운동 검수 영상별 기록',
  'mechanics-checkpoint': '메커니즘 검수 진행 기록',
  'mechanics-records': '메커니즘 검수 영상별 기록',
  'pmc-identities': 'PMC 번호 대응표',
  'prepared-metadata': '미리 받은 서지정보',
  'seed-catalog': '처음 모은 출처 목록',
};

type Manifest = {
  snapshot: { id: string; inputs: { name: string; sha256: string }[] };
  chunks: unknown[];
  reconciliation: unknown;
};

type ReadOutcome = { ok: true; manifest: Manifest } | { ok: false; message: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

async function readManifest(file: string): Promise<ReadOutcome> {
  if (!isAbsolute(file)) return { ok: false, message: '가져오기 파일 경로는 절대 경로여야 해요.' };
  try {
    const st = await stat(/*turbopackIgnore: true*/ file);
    if (!st.isFile()) return { ok: false, message: '가져오기 파일을 찾지 못했어요.' };
    if (st.size > MAX_FILE_BYTES) return { ok: false, message: '가져오기 파일이 20MB를 넘어요.' };
    const raw: unknown = JSON.parse(await readFile(/*turbopackIgnore: true*/ file, 'utf8'));
    if (!isObj(raw) || raw.kind !== 'review-evidence-import-manifest') return { ok: false, message: '가져오기 묶음 파일 모양이 아니에요.' };
    const snap = raw.snapshot;
    if (!isObj(snap) || typeof snap.id !== 'string' || !Array.isArray(snap.inputs)) return { ok: false, message: '가져오기 기준(snapshot)이 맞지 않아요.' };
    if (!Array.isArray(raw.chunks) || raw.chunks.length === 0) return { ok: false, message: '보낼 묶음이 없어요.' };
    const inputs = snap.inputs
      .filter((x): x is { name: string; sha256: string } => isObj(x) && typeof x.name === 'string' && typeof x.sha256 === 'string')
      .map((x) => ({ name: x.name, sha256: x.sha256 }));
    return { ok: true, manifest: { snapshot: { id: snap.id, inputs }, chunks: raw.chunks, reconciliation: raw.reconciliation } };
  } catch {
    return { ok: false, message: '가져오기 파일을 읽지 못했어요(파일 · JSON 모양을 확인해 주세요).' };
  }
}

/**
 * 맞춰 본 수 — 정해 둔 숫자만 한국어 이름으로 보인다(묶음 파일의 영어 열쇠 · 내부 경로는 화면에 내지 않는다).
 * 칸이 없거나 숫자가 아니면 그 줄은 빼고, 몇 줄을 못 읽었는지는 따로 알린다.
 */
type Count = { label: string; value: number };

function numAt(v: unknown, path: readonly string[]): number | null {
  let cur: unknown = v;
  for (const k of path) {
    if (!isObj(cur)) return null;
    cur = cur[k];
  }
  if (typeof cur === 'number' && Number.isFinite(cur)) return cur;
  if (Array.isArray(cur)) return cur.length;
  return null;
}

const COUNT_ROWS: readonly { label: string; paths: readonly (readonly string[])[] }[] = [
  { label: '출처', paths: [['skeletonSources'], ['build', 'combined', 'logicalSources']] },
  { label: '쓰임', paths: [['skeletonUses'], ['build', 'combined', 'uses']] },
  { label: '운동 쓰임', paths: [['build', 'combined', 'usesByDomain', 'exercise']] },
  { label: '메커니즘 쓰임', paths: [['build', 'combined', 'usesByDomain', 'mechanics']] },
  { label: '공식 서지 확인 출처', paths: [['build', 'combined', 'verifiedSources']] },
  { label: '링크만 있는 출처', paths: [['build', 'combined', 'urlOnlySources']] },
  { label: '보낼 줄', paths: [['records']] },
  { label: '공식 서지 확인 줄', paths: [['recordsVerified']] },
  { label: '확인일 있는 쓰임', paths: [['recordsWithConsultedOn'], ['build', 'combined', 'usesWithConsultedOn']] },
  { label: '적용 내용 있는 쓰임', paths: [['recordsWithApplicationKo']] },
  { label: '한국어 요약 있는 줄', paths: [['recordsWithSummary']] },
  { label: '보류', paths: [['heldRecords']] },
  { label: '형식 오류', paths: [['invalidRecords']] },
  { label: '출처 충돌', paths: [['build', 'combined', 'sourceConflicts']] },
  { label: '한국어 글 파일 문제', paths: [['koFileIssues']] },
  { label: '길어서 줄인 글', paths: [['clipped']] },
  { label: '묶음 수', paths: [['chunks']] },
];

function inputLabels(inputs: { name: string; sha256: string }[]): { key: string; label: string; sha256: string }[] {
  let other = 0;
  return inputs.map((x, i) => ({ key: `${i}-${x.name}`, label: INPUT_LABEL[x.name] ?? `그 밖의 입력 ${++other}`, sha256: x.sha256 }));
}

function countsOf(rec: unknown): { rows: Count[]; missing: number } {
  const rows: Count[] = [];
  let missing = 0;
  for (const r of COUNT_ROWS) {
    let value: number | null = null;
    for (const p of r.paths) {
      value = numAt(rec, p);
      if (value !== null) break;
    }
    if (value === null) missing += 1;
    else rows.push({ label: r.label, value });
  }
  return { rows, missing };
}

export default async function ImportReviewEvidencePage() {
  await connection();
  await requireAdmin();
  const file = process.env.REVIEW_EVIDENCE_IMPORT_FILE;
  if (process.env.NODE_ENV === 'production' || !file) notFound();

  const storeKind = evidenceStoreKind();
  const read = await readManifest(file);

  return (
    <div className="stack-page">
      <BackToList />
      <PageHeading title="과거 기록 가져오기" description="예전 검수 기록에 남은 출처를 한 묶음씩 보내요. 같은 묶음을 다시 보내도 겹치지 않아요." />
      <p
        className={`rounded-2xl border px-(--block-pad) py-3 text-sm font-semibold ${storeKind === 'central' ? 'border-danger-line bg-danger-bg text-danger' : 'border-warn-line bg-warn-bg text-ink'}`}
      >
        {storeKind === 'central' ? '중앙 저장소에 씁니다' : '내 컴퓨터 시험 폴더에 씁니다'}
      </p>

      {!read.ok ? (
        <Warn>{read.message}</Warn>
      ) : (
        <ManifestView manifest={read.manifest} storeKind={storeKind} />
      )}
    </div>
  );
}

function ManifestView({ manifest, storeKind }: { manifest: Manifest; storeKind: 'central' | 'local-fixture' }) {
  const chunks: RunnerChunk[] = [];
  let invalid = 0;
  manifest.chunks.forEach((c, i) => {
    const p = parseImport(c);
    if (!p.ok || !p.requestKey) {
      invalid += 1;
      return;
    }
    chunks.push({
      position: i,
      requestKey: p.requestKey,
      index: p.value.chunk.index,
      total: p.value.chunk.total,
      records: p.value.records.length,
      body: JSON.stringify(c),
    });
  });
  const counts = countsOf(manifest.reconciliation);
  const inputRows = inputLabels(manifest.snapshot.inputs);

  return (
    <>
      <Block title="가져오기 기준">
        <dl className="grid gap-2 text-sm">
          <Row label="기준 번호">
            <span className="font-mono text-xs break-all">{manifest.snapshot.id}</span>
          </Row>
          {inputRows.map((x) => (
            <Row key={x.key} label={x.label}>
              <span className="font-mono text-xs break-all">{x.sha256.slice(0, 16)}…</span>
            </Row>
          ))}
          <Row label="묶음">
            {manifest.chunks.length}개 · 줄 {chunks.reduce((n, c) => n + c.records, 0).toLocaleString('ko-KR')}개
          </Row>
        </dl>
      </Block>

      {counts.rows.length > 0 ? (
        <Block title="맞춰 본 수" note={counts.missing > 0 ? `묶음 파일에 없는 수 ${counts.missing}개는 빼고 보여요.` : undefined}>
          <dl className="grid gap-2 text-sm">
            {counts.rows.map((c) => (
              <Row key={c.label} label={c.label}>
                {c.value.toLocaleString('ko-KR')}
              </Row>
            ))}
          </dl>
        </Block>
      ) : (
        <Warn>묶음 파일에 맞춰 본 수가 없어요. 묶음 파일을 다시 만든 뒤 확인해 주세요.</Warn>
      )}

      {invalid > 0 ? (
        <Warn>모양이 맞지 않는 묶음이 {invalid}개 있어요. 묶음 파일을 다시 만든 뒤 시작해 주세요.</Warn>
      ) : (
        <ImportRunner chunks={chunks} storeKind={storeKind} />
      )}
    </>
  );
}
