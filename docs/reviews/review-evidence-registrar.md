# 검수 근거 등록 운영 안내(EX-REF04 등록 도구)

2026-11-20 · EX-REF04 R2 납품 후보. 03 운동영상 · 04 메커니즘 영상 검수에서 **실제로 쓴 출처**를 쓰는 그 순간 중앙 근거 목록(대표관리자 전용 `/admin/review-evidence`)에 남기는 절차다. 도구는 `scripts/review-evidence-registrar.mjs`, 기술 설명은 `lib/review-evidence/README.md`. 이 문서는 운영 절차이며 앱 배포 · DB 구조 변경 · 과거 기록 가져오기(import) · 검수 기록 형식 변경의 승인이 아니다. 각 파트의 체크포인트 반영은 03 · 04 담당이 정한다.

## 1. 무엇을 하나 · 검수 기록 공유와 다른 점

| | 검수 기록 공유 `scripts/video-review-sync.py` | 근거 등록 `scripts/review-evidence-registrar.mjs` |
| --- | --- | --- |
| 다루는 것 | 비민감 검수 메모 · 체크포인트 파일 | 실제로 쓴 출처 하나와 그 쓰임 한 건 |
| 가는 곳 | 공개 Git 원격 저장소(`receive` · `publish`) | 운영 서버의 관리자 API → 중앙 저장소 |
| 성공의 뜻 | 원격 ref 와 대상 파일이 일치 | 끝 번호 0 · `status` 가 `registered` 또는 `already-registered` · `store` 가 `central` · `visible` 이 `true` · `useState` 가 `active` |
| 누구의 것 | 검수자 폴더(지금 도구는 `yunho` 경로만) | 로그인한 대표관리자 계정. 맥마다 따로 로그인 · 대기열 |

- `publish` 는 근거 등록이 아니고, `register` 는 검수 기록 공유가 아니다. 둘 다 따로 한다.
- 등록 도구는 둘러본 페이지 · 검색 결과를 저절로 모으지 않는다. 사람이(또는 검수자를 돕는 GPT · Claude 세션이 그 검수자의 로그인으로) 명령을 실행한 것만 남는다.
- 도구는 명령 줄에서만 돈다. 브라우저 · 앱 창을 열거나 앞으로 가져오지 않는다(`git rev-parse` 말고는 다른 프로그램을 부르지 않는다). 그래서 화면을 건드리지 않는 배경 작업에서도 쓸 수 있다. 다만 기기 승인 `login` 의 주소는 검수자 본인이 자기 브라우저에서 직접 연다. GPT · Claude 세션이 그 주소를 대신 열거나 창을 띄우지 않는다.

## 2. 출시 조건과 지금 상태

**지금(2026-11-20)은 출시 전이다.** EX-REF04 R2 서버 코드(목록 GET 응답의 `apiVersion: 2`, 받음표의 `useState` · `applied` · `supersededBy`)는 운영에 배포되지 않았고 도구도 main 에 들어가지 않았다. 이 상태에서 운영 주소로 하는 등록은 이 맥의 대기열에만 남는다(`status: "pending"`, 끝 번호 4). 대기를 중앙 등록으로 적지 않는다.

출시 확인 항목(모두 아직 확인 전, 출시 담당인 전체 총괄이 확인해 알린다):

1. EX-REF04 R2 코드가 운영에 배포됨: 목록 · 요약 응답에 `apiVersion: 2` 가 있고, 등록 받음표에 `useState` · `applied` · `supersededBy` 가 있다.
2. 운영 저장소(Supabase)가 목록 v2(list-v2)를 지원함: 요약이 503 `reason: "unsupported"` 로 멈추지 않는다.
3. 읽기만 하는 요약 확인: 대표관리자로 `GET https://dugout-baseball.com/api/admin/review-evidence?view=summary` 를 열어 `apiVersion` 2, R1 가져오기 3건이 보임(`counts.ops` 3, 그 사이 다른 실제 등록이 있었다면 그만큼 더), `skippedOps` 0, `foreignObjects` 0(아니면 까닭 설명).
4. 첫 실제 등록 다시 읽기: 출시 뒤 실제로 쓴 출처 하나를 등록해 `registered` · `central` · `visible: true` · `useState: "active"` 를 받고, 관리자 화면이나 `audit` 으로 다시 보인다.
5. 두 번째 맥(맥북)에서 실제 사용: 그 맥에서 도구를 받고 `login` · `register` · `audit` 을 해 본다. 한 컴퓨터 안의 두 상태 폴더 시험은 두 번째 맥 확인이 아니다.

출시 알림 전에는:

- `login` 하지 않는다. 운영 서버에 로그인 코드가 만들어질 수 있고, 근거 목록 확인 단계에서 실패해 세션을 저장하지 않는다.
- 이 맥에 R2 도구가 있으면 `register --base https://dugout-baseball.com` 로 쓰는 순간 등록해 대기(`pending`, `error: "no-session"`)로 두고 `requestKey` 를 검수 기록에 적는다(5절 모양). 도구가 없는 맥은 인용 링크를 기록의 링크 칸에 그대로 남기고 쓴 곳 · 운동/드릴 번호도 적어 둔 뒤 출시 뒤 그 맥에서 `register` 한다.
- 내 컴퓨터 미리보기 주소(`http://localhost:포트`)로 로그인해 실제 등록하지 않는다. 미리보기가 중앙 저장소를 쓰면 출시 전 코드로 중앙에 쓰게 되고, 시험 저장소를 쓰면 등록이 아니다.

도구 판 확인: `node "$R" --help`(끝 번호 64 로 쓰는 법을 보인다)의 끝 번호 줄에 `2 충돌 또는 더 새 상태에 밀림(superseded)` 와 `5 시험 저장소에만(--fixture-ok)` 가 둘 다 있으면 이 문서가 다루는 R2 판이다. `밀림` 이 없으면 더 새 상태(다른 맥의 거두기 · 되살리기)를 가리지 못하는 앞 판이니 저장소를 받은 뒤 쓴다. `audit` 에는 `--reviewer` 가 꼭 필요하다.

## 3. 맥마다 한 번 준비

```sh
R=<이 맥 저장소의 절대 경로>/scripts/review-evidence-registrar.mjs   # 예: /Users/<사용자>/Developer/bullpen-log/scripts/...
BASE=https://dugout-baseball.com                                      # 출시 담당이 알린 정식 운영 주소
node --version                                                        # 22 이상
node "$R" status                                                      # 세션이 없으면 서버에 묻지 않고 끝 번호 4(ok:false). stateDir · 대기 수 확인
```

