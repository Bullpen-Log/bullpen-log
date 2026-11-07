# 외부 투구 영상 접수 — 요구 · 구현 · 검증 대조표

2026-11-07 기준(원본 보유 결정 반영). 코드는 **커밋 · 푸시 · 배포 전**이다. 마이그레이션 · 버킷 · 환경변수도 **아직 안 넣었다**. 구현 결정은 `external-intake.md`.
비밀 값 · 실제 초대 주소는 여기에 적지 않는다.

## 상태 뜻
- **DONE**: 구현했고 아래 근거로 돌려 봤다.
- **UNVERIFIED (physical)**: 구현은 있지만 실기기 · 실제 원본 영상 · 실제 Supabase · 실제 GPU 가 있어야 말할 수 있다. 근거 칸에 돌려 본 범위까지만 적었다.
- **NOT DONE**: 안 했다. 까닭을 적었다.
- **범위 제외**: 사람이 안 하기로 정했다. 못 끝낸 일이 아니다.

## 돌린 시험(2026-11-07, 보유 기간 작업을 마친 코드로 다시 돌린 값)
| 시험 | 결과 | 끝 코드 |
|---|---|---|
| `npx tsc --noEmit -p .`(`NODE_OPTIONS=--max-old-space-size=8192`, 기본 힙은 메모리 부족으로 134) | 오류 0 | 0 |
| `npx eslint`(접수 코드 · 시험 · 고친 기존 파일) | 오류 0 | 0 |
| `npm run intake:test` | 349 통과 | 0 |
| `npm run intake:db-test` | 547 통과 | 0 |
| `npm run intake:admin-test` | 540 통과 | 0 |
| `npm run intake:transfer-test` | 130 통과 | 0 |
| `npm run intake:public-test` | 132 통과. 전체를 잇달아 돌린 한 번은 `finalize` 의 Prisma 오류로 끝 코드 1이었고, 다시 돌린 두 번은 모두 통과했다. 같은 때 다른 시험에서 PGlite 트랜잭션 5초 초과(P2028)를 본 적이 있어 부하 탓으로 짐작하지만, 그 한 번의 코드는 로그에 안 남았다 | 0 |
| `npm run intake:analysis-test` | 391 통과 | 0 |
| `detail.selftest.mts`(접수 상세 화면) | 111 통과 | 0 |
| `npm run release-access:test` | 723 통과 | 0 |
| `npm run release-gate:test` | 102 통과 | 0 |
| `npm run pitch-lab:test` | 19 통과 | 0 |
| `npm run analysis-consent:test` | 통과 | 0 |
| `npm run integration:test` | **46 통과 · 5 실패** | **1** |
| 격리 브라우저 · 공개 흐름(아래) | 58 통과. **보유 기간 작업 전 코드 기준이고 다시 안 돌렸다** | 0 |
| 격리 브라우저 · 관리 흐름(아래) | 46 통과. **보유 기간 작업 전 코드 기준이고 다시 안 돌렸다** | 0 |
| 고침 되돌려 보기(아래) | 앞 묶음 25개 · 재확인 묶음 13개 · 보유 기간 8개 모두 시험이 잡음 | - |

**integration 5 실패**: 모두 접수와 무관하고 접수 전부터 있던 것이다. HEAD(`ace42bb1`)를 `git archive` 로 임시 폴더에 풀어 같은 시험을 돌린 결과(44 통과 · 5 실패)와, 읽은 개수 표시를 뺀 실패 줄 다섯이 글자까지 같다. 이름은 다음과 같다.
- 앱 팀 · 레슨장 권한(coachOrg · myMember)이 로그인을 본다
- app/actions 의 export 함수는 모두 로그인 확인을 거친다(app-lesson · app-org · app-team · lessons · org-* · venues)
- API 경로도 로그인 확인(`app/api/release-stage/route.ts`)
- 서버 액션 파일이 모두 허용 목록에 있다(admin-candidates · admin-coaches · game-comments)
- 앱에서 폰 영상을 바로 지우는 곳은 정해 둔 곳뿐이다(`native/src/compare/store.ts`)

접수 이름은 이제 이 목록에 없다. 시험에 예외를 까닭과 함께 넣었고, 빠진 만큼을 새 시험 둘로 본다: `intake-admin.ts` 의 `asAdmin` 이 `requirePermission('intake')` 로 막는지, 공개 경로가 모두 토큰을 보는 처리기만 내보내는지. 그래서 통과 수가 44에서 46으로 늘었다. 크론은 `CRON_SECRET`, `intake-admin` 은 앱 RPC 입구 밖(release-access:test 가 지킨다)이 예외의 까닭이다.

**격리 브라우저 시험의 조건**: 헤드리스 크로미움(Playwright 판, 데스크톱 엔진. 아이폰 사파리가 아니다)을 CDP 로 몰았다. 앱은 저장소 복사본의 `next dev`(3101 · 3010), DB 는 PGlite, 공개 흐름의 저장소는 TUS 까지 흉내 낸 가짜 서버다. 운영 DB · 버킷에는 닿지 않았고 끝난 뒤 서버를 모두 내렸다. 3000번은 그대로 켜 두었고 `/submit` 이 200 인 것만 봤다. 영상은 머리만 진짜인 합성 파일(20MB · 14MB)이다. 시험대는 임시 폴더에 두었고 저장소에 안 넣었다.
복사본에서만 바꾼 것: PGlite 소켓이 연결 하나를 독점해서 Prisma 연결 수를 1로 줄였다. 관리 흐름은 시드 자료와 시험용 로그인 경로를 썼다. 앱 코드는 그대로다. 관리 시드는 prisma 명령 없이 저장소의 마이그레이션 SQL 을 차례로 깔아 만들었다. 감사 기록 표시에 메모를 보이는 한 줄(`page.tsx` `detailText`)은 tsc · eslint 까지만 봤다: 이번에도 메모를 적은 철회는 안 눌렀다.
이번에 더한 장면: 공개는 '누가 보내나요'를 안 고르면 막힘 · 대리 동의 글 · 동의 줄의 관계 · 고침에서 관계를 바꾸면 동의를 비워 다시 받음 · 이름이 지워진 초안이 끝내기까지 가는 길. 관리는 폐기 · 철회된 접수의 모델 동의 철회 기록과 MKV 막힘 까닭 글.
마지막 재실행에서 더한 관리 장면 29개: 잠김 칩 · 초대 칸 글 · 풀기 확인 · 풀고 나서 칩과 단추가 사라짐 · 새로 열어도 그대로 · DB 횟수 0 과 감사 줄, 한도가 찼는데 잠금 시각이 없는 자리의 칩과 풀기, 3번만 틀린 초대에는 칩이 없음. 동의 132줄 접수의 '더 있음'(보임 102 · 줄임 30), 줄인 뒤에도 오래된 필수 동의로 판단함, 그 접수에서 철회를 적으면 동의 65줄만 거둠, 4줄 접수에는 그 줄이 없음. 철회 기록 단추는 동의 뒤 거부 · 거부만 · 다른 관계의 거부에서 안 보이고, 거부 뒤 동의에서만 보이며 눌러도 거부 줄은 그대로다.

