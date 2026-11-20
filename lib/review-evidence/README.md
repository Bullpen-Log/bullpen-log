# 검수 근거자료(관리자 전용) — 저장 형식 v1 (EX-REF04)

운동영상(03) · 메커니즘 영상(04) 검수에서 **실제로 쓴 출처**와 그 출처를 **어디에 어떻게 썼는지**를 모은 대표관리자(`role === 'ADMIN'`) 전용 목록이다.

- 참고자료(`lib/admin-references`, EX-REF02)와 다르다. 참고자료는 우리가 가진 자료 묶음(원본 · 옮긴 글)이고, 여기는 검수 판단의 근거 링크와 쓰임만 남긴다.
- 인용은 보증이 아니다. 목록에 있다고 그 출처가 옳다거나 우리 문구 전체를 뒷받침한다는 뜻이 아니다.
- **이 저장소는 공개다.** 원문 · PDF · 영상 · 전문 · 비공개 기록 파일 경로 · 세션 값을 코드 · 시험 · 문서에 넣지 않는다. 시험은 지어낸 값만 쓴다.
- 검수자가 실제로 따르는 운영 절차(쓰는 순간 등록 · 기록에 남길 것 · 세션 시작 retry · 인계 전 audit · 두 대의 맥 · 출시 조건)는 `docs/reviews/review-evidence-registrar.md` 에 있다. 이 문서는 저장 · API · 도구의 약속이다.

## 어디에 · 어떤 모양

| 무엇 | 자리 |
| --- | --- |
| 기록 한 건 | 버킷 `pitch-videos` 의 `review-evidence/v1/ops/<opId>.json` (1 MB 까지) |

- 기록(op)은 **바꾸지 않는다.** '없을 때만 만들기'로 쓰고, 고친 내용은 같은 쓰임의 새 기록으로 쌓인다. 지우기 · 덮어쓰기 길은 없다.
- `opId = sha256(종류 | 보낸 계정 | 요청 번호)`. 같은 요청 번호 · 같은 내용을 다시 보내면 같은 기록으로 끝나고(`replayed`), 다른 내용이면 충돌(409).
- 받음표 규칙(R2, 201 / 200): 쓰기마다 무작위 쓰기 번호(`writeId`, 소문자 16진 32자)를 본문에 넣는다(내용 지문 · 기록 번호에는 안 들어감). 다시 읽은 본문의 쓰기 번호가 이 요청의 것일 때만 새로 저장(201, `replayed: false`, 응답을 잃었거나 늦게 저장된 경우 포함)이다. '없을 때만 만들기'가 이미 있다고 답한 경우, 쓰기 번호가 다른 경우, 번호가 없는 옛 기록은 앞서 저장된 같은 요청(200, `replayed: true`)이다. 받은 시각으로 가르지 않아 같은 1/1000초에 같은 요청이 여럿 와도 201 은 하나다. 다시 읽어도 없으면 대기(503 `pending`, 같은 요청 번호로 다시 보내면 안전), 다른 내용이면 409 는 그대로다. 쓰기 번호가 있는데 모양이 틀린 저장 기록은 모양이 틀린 기록(`skippedOps`)으로 뺀다. 중앙의 기존 가져오기 3건은 쓰기 번호가 없는 옛 기록으로 그대로 읽힌다.
- 출처(Source)와 쓰임(Use)은 따로다. 쓰임의 정체 = 쓴 사람(로그인 계정, 과거 기록은 `hist:<이름>`) + 분야 + 검수 번호 + 운동/드릴 번호 + 쓴 곳 + 그 인용의 자료 번호(가진 것 가운데 가장 강한 것: PMID → DOI → PMCID → 정규화한 링크). 같은 논문을 PubMed · PMC 두 링크로 적어도 확인된 번호가 같으면 한 쓰임이다.
- 같은 출처로 묶는 것(합집합)은 셋뿐: 정규화한 링크가 같음 · 링크 모양에서 바로 나오는 PubMed · PMC · DOI 번호가 같음 · **과거 가져오기(import)가 공식 서지로 확인했다고 적은(`verifiedBy`)** 번호 · 다른 링크가 같음. 제목이 닮았다고 묶지 않는다.
- **지금 등록(register)이 보낸 번호 · 다른 링크 · `verifiedBy` 는 보여 주기만 하고 묶지 않는다**(`metadataStatus: 'claimed'`). 서버가 그 값을 다시 확인할 수 없어서, 잘못 적은 번호 하나로 다른 자료가 영구히 합쳐지지 않게 한다. 서지 값의 우선은 칸마다 과거 가져오기의 확인 값 → 등록이 확인했다고 보낸 값 → 사람이 적은 값. 종류 · 요약은 지금 등록 값이 과거 가져오기 값보다 앞선다.
- 같은 쓰임의 여러 기록은 **쓴 사람 쪽 시각(`use.notedAt`, 없으면 받은 때)** 차례로 겹친다. 늦게 다시 보낸 옛 요청이 뒤의 고침을 덮지 않는다. `notedAt` 은 2020년 뒤, 받은 때에서 하루 넘게 앞서지 않아야 하고, 과거 가져오기는 늘 `null`. 겹치는 규칙(`materialize.ts`):
  - 빈 값 · 뺀 값은 앞의 값을 지우지 않는다(적용 · 한계 · 운동 이름 · 쓴 곳 메모는 새 글이 있을 때만 바뀐다). 한계 글을 비우는 길은 없다.
  - 읽은 범위는 `unknown` 이 아닌 값이 올 때만 바뀐다. 더 낮은 단계(`metadata-only` · `abstract` · `partial`)를 직접 보내면 내려가지만 `unknown` 으로 되돌아가지는 않는다.
  - 최근 확인일은 늦은 쪽으로만(`max`), 처음 확인일은 이른 쪽으로만(`min`) 간다.
  - 거둔 뒤 같은 쓰임을 다시 등록하면 앞의 값과 함께 되살아난다. 기록을 그 자리에서 지우거나 고치는 길은 없다(운영 절차 11절).
- 쓰임은 지우지 않고 **거둔다(withdraw)**: `{ requestKey, withdraw: { useId, reasonKo, notedAt } }` 를 등록 주소로 보낸다. 지금 등록 쓰임은 등록한 계정만 거둘 수 있고(남의 쓰임 403, 없는 번호 400), **과거 기록 쓰임은 대표관리자 누구의 거두기든 받는다**(서버 규칙). 운영 규칙은 그 기록의 검수자 본인만 자기 몫의 과거 기록 쓰임을 거두는 것이다(운영 절차 11절). 목록 API 는 쓰임마다 `withdrawn` 참/거짓만 내보내고 누가 거뒀는지는 내보내지 않는다(관리자 화면 출처 상세에 '거둔 사람'이 보인다). 그래서 audit 의 `withdrawnOnly` 는 누가 거뒀는지 가리지 못한다. 거둔 쓰임은 목록에 '거둠'으로 남고 쓰임 수 · 최근 확인일에서 빠진다. 거두기는 그 쓰임의 가장 늦은 등록보다 쓴 시각이 늦을 때만 효력을 내고, 같은 쓰임의 거두기가 여럿이면 쓴 시각이 가장 늦은 것이 효력을 낸다. 거둔 뒤 같은 쓰임을 같거나 늦은 쓴 시각으로 다시 등록하면 다시 살아난다.
- 모르는 값(확인일 · 읽은 범위 · 번호 · 종류)은 비워 둔다(`null` · `unknown`). 받은 시각으로 채우지 않는다.
- 모양 · 검사는 `model.ts`, 링크 규칙은 `url.ts`, 쓰기 · 읽기 순서는 `store.ts`, 목록 만들기는 `materialize.ts`.