- 새 터미널 · 새 세션마다 `R` · `BASE` 를 다시 정한다.
- `status` 는 세션이 있고 서버 확인이 될 때만 끝 번호 0 이다. 세션이 없으면 `ok: false` · `sessionSaved: false` · 끝 번호 4 로 끝난다. **출시 전 · 로그인 전에는 이것이 정상이다**(실패로 보고 다음 명령을 멈추지 않는다).
- `status` · `login` · `register` · `withdraw` · `retry` · `pending` · `discard` · `check-url` 은 저장소 어느 폴더에서 실행해도 된다(상태 폴더는 도구가 든 저장소로 정해진다). **`audit` 의 `--records` 만은 지금 폴더 기준으로 읽는다.** 그래서 `receive` · `publish` 를 하는 그 checkout 안의 기록을 절대 경로로 준다(8절).
- 상태 폴더(세션 · 대기열 · 받음표)는 도구가 든 저장소의 git 공통 폴더 안 `review-evidence-registrar-v1` 이다(같은 맥의 작업트리끼리 같이 쓴다). 같은 맥에서는 늘 같은 저장소의 도구를 쓴다. 다른 복제본의 도구를 쓰면 대기열이 갈린다. `REVIEW_EVIDENCE_STATE_DIR` 는 시험 전용이다.

로그인(출시 알림 뒤, 맥마다 · 계정마다 한 번, 세션이 풀리면 다시):

```sh
node "$R" login --base "$BASE"
```

- 표준 오류에 `주소: <BASE>/link/<코드>` 와 `코드` 가 나온다. **그 검수자 본인의 대표관리자 계정**으로 로그인한 브라우저에서 검수자 본인이 그 주소를 열고 2분 안에 승인한다(지나면 `login-timeout`, 끝 번호 4). 다른 사람 계정의 브라우저로 승인하면 그 사람 계정으로 등록된다.
- 기기 승인을 쓸 수 없고 세션 값이 이미 보호된 파일(권한 600, 저장소 · 공유 폴더 밖)에 있을 때만: `node "$R" login --base "$BASE" --session-stdin < <그 파일>`. 세션 값을 채팅 · 명령 인자 · 화면 · 문서 · 검수 기록에 붙여 넣지 않는다.
- 로그인 뒤 `node "$R" status` 로 끝 번호 0, `viewerLabel` 이 내 이름인지, `central` 이 `true`, `apiVersion` 이 2, `auditSupported` 가 `true` 인지 본다. 하나라도 아니면 등록 · audit 을 시작하지 않는다.
- 저장한 세션 파일이 깨졌거나 바로가기면 모든 명령이 `session-unreadable`(끝 번호 4)로 멈추고 아무것도 보내거나 대기열에 넣지 않는다. `logout` 뒤 `login` 을 다시 한다(바로가기면 상태 폴더의 `session.json` 을 지운 뒤 `login`). 세션 값을 손으로 고치지 않는다.

## 4. 쓰는 순간 등록하기

**세는 것:** 검수 판단 · 제목 · 설명 · 처방 · 안전 문구 · 영상 판정에 실제로 쓴 출처. 쓴 그 자리에서 한 건씩 등록한다. 모아 두었다 나중에 몰아서 하지 않는다.
**세지 않는 것:** 찾아보다 쓰지 않은 출처, 검색 결과, 열어만 본 페이지.

값의 뜻:

- `--domain`: `exercise`(03 운동영상) 또는 `mechanics`(04 메커니즘 영상).
- `--review`: 그 검수 기록 줄의 `review_id` 를 글자 그대로(예: `EX-Y-P-001`, `mv-0457d3ca2b3a1169`). 기록 줄이 아직 없으면 `review_id` 를 먼저 정해 기록에 적고 등록한다. audit 은 이 값으로 맞춘다.
- `--item`: 운동 · 드릴의 DB 번호를 알 때만. 운동은 기록의 `library_database_id`(또는 `media.library_database_id`), 메커니즘은 `drill_id`. 영상 파일 번호 · 목록 순서 · 짐작한 값은 넣지 않는다. 모르면 뺀다. 같은 쓰임을 다시 보낼 때 이 값을 바꾸면 다른 쓰임이 된다.
- `--purpose`: 쓴 곳 `description` · `cue` · `prescription` · `safety` · `progression` · `mechanism` · `evidence-check` · `video-check` · `user-request` · `other`. 쓰임은 쓴 곳마다 따로라 이 값을 바꾸면 다른 쓰임이 된다. **도구의 출력 · `pending` 에는 쓴 곳이 나오지 않는다.** 넣은 `--purpose` · `--item` 값을 5절 모양대로 기록에 같이 적는다.
- `--application`(필수): 이 출처를 어디에 어떻게 적용했는지 한국어로, 링크 없이. `--limits`(선택): 적용 한계를 한국어로.
- `--consulted`: 실제로 본 날(`today` 는 한국 날짜, 또는 `YYYY-MM-DD`). 모르면 뺀다.
- `--reading`: 실제로 읽은 범위 `unknown` · `metadata-only` · `abstract` · `partial` · `full-text`. 빼면 `unknown`. 확실히 아는 만큼만 적고 제목만 보고 올려 적지 않는다. 한 번 올려 적은 범위는 '모름'으로 되돌릴 수 없다(11절).
- `--base "$BASE"`: 늘 넣는다. 대기가 운영 주소의 대기로 묶여 시험 주소로 잘못 가지 않는다.
- `--lookup-ncbi`(선택): PubMed · PMC 링크면 NCBI 공식 서지를 불러 붙인다(NCBI 에 접속한다).
- `--json <파일>` 로 `{ source, use }` 를 통째로 줄 때 모르는 칸이 있으면 대기열에 넣지 않고 끝 번호 3 `invalid` 다(`issues[].field` 에 칸 자리, 이름 모양이 아닌 칸 이름은 `[키:<8자리>]` 로 가림).

03 운동영상 예:

```sh
node "$R" register --base "$BASE" --url 'https://pubmed.ncbi.nlm.nih.gov/<PMID>/' --domain exercise \
  --review <review_id> --item <library_database_id> --item-name '<운동 이름>' --purpose prescription \
  --consulted today --reading abstract --application '세트 · 횟수 문구를 이 연구의 범위로 맞췄어요.' \
  --limits '대상이 대학 선수라 청소년에 바로 옮기지 않았어요.'
```

04 메커니즘 영상 예(드릴 번호를 모르면 `--item` 을 뺀다):

```sh
node "$R" register --base "$BASE" --url '<https 링크>' --domain mechanics --review <review_id> \
  --item <drill_id> --purpose cue --consulted today --application '큐 문장을 이 자료의 순서 설명에 맞췄어요.'
```

