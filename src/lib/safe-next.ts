// 로그인 후 돌아갈 주소(next)를 검사한다.
// 다른 사이트로 보내는 주소(https://..., //evil.com)를 막고, 우리 사이트 안의 경로만 허용한다.

export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