### 목록 모으기(R2, 저장소 목록 v2)

- 기록 자리(`review-evidence/v1/ops/`)를 저장소 목록 v2(list-v2)로 이름 차례(글자 단위 오름차순) + 다음 쪽 표(cursor)로 끝까지 넘긴다(`bucket-list.ts` · `storage.ts` · `store.ts`). 이름은 앞 이름보다 늘 커야 하고(쪽 안 · 쪽 사이), 다음 쪽이 있으면 비지 않은 새 표가 있어야 하며, 쪽 수 60 · 객체 20,000 한도를 넘지 않아야 한다. 하나라도 어기면 일부만 돌려주지 않고 전체를 실패로 돌린다(`inconsistent` · `unexpected` · `too_large`). 시간 초과 · 잠시 못 닿음은 그 쪽만 같은 표로 두 번까지 다시 묻는다(실패한 쪽의 일부는 쓰지 않는다).
- 보장하는 것과 아닌 것: 모으는 동안 내내 있던 객체는 정확히 한 번 나온다(저장소가 '표보다 큰 이름'을 이름 차례로 준다는 목록 v2 약속을 믿고, 차례 · 겹침 · 멈춤은 다시 확인한다). 모으는 동안 새로 생기거나 지워진 객체는 나올 수도 안 나올 수도 있다(이미 지난 이름 앞에 생기면 안 나오고 뒤에 생기면 나온다). 한 순간을 찍은 사진(snapshot)은 아니다. 등록 뒤 '보임' 확인은 내가 만든 뒤에 모으므로 내 기록은 늘 들어간다. 저장소가 쪽 사이의 이름을 말없이 건너뛰는 경우는 여기서 알아챌 수 없다.
- 목록에 있었는데 읽을 때 없는 기록은 잠시 뒤 한 번 더 읽고, 그래도 없으면 전체 실패(`inconsistent`). 본문 모양이 틀린 기록은 `skippedOps`, 기록 이름이 아닌 객체는 `foreignObjects`(빈 폴더 표시 `.emptyFolderPlaceholder` 제외)로 세어 화면 · API 에 알린다. 기록 자리 아래의 하위 폴더 객체는 중앙 목록을 `unexpected` 로 멈춘다(지우지 말고 관리 담당 판단). 내 컴퓨터 시험 폴더는 하위 폴더를 건너뛴다.
- 운영 준비 조건: 운영 Supabase 저장소에 목록 v2(`POST /object/list-v2/<버킷>`, 설치본 `@supabase/storage-js` 2.111.0 의 `listV2`, 설치본 주석상 실험적)가 있어야 한다. 없으면(404 · 405 · 501 · 경로 없음) 목록 · 화면 · 거두기가 503 `reason: 'unsupported'` 로 멈추고 옛 offset 목록으로 돌아가지 않는다. 운영 반영 뒤 `GET ?view=summary` 를 읽기만 해서 `apiVersion` 2 · `ops` 3(그 사이 다른 실제 등록이 있으면 그만큼 더) · `skippedOps` 0 · `foreignObjects` 0 을 확인하는 것이 출시 확인 항목이다(운영 절차는 `docs/reviews/review-evidence-registrar.md` 2절).

내 컴퓨터 미리보기 · 시험만: 서버 환경변수 `REVIEW_EVIDENCE_LOCAL_DIR` 에 폴더를 주면 운영이 아닐 때(`NODE_ENV !== 'production'`) 그 폴더를 저장소로 쓴다(`local-store.ts`). 응답의 `store` 가 `local-fixture` 로 나온다. 그 폴더의 기록은 중앙 목록이 아니다. 저장소 · 배포물에 넣지 않는다.

## API

| 요청 | 하는 일 |
| --- | --- |
| `GET /api/admin/review-evidence[?view=summary]` | 목록(출처 · 링크 · 쓰임 열쇠). summary 면 숫자만 |
| `POST /api/admin/review-evidence` | `{ requestKey, source, use }` 한 건 등록, 또는 `{ requestKey, withdraw: { useId, reasonKo, notedAt } }` 한 쓰임 거두기(32 KB 까지) |
| `POST /api/admin/review-evidence/import` | 과거 기록 한 묶음 `{ requestKey, snapshot, chunk, records }`(768 KB · 150줄까지) |

처리 순서: 로그인(401) → 대표관리자(403) → [쓰기만] `x-review-evidence: 1` 머리 · `Sec-Fetch-Site` · `Origin`(있으면 같은 호스트) · `Content-Type: application/json`(415) · 크기(413) → 본문 모양(400) → 저장소. 저장소는 보는 사람 검사를 지난 뒤에만 묻는다. 모든 응답은 저장하지 않는다(no-store).

응답: 성공 201(새로) · 200(같은 요청 다시) `{ ok, store, receipt: { opId, requestKey, kind, receivedAt, replayed, visible, placements, records, useState, applied, supersededBy } }`. 받음표에는 `apiVersion` 이 없다.

받음표의 상태 칸(R2, 더하기만 · 201/200 은 그대로): 저장한 뒤 목록을 다시 모아 이 기록이 가리키는 쓰임을 본다(`materialize.ts` 의 `opOutcome`, 목록 만들기 결과는 바꾸지 않는다).

- `useState`: `active` · `withdrawn` · `unknown`(다시 모으지 못했거나 그 쓰임이 없음) · `null`(가져오기). 등록은 이 기록이 든 쓰임, 거두기는 `withdraw.useId` 의 쓰임.
- `applied`: 늘 `visible` 과 같다. 등록은 이 인용이 목록에 들어감, 거두기는 이 거두기가 지금 효력을 냄.
- `supersededBy`: 효력을 못 낸 까닭. 거두기가 적용되지 않았는데 그 쓰임이 다른 거두기(같거나 늦은 쓴 시각)로 거둔 상태면 `withdraw`, 그 쓰임이 이 거두기와 같거나 늦은 등록으로 살아 있으면 `register`. 등록인데 그 쓰임이 지금 거둔 상태면 `withdraw`(이때 `visible` · `applied` 는 `true` 그대로). 그 밖 · 가져오기 · 목록을 다시 모으지 못함 · 거둘 권한이 없는 쓰임은 `null`.
- 적용되지 않은 거두기는 `placements` 가 빈 목록이다. 대상 쓰임 번호는 보낸 쪽이 자기 요청에서 안다.
- 관리 화면도 같은 칸으로 판단한다(`view.ts` 의 `withdrawStepOf` · `registerResultOf`, 셀프테스트가 같은 함수를 본다). 거두기 폼은 `applied` 일 때만 완료 글을 보이고, `supersededBy: 'register'` 면 등록한 기기의 시계가 앞서 있었을 수 있다고 알린다(그 시각이 지나기 전에는 다시 거둬도 같다). 등록 폼은 `useState: 'withdrawn'` 이면 '저장했어요'로 시작하지 않고 거둔 상태 그대로라고 경고한다.
- 칸이 없는 옛 서버의 받음표를 받으면 도구는 앞 판처럼 `visible` 만 본다.

