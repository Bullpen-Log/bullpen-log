/**
 * 외부 영상 접수의 비공개 버킷을 만든다. 기본은 계획만 보여 주고 아무것도 쓰지 않는다.
 *
 *   npm run intake:setup-bucket              지금 상태와 바꿀 내용을 본다(읽기만)
 *   npm run intake:setup-bucket -- --apply   실제로 만들거나 설정을 맞춘다 — 사람이 허가한 뒤에만
 *
 * 환경변수가 없으면 네트워크에 닿지 않고 계획만 찍는다. 버킷을 지우거나 파일을 건드리는 일은 없다.
 * 공개로 되어 있는 같은 이름의 버킷을 찾으면 바꾸지 않고 멈춘다 — 원본이 이미 드러났을 수 있어 사람이 봐야 한다.
 */
import { INTAKE_BUCKET_MAX_BYTES } from '@/lib/intake/limits';
import { INTAKE_BUCKET } from '@/lib/intake/paths';

const apply = process.argv.includes('--apply');
const wanted = {
  id: INTAKE_BUCKET,
  name: INTAKE_BUCKET,
  public: false,
  file_size_limit: INTAKE_BUCKET_MAX_BYTES,
  allowed_mime_types: ['video/*', 'application/octet-stream', 'application/json'],
};

console.log('원하는 버킷:', JSON.stringify(wanted));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log('SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 없어 저장소를 보지 않았어요.');
  if (apply) process.exit(1);
  process.exit(0);
}

const headers = { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' };
const api = `${url}/storage/v1/bucket`;

const res = await fetch(`${api}/${INTAKE_BUCKET}`, { headers });
const body = res.ok ? await res.json() : null;
if (!res.ok && res.status !== 400 && res.status !== 404) {
  console.error(`버킷을 읽지 못했어요(${res.status}).`);
  process.exit(1);
}

if (body?.public === true) {
  console.error('같은 이름의 버킷이 공개로 되어 있어요. 멈춥니다 — 사람이 먼저 확인해 주세요.');
  process.exit(1);
}

const same =
  body &&
  body.file_size_limit === wanted.file_size_limit &&
  JSON.stringify([...(body.allowed_mime_types ?? [])].sort()) === JSON.stringify([...wanted.allowed_mime_types].sort());

if (same) {
  console.log('이미 원하는 설정이에요. 바꿀 것이 없어요.');
  process.exit(0);
}

console.log(body ? `설정을 바꿀 차례예요. 지금: ${JSON.stringify({ limit: body.file_size_limit, mime: body.allowed_mime_types })}` : '버킷이 없어 새로 만들 차례예요.');
if (!apply) {
  console.log('--apply 없이 돌려서 아무것도 쓰지 않았어요.');
  process.exit(0);
}

const write = await fetch(body ? `${api}/${INTAKE_BUCKET}` : api, {
  method: body ? 'PUT' : 'POST',
  headers,
  body: JSON.stringify(wanted),
});
if (!write.ok) {
  console.error(`버킷을 쓰지 못했어요(${write.status}): ${await write.text()}`);
  console.error('파일 한도가 프로젝트 전체 한도보다 크면 거절돼요. 대시보드 Storage Settings 의 Global file size limit 를 먼저 올려 주세요.');
  process.exit(1);
}
console.log('버킷을 맞췄어요.');
