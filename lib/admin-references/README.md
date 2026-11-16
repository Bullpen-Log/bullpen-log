# 참고자료(관리자 전용) — 저장 형식 v1 (EX-REF02)

대표관리자(`role === 'ADMIN'`)만 보는 비공개 훈련 자료 목록이다. 화면은 `/admin/references`, 한 건은 `/admin/references/<id>`.

**이 저장소는 공개다.** 원문 · 옮긴 글 · 요약 · 원본 파일 경로 · 비공개 목록 JSON 을 여기(코드 · 시험 · `public/` · 문서)에 넣지 않는다.
내용은 비공개 버킷에만 둔다. 시험은 지어낸 값만 쓴다(`scripts/admin-references-selftest.mts`).

## 어디에

| 무엇 | 자리(버킷 `pitch-videos`) |
| --- | --- |
| 목록 | `admin-references/v1/catalog.json` (8 MB 까지) |
| 한 건 | `admin-references/v1/entries/<id>.json` (16 MB 까지, 열쇠는 목록의 `detailKey` 만) |
| 원본 파일 | **버킷 `external-intake`** 의 `admin-references/v1/assets/<불투명 이름>[.확장자]` (`application/octet-stream` 으로 올림) |

버킷 설정 · 정책은 바꾸지 않는다. 원본의 실제 형식은 한 건 JSON 의 `asset.mime` 이 정한다(PDF · m4a · mp3 · jpeg · png 만).

**참고 영상 원본은 우리 서버에 두지 않는다**(EX-REF03, 2026-11-16 사용자). 영상 형식 `asset.mime`, 영상 파일 이름의 열쇠(.mp4 · .mov · .webm 등),
영상 자료(`kind: "video"`)의 `asset` 은 모두 한 건 전체를 거절한다. 영상은 한 건의 `externalVideo` 링크로 원래 올라온 곳에서 연다.

내 컴퓨터에서만 미리 볼 때: 서버 환경변수 `ADMIN_REFERENCES_LOCAL_DIR` 에 폴더를 주면, 운영이 아닐 때(`NODE_ENV !== 'production'`)
그 폴더에서 `catalog.json` · `entries/<id>.json` · `assets/<이름>` 을 읽는다. 폴더 밖 열쇠는 거절한다. 그 폴더는 저장소 · 배포물에 넣지 않는다.

## 목록 `catalog.json`

```jsonc
{
  "schemaVersion": 1,
  "title": "묶음 이름",
  "updatedAt": "2026-11-16T00:00:00Z",
  "entries": [
    {
      "id": "ref_abc123",                 // 영문 · 숫자 · _ · - 6~80자, 겹치면 목록 전체 거절
      "title": "자료 제목",
      "collection": "묶음",
      "kind": "document",                 // document | video | research
      "language": "en",
      "categories": ["strength"],         // strength power mobility pitching recovery programming assessment sources
      "availability": "pending",          // 영문 소문자 낱말(화면은 한국어 이름, 모르면 '상태 미정')
      "rights": "pending",                // private-summary | licensed-private | pending
      "sha256": "<64자 hex>",
      "bytes": 123,
      "pageCount": 40,                    // 문서면, 모르면 빼기
      "durationSeconds": 600,             // 영상이면, 모르면 빼기
      "coverage": {                       // 실제로 확인한 범위만(목록에 있다고 읽은 것이 아니다)
        "textPages": [1, 2, 3],           // 1..pageCount
        "visualPages": [4],
        "videoIntervals": [[0, 120]],     // 0..durationSeconds, 시작 < 끝. 겹쳐도 한 번만 센다
        "audioIntervals": []
      },
      "reviewStatus": "partial",
      "topics": ["주제"],                  // 선택, 40개까지
      "searchText": "찾기에만 쓰는 글",      // 선택, 화면으로 보내지 않는다
      "detailKey": "admin-references/v1/entries/ref_abc123.json"  // 서버만
    }
  ],
  "bibliography": [                       // 선택 — 예전 운동 검수에서 적은 공개 출처(별도 묶음으로 보인다)
    { "id": "b1", "url": "https://doi.org/…", "kind": "research", "title": null, "publisher": null,
      "authors": null, "year": null, "doi": null, "metadataStatus": "pending",
      "uses": [{ "reviewId": "…", "exercise": "운동 이름", "note": "메모" }] }   // 그 밖의 칸(기록 파일 경로 등)은 읽지 않는다
  ]
}
```

## 한 건 `entries/<id>.json`

```jsonc
{
  "schemaVersion": 1,                     // 선택
  "id": "ref_abc123", "kind": "document", // 목록과 같아야 한다
  "title": "…", "collection": "…",
  "digestKo": "쉬운 말 요약",
  "sections": [{ "id": "s1", "title": "…", "kind": "translation",  // translation | note | table | limitation
                 "sourcePages": [3], "startSeconds": 62, "endSeconds": 220,
                 "textKo": "…", "table": { "columns": ["…"], "rows": [["…"]] } }],   // kind table 이면 table 필수, 칸 수 같아야
  "glossary": [{ "en": "…", "ko": "…", "meaning": "…" }],
  "claims": [{ "id": "c1", "originalClaimKo": "…", "sourcePages": [3], "sourceSeconds": [62],
               "decision": "qualify",     // retain | qualify | update | insufficient
               "interpretationKo": "…",
               "evidence": [{ "title": "…", "url": "https://…", "doi": "…", "year": 2020,
                              "population": "…", "methods": "…", "sample": "…", "outcome": "…",
                              "limitations": "…", "applicability": "direct" }] }],   // direct | inferred
  "limitationsKo": ["…"],
  "asset": { "key": "admin-references/v1/assets/ref_abc123.pdf", "mime": "application/pdf",
             "filename": "…", "rightsConfirmed": true },   // 선택. 열쇠는 external-intake 버킷 안. 영상 자료에는 두지 않는다
  "externalVideo": { "url": "https://www.youtube.com/watch?v=<11자>", "title": "…", "author": "…",
                     "checkedAt": "2026-11-16T00:00:00Z" }  // 선택, 영상 자료만(아니면 거절). 없거나 null 이면 '원본 링크 확인 중'
}
```