출력은 표준 출력 JSON 한 줄이다(아래는 보기 좋게 나눔). **출시 전 · 로그인 전**에 위 운동 예를 지어낸 값으로 실행한 실제 출력(서버에 닿지 않음):

```json
{
  "ok": false,
  "status": "pending",
  "error": "no-session",
  "message": "대기열에만 넣었고 아직 등록되지 않았어요.",
  "opId": null,
  "sourceId": null,
  "useId": null,
  "receivedAt": null,
  "replayed": null,
  "visible": false,
  "useState": null,
  "applied": null,
  "supersededBy": null,
  "store": null,
  "central": false,
  "requestKey": "rk-cli-befbf0a82cce8d46c7cce0893fd6cca5ecedbce337dc9e86",
  "notedAt": "2026-11-20T14:22:57.502Z",
  "notes": []
}
```

중앙 등록이 확인된 때의 출력 모양. **내 컴퓨터의 가짜 시험 서버(진짜 API 처리 코드 + 임시 폴더, 저장소 이름만 `central` 로 흉내 냄, 127.0.0.1)에서 받은 출력이며 실제 중앙 등록이 아니다.** 칸과 차례는 그 출력 그대로이고, 번호 · 시각 값만 알아보기 쉬운 가짜로 바꿨다. 실제 `sourceId` · `useId` 는 `src_` · `use_` 뒤 16진수 24자리다.

```json
{
  "ok": true,
  "status": "registered",
  "receipt": {
    "opId": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    "requestKey": "rk-cli-dda1b564a5e571b41e4cf3f848dd545ac40dbbcd4e018f87",
    "kind": "register",
    "receivedAt": "2026-11-20T12:00:00.000Z",
    "replayed": false,
    "visible": true,
    "placements": [{ "sourceId": "src_000000000000000000000001", "useId": "use_000000000000000000000001" }],
    "records": 1,
    "useState": "active",
    "applied": true,
    "supersededBy": null
  },
  "opId": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "sourceId": "src_000000000000000000000001",
  "useId": "use_000000000000000000000001",
  "receivedAt": "2026-11-20T12:00:00.000Z",
  "replayed": false,
  "visible": true,
  "useState": "active",
  "applied": true,
  "supersededBy": null,
  "store": "central",
  "central": true,
  "refreshed": false,
  "refreshedFrom": null,
  "requestKey": "rk-cli-dda1b564a5e571b41e4cf3f848dd545ac40dbbcd4e018f87",
  "notedAt": "2026-11-20T11:59:59.900Z",
  "notes": [],
  "superseded": []
}
```

- 등록으로 적는 것은 끝 번호 0 이고 `store` 가 `central`, `visible` 이 `true`, `useState` 가 `active` 일 때뿐이다. `replayed: true`(또는 `already-registered`)는 같은 요청이 이미 들어가 있었다는 뜻으로 역시 등록이다.
- 받음표 칸의 뜻(서버가 등록 직후 목록을 다시 모아 정함): `useState` 는 이 요청이 가리키는 쓰임의 지금 상태(`active` 살아 있음 · `withdrawn` 거둔 상태 · `unknown` 목록을 다시 읽지 못함). `applied` 는 등록이면 이 인용이 목록에 들어갔는지(`visible` 과 같음), 거두기면 이 거두기가 지금 효력을 내는지. `supersededBy` 는 효력을 못 낸 까닭(`withdraw` 다른 거두기 · `register` 더 늦은 등록), 그 밖에는 `null`. 칸이 없는 옛 서버에서는 도구가 앞 판처럼 `visible` 만 본다.
- `refreshed: true` 면 그 쓰임이 거둔 상태(다른 맥 · 다른 기기에서 거둠)라 도구가 같은 내용을 새 쓴 시각으로 한 번 다시 보낸 것이다(옛 요청은 `rejected/` 의 `superseded`, `refreshedFrom` 에 옛 요청 번호). 끝 번호 0 이면 거둔 쓰임을 되살린 것이니 **새 `requestKey` 와 받음표**를 기록에 적는다.
- 끝 번호 4 는 대기다. `requestKey` 를 기록하고 7절에서 다시 보낸다. 같은 내용을 다시 `register` 하면 같은 `requestKey` 가 다시 쓰여 겹치지 않는다(이 맥에서 그 뒤에 같은 쓰임을 거둔 적이 있으면 새 쓴 시각의 새 요청이 된다).
- 끝 번호 2 는 충돌(`rejected`, 같은 요청 번호에 다른 내용) 또는 밀림(`superseded`, 새 시각으로 한 번 다시 보낸 뒤에도 그 쓰임이 이 등록보다 늦게 거둬져 있음)이다. 둘 다 `rejected/` 에 남는다. 밀림은 11절.
- 끝 번호 3 은 서버 거절(`rejected/` 에 남음)이거나 값 오류(대기열에 넣지 않음)다. `issues[].field` 를 고쳐 다시 `register` 한다.

## 5. 검수 기록에 남길 것

- 인용 링크는 되도록 **링크만 든 칸**(예: 기존 `evidence.sources`, `sources` 목록)에 하나씩 적는다(찾고 고치기 쉽다). audit 은 칸 전체가 링크인 값과 메모 문장 속에 끼운 링크를 모두 인용으로 센다(문장 속에서 찾은 것은 출력에 `inText: true`, `https://` 없이 적은 학술 링크는 `schemeless: true`). 그래서 메모에만 적고 등록하지 않은 출처도 빠진 등록으로 나온다. 링크 뒤에 한글을 붙여 쓰지 않는다(띄어 쓴다, 8절).
- 등록 결과는 받음표나 대기 표시만 비밀 없이 남긴다. 권장 모양(위치 · 이름은 03 · 04 담당이 기록 형식에 맞춰 정한다):

```json
"evidence_registrations": [
  {"url": "https://pubmed.ncbi.nlm.nih.gov/<PMID>/", "status": "registered", "purpose": "prescription", "item_id": "<library_database_id>", "request_key": "rk-cli-…", "op_id": "<64자리>", "source_id": "src_…", "use_id": "use_…", "received_at": "2026-…Z", "machine": "맥 미니"},
  {"url": "<https 링크>", "status": "pending", "purpose": "cue", "item_id": null, "request_key": "rk-cli-…", "error": "no-session", "machine": "맥북"},
  {"status": "discarded", "request_key": "rk-cli-…", "reason": "찾아보기만 하고 쓰지 않았어요."}
]
```

