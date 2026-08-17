# Bullpen Log

투수를 위한 훈련·기록 웹앱. 던진 양을 기록하면 부하를 계산해 오늘 얼마나 던져도 되는지 알려주고,
몸상태에 맞는 운동을 골라주고, 투구 영상에서 폼을 측정한다.

**설계 원칙 하나만 기억하면 된다 — 숫자와 판정은 전부 코드가 낸다. AI는 그 숫자를 문장으로 풀어쓸 뿐이다.**
AI가 투구수나 부하 지수를 지어내지 못하게 막는 구조이고, 여기를 흐리는 방향으로는 고치지 않는다.
통증이 잡히면 AI를 아예 호출하지 않고 병원 안내로 보낸다.

---

## 처음 실행하기

> 맥과 윈도우 양쪽에서 개발한다. 명령이 다른 곳은 그때그때 적어둔다.
> 윈도우는 **PowerShell** 기준이며, 예전 명령 프롬프트(cmd)가 아니다.

### 1. 필요한 것

- **Node.js 22 이상** (개발은 24에서 하고 있다) — nodejs.org 의 LTS
- **Git** — 맥은 거의 깔려 있고, **윈도우는 따로 받아야 한다** (git-scm.com)
- Supabase 계정 — Postgres와 영상 저장소로 쓴다
- Anthropic API 키 — AI 리포트용. 이것만 없어도 나머지 기능은 다 돌아간다

### 2. 받아서 설치

```bash
git clone https://github.com/Bullpen-Log/bullpen-log.git
cd bullpen-log
npm install
```

### 3. 환경변수

`.env.example`을 `.env`로 복사하고 값을 채운다.

```bash
# 맥
cp .env.example .env
open -e .env
```

```powershell
# 윈도우 (PowerShell)
Copy-Item .env.example .env
notepad .env
```

> ⚠️ **윈도우에서 파일 탐색기로 `.env` 를 새로 만들지 말 것.** 확장자를 숨기는 설정 때문에
> `.env.txt` 가 만들어지는데, 겉보기엔 똑같아서 왜 안 되는지 한참 헤매게 된다.
> 위처럼 복사한 뒤 열어서 고치면 그럴 일이 없다.

| 변수 | 어디서 얻나 |
|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string. **포트 6543**(풀러) |
| `DIRECT_URL` | 같은 화면의 **포트 5432**. 마이그레이션 전용 — 6543으로는 멈춘다 |
| `SESSION_SECRET` | `openssl rand -base64 32` 로 직접 만든다 |
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | 같은 화면. **비밀키다. 절대 커밋하지 않는다** |
| `ADMIN_EMAIL` | 본인 이메일. 이 이메일로 **가입할 때** 관리자 권한이 붙는다 |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `AI_MODEL` | 선택. 비우면 `claude-sonnet-5` |

`.env`는 `.gitignore`에 막혀 있어 깃에 올라가지 않는다. 그래서 새로 받은 사람은 이 파일을 직접 만들어야 한다.

### 4. DB 준비

**여기서 두 갈래로 나뉜다. 자기가 어느 쪽인지 먼저 확인할 것.**

#### (가) 이미 돌아가는 Supabase에 합류하는 경우 — 팀원이라면 보통 이쪽

같이 쓰는 DB에는 표가 이미 다 만들어져 있다. 만들 게 없고, 코드가 DB를 읽을 수 있게
클라이언트만 생성하면 된다.

```bash
npx prisma generate --schema=prisma/schema.prisma
```

> ⚠️ **`prisma migrate dev` 를 실행하지 말 것.**
> 남과 같이 쓰는 DB에서 이 명령을 쓰면, 상황에 따라 **표를 전부 지우고 다시 만들겠느냐**고
> 물어온다. 무심코 넘기면 다른 사람 기록까지 사라진다.
> 표 구조를 바꿔야 할 일이 생기면 혼자 하지 말고 팀에 먼저 말할 것.

**5번은 건너뛴다.** 저장소는 이미 만들어져 있다.

#### (나) 내 Supabase를 새로 만든 경우

```bash
npx prisma migrate dev --schema=prisma/schema.prisma
```

> `--schema` 플래그를 빼면 "Specify a schema" 오류가 난다. 이 프로젝트는 `prisma.config.ts`를 쓰기 때문에
> 명시해줘야 한다. 매번 붙인다고 생각하면 편하다.

### 5. Supabase Storage 버킷 — (나)인 경우에만

