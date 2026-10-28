# 배포하기 (무료 호스팅: Netlify)

대표님과 인력들이 인터넷 주소로 앱을 쓰게 하는 방법이에요. **개발자용** 안내예요.

## 왜 Netlify인가
| 서비스 | 무료 요금제 | 이 앱에 |
|---|---|---|
| **Netlify** | 있음. Next.js를 자동으로 인식해 따로 설정할 것이 적어요 | ✅ 추천 |
| Cloudflare Pages | 있음. Next.js는 변환 도구(OpenNext) 설정이 더 필요해요 | 대안 |
| Vercel | 무료(Hobby)는 **개인·비상업용**만 허용 | ❌ 회사 업무에는 유료(Pro) 필요 |

- 요금과 약관은 바뀔 수 있어요. 가입할 때 **무료 요금제에서 상업적 사용이 되는지** 약관을 한 번 확인하세요.
- 이 앱은 Next.js 16을 써요. 첫 배포에서 빌드가 실패하면, Netlify의 **Deploy log**를 복사해 개발자(Claude)에게 보내 주세요.

## 0. 배포 전에
- [ ] PR을 `main`에 합친다. 배포는 `main` 브랜치를 기준으로 한다.
- [ ] Supabase 마이그레이션 1~9번을 모두 적용했다.
- [ ] 암호화 키(`PII_ENCRYPTION_KEY`)를 안전한 곳에 보관하고 있다. **로컬 `.env.local`과 같은 키**를 써야 지금까지 저장한 값을 읽을 수 있다.

## 1. Netlify에 사이트 만들기
1. [netlify.com](https://www.netlify.com)에 **GitHub 계정으로** 가입한다. 나중에 대표님을 팀에 초대할 수 있다.
2. **Add new site → Import an existing project → GitHub** → `dydtlsrl/onestep` 저장소를 고른다.
3. 설정을 확인한다. 보통 자동으로 채워진다.
   - Branch to deploy: `main`
   - Build command: `npm run build`
   - Node 버전: 저장소의 `.nvmrc`(22)를 읽는다. 안 맞으면 환경변수 `NODE_VERSION=22`를 넣는다.
4. **Environment variables**에 아래 4개를 넣는다. (Site configuration → Environment variables)

| 이름 | 값 | 비고 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<프로젝트ID>.supabase.co` | `.env.local`과 같음 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | `.env.local`과 같음 |
| `NEXT_PUBLIC_SITE_URL` | 배포 주소 (2단계에서 확인 후 넣음) | 초대 링크에 쓰는 주소 |
| `PII_ENCRYPTION_KEY` | 보관해 둔 암호화 키 | **"Contains secret values"를 체크**한다. 채팅·메신저에 붙여 넣지 않는다 |
| `NEXT_PUBLIC_KAKAO_LOGIN` | `on` (카카오 설정을 마친 뒤에만) | 없으면 카카오 버튼이 숨겨지고 Google만 보인다 |

⚠️ `service_role` 키나 Supabase secret 키는 **넣지 않는다.** 이 앱은 그 키를 쓰지 않는다.

5. **Deploy**를 누른다. 몇 분 걸린다.

## 2. 주소 확인 후 마무리
1. 배포가 끝나면 `https://<이름>.netlify.app` 주소가 생긴다. 사이트 이름은 Site configuration → Change site name에서 바꿀 수 있다 (예: `onestep-app`).
2. `NEXT_PUBLIC_SITE_URL`에 그 주소를 넣고 **다시 배포**한다 (Deploys → Trigger deploy). `NEXT_PUBLIC_`으로 시작하는 값은 빌드할 때 들어가므로 다시 배포해야 반영된다.

## 3. 로그인 주소 등록
배포 주소에서도 로그인이 되도록 등록한다.
1. **Supabase** → Authentication → URL Configuration
   - Redirect URLs에 `https://<이름>.netlify.app/**`를 **추가**한다. `localhost`는 개발용으로 그대로 둔다.
   - 실제 운영이 시작되면 Site URL을 배포 주소로 바꾼다.
2. **카카오 개발자** → 앱 → 플랫폼 → Web → 사이트 도메인에 배포 주소를 추가한다.
3. **Google Cloud**는 바꿀 것이 없다. 로그인 돌아오는 주소가 Supabase 주소라서 그대로 된다.

## 4. 확인
- [ ] 배포 주소에서 카카오·Google 로그인이 된다.
- [ ] 대표 화면 → 설정 맨 위에 "암호화 키가 설정되어 있어요"가 보인다.
- [ ] 초대 링크를 만들면 배포 주소로 시작한다.
- [ ] 휴대폰(5G)에서 배포 주소가 열린다.

## 5. 이후
- `main`에 새 코드가 합쳐지면 Netlify가 **자동으로 다시 배포**한다.
- 도메인을 사면 Domain management에서 연결하고, 3단계의 로그인 주소 등록을 새 도메인으로 한 번 더 한다.
- 대표님을 Netlify 팀에 초대해 둔다 (Team settings → Members).