- `purpose` · `item_id` 는 그 `register` 에 넣은 `--purpose` · `--item` 값 그대로 적는다(`--item` 을 뺐으면 `null`). 대기 줄에는 꼭 적는다. 다른 맥이 같은 쓰임으로 다시 등록할 때 이 값이 있어야 한다(9절). 링크 · 분야 · `review_id`(그 기록 줄)와 함께 쓰임을 정하는 값이다.
- **`url` 은 `registered` · `pending` 줄에만 둔다.** 쓰지 않은 출처라 버린(`discard`) 대기, 쓰지 않아 거둔 쓰임, 링크 · 값이 틀려 버린 대기는 검수 기록 어디에도 그 링크를 남기지 않는다. audit 은 기록 안의 링크를 모두 인용으로 세므로, 남겨 두면 인계 전 audit 이 늘 빠진 등록(`missing`)으로 멈춘다. 링크 없는 표시(`status` · `request_key` · `use_id` · `reason`)만 남기거나 그 줄을 지운다. 링크를 남겨도 되는 것은 같은 쓰임을 다른 맥에서 이미 등록해 버린 경우(그 줄은 그 받음표로 `registered` 로 고친다)와 바른 주소로 다시 등록할 경우뿐이다.
- 넣지 않는 것: 세션 · 쿠키 값, `session.json` · 상태 폴더 경로와 내용, 받지 않은 링크의 원래 글자(지문 · 자리만), 서명 · 토큰이 든 링크, 비공개 저장소 링크, 원문 · PDF 내용. `viewerLabel` 같은 계정 표시는 필요 없으면 적지 않는다.
- `source_id` 는 나중에 같은 자료가 다른 출처와 묶이면 대표 번호가 바뀔 수 있다(옛 번호는 목록의 `aliasIds` 에 남는다). 쓰임을 찾을 때는 `use_id` 가 기준이다.

## 6. 끝 번호

| 끝 번호 | 뜻 | 할 일 |
| --- | --- | --- |
| 0 | register: `registered` · `already-registered`(중앙에 들어가 쓰임이 살아 있고 목록에서 보임). withdraw: `withdrawn`(이 거두기가 적용됨) · `already-withdrawn`(같은 거두기가 이미 들어가 있었거나, 다른 거두기로 이미 거둔 상태. 뒤쪽이면 이 요청은 `applied: false`). retry: 이 맥에 보낼 대기가 더 남지 않음(줄마다 `results[].status` 를 본다, 7절). audit: `complete`. status: 세션이 있고 서버 확인이 됨. login · logout · pending · discard · check-url: 정상 | register · withdraw 는 받음표를 기록에 적는다. retry 는 7절대로 줄마다 |
| 1 | audit `missing`(빠진 등록) 또는 `incomplete`(확인을 끝내지 못함) | 8절 |
| 2 | 충돌(`rejected`, `error: "conflict"`, 409): 같은 요청 번호에 다른 내용. 또는 밀림(`superseded`): 더 새 상태가 있어 적용되지 않음(등록했는데 그 쓰임이 더 늦게 거둬져 있음 · 거뒀는데 더 늦게 다시 등록돼 있음), register · withdraw 는 새 쓴 시각으로 한 번 다시 보낸 뒤에도 그러할 때 | 둘 다 `rejected/` 에 남음. 충돌은 값을 확인해 새로 `register`, 밀림은 11절 |
| 3 | 값이 틀림 · 서버 거절 · `--json` 의 모르는 칸 · 지원하지 않는 기록 모양(`unsupported`) · `review-not-found` · `--records` 파일을 읽지 못함(`invalid`: 경로가 없거나 JSON 이 아님) · 다른 계정의 지금 등록 쓰임 거두기(403, `issues` 있음) · check-url 거절 · discard 대상 없음 | `issues` · `message` 를 보고 고친다 |
| 4 | 대기: 로그인 없음 · 네트워크 · 시간 초과 · 401 · 403(대표관리자가 아님) · 5xx · 확인 못함(`unconfirmed`) · 다른 주소 · 시험 저장소(`fixture-only`) · 옛 서버(`server-too-old`) · 다른 retry 중 · login 실패. status: 세션 없음 · 서버 확인 실패(출시 전 · 로그인 전에는 정상). 세션 파일이 깨짐(`session-unreadable`) | 등록 아님. `requestKey` 를 기록하고 7절 · 13절 |
| 5 | 내 컴퓨터 시험 저장소에만 들어감(`--fixture-ok`: `fixture-saved` · `fixture-already-withdrawn` · `fixture-audited`) | 시험 전용. 검수 근거가 아니다 |
| 64 | 쓰는 법이 틀림(옵션 · 경로 폴더와 `--domain` · `--reviewer` 불일치 등). `--help` 도 64 | 명령을 고친다 |

## 7. 세션 시작 · 재개

`docs/reviews/handoff/README.md` 의 `receive` 와 기록 읽기를 마친 뒤 한 번:

```sh
node "$R" status
node "$R" pending
node "$R" retry --max 20
```

- `retry` 는 한 번만 돌린다(반복 · 상주 감시를 만들지 않는다). 셋은 따로 실행한다(`&&` 로 잇지 않는다). `status` 가 4 로 끝나도 `pending` · `retry` 는 한다.
- **`retry` 끝 번호 0 은 '이 맥에 보낼 대기가 더 남지 않았다'는 뜻이다. 기록에 적힌 요청이 모두 등록됐다는 뜻이 아니다.** `status: "empty"`(보낼 대기 없음, 로그인 없이도 0)는 아무것도 확인하지 않은 것이고, 결과에 `superseded`(밀림) · `gone` 줄만 있어도 0 이다. 4 면 `pendingLeft` 만큼 남았다. 2 · 3 은 충돌 · 거절이 섞였다.
- `results[]` 의 `requestKey` 마다 검수 기록을 고친다:
  - `registered` · `already-registered`: 받음표 칸을 채운다.
  - `withdrawn` · `already-withdrawn`: 거둠 표시를 남긴다(`already-withdrawn` 은 같은 거두기가 이미 들어가 있었거나 다른 거두기가 먼저 효력을 낸 것(`applied: false`)이다. 어느 쪽이든 거둔 상태는 맞다). 쓰지 않아 거둔 것이면 그 링크는 기록에서 지운다(5절).
  - `pending`: 그대로 둔다.
  - `superseded`: 그 쓰임에 이 요청보다 더 새 상태가 있어 보내지 않고 `rejected/` 로 옮겼다(11절).
  - `gone`: 다른 프로세스가 그새 그 대기를 처리했다. `pending` 으로 어디로 갔는지 본다.
  - `not-sent`(`base-mismatch` · `no-body`): 13절.
  - 충돌 · 거절(2 · 3): 값을 고쳐 다시 `register`.
