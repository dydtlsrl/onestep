# DB 백업하기 (대표님 노트북 + DBeaver)

Supabase 무료 요금제는 **자동 백업이 없어요.** 그래서 대표님 노트북에 정기적으로 백업 파일을 받아 둬요.

## 0. 준비 (처음 한 번)
1. **PostgreSQL 설치**: [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)에서 **17 버전**을 설치해요.
   - 백업 도구(`pg_dump`, `pg_restore`)가 함께 설치돼요.
   - 노트북의 버전이 Supabase의 PostgreSQL 버전과 **같거나 더 새로워야** 해요. Supabase 버전은 대시보드 Project Settings → Infrastructure 쪽에서 확인할 수 있어요.
   - 설치할 때 정한 비밀번호는 **노트북 PostgreSQL용**이에요. Supabase 비밀번호와 달라요.
2. **DBeaver 설치**: [dbeaver.io](https://dbeaver.io/download/)에서 Community(무료) 버전을 설치해요.
3. **노트북 디스크 암호화**: Windows 설정에서 **BitLocker**(또는 장치 암호화)를 켜요. 백업 파일에 회원 이름·연락처가 들어 있어서예요.

## 1. DBeaver에서 Supabase 연결하기
1. Supabase 대시보드 위쪽 **Connect** → **Session pooler**의 접속 정보를 확인해요.
   - Host (예: `aws-0-ap-northeast-2.pooler.supabase.com`), Port `5432`, Database `postgres`, User `postgres.<프로젝트ID>`
   - Direct connection은 IPv6 전용이라 연결이 안 될 수 있으니 **Session pooler**를 써요.
2. DBeaver → **새 연결** → **PostgreSQL** → 위 값을 넣어요.
   - 비밀번호는 프로젝트를 만들 때 정한 **Database password**예요. 잊었으면 Supabase → Project Settings → Database에서 다시 만들 수 있어요.
   - ⚠️ 이 비밀번호는 채팅·메신저에 붙여 넣지 마세요.
3. 연결 설정의 **Local Client**(로컬 클라이언트)를 0단계에서 설치한 PostgreSQL 17로 골라요. 백업 기능이 이 도구를 써요.
4. **연결 테스트** → 성공하면 저장해요.

⚠️ DBeaver는 관리자 권한으로 접속해서 앱의 권한 규칙을 무시해요. **보기와 백업에만** 쓰고, 데이터 수정은 앱 화면에서 하세요.

## 2. 백업하기 (정기적으로)
1. DBeaver 왼쪽에서 Supabase 연결의 `postgres` 데이터베이스를 오른쪽 클릭 → **도구(Tools)** → **백업(Backup)**
2. 스키마는 **전부** 골라요. 특히 `public`(앱 데이터)과 `auth`(로그인 정보)가 꼭 포함돼야 해요.
3. 형식(Format)은 **Custom**, 파일 이름에 날짜를 넣어요. 예: `onestep_2026-11-14.backup`
4. **시작**을 누르고 완료 메시지를 확인해요.
5. 백업 파일을 정해 둔 폴더에 보관해요. 최근 몇 개(예: 8주치)만 남기고 오래된 것은 지워요.

**권장 주기**: 매주 정해진 요일(예: 금요일) + **정산·지급 처리 직후**

## 3. 복원 시험 (한 달에 한 번)
복원해 본 적 없는 백업은 믿기 어려워요. 노트북 PostgreSQL에 풀어 보고 데이터가 있는지 확인해요.
1. DBeaver에서 노트북 PostgreSQL(`localhost`)에 연결하고, 새 데이터베이스 `onestep_restore`를 만들어요.
2. `onestep_restore` 오른쪽 클릭 → **도구** → **복원(Restore)** → 백업 파일을 고르고, **소유자·권한 복원 안 함(No owner / No privileges)**을 체크해요.
3. 복원 중 Supabase 전용 역할·확장 기능 관련 경고가 나올 수 있어요. 정상이에요.
4. `public` 아래 `profiles`, `events`, `applications`, `contracts`, `payments` 테이블을 열어 데이터가 들어 있는지 봐요.
5. 확인이 끝나면 `onestep_restore`를 지워요.

실제로 사고가 나서 되살릴 때는 **새 Supabase 프로젝트**에 복원해요. 그때는 개발자와 함께 진행하세요.

## 4. 꼭 기억할 것
- **암호화 키(`PII_ENCRYPTION_KEY`)는 백업에 들어 있지 않아요.** 복원한 뒤 주민번호·계좌를 읽으려면 이 키가 필요해요. **백업 파일과 키는 서로 다른 곳에** 보관하세요.
- 백업 파일을 메신저나 이메일로 보내지 마세요.
- 회원이 많아지고 운영이 안정되면 **Supabase Pro**(월 약 25달러, 매일 자동 백업)로 바꾸는 것도 검토하세요.
