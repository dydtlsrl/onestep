// 로그인 방법. 카카오는 Supabase에서 카카오 로그인 설정을 마친 뒤 NEXT_PUBLIC_KAKAO_LOGIN=on 으로 켠다.
// 켜기 전에는 버튼을 숨긴다. 누르면 "provider is not enabled" 오류가 나기 때문이다.
export const KAKAO_LOGIN_ENABLED = process.env.NEXT_PUBLIC_KAKAO_LOGIN === "on";

// 안내 문구에 쓰는 이름. 예: "카카오 또는 Google 계정으로 로그인해 주세요"
export const LOGIN_METHOD_LABEL = KAKAO_LOGIN_ENABLED ? "카카오 또는 Google" : "Google";