- **기록에 `pending` 으로 적힌 `request_key` 가 이번 `results[]` 에도 `pending` 의 `pending[]` 에도 없으면 등록된 것이 아니다.** `node "$R" pending` 의 `rejected[]` 에서 그 `requestKey` 를 찾아 `reason` 대로 한다:
  - `discarded`: 누가 버렸다. 실제로 쓴 출처면 다시 `register`, 아니면 기록에서 링크를 지운다.
  - `superseded`: 같은 쓰임의 더 새 대기가 있다. 그 줄의 `supersededBy`(새 요청 번호)의 결과를 기록에 적는다.
  - `superseded-central`(시험이면 `superseded-fixture`): 중앙의 더 새 상태에 밀렸다(`serverSupersededBy`, 11절).
  - `conflict` · `invalid`: 값을 고쳐 다시 `register`.
  - `rejected[]` 에도 없으면 같은 값으로 `register` 를 한 번 더 한다. 이 맥에서 이미 들어간 요청이면 `already-registered` 와 받음표가 나온다.
  - 어느 쪽이든 인계 전 audit(8절)으로 다시 확인한다.
- `no-session` 이거나 결과에 `unauthenticated`(401)가 있으면 `login` 을 다시 하고 `retry` 를 한 번 더 한다. 대기는 지워지지 않는다.
- 출시 전 · 로그인 전에는 `status` 가 끝 번호 4 · `ok: false` 로, `retry` 는 대기가 있으면 `no-session`(4), 없으면 `empty`(0)로 끝나는 것이 정상이다.
- `pending` · `status` 의 대기 수는 이 맥 상태 폴더만 본 것이다. 중앙에 들어갔는지는 등록 출력의 `store` · `visible` · `useState` 나 audit 으로만 판단한다. 다른 맥의 대기는 이 맥에서 보이지 않는다.

## 8. 인계 전 확인(audit)

자기 계정으로, 자기 검수 기록만 본다. 그날 검수한 항목은 `--review` 로 하나씩, 큰 구분점에서는 파일 전체로. `--records` 는 **`receive` · `publish` 를 하는 그 checkout 안의 기록 절대 경로**로 준다(그 checkout 안이면 어느 폴더에서 실행해도 같다):

```sh
cd <receive · publish 를 하는 checkout>
TOP="$(git rev-parse --show-toplevel)"
node "$R" retry --max 20
node "$R" audit --records "$TOP/docs/reviews/handoff/exercise/yunho/video-records.json" --domain exercise --reviewer yunho --review <review_id>
node "$R" audit --records "$TOP/docs/reviews/handoff/mechanics/yunho/video-records.json" --domain mechanics --reviewer yunho --review <review_id>
```

- `--records` 는 지금 폴더 기준으로 읽는다. 상대 경로를 하위 폴더에서 쓰면 파일을 못 읽어 끝 번호 3(`invalid`)이고, 다른 작업트리에서 쓰면 그 작업트리의 기록을 본다. 그래서 늘 기록을 고치고 `publish` 하는 checkout 의 기록을 위처럼 절대 경로로 준다. 나머지 명령은 어느 폴더에서나 된다.
- `--reviewer` 는 `yunho` 또는 `kimmin`. 기록 경로가 `handoff/<분야>/<검수자 폴더>/` 안이면 그 폴더와 `--domain` · `--reviewer` 가 같아야 한다(폴더 `min` 은 `kimmin`). 다르면 끝 번호 64.
- 셈하는 규칙: 지금 등록 쓰임은 **로그인한 계정이 등록한 것**(`mine`)만, 과거 기록 쓰임은 그 검수자 이름의 것만 등록으로 센다. 도구는 로그인한 계정이 그 검수자 본인인지 알 수 없다. 출력의 `scope.viewerLabel` 을 사람이 확인한다. 다른 사람 계정으로 다른 검수자의 기록을 audit 하지 않는다.

결과 읽기:

| `status` | 끝 번호 | 뜻 · 할 일 |
| --- | --- | --- |
| `complete` | 0 | 범위 안 인용이 모두 이 검수자의 중앙 등록과 맞음 |
| `missing` | 1 | `missing[]` 의 인용이 등록되지 않음. `pendingLocal: true` 면 이 맥 대기열에 있음(`retry`). `otherReviewerUse: true` 면 다른 계정 · 검수자가 등록한 것이라 내 등록으로 치지 않음(실제로 썼으면 내가 등록). `withdrawnOnly: true` 면 이 검수자 몫의 쓰임이 거둬진 상태(아래). `field` 가 내가 버리거나 쓰지 않아 거둔 `evidence_registrations` 줄이면 그 줄의 링크를 지운다(5절). 쓰지 않은 출처를 등록해 채우지 않는다 |
| `incomplete` | 1 | 등록할 수 없는 인용(`skipped[]`: 받지 않는 링크 · 어디까지가 링크인지 모호한 `ambiguous_in_text`)이나 알아볼 수 없는 기록 줄(`ignored[]`: `review_id` 없음 · 모양 틀림 · records 밖 칸의 링크 `outside_records`)이 있어 끝까지 확인하지 못함. 빠진 등록도 함께 알린다 |
| `no-session` · `unavailable` · `server-too-old` · `fixture-only` | 4 | 중앙과 맞춰 보지 못함. 13절 |
| `fixture-audited` | 5 | 시험 저장소와만 맞춰 봄(`--fixture-ok`). 등록 확인이 아니다 |
| `unsupported` · `invalid` · `review-not-found` | 3 | 기록 모양을 알아볼 수 없거나(`unsupported`), `--records` 파일을 읽지 못했거나(`invalid`: 경로 · JSON), 그 `review_id` 가 파일에 없음. 확인하지 않았다 |