## 지키는 것

- 읽기 순서: 로그인 · 대표관리자 확인(`requireAdmin`, 준관리자 · 일반 · 비로그인은 저장소를 묻기 전에 막힘) → 로더가 한 번 더 확인
  (`lib/admin-references/load.ts`) → 번호 모양 → 목록 → 목록에 적힌 열쇠로만 한 건.
- 모양이 틀리면 보여 주지 않는다. 화면에는 까닭 종류(없음 · 못 읽음 · 너무 큼 · 모양 틀림)와 '다시 시도'만, 경로 · 값은 쓰지 않는다.
- 글은 모두 React 가 글자로 그린다(HTML 로 읽지 않음). 주소는 http(s) 만, 서버가 그 주소를 읽지 않는다.
- 원본 파일: `GET /api/admin/references/<id>/original`(대표관리자만 — 로그인 안 함 401 · 일반 · 준관리자 403, 저장소를 묻기 전에).
  여는 조건은 둘 다: 목록의 `rights === 'licensed-private'` 그리고 한 건의 `asset.rightsConfirmed === true`. 아니면 404 이고 원본 저장소를 묻지 않는다.
  열쇠는 주소가 아니라 목록 → 한 건 → `asset.key` 에서만 온다. 서버가 요청마다 60초 서명 주소를 만들어 그 자리에서 받고 버린다(응답 · 화면 · 캐시에 없음).
  응답: `Content-Type` = `asset.mime`, `Cache-Control: private, no-store`, `nosniff`, `Accept-Ranges: bytes`.
  Range 는 한 구간(`bytes=a-b` · `a-` · `-n`)만, 한 번에 4 MB 까지로 줄여 넘긴다(영상 · PDF 보기는 다음 구간을 다시 청한다). 여러 구간 · 틀린 모양은 무시하고 처음부터.
  화면의 원본 상태(목록 `kind` · `rights`, 한 건 `asset` 으로만 정함, 저장소는 따로 묻지 않음). 영상 자료는 아래 대신 '원본 영상 보기' 링크(아래 절):
  `private-summary` → 옮긴 글 · 해설 · 요약은 비공개로 보이고(전체를 옮긴 자료일 수도 있음) 원본 파일은 제공하지 않음 · `pending`(또는 허락 자료인데 `asset.rightsConfirmed` 가 true 아님) → 허락 확인 중 ·
  `licensed-private` + `asset` 없음 → 허락은 됐지만 파일 연결 전 · `licensed-private` + `rightsConfirmed: true` → '원본 열기'.
  열 수 있을 때 쪽 · 시각 표시는 원본을 여는 링크가 되고 `#page=` · `#t=` 를 붙이지만, 그 자리로 가는지는 브라우저 · 앱의 보기 프로그램에 따른다.
- 페이지는 요청마다 새로 읽는다(쿠키를 읽어 늘 동적, `connection()`), 받은 글을 서버에 기억해 두지 않는다.

## 원본 영상 링크 `externalVideo` (EX-REF03)

- 영상 자료만. 모양 `{ url, title, author, checkedAt }` 또는 없음/null. 없는 옛 JSON 은 그대로 읽힌다.
- 지금은 YouTube 만: `https://www.youtube.com/watch?v=<11자>`(호스트 `www.youtube.com` · `youtube.com` · `m.youtube.com`, 쿼리는 `v` 하나뿐) 또는
  `https://youtu.be/<11자>`(쿼리 없음). 저장할 때 `https://www.youtube.com/watch?v=<id>` 로 바꾼다.
  계정 · 포트(:443 포함) · `#` · 다른 쿼리(공유 토큰 `si` · 재생목록 · 시각 · 돌려보내기 값) · 다른 호스트(닮은 이름 · IP · localhost ·
  영상 파일 주소) · http · javascript: · data: 는 한 건 전체 거절. 다른 사이트가 필요하면 GPT 와 정한 뒤 더한다.
- 서버는 이 주소를 읽지 않는다. 화면은 '원본 영상 보기'(새 창, noopener noreferrer) 링크와 제목 · 올린 사람 · 링크 확인 날짜만 보인다.
  플레이어 · iframe · 썸네일 · 내려받기 · 원본 통로 없음. 링크가 연결된 것은 영상 · 음성을 다 확인했다는 뜻이 아니다(확인한 범위는 목록의 `coverage` 그대로).
- 원본 통로(`/api/admin/references/<id>/original`)는 목록의 `kind` 가 `video` 면 한 건도 읽지 않고 404 다.
