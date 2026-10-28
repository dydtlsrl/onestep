// 카카오·구글 로그인을 마치고 돌아오는 주소 (/auth/callback?code=...&next=...)
// Supabase가 준 일회용 코드를 로그인 세션으로 바꾼 뒤 next 경로로 보낸다.
import { NextResponse, type NextRequest } from "next/server";
import { reportError } from "@/lib/error-log";
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
    // 실패 이유를 오류 기록에 남긴다 (코드 값은 남기지 않는다)
    await reportError({
      source: "auth",
      level: "error",
      code: error.code ?? "exchange_failed",
      message: `세션 교환 실패: ${error.message}`,
      path: "/auth/callback",
      detail: { next },
    });
  } else {
    // 카카오·구글·Supabase가 오류를 돌려준 경우 (예: 동의 취소는 warn, 설정 오류는 error)
    const reason = searchParams.get("error") ?? "";
    await reportError({
      source: "auth",
      level: reason === "access_denied" ? "warn" : "error",
      code: reason || "no_code",
      message: `로그인 코드 없음: ${searchParams.get("error_description") ?? ""}`,
      path: "/auth/callback",
      detail: { next },
    });
  }

  return NextResponse.redirect(new URL("/login?error=auth", origin));
}