- `withdrawnOnly: true`: 지금 등록 쓰임은 등록한 계정만 거둘 수 있지만, **과거 기록(가져오기) 쓰임은 서버가 대표관리자 누구의 거두기든 받는다.** audit 은 누가 거뒀는지 가리지 못한다. 관리자 화면 그 출처 상세의 '거둔 사람' · 까닭을 보고, 아직 쓰는 출처면 다시 `register`(되살림, 4절의 `refreshed`), 쓰지 않으면 기록에서 그 인용을 지운다. 다른 검수자가 거둔 것이면 기록을 지우기 전에 그 사람과 맞춘다.
- 링크를 찾는 규칙(칸 전체가 링크인 값과 문장 속 링크에 같은 규칙):
  - `http(s)://` 부터 빈칸 · 따옴표 · 꺾쇠 앞까지 본다. `,` · `;` · `(` · `)` 바로 뒤에 다시 `http(s)://` 가 붙어 있으면 따로 떼어 본다(하나는 받고 하나는 받지 않는 링크면 그것만 `skipped`). 보관 주소처럼 `/` 뒤에 든 링크(`web.archive.org/web/<때>/https://…`)는 떼지 않는다.
  - 끝의 문장 부호(`. , ; : ! ?`) · 짝 없는 닫는 괄호 · 한중일 닫는 부호(`。` `、` `）` `」` 등)는 뗀다.
  - 링크 바로 뒤에 한글 같은 ASCII 가 아닌 글자가 붙어 있거나(붙은 조사 · 한글 경로 · 한글 쿼리) 사이트 이름에 한글이 있으면 어디까지가 링크인지 알 수 없어 `ambiguous_in_text` 로 건너뛴다(빠진 등록으로 내지 않고 지문만). 링크를 띄어 쓰거나 한글이 든 주소는 퍼센트 인코딩(`%EC…`)한 링크로 고친다.
  - `https://` 없이 적은 학술 링크(`pubmed.ncbi.nlm.nih.gov/…` · `pmc.ncbi.nlm.nih.gov/articles/…` · `www.ncbi.nlm.nih.gov/pmc/…` · `doi.org/10.…` · `dx.doi.org/10.…` · `europepmc.org/…`)도 `https://` 를 붙여 인용으로 센다(`schemeless: true`).
  - 링크 안에 다른 링크가 든 것(검색 결과 넘김 주소 등)은 안에 든 링크까지 본다. 안에 비공개 저장소 · 내부 주소 · IP · 계정 정보 · 비밀 쿼리가 있으면 받지 않는다(`skipped`, 같은 거절 까닭). 공개 원문을 담은 보관 주소는 받는다.
  - `{ "records": [...] }` 모양 파일에서 `records` · `catalog_url` 밖의 칸에 링크가 있으면 어느 검수의 인용인지 알 수 없어 `ignored[]` 에 `outside_records`(칸 이름 · 수만)로 세고 `incomplete` 로 멈춘다. 그 링크를 해당 기록 줄 안으로 옮긴다.
- 자리 표시: `recordIndex` 는 기록 목록 안 0부터 센 번호(메커니즘은 `records` 목록 안, `outside_records` 는 `null`), `field` 는 그 줄 안의 칸 자리(예: `evidence.sources[1]`). `skipped[]` 는 `code` · `message` · `fingerprint` 만 보이고 받지 않은 링크의 원래 글자는 보이지 않는다. `ignored[]` 는 `review_id` 가 없거나 모양이 틀린 줄과 records 밖 칸이다.
- 지문 맞추기(내 맥에서만): `field` 자리의 링크(`inText` 면 문장에서 그 링크 부분만)를 앞뒤 빈칸 없이 저장소 · 공유 폴더 밖 임시 파일에 JSON 목록(`["<그 값>"]`)으로 넣고 `node "$R" check-url --json <그 임시 파일>` 을 실행해 `fingerprint` 가 같은지 본 뒤 임시 파일을 지운다. 값을 명령 인자 · 채팅에 붙여 넣지 않는다. 고칠 때는 원문 출판사 · DOI · PubMed 같은 공개 원문 링크로 바꾼다(기록 수정은 그 파트 규칙대로).
- R1 가져오기 뒤에 기록에 더해진 인용은 파일 전체 audit 에서 `missing` 으로 나올 수 있다. 그 출처를 실제로 다시 확인해 쓰는 사람만 그때 `register` 하고, 아니면 별도 승인된 과거 가져오기를 기다린다. 확인하지 않은 쓰임을 지어내 등록하지 않는다(보류 중인 쓰임은 보류로 둔다).

## 9. 두 대의 맥

- 맥마다 따로 `login`(자기 계정)하고 대기열도 맥마다 따로다. `session.json` · `pending/` · `rejected/` · `receipts.jsonl` · `fixture-receipts/` 를 포함한 상태 폴더를 다른 맥으로 복사 · 동기화하거나 공유 폴더(iCloud 등) · 공개 저장소 · 검수 기록 · HANDOFF 에 두지 않는다.
- 맥을 떠나기 전: `retry --max 20`. 남은 대기가 있으면 검수 기록에 5절 모양(링크 · `purpose` · `item_id` · `request_key` · 어느 맥의 대기인지)으로 적고 기록을 `publish` 한다.
- 다른 맥에서: `receive` 로 기록을 받고 그 맥에서 `login`(이미 했으면 `status`)한 뒤, 기록에 적힌 같은 값으로 다시 `register` 한다: 같은 계정 · 분야 · `review_id` · `item_id`(`null` 이면 `--item` 을 뺀다) · `purpose` · 링크. 서버가 같은 쓰임으로 묶어 쓰임이 둘로 늘지 않는다(기록이 하나 더 쌓일 수는 있다). 적용 · 한계 · 읽은 범위 · 확인일은 그 맥에서 실제로 아는 만큼 적는다(같은 쓰임의 고침으로 겹친다, 11절). 받음표로 기록을 고친다.
- **기록에 `purpose` 나 `item_id` 가 없으면 짐작해 등록하지 않는다.** 쓴 곳 · 번호가 다르면 다른 쓰임이 되어 같은 검수자의 쓰임이 둘로 는다. 처음 맥에서 `retry` 하거나, 처음 맥에서 그 값을 기록에 적어 `publish` 한 뒤에 한다.
- 처음 맥으로 돌아오면 `pending` 으로 남은 대기를 보고 `retry` 하거나, 다른 맥에서 이미 등록했으면 `discard` 한다(그 줄은 다른 맥의 받음표로 `registered` 로 고친다). `retry` 해도 같은 쓰임으로 겹치고, 늦게 보낸 옛 내용이 더 새 내용을 덮지 않는다.
- 그 사이 다른 맥에서 그 쓰임을 거뒀다면: 처음 맥의 옛 대기는 `retry` 때 `superseded` 로 `rejected/` 에 옮겨진다(끝 번호 0, 7절). 처음 맥에서 같은 내용을 직접 다시 `register` 하면 도구가 새 쓴 시각으로 한 번 다시 보내 되살린다(`refreshed: true`). 거둔 것이 맞으면 되살리지 않는다.
- 받음표에 `useState` · `applied` · `supersededBy` 가 없는 옛 서버에서는 다른 맥의 거두기 · 되살리기를 가리지 못한다(같은 맥 안의 거두기 뒤 다시 등록은 가린다). 출시 확인 1번이 이것을 본다.
- 실제 두 번째 맥에서 이 순서를 해 본 적은 아직 없다(2절 5번).