**고침 되돌려 보기**: 이번 고침 25곳을 복사본에서 하나씩 되돌리고 해당 시험을 돌렸다. 25곳 모두 끝 코드가 0 이 아니었다. 화면 쪽 고침(`intake-flow.tsx` · `status-steps.tsx`)은 이 방법에 안 들어갔고 격리 브라우저로 봤다.

**재확인 고침의 되돌려 보기**: 아래 '독립 재확인 뒤 고친 것'의 13곳을 하나씩 되돌리고 해당 시험을 돌렸다. 13곳 모두 끝 코드가 0 이 아니었고, 실패 줄이 그 고침의 시험이었다. 이 묶음의 화면 줄(결과 보기 잠김 칩 조건 · '더 있음' 줄)은 되돌려 보기에는 없고, 격리 브라우저 관리 흐름으로 봤다.

## 원본 보유 기간 결정 뒤 고친 것(2026-11-07)
규칙과 판단은 `external-intake.md` '원본 보유 기간'. 모두 PGlite · 가짜 저장소 · 가짜 GPU 시험까지만 봤다.
**되돌려 보기**: 고친 곳 8개를 복사본 없이 잠깐 되돌렸다가 복원했다(남은 파일 확인 · 고침 기다림 · 분석 기다림 · 미리보기 지우기 · 철회가 시계를 늦춤 · 다시 낸 날 · 지운 파일 재사용 · 지울 날 분석 막기). 8개 모두 끝 코드가 1이었고 그 고침의 시험이 실패했다.
**동의 판**: 제출 · 모델 문서의 판이 올랐다. 공유 DB 에 넣기 전이라 옛 판 동의는 시험 자료뿐이다.