오류 `{ ok: false, error, message, issues? }` — 400 `invalid`/`bad_json` · 401 · 403 · 409 `conflict` · 413 · 415 · 503 `pending`(`reason: 'save' | 'readback'`)/`unavailable`.
**`store: 'central'` 이고 `visible: true` 일 때만 '중앙 목록에 들어갔다'고 본다.** `store: 'local-fixture'` 는 내 컴퓨터 시험 폴더라 등록이 아니다. 503 은 같은 요청 번호로 다시 보내면 겹치지 않는다.

목록 판 2(R2, `apiVersion: 2`):

- `GET` 목록 · 요약 응답에 `apiVersion: 2` 와 `counts.foreignObjects` 가 있다. 목록의 쓰임마다 `mine`(지금 로그인한 계정이 등록한 지금 쓰임인가, 과거 기록 쓰임은 늘 `false`, 이름표로 짐작하지 않음) · `historicalReviewer`(과거 기록 쓰임의 `yunho` · `kimmin`, 지금 쓰임은 `null`)가 있다. 계정 번호(보낸 계정 · 보는 사람 번호)는 내보내지 않는다.
- 목록 · 요약을 모으지 못하면 503 `{ ok: false, error: 'unavailable', message, reason }`. `reason` 은 `unavailable`(잠시 못 닿음, 다시 하면 풀릴 수 있음) · `inconsistent`(목록이 중간에 어긋나거나 목록에 있던 기록을 못 읽음, 조금 뒤 다시) · `too_large`(한도 넘음) · `unexpected`(기록 자리 밖 항목) · `unsupported`(운영 저장소에 목록 v2 없음, 다시 해도 안 풀리는 운영 준비 조건). 거두기도 목록을 먼저 읽으므로 같은 503 을 낸다.
- `apiVersion` 이 없는 응답은 R1 서버다. 도구는 그런 서버에서 검수자별 audit 을 하지 않는다(`server-too-old`).

## 등록 도구 `scripts/review-evidence-registrar.mjs`

설치 없이 Node 22 이상 · 표준 라이브러리만. 저장소 어디서든 절대 경로로 부른다(상태 폴더는 도구가 든 저장소로 정해진다). 단 `audit --records` 는 지금 폴더 기준으로 읽으므로 기록을 고치고 `publish` 하는 checkout 의 기록 절대 경로를 준다(예: `"$(git rev-parse --show-toplevel)/docs/reviews/handoff/<분야>/<검수자 폴더>/video-records.json"`). 표준 출력은 JSON 한 덩어리, 안내는 표준 오류(한국어). 응답의 `message` 도 표준 오류에 한 번 더 보인다. 세션 쿠키 값은 늘 가린다. 명령 줄에서만 돈다. 브라우저 · 앱 창을 열지 않고 `git rev-parse` 말고 다른 프로그램을 부르지 않는다(기기 승인 주소는 사람이 직접 연다).
끝 번호: `0` 됨(거두기는 `withdrawn` · `already-withdrawn`, retry 는 더 보낼 대기가 남지 않음, status 는 세션 확인됨) · `1` audit 빠진 등록(`missing`) 또는 확인을 끝내지 못함(`incomplete`) · `2` 충돌(409) 또는 더 새 상태에 밀림(`superseded`) · `3` 값이 틀림/거절/지원하지 않는 검수 기록 모양/`--records` 를 읽지 못함 · `4` 대기(네트워크 · 로그인 · 401 · 403 · 5xx · 미확인 · 시험 저장소 · 옛 서버 · 다른 주소의 대기 · 다른 retry 중 · login 실패 · 세션 파일이 깨짐 `session-unreadable` · 세션 없는 status) · `5` 내 컴퓨터 시험 저장소에만 들어감(`--fixture-ok` 일 때만, 중앙 등록이 아님: `fixture-saved` · `fixture-already-withdrawn` · `fixture-audited`) · `64` 쓰는 법이 틀림(`--help` 포함).
**성공(`0`)은 서버가 `store: 'central'` · `receipt.visible: true` 로 답하고, 새 서버면 등록은 `useState: 'active'`(또는 `unknown`), 거두기는 `applied: true` 이거나 다른 거두기로 이미 거둔 상태(`supersededBy: 'withdraw'`)일 때뿐이다.** 시험 저장소(`local-fixture`)에 들어간 것은 `--fixture-ok` 가 없으면 `status: 'fixture-only'` · 끝 번호 4 이고 대기열에 그대로 남는다. `--fixture-ok` 가 있으면 `status: 'fixture-saved'` · 끝 번호 5 이고 `fixture-receipts/` 로 옮겨진다. 어느 쪽도 받음표(`receipts.jsonl`) · 가져오기 기록에 적지 않는다.

```sh
R=<저장소 절대 경로>/scripts/review-evidence-registrar.mjs
BASE=<주소>     # 아래 '쓸 수 있는 때' 참고

# 1. 로그인(맥마다 한 번) — 코드 승인. 대표관리자로 로그인한 브라우저에서 표준 오류에 나온 주소를 열고 2분 안에 승인
node "$R" login --base "$BASE"
#    이미 세션 값이 있으면 표준 입력으로(인자 · 화면에 쓰지 않는다)
node "$R" login --base "$BASE" --session-stdin < <세션 값이 든 파일>

# 2. 03 운동영상 — 실제로 쓴 출처마다 그 자리에서
node "$R" register --base "$BASE" --url 'https://pubmed.ncbi.nlm.nih.gov/<PMID>/' --domain exercise \
  --review <검수 번호> --item <운동 번호> --item-name '<운동 이름>' --purpose prescription \
  --consulted today --reading abstract --application '세트 · 횟수 문구를 이 연구의 범위로 맞췄어요.' \
  --limits '대상이 대학 선수라 청소년에 바로 옮기지 않았어요.' --lookup-ncbi

# 3. 04 메커니즘 영상 — 같은 모양, 분야만 mechanics · 운동 번호 대신 드릴 번호
node "$R" register --base "$BASE" --url '<https 링크>' --domain mechanics --review <검수 번호> --item <드릴 번호> \
  --purpose cue --consulted today --application '큐 문장을 이 자료의 순서 설명에 맞췄어요.'

# 4. 실패로 남은 대기를 다시 보내기 · 보기 · 상태
node "$R" retry --max 20   # 남은 대기가 하나라도 있으면(--max 로 안 보낸 것 · 다른 주소의 대기 포함) 끝 번호 4
node "$R" pending
node "$R" status

# 5. 필요 없는 대기 버리기(보내지 않고 rejected/ 로, reason: discarded) — 다른 주소의 대기 · 잘못 넣은 대기
node "$R" discard <requestKey> --reason '다른 주소에서 만든 대기라 보내지 않아요.'

# 6. 잘못 등록한 쓰임 거두기 — useId 는 등록 출력의 useId(= receipt.placements[0].useId) · 받음표(receipts.jsonl) · 목록 API(GET)의 uses[].useId
node "$R" withdraw --base "$BASE" --use use_<24자리> --reason '검수 번호를 잘못 넣어 거둬요.'

# 7. 링크가 서버 규칙을 지나는지만 보기(아무 데도 보내지 않음)
node "$R" check-url --url '<https 링크>'
node "$R" check-url --json <링크 글자 목록 파일>    # 1000개까지, '-' 면 표준 입력

# 8. 인계 전 — 검수 기록에 인용한 링크가 모두 이 검수자의 중앙 등록인지
TOP="$(git rev-parse --show-toplevel)"   # 기록을 고치고 publish 하는 checkout 안에서
node "$R" audit --records "$TOP/docs/reviews/handoff/exercise/yunho/video-records.json" --domain exercise --reviewer yunho
node "$R" audit --records "$TOP/docs/reviews/handoff/mechanics/yunho/video-records.json" --domain mechanics --reviewer yunho [--review <검수 번호>]
```