## 10. 김민 검수

- 김민은 자기 맥 · 자기 대표관리자 계정으로 `login` 하고 쓰는 순간 `register` 한다. 금윤호 계정 · 금윤호 맥의 세션이나 대기열을 쓰지 않는다.
- 김민 기록은 `docs/reviews/handoff/<분야>/min/` 에 둔다. `video-review-sync.py` 는 `yunho` 경로만 지원하므로 김민 기록은 그 도구로 받거나 올리지 못한다(공유 방법은 `docs/shoot/video-review-current-workflow.md` 의 담당과 저장 경계).
- audit 은 `--reviewer kimmin` 이다(폴더 `min` 은 `kimmin` 으로 본다). 지금의 `exercise/min/armcare-20261120.json` 은 `review_id` 줄이 없는 요약 모양이라 `unsupported`(끝 번호 3)로 멈춘다. 목록 또는 `{ "records": [...] }` 모양에 줄마다 `review_id` 가 있는 기록이 생기기 전까지 김민 기록은 audit 할 수 없다. 그 모양은 김민 · 03 담당이 정한다.
- R1 가져오기에 김민 쓰임은 0건이다. 이것이 김민이 출처를 쓰지 않았다는 증거는 아니다. 김민 계정의 권한 · 김민 맥에서의 실제 사용은 확인하지 않았다.

## 11. 거두기 · 버리기 · 고치기

- 보내지 않을 대기 버리기(등록 아님): `node "$R" discard <requestKey> --reason '<한국어 까닭>'`. `rejected/` 로 옮겨진다(`reason: "discarded"`). 쓰지 않은 출처 · 틀린 링크 · 틀린 값이라 버린 것이면 검수 기록에서 그 링크를 지우고 링크 없는 표시(`{"status":"discarded","request_key":"rk-cli-…","reason":"…"}`)만 남기거나 그 줄을 지운다(5절). 같은 쓰임을 다른 맥에서 이미 등록해 버린 것이면 그 줄을 그 받음표로 `registered` 로 고친다.
- 잘못 등록한 쓰임 거두기: `node "$R" withdraw --base "$BASE" --use use_<24자리> --reason '<한국어 까닭>'`.
  - 지금 등록 쓰임은 등록한 계정만 거둘 수 있다(다른 계정이면 서버 거절, 끝 번호 3).
  - 과거 기록(가져오기) 쓰임은 서버가 대표관리자 누구의 거두기든 받는다. **운영 규칙: 과거 기록 쓰임은 그 기록의 검수자 본인만 자기 몫을 거둔다. 다른 검수자의 과거 기록 쓰임은 거두지 않는다**(8절의 다른 검수자 기록 audit 금지와 같은 뜻).
  - 결과: `withdrawn`(0, 이 거두기가 적용됨) · `already-withdrawn`(0, 같은 거두기가 이미 들어가 있었거나 다른 거두기로 이미 거둔 상태, 뒤쪽이면 `applied: false`) · `superseded`(2, 그 쓰임이 이 거두기보다 늦게 다시 등록돼 있어 새 쓴 시각으로 한 번 더 거둬도 효력이 없음) · 대기 4. 거둔 쓰임은 목록에 '거둠'으로 남는다. 쓰지 않아 거둔 것이면 기록에서 그 링크를 지운다(5절).
- 밀림(`superseded`) 다루기: 그 쓰임에 이 요청보다 더 새 상태가 있다는 뜻이다. 등록이면 그 뒤에 거둔 기록이, 거두기면 그 뒤에 다시 등록한 기록이 있다. 같은 요청을 다시 보내도 바뀌지 않으므로 도구는 대기로 두지 않고 `rejected/` 로 옮긴다(`register` · `withdraw` 를 직접 실행했으면 새 쓴 시각으로 한 번 다시 보낸 뒤). 관리자 화면 그 출처 상세에서 거둔 사람 · 까닭을 보고, 아직 쓰는 출처면 `register`, 정말 거둘 것이면 `withdraw` 를 다시 한다. 쓴 시각이 앞선(시계가 빠른) 기기의 거두기 · 등록이면 그 시각이 지나기 전까지는 다시 해도 밀릴 수 있다. 그때는 그 기기를 쓴 사람과 맞춘다.
- 내용 고치기: 같은 분야 · `review_id` · 운동/드릴 번호 · 쓴 곳 · 링크로 고친 글을 다시 `register` 하면 같은 쓰임에 새 고침이 겹친다(쓴 시각 차례). 실제로 겹치는 규칙:
  - 뺀 옵션 · 빈 값은 앞의 값을 지우지 않는다. `--application` · `--limits` · `--item-name` · `--purpose-note` 는 새 글을 주면 바뀌고, 빼면 앞의 글이 남는다. 한계 글은 고친 글로 바꿀 수 있지만 비울 수는 없다.
  - `--reading` 을 빼면(`unknown`) 앞의 읽은 범위가 그대로 남는다. 올려 적은 범위를 고치려면 실제로 아는 낮은 단계를 직접 적고(`--reading metadata-only` · `abstract` · `partial`) `--limits` 도 고친 글로 바꿔 다시 `register` 한다. 읽은 범위를 다시 '모름'으로 되돌리는 길은 없다.
  - 확인일(`--consulted`)은 늦은 쪽으로만 간다. 더 이른 날을 보내면 '처음 확인'으로만 남고 최근 확인일은 그대로다.
  - 거두고 같은 쓰임을 다시 등록해도 앞의 값이 모두 함께 되살아난다(처음부터 다시 쓰는 것이 아니다).
  - 기록(op)을 그 자리에서 지우거나 고치는 길은 없다. 위 규칙으로 바로잡을 수 없는 잘못(예: 읽은 범위를 '모름'으로 되돌려야 함 · 한계 글을 없애야 함)은 등록을 거듭해 덮으려 하지 말고 담당 GPT 에 알린다.
  - 그 값들 자체가 틀렸으면(다른 검수 번호 · 다른 링크 · 다른 쓴 곳) 옛 쓰임을 거두고 바른 값으로 새로 등록한다.

## 12. 시험(가짜 서버 · 시험 저장소)

