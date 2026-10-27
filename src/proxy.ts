// Next.js 16의 proxy (예전 이름: middleware). 모든 페이지 요청 전에 로그인 세션을 갱신한다.
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // 이미지·정적 파일 요청에는 실행하지 않는다
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
