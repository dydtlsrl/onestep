# 원스텝 (onestep)

면접·필기시험·행사 진행요원 파견을 위한 인력 관리 앱.
초대받고 승인된 프리랜서 인력이 일정을 신청하고, 대표가 선발·계약·정산까지 한 곳에서 처리한다.

## 문서
| 문서 | 내용 |
|---|---|
| [PRD](./docs/PRD.md) | 제품 요구사항: 배경, 기능, 화면, 설정, 마일스톤 |
| [ERD](./docs/ERD.md) | 데이터 구조와 접근 권한 |
| [기술 스택](./docs/TECH_STACK.md) | 사용 기술, 보안 설계, 운영비 |
| [회의록](./docs/meeting-notes.md) | 회의별 결정 사항 |

## 현재 상태
**1단계 (로그인·초대·가입 신청·승인)** 개발 중. PRD 8장 마일스톤의 1A에 해당한다.

| 기능 | 화면 주소 |
|---|---|
| 첫 화면 (상태에 따라 알맞은 곳으로 이동) | `/` |
| 초대 링크로 들어와 카카오·Google 로그인 | `/join/<초대코드>` |
| 가입 신청서 | `/signup/<초대코드>` |
| 승인 대기 안내 | `/pending` |
| 다시 로그인 | `/login` |
| 대표: 가입 승인 (등급 지정·거절) | `/admin/applications` |
| 대표: 초대 링크 만들기·끄기 | `/admin/invites` |

---

## 처음 설정하기

처음 한 번만 하면 된다. 메뉴 이름은 각 서비스가 바꿀 수 있으니, 비슷한 이름을 찾으면 된다.