영상 업로드에 **비공개** 버킷 `pitch-videos`가 필요하다. Supabase → Storage에서 만든다.
공개로 만들면 안 된다 — 남의 투구 영상이 URL만 알면 다 보인다. 앱은 서명된 임시 URL로만 재생한다.

### 6. 실행

```bash
npm run dev
```

http://localhost:3000

---

## 자주 쓰는 명령

```bash
npm run dev      # 개발 서버
npm run build    # prisma generate + migrate deploy + next build
npm run lint     # eslint
npx tsc --noEmit # 타입 검사 — 커밋 전에 한 번 돌리면 좋다
npm run backup   # DB 전체를 ~/bullpen-log-backups 에 JSON 으로 받아둔다
```

여럿이 같은 DB를 보고 개발하면 누군가 실수로 지우는 일이 언젠가 생긴다.
표 구조를 바꾸거나 데이터를 손대기 전에 `npm run backup` 을 한 번 돌려두면 마음이 편하다.

---

## 코드가 어디 있나

| 경로 | 무엇 |
|---|---|
| `app/(app)/` | 로그인한 사람이 보는 화면들 (대시보드, 투구기록, 오늘운동, AI코치…) |
| `app/actions/` | 서버 액션 — 폼 제출을 받아 DB에 쓴다 |
| `lib/report/` | **부하 계산, 투구 계획, 운동 처방.** 앱의 두뇌. 숫자는 전부 여기서 나온다 |
| `lib/pose/` | 영상 → 관절 추출(`extract`) → 구간 감지(`detect`) → 지표 측정(`measure`) |
| `lib/ai/` | AI에게 넘길 프롬프트와 응답 검증 |
| `prisma/schema.prisma` | DB 구조 |
| `proxy.ts` | 미들웨어 (이 Next.js 버전에서는 `middleware.ts`가 아니다) |

값을 바꿀 때 **한 곳만 고치면 나머지가 따라오게** 만들어 둔 배열들이 있다. 이런 건 그 배열만 고치면 된다.

- `lib/checkin.ts`의 `CHECKIN_PARTS` — 체크인 부위
- `lib/session-type.ts`의 `SESSION_TYPES` — 투구 종류
- `lib/nav.ts`의 `NAV_GROUPS` / `MOBILE_TABS` — 메뉴

---

## 같이 작업할 때

**`main`에 바로 올리지 않는다.** 각자 브랜치를 만들어 작업하고 Pull Request로 합친다.
같은 파일을 동시에 고쳐도 충돌을 미리 볼 수 있다.

```bash
git switch -c 기능이름       # 브랜치 만들며 이동
# ... 작업 ...
git add -A
git commit -m "무엇을 왜 바꿨는지"
git push -u origin 기능이름
```

그다음 GitHub에서 Pull Request를 열고, 상대가 한 번 보고 합친다.

작업을 시작하기 전에는 항상 최신을 받아온다:

```bash
git switch main
git pull
```

### 커밋 메시지

무엇을 바꿨는지보다 **왜 바꿨는지**를 적는다. 코드를 보면 무엇인지는 알 수 있지만 왜인지는 알 수 없다.

### 윈도우에서 자주 걸리는 것

**`npm` 을 쳤는데 "이 시스템에서 스크립트를 실행할 수 없으므로" 라는 오류가 날 때**

PowerShell 이 기본으로 스크립트 실행을 막아둔 탓이다. PowerShell 에서 한 번만 실행하면 된다.

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

관리자 권한도 필요 없고, 내 계정에만 적용된다.

**줄바꿈 경고(`LF will be replaced by CRLF`)가 뜰 때**

무시해도 된다. `.gitattributes` 가 저장소 안에는 항상 LF 로 담기도록 잡아두고 있어서,
맥과 윈도우가 서로 다른 줄바꿈을 커밋하는 일은 생기지 않는다.

### 손대기 전에 알아둘 것

- **부하 계산식(투구수 × 강도)과 안전 규칙은 함부로 완화하지 않는다.** 후보 운동이 부족하다고 통증 차단이나
  강도 제한을 푸는 방향은 안 된다. 부족하면 부족하다고 말하는 편이 맞다.
- `AGENTS.md`에 적힌 대로, 이 Next.js는 버전이 앞서 있어 익숙한 API와 다를 수 있다.
  헷갈리면 `node_modules/next/dist/docs/`를 본다.
- 맥에서 iCloud 동기화 때문에 `.next` 안에 `파일 2.js` 같은 중복이 생겨 타입 검사가 깨질 때가 있다.
  그럴 땐 `find .next -name "* 2.*" -delete`.
윈도우 데스크탑에서도 작업합니다.