- 값 이름: `--purpose` description · cue · prescription · safety · progression · mechanism · evidence-check · video-check · user-request · other,
  `--reading` unknown · metadata-only · abstract · partial · full-text, `--kind` original-research · systematic-review · narrative-review · professional-guidance · coaching-material · regulation · textbook · thesis · other,
  `--summary '<한국어>' --summary-basis` title-metadata · abstract · partial · full-text · review-notes. `--consulted` 는 `YYYY-MM-DD` 또는 `today`(한국 날짜). 안 넣으면 비워 둔다.
  `--review` 는 검수 기록의 `review_id` 그대로, `--item` 은 운동 · 드릴의 DB 번호를 알 때만(짐작하지 않음), `--reading` 은 실제로 읽은 만큼만(모르면 빼서 unknown).
- `--json <파일|->` 로 `{ source, use }` 를 통째로 줄 수도 있다(값 옵션과 같이 쓰지 않음).
- `--lookup-ncbi` 는 PubMed · PMC 주소일 때만 NCBI 공식 번호 변환(idconv) · esummary 를 부른다. **부른 사람이 적어 넣은 번호 · 서지와 섞지 않는다.**
  - 확인되면: 번호 · 제목 · 저자 · 학술지 · 연도는 NCBI 값만 보내고 `verifiedBy: ncbi` 를 단다. 다른 링크(`altUrls`)는 그 링크 모양의 번호가 확인된 번호와 같을 때만 남긴다.
  - 확인 못 하면: 번호 · 다른 링크 · `verifiedBy` 를 모두 빼고 보낸다(링크 모양에서 나오는 번호는 서버가 스스로 읽는다).
  - 종류(`kind`)는 `--kind`(또는 `--json` 의 kind) · PubMed 발행 유형에서만 정한다(체계적 문헌고찰 · 메타분석 / 지침 / 리뷰 · 스코핑 리뷰 / 사설 · 논평 · 편지 / 연구 설계 유형). 둘 다 없거나 알아볼 수 없으면(예: 'Journal Article' 만) 비워 두고 화면이 '분류 확인 필요'로 보인다.
  - 어느 쪽이든 지금 등록이 보낸 번호 · `verifiedBy` 는 서버에서 보여 주기만 한다(위 '같은 출처로 묶는 것').
- **쓴 시각(`notedAt`)은 도구가 처음 대기열에 넣을 때 정해 본문에 넣는다.** `--json` 에 적은 notedAt 은 쓰지 않는다. 다시 보내도(retry) 본문 글자가 같다.
- 요청 번호 = `rk-cli-` + `{source, use(notedAt 포함)}` 정해진 순서 JSON 의 sha256 앞 48자(거두기는 `rk-cli-w-`). 같은 내용을 다시 `register` 하면
  ① 같은 쓰임의 가장 새 대기가 같은 내용이면 그 대기를 그대로 보내고, ② 이 컴퓨터 받음표에서 같은 쓰임의 가장 새 등록이 같은 내용이고 **그 뒤에 이 컴퓨터에서 같은 쓰임의 반대 기록(등록이면 거두기, 거두기면 등록)이 없으면** 그 notedAt 을 다시 써 같은 요청 번호(`already-registered`)가 된다. ③ 그 밖에는 새 시각(견준 기록보다 적어도 1ms 뒤)의 새 요청이다(옛 내용으로 되돌리기 · 거둔 뒤 다시 등록도 새 요청). `--fixture-ok` 로 다시 등록하면 같은 쓰임 · 같은 주소의 `fixture-receipts/` 의 notedAt 을 다시 써 같은 요청 번호가 된다(같은 반대 기록 규칙).