- 시험은 늘 새 임시 상태 폴더로 한다: `REVIEW_EVIDENCE_STATE_DIR="$(mktemp -d)" node "$R" …`. 실제 상태 폴더에서 내 컴퓨터 주소로 로그인하거나 `--fixture-ok` 를 쓰지 않는다.
- `--fixture-ok` 는 내 컴퓨터 주소(`http://127.0.0.1:포트` 등)로 로그인한 시험에서만 받는다. 시험 저장소(`local-fixture`)에 들어가면 `fixture-saved` · `fixture-already-withdrawn` · `fixture-audited`, 끝 번호 5 이고 `central: false` 다. 밀림도 시험 이름(`superseded-fixture`)으로 남는다. 그 받음표는 `fixture-receipts/` 에만 남고 검수 기록의 등록이 아니다. `--fixture-ok` 없이 시험 저장소에 보내면 `fixture-only`(끝 번호 4)로 대기에 남는다.
- 중앙 저장소를 쓰는 내 컴퓨터 미리보기에 시험 등록을 보내지 않는다(그 서버가 `central` 이라고 답하면 `--fixture-ok` 는 아무것도 보내지 않고 64 로 멈추지만, 확인을 못 하면 보낸다).
- 시험에서 기기 승인 `login` 을 하지 않는다(그 서버에 로그인 코드가 만들어진다). 가짜 서버에는 `--session-stdin` 을 쓴다.
- 도구 자체 시험: `node scripts/review-evidence-registrar-selftest.mjs`(가짜 서버 · 가짜 NCBI · 임시 상태 폴더). 운영 연결 끝-끝 시험: `node --import ./scripts/alias-register.mjs scripts/review-evidence-ops-selftest.mts`(진짜 API 처리 + 시험 저장소, 127.0.0.1 만).

## 13. 문제가 생기면

| 나타나는 것 | 뜻 | 할 일 |
| --- | --- | --- |
| audit `server-too-old`(4) | 서버 목록 판이 2 밑. R2 서버 코드가 아직 운영에 없음 | 출시를 기다린다. 빠진 등록으로 보지 않는다 |
| audit `invalid`(3) '--records 파일을 읽지 못했거나 …' | 경로가 지금 폴더 기준으로 틀렸거나 JSON 이 아님 | 8절처럼 그 checkout 의 기록 절대 경로로 다시 |
| 메시지 '서버 저장소가 목록 v2(list-v2)를 지원하지 않아 …' | 운영 저장소 준비 조건 미충족. 다시 해도 풀리지 않음 | 대기로 두고 출시 담당에게 알린다 |
| `unavailable` · `error` 가 `unavailable` · `http_5xx` · `pending` | 저장소에 잠시 닿지 못했거나 목록이 중간에 어긋남 | 대기로 두고 조금 뒤 `retry` 한 번 |
| `unauthenticated`(401) · `no-session` | 로그인이 풀렸거나 없음 | `login` 을 다시 하고 `retry`. 대기는 남아 있다 |
| `session-unreadable`(4) | 저장한 세션 파일이 깨졌거나 바로가기. 아무것도 보내거나 대기열에 넣지 않음 | `logout` 뒤 `login`(바로가기면 상태 폴더의 `session.json` 을 지운 뒤 `login`). 세션 값을 손으로 고치지 않는다 |
| `forbidden`(403) | 대표관리자 계정이 아님 | 등록하지 못한다. 계정 권한은 이 절차로 바꾸지 않는다 |
| `redirect` | `--base` 가 다른 주소로 넘기는 주소 | 출시 담당이 알린 정식 주소로 다시 `login` |
| `base-mismatch` | 다른 주소에서 만든 대기. 로그인 전 `--base` 없이 넣은 대기는 로그인 뒤 `retry` 나 같은 내용 `register` 때 로그인한 주소를 따르므로 여기에 들지 않는다 | 그 주소로 로그인해 `retry` 하거나 `discard` |
| `busy` · `locked` | 다른 `retry` 나 등록이 대기열을 쓰는 중 | 끝난 뒤 다시. 멈춘 지 오래된 자물쇠는 도구가 버린다 |
| `fixture-only` | 서버가 시험 저장소에 저장했다고 답함 | 등록이 아니다. 중앙 주소로 다시 |
| `unconfirmed` | 서버가 저장했지만 목록에서 보이는지 확인하지 못함 | 등록으로 적지 않고 `retry` |
| `superseded`(2, 또는 retry 결과) | 그 쓰임에 더 새 상태(늦은 거두기 · 늦은 등록)가 있어 적용되지 않음 | 11절 |
| `already-withdrawn` · `applied: false` | 다른 거두기가 먼저 효력을 냄. 거둔 상태는 맞음 | 거둠 표시를 그대로 둔다 |
| retry 결과 `gone` | 다른 프로세스가 그새 그 대기를 처리함 | `pending` 으로 확인하고 audit 으로 본다 |
| `invalid` 의 `issues[].field` 가 `[키:…]` 를 포함 | `--json` 에 서버가 받지 않는 칸이 있음(칸 이름은 가림) | 4절 값 이름만 쓴다 |

## 14. 확인하지 못한 것

- 운영 서버 · 운영 저장소에서의 목록 v2 · 새 받음표 칸, 실제 기기 승인 `login`, 출시 뒤 첫 실제 등록과 다시 읽기(2절 1~4번).
- 두 번째 맥에서의 실제 사용, 김민 계정 · 김민 맥에서의 사용, 김민 기록의 audit 가능한 모양.
- `--lookup-ncbi` 의 실제 NCBI 응답(이 문서를 쓰며 실행하지 않았다).
- 이 문서의 명령 · 끝 번호 · 칸은 2026-11-20 R2 최종 후보 도구로 실행해 확인했다. 서버에 닿지 않는 범위(쓰는 법 · `--help` · 로그인 없는 `status` · 대기 · `pending` · `retry` · `discard` · 기록 경로 · 기록 모양 검사 · `check-url` · 깨진 세션 파일)와, 내 컴퓨터 가짜 시험 서버(진짜 API 처리 코드 + 임시 폴더, 저장소 이름만 `central` 로 흉내 냄, 127.0.0.1 만)에서의 `login --session-stdin` · `status` · `register` · 같은 등록 다시 · `withdraw` · 같은 맥 되살리기 · 상태 폴더 둘(두 맥 흉내)의 거두기 뒤 되살리기 · 밀림(2) · retry 의 `already-withdrawn` · `superseded` · audit(`complete` · `missing` · `withdrawnOnly` · `schemeless` · `ambiguous_in_text` · 붙여 쓴 링크 · `outside_records` · 안에 든 비공개 링크 · 버린 대기의 링크 · 링크 없는 버림 표시)이다. 그 가짜 서버의 출력은 중앙 등록이 아니고, 한 컴퓨터 안 상태 폴더 둘은 두 번째 맥 확인이 아니다. 운영 서버에는 닿지 않았다.