### 1. 준비물
- [Node.js](https://nodejs.org) 22 버전 (20.9 이상이면 동작)
- Git
- 회사 소유로 만든 Supabase, 카카오 개발자, Google Cloud 계정

### 2. 코드 받고 설치
```bash
git clone https://github.com/dydtlsrl/onestep.git
cd onestep
npm install
```

### 3. Supabase 프로젝트 만들기
1. [supabase.com](https://supabase.com)에서 New project를 누른다. 지역(Region)은 **Northeast Asia (Seoul)** 를 고른다.
2. Project Settings > API에서 **Project URL**과 **Publishable key**를 확인한다.
3. 이 폴더에서 `.env.example`을 복사해 `.env.local`을 만들고 두 값을 채운다.
   ```bash
   cp .env.example .env.local
   ```
   `service_role` 키나 secret 키는 넣지 않는다. 브라우저에 노출되면 안 되는 키다.

### 4. 데이터베이스 만들기
Supabase 대시보드 > **SQL Editor**에서 `supabase/migrations/20261027000000_phase1_auth_invites.sql` 파일 내용을 전부 붙여 넣고 **Run**을 누른다.
테이블, 권한 규칙(RLS), 가입 신청·승인 함수가 만들어진다.

### 5. 로그인 주소 등록
Supabase > Authentication > **URL Configuration**
- Site URL: `http://localhost:3000`
- Redirect URLs에 추가: `http://localhost:3000/**`
- 배포한 뒤에는 실제 주소(예: `https://onestep.co.kr/**`)도 추가한다.

### 6. 카카오 로그인 설정
1. [developers.kakao.com](https://developers.kakao.com)에서 애플리케이션을 추가한다.
2. 앱 키의 **REST API 키**를 복사해 둔다. (Supabase의 Client ID로 쓴다)
3. 카카오 로그인을 **활성화**하고, Redirect URI에 아래 주소를 등록한다.
   `https://<프로젝트ID>.supabase.co/auth/v1/callback`
   (프로젝트ID는 3단계의 Project URL에 들어 있는 영문자)
4. 보안 메뉴에서 **Client Secret**을 만들고 사용함으로 바꾼 뒤 복사해 둔다.
5. **비즈 앱으로 전환**하고(원스텝 사업자 정보로 가능), 동의항목에서 닉네임·프로필 사진·**카카오계정(이메일)** 을 설정한다.
   Supabase의 카카오 로그인은 이메일 항목을 항상 요청하므로, 이메일 항목이 없으면 `KOE205` 오류가 난다.
6. Supabase > Authentication > **Sign In / Providers > Kakao**를 켜고 REST API 키와 Client Secret을 넣는다.

### 7. Google 로그인 설정
1. [console.cloud.google.com](https://console.cloud.google.com)에서 프로젝트를 만들고 **OAuth 동의 화면**을 설정한다. (앱 이름: 원스텝)
2. 사용자 인증 정보 > **OAuth 클라이언트 ID** > 웹 애플리케이션을 만든다.
3. 승인된 리디렉션 URI에 `https://<프로젝트ID>.supabase.co/auth/v1/callback`을 넣는다.
4. 만들어진 클라이언트 ID와 보안 비밀번호를 Supabase > Sign In / Providers > **Google**에 넣고 켠다.

### 8. 실행
```bash
npm run dev
```
브라우저에서 http://localhost:3000 을 연다.

### 9. 첫 대표 계정 만들기
대표 계정은 초대 링크 없이 한 번만 직접 만든다.
1. http://localhost:3000/login 에서 대표 본인의 카카오(또는 Google) 계정으로 로그인한다.
2. "아직 가입 신청 전이에요" 화면에서 **내 계정 ID 보기**를 눌러 ID를 복사한다.
3. Supabase SQL Editor에서 아래를 실행한다. 꺾쇠 안의 값을 바꾼다.
   ```sql
   insert into public.profiles (id, name, phone, role, status, tier, privacy_agreed_at, approved_at)
   values ('<복사한 계정 ID>', '<대표 이름>', '<휴대폰 숫자만, 예: 01012345678>', 'admin', 'active', 'core', now(), now());
   ```
4. 새로고침하면 대표 화면(`/admin`)이 열린다.

### 10. 직접 해 보기
1. 대표 화면 > 초대 링크에서 링크를 만들고 복사한다.
2. 다른 브라우저(또는 시크릿 창)에서 그 링크를 열고, 다른 계정으로 로그인해 가입 신청서를 낸다.
3. 대표 화면 > 가입 승인에서 등급을 골라 승인한다.
4. 신청한 쪽 화면을 새로고침하면 환영 화면이 나온다.

---

## 검사 명령
코드를 고친 뒤 올리기 전에 실행한다.

| 명령 | 하는 일 |
|---|---|
| `npm run lint` | 코드 실수 검사 |
| `npm run typecheck` | 타입 검사 |
| `npm test` | 단위 테스트 (휴대폰 번호, 초대 코드, 입력값 검사 등) |
| `npm run db:test` | 임시 PostgreSQL에 마이그레이션을 적용하고 권한 규칙(RLS)을 검사. PostgreSQL 15 이상 필요 |
| `npm run build` | 배포용 빌드 |

`NEXT_PUBLIC_`으로 시작하는 환경변수는 빌드할 때 코드에 들어간다. 값을 바꾸면 다시 빌드해야 한다.

## 폴더 구조
```
src/
  app/                 화면 (폴더 이름이 주소가 된다)
    admin/             대표 화면
    join/[code]/       초대 링크 첫 화면
    signup/[code]/     가입 신청서
    auth/              로그인 콜백, 로그아웃
  components/          여러 화면에서 쓰는 부품 (버튼, 카드 등)
  lib/                 화면이 아닌 코드 (Supabase 연결, 입력값 검사, 날짜·번호 형식)
  proxy.ts             모든 요청 전에 로그인 세션을 갱신 (Next.js 16의 proxy)
supabase/
  migrations/          데이터베이스 변경 SQL. 순서대로 적용한다
  tests/               권한 규칙 테스트
docs/                  기획 문서
```

## 자주 생기는 문제
| 증상 | 확인할 것 |
|---|---|
| "Supabase 환경변수가 없습니다" | `.env.local`이 있는지, 값을 채웠는지, 서버를 다시 켰는지 |
| 카카오 로그인 중 `KOE205` | 6단계 5번: 비즈 앱 전환과 이메일 동의항목 |
| 로그인 후 `redirect_uri_mismatch` 또는 다른 주소로 감 | 5단계 Redirect URLs, 6·7단계의 Supabase 콜백 주소 |
| 카카오톡에서 Google 로그인이 안 됨 | 정상이다. 화면의 "기본 브라우저로 열기"를 누른다 |
| 대표 화면이 안 열림 | 9단계 SQL에서 role이 `admin`, status가 `active`인지 |
