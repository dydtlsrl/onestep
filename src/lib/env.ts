// 환경변수를 한곳에서 읽는다. 값이 없으면 바로 알 수 있게 오류를 낸다.
// NEXT_PUBLIC_ 로 시작하는 값은 브라우저 코드에도 들어가므로, 비밀 키를 넣으면 안 된다.

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase 환경변수가 없습니다. .env.example을 복사해 .env.local을 만들고 값을 채워 주세요. (README의 '처음 설정하기' 참고)",
    );
  }
  return { url, key };
}