- **서버가 알린 더 새 상태(R2 받음표)**: 등록인데 `useState: 'withdrawn'`, 또는 거두기인데 `supersededBy: 'register'` 면 그 요청은 같은 글자로 다시 보내도 효력이 없다. `register` · `withdraw` 를 직접 실행한 때는 같은 내용을 새 쓴 시각(새 요청 번호)으로 한 번만 다시 넣어 보낸다(옛 요청은 `rejected/` 의 `superseded`, `supersededBy` 에 새 번호). 그것이 적용되면 `registered` · `withdrawn`(0, `refreshed: true` · `refreshedFrom`), 그래도 밀리면 `superseded`(2). `retry` 는 다시 보내지 않고 바로 `rejected/`(`reason: 'superseded-central'`, 시험 저장소면 `'superseded-fixture'`, 받음표 번호 · `serverSupersededBy` 함께)로 옮기고 `superseded` 로 센다. 거두기인데 `supersededBy: 'withdraw'` 면 이미 다른 거두기로 거둔 상태라 `already-withdrawn`(0, 받음표 줄에 `applied: false`, 시험이면 `fixture-already-withdrawn` · 5).
- **밀림(superseded)**: 같은 쓰임(분야 · 검수 번호 · 운동/드릴 · 쓴 곳 · 정규화한 링크)의 새 등록을 대기열에 넣으면, 그 쓰임의 옛 대기는 보내지 않고 `rejected/` 로 옮긴다(`reason: 'superseded'`, `supersededBy`). 늦게 보낸 옛 요청이 고침을 덮지 않게. 같은 쓰임 번호의 거두기도 같다.
- 다른 주소(`--base`)의 대기: 로그인한 주소와 다른 `--base` 로 register 하면 쓰는 법 오류로 버리지 않고 그 주소의 대기로 넣는다(끝 번호 4, `base-mismatch`). retry 는 그런 대기를 보내지 않고 `baseMismatch` 로 세며 끝 번호 4. 그 주소로 로그인해 retry 하거나 `discard` 한다. 로그인 없이 `--base` 도 없이 넣은 대기는 다음 retry 때나 같은 내용을 로그인 뒤 다시 register 할 때 로그인한 주소를 따른다(그래서 실제 등록에는 늘 `--base` 를 넣는다). 그 대기에 다른 `--base` 를 주면 그 주소의 대기로 남아 `base-mismatch` 다.
- `retry` 는 한 번 도는 동안 `retry.lock` 을 잡는다. 다른 retry 가 돌고 있으면 바로 끝 번호 4 `busy`(주인 프로세스가 죽었거나 10분 넘게 안 움직인 자물쇠는 버린다). 다른 프로세스가 그새 등록을 끝내 대기 파일을 지웠으면 다시 만들지 않는다.
- `--json` 의 모르는 칸(`model.ts` 의 출처 · 쓰임 칸 이름표, `source.identifiers` 는 `pmid` · `pmcid` · `doi` 만)은 대기열에 넣기 전에 끝 번호 3 `invalid` 로 막는다. 칸 이름도 링크 검사를 한다. 서버가 짚어 준 칸 자리(`issues[].field`)는 이름 모양인 조각까지만 그대로 보이고 나머지는 `[키:<8자리>]`, 링크 · 제어 글자가 섞였거나 300자를 넘는 서버 글은 정해진 한국어 글로 바꿔 출력 · 대기열 · `pending` 어디에도 그대로 적지 않는다.
- 도구 안의 링크 검사는 `url.ts` 규칙을 그대로 옮긴 것이다(비밀 쿼리 이름 낱말 쪼개기 · 경로 안 세션 값 · 이름 · 끝말 모양 · # 뒤 120자 · 내부 · 비공개 저장소 목록 · 안에 든 링크). 안에 든 링크: 경로 · 쿼리 · # 뒤를 `%XX` 를 세 번까지 풀어 다시 나오는 `http(s)://` 주소마다 계정 정보 · IP · 내부 · 비공개 저장소 · 비밀 쿼리 이름을 보고, 하나라도 걸리면 같은 까닭 이름으로 받지 않는다(공개 원문을 담은 보관 · 넘김 주소는 받는다). 서버가 다시 본다. `url.ts` 를 바꾸면 도구도 같이 고친다. 자체 시험이 `check-url` 과 `url.ts` 를 같은 링크 묶음으로 견준다.

### 명령별 출력(R2)

- `register` · `withdraw`: `ok` · `status` · `requestKey` · `notedAt` · `opId` · `sourceId` · `useId`(거두기는 적용되지 않아 받음표에 자리가 없어도 대상 쓰임 번호) · `receivedAt` · `replayed`(참/거짓 또는 null) · `visible` · `useState` · `applied` · `supersededBy`(받음표의 상태 칸, 옛 서버 · 받지 못함이면 null) · `store`(글자 또는 null) · `central`(참/거짓) · `refreshed`(새 쓴 시각으로 한 번 다시 보냈나) · `refreshedFrom`(그때 옛 요청 번호, 아니면 null) · `receipt`(받았을 때 서버 받음표 그대로) · `error`(실패일 때 종류) · `message` · `issues`(`[{ field, message }]`, 값 오류 · 거절일 때) · `notes` · `superseded`(대기열에 넣을 때 밀어낸 옛 대기 요청 번호 목록) · `lookup`(`{ ok }`, `--lookup-ncbi` 일 때). `status` 는 `registered` · `already-registered`(0) · `withdrawn` · `already-withdrawn`(0, 이미 다른 거두기로 거둔 상태 포함) · `superseded`(2, 새 쓴 시각으로 한 번 다시 보낸 뒤에도 더 새 상태에 밀림) · `pending`(4, `error` 는 no-session · base-mismatch · timeout · network · redirect · unauthenticated · forbidden · unconfirmed · bad_response · pending · unavailable · http_NNN 가운데 하나) · `fixture-only`(4) · `fixture-saved` · `fixture-already-withdrawn`(5) · `rejected`(2 충돌 · 3 거절) · `invalid`(3, 이 컴퓨터에서 막혀 대기열에 넣지도 보내지도 않음) · `session-unreadable`(4) · `usage`(64). 로그인이 없을 때의 `pending` 출력에는 `refreshed` · `superseded` 칸이 없다.
- `retry [--max N]`(1 ~ 10000, 기본 50): `status` 는 `retried` · `empty`. 칸은 `attempted` · `registered` · `alreadyRegistered`(`already-withdrawn` 도 여기에 셈) · `withdrawn` · `stillPending` · `fixtureOnly` · `fixtureSaved` · `fixtureAlreadyWithdrawn` · `superseded` · `conflict` · `invalid` · `baseMismatch` · `noBody` · `gone` · `notAttempted` · `pendingLeft` · `results`. `results[]` 는 요청마다 `{ requestKey, kind, domain, reviewId, itemId, status, error, opId, sourceId, useId, receivedAt, replayed, visible, useState, applied, supersededBy, store, central, fixture? }`, 또는 `status: 'not-sent'`(`error: 'base-mismatch' | 'no-body'`) · `status: 'gone'`(돌던 사이 다른 프로세스가 그 대기를 처리함). retry 는 더 새 상태(`superseded`)를 다시 보내지 않고 `rejected/` 로 옮긴다. 끝 번호는 남은 대기(`pendingLeft`) · `stillPending` · `fixtureOnly` 가 있으면 4, 아니면 충돌 2, 거절 3, 시험 저장소에서 끝난 것(`fixtureSaved` · `fixtureAlreadyWithdrawn` · 시험 밀림)이 있으면 5, 아니면 0. **0 은 '더 보낼 대기가 남지 않았다'는 뜻이다.** 밀림(`superseded`) · `gone` 만 있어도, 보낼 대기가 없던 `empty`(로그인 없이도)도 0 이다. 기록에 적힌 요청 번호가 모두 등록됐다는 뜻이 아니다. 결과에 없는 요청 번호는 `pending` 의 `rejected[]` 에서 찾는다(운영 절차 7절). 로그인이 없고 대기가 있으면 `no-session`(4, 대기 수), 다른 retry 중이면 `busy`(4).
- `pending`(늘 0): `stateDir` · `count` · `oldest`(가장 먼저 넣은 대기의 시각) · `oldestRequestKey` · `pending[]`(`requestKey` · `kind` · `domain` · `reviewId` · `itemId` · `url` · `useId` · `base` · `notedAt` · `attempts` · `lastError` · `lastAttemptAt` · `createdAt`) · `rejectedCount` · `rejected[]`(같은 칸 + `reason`(`conflict` · `invalid` · `discarded` · `superseded` · `superseded-central` · `superseded-fixture`) · `reasonKo` · `supersededBy`(이 대기를 밀어낸 새 요청 번호) · `serverSupersededBy`(서버 받음표의 `supersededBy`) · `opId` · `receiptUseId` · `httpStatus` · `issues`(다시 가림)) · `fixtureReceipts`(개수). 쓴 곳(`purpose`)은 나오지 않는다. 이 컴퓨터 상태 폴더만 본 것이고 중앙 상태가 아니다.
- `status`: 세션이 있고 서버 확인이 되면 0, 아니면 4(세션이 없으면 `ok: false` · `sessionSaved: false` · `server: null`, 출시 전 · 로그인 전에는 이것이 정상). 칸은 `stateDir` · `perMachine: true` · `base` · `loopback` · `sessionSaved` · `savedAt` · `viewerLabel` · `store` · `central` · `apiVersion`(숫자 또는 null) · `auditSupported`(apiVersion 2 이상) · `server`(`{ ok: true, store, central, apiVersion, auditSupported, counts, viewerLabel }` 또는 `{ ok: false, error, message }`, 세션이 없으면 null) · `pending` · `oldestPending` · `rejected` · `fixtureReceipts` · `retryRunning`. 요약에 판이 없으면 목록을 한 번 더 읽어 본다. 세션이 없으면 서버에 묻지 않는다.
- `discard <requestKey> --reason '<한국어>'`: 0 `{ status: 'discarded', requestKey, kind, base }`. 대상이 없거나 까닭이 틀리면 3, 다른 retry 중이면 4, 요청 번호 모양이 틀리면 64.
- `login`: `{ ok, status: 'logged-in', base, viewerLabel, store, central, sessionSaved: true }`. 실패는 4(`login-failed` · `login-timeout`), 표준 입력의 세션 모양이 틀리면 3. `logout`: `{ ok, status: 'logged-out', removed }`.
- 저장한 `session.json` 이 깨졌거나 바로가기 · 열 수 없는 파일이면 그것을 읽는 모든 명령(register · withdraw · retry · status · audit · import 등)이 끝 번호 4 `session-unreadable` 로 멈춘다. 아무것도 보내거나 대기열에 넣지 않고, 해석기 오류 글(파일 글자 일부가 섞일 수 있음)은 내보내지 않는다. `logout` 뒤 `login`(바로가기면 그 파일을 지운 뒤 `login`).
- `check-url`: 넣은 글자를 되풀이하지 않는다. `results[]` 는 `{ index, ok: true, href, normalized }` 또는 `{ index, ok: false, reason, message, fingerprint }`. 모두 통과하면 0, 하나라도 거절이면 3.

### audit(R2, 검수자 한 명 · 분야 한 개)

`audit --records <파일> --domain exercise|mechanics --reviewer yunho|kimmin [--review <검수 번호>] [--fixture-ok]`

- 쓰는 법 오류(64): 옵션이 없거나 틀림, 내 컴퓨터 주소로 로그인하지 않은 `--fixture-ok`, 기록 경로(그대로 또는 실제 경로)가 `…/handoff/<분야>/<검수자 폴더>/<파일>` 인데 그 분야 · 검수자가 옵션과 다름. 검수자 폴더 이름은 `yunho` → `yunho`, `min` → `kimmin`(김민 기록은 `handoff/<분야>/min/`), `kimmin` → `kimmin` 으로 본다.
- 기록 오류(3): 읽을 수 없거나 JSON 이 아님(`invalid`, 상대 경로는 지금 폴더 기준이라 하위 폴더에서 쓰면 여기에 든다), 목록도 `{ records: [...] }` 도 아니거나 `review_id` 가 있는 줄이 하나도 없음(`unsupported`, 확인하지 않음), `--review` 번호가 파일에 없음(`review-not-found`).
- 모으는 것: 기록 줄 어디에 있든 링크 글자를 칸 전체가 링크인 값과 글 안에 끼운 링크(R2 원장 · 메모에만 적은 출처를 빠뜨리지 않기)에 **같은 규칙 하나**로 찾는다. 등록(`register`)의 글 칸 · 칸 이름 링크 검사도 같은 규칙이다.
  1. 후보: `http(s)://` 부터 빈칸 · 따옴표 · 꺾쇠 앞까지(한글에서 끊지 않는다, 아래 4).
  2. 붙여 쓴 링크: 후보 안에서 `,` `;` `(` `)` 바로 뒤에 다시 `http(s)://` 가 오면 거기서 떼어 따로 본다(`/` 뒤의 링크, 예: `web.archive.org/web/<때>/https://…` 는 떼지 않는다). 주소 글자 구간이 끝난 뒤 남은 글자도 다시 훑어 `|` · 역슬래시 · 꺾인 기호 · CJK 구두점 뒤의 다음 링크를 빠뜨리지 않는다.
  3. 링크는 주소에 쓰는 ASCII 글자까지. 끝의 문장 부호(`. , ; : ! ?`)와 짝 없는 닫는 괄호 · 대괄호는 뗀다.
  4. ASCII 글자 바로 뒤에 한글 같은 ASCII 가 아닌 글자가 이어지면(한글 경로 · 붙은 조사 · 한글 쿼리 · 악센트 경로 · 한글 사이트 이름 · 사이트 이름 바로 뒤 한글) 어디까지가 링크인지 알 수 없어, 잘린 링크를 빠짐으로 내지 않고 `skipped[]` 에 `code: 'ambiguous_in_text'`(지문만, 퍼센트 인코딩을 권하는 글)로 둔다. 단 그 사이에 3 의 문장 부호가 있었거나 한중일 닫는 부호(`。、，．：；！？）」』】〕〉》”’…`)가 오면 거기가 끝이다.
  5. `https://` 없이 적은 학술 링크(`pubmed.ncbi.nlm.nih.gov/…` · `pmc.ncbi.nlm.nih.gov/articles/…` · `www.ncbi.nlm.nih.gov/pmc/…` · `doi.org/10…` · `dx.doi.org/10…` · `europepmc.org/…`, 앞에 주소 글자가 붙지 않은 것)는 `https://` 를 붙여 인용으로 센다(`schemeless: true`).

  글 안에서 찾은 인용은 `skipped[]` · `missing[]` 줄에 `inText: true` 가 붙는다. `catalog_url` 칸과 `source_id` 가 `canonical_local_record` 인 출처 묶음은 뺀다. 모은 글자는 `url.ts` 규칙(안에 든 링크 포함)으로 다시 본다. `http` 링크도 모아 등록할 수 없는 인용으로 센다. `{ records: [...] }` 모양이면 `records` · `catalog_url` 밖의 윗칸도 같은 규칙으로 훑어, 인용이 있는 칸마다 `ignored[]` 에 `{ recordIndex: null, field, code: 'outside_records', message, citedStrings }` 를 더한다(값은 가림, 확인을 끝내지 못함). 운영 절차는 찾고 고치기 쉽게 인용 링크를 링크만 든 칸에 따로 적기를 권한다.
- 건너뛴 인용(`skipped[]`): `{ reviewId, recordIndex, field, inText?, schemeless?, code, message, fingerprint }`(모호한 링크는 `code: 'ambiguous_in_text'` 이고 지문은 기록에 적힌 그 조각). `fingerprint` 는 다듬은 원래 링크 글자(글 안 링크면 떼어 낸 링크 부분) sha256 앞 12자이고 원래 글자는 어디에도 내보내지 않는다. 같은 글자를 내 컴퓨터에서 `check-url --json <파일>` 로 보면 같은 지문이 나온다. 알아볼 수 없는 줄(`ignored[]`): `{ recordIndex, code: not_object | missing_review_id | invalid_review_id | outside_records, message, citedStrings, field? }`. `recordIndex` 는 목록(또는 `records`) 안 0부터 센 번호, `field` 는 키 · 번호로만 만든 자리(예: `evidence.sources[1]`).
- 중앙과 맞추기: 로그인이 없으면 4 `no-session`, 목록을 못 읽으면 4 `unavailable`, 목록 `apiVersion` 이 없거나 2 밑이면 4 `server-too-old`. 이 셋도 범위(`scope`)와 이 컴퓨터에서 센 숫자는 함께 낸다.
- 맞는 쓰임: 같은 분야 · 같은 `reviewId`, 정규화한 링크가 그 쓰임의 `href` · `otherHrefs` 나 그 출처의 `links` 에 있음, 거두지 않음, 그리고 과거 기록 쓰임은 `historicalReviewer === --reviewer`, 지금 쓰임은 `mine === true`. 다른 계정 · 다른 검수자의 거두지 않은 쓰임은 `otherReviewerUses` 로만 센다. 이 검수자 몫(지금 쓰임은 `mine`, 과거 기록 쓰임은 그 검수자 이름)인데 거둔 쓰임은 `withdrawnOnly` 로 센다. 과거 기록 쓰임은 대표관리자 누구나 거둘 수 있어 이 검수자가 거둔 것이라는 뜻은 아니다. **도구는 로그인한 계정이 그 검수자 본인인지 알 수 없다**(`mine` 은 `--reviewer` 와 상관없이 로그인한 계정 기준). 출력의 `scope.viewerLabel` 을 사람이 확인한다.
- 저장소가 `central` 이 아니면: `--fixture-ok` 없이는 4 `fixture-only`, `--fixture-ok` 와 `local-fixture` 면 5 `fixture-audited`. 둘 다 `registered: 0` · `fixtureMatched` · `fixtureResult` · `central: false`.
- 중앙 결과: 건너뛴 인용이나 알아볼 수 없는 줄이 하나라도 있으면 `incomplete`(1, `--review` 로 다른 검수를 골라도 알아볼 수 없는 줄은 따진다), 아니면 빠진 등록이 있으면 `missing`(1), 아니면 `complete`(0).
- 출력 칸: `ok` · `status` · `central` · `registered` · `message` · `scope`(`{ reviewer, domain, review, viewerLabel, matchedBy: ['live:mine', 'historical:<검수자>'] }`) · `apiVersion` · `store` · `records`(`{ total, recognized, inScope, ignored, outsideRecords }`) · `cited` · `schemelessCited` · `skippedCount` · `ambiguousCount` · `skipped`(500개까지) · `ignoredRecords` · `ignored`(500개까지) · `pendingLocal` · `otherReviewerUses` · `withdrawnOnly` · `missingCount` · `missing[]`(`{ reviewId, recordIndex, field, inText?, schemeless?, url, pendingLocal, otherReviewerUse, withdrawnOnly }`, `url` 은 정리한 링크).

### 꼭 지킬 순서(03 · 04 공통)

자세한 운영 절차와 출력 예는 `docs/reviews/review-evidence-registrar.md`.

1. **실제로 쓴 출처마다 그 자리에서 `register`**: 판단 · 문구에 쓴 순간. 모아 두었다 나중에 몰아서 하지 않는다.
2. **받음표 확인**: 출력의 `status` 가 `registered` 또는 `already-registered` 이고 `store` 가 `central`, `receipt.visible` 이 `true`(새 서버면 `useState: 'active'`)여야 등록이다. `fixture-only` · `fixture-saved` 는 등록이 아니다. 받음표(`opId` · `sourceId` · `useId`) 또는 대기 `requestKey` 를 넣은 `--purpose` · `--item`(없으면 null) 값과 함께 검수 기록에 남긴다.
3. **실패면 대기**: 끝 번호 4 는 대기열에 남았다는 뜻이다(등록 아님). 연결 · 로그인을 고친 뒤 `retry`. 2 · 3 은 `rejected` 에 남는다. 충돌 · 거절은 내용을 고쳐 새로 `register`, 밀림(`superseded`)은 그 쓰임의 더 새 상태(늦은 거두기 · 늦은 등록)를 확인한 뒤 정한다(운영 절차 11절).
   잘못 등록한 쓰임은 고쳐 다시 `register` 하거나(같은 쓰임이면 새 값이 뒤에 겹친다. 빈 값은 앞의 값을 지우지 않고, 읽은 범위는 낮은 단계를 직접 적어야 바뀌며 '모름'으로는 못 되돌린다) 쓰임 자체가 틀렸으면(검수 번호 · 링크 · 쓴 곳) `withdraw` 한다.
4. **세션 시작에 `retry --max 20` 한 번, 인계 전에 `audit --reviewer <나>`**: 빠진 것이 있으면(끝 번호 1) register 또는 retry 로 채운다. `pendingLocal: true` 는 이 컴퓨터 대기열에 있으나 아직 안 들어간 것. 쓰지 않아 버리거나 거둔 출처의 링크가 기록에 남아 빠짐으로 나오면 등록하지 말고 기록에서 그 링크를 지운다. `--records` 는 기록을 고치고 `publish` 하는 checkout 의 절대 경로로 준다.

세는 것: 검수 판단 · 문구 · 처방 · 영상 판정에 실제로 쓴 출처. **세지 않는 것**: 찾아보다 쓰지 않은 출처, 검색 결과, 열어만 본 페이지. 둘러본 기록을 자동으로 잡지 않는다.

### 상태 폴더

`REVIEW_EVIDENCE_STATE_DIR` 가 있으면 그 폴더, 없으면 이 도구가 든 저장소 git 공통 폴더 안 `review-evidence-registrar-v1`(같은 컴퓨터의 작업트리가 같이 쓴다), 그것도 안 되면 집 폴더 `.bullpen-review-evidence-v1`. 컴퓨터마다 하나다.

- `session.json`(0600, `{ base, session, savedAt, viewerLabel }`) · `pending/<requestKey>.json`(보낼 본문 글자 포함) · `rejected/<requestKey>.json`(충돌 · 거절 · 밀림 · 서버의 더 새 상태 · 버림, `reason` · `httpStatus` · `issues` · `supersededBy` · `reasonKo`, 서버 밀림이면 `opId` · `sourceId` · `useId` · `receivedAt` · `useState` · `applied` · `serverSupersededBy` · `store`) · `fixture-receipts/<requestKey>.json`(시험 저장소에만 들어간 받음표, `store: 'local-fixture'` · `central: false` · `fixture: true` · 받음표 상태 칸 · `withdrawUseId`, 본문 없음) · `receipts.jsonl`(중앙 확인만, 한 줄에 하나 `{ requestKey, kind, contentKey, identity, notedAt, store: 'central', opId, sourceId, useId, receivedAt, replayed, applied, useState, supersededBy, base, domain, reviewId, itemId, url, withdrawUseId }`, 이미 다른 거두기로 거둔 상태로 끝난 거두기는 `applied: false`) · `imports/<snapshotId>.json` · `queue.lock` · `retry.lock`.
- 폴더는 0700, 파일은 0600, 바로가기 파일은 쓰지 않는다. 깃에 올리지 않는다. 세션 값은 출력 · 인자 · 받음표에 나오지 않는다. `logout` 은 세션 파일을 지운다. 받지 않는 링크 · 비밀이 든 링크의 원래 글자는 이 폴더 어디에도 적지 않는다.
- **다른 맥으로 옮기지 않는다.** `session.json` · `pending/` 을 포함해 이 폴더를 복사 · 동기화하지 않는다. 다른 맥은 그 맥에서 `login` 하고, 공유한 검수 기록에 적힌 같은 값(분야 · `review_id` · `item_id` · `purpose` · 링크)으로 다시 `register` 한다(같은 쓰임은 서버가 하나로 묶는다). 기록에 `purpose` · `item_id` 가 없으면 짐작하지 않고 처음 맥에서 retry 한다(쓴 곳이 다르면 다른 쓰임이 된다). 처음 맥에 남은 대기는 나중에 그 맥에서 retry 하거나 discard 한다.

모든 요청은 넘김(3xx)을 따라가지 않고 실패로 본다. Origin 은 보내지 않는다. 요청 하나 20초.

### 쓸 수 있는 때

- 실제 등록은 **EX-REF04 R2 서버 코드가 배포된 운영 `https` 주소**로만 한다(목록 `apiVersion` 2, 운영 저장소 목록 v2). 2026-11-21 최종 코드 `e307855d5a438c464c2e71af16dfb79caca6a34c`까지 웹 배포와 비로그인 401 차단은 확인했다. 인증된 중앙 요약 읽기 · 첫 실제 등록 · 맥북 실사용은 아직 확인 전이다. CLI는 출처 누락을 보완한 `c5f17fdffdea3127fbba5df9847910a29d419caa` 또는 검수한 후속판이 필요하다. 원격 코드 존재를 맥북/김민 맥 수신으로 추정하지 않는다. 운영 사용 준비 항목은 `docs/reviews/review-evidence-registrar.md` 2절.
- `http` 는 `localhost` · `127.0.0.1` · `[::1]` 과 포트가 있을 때만 받는다. 내 컴퓨터 주소는 시험용이다. 중앙 저장소를 쓰는 미리보기로 실제 등록하지 않는다(출시 전 코드로 중앙에 쓰게 된다).
- 다른 컴퓨터(맥북)는 도구가 그 맥 저장소에 들어오고 서버가 배포된 뒤 운영 주소로만 쓴다. 그 전에 그 컴퓨터에서 등록했다고 하지 않는다.
- 미리보기 서버가 `REVIEW_EVIDENCE_LOCAL_DIR` 로 떠 있으면 등록은 그 시험 폴더로 간다(`store: local-fixture`). **도구는 그것을 등록으로 치지 않는다** — register · withdraw · retry 는 `fixture-only` · 끝 번호 4 로 대기를 남기고(`--fixture-ok` 면 `fixture-saved` · 끝 번호 5 로 `fixture-receipts/` 에), import 는 그 묶음을 기록하지 않으며, audit 은 `fixture-only` · 끝 번호 4(`--fixture-ok` 면 `fixture-audited` · 끝 번호 5)로 등록 수를 0 으로 둔다. `login` · `status` 도 중앙이 아니면 알린다.
- `--fixture-ok` 는 register · withdraw · retry · audit 에만, 저장한 로그인 주소(와 `--base`)가 내 컴퓨터일 때만 받는다(아니면 64). register · withdraw · retry 는 먼저 요약을 읽어 저장소가 `central` 이면 64 로 멈추고 아무것도 보내지 않는다. 요약을 못 읽으면 보낸 뒤 응답의 `store` 로 가른다. 실제 상태 폴더에서 쓰지 않는다(시험마다 새 `REVIEW_EVIDENCE_STATE_DIR`).

## 과거 기록 가져오기

1. 가져오기 목록(manifest)을 만든다: `{ "chunks": [ <요청 본문>, … ] }`. 묶음마다 같은 `snapshot.id`, 정해진 `requestKey`(기준 · 묶음 번호에서), `chunk.index/total`, 150줄까지. 과거 쓴 사람은 `historical.reviewer`(yunho · kimmin)로만 적힌다.
2. `node "$R" import --manifest <파일> [--from-chunk i]` — 묶음을 차례로 보내고 `store: 'central'` · `visible` 로 확인된 것만 `imports/<snapshot>.json` 에 요청 번호 · **보낸 본문 글자의 sha256** · 저장소와 함께 남긴다.
   다시 돌리면 요청 번호 · 본문 지문 · 저장소(`central`)가 모두 같은 묶음만 건너뛴다. 내용이 바뀐 묶음은 다시 보내고, 서버가 같은 요청 번호의 다른 내용이라 409 로 막으면 끝 번호 2 로 알린다(성공이라 하지 않는다). 시험 저장소로 간 묶음은 `fixture-only` 로 기록하지 않아, 중앙 주소로 다시 돌리면 다시 보낸다.
3. 실패한 묶음이 있으면 같은 명령을 다시 돌린다(같은 요청 번호 · 같은 본문이라 겹치지 않는다). 모두 확인돼야 끝 번호 0 · `status: 'imported'`(아니면 `incomplete`).

## 시험

```sh
node --import ./scripts/alias-register.mjs scripts/review-evidence-selftest.mts   # 저장 · 목록 · API 순수 시험(가짜 저장소)
node scripts/review-evidence-registrar-selftest.mjs   # 가짜 서버 · 가짜 NCBI(127.0.0.1) · 임시 상태 폴더로 도구를 자식 프로세스로 부른다
node --import ./scripts/alias-register.mjs scripts/review-evidence-ops-selftest.mts   # 진짜 API 처리 + 시험 저장소(127.0.0.1)로 도구를 끝까지(중앙 아님)
```

시험만 쓰는 환경변수: `REVIEW_EVIDENCE_STATE_DIR`(상태 폴더) · `REVIEW_EVIDENCE_POLL_MS`(로그인 승인 묻는 간격) · `REVIEW_EVIDENCE_NCBI_TEST_BASE`(가짜 NCBI — `http://127.0.0.1:포트` · `http://localhost:포트` 만 받는다). 자체 시험은 Node 의 TS 형 지우기로 `url.ts` 를 직접 불러 링크 규칙을 견준다(Node 23.6 이상). 시험에서 기기 승인 `login` 은 쓰지 않는다(그 서버에 로그인 코드가 만들어진다). 가짜 서버에는 `--session-stdin` 을 쓴다.