## 독립 재확인 뒤 고친 것
남았다고 확인된 아홉 건이다. 모두 PGlite · 가짜 저장소 · 가짜 GPU 시험까지만 봤다.
- **#5 끝을 못 적은 마지막 자리**: `lockAbandonedSeat`. 자리를 잡을 때 `updatedAt` 을 적고, 한도가 찼는데 잠기지 않은 채 2분(`ACCESS_CODE_HOLD_STALE_MS`)이 지나면 잠금으로 마무리한다. 그 안에는 살아 있는 시도일 수 있어 앞지르지 않는다. 관리자는 시간과 상관없이 풀 수 있다(`accessCodeNeedsReset`). 앞 자리에서 함수가 죽으면 횟수만 하나 늘고 감사 줄은 없는 것은 그대로다.
- **#6 동의 줄 총량**: `consentDecisionRows`(종류 · 관계 · 답 · 철회 여부마다 가장 새 줄, 많아야 48줄)를 공개 상태 · 동의 판단 · 분석 관문이 읽는다. 쌓인 줄 전부로 낸 답과 같은지 400줄 시험으로 본다. 상세는 최근 100줄과 판단에 드는 줄만 싣고 '더 있음'을 보인다. **표의 줄 수 자체에는 상한이 없다**: 쓰기는 초대별 제한(10분에 20번)으로만 묶인다.
- **#8 거부한 사람의 철회**: `modelConsentOpen` 은 마지막 답이 동의일 때만 켜진다. 관리자 기록과 받는 사람 길 모두 `granted: true` 줄만 거두고, 거부 줄만 있으면 기록을 안 남긴다.
- **#12 고침을 거둔 뒤의 동의**: `latestConsents(rows, relation)` 이 지금 관계의 줄을 찾는다. 다른 관계의 새 동의가 앞선 동의를 가리지 않고, 다른 관계로 낸 거부 · 철회는 그대로 이긴다.
- **#12 판의 동의 기록**: `consentSnapshot` 에 `relation` 을 넣고 지금 관계의 답만 얼린다. 옛 관계의 답은 줄째 빠진다.
- **#14 풀 수 없는 경고**: `verifyTargetIds`(지금 판과 칸의 파일)를 `jobIssuesOf` · `jobStillLive` · `adminRequeueVerification` 이 같이 쓴다. 옛 판에만 있는 파일의 멈춘 검증은 경고로 안 보이고 크론도 안 건다. 판은 앞으로만 가서 그 파일을 기다리는 일이 없다. 그 자산은 '확인 중' 상태로 남고 옛 판은 'pending' 으로 남는다.
- **#31 고침 중에 끝난 실행**: 끝을 적을 때는 낸 손으로 견준다(`submittedHandOf`, 고침이 열려 있으면 `handBefore`). 화면 · 공개의 판단은 그대로 접수 칸의 손까지 본다. 재확인에 없던 같은 뿌리의 길도 막았다: 도는 동안 관리자가 손을 바꾸면 입력이 달라 상태가 '대기'에 남던 것이다. 지금 입력이 아니고 도는 실행이 더 없으면 'ready' 로 돌린다(분석 흐름에 `queued · running → ready` 를 더했다).
- **#31 잇기가 빠지는 길**: `cancelCorrection` 이 'verified' 로 돌아갈 때 같은 트랜잭션에서 `carryInTx` 를 부른다.
- **#31 공개 뒤 남는 안내**: `publishedCurrent` 를 `runMatchesCurrent` 로 셈한다. 이름만 고친 판에는 안내가 안 붙고, 영상 · 손을 고친 판에는 붙는다.
- **시험 판 고침**: `detail.selftest.mts` 가 앞 묶음에서 더한 `withdrawIntakeModelConsent` 를 가짜 동작 표에 안 넣어 읽기 단계에서 끝 코드 1 로 죽어 있었다. 표에 더해 다시 돈다(94 통과). 그동안 이 시험을 근거로 적은 칸(#21)은 앞 판 기준이었다.

## 이 단계에서 고친 것
- **전송 확인이 119초 멈춤(실제 버그, 고침)**: `lib/intake/storage-core.ts`. Next 의 fetch 는 signal 없는 GET 응답을 둘로 갈라(`dedupe-fetch`) 한 갈래를 쥐고 있다. 그래서 `res.body.cancel()` 이 가비지 수집까지 안 끝났다. 전체 해시 때는 안 읽는 갈래에 파일 전체가 쌓일 수 있었다. 서버 안 GET 에 늘 signal · `cache: 'no-store'` 를 준다. 가짜 fetch 를 쓴 단위 시험으로는 안 보였고 브라우저 흐름에서 처음 드러났다. 회귀: `intake:transfer-test` 가 Next 의 그 함수를 그대로 끼워 본다(고침을 되돌리면 '멈춤: 크기 확인'으로 실패하는 것 확인, 끝 코드 1).
- **tsc 오류 9개(고침)**: `scripts/intake-admin-selftest.mts` 의 `registerHooks` 타입 · BigInt 글자.

---

## 제품 경험
| 요구 | 구현 | 검증 | 상태 |
|---|---|---|---|
| 앱 · 계정 없이 비공개 링크로 시작 | `app/(intake)/submit/page.tsx` · `layout.tsx` | 브라우저 공개 흐름 | DONE |
| 환영 → 이름 → 옆 → 뒤 → 검토 · 동의 → 올리기 → 영수증 → 상태 · 결과 | `components/intake/intake-flow.tsx` · `guided-steps.tsx` · `send-step.tsx` · `status-steps.tsx` | 브라우저 공개 흐름 끝까지 | DONE |
| 한 화면 한 질문 · 큰 주요 단추 · 우리 디자인 | `components/intake/shell.tsx`(`Screen`) | 브라우저 390 · 320 · 1440 | DONE |

## 저장소 · 기존 기능
| 요구 | 구현 | 검증 | 상태 |
|---|---|---|---|
| 기존 코드 조사 · 결정 기록 | `external-intake.md` | 문서 | DONE |
| 개인 영상 · 마커 샘플 권한 유지 | 기존 소유권 코드 안 고침. `lib/pitch-lab-file.ts` 는 export 만 늘림 | `pitch-lab:test` · `release-access:test` | DONE |
| 다른 작업의 미완료 변경 보존 | 고치지 않음 | `git status` | DONE |
| 3000번 로컬 동작 확인 | `/submit` | 휴대폰 UA 로 200 확인. **API 는 3000 에서 안 불렀다**(그 서버의 DB 가 운영이고 표가 아직 없다). 격리 3101 에서 돌림 | UNVERIFIED (physical) |
| 운영 배포는 별도 승인 | 안 함 | - | DONE |

## DB 안전
| 요구 | 구현 | 검증 | 상태 |
|---|---|---|---|
| 금지 명령 안 씀 · 더하기만 | 마이그레이션 `20261106120000_external_intake`(표 12개, 기존 표 변경 없음) | PGlite 에 그대로 깔아 `intake:db-test` | DONE |
| 백업 · 조율 규칙 | HANDOFF 에 절차 기록 | 공유 DB 에 **미적용** | NOT DONE(사람 허가 필요) |
| 실제 사용자 자료 안 건드림 | 시험은 모두 PGlite · 가짜 | 시험 코드 | DONE |
| 비밀 · 초대 주소 안 적음 | 문서에 없음 | 이 문서 · `external-intake.md` | DONE |

## 공개 화면
| 요구 | 구현 | 검증 | 상태 |
|---|---|---|---|
| 독립 틀 · 메뉴 없음 | `app/(intake)/layout.tsx` | 브라우저 | DONE |
| 휴대폰 브라우저 막기에서 `/submit` 만 열기 | `proxy.ts` `OPEN` | 아이폰 UA 로 경로 유지 | DONE |
| 관리 경로는 로그인 | `/admin/intake`, `requirePermission('intake')` | 비로그인 307 · 일반 · 준관리자 차단(브라우저) · `intake:admin-test` | DONE |
| 초대는 자기 접수만 · 관리자 세션 아님 | `lib/intake/access.ts` · `public-api.ts`(로그인 안 읽음) | `intake:public-test` · `intake:db-test` | DONE |

## 1~7단계
| 요구 | 구현 | 검증 | 상태 |
|---|---|---|---|
| 1 제목 · 설명 · 시작하기 · 도움 둘 · 짝 설명 · 그림 | `guided-steps.tsx` `WelcomeStep` · `illustrations.tsx` | 브라우저 | DONE |
| 1 오른손 · 왼손 옆 카메라 자리 안내 | `guides.tsx` | 브라우저 | DONE |
| 2 이름 필수 · 다듬기 · 길이 · 다국어 | `NameStep` · `lib/intake/service.ts`(40자) | `intake:db-test` · 브라우저 | DONE |
| 2 같은 이름을 합치지 않음 | 접수마다 따로 | `intake:db-test` | DONE |
| 2 대리 제출 · 선수와 제출자 분리 | `submitterRelation` · `submitterName` | `intake:db-test` | DONE |
| 3 옆 영상 고르기 · 미리보기 · 파일 사실 · 다른 영상 · 계속 | `VideoStep` · `file-summary.tsx` · `pick.ts` | 브라우저(합성 파일) | DONE |
| 3 자동으로 안 넘어감 · 소리 자동 재생 없음 | `VideoStep` | 브라우저 · 코드 | DONE |
| 3 재생 안 돼도 파일을 안 버림 | `pick.ts` | 합성 파일(디코드 불가)로 브라우저 진행 | DONE |
| 4 같은 동작 · 같은 파일 감지 · 옆 선택 유지 | `pick.ts` `inspectPick` | 브라우저 | DONE |
| 5 이름 수정 · 파일 개별 교체 · 같은 투구 확인 · 고지 · 선택 정보 접기 | `ReviewStep` · `consent-block.tsx` | 브라우저(확인 · 동의 빠짐 막음) | DONE |
| 5 동의 전 바이트 없음 | `issueUploadToken` 이 동의 확인 | `intake:db-test` · `intake:public-test` | DONE |
| 2 · 5 보내는 사람 · 대리 동의 기록 | 검토 화면의 접지 않은 필수 질문, 동의 줄의 `relation` · `proxy`. 관계가 바뀌면 필수 동의를 다시 받는다 | `intake:db-test` · 브라우저 | DONE. **대리 권한 정책은 사람이 안 정했다**(아래) |
| 5 분석 동의와 모델 개발 동의 분리 | `lib/intake/consent.ts` | `intake:test` · `intake:db-test` | DONE |
| 5 받는 곳 · 보유 기간 · 나라 · 보호자 정책 지어내지 않음 | 정한 원본 보유 규칙은 글에 적고, 안 정한 것(분석 결과 보유 · PENDING)은 '확인 중'으로 표시. 만 14세 미만은 접수 막음 | `intake:test` | DONE |
| 5 관리자 동의로 대신 안 함 | 동의는 공개 경로만 | `intake:analysis-test`(동의 없으면 GPU 막힘) | DONE |
| 6 전체 · 파일별 진행 · 준비 · 전송 · 확인 단계 · 복구 글 | `send-step.tsx` · `use-send.ts` · `upload-run.ts` | 브라우저 | DONE |
| 6 전송 뒤 문구 | `send-step.tsx` | 코드 | DONE |
| 6 서버 등록 뒤에만 영수증 · 가짜 진행 없음 | `finalize` 응답으로만 영수증 | 브라우저 · `intake:public-test` | DONE |
| 7 영수증 · 링크 복사 · 알림 약속 없음 | `ReceiptStep` | 브라우저 | DONE |

## 다시 찾아온 경우
| 요구 | 구현 | 검증 | 상태 |
|---|---|---|---|
| 서버 상태 먼저 읽고 화면 고름 | `lib/intake/state.ts` `resolveScreen` | `intake:test` | DONE |
| 끝내지 않은 초안 복원 | 같은 함수 | `intake:test` · `intake:public-test` | DONE |
| 끊긴 전송 복구 제안 | `RecoveryStep` | 브라우저(보내다 새로고침 → 다시 고름 → 끝까지) | DONE |
| 접수 뒤 상태 | `ReceiptStep` | 브라우저 | DONE |
| 고침 요청은 말한 칸만 | `CorrectionStep` · `canEditField` · `canEditView` | 브라우저 · `intake:db-test` | DONE |
| 분석 중 · 검토 중 · 공개 | `status-steps.tsx` · `result-view.tsx` | 브라우저 | DONE |
| 올리기 기간 끝: 새 올리기만 막고 결과 접근은 따로 | `assertInvitationAllows` | 브라우저 · `intake:analysis-test` | DONE |
| 폐기: 이후 접근 막음 | 같은 함수 | 브라우저 · `intake:db-test` | DONE |

## 원본 처리
| 요구 | 구현 | 검증 | 상태 |
|---|---|---|---|
| 바이트 그대로 | `upload-client.ts`(줄이기 없음) | 브라우저: 저장 객체 SHA-256 = 고른 파일. `intake:transfer-test` | DONE |
| 기기 원본 여부와 무변경 전송을 구분 · 메타로 진위 주장 안 함 | `lib/intake/media.ts` `fpsLabel` · `integrityLabel` | `intake:test` | DONE |
| '240fps 감지' · '영상 정보 확인 필요' · '선택한 파일 그대로 전송됨'(검증 뒤) | 같은 파일 | 브라우저 · `intake:db-test` | DONE |
| 소수 fps · 가변 시간 · 방향 · 슬로모션 편집 목록 | `media.ts`(B 장면 앞머리 · 앞뒤 자름 · 늘림을 가른다) | `intake:test`(합성 머리). **실제 아이폰 슬로모션 파일로는 안 봄** | UNVERIFIED (physical) |
| 재생 길이를 촬영 길이로 안 읽음 | `timingNote` | `intake:test` · 관리 상세 표시(브라우저) | DONE |
| 아이폰 원본 고르기 안내 | `guides.tsx` | **메뉴 글을 지원 iOS 판에서 확인 안 함** | UNVERIFIED (physical) |
| HEVC · MOV 미리보기 실패해도 선택 유지 | `pick.ts` | 브라우저(합성). 실제 HEVC 는 안 봄 | UNVERIFIED (physical) |
| 미리보기는 올린 뒤 따로 만들고 원본을 안 바꿈 | `runPreviewPath` · `issueRunPreviewLink`(실패한 실행의 미리보기도 준다, 파일이 없으면 죽은 주소를 안 준다). 분석과 따로 도는 분석 전 미리보기는 만들지 않기로 정했다 | 원본을 안 바꾸는 것 · 실패한 실행의 미리보기는 `intake:admin-test`. 분석 전 관리자는 원본을 서명 주소로 재생하고, 브라우저가 못 풀면 파일 사실만 본다 | 범위 제외(2026-11-06 결정) |
| 일부 지문을 전체 SHA-256 으로 안 침 | `hashFileSha256` 전체 해시 | `intake:transfer-test` | DONE |

## 올리기 구조
| 요구 | 구현 | 검증 | 상태 |
|---|---|---|---|
| 비공개 저장소로 바로 · 재개 가능 · 서버 발급 좁은 토큰 | `upload-client.ts` · `storage-core.ts` · TUS 서명 끝점 | 가짜 TUS 로 `intake:transfer-test` · 브라우저. **실제 Supabase 로는 안 봄** | UNVERIFIED (physical) |
| Vercel 을 안 지남 | 브라우저 → 저장소 직접 | 브라우저(API 로그에 몸통 없음) | DONE |
| 1GiB · 2GiB 기본 · 관리자가 초대별로 조정 | `limits.ts` · `create-invitation.tsx` | `intake:test` · `intake:admin-test` | DONE |
| 프로젝트 · 버킷 한도 확인 | `pitch-videos` 500MB 확인, 새 버킷 스크립트 | **프로젝트 전체 한도 미확인, 새 버킷 미생성** | UNVERIFIED (physical) |
| 순서대로 · 메모리 한정 · 점진 해시 | `upload-run.ts` · `hashFileSha256` | `intake:transfer-test`(조각 크기 측정) · 서버 해시 tee 없음 회귀 | DONE |
| 재개 · 재선택 · 같은 파일 확인 · 복구 자료는 초대 · 접수 범위 | `matchesRecovery` · `recoveryKey` | `intake:transfer-test` · 브라우저 | DONE |
| 전송 만료와 초대 만료 구분 | `tokenTtlOf` · 토큰 새로 받기 | `intake:transfer-test` | DONE |
| 자격 정보 안 남김 | 로그는 오류 이름만 | `intake:public-test` | DONE |
| 실제 1GiB 파일 끝까지 | - | 34MB 까지만 돌림. 서버 해시가 300초 안에 끝나는지 모름 | UNVERIFIED (physical) |

## 상태 · 일관성
| 요구 | 구현 | 검증 | 상태 |
|---|---|---|---|
| 파일 · 접수 · 분석 · 공개 상태 분리 · 명시 전이 | `lib/intake/state.ts` | `intake:test` | DONE |
| 완료 멱등 · 두 번 눌림 · 응답 유실 | `finalizeSubmission` | `intake:db-test` · `intake:public-test` · 브라우저(세 번 눌러 자산 2 · 판 1) | DONE |
| 받은 원본 안 덮음 · 자산 불변 · 완료 때 짝 얼림 | `IntakeRevision` · 새 경로 · upsert 끔 | `intake:db-test` · `intake:transfer-test` · 브라우저 | DONE |
| 두 기기가 다른 칸 | `expectedAssetId` | `intake:db-test` · `intake:public-test` | DONE |
| 낡은 교체 · 완료 거절 | `version` · `stale_version` · `stale_selection` | `intake:db-test` · `intake:public-test` | DONE |
| 지속 작업: 등록 대사 · 검증 · 샘플 등록 · 분석 완료 · 임시 파일 정리 | `lib/intake/jobs.ts` · `job-handlers.ts` · `/api/cron/intake` | `intake:db-test` · `intake:analysis-test` · 브라우저(응답 뒤 검증 끝남). **Vercel 크론 실제 실행은 안 봄** | UNVERIFIED (physical) |
| 관리자가 화면을 닫아도 진행 | 같은 일감 | `intake:analysis-test` | DONE |

## 보안
| 요구 | 구현 | 검증 | 상태 |
|---|---|---|---|
| 고엔트로피 토큰 · 해시 저장 · 주소에 이름 없음 | `lib/intake/token.ts` | `intake:test` · 브라우저 | DONE |
| 작업마다 상태 · 범위 · 만료 · 한도 · 소유 확인 | `access.ts` · `service.ts` | `intake:db-test` · `intake:public-test` | DONE |
| 임의 경로 · 샘플 · 결과 번호 불가 | 서버가 경로 결정 | `intake:public-test` · `intake:analysis-test` | DONE |
| 원본 비공개 · service role 비노출 | 서명 주소 · 공개 키만 | `intake:transfer-test` · 코드 | DONE |
| 횟수 제한 · 파일 수 · 크기 · 실제 파일 확인 | `rate-limit.ts` · `limits.ts` · `verifyAsset` | `intake:db-test` · `intake:public-test` | DONE |
| 색인 금지 · 개인 미리보기 없음 | `layout.tsx` · `robots.ts` | 브라우저 흐름(메타 · 봇 GET) | DONE |
| 미리보기 GET 이 초대를 안 씀 | 화면은 서버 일을 안 함 | 봇 GET 뒤 접수 그대로(HTTP 시험) | DONE |
| 저장 금지 · Referer · 토큰 로깅 방지 | `PUBLIC_RESPONSE_HEADERS` · 주소 조각 토큰 | HTTP 시험 · 주소의 토큰 거절 | DONE |
| 결과 접근 코드 · 링크를 가진 사람 모두 볼 수 있다는 설명 | `verifyResultAccess`(6자 이상 · 시도 자리를 DB 가 먼저 셈 · 창 8번 · 누적 10번 잠금 · 틀린 시도 감사 기록 · 맞는 코드는 안 셈) · 영수증 글 | 라우트까지 `intake:analysis-test`, 동시 30번 `intake:db-test`. PGlite 는 연결이 하나라 진짜 동시 경합은 운영 Postgres 로 안 봤다 | DONE |
| 폐기는 새 허가 · 완료를 막고 낸 주소를 즉시 거둔다고 안 말함 | `detail-client.tsx` 글 · `READ_URL_TTL_SEC` | `intake:db-test` · `external-intake.md` 잔여 유효 시간 | DONE |

## 공동 관리
| 요구 | 구현 | 검증 | 상태 |
|---|---|---|---|
| '외부 영상 접수' 메뉴 · 기존 투구 · 타격과 구분 | `lib/nav.ts` · `admin/page.tsx` · `dev3d-client.tsx` | `release-access:test` | DONE |
| 두 대표관리자가 같은 접수 · 원본 복제 없음 | 사용자 폴더가 아닌 공용 표 · 버킷 | 브라우저(두 관리자, 같은 메모) | DONE |
| 만든 사람 역할에 안 묶임 | 권한은 `can(role, 'intake')` | `intake:admin-test` | DONE |
| 목록 칸 | `page.tsx` | 브라우저 | DONE |
| 찾기 · 거름 · 쪽 넘기기 | `intake-filters.tsx` · `admin.ts` | 브라우저(찾기) · `intake:admin-test` | DONE |
| 미리보기 · 파일 사실 · 개별 · 짝 내려받기 | `detail-client.tsx` · `issueOriginalLinks` | 브라우저(사실 표시) · `intake:admin-test`. **실제 파일을 내려받아 해시를 견주지는 않음** | UNVERIFIED (physical) |
| 받은 철회 기록(필수 · 모델) · 고침 거두기 · 기간 늘리기 · 다시 확인 · 접근 코드 막힘 풀기 · 멈춘 일감 보기 | `lib/intake/admin.ts` · `app/actions/intake-admin.ts` · `loadIntakeDetail().jobIssues` | 서버 동작 경로까지 `intake:admin-test`(진짜 lib/dal · 서비스). 철회 뒤 분석 · 공개 · 원본 막힘은 `intake:analysis-test` · `intake:admin-test`. 모델 동의 철회 기록 · 접근 코드 막힘 풀기는 브라우저로 눌렀다. **필수 동의 철회 · 고침 거두기 · 기간 늘리기 · 다시 확인은 브라우저로 안 눌렀다** | UNVERIFIED (physical) |
| 메모 · 담당 · 고침 요청 · 분석 · 공개 · 내리기 · 감사 기록 | `app/actions/intake-admin.ts` | 브라우저(메모) · `intake:admin-test`. 공개 · 내리기 단추는 브라우저로 안 눌렀고 같은 함수를 시험대가 불렀다 | DONE |
| 내려받기 이름 규칙 | `paths.ts` `downloadFileName` | `intake:test` · `intake:transfer-test`(한글) | DONE |
| 묶음 파일 | 안 만듦. 짝은 주소 두 개 | 명세가 '만든다면' 조건 | DONE |
| 읽음은 관리자별 · 공용 상태는 하나 | `IntakeAdminRead` | 브라우저(안 읽음 수 변화) · `intake:admin-test` | DONE |

## 분석 연결
| 요구 | 구현 | 검증 | 상태 |
|---|---|---|---|
| 검증된 접수 자동 등록 | `register_revision` · `analysisStatus 'ready'` | `intake:analysis-test` | DONE |
| GPU 는 관리자가 누름 | `startIntakeAnalysis` | `intake:analysis-test` | DONE |
| 어댑터 · 소유권 안 넓힘 · 관리자 흉내 없음 | `lib/intake/analysis.ts` | `intake:analysis-test` · `pitch-lab:test` | DONE |
| 같은 입력 중복 실행 막음 | `dedupeKey` 유일(두 원본 + 엔진 + 손). 글만 고친 판은 실행을 잇고, 손을 고친 판은 다른 입력이다(`runMatchesCurrent`) | `intake:analysis-test`(크론으로 잇기 · 손 고침 포함) | DONE |
| 실패 뒤 원본 · 실패 정보 유지 | `settleRun` | `intake:analysis-test` | DONE |
| 원본이 아닐 수 있는 파일의 시간 지표 | 파일 사실로 시간을 못 믿으면 시간 지표를 뺀다. 줌은 35mm 환산값으로 알리고 `lens: 'zoom'` 을 넘긴다. 못 읽었거나 60fps 안팎이면 그 한계를 관리자에게 알린다(`analysisInputNotes`) | `intake:analysis-test` | DONE. **구운 60fps 파일은 파일 사실로 못 가른다**: 주의만 보이고 시간 지표는 남는다 |
| 실제 GPU 로 접수 원본 분석 | - | 가짜 GPU + 합성 투수 결과만. 분석 서버는 앞 20초만 읽는다 | UNVERIFIED (physical) |

## 공개 결과
| 요구 | 구현 | 검증 | 상태 |
|---|---|---|---|
| 기존 3D 재사용 · 별도 공개 경계 | `result-view.tsx` · `publication.ts` `loadPublicResult` | 브라우저(3D 캔버스) | DONE |
| 승인한 판 · 허용 칸만 · 내부 값 없음 | `public-result.ts` | `intake:analysis-test`(내부 표시 값 심어 확인) | DONE |
| 돌리기 · 확대 · 재생 · 속도 · 주요 순간 | `Body3D` | 브라우저(단추 존재). 끌어 돌리기 · 확대는 안 눌렀고 터치도 안 봄 | UNVERIFIED (physical) |
| 설명 · 결과 날짜 | `result-view.tsx` | 브라우저 | DONE |
| 특정 성공 판에 묶음 · 재분석이 공개를 안 바꿈 | `publishRun` | 브라우저 · `intake:analysis-test` | DONE |
| 내리기 · 결과 파일 해시 재확인 | `unpublish` · `readSucceededResult` | 브라우저 · `intake:analysis-test` | DONE |
| 넓은 결과 화면 | `result-view.tsx` | 브라우저(3D 762px · 틀 1152px) | DONE |

## 자료 모델
| 요구 | 구현 | 검증 | 상태 |
|---|---|---|---|
| 초대 · 선수/제출자 · 접수 · 판 · 불변 자산 · 분석 · 공개 · 동의 · 감사 | Intake 표 12개 | `intake:db-test` | DONE |
| 서버 시각 접수일 · 촬영일과 출처 분리 · 시간대 | `receivedAt` · `captureAtSource` · `seoulDateKey` | `intake:test` · 관리 상세 | DONE |
| 저장 경로에 이름 없음 | `assetObjectPath` | `intake:test` | DONE |
| 참조를 보는 고아 정리 · 진행 중 전송 보호 | `cleanupStaleUploads` | `intake:db-test` | DONE |
| 지울 날 규칙(공개 · 다시 냄 · 철회 · 경계) | `lib/intake/retention.ts` `originalRetention` · 한도 `limits.ts` | `intake:test`(날짜 경계 · 시계 다시 돌기 · 철회가 안 늦춤) · `intake:db-test` | DONE |
| 받은 원본 삭제는 보유 기간 뒤 | `lib/intake/purge.ts`, 일감 `purge_originals`, 크론 `enqueueDuePurges`(한 번에 찾기 50 · 지우기 10). 모든 판의 원본 + 미리보기를 지우고 결과 JSON · DB 줄 · 해시 · 감사는 남긴다 | `intake:db-test`(90일 1ms 전 · 옛 판 · 미리보기 · 모델 동의 예외 없음 · 크론 끝까지 · 접수마다 감사 한 줄). **실제 Supabase `remove` · Vercel 크론으로는 안 봄** | UNVERIFIED (physical) |
| 저장소 실패 · 재실행 | 지운 뒤 `stat` 으로 확인하고서야 'purged'. 실패는 던져 재시도, 시도를 다 쓰면 6시간마다 다시 건다 | `intake:db-test`(실패 · 일부만 지움 · 답만 하고 안 지움 · 다시 돌림) | DONE |
| 분석 · 검증 · 고침 중에는 기다림 | 대기 · 실행 · 시작 응답 모름 · 끝난 뒤 1시간 · 살아 있는 검증 일감 · 고칠 수 있는 고침(지울 날 + 14일까지) | `intake:db-test` | DONE. 고침 상한 14일 · 1시간은 구현이 정한 값이다(`external-intake.md`) |
| 접수 폴더 밖은 못 지움 · 결과 JSON 보호 | `isPurgeablePath`, 어긋나면 저장소를 안 부르고 던진다 | `intake:test` · `intake:db-test` | DONE |
| 철회한 접수의 판에 안 오른 파일 7일 뒤 삭제 | `cleanupStaleUploads`, 참조 다시 보기 유지, `IntakeSubmission.withdrawnAt` | `intake:db-test`(7일 1ms 전 · 7일 · 판에 얼린 자산은 안 지움) | DONE |
| 지운 뒤 화면 · 동작 | 상세 '지워짐' · 내려받기 · 미리보기 꺼짐, 새 분석 `original_purged`, 공개 결과 그대로, 고침은 지운 칸을 넣어 새 파일을 받는다. 목록 · 상세 · 영수증에 날짜 | `intake:admin-test` · `intake:analysis-test` · `intake:db-test` · `detail.selftest`. **브라우저로는 안 봤다**: 목록 칸 · 영수증 줄 · 고침 화면의 칸 글은 코드 · 정적 그리기까지다 | UNVERIFIED (physical) |

## 디자인 · 접근성
| 요구 | 구현 | 검증 | 상태 |
|---|---|---|---|
| 휴대폰 한 칸 20px · 큰 단추 · 안전 영역 | `shell.tsx` | 브라우저 390 · 320(넘침 0, 단추 44px 이상) | DONE |
| PC 480~560px | `max-w-[33rem]` | 브라우저 528px | DONE |
| 짧은 화면 · 가로 넘침 | 같은 파일 | 브라우저 320×568 | DONE |
| 자판 · 큰 글씨 · 방향 전환 | `--kb` · `--vvh` | **실기기 없음, 재지 않음** | UNVERIFIED (physical) |
| 의미 있는 조작 · 초점 · 진행 알림 · 동작 줄이기 | `Screen` 초점 · `aria-*` · `motion-safe` | 코드 · 브라우저. **VoiceOver 등 화면 읽기는 안 봄** | UNVERIFIED (physical) |
| 칸 곁 오류 · 색만으로 말하지 않음 | `FieldError` | 브라우저 | DONE |

## 검증 필수 사례
| 사례 | 근거 | 상태 |
|---|---|---|
| 120 · 240fps 원본 짝 | 합성 머리 파일만 | UNVERIFIED (physical) |
| 소수 fps · 슬로모션 시간 | 합성 머리 파일만(`intake:test`) | UNVERIFIED (physical) |
| HEVC · MOV 미리보기 한계 | 합성 파일 | UNVERIFIED (physical) |
| 사진 앱 대 파일 앱 고르기 | 실기기 없음 | UNVERIFIED (physical) |
| iCloud 파일 | 실기기 없음 | UNVERIFIED (physical) |
| 아이폰 사파리 · 카카오 인앱 | UA 만 흉내 냈다(엔진은 크로미움) | UNVERIFIED (physical) |
| 안드로이드 브라우저 | 실기기 없음 | UNVERIFIED (physical) |
| 데스크톱 브라우저 | 헤드리스 크로미움 통과. 사파리 · 파이어폭스는 안 봄 | DONE |
| 옆 성공 · 뒤 실패 | 브라우저 · `intake:public-test` | DONE |
| 망 끊김 · 전송 만료 | 브라우저(오프라인 → 이어 보내기) · `intake:transfer-test` | DONE |
| 새로고침 · 브라우저 종료 · 파일 다시 고르기 | 새로고침은 브라우저, 종료는 같은 복구 길을 `intake:transfer-test` | DONE |
| 완료 응답 유실 | `intake:db-test` · `intake:public-test` | DONE |
| 보내기 여러 번 누름 | 브라우저 | DONE |
| 두 칸에 같은 파일 | 브라우저 | DONE |
| 동시 기기 · 동시 관리자 | PGlite 는 연결이 하나라 줄을 서서 돈다. 결과만 확인(`intake:db-test` · `intake:admin-test`). 실제 동시 경합은 운영 Postgres 로 안 봄 | UNVERIFIED (physical) |
| 만료 · 폐기 초대 | 브라우저 | DONE |
| 파일 · 결과 직접 접근 차단 | HTTP 시험 · `intake:public-test` · `intake:analysis-test` | DONE |
| 공개 · 재분석 · 내리기 · 고친 접수 | 브라우저 · `intake:analysis-test`(낡은 화면의 공개 · 내리기 막힘, 글만 고친 판의 실행 잇기, 손을 고친 판의 공개 막힘 포함) | DONE |
| 내려받은 원본 = 고른 파일 SHA-256 | 가짜 저장소 객체 해시로만 확인. 실제 서명 주소 내려받기는 안 봄 | UNVERIFIED (physical) |

## 검토 지적 43건
번호는 검토 묶음의 차례다. 상태 뜻: 고침 = 코드와 시험이 있다, 일부 = 코드로 된 곳까지 고쳤고 남은 것은 적어 두었다, 안 함 = 코드가 없다.

| # | 지적 | 구현 | 근거 | 상태 |
|---|---|---|---|---|
| 1 · 7 · 26 | 필수 동의 철회에 닿을 길이 없다 | `adminWithdrawConsent` · `withdrawRequiredConsent`, 상세의 '필수 동의 철회 기록' | `intake:admin-test` · `intake:analysis-test` | 고침 |
| 2 · 36 | 나쁜 파일이 검증을 막고 전체 읽기를 되풀이한다 · NUL 글자 | 머리를 해시보다 먼저 읽고 저장, `cleanFileText`, `isContentWriteError` → `facts_unreadable` | `intake:db-test` | 고침 |
| 3 | EBML 네 바이트로 검증 통과 | `unsupported_container` 로 막음. 관리자 · 공개 글 · 고를 때 글 | `intake:test` · `intake:db-test` · 관리 브라우저 | 고침 |
| 4 | 막힌 파일을 올린 사람의 확장자로 내려받음 | `originalExtension`(그릇으로만) · `originalWarning` | `intake:test` · `intake:admin-test` | 고침 |
| 5 | 짧은 코드 · 잠금 없음 | 6자 이상, 공개 결과가 `verifyResultAccess` 를 쓴다, 시도 자리를 DB 가 먼저 센다, 틀린 시도 감사 기록, 맞는 코드는 안 셈, 끝을 못 적은 마지막 자리는 2분 뒤 잠금으로 마무리 · 관리자가 언제든 풂 | 라우트까지 `intake:analysis-test` · 동시 30번 `intake:db-test` · 잠김 칩과 풀기는 관리 브라우저 | 고침. 맞는 코드를 새로고침마다 다시 적는 것은 그대로다(더는 막히지 않는다) |
| 6 | 빈 철회 · 동의 뒤집기로 감사 기록을 밀어냄 | 바뀐 때만 기록, 철회 · 동의 · 초안에 초대별 한도, 상세의 받는 사람 기록을 따로 60줄로 자름, 동의는 판단에 드는 줄만 읽고 상세는 100줄 + '더 있음' | `intake:public-test` · `intake:admin-test` · '더 있음'은 관리 브라우저 | 고침. 표의 줄 수 상한은 없다(쓰기 제한으로만 묶임) |
| 8 | '언제든 철회'인데 단추가 일부 화면에만 있다 | `ModelConsentPart` 를 받는 사람이 닿는 화면마다, 폐기된 링크는 담당자 기록(`adminWithdrawModelConsent`), 마지막 답이 동의일 때만 철회로 적음. 필수 철회와 따로 남기로 정했고, 동의 글과 철회 확인창이 그렇게 말한다 | `intake:admin-test` · `intake:test` · 관리 브라우저(앞 코드) | 고침 |
| 9 · 27 | 고침 요청 · 기간 만료로 공개 결과가 사라짐 | `resultAvailable`, `resolveScreen` 차례 | `intake:test` · `intake:db-test` | 고침 |
| 10 | 만 14세 미만 막힘 뒤 이름이 남고 흔적이 없다 | 이름 지움 · 감사 기록 · 자산 유무로 문장 · 검사 건너뜀. 지운 뒤 막다른 길은 이름부터 다시 받는 화면으로 | `intake:db-test` · 공개 브라우저 | 고침 |
| 11 | 동의 글의 보내는 것 · 거부권 | 동의 본문 | `intake:test` | 고침 |
| 12 | 대리 관계가 본인 동의로 남는다 | 접지 않은 필수 질문, 기본값 없음, 대리 글, 관계가 바뀌면 새 줄 · 다시 받기, 고침을 거두면 그 관계의 동의가 살아남, 판에는 지금 관계의 답만 | `intake:test` · `intake:db-test` · `intake:analysis-test` · 공개 브라우저 | 고침. 대리 권한 정책 자체는 사람 결정 |
| 13 | 업로드 뒤 미리보기 생성 없음 | 실패한 실행의 미리보기만 보인다 | `intake:admin-test` | 범위 제외. 분석 전 미리보기는 안 만들기로 정했다(2026-11-06). HEVC 는 분석 전에 원본을 받아야 본다 |
| 14 · 24 · 35 | 멈춘 검증이 안 보이고 다시 걸 수 없다 | `jobIssues`, '다시 확인'(칸의 파일까지), `repairFailedJobs`, 대상은 지금 판과 칸의 파일(`verifyTargetIds`) | `intake:admin-test` · `intake:db-test` | 고침 |
| 15 · 20 | 동의 글이 바뀌면 다시 받을 화면이 없다 · 옛 체크 | `ReconsentStep` · `reconsentOpen` · `agreedAfterDocs` | `intake:public-test` · `intake:db-test` | 고침 |
| 16 | 분석 실패의 공개 글 | `publicStatusText` | `intake:test` | 고침 |
| 17 · 18 · 19 | 초점 · 색만 · 화면 읽기 알림 | `firstProblemTarget`, `Choice` 의 체크 그림, `role="status"` | `intake:test` · 코드 | 고침. **VoiceOver 로는 안 봄** |
| 21 | 밀려난 얼린 원본을 못 받는다 | `OlderAssets` | `detail.selftest` · `intake:admin-test` | 고침 |
| 22 | 외국 이름의 형식 글자 | `UNSAFE_TEXT`, `athlete_name_chars` | `intake:db-test` | 고침 |
| 23 · 34 | 끊긴 정산이 영구히 멈춤 | `reconcilePendingRevisions` | `intake:db-test` · `intake:analysis-test` | 고침 |
| 25 | 고침 요청에서 빠져나올 길이 없다 | 요청 바꾸기 · 거두기 · 기간 늘리기. 거두면 열 때의 손으로 돌아간다(`handBefore`) | `intake:db-test` · `intake:analysis-test` | 고침 |
| 28 | 사용자가 못 본 짝을 얼림 | `expectedAssets` · `stale_selection` | `intake:db-test` · `intake:public-test` | 고침 |
| 29 | 낡은 화면의 공개 · 내리기 | `expectedActivePublicationId`, `run_not_current`(손까지 본다) | `intake:analysis-test` | 고침 |
| 30 | 엔진 판을 못 읽으면 또 돈다 | `analysis_engine_unknown` | `intake:analysis-test` | 고침 |
| 31 | 글만 고쳐도 다시 돌고 이름이 안 닿는다 | 키에서 판을 뺌, 등록 일감이 상태를 잇는다, 도는 사이 끝난 성공도 받는다, 공개 이름은 지금 판, 고침 중에 끝난 실행은 낸 손으로 적음, 고침을 거둘 때도 잇는다, 공개 안내는 입력으로 견줌 | 크론 두 번까지 `intake:analysis-test` | 고침 |
| 32 | 시작 응답 시간 초과로 두 번 돈다 | `startUnknown`, 30분 창 | `intake:analysis-test` | 고침. 창이 지난 뒤의 결과는 안 읽어서 그때 다시 돌리면 비용이 두 번 든다(`external-intake.md`) |
| 33 | 끝내지 않은 파일이 영구히 남는다 | 초안 · 고침 중 파일을 유예 뒤 정리, 칸을 비우면 같은 투구 확인도 지움, 철회된 접수의 판에 안 오른 파일은 철회 뒤 7일에 지움 | `intake:db-test` | 고침 |
| 37 | 기간 끝에 끝난 전송의 막다른 길 · 초안 기간 늘리기 | `assertLateFinalize` · `extendUploadWindow` | `intake:db-test` | 고침 |
| 38 | 원본이라고 단정한 분석 입력 | `analysisInputNotes`, 시간 지표 빼기, 초점거리 · `lens: 'zoom'`, 한계 주의 | `intake:analysis-test` | 일부. 구운 60fps 는 파일 사실로 못 가른다. 실제 파일로는 안 봄 |
| 39 | 자름을 속도 변경으로 읽음 · 표본 시간을 촬영 길이로 | `editMapping`(B 장면 앞머리 포함), `sampleDurationLabel` | `intake:test` | 고침. 실제 파일로는 안 봄 |
| 40 | 같은 투구 확인이 교체 뒤에도 남음 | 칸 교체 · 빈 칸 채우기 · 정리에서 지움, 복구 화면이 다시 묻는다 | `intake:db-test` | 고침 |
| 41 | 머리를 못 읽은 파일을 영상 아님으로 | `unconfirmed` · `media_unconfirmed` | `intake:test` · `intake:db-test` | 고침 |
| 42 | 이어 보내기 HEAD 5xx 가 처음부터 다시 | `HeadRefused` | `intake:transfer-test` | 고침 |
| 43 | 완료 뒤 끊기면 실패로 말함 | `stateAfterReceipt` · `refreshQuietly` | `intake:transfer-test` · `intake:public-test` | 고침 |

## 사람이 해야 남은 일
1. 공유 DB 에 마이그레이션 적용(백업 · 김민 알림 뒤). main 에 올리면 빌드가 곧바로 적용한다.
2. 버킷 `external-intake` 생성 · 프로젝트 파일 한도 확인.
3. 환경변수 · 크론 · 실기기 시험.
4. `ANALYSIS_CONSENT` PENDING 다섯 건 결정.
5. 정할 것 둘: 대리인이 선수 대신 동의할 수 있는 범위 · 분석 결과의 보유 기간.
6. 구현이 정한 값 확인: 고침 기다림 상한 14일, 공개 뒤 다시 내면 재공개 없이도 시계가 새로 도는 것(`external-intake.md` '원본 보유 기간').

## 맥북에서 넘길 때 상태(2026-11-07)
- 보유 삭제 코드에 독립 검증 지적 12건이 남아 있다(`external-intake-retention-findings.md`). 위 표의 보유 관련 DONE 은 이 지적을 고치기 전 판단이다.
- 합친 코드로 tsc 0 · eslint 0 · 접수 시험 349 · 547 · 540 · 130 · 132 · 391 통과. 격리 브라우저 58 · 46 은 보유 삭제 전 코드다.
