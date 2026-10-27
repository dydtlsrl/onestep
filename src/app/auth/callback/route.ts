// 카카오·구글 로그인을 마치고 돌아오는 주소 (/auth/callback?code=...&next=...)
// Supabase가 준 일회용 코드를 로그인 세션으로 바꾼 뒤 next 경로로 보낸다.
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    // 실패 이유를 서버 터미널에 남긴다 (코드 값은 남기지 않는다)
    console.error("[auth/callback] 세션 교환 실패:", error.code ?? "", error.message);
  } else {
    // 카카오·구글·Supabase가 오류를 돌려준 경우 (예: 동의 취소, 설정 오류)
    console.error("[auth/callback] 코드 없음:", searchParams.get("error") ?? "", searchParams.get("error_description") ?? "");
  }

  return NextResponse.redirect(new URL("/login?error=auth", origin));
}
